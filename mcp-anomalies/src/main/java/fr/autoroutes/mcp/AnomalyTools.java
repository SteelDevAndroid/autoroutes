package fr.autoroutes.mcp;

import fr.autoroutes.mcp.AnomalyReporter.Anomaly;
import fr.autoroutes.mcp.AnomalyReporter.Published;
import java.util.List;
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

    private static final int SEARCH_LIMIT = 20;

    private final StationCatalog catalog;
    private final AnomalyReporter reporter;

    AnomalyTools(StationCatalog catalog, AnomalyReporter reporter) {
        this.catalog = catalog;
        this.reporter = reporter;
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

    @McpTool(name = "declarer_anomalies",
            description = """
                    Déclare l'ÉTAT COMPLET des anomalies d'une gare : la liste REMPLACE toutes les anomalies précédemment déclarées
                    (aucun cumul). Pour ajouter un incident, renvoyer aussi ceux qui sont toujours actifs ; pour tout lever, utiliser
                    lever_anomalies. Chaque type n'apparaît qu'une fois ; cardinalite = nombre d'occurrences (≥ 0, 0 = inactif) ;
                    criticite ∈ Faible, Moyenne, Haute, Critique. Le rapport est daté de maintenant et n'ajoute aucun passage de véhicule.""",
            annotations = @McpAnnotations(title = "Déclarer les anomalies d'une gare", readOnlyHint = false, destructiveHint = true,
                    idempotentHint = true, openWorldHint = false))
    public Published reportAnomalies(
            @McpToolParam(description = "Identifiant de gare logique (GL-…) ou nom exact d'un alias, voir rechercher_gares") String gare,
            @McpToolParam(description = "État complet : liste des anomalies {type_ano, cardinalite, criticite}, au plus 100") List<Anomaly> anomalies) {
        return reporter.publish(station(gare), anomalies, currentReporter());
    }

    @McpTool(name = "lever_anomalies",
            description = "Déclare que la gare n'a plus aucune anomalie (rapport vide) : efface tous les incidents affichés pour cette gare.",
            annotations = @McpAnnotations(title = "Lever toutes les anomalies d'une gare", readOnlyHint = false, destructiveHint = true,
                    idempotentHint = true, openWorldHint = false))
    public Published clearAnomalies(
            @McpToolParam(description = "Identifiant de gare logique (GL-…) ou nom exact d'un alias, voir rechercher_gares") String gare) {
        return reporter.publish(station(gare), List.of(), currentReporter());
    }

    private StationCatalog.Station station(String gare) {
        return catalog.find(gare).orElseThrow(() -> new IllegalArgumentException(
                "Gare inconnue du référentiel : « " + gare + " ». Utiliser rechercher_gares pour obtenir son identifiant."));
    }

    /** Nom lisible pour l'audit : {@code preferred_username} du jeton (compte de service de l'agent), sinon le sujet. */
    private static String currentReporter() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken token && token.getToken().hasClaim("preferred_username")) {
            return token.getToken().getClaimAsString("preferred_username");
        }
        return authentication == null ? "anonyme" : authentication.getName();
    }
}
