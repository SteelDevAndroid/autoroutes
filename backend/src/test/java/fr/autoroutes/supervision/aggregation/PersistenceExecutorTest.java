package fr.autoroutes.supervision.aggregation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class PersistenceExecutorTest {

    @Test
    void saturationBlocksAdmissionWithoutLosingOrReorderingCheckpointTasks() throws Exception {
        var release = new CountDownLatch(1);
        var started = new CountDownLatch(1);
        var submitted = new CountDownLatch(1);
        var order = new CopyOnWriteArrayList<Integer>();
        try (var executor = new PersistenceExecutor(1)) {
            try {
                executor.execute(() -> {
                    started.countDown();
                    try { release.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                    order.add(1);
                });
                assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
                executor.execute(() -> order.add(2));
                var producer = Thread.ofVirtual().start(() -> {
                    executor.execute(() -> order.add(3));
                    submitted.countDown();
                });
                assertThat(submitted.await(100, TimeUnit.MILLISECONDS)).isFalse();
                assertThat(executor.getQueue()).hasSize(1);
                assertThat(order).isEmpty();
                release.countDown();
                producer.join(Duration.ofSeconds(2));
                assertThat(producer.isAlive()).isFalse();
                executor.submit(() -> { }).get(2, TimeUnit.SECONDS);
                assertThat(order).isEqualTo(List.of(1, 2, 3));
            } finally {
                release.countDown();
            }
        }
    }

    @Test
    void shutdownRejectsInsteadOfSilentlyDroppingWork() {
        var executor = new PersistenceExecutor(1);
        executor.shutdown();
        assertThatThrownBy(() -> executor.execute(() -> { })).isInstanceOf(RejectedExecutionException.class);
    }
}
