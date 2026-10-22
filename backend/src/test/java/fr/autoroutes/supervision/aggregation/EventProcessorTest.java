package fr.autoroutes.supervision.aggregation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import fr.autoroutes.supervision.MutableClock;
import fr.autoroutes.supervision.aggregation.EventProcessor.OdStatus;
import fr.autoroutes.supervision.aggregation.EventProcessor.Outcome;
import fr.autoroutes.supervision.ingestion.EventDeduplicator;
import fr.autoroutes.supervision.ingestion.EventType;
import fr.autoroutes.supervision.ingestion.RejectReason;
import fr.autoroutes.supervision.ingestion.TollEvent;
import fr.autoroutes.supervision.referentiel.StationResolver;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EventProcessorTest {

    private static final Instant T0 = Instant.parse("2026-10-22T08:00:00Z");

    @Mock
    private StationResolver resolver;

    private AggregationState state;
    private OdCounters od;
    private EventProcessor processor;

    @BeforeEach
    void setUp() {
        when(resolver.resolve(anyString())).thenReturn(Optional.empty());
        when(resolver.resolve("La Boisse")).thenReturn(Optional.of("GL-ECH-LA-BOISSE"));
        when(resolver.resolve("Bellegarde Entrée")).thenReturn(Optional.of("GL-ECH-BELLEGARDE"));
        state = new AggregationState(ZoneId.of("Europe/Paris"));
        od = new OdCounters();
        processor = new EventProcessor(resolver,
                new WatermarkTracker(Duration.ofSeconds(30), new MutableClock(T0)),
                new LatenessPolicy(Duration.ofMinutes(10), Duration.ofHours(2)),
                new EventDeduplicator(Duration.ofHours(2)), state, od);
    }

    private static TollEvent exit(String id, Instant at, String entry) {
        return new TollEvent(id, "La Boisse", EventType.EXIT, at, entry, null, 1, null, false);
    }

    @Test
    void recordsExitAndObservedOriginDestinationFlow() {
        var outcome = processor.process(0, exit("e-1", T0, "Bellegarde Entrée"));

        assertThat(outcome).isEqualTo(new Outcome.Applied("GL-ECH-LA-BOISSE", false, OdStatus.RECORDED));
        assertThat(state.metrics("GL-ECH-LA-BOISSE", T0).last5m().exits()).isEqualTo(1);
        assertThat(od.flows(T0, Duration.ofHours(1), 1, 10))
                .containsExactly(new OdFlow("GL-ECH-BELLEGARDE", "GL-ECH-LA-BOISSE", 1));
    }

    @Test
    void replayedEventIsNotCountedTwice() {
        processor.process(0, exit("e-1", T0, "Bellegarde Entrée"));

        assertThat(processor.process(1, exit("e-1", T0, "Bellegarde Entrée"))).isEqualTo(new Outcome.Duplicate("e-1"));
        assertThat(state.metrics("GL-ECH-LA-BOISSE", T0).last5m().exits()).isEqualTo(1);
        assertThat(od.flows(T0, Duration.ofHours(1), 1, 10)).singleElement()
                .satisfies(flow -> assertThat(flow.vehicles()).isEqualTo(1));
    }

    @Test
    void unknownStationNameIsQuarantinedNotCounted() {
        var event = new TollEvent("e-2", "Gare Inconnue", EventType.ENTRY, T0, null, null, 1, null, false);

        assertThat(processor.process(0, event)).isEqualTo(new Outcome.Quarantined(event));
        assertThat(state.stationIds()).isEmpty();
    }

    @Test
    void exitWithoutOrUnknownEntryCountsStationButNotFlow() {
        assertThat(processor.process(0, exit("e-3", T0, null)))
                .isEqualTo(new Outcome.Applied("GL-ECH-LA-BOISSE", false, OdStatus.ENTRY_MISSING));
        assertThat(processor.process(0, exit("e-4", T0, "Gare Inconnue")))
                .isEqualTo(new Outcome.Applied("GL-ECH-LA-BOISSE", false, OdStatus.ENTRY_UNKNOWN));
        assertThat(od.flows(T0, Duration.ofHours(1), 1, 10)).isEmpty();
    }

    @Test
    void lateEventBecomesHistoryCorrectionThenTooLateBeyondHorizon() {
        processor.process(0, exit("e-5", T0, null));

        assertThat(processor.process(0, exit("e-6", T0.minus(Duration.ofMinutes(30)), null)))
                .isEqualTo(new Outcome.Applied("GL-ECH-LA-BOISSE", true, OdStatus.ENTRY_MISSING));
        assertThat(processor.process(0, exit("e-7", T0.minus(Duration.ofHours(3)), null)))
                .isEqualTo(new Outcome.Rejected("e-7", RejectReason.TOO_LATE));
    }
}
