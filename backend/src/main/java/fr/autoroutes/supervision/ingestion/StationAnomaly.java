package fr.autoroutes.supervision.ingestion;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Objects;

/** Anomalie déclarée par la source : la cardinalité est indépendante des passages de véhicules. */
public record StationAnomaly(@JsonProperty("type_ano") String typeAno, int cardinalite, String criticite) {
    public static final int MAX_ITEMS = 100;
    public static final int MAX_TEXT = 256;

    public StationAnomaly {
        Objects.requireNonNull(typeAno, "type_ano");
        Objects.requireNonNull(criticite, "criticite");
        if (typeAno.isBlank() || typeAno.length() > MAX_TEXT || criticite.isBlank()
                || criticite.length() > MAX_TEXT || cardinalite < 0) {
            throw new IllegalArgumentException("Anomalie de gare invalide");
        }
        typeAno = typeAno.strip();
        criticite = criticite.strip();
    }
}
