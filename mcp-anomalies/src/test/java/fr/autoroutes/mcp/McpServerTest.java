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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
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
        broker.consumeFromAnEmbeddedTopic(consumer, "toll-events");
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
                .containsExactlyInAnyOrder("rechercher_gares", "declarer_anomalies", "lever_anomalies");
        var report = tools.stream().filter(t -> t.name().equals("declarer_anomalies")).findFirst().orElseThrow();
        assertThat(json.writeValueAsString(report.inputSchema())).contains("type_ano", "cardinalite", "criticite", "gare");
        assertThat(report.annotations().destructiveHint()).isTrue();
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
        assertThat(event.path("anomalies")).hasSize(2);
        assertThat(event.path("anomalies").get(1).path("criticite").asString()).isEqualTo("Moyenne");
        assertThat(text(reported)).contains(event.path("eventId").asString());

        var cleared = call("lever_anomalies", Map.of("gare", "La Boisse"));

        assertThat(cleared.isError()).isFalse();
        assertThat(nextEvent().path("anomalies").isEmpty()).isTrue();
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
