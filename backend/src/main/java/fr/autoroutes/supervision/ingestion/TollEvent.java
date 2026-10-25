package fr.autoroutes.supervision.ingestion;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.List;

/**
 * Événement de péage après validation (contrat PROVISOIRE 0.1).
 * Ne contient que les champs autorisés : aucune donnée personnelle ne dépasse le parseur.
 *
 * @param entryStationName gare d'entrée, portée par les sorties en système fermé ; {@code null} sinon
 * @param entryTime        heure d'entrée, si fournie ; {@code null} sinon
 * @param vehicleClass     classe tarifaire 1 à 5, {@code null} si absente
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
        List<StationAnomaly> anomalies) {

    public TollEvent {
        Objects.requireNonNull(eventId, "eventId");
        Objects.requireNonNull(stationName, "stationName");
        Objects.requireNonNull(type, "type");
        Objects.requireNonNull(eventTime, "eventTime");
        anomalies = anomalies == null ? null : List.copyOf(anomalies);
    }

    /** Compatibilité avec les événements sans rapport d'anomalies. */
    public TollEvent(String eventId, String stationName, EventType type, Instant eventTime,
                     String entryStationName, Instant entryTime, int vehicleCount, Integer vehicleClass, boolean simulated) {
        this(eventId, stationName, type, eventTime, entryStationName, entryTime, vehicleCount, vehicleClass, simulated, null);
    }

    public Optional<String> entryStation() {
        return Optional.ofNullable(entryStationName);
    }
}
