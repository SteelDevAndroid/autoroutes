package fr.autoroutes.supervision.aggregation;

import static org.assertj.core.api.Assertions.assertThat;
import static fr.autoroutes.supervision.aggregation.SourceCounts.Nature.*;

import org.junit.jupiter.api.Test;

class SourceCountsTest {
    @Test
    void neverCertifiesLegacyOrEmptyDataAsObserved() {
        assertThat(SourceCounts.EMPTY.nature(42)).isEqualTo(UNKNOWN);
        assertThat(SourceCounts.EMPTY.nature(0)).isEqualTo(UNKNOWN);
        assertThat(new SourceCounts(10, 0).nature(42)).isEqualTo(UNKNOWN);
    }

    @Test
    void distinguishesObservedSimulatedAndMixedPassages() {
        assertThat(new SourceCounts(12, 0).nature(12)).isEqualTo(SIMULATED);
        assertThat(new SourceCounts(0, 12).nature(12)).isEqualTo(OBSERVED);
        assertThat(new SourceCounts(5, 7).nature(12)).isEqualTo(MIXED);
    }
}
