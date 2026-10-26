package fr.autoroutes.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import fr.autoroutes.mcp.AnomalyReporter.Anomaly;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import tools.jackson.databind.json.JsonMapper;

class BackendClientTest {

    private final FakeBackend backend = new FakeBackend();

    private BackendClient client() {
        var properties = new McpAnomaliesProperties("toll-events", "a", "s", Duration.ofSeconds(1), backend.url(), Duration.ofSeconds(2),
                new McpAnomaliesProperties.Security(false, null, null, "roles", "ANOMALY_REPORTER"));
        return new BackendClient(JsonMapper.builder().build(), properties);
    }

    @AfterEach
    void stop() {
        backend.close();
        SecurityContextHolder.clearContext();
    }

    @Test
    void readsEverySourceOfTheStation() {
        backend.respond("""
                [{"source":"mcp:agent","updatedAt":"2026-10-25T15:00:00.123456789Z","anomalies":[{"type_ano":"Barrière","cardinalite":1,"criticite":"Haute"}]},
                 {"source":"peage","updatedAt":"2026-10-25T14:00:00Z","anomalies":[]}]""");

        var state = client().read("GL-BPV-0054");

        assertThat(state.sources()).containsExactly(
                new BackendClient.SourceState("mcp:agent", Instant.parse("2026-10-25T15:00:00.123456789Z"), List.of(new Anomaly("Barrière", 1, "Haute"))),
                new BackendClient.SourceState("peage", Instant.parse("2026-10-25T14:00:00Z"), List.of()));
        assertThat(state.updatedAtOf("mcp:agent")).isEqualTo(Instant.parse("2026-10-25T15:00:00.123456789Z"));
        assertThat(state.updatedAtOf("mcp:autre")).isNull();
    }

    @Test
    void stationWithoutAnyReportHasNoSource() {
        assertThat(client().read("GL-BPV-0054").sources()).isEmpty();
    }

    @Test
    void relaysTheAgentTokenAndSendsNoneWithoutOne() {
        backend.respond("[]");
        client().read("GL-BPV-0054");
        var jwt = Jwt.withTokenValue("jeton-agent").header("alg", "RS256").subject("agent").issuedAt(Instant.now()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
        client().read("GL-BPV-0054");

        assertThat(backend.authorizations).containsExactly("", "Bearer jeton-agent");
    }

    @Test
    void explainsRefusalsAndUnreachableBackend() {
        backend.fail(403);
        assertThatThrownBy(() -> client().read("GL-BPV-0054")).hasMessageContaining("ANOMALY_REPORTER ou VIEWER");
        backend.fail(503);
        assertThatThrownBy(() -> client().read("GL-BPV-0054")).hasMessageContaining("démarrage");
        backend.close();
        assertThatThrownBy(() -> client().read("GL-BPV-0054")).hasMessageContaining("injoignable");
    }
}
