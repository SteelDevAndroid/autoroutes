package fr.autoroutes.mcp;

import fr.autoroutes.mcp.AnomalyReporter.Anomaly;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Lecture de l'état publié par le backend ({@code GET /api/v1/stations/{id}}). Le jeton de l'agent est relayé tel quel :
 * le backend applique ses propres droits, le serveur MCP n'en détient aucun.
 */
@Component
public class BackendClient {

    public record SourceState(String source, Instant updatedAt, List<Anomaly> anomalies) {
    }

    public record Window(long entrees, long sorties) {
    }

    /**
     * Activité d'une gare telle que publiée par le backend. {@code metrics} absent côté backend : tout est {@code null},
     * jamais zéro, car « aucune mesure » n'est pas « aucun passage ».
     */
    public record Activity(Instant lastEventTime, Window last5m, Window last15m, Window last1h, Window today) {
    }

    /** @param sources vide : aucune source n'a rendu compte pour cette gare (état non communiqué) */
    public record StationState(List<SourceState> sources, Activity activity) {

        public StationState(List<SourceState> sources) {
            this(sources, new Activity(null, null, null, null, null));
        }

        public Instant updatedAtOf(String source) {
            return sources.stream().filter(s -> s.source().equals(source)).map(SourceState::updatedAt).findFirst().orElse(null);
        }
    }

    private final RestClient http;
    private final JsonMapper json;

    BackendClient(JsonMapper json, McpAnomaliesProperties properties) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(properties.backendTimeout());
        factory.setReadTimeout(properties.backendTimeout());
        this.http = RestClient.builder().baseUrl(properties.backendUrl()).requestFactory(factory).build();
        this.json = json;
    }

    public StationState read(String stationId) {
        String body;
        try {
            body = http.get().uri("/api/v1/stations/{id}", stationId)
                    .headers(headers -> relayToken(headers))
                    .retrieve()
                    .body(String.class);
        } catch (RestClientResponseException e) {
            throw new IllegalStateException(describe(e.getStatusCode(), stationId), e);
        } catch (ResourceAccessException e) {
            throw new IllegalStateException("Backend de supervision injoignable : état courant non lu, réessayer plus tard", e);
        }
        return parse(json.readTree(body));
    }

    static StationState parse(JsonNode detail) {
        var sources = new ArrayList<SourceState>();
        for (var source : detail.path("metrics").path("anomalySources")) {
            var anomalies = new ArrayList<Anomaly>();
            for (var item : source.path("anomalies")) {
                anomalies.add(new Anomaly(item.path("type_ano").asString(), item.path("cardinalite").asInt(), item.path("criticite").asString()));
            }
            sources.add(new SourceState(source.path("source").asString(), Instant.parse(source.path("updatedAt").asString()), List.copyOf(anomalies)));
        }
        var metrics = detail.path("metrics");
        var activity = new Activity(instant(metrics.path("lastEventTime")), window(metrics.path("last5m")),
                window(metrics.path("last15m")), window(metrics.path("last1h")), window(metrics.path("today")));
        return new StationState(List.copyOf(sources), activity);
    }

    private static Instant instant(JsonNode node) {
        return node.isString() ? Instant.parse(node.asString()) : null;
    }

    private static Window window(JsonNode node) {
        return node.isObject() ? new Window(node.path("entries").asLong(), node.path("exits").asLong()) : null;
    }

    private static void relayToken(HttpHeaders headers) {
        if (SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken token) {
            headers.setBearerAuth(token.getToken().getTokenValue());
        }
    }

    private static String describe(HttpStatusCode status, String stationId) {
        return switch (status.value()) {
            case 401, 403 -> "Lecture refusée par le backend (" + status.value() + ") : le jeton de l'agent doit porter le rôle ANOMALY_REPORTER ou VIEWER";
            case 404 -> "Gare " + stationId + " inconnue du backend : référentiels désynchronisés";
            case 503 -> "Backend en cours de démarrage : réessayer dans quelques secondes";
            default -> "Lecture de l'état impossible : réponse " + status.value() + " du backend";
        };
    }
}
