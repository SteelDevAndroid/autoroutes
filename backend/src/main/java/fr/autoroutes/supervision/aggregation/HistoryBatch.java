package fr.autoroutes.supervision.aggregation;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

/**
 * Incréments d'historique accumulés depuis le point de reprise précédent (minutes de gare, flux O/D horaires et journaliers).
 * Immuable ; fusionnable pour réessayer un lot dont l'écriture a échoué.
 */
public record HistoryBatch(Map<StationMinute, WindowCounts> minutes, Map<OdHour, Long> odHours, Map<OdDay, Long> odDays,
                           Map<StationMinute, SourceCounts> provenance) {

    public record StationMinute(String stationId, long epochMinute) {
    }

    public record OdHour(String originId, String destinationId, long epochHour) {
    }

    public record OdDay(String originId, String destinationId, LocalDate day) {
    }

    public static final HistoryBatch EMPTY = new HistoryBatch(Map.of(), Map.of(), Map.of());

    /** Older callers without source information remain explicitly unverified. */
    public HistoryBatch(Map<StationMinute, WindowCounts> minutes, Map<OdHour, Long> odHours, Map<OdDay, Long> odDays) {
        this(minutes, odHours, odDays, Map.of());
    }

    public HistoryBatch {
        minutes = Map.copyOf(minutes);
        odHours = Map.copyOf(odHours);
        odDays = Map.copyOf(odDays);
        provenance = Map.copyOf(provenance);
    }

    public boolean isEmpty() {
        return minutes.isEmpty() && odHours.isEmpty() && odDays.isEmpty() && provenance.isEmpty();
    }

    public HistoryBatch merge(HistoryBatch other) {
        if (other.isEmpty()) {
            return this;
        }
        var mergedMinutes = new HashMap<>(minutes);
        other.minutes.forEach((key, counts) -> mergedMinutes.merge(key, counts,
                (a, b) -> new WindowCounts(a.entries() + b.entries(), a.exits() + b.exits())));
        var mergedHours = new HashMap<>(odHours);
        other.odHours.forEach((key, vehicles) -> mergedHours.merge(key, vehicles, Long::sum));
        var mergedDays = new HashMap<>(odDays);
        other.odDays.forEach((key, vehicles) -> mergedDays.merge(key, vehicles, Long::sum));
        var mergedSources = new HashMap<>(provenance);
        other.provenance.forEach((key, counts) -> mergedSources.merge(key, counts, SourceCounts::plus));
        return new HistoryBatch(mergedMinutes, mergedHours, mergedDays, mergedSources);
    }
}
