package com.gtp.domain.mymap.util;

import com.gtp.domain.mymap.XlsxTestUtil;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 독립 QA가 찾은 H1(10MB 한도 안의 100만 행 xlsx 한 개로 백엔드 힙이 바닥남)의 재현 시험.
 * 옛 방식(XSSF DOM)은 이 파일을 열기만 해도 힙 약 950MB를 썼다. 지금은 스트리밍이라 힙을 64MB로 제한한 별도 JVM에서도 돈다.
 */
class HugeXlsxMemoryTest {

    static final int MILLION = 1_000_000;

    @TempDir
    static Path tmp;

    private static Path huge;

    private static synchronized Path hugeFile() throws IOException {
        if (huge == null) {
            huge = XlsxTestUtil.hugeRows(tmp.resolve("million.xlsx"), MILLION);
        }
        return huge;
    }

    private record Result(int exit, String out, long millis) {
    }

    /** 최대 힙을 제한한 새 JVM에서 HugeXlsxProbe를 돌린다. */
    private static Result probe(Path file, int limit, int heapMb) throws Exception {
        String java = ProcessHandle.current().info().command().orElse("java");
        ProcessBuilder pb = new ProcessBuilder(java, "-Xmx" + heapMb + "m", "-Dfile.encoding=UTF-8",
                "-cp", System.getProperty("java.class.path"), HugeXlsxProbe.class.getName(), file.toString(), String.valueOf(limit));
        pb.redirectErrorStream(true);
        long t0 = System.nanoTime();
        Process p = pb.start();
        byte[] out = p.getInputStream().readAllBytes();
        if (!p.waitFor(120, TimeUnit.SECONDS)) {
            p.destroyForcibly();
            throw new AssertionError("별도 JVM이 120초 안에 끝나지 않았습니다");
        }
        return new Result(p.exitValue(), new String(out, StandardCharsets.UTF_8).strip(), (System.nanoTime() - t0) / 1_000_000);
    }

    @Test
    void 만든_파일은_10MB_한도_안의_작은_파일이다() throws IOException {
        long size = Files.size(hugeFile());
        assertThat(size).isLessThan(10L * 1024 * 1024);
        System.out.println("[HugeXlsx] 100만 행 xlsx 크기 = " + size / 1024 + "KB");
    }

    @Test
    void 행_한도를_넘는_큰_파일은_힙_64MB에서도_바로_거절된다() throws Exception {
        Result r = probe(hugeFile(), 5000, 64);
        assertThat(r.out()).as(r.out()).startsWith("REJECTED");
        assertThat(r.out()).contains("rows=5001");   // 한도를 넘긴 행에서 멈췄다 — 100만 행을 읽지 않았다
        assertThat(r.exit()).isZero();
        assertThat(r.millis()).as("거절까지 걸린 시간(ms, JVM 시작 포함)").isLessThan(20_000);
    }

    @Test
    void 한도_검사_없이_읽어도_시트_행_상한에서_멈추고_힙_64MB로_돈다() throws Exception {
        // 행 수 한도를 안 거는 경로(가져오기 작업 등)도 시트에 행이 10만 개(MAX_SCAN_ROWS)를 넘으면 거절 — 100만 행을 끝까지 읽지 않는다
        Result r = probe(hugeFile(), 0, 64);
        assertThat(r.out()).as(r.out()).isEqualTo("REJECTED rows=" + (ExcelSheet.MAX_SCAN_ROWS - 1));
        assertThat(r.exit()).isZero();
    }
}
