package fr.autoroutes.supervision;

import java.nio.file.Path;
import java.time.Duration;
import java.time.ZoneId;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("supervision")
public record SupervisionProperties(
        @DefaultValue("Europe/Paris") ZoneId zone,
        @DefaultValue Referentiel referentiel,
        @DefaultValue Kafka kafka,
        @DefaultValue Aggregation aggregation,
        @DefaultValue Stream stream,
        @DefaultValue History history) {

    /** Fichiers produits par scripts/analyse_referentiel.py. */
    /** Chemins en chaînes : la conversion Spring vers Path passe par les ressources et refuse « ../ ». */
    public record Referentiel(
            @DefaultValue("../referentiel/gares-logiques-proposition.csv") String stationsFile,
            @DefaultValue("../referentiel/alias-gares.csv") String aliasesFile) {

        public Path stationsPath() {
            return Path.of(stationsFile);
        }

        public Path aliasesPath() {
            return Path.of(aliasesFile);
        }
    }

    public record Kafka(
            @DefaultValue("toll-events") String topic,
            @DefaultValue("toll-events.rejected") String rejectedTopic) {
    }

    public record Aggregation(
            @DefaultValue("10m") Duration allowedLateness,
            @DefaultValue("2h") Duration dedupHorizon,
            @DefaultValue("30s") Duration partitionIdleTimeout,
            @DefaultValue("50000") int queueCapacity,
            @DefaultValue("1s") Duration tickInterval,
            @DefaultValue("10s") Duration odInterval,
            @DefaultValue("1h") Duration odWindow,
            @DefaultValue("3") long odMinVehicles,
            @DefaultValue("500") int odLimit,
            @DefaultValue("60s") Duration checkpointInterval,
            @DefaultValue("60s") Duration staleAfter,
            @DefaultValue("15m") Duration stationStaleAfter,
            @DefaultValue("5000") long catchingUpLag) {
    }

    /** Rétentions par résolution (purge par partition) et plage maximale d'une lecture minute par minute. */
    public record History(
            @DefaultValue("7d") Duration minuteRetention,
            @DefaultValue("400d") Duration quarterRetention,
            @DefaultValue("1100d") Duration hourRetention,
            @DefaultValue("93d") Duration odHourRetention,
            @DefaultValue("400d") Duration odDayRetention,
            @DefaultValue("2h") Duration maxMinuteSpan) {
    }

    public record Stream(
            @DefaultValue("500") int maxClients,
            @DefaultValue("64") int clientQueueCapacity,
            @DefaultValue("300") int replayCapacity,
            @DefaultValue("1h") Duration connectionTimeout) {
    }
}
