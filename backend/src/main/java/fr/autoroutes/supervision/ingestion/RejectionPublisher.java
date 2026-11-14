package fr.autoroutes.supervision.ingestion;

import fr.autoroutes.supervision.SupervisionProperties;
import java.nio.charset.StandardCharsets;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

/**
 * Topic de rejet SANS le message brut (RGPD) : motif, champ, eventId et position d'origine en en-têtes, et les mêmes
 * métadonnées en JSON dans la valeur, que les outils de diagnostic de file morte lisent ({@code failure_reason}).
 * Le message reste consultable à sa position dans le topic source par les personnes habilitées.
 */
@Component
public class RejectionPublisher {

    private static final Logger LOG = LoggerFactory.getLogger(RejectionPublisher.class);

    private final KafkaTemplate<String, String> kafka;
    private final String topic;

    RejectionPublisher(KafkaTemplate<String, String> kafka, SupervisionProperties properties) {
        this.kafka = kafka;
        this.topic = properties.kafka().rejectedTopic();
    }

    public void publish(int partition, long offset, String eventId, RejectReason reason, String field) {
        publish(partition, offset, eventId, reason, field, null);
    }

    /** {@code provenance} reprend l'en-tête {@code x-provenance} du message d'origine : un rejet de donnée simulée doit se lire comme tel. */
    public void publish(int partition, long offset, String eventId, RejectReason reason, String field, String provenance) {
        var headers = new RecordHeaders();
        if (provenance != null && !provenance.isBlank()) {
            headers.add("x-provenance", bytes(provenance));
        }
        headers.add("x-reason", bytes(reason.name()));
        headers.add("x-source-partition", bytes(Integer.toString(partition)));
        headers.add("x-source-offset", bytes(Long.toString(offset)));
        if (field != null) {
            headers.add("x-field", bytes(field));
        }
        if (eventId != null) {
            headers.add("x-event-id", bytes(eventId));
        }
        kafka.send(new ProducerRecord<>(topic, null, eventId, describe(partition, offset, eventId, reason, field, provenance), headers))
                .whenComplete((result, error) -> {
                    if (error != null) {
                        LOG.warn("Rejet non publié (partition {}, offset {}) : {}", partition, offset, error.getMessage());
                    }
                });
    }

    /** Jamais le message d'origine : uniquement ce que les en-têtes portent déjà. */
    static String describe(int partition, long offset, String eventId, RejectReason reason, String field, String provenance) {
        var json = new StringBuilder("{\"failure_reason\":\"").append(reason.name()).append('"');
        if (field != null) {
            json.append(",\"field\":\"").append(escape(field)).append('"');
        }
        if (eventId != null) {
            json.append(",\"eventId\":\"").append(escape(eventId)).append('"');
        }
        if (provenance != null && !provenance.isBlank()) {
            json.append(",\"provenance\":\"").append(escape(provenance)).append('"');
        }
        return json.append(",\"sourcePartition\":").append(partition).append(",\"sourceOffset\":").append(offset).append('}').toString();
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"").replaceAll("[\\p{Cntrl}]", " ");
    }

    private static byte[] bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }
}
