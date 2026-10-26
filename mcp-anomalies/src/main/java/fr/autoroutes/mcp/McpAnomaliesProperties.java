package fr.autoroutes.mcp;

import java.nio.file.Path;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * @param topic          topic des événements de péage, lu par le backend
 * @param sendTimeout    attente maximale de l'accusé Kafka : l'agent n'est informé du succès qu'après écriture effective
 * @param backendUrl     backend de supervision, lu par consulter_anomalies et par la garde de version
 * @param backendTimeout délai de connexion et de lecture vers le backend
 */
@ConfigurationProperties("mcp-anomalies")
public record McpAnomaliesProperties(
        @DefaultValue("toll-events") String topic,
        @DefaultValue("../referentiel/alias-gares.csv") String aliasesFile,
        @DefaultValue("../referentiel/gares-logiques-proposition.csv") String stationsFile,
        @DefaultValue("10s") Duration sendTimeout,
        @DefaultValue("http://localhost:8081") String backendUrl,
        @DefaultValue("5s") Duration backendTimeout,
        @DefaultValue Security security) {

    /**
     * @param enabled      jeton OIDC (Keycloak) exigé sur {@code /mcp} ; désactivé = poste de développement uniquement
     * @param jwkSetUri    clés de signature du royaume
     * @param issuer       émetteur attendu ({@code iss}) ; vide = non vérifié
     * @param rolesClaim   revendication multivaluée portant les rôles du royaume
     * @param requiredRole rôle donnant le droit de déclarer des anomalies
     */
    public record Security(
            @DefaultValue("false") boolean enabled,
            String jwkSetUri,
            String issuer,
            @DefaultValue("roles") String rolesClaim,
            @DefaultValue("ANOMALY_REPORTER") String requiredRole) {
    }

    public Path aliasesPath() {
        return Path.of(aliasesFile);
    }

    public Path stationsPath() {
        return Path.of(stationsFile);
    }
}
