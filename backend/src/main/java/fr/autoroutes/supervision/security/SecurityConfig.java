package fr.autoroutes.supervision.security;

import fr.autoroutes.supervision.SupervisionProperties;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper;
import org.springframework.security.oauth2.core.oidc.user.OidcUserAuthority;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;

/**
 * Deux chaînes exclusives :
 * <ul>
 *   <li>{@code supervision.security.enabled=true} : connexion OIDC (Keycloak), session côté serveur, rôles VIEWER et ADMIN ;
 *       l'API répond 401 (jamais une redirection) pour que le client décide, CSRF actif sur {@code /api/v1/admin/**} ;</li>
 *   <li>sinon : aucune authentification (démonstration et développement, Q12), comportement des incréments précédents.</li>
 * </ul>
 * En mode sécurisé, une requête portant un jeton {@code Bearer} (agent, serveur MCP) passe par une troisième chaîne, sans
 * session ni CSRF, qui n'ouvre que la lecture d'une gare ({@code GET /api/v1/stations/{id}}) aux rôles ANOMALY_REPORTER, VIEWER et ADMIN.
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
class SecurityConfig {

    static final String ADMIN_PATH = "/api/v1/admin/**";
    static final String STATION_PATH = "/api/v1/stations/*";

    @Bean
    @Order(1)
    @ConditionalOnProperty(name = "supervision.security.enabled", havingValue = "true")
    SecurityFilterChain bearerTokens(HttpSecurity http, SupervisionProperties properties) throws Exception {
        return http
                .securityMatcher(SecurityConfig::hasBearerToken)
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(HttpMethod.GET, STATION_PATH).hasAnyRole("ANOMALY_REPORTER", "VIEWER", "ADMIN")
                        .anyRequest().denyAll())
                .oauth2ResourceServer(server -> server.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtRoles(properties.security().rolesClaim()))))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Jeton porteur, sans cookie de session : pas de CSRF possible.
                .csrf(csrf -> csrf.disable())
                .build();
    }

    private static boolean hasBearerToken(HttpServletRequest request) {
        var header = request.getHeader(HttpHeaders.AUTHORIZATION);
        return header != null && header.regionMatches(true, 0, "Bearer ", 0, 7);
    }

    /** Rôles du royaume portés par le jeton d'accès → {@code ROLE_…}, comme pour la connexion OIDC. */
    static JwtAuthenticationConverter jwtRoles(String claim) {
        var converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> roles(jwt.getClaim(claim)).stream()
                .<GrantedAuthority>map(role -> new SimpleGrantedAuthority("ROLE_" + role.toUpperCase(java.util.Locale.ROOT)))
                .toList());
        return converter;
    }

    @Bean
    @ConditionalOnProperty(name = "supervision.security.enabled", havingValue = "true")
    SecurityFilterChain secured(HttpSecurity http) throws Exception {
        return http
                .authorizeHttpRequests(requests -> requests
                        // Sondes et métriques : joignables seulement depuis le réseau interne (nginx ne les relaie pas).
                        .requestMatchers("/actuator/health/**", "/actuator/prometheus").permitAll()
                        .requestMatchers("/oauth2/**", "/login/**", "/error").permitAll()
                        .requestMatchers(ADMIN_PATH).hasRole("ADMIN")
                        .requestMatchers("/api/**").hasAnyRole("VIEWER", "ADMIN")
                        .anyRequest().denyAll())
                // Retour toujours à l'application : sans cela, la dernière requête d'API refusée (401) serait rejouée après la connexion.
                .oauth2Login(login -> login.defaultSuccessUrl("/", true))
                .exceptionHandling(handling -> handling.defaultAuthenticationEntryPointFor(
                        new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED), PathPatternRequestMatcher.withDefaults().matcher("/api/**")))
                .csrf(csrf -> csrf.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        .csrfTokenRequestHandler(csrfHandler())
                        .ignoringRequestMatchers(request -> !request.getRequestURI().startsWith("/api/v1/admin/")))
                .build();
    }

    /**
     * Jeton CSRF en cookie lisible (double soumission) : le client le renvoie tel quel dans {@code X-XSRF-TOKEN}.
     * Gestionnaire simple (le brouillage XOR attend un jeton encodé par le serveur) et jeton chargé sans attendre, pour que le
     * cookie existe dès la première réponse.
     */
    private static CsrfTokenRequestAttributeHandler csrfHandler() {
        var handler = new CsrfTokenRequestAttributeHandler();
        handler.setCsrfRequestAttributeName(null);
        return handler;
    }

    @Bean
    @ConditionalOnProperty(name = "supervision.security.enabled", havingValue = "false", matchIfMissing = true)
    SecurityFilterChain open(HttpSecurity http) throws Exception {
        return http.authorizeHttpRequests(requests -> requests.anyRequest().permitAll()).csrf(csrf -> csrf.disable()).build();
    }

    /** Rôles Keycloak (revendication multivaluée, « roles » par défaut) → {@code ROLE_VIEWER}, {@code ROLE_ADMIN}. */
    @Bean
    @ConditionalOnProperty(name = "supervision.security.enabled", havingValue = "true")
    GrantedAuthoritiesMapper keycloakRoles(SupervisionProperties properties) {
        return authorities -> {
            var mapped = new ArrayList<GrantedAuthority>(authorities);
            for (var authority : authorities) {
                if (authority instanceof OidcUserAuthority oidc) {
                    roles(oidc.getIdToken().getClaim(properties.security().rolesClaim()))
                            .forEach(role -> mapped.add(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase(java.util.Locale.ROOT))));
                }
            }
            return mapped;
        };
    }

    private static List<String> roles(Object claim) {
        return claim instanceof Collection<?> values ? values.stream().map(String::valueOf).toList() : List.of();
    }
}
