package fr.autoroutes.supervision.aggregation;

/** Provenance of applied vehicle passages; missing legacy metadata never becomes an observation. */
public record SourceCounts(long simulated, long observed) {
    public enum Nature { SIMULATED, OBSERVED, MIXED, UNKNOWN }

    public static final SourceCounts EMPTY = new SourceCounts(0, 0);

    public SourceCounts plus(SourceCounts other) {
        return new SourceCounts(simulated + other.simulated, observed + other.observed);
    }

    public Nature nature(long total) {
        if (total <= 0 || simulated < 0 || observed < 0 || simulated + observed != total) {
            return Nature.UNKNOWN;
        }
        if (simulated > 0 && observed > 0) {
            return Nature.MIXED;
        }
        return simulated > 0 ? Nature.SIMULATED : Nature.OBSERVED;
    }
}
