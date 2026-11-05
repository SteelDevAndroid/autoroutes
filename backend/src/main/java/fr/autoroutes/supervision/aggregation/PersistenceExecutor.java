package fr.autoroutes.supervision.aggregation;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** FIFO bornée : la saturation ralentit l'écrivain, sans exécuter les tâches hors ordre sur son thread. */
final class PersistenceExecutor extends ThreadPoolExecutor {

    PersistenceExecutor(int capacity) {
        super(1, 1, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(capacity),
                Thread.ofPlatform().name("aggregation-persistence").factory(), (task, executor) -> {
                    try {
                        while (!executor.isShutdown()) {
                            if (executor.getQueue().offer(task, 1, TimeUnit.SECONDS)) {
                                if (executor.isShutdown() && executor.remove(task)) {
                                    throw new RejectedExecutionException("Persistance arrêtée pendant l'attente");
                                }
                                return;
                            }
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new RejectedExecutionException("Attente de persistance interrompue", e);
                    }
                    throw new RejectedExecutionException("Persistance arrêtée");
                });
    }
}
