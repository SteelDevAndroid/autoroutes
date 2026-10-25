package fr.autoroutes.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest(properties = {
        "mcp-anomalies.security.enabled=true",
        "mcp-anomalies.security.jwk-set-uri=http://keycloak.invalid/certs",
        "spring.kafka.bootstrap-servers=localhost:1"})
@AutoConfigureMockMvc
class SecuredMcpServerTest {

    private static final String INITIALIZE = """
            {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},
             "clientInfo":{"name":"test","version":"1"}}}""";

    @Autowired
    private MockMvc mvc;

    private static MockHttpServletRequestBuilder initialize() {
        return post("/mcp").contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON, MediaType.TEXT_EVENT_STREAM)
                .content(INITIALIZE);
    }

    @Test
    void rejectsRequestsWithoutToken() throws Exception {
        mvc.perform(initialize()).andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsTokensWithoutTheReporterRole() throws Exception {
        mvc.perform(initialize().with(jwt().authorities(new SimpleGrantedAuthority("ROLE_VIEWER")))).andExpect(status().isForbidden());
    }

    @Test
    void acceptsTokensWithTheReporterRole() throws Exception {
        mvc.perform(initialize().with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ANOMALY_REPORTER")))).andExpect(status().isOk());
    }

    @Test
    void healthProbeStaysReachable() throws Exception {
        mvc.perform(get("/actuator/health/liveness")).andExpect(status().isOk());
    }

    @Test
    void mapsKeycloakRealmRolesToAuthorities() {
        var token = Jwt.withTokenValue("t").header("alg", "RS256").subject("service-account-agent-anomalies")
                .claim("roles", List.of("anomaly_reporter", "offline_access")).issuedAt(Instant.now()).build();

        var authentication = SecurityConfig.rolesConverter("roles").convert(token);

        // Spring Security 7 ajoute l'autorité du facteur d'authentification (FACTOR_BEARER).
        assertThat(authentication.getAuthorities()).extracting(GrantedAuthority::getAuthority)
                .filteredOn(a -> a.startsWith("ROLE_"))
                .containsExactly("ROLE_ANOMALY_REPORTER", "ROLE_OFFLINE_ACCESS");
        assertThat(authentication.getName()).isEqualTo("service-account-agent-anomalies");
    }
}
