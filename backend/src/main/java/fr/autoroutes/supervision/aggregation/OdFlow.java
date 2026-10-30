package fr.autoroutes.supervision.aggregation;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** Flux origine → destination OBSERVÉ (sortie en système fermé portant la gare d'entrée). */
public record OdFlow(String originId, String destinationId, long vehicles,
                     @JsonInclude(JsonInclude.Include.NON_NULL) EstimatedRoute route) {

    public OdFlow(String originId, String destinationId, long vehicles) {
        this(originId, destinationId, vehicles, null);
    }

    /** Le volume reste observé ; seul cet itinéraire est estimé, selon le graphe courant. */
    public record EstimatedRoute(String nature, String graphVersion, String algorithm, List<List<Double>> coordinates) {
        public EstimatedRoute {
            coordinates = coordinates.stream().map(List::copyOf).toList();
        }
    }
}
