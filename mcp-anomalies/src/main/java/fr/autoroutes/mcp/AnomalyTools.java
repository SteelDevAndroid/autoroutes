package fr.autoroutes.mcp;

import fr.autoroutes.mcp.AnomalyReporter.Anomaly;
import fr.autoroutes.mcp.AnomalyReporter.Published;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Objects;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpTool.McpAnnotations;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

/** Outils MCP exposés aux agents. Les descriptions sont lues par le modèle : elles portent les règles du contrat. */
@Component
public class AnomalyTools {

    public record FoundStation(String id, String libelle, String nomPublie, List<String> alias, List<String> axes) {
    }

    /**
     * @param maSource        source de l'agent appelant : seule celle-ci est modifiée par declarer_anomalies et lever_anomalies
     * @param versionAttendue date du dernier rapport de {@code maSource} ({@code aucune} s'il n'y en a pas), pour la garde
     */
    public record StationAnomalies(String gare, String libelle, String maSource, String versionAttendue,
                                   List<BackendClient.SourceState> sources) {
    }

    static final String NO_VERSION = "aucune";
    private static final int SEARCH_LIMIT = 20;
    private static final String STATION_PARAM = "Identifiant de gare logique (GL-…) ou nom exact d'un alias, voir rechercher_gares";
    private static final String VERSION_PARAM = """
            Facultatif. versionAttendue renvoyée par consulter_anomalies (ou eventTime de votre dernière déclaration) : \
            la déclaration est refusée si l'état de votre source a changé depuis. « aucune » : vous n'avez encore rien déclaré.""";

    private final StationCatalog catalog;
    private final AnomalyReporter reporter;
    private final BackendClient backend;

    AnomalyTools(StationCatalog catalog, AnomalyReporter reporter, BackendClient backend) {
        this.catalog = catalog;
        this.reporter = reporter;
        this.backend = backend;
    }

    @McpTool(name = "rechercher_gares",
            description = """
                    Recherche des gares de péage du référentiel (au plus 20) par identifiant (GL-…), nom, alias ou autoroute (ex. A0007).
                    Accents, casse et ponctuation sont ignorés. À utiliser avant de déclarer des anomalies pour obtenir l'identifiant exact.""",
            annotations = @McpAnnotations(title = "Rechercher des gares", readOnlyHint = true, destructiveHint = false,
                    idempotentHint = true, openWorldHint = false))
    public List<FoundStation> searchStations(@McpToolParam(description = "Texte recherché : identifiant, nom de gare ou autoroute") String texte) {
        return catalog.search(texte, SEARCH_LIMIT).stream()
                .map(s -> new FoundStation(s.id(), s.label(), s.name(), s.aliases(), s.axes()))
                .toList();
    }

    @McpTool(name = "consulter_anomalies",
            description = """
                    Lit l'état courant des anomalies d'une gare tel que publié par la supervision, détaillé par source
                    (peage = équipements de péage, mcp:<compte> = un agent). maSource est votre source ; versionAttendue est à
                    repasser à declarer_anomalies pour ne pas écraser une mise à jour concurrente. Sources vides : rien n'a été déclaré.""",
            annotations = @McpAnnotations(title = "Consulter les anomalies d'une gare", readOnlyHint = true, destructiveHint = false,
                    idempotentHint = true, openWorldHint = false))
    public StationAnomalies readAnomalies(@McpToolParam(description = STATION_PARAM) String gare) {
        var station = station(gare);
        var source = AnomalyReporter.sourceFor(currentReporter());
        var state = backend.read(station.id());
        var version = state.updatedAtOf(source);
        return new StationAnomalies(station.id(), station.label(), source, version == null ? NO_VERSION : version.toString(), state.sources());
    }

