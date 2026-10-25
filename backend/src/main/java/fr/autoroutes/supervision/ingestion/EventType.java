package fr.autoroutes.supervision.ingestion;

public enum EventType {
    ENTRY,
    EXIT,
    /** Rapport d'anomalies seul (agent, supervision d'équipements) : aucun passage de véhicule. */
    ANOMALY_REPORT;

    public boolean isPassage() {
        return this != ANOMALY_REPORT;
    }
}
