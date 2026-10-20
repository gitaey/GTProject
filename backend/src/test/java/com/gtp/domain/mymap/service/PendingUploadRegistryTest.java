package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.service.PendingUploadRegistry.Pending;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class PendingUploadRegistryTest {

    /** 시험에서 시간을 직접 흘려보내는 시계 */
    static class TestClock extends Clock {
        Instant now = Instant.parse("2026-10-19T00:00:00Z");

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }

        void advance(Duration d) {
            now = now.plus(d);
        }
    }

    @TempDir
    Path dir;
    TestClock clock;
    MyMapProperties props;
    PendingUploadRegistry registry;

    @BeforeEach
    void setUp() {
        clock = new TestClock();
        props = new MyMapProperties();
        props.setUploadDir(dir.toString());
        registry = new PendingUploadRegistry(props, clock);
    }

    private Pending register(String owner) throws IOException {
        String id = UUID.randomUUID().toString();
        Path f = Files.createFile(dir.resolve(id + ".xlsx"));
        Pending p = new Pending(id, owner, f, registry.newExpiry(), List.of("h"), 3, "hash");
        registry.register(p);
        return p;
    }

    @Test
    void 주인만_찾을_수_있다() throws IOException {
        Pending p = register("alice");
        assertThat(registry.find(p.uploadId(), "alice")).contains(p);
        assertThat(registry.find(p.uploadId(), "bob")).isEmpty();
        assertThat(registry.find(p.uploadId(), null)).isEmpty();
        assertThat(registry.find(null, "alice")).isEmpty();
        assertThat(registry.find("없는-id", "alice")).isEmpty();
    }

    @Test
    void 만료되면_찾을_수_없다_30분이_기준() throws IOException {
        Pending p = register("alice");
        clock.advance(Duration.ofMinutes(29));
        assertThat(registry.find(p.uploadId(), "alice")).isPresent();
        clock.advance(Duration.ofMinutes(1)); // 정확히 30분 = 만료
        assertThat(registry.find(p.uploadId(), "alice")).isEmpty();
    }

    @Test
    void 파일이_사라졌으면_찾을_수_없다() throws IOException {
        Pending p = register("alice");
        Files.delete(p.file());
        assertThat(registry.find(p.uploadId(), "alice")).isEmpty();
    }

    @Test
    void 만료_정리는_목록과_파일을_함께_지우고_안_만료된_것은_둔다() throws IOException {
        Pending old = register("alice");
        clock.advance(Duration.ofMinutes(20));
        Pending fresh = register("bob");
        clock.advance(Duration.ofMinutes(15)); // old 35분, fresh 15분

        assertThat(registry.sweepExpired()).isEqualTo(1);
        assertThat(Files.exists(old.file())).isFalse();
        assertThat(Files.exists(fresh.file())).isTrue();
        assertThat(registry.size()).isEqualTo(1);
        assertThat(registry.find(fresh.uploadId(), "bob")).isPresent();
    }

    @Test
    void forget은_목록에서만_빼고_파일은_둔다() throws IOException {
        Pending p = register("alice");
        registry.forget(p.uploadId());
        assertThat(registry.find(p.uploadId(), "alice")).isEmpty();
        assertThat(Files.exists(p.file())).isTrue();
    }

    @Test
    void 주인_잃은_임시_xlsx는_오래된_것만_지운다() throws IOException {
        Pending live = register("alice");   // 목록에 있는 파일
        Path orphanOld = Files.createFile(dir.resolve(UUID.randomUUID() + ".xlsx"));
        Path orphanNew = Files.createFile(dir.resolve(UUID.randomUUID() + ".xlsx"));
        Path other = Files.createFile(dir.resolve("notes.xlsx"));            // 우리 파일 이름이 아님
        Path shp = Files.createFile(dir.resolve(UUID.randomUUID() + ".shp")); // xlsx가 아님
        FileTime tooOld = FileTime.from(clock.instant().minus(Duration.ofMinutes(props.getUpload().getOrphanFileMinutes() + 5)));
        FileTime recent = FileTime.from(clock.instant().minus(Duration.ofMinutes(props.getUpload().getOrphanFileMinutes() - 5)));
        Files.setLastModifiedTime(orphanOld, tooOld);
        Files.setLastModifiedTime(live.file(), tooOld);
        Files.setLastModifiedTime(other, tooOld);
        Files.setLastModifiedTime(shp, tooOld);
        Files.setLastModifiedTime(orphanNew, recent);

        assertThat(registry.sweepOrphans()).isEqualTo(1);
        assertThat(Files.exists(orphanOld)).isFalse();
        assertThat(Files.exists(orphanNew)).isTrue();     // 처리 중일 수 있어 최근 파일은 둔다
        assertThat(Files.exists(live.file())).isTrue();   // 목록에 있는 파일은 오래돼도 둔다
        assertThat(Files.exists(other)).isTrue();
        assertThat(Files.exists(shp)).isTrue();
    }

    @Test
    void 폴더가_없어도_정리가_죽지_않는다() {
        props.setUploadDir(dir.resolve("없는폴더").toString());
        assertThat(registry.sweepOrphans()).isZero();
    }

    @Test
    void 새_만료시각은_설정한_분만큼_뒤() {
        props.getUpload().setPreviewTtlMinutes(7);
        assertThat(registry.newExpiry()).isEqualTo(clock.instant().plus(Duration.ofMinutes(7)));
    }
}
