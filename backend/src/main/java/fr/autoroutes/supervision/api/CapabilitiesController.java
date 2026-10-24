package fr.autoroutes.supervision.api;

import fr.autoroutes.supervision.SupervisionProperties;
import fr.autoroutes.supervision.aggregation.SourceCounts;
import fr.autoroutes.supervision.aggregation.HistoryIncrements;
import fr.autoroutes.supervision.assignment.AssignmentRunner;
import fr.autoroutes.supervision.history.HistoryQueries;
import fr.autoroutes.supervision.history.Resolution;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Capabilities are factual server state, not guesses based on missing stream messages. */
@RestController
@RequestMapping("/api/v1")
class CapabilitiesController {
    record Capabilities(SourceCounts.Nature provenance, String segments) {
    }

    private final HistoryQueries history;
    private final ObjectProvider<AssignmentRunner> runner;
    private final Clock clock;
    private final SupervisionProperties properties;
    private final HistoryIncrements increments;

    CapabilitiesController(HistoryQueries history, ObjectProvider<AssignmentRunner> runner, Clock clock,
                           SupervisionProperties properties, HistoryIncrements increments) {
        this.history = history;
        this.runner = runner;
        this.clock = clock;
        this.properties = properties;
        this.increments = increments;
    }

    @GetMapping("/capabilities")
    Capabilities capabilities() {
        var now = clock.instant();
        var midnight = now.atZone(properties.zone()).toLocalDate().atStartOfDay(properties.zone()).toInstant();
        var hourAgo = now.minusSeconds(3600).truncatedTo(ChronoUnit.HOURS);
        var from = midnight.isBefore(hourAgo) ? midnight : hourAgo;
        var assignment = runner.getIfAvailable();
        var segments = assignment == null ? "DISABLED" : assignment.latest().isPresent() ? "READY" : "STARTING";
        return new Capabilities(increments.liveNature(history.provenance(null, from, now, Resolution.PT1H)), segments);
    }
}
