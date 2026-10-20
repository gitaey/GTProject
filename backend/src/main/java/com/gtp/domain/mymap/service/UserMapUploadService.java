package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.dto.*;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.model.ImportMode;
import com.gtp.domain.mymap.port.AddressResolver;
import com.gtp.domain.mymap.port.Coverage;
import com.gtp.domain.mymap.port.PnuParcelProvider;
import com.gtp.domain.mymap.repository.UserMapRepository;
import com.gtp.domain.mymap.util.*;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;

/**
 * shp·엑셀 업로드 접수. 파일 검사·한도·미리보기·확정까지만 하고 실제 처리는 비동기로 넘긴다.
 *
 * 주의: 이 클래스의 메서드에 @Transactional을 걸면 안 된다 — UserMap 행이 커밋되기 전에 처리 작업(비동기 스레드)이
 * 먼저 그 행을 조회하면 빈 값을 받는다(옛 confirmExcel의 @Transactional이 이 구조였고, 엑셀이 동기 처리이기도 했다).
 * userMapRepository.save()는 트랜잭션 없이도 자체 커밋되므로, 작업을 넘기는 시점에는 항상 커밋된 상태다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserMapUploadService {

    static final String ADDRESS_UNSUPPORTED_MESSAGE = "주소 엑셀은 아직 지원하지 않습니다(지원 예정). PNU 또는 좌표 컬럼으로 올려 주세요.";
    private static final int PREVIEW_ROWS = 10;
    private static final int SUGGEST_ROWS = 50;
    private static final byte[] ZIP_MAGIC = {'P', 'K', 3, 4};
    private static final byte[] SHP_MAGIC = {0, 0, 0x27, 0x0a};
    private static final List<String> DEFAULT_SRID_OPTIONS = List.of("EPSG:5186", "EPSG:4326", "EPSG:5179", "EPSG:3857");

    private final UserMapRepository userMapRepository;
    private final UserMapProcessor userMapProcessor;
    private final UserMapImportJob importJob;
    private final PendingUploadRegistry pendingUploads;
    private final ImportGuard importGuard;
    private final PnuParcelProvider parcelProvider;
    private final AddressResolver addressResolver;
    private final MyMapProperties props;

    /** 동시에 미리보기(파일 훑기)를 할 수 있는 최대 수 — 전체와 사용자별(1) */
    private static final int PREVIEW_PARALLEL = 4;
    private final Semaphore previewSlots = new Semaphore(PREVIEW_PARALLEL);
    private final Set<String> previewing = ConcurrentHashMap.newKeySet();

    public List<String> supportedSrids() {
        return DEFAULT_SRID_OPTIONS;
    }

    // ---------- SHP 업로드 ----------

    public UserMapUploadResponse uploadShp(List<MultipartFile> files, String name, String description,
                                            String sourceSrid, String ownerId) {
        MultipartFile shp = null, shx = null, dbf = null, prj = null;
        for (MultipartFile f : files) {
            String n = f.getOriginalFilename();
            if (n == null) continue;
            String lower = n.toLowerCase();
            if (lower.endsWith(".shp")) shp = f;
            else if (lower.endsWith(".shx")) shx = f;
            else if (lower.endsWith(".dbf")) dbf = f;
            else if (lower.endsWith(".prj")) prj = f;
        }
        if (shp == null || dbf == null) {
            throw new CustomException(GisErrorCode.INVALID_SHP_FILE);
        }

        long totalBytes = files.stream().mapToLong(MultipartFile::getSize).sum();
        long limitBytes = (long) props.getLimits().getMaxShpMb() * 1024 * 1024;
        if (totalBytes > limitBytes) {
            throw GisErrorCode.MYMAP_FILE_TOO_LARGE.exception(props.getLimits().getMaxShpMb());
        }
        if (!startsWith(shp, SHP_MAGIC)) throw new CustomException(GisErrorCode.INVALID_SHP_FILE);
        assertLayerQuota(ownerId);
        // shp도 사용자당 동시 1건(엑셀 가져오기와 같은 자물쇠) — 겹치면 레이어 한도 +1 경쟁도 막는다
        if (!importGuard.tryAcquire(ownerId)) throw new CustomException(GisErrorCode.MYMAP_IMPORT_BUSY);
        boolean handedOver = false;   // true면 자물쇠는 처리 작업(processShp)이 푼다

        try {
            if (userMapRepository.countByOwnerIdAndStatus(ownerId, "PROCESSING") > 0) {
                throw new CustomException(GisErrorCode.MYMAP_IMPORT_BUSY);
            }
            Path dir = Paths.get(props.getUploadDir());
            Files.createDirectories(dir);
            String base = UUID.randomUUID().toString();
            Path shpPath = dir.resolve(base + ".shp");
            saveTo(shp, shpPath);
            if (shx != null) saveTo(shx, dir.resolve(base + ".shx"));
            saveTo(dbf, dir.resolve(base + ".dbf"));
            String resolvedSrid = sourceSrid != null && !sourceSrid.isBlank() ? sourceSrid : "EPSG:5186";
            if (prj != null) {
                saveTo(prj, dir.resolve(base + ".prj"));
                String detected = PrjParser.detect(new String(prj.getBytes(), java.nio.charset.StandardCharsets.UTF_8));
                if (detected != null) {
                    // .prj가 실제 정답이므로 사용자가 드롭다운에서 고른 값보다 우선한다
                    resolvedSrid = detected;
                } else {
                    log.warn("나만의지도(shp) .prj 좌표계 자동 인식 실패 — 사용자 선택값({})으로 진행", resolvedSrid);
                }
            }

            UserMap map = UserMap.builder()
                    .name(UserMap.clip(name != null && !name.isBlank() ? name : shp.getOriginalFilename(), 100))
                    .description(UserMap.clip(description, 300))
                    .ownerId(ownerId)
                    .sourceType("SHP")
                    .sourceKind("SHP")
                    .sourceSrid(resolvedSrid)
                    .build();
            UserMap saved = userMapRepository.save(map);

            userMapProcessor.processShp(saved.getId(), shpPath, saved.getSourceSrid(), ownerId);
            handedOver = true;

            return UserMapUploadResponse.builder()
                    .id(saved.getId()).name(saved.getName()).status(saved.getStatus()).build();
        } catch (IOException e) {
            throw new CustomException(GisErrorCode.FILE_UPLOAD_FAILED);
        } finally {
            if (!handedOver) importGuard.release(ownerId);
        }
    }

    private void saveTo(MultipartFile file, Path target) throws IOException {
        try (InputStream in = file.getInputStream()) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    // ---------- 엑셀 업로드 (미리보기 -> 방식·컬럼 선택 -> 확정) ----------

    public ExcelPreviewResponse previewExcel(MultipartFile file, String ownerId) {
        String name = file.getOriginalFilename();
        if (name == null || !name.toLowerCase().endsWith(".xlsx") || file.isEmpty()) {
            throw new CustomException(GisErrorCode.INVALID_EXCEL_FILE);
        }
        MyMapProperties.Limits lim = props.getLimits();
        if (file.getSize() > (long) lim.getMaxExcelMb() * 1024 * 1024) {
            throw GisErrorCode.MYMAP_FILE_TOO_LARGE.exception(lim.getMaxExcelMb());
        }
        if (!startsWith(file, ZIP_MAGIC)) throw new CustomException(GisErrorCode.INVALID_EXCEL_FILE);

        // 미리보기는 파일을 한 번 훑는다 — 한 사람이 동시에 여러 개, 또는 전체가 한꺼번에 몰려 서버를 붙잡지 못하게 막는다
        if (!previewing.add(ownerId)) throw new CustomException(GisErrorCode.MYMAP_IMPORT_BUSY);
        if (!previewSlots.tryAcquire()) {
            previewing.remove(ownerId);
            throw new CustomException(GisErrorCode.MYMAP_IMPORT_BUSY);
        }
        Path stored = null;
        try {
            Path dir = Paths.get(props.getUploadDir());
            Files.createDirectories(dir);
            String uploadId = UUID.randomUUID().toString();
            stored = dir.resolve(uploadId + ".xlsx");
            String hash = copyWithSha256(file, stored);

            ExcelPreviewResponse response = analyze(stored, uploadId, hash, ownerId);
            pendingUploads.register(new PendingUploadRegistry.Pending(uploadId, ownerId, stored,
                    pendingUploads.newExpiry(), response.getHeaders(), response.getTotalRows(), hash));
            return response;
        } catch (IOException e) {
            deleteQuietly(stored);
            throw new CustomException(GisErrorCode.FILE_UPLOAD_FAILED);
        } catch (RuntimeException e) {
            deleteQuietly(stored);
            throw e;
        } finally {
            previewSlots.release();
            previewing.remove(ownerId);
        }
    }

    /**
     * 시트를 스트리밍으로 한 번 읽으며 머리글·앞 10행·전체 행 수·추천을 모은다. 행 수가 가장 큰 모드 한도를 넘는 순간 거기서 읽기를 멈추고
     * MYMAP_ROW_LIMIT으로 거절한다(10MB 안의 100만 행 파일로 메모리를 쓰게 만들 수 없다). 메모리에는 샘플 행만 남는다.
     */
    private ExcelPreviewResponse analyze(Path stored, String uploadId, String hash, String ownerId) {
        MyMapProperties.Limits lim = props.getLimits();
        int hardLimit = Math.max(lim.getMaxRowsPnu(), Math.max(lim.getMaxRowsAddress(), lim.getMaxRowsCoord()));

        List<String> headers = new ArrayList<>();
        List<List<String>> sampleRows = new ArrayList<>();
        List<List<CellData>> suggestRows = new ArrayList<>();
        int[] total = {0};
        boolean[] numericPnu = {false};
        ExcelSheet.read(stored, headers::addAll, row -> {
            if (++total[0] > hardLimit) throw GisErrorCode.MYMAP_ROW_LIMIT.exception(hardLimit);
            if (sampleRows.size() < PREVIEW_ROWS) sampleRows.add(row.cells().stream().map(CellData::text).toList());
            if (suggestRows.size() < SUGGEST_ROWS) suggestRows.add(row.cells());
            if (!numericPnu[0] && ColumnSuggester.hasNumericPnuCell(row.cells())) numericPnu[0] = true;   // 앞 50행뿐 아니라 전체 행에서 찾는다
            return true;
        });

        ColumnSuggester.Result suggested = ColumnSuggester.suggest(headers, suggestRows);
        ExcelPreviewResponse.Suggestions sug = suggested.suggestions();

        List<ExcelPreviewResponse.Warning> warnings = new ArrayList<>();
        if (suggested.numericPnuCells() || numericPnu[0]) {
            warnings.add(warning("NUMERIC_PNU_CELLS",
                    "PNU가 숫자 서식으로 저장되어 뒤쪽 자리가 바뀌었을 수 있습니다. 엑셀에서 해당 컬럼을 텍스트 서식으로 바꾼 뒤 다시 올려 주세요."));
        }
        List<String> sameFile = userMapRepository.findAllByOwnerIdAndFileHashOrderByCreatedAtDesc(ownerId, hash).stream()
                .map(UserMap::getName).limit(3).toList();
        if (!sameFile.isEmpty()) {
            warnings.add(warning("DUPLICATE_FILE", "같은 파일을 이미 올린 레이어가 있습니다: " + String.join(", ", sameFile)));
        }
        ImportMode suggestedMode = sug.getMode() == null ? null : ImportMode.parse(sug.getMode());
        int limit = suggestedMode != null ? props.maxRowsFor(suggestedMode)
                : Math.min(lim.getMaxRowsPnu(), Math.min(lim.getMaxRowsAddress(), lim.getMaxRowsCoord()));
        if (total[0] > limit) {
            warnings.add(warning("OVER_LIMIT", "데이터가 " + total[0] + "행으로 한도(" + limit + "행)를 넘습니다. 나누어 올려 주세요."));
        }

        return ExcelPreviewResponse.builder()
                .uploadId(uploadId)
                .headers(headers)
                .sampleRows(sampleRows)
                .totalRows(total[0])
                .suggestions(sug)
                .limits(ExcelPreviewResponse.Limits.builder()
                        .pnu(lim.getMaxRowsPnu()).address(lim.getMaxRowsAddress()).coord(lim.getMaxRowsCoord()).build())
                .warnings(warnings)
                .build();
    }

    private static ExcelPreviewResponse.Warning warning(String code, String message) {
        return ExcelPreviewResponse.Warning.builder().code(code).message(message).build();
    }

    /**
     * 확정: 검사를 통과하면 UserMap(PROCESSING)을 저장(커밋)하고 가져오기 작업을 풀에 맡긴 뒤 곧바로 돌아온다.
     * 처리 결과는 목록·상태 API의 진행률과 보고서로 본다.
     */
    public UserMapUploadResponse confirmExcel(ExcelConfirmRequest req, String ownerId) {
        PendingUploadRegistry.Pending pending = pendingUploads.find(req.getUploadId(), ownerId)
                .orElseThrow(() -> new CustomException(GisErrorCode.EXCEL_UPLOAD_NOT_FOUND));

        ImportMode mode = ImportMode.parse(req.getMode());
        if (mode == null) throw new CustomException(GisErrorCode.MYMAP_MODE_UNSUPPORTED, "지원하지 않는 업로드 방식입니다: " + req.getMode());
        if (mode == ImportMode.ADDRESS && !addressResolver.supported()) {
            throw new CustomException(GisErrorCode.MYMAP_MODE_UNSUPPORTED, ADDRESS_UNSUPPORTED_MESSAGE);
        }

        int maxRows = props.maxRowsFor(mode);
        if (pending.totalRows() > maxRows) throw GisErrorCode.MYMAP_ROW_LIMIT.exception(maxRows);

        String srid = "EPSG:4326";
        switch (mode) {
            case PNU -> requireColumn(pending, req.getPnuColumn(), mode);
            case COORD -> {
                if (!pending.headers().contains(req.getLatColumn()) || !pending.headers().contains(req.getLonColumn())) {
                    throw new CustomException(GisErrorCode.INVALID_COORDINATE_COLUMN);
                }
                srid = req.getSourceSrid() != null && !req.getSourceSrid().isBlank() ? req.getSourceSrid().trim() : "EPSG:5186";
                try {
                    CoordinateTransformUtil.buildTransform(srid);
                } catch (IllegalArgumentException e) {
                    throw GisErrorCode.MYMAP_SRID_UNSUPPORTED.exception(srid);
                }
            }
            default -> throw new CustomException(GisErrorCode.MYMAP_MODE_UNSUPPORTED);
        }
        String expectedVersion = null;
        if (mode == ImportMode.PNU) {
            Coverage coverage = parcelProvider.coverage();
            if (!coverage.available()) throw new CustomException(GisErrorCode.MYMAP_REF_UNAVAILABLE);
            expectedVersion = coverage.parcelVersion();
        }

        assertLayerQuota(ownerId);
        if (!importGuard.tryAcquire(ownerId)) throw new CustomException(GisErrorCode.MYMAP_IMPORT_BUSY);
        UserMap saved = null;
        boolean submitted = false;
        try {
            if (userMapRepository.countByOwnerIdAndStatus(ownerId, "PROCESSING") > 0) {
                throw new CustomException(GisErrorCode.MYMAP_IMPORT_BUSY);
            }
            saved = userMapRepository.save(UserMap.builder()
                    .name(UserMap.clip(req.getName() != null && !req.getName().isBlank() ? req.getName().strip() : "엑셀 업로드", 100))
                    .description(UserMap.clip(req.getDescription(), 300))
                    .ownerId(ownerId)
                    .sourceType("EXCEL")
                    .sourceKind(mode.sourceKind())
                    .sourceSrid(srid)
                    .progressTotal(pending.totalRows())
                    .fileHash(pending.fileHash())
                    .build());

            importJob.submit(new UserMapImportJob.Request(saved.getId(), ownerId, mode, pending.file(), pending.totalRows(),
                    req.getPnuColumn(), req.getLatColumn(), req.getLonColumn(), srid));
            submitted = true;
            pendingUploads.forget(pending.uploadId());
            return UserMapUploadResponse.builder().id(saved.getId()).name(saved.getName()).status(saved.getStatus())
                    .parcelVersion(expectedVersion).build();
        } finally {
            if (!submitted) {
                importGuard.release(ownerId);
                if (saved != null) {
                    try {
                        userMapRepository.deleteById(saved.getId()); // 작업이 시작되지 못했으니 빈 레이어를 남기지 않는다
                    } catch (RuntimeException e) {
                        log.error("[나만의지도] 시작하지 못한 레이어 정리 실패 id={}", saved.getId(), e);
                    }
                }
            }
        }
    }

    private static void requireColumn(PendingUploadRegistry.Pending pending, String column, ImportMode mode) {
        if (column == null || column.isBlank() || !pending.headers().contains(column)) {
            throw GisErrorCode.MYMAP_COLUMN_REQUIRED.exception(mode.label());
        }
    }

    /** 소유 레이어(처리 중·실패 포함)가 한도에 닿았으면 거절. */
    private void assertLayerQuota(String ownerId) {
        int max = props.getLimits().getMaxLayersPerUser();
        if (userMapRepository.countByOwnerId(ownerId) >= max) {
            throw GisErrorCode.MYMAP_LAYER_LIMIT.exception(max);
        }
    }

    private static boolean startsWith(MultipartFile f, byte[] magic) {
        try (InputStream in = f.getInputStream()) {
            return Arrays.equals(in.readNBytes(magic.length), magic);
        } catch (IOException e) {
            return false;
        }
    }

    private static String copyWithSha256(MultipartFile file, Path target) throws IOException {
        try (InputStream raw = file.getInputStream()) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (DigestInputStream in = new DigestInputStream(raw, md)) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }
            return HexFormat.of().formatHex(md.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void deleteQuietly(Path p) {
        if (p == null) return;
        try {
            Files.deleteIfExists(p);
        } catch (IOException ignored) {
            // TTL 정리 작업이 이어받는다
        }
    }
}
