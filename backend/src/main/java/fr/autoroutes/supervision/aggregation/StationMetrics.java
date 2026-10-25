package fr.autoroutes.supervision.aggregation;

import java.time.Instant;
import java.util.List;
import fr.autoroutes.supervision.ingestion.StationAnomaly;

/** Indicateurs d'une gare logique, tous OBSERVÉS, calculés à la minute du watermark. */
public record StationMetrics(
        String stationId,
        WindowCounts last5m,
        WindowCounts last15m,
        WindowCounts last1h,
        WindowCounts today,
        Instant lastEventTime,
        List<StationAnomaly> anomalies,
        Instant anomaliesUpdatedAt) {
    public StationMetrics {
        anomalies = anomalies == null ? null : List.copyOf(anomalies);
    }

    public StationMetrics(String stationId, WindowCounts last5m, WindowCounts last15m,
                          WindowCounts last1h, WindowCounts today, Instant lastEventTime) {
        this(stationId, last5m, last15m, last1h, today, lastEventTime, null, null);
    }
}
