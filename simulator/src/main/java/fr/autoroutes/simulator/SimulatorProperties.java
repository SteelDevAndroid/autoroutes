package fr.autoroutes.simulator;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Paramètres de simulation. Les taux de défauts de flux servent à éprouver le backend :
 * doublons (déduplication), retards (politique de retard), messages invalides (rejets), noms inconnus (quarantaine).
 *
 * @param anomalyReportRate  part des événements (à l'heure, gare connue) portant le rapport d'anomalies de leur gare ; 0 = aucun
 * @param anomalyOpenRate    probabilité, à chaque rapport, qu'une nouvelle occurrence d'incident s'ouvre sur la gare
 * @param anomalyResolveRate probabilité, à chaque rapport, que chaque type d'incident actif perde une occurrence
 * @param provenance         valeur de l'en-tête {@code x-provenance} posé sur chaque message ; vide = pas d'en-tête
 * @param seed               graine fixe pour un rejeu déterministe ; absente = aléatoire
 * @param silentStations     gares logiques (identifiants {@code GL-…}) qui cessent d'émettre : scénario de panne de gare,
 *                           pour éprouver la détection de silence de bout en bout ; vide = aucune
 * @param silentAfter        délai, depuis le démarrage, avant que ces gares se taisent : elles ont d'abord un dernier passage,
 *                           sans quoi la lecture rendrait « jamais mesuré » plutôt que « muette »
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
        @DefaultValue("simulated") String provenance,
        Long seed,
        @DefaultValue({}) List<String> silentStations,
        @DefaultValue("0s") Duration silentAfter) {

    public SimulatorProperties {
        // Une variable d'environnement vide (SIMULATOR_SILENT_STATIONS=) doit valoir « aucune », pas une gare au nom vide.
        silentStations = silentStations == null ? List.of()
                : silentStations.stream().map(String::strip).filter(id -> !id.isEmpty()).toList();
        silentAfter = silentAfter == null ? Duration.ZERO : silentAfter;
    }

    public Path stationsPath() {
        return Path.of(stationsFile);
    }

    public Path aliasesPath() {
        return Path.of(aliasesFile);
    }
}
