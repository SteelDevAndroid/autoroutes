package fr.autoroutes.supervision.ingestion;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import fr.autoroutes.supervision.SupervisionProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.ZoneId;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** Un rejet de donnée simulée doit se lire comme tel dans le topic de rejet : le diagnostic ne le prend pas pour une panne réelle. */
class TollEventListenerProvenanceTest {

    private final RejectionPublisher rejections = mock(RejectionPublisher.class);
    private final TollEventListener listener = new TollEventListener(
            new TollEventParser(JsonMapper.builder().build(), Clock.systemUTC(), ZoneId.of("Europe/Paris")),
            mock(TollEventSink.class), rejections, mock(SupervisionProperties.class), Clock.systemUTC(),
            new ResumeOffsets(), new SimpleMeterRegistry());

    private static ConsumerRecord<String, String> record(String provenance) {
        var record = new ConsumerRecord<>("toll-events", 0, 7L, "gare", "{\"eventId\":\"e1\",\"type\":");
        if (provenance != null) {
            record.headers().add("x-provenance", provenance.getBytes(StandardCharsets.UTF_8));
        }
        return record;
    }

    @Test
    void lEnTeteDeProvenanceDuMessageRejeteEstRecopieDansLeRejet() {
        listener.onRecord(record("simulated"));

        verify(rejections).publish(eq(0), eq(7L), any(), any(), any(), eq("simulated"));
    }

    @Test
    void sansEnTeteLeRejetNeDeclareAucuneProvenance() {
        listener.onRecord(record(null));

        verify(rejections).publish(eq(0), eq(7L), any(), any(), any(), isNull());
    }
}
