package com.gtp.domain.mymap.config;

import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 엑셀 가져오기 전용 스레드 풀(기본 2개, 대기 20건). 가득 차면 {@link RejectedExecutionException}.
 *
 * {@code Executor}/{@code TaskExecutor} 타입의 빈으로 내놓지 않는다: 그런 빈이 하나라도 있으면 Boot의
 * {@code applicationTaskExecutor}가 사라지고, 다른 도메인의 {@code @Async}(shp·GeoTIFF 처리)가 이 작은 풀을 같이 쓰게 된다.
 * 그래서 {@code @Async} 대신 이 상자의 {@link #submit}으로 직접 맡긴다 — 호출하는 쪽(UserMapUploadService)이
 * UserMap을 먼저 커밋한 뒤 submit하는 순서는 {@code @Async} 규칙과 같다(트랜잭션 안에서 부르지 않는다).
 */
public class MyMapImportExecutor implements AutoCloseable {

    private final ThreadPoolExecutor pool;

    public MyMapImportExecutor(int poolSize, int queueCapacity) {
        AtomicInteger seq = new AtomicInteger();
        this.pool = new ThreadPoolExecutor(poolSize, poolSize, 60, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(queueCapacity),
                r -> {
                    Thread t = new Thread(r, "mymap-import-" + seq.incrementAndGet());
                    t.setDaemon(true);
                    return t;
                },
                new ThreadPoolExecutor.AbortPolicy());
        this.pool.allowCoreThreadTimeOut(true);
    }

    /** @throws RejectedExecutionException 대기열까지 가득 찼을 때 */
    public void submit(Runnable task) {
        pool.execute(task);
    }

    @Override
    public void close() {
        pool.shutdown();
        try {
            if (!pool.awaitTermination(5, TimeUnit.SECONDS)) pool.shutdownNow();
        } catch (InterruptedException e) {
            pool.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}
