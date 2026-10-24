package fr.autoroutes.supervision.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import fr.autoroutes.supervision.SupervisionProperties;
import fr.autoroutes.supervision.aggregation.HistoryIncrements;
import fr.autoroutes.supervision.aggregation.SourceCounts;
import fr.autoroutes.supervision.assignment.AssignmentRunner;
import fr.autoroutes.supervision.assignment.SegmentLoads;
import fr.autoroutes.supervision.history.HistoryQueries;
import fr.autoroutes.supervision.history.Resolution;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;

@ExtendWith(MockitoExtension.class)
class CapabilitiesControllerTest {
    @Mock HistoryQueries history;
    @Mock ObjectProvider<AssignmentRunner> runner;
    @Mock AssignmentRunner assignment;
    @Mock SupervisionProperties properties;
    @Mock SegmentLoads loads;

    private CapabilitiesController controller;

    @BeforeEach
    void create() {
        var zone = ZoneId.of("Europe/Paris");
        when(properties.zone()).thenReturn(zone);
        when(history.provenance(isNull(), any(), any(), any())).thenReturn(SourceCounts.Nature.UNKNOWN);
        // 00:15 in Paris: the previous hour must still be covered by the provenance label.
        controller = new CapabilitiesController(history, runner,
                Clock.fixed(Instant.parse("2026-10-24T22:15:00Z"), ZoneOffset.UTC), properties,
                new HistoryIncrements(zone));
    }

    @Test
    void reportsUnavailableGraphAndUnverifiedLegacySourcesIncludingThePreviousDayWindow() {
        var capabilities = controller.capabilities();
        assertThat(capabilities.segments()).isEqualTo("DISABLED");
        assertThat(capabilities.provenance()).isEqualTo(SourceCounts.Nature.UNKNOWN);
        verify(history).provenance(null, Instant.parse("2026-10-24T21:00:00Z"),
                Instant.parse("2026-10-24T22:15:00Z"), Resolution.PT1H);
    }

    @Test
    void distinguishesFirstCalculationFromReadyEstimates() {
        when(runner.getIfAvailable()).thenReturn(assignment);
        when(assignment.latest()).thenReturn(Optional.empty());
        assertThat(controller.capabilities().segments()).isEqualTo("STARTING");
        when(assignment.latest()).thenReturn(Optional.of(loads));
        assertThat(controller.capabilities().segments()).isEqualTo("READY");
    }
}
