package fr.autoroutes.supervision.aggregation;

import fr.autoroutes.supervision.ingestion.EventType;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * État courant par gare logique. Écrivain unique : seul le thread d'agrégation y accède,
 * ce qui évite tout verrou sur le chemin critique. Les lecteurs passent par les snapshots immuables.
 */
public final class AggregationState {

    private final ZoneId displayZone;
    private final Map<String, MinuteRing> rings = new HashMap<>();
    private final Map<String, Instant> lastEventTime = new HashMap<>();
    private final Set<String> dirty = new HashSet<>();

    public AggregationState(ZoneId displayZone) {
        this.displayZone = displayZone;
    }

    public void apply(String stationId, EventType type, Instant eventTime, int vehicleCount) {
        rings.computeIfAbsent(stationId, id -> new MinuteRing()).add(epochMinute(eventTime), type, vehicleCount);
        lastEventTime.merge(stationId, eventTime, (a, b) -> a.isAfter(b) ? a : b);
        dirty.add(stationId);
    }

    public StationMetrics metrics(String stationId, Instant reference) {
        var ring = rings.get(stationId);
        if (ring == null) {
            return new StationMetrics(stationId, WindowCounts.ZERO, WindowCounts.ZERO, WindowCounts.ZERO,
                    WindowCounts.ZERO, null);
        }
        var now = epochMinute(reference);
        // Début de journée en heure locale : la journée dure 23 h ou 25 h aux changements d'heure.
        var midnight = epochMinute(reference.atZone(displayZone).toLocalDate().atStartOfDay(displayZone).toInstant());
        return new StationMetrics(
                stationId,
                ring.sum(now - 4, now),
                ring.sum(now - 14, now),
                ring.sum(now - 59, now),
                ring.sum(midnight, now),
                lastEventTime.get(stationId));
    }

    public Set<String> stationIds() {
        return Set.copyOf(rings.keySet());
    }

    Set<String> drainDirty() {
        var drained = Set.copyOf(dirty);
        dirty.clear();
        return drained;
    }

    static long epochMinute(Instant instant) {
        return Math.floorDiv(instant.getEpochSecond(), 60);
    }
}
