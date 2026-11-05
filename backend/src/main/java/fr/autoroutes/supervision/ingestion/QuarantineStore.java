package fr.autoroutes.supervision.ingestion;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

/** Événements dont le nom de gare est inconnu : champs autorisés seulement, rejoués après mise à jour de la table d'alias. */
@Repository
public class QuarantineStore {

    public enum Status {
        PENDING,
        APPLIED,
        DUPLICATE,
        TOO_LATE
    }

    public record NameCount(String stationName, long events) {
    }

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final JdbcTemplate batches;

    QuarantineStore(JdbcClient jdbc, JsonMapper json, JdbcTemplate batches) {
        this.jdbc = jdbc;
        this.json = json;
        this.batches = batches;
    }

    /** Idempotent : un même eventId n'est stocké qu'une fois. */
    public void save(TollEvent event) {
        saveAll(List.of(event));
    }

    /** Lot idempotent : une reprise après une écriture partielle ne duplique pas les événements. */
    public void saveAll(List<TollEvent> events) {
        if (events.isEmpty()) return;
        var rows = events.stream().map(event -> new Object[] {
                event.eventId(), event.stationName(), event.type().name(), Timestamp.from(event.eventTime()),
                event.entryStationName(), event.entryTime() == null ? null : Timestamp.from(event.entryTime()),
                event.vehicleCount(), event.vehicleClass(), event.simulated(),
                event.anomalies() == null ? null : json.writeValueAsString(event.anomalies()), event.anomalySource()
        }).toList();
        batches.batchUpdate("""
                insert into quarantined_event (event_id, station_name, type, event_time, entry_station_name,
                                               entry_time, vehicle_count, vehicle_class, simulated, anomalies, anomaly_source)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as jsonb), ?)
                on conflict (event_id) do nothing""", rows);
    }

    public List<TollEvent> pending(int limit) {
        return jdbc.sql("""
                        select event_id, station_name, type, event_time, entry_station_name, entry_time,
                               vehicle_count, vehicle_class, simulated, anomalies, anomaly_source
                        from quarantined_event where status = 'PENDING' order by received_at limit :limit""")
                .param("limit", limit)
                .query((rs, row) -> new TollEvent(
                        rs.getString("event_id"),
                        rs.getString("station_name"),
                        EventType.valueOf(rs.getString("type")),
                        rs.getTimestamp("event_time").toInstant(),
                        rs.getString("entry_station_name"),
                        instant(rs.getTimestamp("entry_time")),
                        rs.getInt("vehicle_count"),
                        (Integer) rs.getObject("vehicle_class"),
                        rs.getBoolean("simulated"),
                        readAnomalies(rs.getString("anomalies")),
                        rs.getString("anomaly_source")))
                .list();
    }

    public void markProcessed(String eventId, Status status) {
        jdbc.sql("update quarantined_event set status = :status, processed_at = now() where event_id = :id and status = 'PENDING'")
                .param("status", status.name())
                .param("id", eventId)
                .update();
    }

    public long countPending() {
        return jdbc.sql("select count(*) from quarantined_event where status = 'PENDING'").query(Long.class).single();
    }

    public List<NameCount> topPendingNames(int limit) {
        return jdbc.sql("""
                        select station_name, count(*) as events from quarantined_event where status = 'PENDING'
                        group by station_name order by events desc, station_name limit :limit""")
                .param("limit", limit)
                .query(NameCount.class)
                .list();
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private List<StationAnomaly> readAnomalies(String value) {
        return value == null ? null : List.of(json.readValue(value, StationAnomaly[].class));
    }
}
