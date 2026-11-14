package fr.autoroutes.supervision.ingestion;

/**
 * Événement validé transmis à l'agrégation.
 *
 * @param replay     vrai pour un événement sorti de quarantaine (pas de position Kafka associée)
 * @param provenance valeur de l'en-tête {@code x-provenance} du message d'origine (par exemple {@code simulated}) ; {@code null} si absente
 */
public record IncomingEvent(int partition, long offset, TollEvent event, boolean replay, String provenance) {

    public IncomingEvent(int partition, long offset, TollEvent event, boolean replay) {
        this(partition, offset, event, replay, null);
    }

    public static IncomingEvent fromKafka(int partition, long offset, TollEvent event) {
        return new IncomingEvent(partition, offset, event, false);
    }

    public static IncomingEvent fromKafka(int partition, long offset, TollEvent event, String provenance) {
        return new IncomingEvent(partition, offset, event, false, provenance);
    }

    public static IncomingEvent fromQuarantine(TollEvent event) {
        return new IncomingEvent(-1, -1, event, true);
    }
}