    @McpTool(name = "declarer_anomalies",
            description = """
                    Déclare l'ÉTAT COMPLET des anomalies constatées par VOTRE source (mcp:<compte>) pour une gare : la liste REMPLACE
                    tout ce que votre source avait déclaré (aucun cumul), sans toucher aux autres sources. Pour ajouter un incident,
                    renvoyer aussi ceux de votre source toujours actifs (voir consulter_anomalies) ; pour tout lever, lever_anomalies.
                    Chaque type n'apparaît qu'une fois ; cardinalite = nombre d'occurrences (≥ 0, 0 = inactif) ;
                    criticite ∈ Faible, Moyenne, Haute, Critique. Le rapport est daté de maintenant et n'ajoute aucun passage de véhicule.""",
            annotations = @McpAnnotations(title = "Déclarer les anomalies d'une gare", readOnlyHint = false, destructiveHint = true,
                    idempotentHint = true, openWorldHint = false))
    public Published reportAnomalies(
            @McpToolParam(description = STATION_PARAM) String gare,
            @McpToolParam(description = "État complet de votre source : liste des anomalies {type_ano, cardinalite, criticite}, au plus 100") List<Anomaly> anomalies,
            @McpToolParam(description = VERSION_PARAM, required = false) String version_attendue) {
        var station = station(gare);
        var author = currentReporter();
        AnomalyReporter.validate(anomalies);
        checkVersion(station, author, version_attendue);
        return reporter.publish(station, anomalies, author);
    }

    @McpTool(name = "lever_anomalies",
            description = """
                    Déclare que VOTRE source ne constate plus aucune anomalie sur la gare (rapport vide) : efface les incidents
                    déclarés par votre source, sans toucher à ceux des autres sources (péage, autres agents).""",
            annotations = @McpAnnotations(title = "Lever les anomalies de votre source", readOnlyHint = false, destructiveHint = true,
                    idempotentHint = true, openWorldHint = false))
    public Published clearAnomalies(
            @McpToolParam(description = STATION_PARAM) String gare,
            @McpToolParam(description = VERSION_PARAM, required = false) String version_attendue) {
        var station = station(gare);
        var author = currentReporter();
        checkVersion(station, author, version_attendue);
        return reporter.publish(station, List.of(), author);
    }

    /**
     * Garde optimiste : compare la version annoncée à celle publiée par le backend. Vérification puis publication ne sont pas
     * atomiques (le backend applique le rapport de façon asynchrone) : elle protège d'un écrasement entre deux lectures, pas d'une
     * course à la milliseconde.
     */
    private void checkVersion(StationCatalog.Station station, String author, String expected) {
        if (expected == null || expected.isBlank()) {
            return;
        }
        var wanted = parseVersion(expected.strip());
        var current = backend.read(station.id()).updatedAtOf(AnomalyReporter.sourceFor(author));
        if (!Objects.equals(wanted, current)) {
            throw new IllegalStateException("L'état de votre source pour " + station.id() + " n'est plus la version attendue (actuelle : "
                    + (current == null ? NO_VERSION : current) + "). Relire avec consulter_anomalies puis redéclarer l'état complet ; "
                    + "juste après une déclaration, attendre quelques secondes qu'elle soit appliquée.");
        }
    }

    private static Instant parseVersion(String value) {
        if (value.equalsIgnoreCase(NO_VERSION)) {
            return null;
        }
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("version_attendue : date ISO-8601 (versionAttendue de consulter_anomalies) ou « aucune »");
        }
    }

    private StationCatalog.Station station(String gare) {
        return catalog.find(gare).orElseThrow(() -> new IllegalArgumentException(
                "Gare inconnue du référentiel : « " + gare + " ». Utiliser rechercher_gares pour obtenir son identifiant."));
    }

    /** Nom lisible, pour l'audit et la source : {@code preferred_username} du jeton (compte de service de l'agent), sinon le sujet. */
    private static String currentReporter() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken token && token.getToken().hasClaim("preferred_username")) {
            return token.getToken().getClaimAsString("preferred_username");
        }
        return authentication == null ? "anonyme" : authentication.getName();
    }
}
