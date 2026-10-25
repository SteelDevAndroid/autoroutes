package fr.autoroutes.supervision.aggregation;

import static fr.autoroutes.supervision.ingestion.EventType.ANOMALY_REPORT;
import static fr.autoroutes.supervision.ingestion.EventType.ENTRY;
import static org.assertj.core.api.Assertions.assertThat;

import fr.autoroutes.supervision.ingestion.ParseResult;
import fr.autoroutes.supervision.ingestion.RejectReason;
import fr.autoroutes.supervision.ingestion.StationAnomaly;
import fr.autoroutes.supervision.ingestion.TollEventParser;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.zip.GZIPOutputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

class StationAnomaliesTest {
    private static final Instant NOW = Instant.parse("2026-10-22T08:00:00Z");
    private static final ZoneId PARIS = ZoneId.of("Europe/Paris");
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final TollEventParser parser = new TollEventParser(mapper, Clock.fixed(NOW, ZoneOffset.UTC), PARIS);
    private final List<StationAnomaly> reported = List.of(new StationAnomaly("Lecteur de badge", 2, "Moyenne"));

    private String event(String extra) {
        return "{\"eventId\":\"e-1\",\"stationName\":\"A\",\"type\":\"ENTRY\",\"eventTime\":\"2026-10-22T08:00:00Z\"" + extra + "}";
    }

    @Test
    void preservesTheExactWireFieldsAndDistinguishesEmptyFromMissing() {
        var result = parser.parse(event(",\"anomalies\":[{\"type_ano\":\"Lecteur de badge\",\"cardinalite\":2,\"criticite\":\"Moyenne\"}]"));
        assertThat(result).isInstanceOfSatisfying(ParseResult.Valid.class, valid -> {
            assertThat(valid.event().anomalies()).isEqualTo(reported);
            assertThat(mapper.writeValueAsString(valid.event())).contains("\"type_ano\":\"Lecteur de badge\"");
        });
        assertThat(parser.parse(event(""))).isInstanceOfSatisfying(ParseResult.Valid.class,
                valid -> assertThat(valid.event().anomalies()).isNull());
        assertThat(parser.parse(event(",\"anomalies\":[]"))).isInstanceOfSatisfying(ParseResult.Valid.class,
                valid -> assertThat(valid.event().anomalies()).isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "[null]", "[{\"type_ano\":\"A\",\"cardinalite\":-1,\"criticite\":\"Haute\"}]",
            "[{\"type_ano\":\"A\",\"cardinalite\":1.5,\"criticite\":\"Haute\"}]",
            "[{\"type_ano\":\"A\",\"cardinalite\":1}]"})
    void rejectsMalformedReportsExplicitly(String anomalies) {
        assertThat(parser.parse(event(",\"anomalies\":" + anomalies))).isInstanceOfSatisfying(ParseResult.Rejected.class,
                rejected -> assertThat(rejected.field()).isEqualTo("anomalies"));
    }

    @Test
    void latestReportReplacesRatherThanAccumulatesAndOldEventsCannotResurrectClearedIncidents() {
        var state = new AggregationState(PARIS);
        state.apply("A", ENTRY, NOW, 1, reported);
        state.apply("A", ENTRY, NOW.plusSeconds(1), 1); // ancien producteur, ne déclare pas un état sain
        assertThat(state.metrics("A", NOW).anomalies()).isEqualTo(reported);
        state.apply("A", ENTRY, NOW.plusSeconds(2), 1, List.of());
        state.apply("A", ENTRY, NOW.minusSeconds(5), 1, reported);
        assertThat(state.metrics("A", NOW).anomalies()).isEmpty();
        assertThat(state.metrics("A", NOW).anomaliesUpdatedAt()).isEqualTo(NOW.plusSeconds(2));
    }

    @Test
    void checkpointPreservesReportsAndTheirOrderingTimestampAcrossRestart() {
        var state = new AggregationState(PARIS);
        state.apply("A", ENTRY, NOW, 1, List.of());
        state.apply("B", ENTRY, NOW, 1, reported);
        var codec = new CheckpointCodec();
        var data = new CheckpointData(NOW, Map.of(), Map.of(), state.export(), List.of(), List.of(), Map.of());
        var restored = new AggregationState(PARIS);
        restored.restore(codec.decode(codec.encode(data)).stations());
        restored.apply("A", ENTRY, NOW.minusSeconds(1), 1, reported);
        assertThat(restored.metrics("A", NOW).anomalies()).isEmpty();
        assertThat(restored.metrics("B", NOW).anomalies()).isEqualTo(reported);
        assertThat(restored.metrics("B", NOW).anomaliesUpdatedAt()).isEqualTo(NOW);
    }

