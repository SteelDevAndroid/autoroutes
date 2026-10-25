package fr.autoroutes.mcp;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.List;

/** Backend factice : sert un détail de gare fixé par le test et note l'en-tête Authorization reçu. */
final class FakeBackend implements AutoCloseable {

    private final HttpServer server;
    private volatile String stationDetail = "{\"station\":{},\"metrics\":null}";
    private volatile int status = 200;
    final List<String> authorizations = new CopyOnWriteArrayList<>();

    FakeBackend() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        server.createContext("/api/v1/stations/", exchange -> {
            var authorization = exchange.getRequestHeaders().getFirst("Authorization");
            authorizations.add(authorization == null ? "" : authorization);
            var body = stationDetail.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
    }

    String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    /** @param sourcesJson tableau {@code anomalySources} tel que publié par le backend */
    void respond(String sourcesJson) {
        status = 200;
        stationDetail = "{\"station\":{\"id\":\"GL-BPV-0054\"},\"metrics\":{\"stationId\":\"GL-BPV-0054\",\"anomalySources\":" + sourcesJson + "}}";
    }

    void fail(int status) {
        this.status = status;
        stationDetail = "{}";
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
