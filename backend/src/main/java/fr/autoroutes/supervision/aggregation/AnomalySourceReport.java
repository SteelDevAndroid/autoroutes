package fr.autoroutes.supervision.aggregation;

import fr.autoroutes.supervision.ingestion.StationAnomaly;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * Dernier état déclaré par une source pour une gare. Chaque source remplace son propre état sans toucher à celui
 * des autres : un agent ne peut pas effacer les incidents remontés par les équipements de péage, ni l'inverse.
 *
 * @param updatedAt {@code eventTime} du rapport appliqué ; un rapport plus ancien de la même source est ignoré
 */
public record AnomalySourceReport(String source, Instant updatedAt, List<StationAnomaly> anomalies) {

    /** Plafond par gare, partagé avec le point de reprise : au-delà, une nouvelle source est ignorée. */
    public static final int MAX_SOURCES_PER_STATION = 64;

    public AnomalySourceReport {
        Objects.requireNonNull(source, "source");
        Objects.requireNonNull(updatedAt, "updatedAt");
        anomalies = List.copyOf(anomalies);
    }
}
