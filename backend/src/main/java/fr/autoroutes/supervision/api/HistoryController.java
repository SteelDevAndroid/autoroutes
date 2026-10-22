package fr.autoroutes.supervision.api;

import fr.autoroutes.supervision.aggregation.OdFlow;
import fr.autoroutes.supervision.history.HistoryQueries;
import fr.autoroutes.supervision.history.Resolution;
import fr.autoroutes.supervision.referentiel.StationCatalog;
import java.time.Instant;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Historique OBSERVÉ : séries par gare et réseau, minutes pour la relecture, cumuls, flux O/D. Instants ISO-8601. */
@RestController
@RequestMapping("/api/v1")
class HistoryController {

    record StationSeries(String stationId, Resolution step, List<HistoryQueries.Point> points) {
    }

    record NetworkSeries(Resolution step, List<HistoryQueries.Point> points) {
    }

    record OdHistory(Instant from, Instant to, String nature, long minVehicles, List<OdFlow> flows) {
    }

    private final HistoryQueries history;
    private final StationCatalog catalog;

    HistoryController(HistoryQueries history, StationCatalog catalog) {
        this.history = history;
        this.catalog = catalog;
    }

    @GetMapping("/stations/{id}/history")
    StationSeries station(@PathVariable String id,
                          @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                          @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
                          @RequestParam(defaultValue = "PT15M") Resolution step) {
        if (!catalog.contains(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Gare inconnue : " + id);
        }
        return new StationSeries(id, step, history.stationSeries(id, from, to, step));
    }

    @GetMapping("/history/network")
    NetworkSeries network(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                          @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
                          @RequestParam(defaultValue = "PT1H") Resolution step) {
        return new NetworkSeries(step, history.networkSeries(from, to, step));
    }

    @GetMapping("/history/minutes")
    List<HistoryQueries.MinuteRow> minutes(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                                           @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        return history.minutes(from, to);
    }

    @GetMapping("/history/totals")
    List<HistoryQueries.StationTotal> totals(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                                             @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        return history.totals(from, to);
    }

    @GetMapping("/history/od")
    OdHistory od(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                 @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
                 @RequestParam(defaultValue = "3") long minVehicles,
                 @RequestParam(defaultValue = "500") int limit) {
        // Seuil de diffusion RGPD : jamais en dessous de 3 véhicules.
        var threshold = Math.max(3, minVehicles);
        return new OdHistory(from, to, "OBSERVED", threshold, history.od(from, to, threshold, Math.min(Math.max(limit, 1), 2_000)));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail invalidRange(IllegalArgumentException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }
}
