package fr.autoroutes.supervision.api;

import fr.autoroutes.supervision.aggregation.LiveView;
import fr.autoroutes.supervision.aggregation.OdUpdate;
import fr.autoroutes.supervision.aggregation.Snapshot;
import fr.autoroutes.supervision.aggregation.StationMetrics;
import fr.autoroutes.supervision.referentiel.LogicalStation;
import fr.autoroutes.supervision.referentiel.StationCatalog;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
class LiveController {

    record StationDetail(LogicalStation station, StationMetrics metrics) {
    }

    private final LiveView liveView;
    private final StationCatalog catalog;

    LiveController(LiveView liveView, StationCatalog catalog) {
        this.liveView = liveView;
        this.catalog = catalog;
    }

    @GetMapping("/snapshot")
    Snapshot snapshot() {
        return liveView.snapshot().orElseThrow(LiveController::starting);
    }

    @GetMapping("/stations/{id}")
    StationDetail station(@PathVariable String id) {
        var station = catalog.find(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gare inconnue : " + id));
        var metrics = snapshot().stations().stream().filter(m -> m.stationId().equals(id)).findFirst().orElse(null);
        return new StationDetail(station, metrics);
    }

    @GetMapping("/od")
    OdUpdate od(@RequestParam(defaultValue = "500") int limit) {
        var od = liveView.od().orElseGet(() -> new OdUpdate("PT1H", 0, java.util.List.of()));
        return new OdUpdate(od.window(), od.minVehicles(), od.flows().stream().limit(Math.max(0, limit)).toList());
    }

    private static ResponseStatusException starting() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Démarrage en cours");
    }
}
