package fr.autoroutes.supervision.aggregation;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeMap;

/**
 * Matrice origine-destination creuse, par tranche de 15 min de l'heure de SORTIE.
 * Seuls les couples observés sont stockés ; les tranches de plus de 25 h sont purgées.
 *
 * <p>Non thread-safe : écrivain unique.
 */
public final class OdCounters {

    private record OdKey(String originId, String destinationId) {
    }

    static final int BUCKET_MINUTES = 15;
    private static final long RETENTION_BUCKETS = 25 * 60 / BUCKET_MINUTES;

    private final TreeMap<Long, Map<OdKey, Long>> buckets = new TreeMap<>();

    public void add(String originId, String destinationId, Instant exitTime, long vehicles) {
        var bucket = bucketOf(exitTime);
        buckets.computeIfAbsent(bucket, b -> new HashMap<>()).merge(new OdKey(originId, destinationId), vehicles, Long::sum);
        buckets.headMap(bucket - RETENTION_BUCKETS).clear();
    }

    /**
     * Couples dont le total sur la fenêtre atteint {@code minVehicles} (seuil de diffusion RGPD),
     * triés par volume décroissant et limités à {@code limit}.
     */
    public List<OdFlow> flows(Instant reference, Duration window, long minVehicles, int limit) {
        var to = bucketOf(reference);
        var from = to - Math.max(1, window.toMinutes() / BUCKET_MINUTES) + 1;
        var totals = new HashMap<OdKey, Long>();
        buckets.subMap(from, true, to, true).values()
                .forEach(bucket -> bucket.forEach((key, count) -> totals.merge(key, count, Long::sum)));
        return totals.entrySet().stream()
                .filter(e -> e.getValue() >= minVehicles)
                .map(e -> new OdFlow(e.getKey().originId(), e.getKey().destinationId(), e.getValue()))
                .sorted(Comparator.comparingLong(OdFlow::vehicles).reversed()
                        .thenComparing(OdFlow::originId)
                        .thenComparing(OdFlow::destinationId))
                .limit(limit)
                .toList();
    }

    public List<OdCheckpoint> export() {
        var exported = new ArrayList<OdCheckpoint>();
        buckets.forEach((bucket, counts) -> counts.forEach((key, vehicles) ->
                exported.add(new OdCheckpoint(bucket, key.originId(), key.destinationId(), vehicles))));
        return exported;
    }

    public void restore(List<OdCheckpoint> checkpoint) {
        buckets.clear();
        checkpoint.forEach(c -> buckets.computeIfAbsent(c.bucket(), b -> new HashMap<>())
                .put(new OdKey(c.originId(), c.destinationId()), c.vehicles()));
    }

    public record OdCheckpoint(long bucket, String originId, String destinationId, long vehicles) {
    }

    private static long bucketOf(Instant instant) {
        return Math.floorDiv(instant.getEpochSecond(), BUCKET_MINUTES * 60L);
    }
}
