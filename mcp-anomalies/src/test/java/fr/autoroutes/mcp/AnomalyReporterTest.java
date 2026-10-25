package fr.autoroutes.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import fr.autoroutes.mcp.AnomalyReporter.Anomaly;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
class AnomalyReporterTest {

    private static final Instant NOW = Instant.parse("2026-10-25T15:00:00Z");
    private static final StationCatalog.Station LA_BOISSE =
            new StationCatalog.Station("GL-BPV-0054", "La Boisse BPV", "La Boisse", List.of("La Boisse"), List.of("A0042"));

    @Mock
    private KafkaTemplate<String, String> kafka;

    private final JsonMapper json = JsonMapper.builder().build();

    private AnomalyReporter reporter() {
        var properties = new McpAnomaliesProperties("toll-events", "a", "s", Duration.ofMillis(200), "http://backend.invalid", Duration.ofSeconds(1),
                new McpAnomaliesProperties.Security(false, null, null, "roles", "ANOMALY_REPORTER"));
        return new AnomalyReporter(kafka, json, Clock.fixed(NOW, ZoneOffset.UTC), properties);
    }

    @Test
    void publishesAStandaloneReportWithTheExactContractFields() {
        when(kafka.send(eq("toll-events"), eq("La Boisse"), anyString()))
                .thenReturn(CompletableFuture.completedFuture((SendResult<String, String>) null));

        var published = reporter().publish(LA_BOISSE, List.of(new Anomaly(" Barrière bloquée ", 1, "haute")), "agent");

        var payload = ArgumentCaptor.forClass(String.class);
        verify(kafka).send(eq("toll-events"), eq("La Boisse"), payload.capture());
        var event = json.readTree(payload.getValue());
        assertThat(event.path("eventId").asString()).startsWith("mcp-").isEqualTo(published.eventId());
        assertThat(event.path("stationName").asString()).isEqualTo("La Boisse");
        assertThat(event.path("type").asString()).isEqualTo("ANOMALY_REPORT");
        assertThat(event.path("source").asString()).isEqualTo("mcp:agent").isEqualTo(published.source());
        assertThat(event.path("eventTime").asString()).isEqualTo(NOW.toString());
        assertThat(event.has("vehicleCount")).isFalse();
        assertThat(event.path("anomalies").toString())
                .isEqualTo("[{\"type_ano\":\"Barrière bloquée\",\"cardinalite\":1,\"criticite\":\"Haute\"}]");
        assertThat(published.stationId()).isEqualTo("GL-BPV-0054");
    }

    @Test
    void agentSourceIsSanitisedAndBoundedLikeTheBackendExpects() {
        assertThat(AnomalyReporter.sourceFor("service-account-agent-anomalies")).isEqualTo("mcp:service-account-agent-anomalies");
        assertThat(AnomalyReporter.sourceFor("Jean Dupont/é")).isEqualTo("mcp:Jean-Dupont--");
        assertThat(AnomalyReporter.sourceFor("x".repeat(100))).hasSize(64).matches("[A-Za-z0-9._:@-]+");
    }

    @Test
    void reportsAFailureWhenKafkaDoesNotAcknowledge() {
        when(kafka.send(anyString(), anyString(), anyString())).thenReturn(new CompletableFuture<>());

        assertThatThrownBy(() -> reporter().publish(LA_BOISSE, List.of(), "agent"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("non transmis");
    }

    @Test
    void acceptsAnEmptyReportAndZeroCardinality() {
        assertThat(AnomalyReporter.validate(List.of())).isEmpty();
        assertThat(AnomalyReporter.validate(List.of(new Anomaly("Voie fermée", 0, "Faible"))))
                .containsExactly(new Anomaly("Voie fermée", 0, "Faible"));
    }

    @Test
    void rejectsReportsTheBackendWouldRefuseOrMisread() {
        assertThatThrownBy(() -> AnomalyReporter.validate(null)).hasMessageContaining("obligatoire");
        assertThatThrownBy(() -> AnomalyReporter.validate(List.of(new Anomaly(" ", 1, "Haute")))).hasMessageContaining("type_ano");
        assertThatThrownBy(() -> AnomalyReporter.validate(List.of(new Anomaly("x".repeat(257), 1, "Haute")))).hasMessageContaining("256");
        assertThatThrownBy(() -> AnomalyReporter.validate(List.of(new Anomaly("A", -1, "Haute")))).hasMessageContaining("cardinalite");
        assertThatThrownBy(() -> AnomalyReporter.validate(List.of(new Anomaly("A", 1, "Grave")))).hasMessageContaining("Critique");
        assertThatThrownBy(() -> AnomalyReporter.validate(List.of(new Anomaly("A", 1, null)))).hasMessageContaining("criticite");
        assertThatThrownBy(() -> AnomalyReporter.validate(List.of(new Anomaly("Panne", 1, "Haute"), new Anomaly("panne", 2, "Haute"))))
                .hasMessageContaining("deux fois");
        assertThatThrownBy(() -> AnomalyReporter.validate(Collections.nCopies(101, new Anomaly("A", 1, "Haute"))))
                .hasMessageContaining("100");
    }
}
