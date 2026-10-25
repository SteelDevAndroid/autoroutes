package fr.autoroutes.mcp;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Gares logiques et noms acceptés par le backend (table d'alias du référentiel). Un nom inconnu du backend partirait
 * en quarantaine sans que l'agent le sache : il est refusé ici, avant publication. Immuable, partagé entre requêtes.
 */
public final class StationCatalog {

    /** @param name nom publié dans l'événement : premier alias de la gare, reconnu par le backend */
    public record Station(String id, String label, String name, List<String> aliases, List<String> axes) {
    }

    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");
    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");

    private final List<Station> stations;
    private final Map<String, Station> byId = new HashMap<>();
    private final Map<String, Station> byName = new HashMap<>();

    StationCatalog(List<Station> stations) {
        this.stations = List.copyOf(stations);
        for (var station : this.stations) {
            byId.put(station.id().toUpperCase(Locale.ROOT), station);
            station.aliases().forEach(alias -> byName.put(normalize(alias), station));
        }
    }

    public static StationCatalog load(Path aliasesFile, Path stationsFile) {
        var aliases = new LinkedHashMap<String, List<String>>();
        lines(aliasesFile).stream().skip(1).filter(l -> !l.isBlank()).map(l -> l.split(";", -1))
                .forEach(c -> aliases.computeIfAbsent(c[1].strip(), id -> new ArrayList<>()).add(c[0].strip()));
        var rows = lines(stationsFile);
        var header = Arrays.asList(rows.getFirst().split(";", -1));
        var labels = new HashMap<String, String>();
        var axes = new HashMap<String, LinkedHashSet<String>>();
        rows.stream().skip(1).filter(l -> !l.isBlank()).map(l -> l.split(";", -1)).forEach(c -> {
            var id = c[header.indexOf("gareLogiqueId")];
            labels.putIfAbsent(id, c[header.indexOf("nomGare")].strip());
            axes.computeIfAbsent(id, k -> new LinkedHashSet<>()).add(c[header.indexOf("axe")].strip());
        });
        return new StationCatalog(aliases.entrySet().stream()
                .map(e -> new Station(e.getKey(), labels.getOrDefault(e.getKey(), e.getValue().getFirst()), e.getValue().getFirst(),
                        List.copyOf(e.getValue()), List.copyOf(axes.getOrDefault(e.getKey(), new LinkedHashSet<>()))))
                .toList());
    }

    /** Identifiant de gare logique ({@code GL-…}) ou nom d'alias, sans tenir compte des accents, de la casse ni de la ponctuation. */
    public Optional<Station> find(String idOrName) {
        if (idOrName == null || idOrName.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(byId.get(idOrName.strip().toUpperCase(Locale.ROOT)))
                .or(() -> Optional.ofNullable(byName.get(normalize(idOrName))));
    }

    /** Gares dont l'identifiant, le libellé, un alias ou un axe contient le texte ; les correspondances exactes d'abord. */
    public List<Station> search(String text, int limit) {
        var query = normalize(text == null ? "" : text);
        if (query.isEmpty()) {
            return List.of();
        }
        var exact = find(text).stream();
        var partial = stations.stream().filter(s -> matches(s, query));
        return Stream.concat(exact, partial).distinct().limit(limit).toList();
    }

    public int size() {
        return stations.size();
    }

    private static boolean matches(Station station, String query) {
        return normalize(station.id()).contains(query) || normalize(station.label()).contains(query)
                || station.aliases().stream().anyMatch(a -> normalize(a).contains(query))
                || station.axes().stream().anyMatch(a -> normalize(a).contains(query));
    }

    /** Même normalisation que le rapprochement du backend ({@code StationNames}). */
    static String normalize(String name) {
        var decomposed = Normalizer.normalize(name, Normalizer.Form.NFKD);
        var lower = DIACRITICS.matcher(decomposed).replaceAll("").toLowerCase(Locale.ROOT);
        return NON_ALNUM.matcher(lower).replaceAll(" ").strip();
    }

    private static List<String> lines(Path file) {
        try {
            return Files.readAllLines(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Lecture impossible : " + file, e);
        }
    }
}
