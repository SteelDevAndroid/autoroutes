package fr.autoroutes.mcp;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

/**
 * {@code mcp-anomalies.security.enabled=true} : jeton porteur OIDC (Keycloak, client credentials de l'agent) et rôle
 * {@code ANOMALY_REPORTER} exigés sur toutes les requêtes hors sonde de santé. Sinon, accès libre : poste de développement
 * seulement, le port n'étant publié que sur 127.0.0.1.
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
class SecurityConfig {

    private static final Logger LOG = LoggerFactory.getLogger(SecurityConfig.class);

    @Bean
    @ConditionalOnProperty(name = "mcp-anomalies.security.enabled", havingValue = "true")
    SecurityFilterChain secured(HttpSecurity http, McpAnomaliesProperties properties) throws Exception {
        var security = properties.security();
        return http
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers("/actuator/health/**").permitAll()
                        .anyRequest().hasRole(security.requiredRole()))
                .oauth2ResourceServer(server -> server.jwt(jwt -> jwt
                        .decoder(jwtDecoder(security))
                        .jwtAuthenticationConverter(rolesConverter(security.rolesClaim()))))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Jeton porteur, sans cookie de session : pas de CSRF possible.
                .csrf(csrf -> csrf.disable())
                .build();
    }

    @Bean
    @ConditionalOnProperty(name = "mcp-anomalies.security.enabled", havingValue = "false", matchIfMissing = true)
    SecurityFilterChain open(HttpSecurity http) throws Exception {
        LOG.warn("Serveur MCP SANS authentification : toute requête peut déclarer des anomalies (développement uniquement)");
        return http.authorizeHttpRequests(requests -> requests.anyRequest().permitAll()).csrf(csrf -> csrf.disable()).build();
    }

    private static JwtDecoder jwtDecoder(McpAnomaliesProperties.Security security) {
        if (security.jwkSetUri() == null || security.jwkSetUri().isBlank()) {
            throw new IllegalStateException("mcp-anomalies.security.jwk-set-uri est obligatoire quand la sécurité est active");
        }
        var decoder = NimbusJwtDecoder.withJwkSetUri(security.jwkSetUri()).build();
        if (security.issuer() != null && !security.issuer().isBlank()) {
            decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(security.issuer()));
        }
        return decoder;
    }

    /** Rôles du royaume (revendication multivaluée) → {@code ROLE_ANOMALY_REPORTER}, comme le backend. */
    static JwtAuthenticationConverter rolesConverter(String claim) {
        var converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> roles(jwt.getClaim(claim)));
        return converter;
    }

    private static Collection<GrantedAuthority> roles(Object claim) {
        return claim instanceof Collection<?> values
                ? values.stream().<GrantedAuthority>map(v -> new SimpleGrantedAuthority("ROLE_" + String.valueOf(v).toUpperCase(Locale.ROOT))).toList()
                : List.of();
    }
}
