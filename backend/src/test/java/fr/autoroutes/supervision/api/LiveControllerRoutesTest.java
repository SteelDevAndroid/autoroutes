package fr.autoroutes.supervision.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import fr.autoroutes.supervision.aggregation.*;
import fr.autoroutes.supervision.assignment.AssignmentRunner;
import fr.autoroutes.supervision.referentiel.LogicalStation;
import fr.autoroutes.supervision.referentiel.StationCatalog;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import tools.jackson.databind.json.JsonMapper;

class LiveControllerRoutesTest {
    @Test
    void onlyEnrichesAlreadyFilteredAndDisclosableStationFlows() {
        var catalog = new StationCatalog("v1", List.of(station("A", "A0007"), station("B", "A0007"), station("C", "A0006")));
        var live = mock(LiveView.class);
        when(live.odSnapshot()).thenReturn(Optional.of(new OdSnapshot(Instant.EPOCH, Duration.ofHours(1),
                List.of(new OdCell("A", "B", 5), new OdCell("B", "A", 2), new OdCell("C", "C", 8)), OdCoverage.EMPTY, 15)));
        var runner = mock(AssignmentRunner.class);
        @SuppressWarnings("unchecked") var provider = (ObjectProvider<AssignmentRunner>) mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(runner);
        var shown = List.of(new OdFlow("A", "B", 5));
        when(runner.routedFlows(shown)).thenReturn(shown);
        var controller = new LiveController(live, catalog, new OdQueryService(live, catalog), provider);

        var result = controller.od(OdFilter.Level.STATION, null, "A0007", OdFilter.Role.ANY, 0, 500, true);
        assertThat(result.flows()).containsExactlyElementsOf(shown);
        assertThat(result.masked().flows()).isEqualTo(1);
        assertThat(result.totalVehicles()).isEqualTo(7);
        verify(runner).routedFlows(shown);

        controller.od(OdFilter.Level.DEPARTMENT, null, null, OdFilter.Role.ANY, 3, 500, true);
        controller.od(OdFilter.Level.STATION, null, null, OdFilter.Role.ANY, 3, 500, false);
        verifyNoMoreInteractions(runner);
    }

    @Test
    void preservesLegacyJsonWhenGeometryIsMissingAndMarksOnlyTheRouteAsEstimated() {
        var json = JsonMapper.builder().build();
        assertThat(json.readTree(json.writeValueAsString(new OdFlow("A", "B", 5))).has("route")).isFalse();
        var route = new OdFlow.EstimatedRoute("ESTIMATED", "g1", "fastest", List.of(List.of(1.0, 2.0), List.of(2.0, 3.0)));
        var encoded = json.readTree(json.writeValueAsString(new OdFlow("A", "B", 5, route)));
        assertThat(encoded.path("vehicles").asInt()).isEqualTo(5);
        assertThat(encoded.path("route").path("nature").asString()).isEqualTo("ESTIMATED");
        assertThat(encoded.path("route").path("coordinates").get(0).get(0).asDouble()).isEqualTo(1.0);
    }

    private static LogicalStation station(String id, String axis) {
        return new LogicalStation(id, id, LogicalStation.Kind.ECHANGEUR, List.of(axis), "38", 2, 5.0, 45.0);
    }
}
