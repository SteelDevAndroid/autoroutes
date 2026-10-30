package fr.autoroutes.supervision.assignment;

import static org.assertj.core.api.Assertions.assertThat;

import fr.autoroutes.supervision.aggregation.OdFlow;
import fr.autoroutes.supervision.referentiel.LogicalStation;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class RouteGeometryTest {
    private static final List<Double> START = List.of(5.0, 45.0);
    private static final List<Double> BEND = List.of(5.01, 45.015);
    private static final List<Double> VIA = List.of(5.02, 45.01);
    private static final List<Double> END = List.of(5.04, 45.0);

    private AssignmentService service(boolean complete) {
        var graph = new RoadGraph("g1", new double[] {5.0, 5.02, 5.04}, new double[] {45.0, 45.01, 45.0}, List.of(
                new RoadGraph.Edge("slow-direct", 0, 2, 2000, 30, Set.of("A7"), false, List.of(START, END)),
                new RoadGraph.Edge("out", 0, 1, 1500, 130, Set.of("A7"), false, List.of(START, BEND, VIA)),
                new RoadGraph.Edge("onward", 1, 2, 1500, 130, Set.of("A7"), false, complete ? List.of(VIA, END) : List.of()),
                new RoadGraph.Edge("return", 2, 0, 3000, 130, Set.of("A7"), false, List.of(END, VIA, BEND, START))));
        var stations = List.of(
                new LogicalStation("A", "A", LogicalStation.Kind.ECHANGEUR, List.of("A0007"), "38", 2, 5.0, 45.0),
                new LogicalStation("B", "B", LogicalStation.Kind.ECHANGEUR, List.of("A0007"), "38", 2, 5.04, 45.0));
        return new AssignmentService(graph, new ShortestPaths(graph, new StationAttachment(graph, stations, 100), 10), 3);
    }

    @Test
    void keepsEveryBendOfTheFastestRouteWithoutDuplicatingJunctionsOrDrawingStationConnectors() {
        var flow = service(true).routedFlows(List.of(new OdFlow("A", "B", 7))).getFirst();
        assertThat(flow.vehicles()).isEqualTo(7);
        assertThat(flow.route().nature()).isEqualTo("ESTIMATED");
        assertThat(flow.route().graphVersion()).isEqualTo("g1");
        assertThat(flow.route().algorithm()).isEqualTo(SegmentLoads.ALGORITHM);
        assertThat(flow.route().coordinates()).containsExactly(START, BEND, VIA, END);
    }

    @Test
    void keepsTheReverseRouteInItsOwnDirection() {
        var flow = service(true).routedFlows(List.of(new OdFlow("B", "A", 7))).getFirst();
        assertThat(flow.route().coordinates()).containsExactly(END, VIA, BEND, START);
    }

    @Test
    void omitsIncompleteUnattachedInternalAndBelowThresholdRoutes() {
        assertThat(service(false).routedFlows(List.of(new OdFlow("A", "B", 7))).getFirst().route()).isNull();
        var flows = List.of(new OdFlow("A", "X", 7), new OdFlow("A", "A", 7), new OdFlow("A", "B", 2));
        assertThat(service(true).routedFlows(flows)).allSatisfy(flow -> assertThat(flow.route()).isNull());
    }
}
