package fr.autoroutes.simulator;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Incidents d'équipement SIMULÉS, persistants par gare logique : chaque rapport fait évoluer l'état de la gare
 * (ouverture d'une occurrence, résolutions) puis le déclare en entier, conformément au contrat {@code anomalies}
 * (état complet remplacé à chaque rapport, {@code []} = aucune anomalie). Non thread-safe : appelé par le seul
 * fil d'émission, comme {@link EventFactory}.
 */
final class StationIncidents {

    /** Élément du rapport, sérialisé avec les noms exacts du contrat. */
    record Anomaly(@JsonProperty("type_ano") String typeAno, int cardinalite, String criticite) {
    }

    /** @param weight fréquence relative d'apparition : les pannes critiques sont plus rares */
    record Kind(String typeAno, String criticite, int weight) {
    }

    static final List<Kind> CATALOG = List.of(
            new Kind("Défaut d'imprimante de ticket (voie manuelle)", "Faible", 8),
            new Kind("Interphone d'assistance hors service", "Faible", 6),
            new Kind("Voie fermée pour maintenance préventive", "Faible", 5),
            new Kind("Panne de lecteur de badge télépéage (setBadge)", "Moyenne", 6),
            new Kind("Défaut de lecture de carte bancaire", "Moyenne", 5),
            new Kind("Capteur de classification des véhicules en défaut", "Moyenne", 4),
            new Kind("Barrière de péage bloquée en position ouverte", "Haute", 3),
            new Kind("Coupure d'alimentation électrique d'une voie", "Haute", 2),
            new Kind("Erreur de communication avec le serveur central de paiement", "Critique", 1));

    private static final int TOTAL_WEIGHT = CATALOG.stream().mapToInt(Kind::weight).sum();

    private final Random random;
    private final double openRate;
    private final double resolveRate;
    private final Map<String, Map<Kind, Integer>> byStation = new HashMap<>();

    StationIncidents(Random random, double openRate, double resolveRate) {
        this.random = random;
        this.openRate = openRate;
        this.resolveRate = resolveRate;
    }

    /** Fait évoluer l'état de la gare puis renvoie son rapport complet, trié par gravité décroissante. */
    List<Anomaly> report(String stationId) {
        var active = byStation.computeIfAbsent(stationId, id -> new LinkedHashMap<>());
        active.replaceAll((kind, count) -> random.nextDouble() < resolveRate ? count - 1 : count);
        active.values().removeIf(count -> count <= 0);
        if (random.nextDouble() < openRate) {
            active.merge(pickKind(), 1, Integer::sum);
        }
        if (active.isEmpty()) {
            byStation.remove(stationId);
        }
        return active.entrySet().stream()
                .sorted(Map.Entry.comparingByKey((a, b) -> Integer.compare(CATALOG.indexOf(b), CATALOG.indexOf(a))))
                .map(e -> new Anomaly(e.getKey().typeAno(), e.getValue(), e.getKey().criticite()))
                .toList();
    }

    int stationsWithIncidents() {
        return byStation.size();
    }

    private Kind pickKind() {
        var target = random.nextInt(TOTAL_WEIGHT);
        for (var kind : CATALOG) {
            target -= kind.weight();
            if (target < 0) {
                return kind;
            }
        }
        throw new IllegalStateException("Catalogue vide");
    }
}
