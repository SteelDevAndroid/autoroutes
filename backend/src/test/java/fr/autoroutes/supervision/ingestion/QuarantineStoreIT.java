package fr.autoroutes.supervision.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.json.JsonMapper;

@Testcontainers
class QuarantineStoreIT {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    @Test
    void migrationsAndQuarantinePreserveUnknownEmptyAndReportedAnomalies() {
        var dataSource = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(dataSource).load().migrate();
        var store = new QuarantineStore(JdbcClient.create(dataSource), JsonMapper.builder().build());
        var at = Instant.parse("2026-10-22T08:00:00Z");
        var report = List.of(new StationAnomaly("Paiement", 4, "Critique"));
        store.save(new TollEvent("unknown", "Gare inconnue", EventType.ENTRY, at, null, null, 1, null, false));
        store.save(new TollEvent("empty", "Gare inconnue", EventType.ENTRY, at, null, null, 1, null, false, List.of()));
        store.save(new TollEvent("reported", "Gare inconnue", EventType.ENTRY, at, null, null, 1, null, false, report));
        store.save(new TollEvent("reported", "Gare inconnue", EventType.ENTRY, at, null, null, 1, null, false, List.of()));
        var events = store.pending(10);
        assertThat(events).hasSize(3);
        assertThat(events).filteredOn(e -> e.eventId().equals("unknown")).singleElement().satisfies(e -> assertThat(e.anomalies()).isNull());
        assertThat(events).filteredOn(e -> e.eventId().equals("empty")).singleElement().satisfies(e -> assertThat(e.anomalies()).isEmpty());
        assertThat(events).filteredOn(e -> e.eventId().equals("reported")).singleElement().satisfies(e -> assertThat(e.anomalies()).isEqualTo(report));
    }
}
