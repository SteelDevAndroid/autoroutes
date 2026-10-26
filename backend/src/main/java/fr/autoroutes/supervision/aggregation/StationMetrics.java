package fr.autoroutes.supervision.aggregation;

import java.time.Instant;
import java.util.List;
import fr.autoroutes.supervision.ingestion.StationAnomaly;

/**
 * Indicateurs d'une gare logique, tous OBSERVÉS, calculés à la minute du watermark.
 *
 * @param anomalies          union des états déclarés par toutes les sources ; {@code null} : aucune source n'a rendu compte
 * @param anomaliesUpdatedAt date du rapport le plus récent, toutes sources confondues
 * @param anomalySources     état de chaque source, trié par nom de source ; {@code null} avec {@code anomalies}
 */
public record StationMetrics(
        String stationId,
        WindowCounts last5m,
        WindowCounts last15m,
        WindowCounts last1h,
        WindowCounts today,
        Instant lastEventTime,
        List<StationAnomaly> anomalies,
        Instant anomaliesUpdatedAt,
        List<AnomalySourceReport> anomalySources) {
    public StationMetrics {
        anomalies = anomalies == null ? null : List.copyOf(anomalies);
        anomalySources = anomalySources == null ? null : List.copyOf(anomalySources);
    }

    public StationMetrics(String stationId, WindowCounts last5m, WindowCounts last15m,
                          WindowCounts last1h, WindowCounts today, Instant lastEventTime) {
        this(stationId, last5m, last15m, last1h, today, lastEventTime, null, null, null);
    }

    /** Indicateurs complétés par les états des sources (aucun : information non communiquée). */
    static StationMetrics of(String stationId, WindowCounts last5m, WindowCounts last15m, WindowCounts last1h,
                             WindowCounts today, Instant lastEventTime, List<AnomalySourceReport> sources) {
        if (sources.isEmpty()) {
            return new StationMetrics(stationId, last5m, last15m, last1h, today, lastEventTime, null, null, null);
        }
        var union = sources.stream().flatMap(s -> s.anomalies().stream()).toList();
        var updatedAt = sources.stream().map(AnomalySourceReport::updatedAt).max(Instant::compareTo).orElseThrow();
        return new StationMetrics(stationId, last5m, last15m, last1h, today, lastEventTime, union, updatedAt, sources);
    }
}
