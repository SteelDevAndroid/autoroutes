package fr.autoroutes.simulator;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** Événements conformes au contrat PROVISOIRE 0.1, toujours marqués {@code simulated: true}. */
@Component
public class EventFactory {

    private static final Logger LOG = LoggerFactory.getLogger(EventFactory.class);

    /** @param key clé Kafka (nom de gare) ; {@code payload} peut être volontairement invalide */
    public record SimulatedRecord(String key, String payload) {
    }

    private final StationPool pool;
    private final Random random;
    private final Clock clock;
    private final JsonMapper json;
    private final SimulatorProperties properties;
    private final StationIncidents incidents;
    private final Set<String> silent;
    private final Instant silentFrom;
    private boolean silenceAnnounced;
    private SimulatedRecord last;

    EventFactory(StationPool pool, Random random, Clock clock, JsonMapper json, SimulatorProperties properties) {
        this.pool = pool;
        this.random = random;
        this.clock = clock;
        this.json = json;
        this.properties = properties;
        this.incidents = new StationIncidents(random, properties.anomalyOpenRate(), properties.anomalyResolveRate());
        this.silent = Set.copyOf(properties.silentStations());
        var unknown = silent.stream().filter(id -> !pool.contains(id)).toList();
        if (!unknown.isEmpty()) {
            // Une gare muette mal orthographiée ne se tairait jamais, et le scénario passerait pour une détection ratée.
            throw new IllegalArgumentException("simulator.silent-stations : gares inconnues du référentiel " + unknown);
        }
        if (!silent.isEmpty() && silent.size() >= pool.size()) {
            throw new IllegalArgumentException("simulator.silent-stations : toutes les gares seraient muettes");
        }
        this.silentFrom = clock.instant().plus(properties.silentAfter());
        if (!silent.isEmpty()) {
            LOG.info("Gares muettes à partir de {} : {} (SCÉNARIO SIMULÉ)", silentFrom, silent);
        }
    }

    /** Vrai pour une gare du scénario de panne une fois son délai écoulé. */
    private boolean silenced(StationPool.Station station) {
        if (!silent.contains(station.id()) || clock.instant().isBefore(silentFrom)) {
            return false;
        }
        if (!silenceAnnounced) {
            LOG.info("Les gares {} cessent d'émettre (SCÉNARIO SIMULÉ)", silent);
            silenceAnnounced = true;
        }
        return true;
    }

    /** Gares dont l'état simulé compte au moins un incident actif. */
    public int stationsWithIncidents() {
        return incidents.stationsWithIncidents();
    }

    public SimulatedRecord next() {
        var draw = random.nextDouble();
        if (last != null && draw < properties.duplicateRate()) {
            return last;
        }
        draw -= properties.duplicateRate();
        if (draw < properties.invalidRate()) {
            return new SimulatedRecord("invalide", "{\"eventId\":\"" + UUID.randomUUID() + "\",\"type\":");
        }
        last = event(draw - properties.invalidRate() < properties.unknownNameRate());
        return last;
    }

    private SimulatedRecord event(boolean unknownName) {
        var station = silent.isEmpty() ? pool.pickByLanes() : pool.pickByLanes(this::silenced);
        var name = unknownName ? "Gare simulée inconnue " + random.nextInt(5) : pool.nameOf(station);
        var eventTime = clock.instant();
        var late = random.nextDouble() < properties.lateRate();
        if (late) {
            eventTime = eventTime.minus(Duration.ofSeconds(1 + random.nextLong(properties.maxLateness().toSeconds())));
        }
        var event = new LinkedHashMap<String, Object>();
        event.put("eventId", UUID.randomUUID().toString());
        event.put("stationName", name);
        // Système ouvert (barrière pleine voie) : passage unique, sans gare d'entrée.
        var exit = station.openSystem() || random.nextBoolean();
        String entry = null;
        if (exit && !station.openSystem()) {
            var picked = silent.isEmpty() ? java.util.Optional.of(pool.pickEntryFor(station)) : pool.pickEntryFor(station, this::silenced);
            // Sans entrée émettrice plausible, le trajet ne peut pas sortir ici : le passage devient une entrée.
            exit = picked.isPresent();
            entry = picked.map(pool::nameOf).orElse(null);
        }
        event.put("type", exit ? "EXIT" : "ENTRY");
        event.put("eventTime", eventTime.toString());
        if (entry != null) {
            event.put("entryStationName", entry);
        }
        event.put("vehicleCount", 1);
        event.put("vehicleClass", 1 + (random.nextDouble() < 0.12 ? 1 + random.nextInt(4) : 0));
        event.put("simulated", true);
        // État courant de la gare : seul un événement à l'heure le date correctement ; une gare inconnue part en quarantaine.
        if (!unknownName && !late && random.nextDouble() < properties.anomalyReportRate()) {
            event.put("anomalies", incidents.report(station.id()));
        }
        return new SimulatedRecord(name, json.writeValueAsString(event));
    }
}
