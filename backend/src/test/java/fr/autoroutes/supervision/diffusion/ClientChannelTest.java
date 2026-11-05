package fr.autoroutes.supervision.diffusion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class ClientChannelTest {

    @Test
    void completionReleasesAnIdleWorkerAndRemovesTheClientExactlyOnce() throws Exception {
        var emitter = mock(SseEmitter.class);
        var completion = new AtomicReference<Runnable>();
        var timeout = new AtomicReference<Runnable>();
        doAnswer(call -> { completion.set(call.getArgument(0)); return null; }).when(emitter).onCompletion(any());
        doAnswer(call -> { timeout.set(call.getArgument(0)); return null; }).when(emitter).onTimeout(any());
        var removed = new AtomicInteger();
        var channel = new ClientChannel(emitter, 2, new StreamFrame("resync", null, "{}"), c -> removed.incrementAndGet());
        var worker = channel.start();
        // Attendre le blocage réel sur la file vide, plutôt que fermer avant que le thread n'ait commencé.
        var deadline = System.nanoTime() + Duration.ofSeconds(2).toNanos();
        while (worker.getState() != Thread.State.WAITING && System.nanoTime() < deadline) {
            java.util.concurrent.locks.LockSupport.parkNanos(1_000_000);
        }
        assertThat(worker.getState()).isEqualTo(Thread.State.WAITING);
        completion.get().run();
        timeout.get().run();
        worker.join(Duration.ofSeconds(2));

        assertThat(worker.isAlive()).isFalse();
        assertThat(channel.isOpen()).isFalse();
        assertThat(removed.get()).isEqualTo(1);
    }

    @Test
    void aClientClosedBeforeStartDoesNotLaunchAWorker() {
        var emitter = mock(SseEmitter.class);
        var completion = new AtomicReference<Runnable>();
        doAnswer(call -> { completion.set(call.getArgument(0)); return null; }).when(emitter).onCompletion(any());
        var channel = new ClientChannel(emitter, 2, new StreamFrame("resync", null, "{}"), c -> { });
        completion.get().run();
        assertThat(channel.start().getState()).isEqualTo(Thread.State.NEW);
        assertThat(channel.offer(new StreamFrame("delta", "1", "{}"))).isFalse();
    }
}
