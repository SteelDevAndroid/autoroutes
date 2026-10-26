package fr.autoroutes.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import io.modelcontextprotocol.client.McpClient;
import io.modelcontextprotocol.client.McpSyncClient;
import io.modelcontextprotocol.client.transport.HttpClientStreamableHttpTransport;
import io.modelcontextprotocol.spec.McpSchema;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.kafka.test.EmbeddedKafkaBroker;
import org.springframework.kafka.test.context.EmbeddedKafka;
import org.springframework.kafka.test.utils.KafkaTestUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Agent réel (client MCP du SDK, HTTP streamable) → serveur → Kafka embarqué. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.kafka.bootstrap-servers=${spring.embedded.kafka.brokers}", "logging.level.org.apache.kafka=WARN",
                "logging.level.kafka=WARN", "logging.level.state.change.logger=WARN"})
@EmbeddedKafka(partitions = 1, topics = "toll-events")
class McpServerTest {

    private static final FakeBackend BACKEND = new FakeBackend();
    /** Source de l'agent en accès libre (développement) : utilisateur anonyme de Spring Security. */
    private static final String SOURCE = "mcp:anonymousUser";

    @DynamicPropertySource
    static void backend(DynamicPropertyRegistry registry) {
        registry.add("mcp-anomalies.backend-url", BACKEND::url);
    }

    @AfterAll
    static void stopBackend() {
        BACKEND.close();
    }

    @LocalServerPort
    private int port;

    @Autowired
    private EmbeddedKafkaBroker broker;

    private final JsonMapper json = JsonMapper.builder().build();
    private McpSyncClient client;
    private Consumer<String, String> consumer;

    @BeforeEach
    void connect() {
        client = McpClient.sync(HttpClientStreamableHttpTransport.builder("http://localhost:" + port).build())
                .requestTimeout(Duration.ofSeconds(20))
                .build();
        client.initialize();
        var props = KafkaTestUtils.consumerProps(broker, "test-" + System.nanoTime(), true);
        consumer = new DefaultKafkaConsumerFactory<>(props, new StringDeserializer(), new StringDeserializer()).createConsumer();
        // Lecture à partir de la fin : chaque test ne voit que ce qu'il publie sur le topic partagé.
        broker.consumeFromEmbeddedTopics(consumer, true, "toll-events");
    }

    @AfterEach
    void close() {
        client.closeGracefully();
        consumer.close();
    }

    private McpSchema.CallToolResult call(String tool, Map<String, Object> arguments) {
        return client.callTool(new McpSchema.CallToolRequest(tool, arguments));
    }

    private static String text(McpSchema.CallToolResult result) {
        return ((McpSchema.TextContent) result.content().getFirst()).text();
    }

    private JsonNode nextEvent() {
        ConsumerRecord<String, String> record = KafkaTestUtils.getSingleRecord(consumer, "toll-events", Duration.ofSeconds(10));
        assertThat(record.key()).isEqualTo("La Boisse");
        return json.readTree(record.value());
    }

    @Test
    void exposesTheThreeToolsWithTheContractSchema() {
        var tools = client.listTools().tools();

        assertThat(tools).extracting(McpSchema.Tool::name)
                .containsExactlyInAnyOrder("rechercher_gares", "consulter_anomalies", "declarer_anomalies", "lever_anomalies");
        var report = tools.stream().filter(t -> t.name().equals("declarer_anomalies")).findFirst().orElseThrow();
        assertThat(json.writeValueAsString(report.inputSchema())).contains("type_ano", "cardinalite", "criticite", "gare");
        assertThat(report.annotations().destructiveHint()).isTrue();
        assertThat(json.readTree(json.writeValueAsString(report.inputSchema())).at("/properties/anomalies/items/required").toString())
                .contains("type_ano", "cardinalite", "criticite");
    }

    @Test
    void searchesStationsBeforeReporting() {
        var result = call("rechercher_gares", Map.of("texte", "la boisse"));

        assertThat(result.isError()).isFalse();
        assertThat(text(result)).contains("GL-BPV-0054", "La Boisse");
    }