    @Test
    void restartPreservesSubMillisecondOrderingOfResolutionReports() {
        var state = new AggregationState(PARIS);
        var resolvedAt = NOW.plusNanos(900_000);
        state.apply("A", ENTRY, resolvedAt, 1, List.of());
        var codec = new CheckpointCodec();
        var restored = new AggregationState(PARIS);
        restored.restore(codec.decode(codec.encode(new CheckpointData(NOW, Map.of(), Map.of(), state.export(), List.of(), List.of(), Map.of()))).stations());
        restored.apply("A", ENTRY, NOW.plusNanos(100_000), 1, reported);
        assertThat(restored.metrics("A", NOW).anomalies()).isEmpty();
        assertThat(restored.metrics("A", NOW).anomaliesUpdatedAt()).isEqualTo(resolvedAt);
    }

    private String report(String extra) {
        return "{\"eventId\":\"r-1\",\"stationName\":\"A\",\"type\":\"ANOMALY_REPORT\",\"eventTime\":\"2026-10-22T08:00:00Z\"" + extra + "}";
    }

    @Test
    void anomalyReportCarriesNoPassageAndIgnoresPassageFields() {
        var result = parser.parse(report(",\"vehicleCount\":7,\"vehicleClass\":2,\"entryStationName\":\"B\","
                + "\"anomalies\":[{\"type_ano\":\"Lecteur de badge\",\"cardinalite\":2,\"criticite\":\"Moyenne\"}]"));

        assertThat(result).isInstanceOfSatisfying(ParseResult.Valid.class, valid -> {
            assertThat(valid.event().type()).isEqualTo(ANOMALY_REPORT);
            assertThat(valid.event().vehicleCount()).isZero();
            assertThat(valid.event().vehicleClass()).isNull();
            assertThat(valid.event().entryStationName()).isNull();
            assertThat(valid.event().anomalies()).isEqualTo(reported);
        });
        assertThat(parser.parse(report(",\"anomalies\":[]"))).isInstanceOfSatisfying(ParseResult.Valid.class,
                valid -> assertThat(valid.event().anomalies()).isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", ",\"anomalies\":null"})
    void anomalyReportWithoutReportIsRejected(String anomalies) {
        assertThat(parser.parse(report(anomalies))).isInstanceOfSatisfying(ParseResult.Rejected.class, rejected -> {
            assertThat(rejected.reason()).isEqualTo(RejectReason.MISSING_FIELD);
            assertThat(rejected.field()).isEqualTo("anomalies");
        });
    }

    @Test
    void standaloneReportLeavesPassageCountsAndFreshnessUntouched() {
        var state = new AggregationState(PARIS);
        state.apply("A", ENTRY, NOW, 1);
        state.applyAnomalies("A", NOW.plusSeconds(30), reported);
        state.applyAnomalies("B", NOW, reported);

        assertThat(state.metrics("A", NOW.plusSeconds(30)).last5m().entries()).isEqualTo(1);
        assertThat(state.metrics("A", NOW.plusSeconds(30)).lastEventTime()).isEqualTo(NOW);
        assertThat(state.metrics("A", NOW.plusSeconds(30)).anomaliesUpdatedAt()).isEqualTo(NOW.plusSeconds(30));
        assertThat(state.metrics("B", NOW).anomalies()).isEqualTo(reported);
        assertThat(state.metrics("B", NOW).lastEventTime()).isNull();
        state.applyAnomalies("B", NOW.minusSeconds(1), List.of());
        assertThat(state.metrics("B", NOW).anomalies()).isEqualTo(reported);
    }

    @Test
    void checkpointKeepsStationsThatOnlyReceivedReports() {
        var state = new AggregationState(PARIS);
        state.applyAnomalies("B", NOW, reported);
        var codec = new CheckpointCodec();
        var data = new CheckpointData(NOW, Map.of(), Map.of(), state.export(), List.of(), List.of(), Map.of());

        var restored = new AggregationState(PARIS);
        restored.restore(codec.decode(codec.encode(data)).stations());

        assertThat(restored.metrics("B", NOW).anomalies()).isEqualTo(reported);
        assertThat(restored.metrics("B", NOW).anomaliesUpdatedAt()).isEqualTo(NOW);
        assertThat(restored.metrics("B", NOW).lastEventTime()).isNull();
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2})
    void oldCheckpointsRemainReadableWithoutInventingAnomalyData(int version) throws Exception {
        var bytes = new ByteArrayOutputStream();
        try (var out = new DataOutputStream(new GZIPOutputStream(bytes))) {
            out.writeInt(version);
            out.writeLong(NOW.toEpochMilli());
            out.writeInt(0); // offsets
            out.writeInt(0); // watermarks
            out.writeInt(1); // une gare dans l'ancien format
            out.writeUTF("A");
            out.writeLong(NOW.toEpochMilli());
            out.writeInt(0); // minutes
            out.writeInt(0); // flux
            if (version >= 2) out.writeInt(0); // couverture
            out.writeInt(0); // déduplication
        }
        var restored = new AggregationState(PARIS);
        restored.restore(new CheckpointCodec().decode(bytes.toByteArray()).stations());
        assertThat(restored.metrics("A", NOW).anomalies()).isNull();
    }
}
