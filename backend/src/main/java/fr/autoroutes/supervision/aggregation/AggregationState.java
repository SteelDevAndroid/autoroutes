package fr.autoroutes.supervision.aggregation;

import fr.autoroutes.supervision.ingestion.EventType;
import fr.autoroutes.supervision.ingestion.StationAnomaly;
import fr.autoroutes.supervision.ingestion.TollEvent;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.SortedMap;
import java.util.TreeMap;

/**
 * État courant par gare logique. Écrivain unique : seul le thread d'agrégation y accède,
 * ce qui évite tout verrou sur le chemin critique. Les lecteurs passent par les snapshots immuables.
 */
public final class AggregationState {

    private final ZoneId displayZone;
    private final Map<String, MinuteRing> rings = new HashMap<>();
    private final Map<String, Instant> lastEventTime = new HashMap<>();
    /** Gare → source → dernier état déclaré ; trié par source pour un ordre de publication stable. */
    private final Map<String, SortedMap<String, AnomalySourceReport>> anomalies = new HashMap<>();
    private final Set<String> dirty = new HashSet<>();

    public AggregationState(ZoneId displayZone) {
        this.displayZone = displayZone;
    }

    public void apply(String stationId, EventType type, Instant eventTime, int vehicleCount) {
        apply(stationId, type, eventTime, vehicleCount, null);
    }

    public void apply(String stationId, EventType type, Instant eventTime, int vehicleCount, List<StationAnomaly> report) {
        apply(stationId, type, eventTime, vehicleCount, TollEvent.DEFAULT_ANOMALY_SOURCE, report);
    }

    public void apply(String stationId, EventType type, Instant eventTime, int vehicleCount, String source,
                      List<StationAnomaly> report) {
        rings.computeIfAbsent(stationId, id -> new MinuteRing()).add(epochMinute(eventTime), type, vehicleCount);
        lastEventTime.merge(stationId, eventTime, (a, b) -> a.isAfter(b) ? a : b);
        if (report != null) {
            replaceAnomalies(stationId, source, eventTime, report);
        }
        dirty.add(stationId);
    }

    public void applyAnomalies(String stationId, Instant eventTime, List<StationAnomaly> report) {
        applyAnomalies(stationId, TollEvent.DEFAULT_ANOMALY_SOURCE, eventTime, report);
    }

    /** Rapport sans passage : ne touche ni aux compteurs ni à la fraîcheur des passages de la gare. */
    public void applyAnomalies(String stationId, String source, Instant eventTime, List<StationAnomaly> report) {
        replaceAnomalies(stationId, source, eventTime, report);
        dirty.add(stationId);
    }

    private void replaceAnomalies(String stationId, String source, Instant eventTime, List<StationAnomaly> report) {
        var bySource = anomalies.computeIfAbsent(stationId, id -> new TreeMap<>());
        var previous = bySource.get(source);
        if (previous == null && bySource.size() >= AnomalySourceReport.MAX_SOURCES_PER_STATION) {
            return; // Garde-fou : le point de reprise doit rester lisible ; des dizaines de sources sur une gare relèvent d'une erreur.
        }
        // État complet de la source, jamais cumulé. Un événement retardé ne doit pas rétablir un incident résolu.
        if (previous == null || !eventTime.isBefore(previous.updatedAt())) {
            bySource.put(source, new AnomalySourceReport(source, eventTime, report));
        }
    }

    public StationMetrics metrics(String stationId, Instant reference) {
        var ring = rings.get(stationId);
        var sources = anomalySources(stationId);
        if (ring == null) {
            return StationMetrics.of(stationId, WindowCounts.ZERO, WindowCounts.ZERO, WindowCounts.ZERO,
                    WindowCounts.ZERO, null, sources);
        }
        var now = epochMinute(reference);
        // Début de journée en heure locale : la journée dure 23 h ou 25 h aux changements d'heure.
        var midnight = epochMinute(reference.atZone(displayZone).toLocalDate().atStartOfDay(displayZone).toInstant());
        return StationMetrics.of(
                stationId,
                ring.sum(now - 4, now),
                ring.sum(now - 14, now),
                ring.sum(now - 59, now),
                ring.sum(midnight, now),
                lastEventTime.get(stationId),
                sources);
    }

    private List<AnomalySourceReport> anomalySources(String stationId) {
        var bySource = anomalies.get(stationId);
        return bySource == null ? List.of() : List.copyOf(bySource.values());
    }

    public Optional<Instant> lastEventTime(String stationId) {
        return Optional.ofNullable(lastEventTime.get(stationId));
    }

    /** Copie pour le point de reprise ; appelée par l'écrivain unique. */
    public List<StationCheckpoint> export() {
        // Une gare peut n'avoir reçu que des rapports d'anomalies, sans aucun passage.
        var ids = new HashSet<>(rings.keySet());
        ids.addAll(anomalies.keySet());
        var exported = new ArrayList<StationCheckpoint>(ids.size());
        for (var id : ids) {
            var minutes = new ArrayList<long[]>();
            var ring = rings.get(id);
            if (ring != null) {
                ring.forEachSlot((minute, in, out) -> minutes.add(new long[] {minute, in, out}));
            }
            exported.add(new StationCheckpoint(id, lastEventTime.get(id), List.copyOf(minutes),
                    anomalySources(id)));
        }
        return exported;
    }

    public void restore(List<StationCheckpoint> checkpoint) {
        rings.clear();
        lastEventTime.clear();
        anomalies.clear();
        dirty.clear();
        for (var station : checkpoint) {
            var ring = new MinuteRing();
            station.minutes().forEach(m -> ring.restoreSlot(m[0], m[1], m[2]));
            rings.put(station.stationId(), ring);
            if (station.lastEventTime() != null) {
                lastEventTime.put(station.stationId(), station.lastEventTime());
            }
            for (var report : station.anomalySources()) {
                anomalies.computeIfAbsent(station.stationId(), id -> new TreeMap<>()).put(report.source(), report);
            }
            dirty.add(station.stationId());
        }
    }

    /**
     * @param minutes        triplets {minute epoch, entrées, sorties} des minutes non vides
     * @param anomalySources dernier état de chaque source ; vide : aucune n'a rendu compte
     */
    public record StationCheckpoint(String stationId, Instant lastEventTime, List<long[]> minutes,
                                    List<AnomalySourceReport> anomalySources) {
        public StationCheckpoint {
            anomalySources = List.copyOf(anomalySources);
        }

        public StationCheckpoint(String stationId, Instant lastEventTime, List<long[]> minutes) {
            this(stationId, lastEventTime, minutes, List.of());
        }
    }

    /** Sorties de toutes les gares entre deux minutes (incluses) : source indépendante du rapprochement des flux O/D. */
    public long exitsBetween(long fromMinuteInclusive, long toMinuteInclusive) {
        long total = 0;
        for (var ring : rings.values()) {
            total += ring.sum(fromMinuteInclusive, toMinuteInclusive).exits();
        }
        return total;
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
