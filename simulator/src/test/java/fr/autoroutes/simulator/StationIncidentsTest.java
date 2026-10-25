package fr.autoroutes.simulator;

import static org.assertj.core.api.Assertions.assertThat;

import fr.autoroutes.simulator.StationIncidents.Anomaly;
import java.util.List;
import java.util.Random;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class StationIncidentsTest {

    private static final List<String> SEVERITY_ORDER = List.of("Critique", "Haute", "Moyenne", "Faible");

    @Test
    void incidentsAccumulateWithoutResolution() {
        var incidents = new StationIncidents(new Random(1), 1, 0);

        IntStream.range(0, 49).forEach(i -> incidents.report("GL-1"));
        var report = incidents.report("GL-1");

        assertThat(report).extracting(Anomaly::cardinalite).allMatch(c -> c > 0);
        assertThat(report.stream().mapToInt(Anomaly::cardinalite).sum()).isEqualTo(50);
        assertThat(report).extracting(Anomaly::typeAno).doesNotHaveDuplicates();
    }

    @Test
    void resolvedIncidentsDisappearAndLeaveAnExplicitEmptyReport() {
        // Chaque rapport résout tout l'existant, puis ouvre une occurrence une fois sur deux.
        var incidents = new StationIncidents(new Random(2), 0.5, 1);

        var reports = IntStream.range(0, 100).mapToObj(i -> {
            var report = incidents.report("GL-1");
            assertThat(incidents.stationsWithIncidents()).isEqualTo(report.isEmpty() ? 0 : 1);
            return report;
        }).toList();

        assertThat(reports).allSatisfy(r -> assertThat(r.stream().mapToInt(Anomaly::cardinalite).sum()).isLessThanOrEqualTo(1));
        assertThat(reports).anyMatch(List::isEmpty).anyMatch(r -> !r.isEmpty());
    }

    @Test
    void eachReportDeclaresTheFullStateOfItsOwnStation() {
        var incidents = new StationIncidents(new Random(4), 1, 0);

        var first = incidents.report("GL-1");
        assertThat(incidents.report("GL-2")).hasSize(1);
        var second = incidents.report("GL-1");

        assertThat(second.stream().mapToInt(Anomaly::cardinalite).sum())
                .isEqualTo(first.stream().mapToInt(Anomaly::cardinalite).sum() + 1);
        assertThat(incidents.stationsWithIncidents()).isEqualTo(2);
    }

    @Test
    void reportIsSortedFromMostToLeastSevere() {
        var incidents = new StationIncidents(new Random(5), 1, 0);
        IntStream.range(0, 200).forEach(i -> incidents.report("GL-1"));

        var severities = incidents.report("GL-1").stream().map(Anomaly::criticite).toList();

        assertThat(severities).hasSizeGreaterThan(3).isSortedAccordingTo((a, b) ->
                Integer.compare(SEVERITY_ORDER.indexOf(a), SEVERITY_ORDER.indexOf(b)));
    }

    @Test
    void steadyStateKeepsMostStationsHealthyWithDefaultRates() {
        var incidents = new StationIncidents(new Random(6), 0.05, 0.25);

        IntStream.range(0, 200).forEach(round -> IntStream.range(0, 500).forEach(s -> incidents.report("GL-" + s)));

        assertThat(incidents.stationsWithIncidents()).isBetween(50, 150);
    }

    @Test
    void serializesWithTheContractFieldNames() {
        var payload = JsonMapper.builder().build().writeValueAsString(new Anomaly("Panne", 2, "Moyenne"));

        assertThat(payload).isEqualTo("{\"type_ano\":\"Panne\",\"cardinalite\":2,\"criticite\":\"Moyenne\"}");
    }

    @Test
    void catalogRespectsTheBackendLimits() {
        assertThat(StationIncidents.CATALOG).hasSizeLessThanOrEqualTo(100).allSatisfy(kind -> {
            assertThat(kind.typeAno()).isNotBlank().hasSizeLessThanOrEqualTo(256);
            assertThat(kind.criticite()).isIn(SEVERITY_ORDER);
            assertThat(kind.weight()).isPositive();
        });
    }
}
