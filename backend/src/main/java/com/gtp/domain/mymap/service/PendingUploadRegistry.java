package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.config.MyMapProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * 엑셀 미리보기로 올라와 확정을 기다리는 임시 파일 목록(단일 인스턴스 인메모리). 예전에는 확정하지 않으면 파일이
 * 영원히 남았고, 아무나 uploadId만 알면 확정할 수 있었다 — 이제 주인(ownerId)과 만료 시각을 함께 보관한다.
 */
@Slf4j
@Component
public class PendingUploadRegistry {

    /** @param headers 미리보기가 돌려준(정리된) 머리글 — 확정 때 컬럼 이름 검사에 쓴다 */
    public record Pending(String uploadId, String ownerId, Path file, Instant expiresAt,
                          List<String> headers, int totalRows, String fileHash) {
    }

    private static final Pattern ORPHAN_NAME = Pattern.compile("[0-9a-fA-F\\-]{36}\\.xlsx");

    private final Map<String, Pending> pending = new ConcurrentHashMap<>();
    private final MyMapProperties props;
    private final Clock clock;

    @Autowired
    public PendingUploadRegistry(MyMapProperties props) {
        this(props, Clock.systemDefaultZone());
    }

    public PendingUploadRegistry(MyMapProperties props, Clock clock) {
        this.props = props;
        this.clock = clock;
    }

    public Instant newExpiry() {
        return clock.instant().plus(Duration.ofMinutes(props.getUpload().getPreviewTtlMinutes()));
    }

    public void register(Pending p) {
        pending.put(p.uploadId(), p);
    }

    /** 있고, 만료 전이고, 올린 사람이 맞고, 파일이 남아 있을 때만. 그 밖에는 모두 "없음"으로 같게 답한다(존재 여부를 알려 주지 않는다). */
    public Optional<Pending> find(String uploadId, String ownerId) {
        if (uploadId == null || ownerId == null) return Optional.empty();
        Pending p = pending.get(uploadId);
        if (p == null || !p.ownerId().equals(ownerId)) return Optional.empty();
        if (!clock.instant().isBefore(p.expiresAt()) || !Files.exists(p.file())) return Optional.empty();
        return Optional.of(p);
    }

    /** 목록에서만 뺀다(파일은 가져오기 작업이 끝나며 지운다). */
    public void forget(String uploadId) {
        pending.remove(uploadId);
    }

    /** 만료된 항목과 그 파일을 지운다. @return 지운 항목 수 */
    public int sweepExpired() {
        int removed = 0;
        Instant now = clock.instant();
        for (Pending p : pending.values()) {
            if (now.isBefore(p.expiresAt())) continue;
            if (pending.remove(p.uploadId(), p)) {
                deleteQuietly(p.file());
                removed++;
            }
        }
        return removed;
    }

    /**
     * 서버 재시작 등으로 목록에서 사라진 채 폴더에 남은 임시 xlsx를 지운다. 가져오기가 아직 읽고 있는 파일을 지우지 않도록
     * TTL보다 훨씬 오래된(orphanFileMinutes) 것만. @return 지운 파일 수
     */
    public int sweepOrphans() {
        Path dir = Paths.get(props.getUploadDir());
        if (!Files.isDirectory(dir)) return 0;
        Instant cutoff = clock.instant().minus(Duration.ofMinutes(props.getUpload().getOrphanFileMinutes()));
        int removed = 0;
        try (DirectoryStream<Path> files = Files.newDirectoryStream(dir, "*.xlsx")) {
            for (Path f : files) {
                if (!ORPHAN_NAME.matcher(f.getFileName().toString()).matches()) continue;
                if (pending.values().stream().anyMatch(p -> p.file().equals(f))) continue;
                if (Files.getLastModifiedTime(f).toInstant().isBefore(cutoff)) {
                    deleteQuietly(f);
                    removed++;
                }
            }
        } catch (IOException e) {
            log.warn("[나만의지도] 임시 파일 폴더를 훑지 못했습니다: {}", e.getMessage());
        }
        return removed;
    }

    public int size() {
        return pending.size();
    }

    private static void deleteQuietly(Path f) {
        try {
            Files.deleteIfExists(f);
        } catch (IOException e) {
            log.warn("[나만의지도] 임시 파일 삭제 실패: {}", f.getFileName());
        }
    }
}
