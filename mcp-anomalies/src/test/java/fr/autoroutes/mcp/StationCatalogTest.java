package fr.autoroutes.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class StationCatalogTest {

    private static final StationCatalog CATALOG = StationCatalog.load(
            Path.of("../referentiel/alias-gares.csv"), Path.of("../referentiel/gares-logiques-proposition.csv"));

    @Test
    void loadsEveryLogicalStationOfTheAliasTable() {
        assertThat(CATALOG.size()).isGreaterThan(600);
    }

    @Test
    void findsByIdOrByAliasIgnoringAccentsCaseAndPunctuation() {
        assertThat(CATALOG.find("gl-bpv-0054")).hasValueSatisfying(s -> assertThat(s.name()).isEqualTo("La Boisse"));
        assertThat(CATALOG.find("  LA   boïsse ")).hasValueSatisfying(s -> assertThat(s.id()).isEqualTo("GL-BPV-0054"));
        assertThat(CATALOG.find("La Boisse - Montluel")).hasValueSatisfying(s -> assertThat(s.id()).isEqualTo("GL-ECH-0365"));
        assertThat(CATALOG.find("Gare imaginaire")).isEmpty();
        assertThat(CATALOG.find(" ")).isEmpty();
    }

    @Test
    void publishedNameIsAnAliasSoTheBackendResolvesIt() {
        assertThat(CATALOG.find("GL-ECH-0139")).hasValueSatisfying(s -> {
            assertThat(s.aliases()).contains(s.name());
            assertThat(CATALOG.find(s.name())).contains(s);
        });
    }

    @Test
    void searchPutsTheExactMatchFirstAndIsBounded() {
        assertThat(CATALOG.search("La Boisse", 20)).first().extracting(StationCatalog.Station::id).isEqualTo("GL-BPV-0054");
        assertThat(CATALOG.search("boisse", 20)).extracting(StationCatalog.Station::id).contains("GL-BPV-0054", "GL-ECH-0365");
        assertThat(CATALOG.search("A0007", 5)).hasSize(5);
        assertThat(CATALOG.search("", 20)).isEmpty();
    }
}
