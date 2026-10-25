package fr.autoroutes.simulator;

import java.nio.file.Path;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Paramètres de simulation. Les taux de défauts de flux servent à éprouver le backend :
 * doublons (déduplication), retards (politique de retard), messages invalides (rejets), noms inconnus (quarantaine).
 *
 * @param anomalyReportRate  part des événements (à l'heure, gare connue) portant le rapport d'anomalies de leur gare ; 0 = aucun
 * @param anomalyOpenRate    probabilité, à chaque rapport, qu'une nouvelle occurrence d'incident s'ouvre sur la gare
 * @param anomalyResolveRate probabilité, à chaque rapport, que chaque type d'incident actif perde une occurrence
 * @param seed               graine fixe pour un rejeu déterministe ; absente = aléatoire
 */
@ConfigurationProperties("simulator")
public record SimulatorProperties(
        @DefaultValue("toll-events") String topic,
        @DefaultValue("80") double rate,
        @DefaultValue("../referentiel/gares-logiques-proposition.csv") String stationsFile,
        @DefaultValue("../referentiel/alias-gares.csv") String aliasesFile,
        @DefaultValue("0.01") double duplicateRate,
        @DefaultValue("0.01") double lateRate,
        @DefaultValue("30m") Duration maxLateness,
        @DefaultValue("0.002") double invalidRate,
        @DefaultValue("0.002") double unknownNameRate,
        @DefaultValue("0.1") double anomalyReportRate,
        @DefaultValue("0.05") double anomalyOpenRate,
        @DefaultValue("0.25") double anomalyResolveRate,
        Long seed) {

    public Path stationsPath() {
        return Path.of(stationsFile);
    }

    public Path aliasesPath() {
        return Path.of(aliasesFile);
    }
}
