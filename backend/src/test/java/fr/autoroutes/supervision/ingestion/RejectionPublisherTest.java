package fr.autoroutes.supervision.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class RejectionPublisherTest {

    @Test
    void laValeurDuRejetEstUnJsonValideQuiPorteLeMotifEtLaProvenance() {
        var value = RejectionPublisher.describe(2, 41L, "evt\"1", RejectReason.values()[0], "eventTime", "simulated");

        var json = JsonMapper.builder().build().readTree(value);
        assertThat(json.path("failure_reason").asString()).isEqualTo(RejectReason.values()[0].name());
        assertThat(json.path("provenance").asString()).isEqualTo("simulated");
        assertThat(json.path("eventId").asString()).isEqualTo("evt\"1");
        assertThat(json.path("sourceOffset").asLong()).isEqualTo(41L);
    }

    @Test
    void sansProvenanceNiChampLaValeurResteValide() {
        var value = RejectionPublisher.describe(0, 0L, null, RejectReason.values()[0], null, null);

        var json = JsonMapper.builder().build().readTree(value);
        assertThat(json.has("provenance")).isFalse();
        assertThat(json.has("field")).isFalse();
    }
}
