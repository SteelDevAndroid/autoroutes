package fr.autoroutes.simulator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.kafka.core.KafkaTemplate;

/** Chaque message simulé porte son origine : ce qui en découle en aval (rejets, diagnostics) peut ainsi être marqué simulé. */
class SimulatorProvenanceTest {

    @Test
    @SuppressWarnings({ "unchecked", "rawtypes" })
    void chaqueMessageEmisPorteLEnTeteDeProvenance() {
        var kafka = mock(KafkaTemplate.class);
        var factory = mock(EventFactory.class);
        org.mockito.Mockito.when(factory.next()).thenReturn(new EventFactory.SimulatedRecord("gare", "{}"));
        var properties = new SimulatorProperties("toll-events", 1000, "s", "a", 0, 0, Duration.ofMinutes(30), 0, 0, 0, 0, 0,
                "simulated", 1L);
        var runner = new SimulatorRunner(factory, kafka, properties, mock(StationPool.class), Clock.systemUTC());

        runner.emit();

        ArgumentCaptor<ProducerRecord> sent = ArgumentCaptor.forClass(ProducerRecord.class);
        verify(kafka, org.mockito.Mockito.atLeastOnce()).send(sent.capture());
        assertThat(new String(sent.getValue().headers().lastHeader("x-provenance").value(), StandardCharsets.UTF_8))
                .isEqualTo("simulated");
    }
}