    @Test
    void reportsTheFullStateThenClearsIt() {
        var reported = call("declarer_anomalies", Map.of("gare", "GL-BPV-0054", "anomalies", List.of(
                Map.of("type_ano", "Erreur de communication avec le serveur central de paiement", "cardinalite", 4, "criticite", "Critique"),
                Map.of("type_ano", "Panne de lecteur de badge télépéage (setBadge)", "cardinalite", 2, "criticite", "moyenne"))));

        assertThat(reported.isError()).as(text(reported)).isFalse();
        var event = nextEvent();
        assertThat(event.path("type").asString()).isEqualTo("ANOMALY_REPORT");
        assertThat(event.path("source").asString()).isEqualTo(SOURCE);
        assertThat(event.path("anomalies")).hasSize(2);
        assertThat(event.path("anomalies").get(1).path("criticite").asString()).isEqualTo("Moyenne");
        assertThat(text(reported)).contains(event.path("eventId").asString());

        var cleared = call("lever_anomalies", Map.of("gare", "La Boisse"));

        assertThat(cleared.isError()).isFalse();
        assertThat(nextEvent().path("anomalies").isEmpty()).isTrue();
    }

    @Test
    void readsTheCurrentStateBySourceWithTheCallersVersion() {
        BACKEND.respond("""
                [{"source":"%s","updatedAt":"2026-10-25T15:00:00Z","anomalies":[{"type_ano":"Barrière","cardinalite":1,"criticite":"Haute"}]},
                 {"source":"peage","updatedAt":"2026-10-25T14:00:00Z","anomalies":[]}]""".formatted(SOURCE));

        var result = call("consulter_anomalies", Map.of("gare", "La Boisse"));

        assertThat(result.isError()).as(text(result)).isFalse();
        var state = json.readTree(text(result));
        assertThat(state.path("gare").asString()).isEqualTo("GL-BPV-0054");
        assertThat(state.path("maSource").asString()).isEqualTo(SOURCE);
        assertThat(state.path("versionAttendue").asString()).isEqualTo("2026-10-25T15:00:00Z");
        assertThat(state.path("sources")).hasSize(2);
    }

    @Test
    void publishesOnlyWhenTheExpectedVersionStillHolds() {
        BACKEND.respond("""
                [{"source":"%s","updatedAt":"2026-10-25T15:00:00Z","anomalies":[]}]""".formatted(SOURCE));

        var stale = call("lever_anomalies", Map.of("gare", "GL-BPV-0054", "version_attendue", "2026-10-25T14:59:00Z"));
        var none = call("declarer_anomalies", Map.of("gare", "GL-BPV-0054", "anomalies", List.of(), "version_attendue", "aucune"));
        assertThat(stale.isError()).isTrue();
        assertThat(text(stale)).contains("2026-10-25T15:00:00Z", "consulter_anomalies");
        assertThat(none.isError()).isTrue();
        assertThat(KafkaTestUtils.getRecords(consumer, Duration.ofSeconds(1)).count()).isZero();

        var current = call("lever_anomalies", Map.of("gare", "GL-BPV-0054", "version_attendue", "2026-10-25T15:00:00Z"));
        assertThat(current.isError()).as(text(current)).isFalse();
        assertThat(nextEvent().path("anomalies").isEmpty()).isTrue();
    }

    @Test
    void firstDeclarationOfASourceMatchesNoVersion() {
        BACKEND.respond("[]");

        var first = call("declarer_anomalies", Map.of("gare", "GL-BPV-0054", "version_attendue", "aucune", "anomalies", List.of(
                Map.of("type_ano", "Voie fermée", "cardinalite", 1, "criticite", "Faible"))));

        assertThat(first.isError()).as(text(first)).isFalse();
        assertThat(nextEvent().path("anomalies")).hasSize(1);
    }

    @Test
    void refusesUnknownStationsAndInvalidReportsWithoutPublishing() {
        var unknown = call("declarer_anomalies", Map.of("gare", "Gare imaginaire", "anomalies", List.of()));
        var invalid = call("declarer_anomalies", Map.of("gare", "GL-BPV-0054", "anomalies", List.of(
                Map.of("type_ano", "Panne", "cardinalite", 1, "criticite", "Grave"))));

        assertThat(unknown.isError()).isTrue();
        assertThat(text(unknown)).contains("rechercher_gares");
        assertThat(invalid.isError()).isTrue();
        assertThat(text(invalid)).contains("Faible, Moyenne, Haute, Critique");
        assertThat(KafkaTestUtils.getRecords(consumer, Duration.ofSeconds(1)).count()).isZero();
    }
}
