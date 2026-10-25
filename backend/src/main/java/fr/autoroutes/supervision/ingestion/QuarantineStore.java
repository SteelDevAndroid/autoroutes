package fr.autoroutes.supervision.ingestion;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
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

    QuarantineStore(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /** Idempotent : un même eventId n'est stocké qu'une fois. */
    public void save(TollEvent event) {
        jdbc.sql("""
                        insert into quarantined_event (event_id, station_name, type, event_time, entry_station_name,
                                                       entry_time, vehicle_count, vehicle_class, simulated, anomalies,
                                                       anomaly_source)
                        values (:id, :station, :type, :eventTime, :entry, :entryTime, :count, :class, :simulated, cast(:anomalies as jsonb),
                                :source)
                        on conflict (event_id) do nothing""")
                .param("id", event.eventId())
                .param("station", event.stationName())
                .param("type", event.type().name())
                .param("eventTime", Timestamp.from(event.eventTime()))
                .param("entry", event.entryStationName())
                .param("entryTime", event.entryTime() == null ? null : Timestamp.from(event.entryTime()))
                .param("count", event.vehicleCount())
                .param("class", event.vehicleClass())
                .param("simulated", event.simulated())
                .param("anomalies", event.anomalies() == null ? null : json.writeValueAsString(event.anomalies()))
                .param("source", event.anomalySource())
                .update();
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
