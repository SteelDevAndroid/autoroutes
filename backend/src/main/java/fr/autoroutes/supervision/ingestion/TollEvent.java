package fr.autoroutes.supervision.ingestion;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Événement de péage après validation (contrat PROVISOIRE 0.1).
 * Ne contient que les champs autorisés : aucune donnée personnelle ne dépasse le parseur.
 *
 * @param entryStationName gare d'entrée, portée par les sorties en système fermé ; {@code null} sinon
 * @param entryTime        heure d'entrée, si fournie ; {@code null} sinon
 * @param vehicleClass     classe tarifaire 1 à 5, {@code null} si absente
 * @param anomalySource    émetteur du rapport d'anomalies (champ {@code source}) ; {@code null} = {@link #DEFAULT_ANOMALY_SOURCE}
 */
public record TollEvent(
        String eventId,
        String stationName,
        EventType type,
        Instant eventTime,
        String entryStationName,
        Instant entryTime,
        int vehicleCount,
        Integer vehicleClass,
        boolean simulated,
        List<StationAnomaly> anomalies,
        String anomalySource) {

    /** Source des rapports portés par les passages, quand le producteur n'en déclare pas. */
    public static final String DEFAULT_ANOMALY_SOURCE = "peage";
    public static final int MAX_SOURCE_LENGTH = 64;
    private static final Pattern SOURCE = Pattern.compile("[A-Za-z0-9._:@-]{1," + MAX_SOURCE_LENGTH + "}");

    public TollEvent {
        Objects.requireNonNull(eventId, "eventId");
        Objects.requireNonNull(stationName, "stationName");
        Objects.requireNonNull(type, "type");
        Objects.requireNonNull(eventTime, "eventTime");
        anomalies = anomalies == null ? null : List.copyOf(anomalies);
        if (anomalySource != null && !isValidSource(anomalySource)) {
            throw new IllegalArgumentException("Source d'anomalies invalide");
        }
    }

    public TollEvent(String eventId, String stationName, EventType type, Instant eventTime, String entryStationName,
                     Instant entryTime, int vehicleCount, Integer vehicleClass, boolean simulated, List<StationAnomaly> anomalies) {
        this(eventId, stationName, type, eventTime, entryStationName, entryTime, vehicleCount, vehicleClass, simulated, anomalies, null);
    }

    /** Compatibilité avec les événements sans rapport d'anomalies. */
    public TollEvent(String eventId, String stationName, EventType type, Instant eventTime,
                     String entryStationName, Instant entryTime, int vehicleCount, Integer vehicleClass, boolean simulated) {
        this(eventId, stationName, type, eventTime, entryStationName, entryTime, vehicleCount, vehicleClass, simulated, null);
    }

    public static boolean isValidSource(String source) {
        return SOURCE.matcher(source).matches();
    }

    public String anomalySourceOrDefault() {
        return anomalySource == null ? DEFAULT_ANOMALY_SOURCE : anomalySource;
    }

    public Optional<String> entryStation() {
        return Optional.ofNullable(entryStationName);
    }
}
