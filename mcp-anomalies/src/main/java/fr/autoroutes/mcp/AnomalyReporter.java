package fr.autoroutes.mcp;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Valide un rapport selon les règles du backend (docs/anomalies-gares.md) puis le publie comme événement
 * {@code ANOMALY_REPORT} : l'état complet déclaré remplace le précédent, {@code []} efface les anomalies de la gare.
 */
@Component
public class AnomalyReporter {

    public static final int MAX_ITEMS = 100;
    public static final int MAX_TEXT = 256;
    public static final List<String> SEVERITIES = List.of("Faible", "Moyenne", "Haute", "Critique");

    public record Anomaly(@JsonProperty("type_ano") String typeAno, int cardinalite, String criticite) {
    }

    public record Published(String eventId, String stationId, String stationName, Instant eventTime, List<Anomaly> anomalies) {
    }

    private static final Logger LOG = LoggerFactory.getLogger(AnomalyReporter.class);

    private final KafkaTemplate<String, String> kafka;
    private final JsonMapper json;
    private final Clock clock;
    private final McpAnomaliesProperties properties;

    AnomalyReporter(KafkaTemplate<String, String> kafka, JsonMapper json, Clock clock, McpAnomaliesProperties properties) {
        this.kafka = kafka;
        this.json = json;
        this.clock = clock;
        this.properties = properties;
    }

    /** @param reporter auteur authentifié (sujet du jeton), journalisé pour l'audit ; jamais publié */
    public Published publish(StationCatalog.Station station, List<Anomaly> anomalies, String reporter) {
        var report = validate(anomalies);
        var published = new Published("mcp-" + UUID.randomUUID(), station.id(), station.name(), clock.instant(), report);
        var event = new LinkedHashMap<String, Object>();
        event.put("eventId", published.eventId());
        event.put("stationName", published.stationName());
        event.put("type", "ANOMALY_REPORT");
        event.put("eventTime", published.eventTime().toString());
        event.put("anomalies", report);
        try {
            kafka.send(properties.topic(), station.name(), json.writeValueAsString(event))
                    .get(properties.sendTimeout().toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Publication interrompue : rapport non transmis", e);
        } catch (ExecutionException | TimeoutException e) {
            throw new IllegalStateException("Kafka indisponible : rapport non transmis, à renouveler", e);
        }
        LOG.info("Rapport d'anomalies {} publié pour {} par {} : {} type(s), {} occurrence(s)", published.eventId(), station.id(),
                reporter, report.size(), report.stream().mapToInt(Anomaly::cardinalite).sum());
        return published;
    }

    static List<Anomaly> validate(List<Anomaly> anomalies) {
        if (anomalies == null) {
            throw new IllegalArgumentException("« anomalies » est obligatoire : liste vide pour déclarer la gare sans anomalie");
        }
        if (anomalies.size() > MAX_ITEMS) {
            throw new IllegalArgumentException("Au plus " + MAX_ITEMS + " anomalies par rapport");
        }
        var types = new HashSet<String>();
        var result = new ArrayList<Anomaly>(anomalies.size());
        for (var anomaly : anomalies) {
            if (anomaly == null || anomaly.typeAno() == null || anomaly.typeAno().isBlank()) {
                throw new IllegalArgumentException("Chaque anomalie doit avoir un « type_ano » non vide");
            }
            var type = anomaly.typeAno().strip();
            if (type.length() > MAX_TEXT) {
                throw new IllegalArgumentException("« type_ano » dépasse " + MAX_TEXT + " caractères : " + type.substring(0, 40) + "…");
            }
            if (anomaly.cardinalite() < 0) {
                throw new IllegalArgumentException("« cardinalite » doit être positive ou nulle pour « " + type + " »");
            }
            if (!types.add(type.toLowerCase(Locale.ROOT))) {
                throw new IllegalArgumentException("Type déclaré deux fois : « " + type + " » ; additionner les cardinalités");
            }
            result.add(new Anomaly(type, anomaly.cardinalite(), severity(anomaly.criticite(), type)));
        }
        return List.copyOf(result);
    }

    private static String severity(String value, String type) {
        return SEVERITIES.stream()
                .filter(s -> value != null && s.equalsIgnoreCase(value.strip()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "« criticite » de « " + type + " » : attendu " + String.join(", ", SEVERITIES) + " ; reçu « " + value + " »"));
    }
}
