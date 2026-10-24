package fr.autoroutes.supervision.history;

import static org.assertj.core.api.Assertions.assertThat;

import fr.autoroutes.supervision.aggregation.HistoryBatch;
import fr.autoroutes.supervision.aggregation.WindowCounts;
import fr.autoroutes.supervision.aggregation.SourceCounts;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;

class JdbcHistorySinkTest {

    @Test
    void rollsMinutesUpIntoQuarterAndHourBuckets() {
        var base = Instant.parse("2026-10-22T08:00:00Z").getEpochSecond() / 60;
        var minutes = Map.of(
                new HistoryBatch.StationMinute("A", base), new WindowCounts(1, 2),
                new HistoryBatch.StationMinute("A", base + 14), new WindowCounts(3, 0),
                new HistoryBatch.StationMinute("A", base + 15), new WindowCounts(5, 5),
                new HistoryBatch.StationMinute("B", base + 59), new WindowCounts(0, 7));

        var quarters = JdbcHistorySink.rollup(minutes, 900);
        var hours = JdbcHistorySink.rollup(minutes, 3600);

        assertThat(quarters).hasSize(3);
        assertThat(quarters.values()).anySatisfy(v -> assertThat(v).containsExactly(4, 2));
        assertThat(hours).hasSize(2);
        assertThat(hours.values()).anySatisfy(v -> assertThat(v).containsExactly(9, 7));
    }

    @Test
    void retainsMixedSourcesWhenMinutesRollUp() {
        var minute = Instant.parse("2026-10-22T08:00:00Z").getEpochSecond() / 60;
        var sources = Map.of(
                new HistoryBatch.StationMinute("A", minute), new SourceCounts(5, 0),
                new HistoryBatch.StationMinute("A", minute + 14), new SourceCounts(0, 3),
                new HistoryBatch.StationMinute("A", minute + 15), new SourceCounts(2, 0));
        assertThat(JdbcHistorySink.rollupSources(sources, 900).values())
                .containsExactlyInAnyOrder(new SourceCounts(5, 3), new SourceCounts(2, 0));
        assertThat(JdbcHistorySink.rollupSources(sources, 3600).values()).containsExactly(new SourceCounts(7, 3));
    }
}
