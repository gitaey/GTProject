package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.XlsxTestUtil.Fmt;
import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.dto.ExcelConfirmRequest;
import com.gtp.domain.mymap.dto.ExcelPreviewResponse;
import com.gtp.domain.mymap.dto.UserMapUploadResponse;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.infra.FakePnuParcelProvider;
import com.gtp.domain.mymap.infra.UnsupportedAddressResolver;
import com.gtp.domain.mymap.model.ImportMode;
import com.gtp.domain.mymap.port.Coverage;
import com.gtp.domain.mymap.port.PnuParcelProvider;
import com.gtp.domain.mymap.repository.UserMapRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static com.gtp.domain.mymap.XlsxTestUtil.bytes;
import static com.gtp.domain.mymap.XlsxTestUtil.row;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class UserMapUploadServiceTest {

    static final String ALICE = "alice";
    static final String PNU1 = "1114010300100310000";
    static final String PNU2 = "3611010300107180000";

    @TempDir
    Path dir;
    PendingUploadRegistryTest.TestClock clock;
    MyMapProperties props;
    UserMapRepository repo;
    UserMapProcessor processor;
    UserMapImportJob job;
    PendingUploadRegistry registry;
    ImportGuard guard;
    PnuParcelProvider provider;
    UserMapUploadService service;

    @BeforeEach
    void setUp() {
        clock = new PendingUploadRegistryTest.TestClock();
        props = new MyMapProperties();
        props.setUploadDir(dir.resolve("up").toString());
        repo = mock(UserMapRepository.class);
        processor = mock(UserMapProcessor.class);
        job = mock(UserMapImportJob.class);
        registry = new PendingUploadRegistry(props, clock);
        guard = new ImportGuard();
        provider = FakePnuParcelProvider.fromClasspath(new com.fasterxml.jackson.databind.ObjectMapper());
        service = new UserMapUploadService(repo, processor, job, registry, guard, provider, new UnsupportedAddressResolver(), props);

        when(repo.save(any(UserMap.class))).thenAnswer(inv -> {
            UserMap m = inv.getArgument(0);
            try {
                var f = UserMap.class.getDeclaredField("id");
                f.setAccessible(true);
                f.set(m, 77L);
            } catch (ReflectiveOperationException e) {
                throw new IllegalStateException(e);
            }
            return m;
        });
    }

    // ---------- 도우미 ----------

    private MockMultipartFile xlsx(List<List<Object>> rows) {
        return new MockMultipartFile("file", "데이터.xlsx", "application/octet-stream", bytes(dir, rows));
    }

    private List<List<Object>> pnuRows(int dataRows) {
        List<List<Object>> rows = new ArrayList<>();
        rows.add(row("PNU", "이름"));
        for (int i = 0; i < dataRows; i++) rows.add(row(i % 2 == 0 ? PNU1 : PNU2, "n" + i));
        return rows;
    }

    private ExcelConfirmRequest confirm(String uploadId, String mode) {
        ExcelConfirmRequest r = new ExcelConfirmRequest();
        r.setUploadId(uploadId);
        r.setName("내 레이어");
        r.setMode(mode);
        r.setPnuColumn("PNU");
        return r;
    }

    private static CustomException caught(Runnable r) {
        try {
            r.run();
        } catch (CustomException e) {
            return e;
        }
        throw new AssertionError("CustomException이 나야 합니다");
    }

    private static void assertCode(CustomException e, GisErrorCode code) {
        assertThat(e.getErrorCode()).isEqualTo(code);
    }

    // ---------- 미리보기 ----------

    @Test
    void PNU_파일_미리보기() {
        ExcelPreviewResponse r = service.previewExcel(xlsx(pnuRows(3)), ALICE);

        assertThat(r.getHeaders()).containsExactly("PNU", "이름");
        assertThat(r.getTotalRows()).isEqualTo(3);
        assertThat(r.getSampleRows()).hasSize(3);
        assertThat(r.getSampleRows().get(0)).containsExactly(PNU1, "n0");
        assertThat(r.getSuggestions().getMode()).isEqualTo("PNU");
        assertThat(r.getSuggestions().getPnuColumn()).isEqualTo("PNU");
        assertThat(r.getLimits().getPnu()).isEqualTo(5000);
        assertThat(r.getLimits().getAddress()).isEqualTo(5000);
        assertThat(r.getLimits().getCoord()).isEqualTo(5000);
        assertThat(r.getWarnings()).isEmpty();
        assertThat(r.getUploadId()).isNotBlank();
        assertThat(Files.exists(Path.of(props.getUploadDir(), r.getUploadId() + ".xlsx"))).isTrue();
        assertThat(registry.find(r.getUploadId(), ALICE)).isPresent();
        assertThat(registry.find(r.getUploadId(), "bob")).isEmpty();
    }

    @Test
    void 미리보기_샘플은_10행까지_전체_행수는_정확히() {
        ExcelPreviewResponse r = service.previewExcel(xlsx(pnuRows(25)), ALICE);
        assertThat(r.getSampleRows()).hasSize(10);
        assertThat(r.getTotalRows()).isEqualTo(25);
    }

    @Test
    void 좌표_파일은_좌표를_추천() {
        List<List<Object>> rows = List.of(row("위도", "경도", "이름"), row(37.5663, 126.9779, "서울"), row(36.48, 127.289, "세종"));
        ExcelPreviewResponse r = service.previewExcel(xlsx(rows), ALICE);
        assertThat(r.getSuggestions().getMode()).isEqualTo("COORD");
        assertThat(r.getSuggestions().getLatColumn()).isEqualTo("위도");
        assertThat(r.getSuggestions().getLonColumn()).isEqualTo("경도");
        assertThat(r.getSuggestions().getSourceSrid()).isEqualTo("EPSG:4326");
    }

    @Test
    void 숫자_서식_PNU는_NUMERIC_PNU_CELLS_경고() {
        List<List<Object>> rows = List.of(row("PNU", "이름"), row(new Fmt(1.11401030010031E18, "0"), "a"), row(new Fmt(3.61101030010718E18, "0"), "b"));
        ExcelPreviewResponse r = service.previewExcel(xlsx(rows), ALICE);
        assertThat(r.getWarnings()).extracting(ExcelPreviewResponse.Warning::getCode).contains("NUMERIC_PNU_CELLS");
    }

    @Test
    void 같은_파일을_이미_올렸으면_DUPLICATE_FILE_경고와_해시() throws Exception {
        MockMultipartFile file = xlsx(pnuRows(2));
        String sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(file.getBytes()));
        UserMap existing = UserMap.builder().name("지난번 레이어").ownerId(ALICE).sourceType("EXCEL").sourceSrid("EPSG:4326").build();
        when(repo.findAllByOwnerIdAndFileHashOrderByCreatedAtDesc(ALICE, sha)).thenReturn(List.of(existing));

        ExcelPreviewResponse r = service.previewExcel(file, ALICE);
        assertThat(r.getWarnings()).hasSize(1);
        assertThat(r.getWarnings().get(0).getCode()).isEqualTo("DUPLICATE_FILE");
        assertThat(r.getWarnings().get(0).getMessage()).contains("지난번 레이어");
        // 확정 때 쓸 해시가 목록에 보관된다
        assertThat(registry.find(r.getUploadId(), ALICE).orElseThrow().fileHash()).isEqualTo(sha);
    }

    @Test
    void 한도를_넘으면_OVER_LIMIT_경고() {
        props.getLimits().setMaxRowsPnu(2);
        ExcelPreviewResponse r = service.previewExcel(xlsx(pnuRows(3)), ALICE);
        assertThat(r.getWarnings()).extracting(ExcelPreviewResponse.Warning::getCode).containsExactly("OVER_LIMIT");
        assertThat(r.getWarnings().get(0).getMessage()).contains("2행");
    }

    @Test
    void 한도와_같은_행수는_경고도_거절도_없다() {
        props.getLimits().setMaxRowsPnu(3);
        ExcelPreviewResponse r = service.previewExcel(xlsx(pnuRows(3)), ALICE);
        assertThat(r.getWarnings()).isEmpty();
        service.confirmExcel(confirm(r.getUploadId(), "PNU"), ALICE);   // 3행 = 한도 3 → 통과
        verify(job).submit(any());
    }

    @Test
    void xlsx가_아니거나_비었거나_zip_표식이_없으면_INVALID_EXCEL_FILE() {
        assertCode(caught(() -> service.previewExcel(new MockMultipartFile("file", "a.csv", "text/csv", "a,b".getBytes()), ALICE)), GisErrorCode.INVALID_EXCEL_FILE);
        assertCode(caught(() -> service.previewExcel(new MockMultipartFile("file", "a.xlsx", "x", new byte[0]), ALICE)), GisErrorCode.INVALID_EXCEL_FILE);
        assertCode(caught(() -> service.previewExcel(new MockMultipartFile("file", "a.xlsx", "x", "not a zip at all".getBytes()), ALICE)), GisErrorCode.INVALID_EXCEL_FILE);
        assertCode(caught(() -> service.previewExcel(new MockMultipartFile("file", null, "x", "PK".getBytes()), ALICE)), GisErrorCode.INVALID_EXCEL_FILE);
    }

    @Test
    void 파일이_너무_크면_MYMAP_FILE_TOO_LARGE() {
        props.getLimits().setMaxExcelMb(1);
        byte[] big = new byte[2 * 1024 * 1024];
        big[0] = 'P';
        big[1] = 'K';
        big[2] = 3;
        big[3] = 4;
        CustomException e = caught(() -> service.previewExcel(new MockMultipartFile("file", "a.xlsx", "x", big), ALICE));
        assertCode(e, GisErrorCode.MYMAP_FILE_TOO_LARGE);
        assertThat(e.getMessage()).contains("1MB");
    }

    @Test
    void 깨진_zip이면_INVALID_EXCEL_FILE이고_임시_파일을_남기지_않는다() throws Exception {
        byte[] broken = new byte[200];
        broken[0] = 'P';
        broken[1] = 'K';
        broken[2] = 3;
        broken[3] = 4;
        CustomException e = caught(() -> service.previewExcel(new MockMultipartFile("file", "a.xlsx", "x", broken), ALICE));
        assertCode(e, GisErrorCode.INVALID_EXCEL_FILE);
        try (Stream<Path> files = Files.list(Path.of(props.getUploadDir()))) {
            assertThat(files.toList()).isEmpty();
        }
        assertThat(registry.size()).isZero();
    }

    // ---------- H1: 큰 파일·동시 미리보기 ----------

    @Test
    void 행이_너무_많은_파일은_미리보기에서_바로_거절하고_흔적을_남기지_않는다() throws Exception {
        Path big = com.gtp.domain.mymap.XlsxTestUtil.hugeRows(dir.resolve("big.xlsx"), 200_000);
        MockMultipartFile file = new MockMultipartFile("file", "big.xlsx", "x", Files.readAllBytes(big));
        long t0 = System.nanoTime();
        CustomException e = caught(() -> service.previewExcel(file, ALICE));
        assertCode(e, GisErrorCode.MYMAP_ROW_LIMIT);
        assertThat(e.getMessage()).contains("5000행");
        assertThat((System.nanoTime() - t0) / 1_000_000).as("거절까지 ms").isLessThan(10_000);   // 20만 행을 다 읽지 않는다
        try (Stream<Path> files = Files.list(Path.of(props.getUploadDir()))) {
            assertThat(files.toList()).isEmpty();
        }
        assertThat(registry.size()).isZero();
    }

    @Test
    void 가장_큰_모드_한도가_거절_기준이고_한도_안이면_경고만_한다() {
        props.getLimits().setMaxRowsPnu(2);
        props.getLimits().setMaxRowsAddress(3);
        props.getLimits().setMaxRowsCoord(3);
        // 3행 = 가장 큰 한도(3)와 같음 → 통과, PNU 한도(2)는 넘으니 경고
        ExcelPreviewResponse ok = service.previewExcel(xlsx(pnuRows(3)), ALICE);
        assertThat(ok.getWarnings()).extracting(ExcelPreviewResponse.Warning::getCode).containsExactly("OVER_LIMIT");
        // 4행 = 가장 큰 한도 초과 → 거절
        assertCode(caught(() -> service.previewExcel(xlsx(pnuRows(4)), ALICE)), GisErrorCode.MYMAP_ROW_LIMIT);
    }

    @Test
    void 숫자_서식_PNU가_51행_이후에만_있어도_경고한다() {
        List<List<Object>> rows = new ArrayList<>(pnuRows(60));
        rows.add(row(new Fmt(1.11401030010031E18, "0"), "뒤쪽 숫자 서식"));
        ExcelPreviewResponse r = service.previewExcel(xlsx(rows), ALICE);
        assertThat(r.getTotalRows()).isEqualTo(61);
        assertThat(r.getWarnings()).extracting(ExcelPreviewResponse.Warning::getCode).contains("NUMERIC_PNU_CELLS");
    }

    /** 두 번째로 내용을 읽으려 할 때(= 미리보기가 자물쇠 안에서 파일을 복사할 때) 풀어 줄 때까지 멈추는 업로드 파일 */
    static class BlockingFile extends MockMultipartFile {
        final java.util.concurrent.CountDownLatch inside = new java.util.concurrent.CountDownLatch(1);
        final java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
        private final java.util.concurrent.atomic.AtomicInteger reads = new java.util.concurrent.atomic.AtomicInteger();

        BlockingFile(byte[] content) {
            super("file", "b.xlsx", "x", content);
        }

        @Override
        public java.io.InputStream getInputStream() throws IOException {
            if (reads.incrementAndGet() >= 2) {
                inside.countDown();
                try {
                    release.await(30, java.util.concurrent.TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            return super.getInputStream();
        }
    }

    @Test
    void 같은_사용자의_미리보기는_동시에_하나만() throws Exception {
        BlockingFile slow = new BlockingFile(bytes(dir, pnuRows(2)));
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var first = pool.submit(() -> service.previewExcel(slow, ALICE));
            assertThat(slow.inside.await(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();   // 첫 번째가 자물쇠 안에서 멈춰 있다
            CustomException e = caught(() -> service.previewExcel(xlsx(pnuRows(2)), ALICE));
            assertCode(e, GisErrorCode.MYMAP_IMPORT_BUSY);
            assertThat(e.getErrorCode().getStatus().value()).isEqualTo(429);
            // 다른 사용자는 지장 없다
            assertThat(service.previewExcel(xlsx(pnuRows(2)), "bob").getTotalRows()).isEqualTo(2);
            slow.release.countDown();
            assertThat(first.get(30, java.util.concurrent.TimeUnit.SECONDS).getTotalRows()).isEqualTo(2);
            // 끝났으니 다시 할 수 있다
            assertThat(service.previewExcel(xlsx(pnuRows(2)), ALICE).getTotalRows()).isEqualTo(2);
        } finally {
            slow.release.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void 전체_동시_미리보기는_4개까지_다섯_번째는_429이고_끝나면_자리가_돌아온다() throws Exception {
        int slots = 4;
        List<BlockingFile> slow = new ArrayList<>();
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(slots);
        List<java.util.concurrent.Future<ExcelPreviewResponse>> running = new ArrayList<>();
        try {
            for (int i = 0; i < slots; i++) {
                BlockingFile f = new BlockingFile(bytes(dir, pnuRows(2)));
                slow.add(f);
                String user = "user" + i;
                running.add(pool.submit(() -> service.previewExcel(f, user)));
                assertThat(f.inside.await(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            }
            assertCode(caught(() -> service.previewExcel(xlsx(pnuRows(2)), "fifth")), GisErrorCode.MYMAP_IMPORT_BUSY);
            // 거절된 다섯 번째 사용자는 자기 자리를 점유하지 않는다
            slow.forEach(f -> f.release.countDown());
            for (var r : running) assertThat(r.get(30, java.util.concurrent.TimeUnit.SECONDS).getTotalRows()).isEqualTo(2);
            assertThat(service.previewExcel(xlsx(pnuRows(2)), "fifth").getTotalRows()).isEqualTo(2);
        } finally {
            slow.forEach(f -> f.release.countDown());
            pool.shutdownNow();
        }
    }

    @Test
    void 미리보기가_실패해도_자물쇠와_자리를_돌려준다() {
        for (int i = 0; i < 6; i++) {   // 6번 실패해도 4자리가 새지 않는다
            assertCode(caught(() -> service.previewExcel(new MockMultipartFile("file", "a.xlsx", "x", brokenZip()), ALICE)), GisErrorCode.INVALID_EXCEL_FILE);
        }
        assertThat(service.previewExcel(xlsx(pnuRows(2)), ALICE).getTotalRows()).isEqualTo(2);
    }

    private static byte[] brokenZip() {
        byte[] b = new byte[100];
        b[0] = 'P';
        b[1] = 'K';
        b[2] = 3;
        b[3] = 4;
        return b;
    }

    // ---------- 확정 ----------

    private String previewId(int dataRows) {
        return service.previewExcel(xlsx(pnuRows(dataRows)), ALICE).getUploadId();
    }

    @Test
    void 없는_uploadId_다른_사람_만료는_모두_같은_404() {
        String id = previewId(2);
        assertCode(caught(() -> service.confirmExcel(confirm("없는-id", "PNU"), ALICE)), GisErrorCode.EXCEL_UPLOAD_NOT_FOUND);
        assertCode(caught(() -> service.confirmExcel(confirm(id, "PNU"), "mallory")), GisErrorCode.EXCEL_UPLOAD_NOT_FOUND);
        clock.advance(Duration.ofMinutes(31));
        assertCode(caught(() -> service.confirmExcel(confirm(id, "PNU"), ALICE)), GisErrorCode.EXCEL_UPLOAD_NOT_FOUND);
        verifyNoInteractions(job);
        verify(repo, never()).save(any());
    }

    @Test
    void 주소_모드는_지원_예정_안내로_거절() {
        String id = previewId(2);
        CustomException e = caught(() -> service.confirmExcel(confirm(id, "ADDRESS"), ALICE));
        assertCode(e, GisErrorCode.MYMAP_MODE_UNSUPPORTED);
        assertThat(e.getMessage()).isEqualTo(UserMapUploadService.ADDRESS_UNSUPPORTED_MESSAGE).contains("지원 예정");
        assertThat(e.getMessage()).doesNotContain("{0}");
        assertThat(e.getErrorCode().getStatus().value()).isEqualTo(400);
        verifyNoInteractions(job);
        assertThat(guard.isActive(ALICE)).isFalse();
    }

    @Test
    void 모르는_모드는_거절() {
        String id = previewId(2);
        CustomException e = caught(() -> service.confirmExcel(confirm(id, "WHAT"), ALICE));
        assertCode(e, GisErrorCode.MYMAP_MODE_UNSUPPORTED);
        assertThat(e.getMessage()).contains("WHAT").doesNotContain("{0}");
        assertThat(GisErrorCode.MYMAP_MODE_UNSUPPORTED.getMessage()).doesNotContain("{");   // 인자 없이 던져도 자리표시가 화면에 나가지 않는다
    }

    @Test
    void PNU_컬럼이_비었거나_머리글에_없으면_MYMAP_COLUMN_REQUIRED() {
        String id = previewId(2);
        ExcelConfirmRequest blank = confirm(id, "PNU");
        blank.setPnuColumn(" ");
        CustomException e = caught(() -> service.confirmExcel(blank, ALICE));
        assertCode(e, GisErrorCode.MYMAP_COLUMN_REQUIRED);
        assertThat(e.getMessage()).isEqualTo("PNU에 쓸 컬럼을 선택하세요.");

        ExcelConfirmRequest missing = confirm(id, "PNU");
        missing.setPnuColumn("없는열");
        assertCode(caught(() -> service.confirmExcel(missing, ALICE)), GisErrorCode.MYMAP_COLUMN_REQUIRED);
    }

    @Test
    void 좌표_컬럼이_없거나_좌표계가_틀리면_거절() {
        String id = previewId(2);
        ExcelConfirmRequest noCols = confirm(id, "COORD");
        assertCode(caught(() -> service.confirmExcel(noCols, ALICE)), GisErrorCode.INVALID_COORDINATE_COLUMN);

        ExcelConfirmRequest badSrid = confirm(id, "COORD");
        badSrid.setLatColumn("PNU");
        badSrid.setLonColumn("이름");
        badSrid.setSourceSrid("EPSG:9999");
        CustomException e = caught(() -> service.confirmExcel(badSrid, ALICE));
        assertCode(e, GisErrorCode.MYMAP_SRID_UNSUPPORTED);
        assertThat(e.getMessage()).contains("EPSG:9999");
    }

    @Test
    void 확정_행수_한도_초과는_MYMAP_ROW_LIMIT() {
        props.getLimits().setMaxRowsPnu(2);
        String id = previewId(3);
        CustomException e = caught(() -> service.confirmExcel(confirm(id, "PNU"), ALICE));
        assertCode(e, GisErrorCode.MYMAP_ROW_LIMIT);
        assertThat(e.getMessage()).contains("2행");
        verifyNoInteractions(job);
    }

    @Test
    void 레이어_20개_한도() {
        String id = previewId(2);
        when(repo.countByOwnerId(ALICE)).thenReturn(20L);
        CustomException e = caught(() -> service.confirmExcel(confirm(id, "PNU"), ALICE));
        assertCode(e, GisErrorCode.MYMAP_LAYER_LIMIT);
        assertThat(e.getMessage()).contains("20개");
        assertThat(e.getErrorCode().getStatus().value()).isEqualTo(409);

        when(repo.countByOwnerId(ALICE)).thenReturn(19L);
        service.confirmExcel(confirm(id, "PNU"), ALICE);   // 19개면 통과
        verify(job).submit(any());
    }

    @Test
    void 처리_중인_업로드가_있으면_MYMAP_IMPORT_BUSY() {
        String id = previewId(2);
        // ① 메모리 자물쇠
        assertThat(guard.tryAcquire(ALICE)).isTrue();
        assertCode(caught(() -> service.confirmExcel(confirm(id, "PNU"), ALICE)), GisErrorCode.MYMAP_IMPORT_BUSY);
        guard.release(ALICE);
        // ② DB의 PROCESSING 레이어(예: shp 처리 중)
        when(repo.countByOwnerIdAndStatus(ALICE, "PROCESSING")).thenReturn(1L);
        assertCode(caught(() -> service.confirmExcel(confirm(id, "PNU"), ALICE)), GisErrorCode.MYMAP_IMPORT_BUSY);
        assertThat(guard.isActive(ALICE)).isFalse();           // 거절하면 자물쇠를 돌려놓는다
        verify(repo, never()).save(any());
        verifyNoInteractions(job);
    }

    @Test
    void 지적도가_준비되지_않으면_PNU는_MYMAP_REF_UNAVAILABLE() {
        provider = mock(PnuParcelProvider.class);
        when(provider.coverage()).thenReturn(Coverage.unavailable());
        service = new UserMapUploadService(repo, processor, job, registry, guard, provider, new UnsupportedAddressResolver(), props);
        String id = previewId(2);
        CustomException e = caught(() -> service.confirmExcel(confirm(id, "PNU"), ALICE));
        assertCode(e, GisErrorCode.MYMAP_REF_UNAVAILABLE);
        assertThat(e.getErrorCode().getStatus().value()).isEqualTo(503);
        verifyNoInteractions(job);
    }

    @Test
    void PNU_확정은_PROCESSING_레이어를_저장하고_작업을_맡긴다() {
        ExcelPreviewResponse preview = service.previewExcel(xlsx(pnuRows(3)), ALICE);
        String hash = registry.find(preview.getUploadId(), ALICE).orElseThrow().fileHash();
        Path file = registry.find(preview.getUploadId(), ALICE).orElseThrow().file();

        ExcelConfirmRequest req = confirm(preview.getUploadId(), "pnu");
        req.setDescription("설명");
        UserMapUploadResponse res = service.confirmExcel(req, ALICE);

        assertThat(res.getId()).isEqualTo(77L);
        assertThat(res.getName()).isEqualTo("내 레이어");
        assertThat(res.getStatus()).isEqualTo("PROCESSING");
        assertThat(res.getParcelVersion()).isEqualTo("FAKE");   // PNU는 지금 적재된 기준월(예정값)을 바로 알려 준다

        ArgumentCaptor<UserMap> saved = ArgumentCaptor.forClass(UserMap.class);
        verify(repo).save(saved.capture());
        UserMap m = saved.getValue();
        assertThat(m.getOwnerId()).isEqualTo(ALICE);
        assertThat(m.getSourceType()).isEqualTo("EXCEL");
        assertThat(m.getSourceKind()).isEqualTo("EXCEL_PNU");
        assertThat(m.getSourceSrid()).isEqualTo("EPSG:4326");
        assertThat(m.getStatus()).isEqualTo("PROCESSING");
        assertThat(m.getProgressTotal()).isEqualTo(3);
        assertThat(m.getFileHash()).isEqualTo(hash);
        assertThat(m.getDescription()).isEqualTo("설명");

        ArgumentCaptor<UserMapImportJob.Request> r = ArgumentCaptor.forClass(UserMapImportJob.Request.class);
        verify(job).submit(r.capture());
        assertThat(r.getValue().userMapId()).isEqualTo(77L);
        assertThat(r.getValue().ownerId()).isEqualTo(ALICE);
        assertThat(r.getValue().mode()).isEqualTo(ImportMode.PNU);
        assertThat(r.getValue().file()).isEqualTo(file);
        assertThat(r.getValue().totalRows()).isEqualTo(3);
        assertThat(r.getValue().pnuColumn()).isEqualTo("PNU");

        // UserMap 저장(커밋)이 작업 제출보다 먼저
        InOrder order = inOrder(repo, job);
        order.verify(repo).save(any(UserMap.class));
        order.verify(job).submit(any());
        // 같은 uploadId로 다시 확정할 수 없고, 자물쇠는 작업이 풀 때까지 유지
        assertThat(registry.find(preview.getUploadId(), ALICE)).isEmpty();
        assertThat(guard.isActive(ALICE)).isTrue();
    }

    @Test
    void 좌표_확정_기본_좌표계는_5186이고_mode가_없으면_COORD() {
        List<List<Object>> rows = List.of(row("위도", "경도"), row(551000, 198000), row(552000, 199000));
        String id = service.previewExcel(xlsx(rows), ALICE).getUploadId();
        ExcelConfirmRequest req = new ExcelConfirmRequest();
        req.setUploadId(id);
        req.setLatColumn("위도");
        req.setLonColumn("경도");
        assertThat(service.confirmExcel(req, ALICE).getParcelVersion()).isNull();   // 좌표 모드는 지적도 기준월이 없다. mode, name, sourceSrid 모두 없음

        ArgumentCaptor<UserMap> saved = ArgumentCaptor.forClass(UserMap.class);
        verify(repo).save(saved.capture());
        assertThat(saved.getValue().getSourceKind()).isEqualTo("EXCEL_COORD");
        assertThat(saved.getValue().getSourceSrid()).isEqualTo("EPSG:5186");
        assertThat(saved.getValue().getName()).isEqualTo("엑셀 업로드");
        ArgumentCaptor<UserMapImportJob.Request> r = ArgumentCaptor.forClass(UserMapImportJob.Request.class);
        verify(job).submit(r.capture());
        assertThat(r.getValue().mode()).isEqualTo(ImportMode.COORD);
        assertThat(r.getValue().latColumn()).isEqualTo("위도");
        assertThat(r.getValue().sourceSrid()).isEqualTo("EPSG:5186");
    }

    @Test
    void 이름이_너무_길면_칸_크기에_맞춰_자른다() {
        String id = previewId(2);
        ExcelConfirmRequest req = confirm(id, "PNU");
        req.setName("가".repeat(150));
        service.confirmExcel(req, ALICE);
        ArgumentCaptor<UserMap> saved = ArgumentCaptor.forClass(UserMap.class);
        verify(repo).save(saved.capture());
        assertThat(saved.getValue().getName()).hasSize(100);
    }

    @Test
    void 풀이_가득_차_작업을_못_맡기면_빈_레이어를_지우고_자물쇠를_풀고_다시_시도할_수_있다() {
        ExcelPreviewResponse preview = service.previewExcel(xlsx(pnuRows(2)), ALICE);
        doThrow(new CustomException(GisErrorCode.MYMAP_IMPORT_BUSY)).when(job).submit(any());

        CustomException e = caught(() -> service.confirmExcel(confirm(preview.getUploadId(), "PNU"), ALICE));
        assertCode(e, GisErrorCode.MYMAP_IMPORT_BUSY);
        verify(repo).deleteById(77L);
        assertThat(guard.isActive(ALICE)).isFalse();
        assertThat(registry.find(preview.getUploadId(), ALICE)).isPresent(); // 파일은 그대로 — 곧 다시 확정할 수 있다
    }

    @Test
    void 접수_메서드에_트랜잭션을_걸지_않는다() throws Exception {
        // UserMap이 커밋되기 전에 처리 스레드가 읽는 사고를 막는 규칙(@Async·풀 제출을 트랜잭션 안에서 부르지 않는다)
        assertThat(UserMapUploadService.class.isAnnotationPresent(Transactional.class)).isFalse();
        assertThat(UserMapUploadService.class.isAnnotationPresent(jakarta.transaction.Transactional.class)).isFalse();
        for (Method m : UserMapUploadService.class.getDeclaredMethods()) {
            assertThat(m.isAnnotationPresent(Transactional.class)).as(m.getName()).isFalse();
            assertThat(m.isAnnotationPresent(jakarta.transaction.Transactional.class)).as(m.getName()).isFalse();
        }
    }

    // ---------- shp ----------

    private static MockMultipartFile shpPart(String name, byte[] content) {
        return new MockMultipartFile("files", name, "application/octet-stream", content);
    }

    private static final byte[] SHP_HEAD = {0, 0, 0x27, 0x0a, 0, 0, 0, 0};

    @Test
    void shp_정상_접수는_저장한_뒤_처리를_넘긴다() {
        UserMapUploadResponse res = service.uploadShp(
                List.of(shpPart("a.shp", SHP_HEAD), shpPart("a.dbf", new byte[]{1, 2, 3})), "구역", null, null, ALICE);
        assertThat(res.getId()).isEqualTo(77L);
        ArgumentCaptor<UserMap> saved = ArgumentCaptor.forClass(UserMap.class);
        InOrder order = inOrder(repo, processor);
        order.verify(repo).save(saved.capture());
        order.verify(processor).processShp(eq(77L), any(Path.class), eq("EPSG:5186"), eq(ALICE));
        assertThat(saved.getValue().getSourceKind()).isEqualTo("SHP");
        assertThat(saved.getValue().getSourceType()).isEqualTo("SHP");
    }

    @Test
    void shp도_사용자당_동시_1건_처리가_끝나기_전에는_다시_못_올린다() {
        List<MultipartFile> files = List.of(shpPart("a.shp", SHP_HEAD), shpPart("a.dbf", new byte[]{1, 2, 3}));
        service.uploadShp(files, "첫째", null, null, ALICE);   // 처리 작업(목)이 자물쇠를 풀지 않았으니 아직 처리 중
        assertThat(guard.isActive(ALICE)).isTrue();
        assertCode(caught(() -> service.uploadShp(files, "둘째", null, null, ALICE)), GisErrorCode.MYMAP_IMPORT_BUSY);
        // 엑셀 확정도 같은 자물쇠 — shp 처리 중에는 안 된다
        String id = previewId(2);
        assertCode(caught(() -> service.confirmExcel(confirm(id, "PNU"), ALICE)), GisErrorCode.MYMAP_IMPORT_BUSY);
        verify(processor, times(1)).processShp(anyLong(), any(Path.class), anyString(), anyString());
        // 다른 사용자는 영향 없다
        service.uploadShp(files, "다른 사람", null, null, "bob");
        verify(processor, times(2)).processShp(anyLong(), any(Path.class), anyString(), anyString());
    }

    @Test
    void shp_접수가_거절되거나_실패하면_자물쇠를_돌려준다() {
        List<MultipartFile> files = List.of(shpPart("a.shp", SHP_HEAD), shpPart("a.dbf", new byte[]{1, 2, 3}));
        // DB에 처리 중인 레이어가 있으면 거절 — 자물쇠는 돌려놓는다
        when(repo.countByOwnerIdAndStatus(ALICE, "PROCESSING")).thenReturn(1L);
        assertCode(caught(() -> service.uploadShp(files, "n", null, null, ALICE)), GisErrorCode.MYMAP_IMPORT_BUSY);
        assertThat(guard.isActive(ALICE)).isFalse();
        // 처리 작업을 시작하지 못하면(예외) 자물쇠를 돌려준다
        when(repo.countByOwnerIdAndStatus(ALICE, "PROCESSING")).thenReturn(0L);
        doThrow(new IllegalStateException("풀 거절")).when(processor).processShp(anyLong(), any(Path.class), anyString(), anyString());
        assertThatThrownBy(() -> service.uploadShp(files, "n", null, null, ALICE)).isInstanceOf(IllegalStateException.class);
        assertThat(guard.isActive(ALICE)).isFalse();
    }

    @Test
    void shp_크기_레이어수_형식_검사() {
        props.getLimits().setMaxShpMb(1);
        byte[] big = new byte[2 * 1024 * 1024];
        System.arraycopy(SHP_HEAD, 0, big, 0, SHP_HEAD.length);
        CustomException e = caught(() -> service.uploadShp(List.of(shpPart("a.shp", big), shpPart("a.dbf", new byte[1])), "n", null, null, ALICE));
        assertCode(e, GisErrorCode.MYMAP_FILE_TOO_LARGE);
        assertThat(e.getMessage()).contains("1MB");

        props.getLimits().setMaxShpMb(300);
        assertCode(caught(() -> service.uploadShp(List.of(shpPart("a.shp", new byte[]{1, 2, 3, 4}), shpPart("a.dbf", new byte[1])), "n", null, null, ALICE)),
                GisErrorCode.INVALID_SHP_FILE);
        assertCode(caught(() -> service.uploadShp(List.of(shpPart("a.shp", SHP_HEAD)), "n", null, null, ALICE)), GisErrorCode.INVALID_SHP_FILE); // dbf 없음

        when(repo.countByOwnerId(ALICE)).thenReturn(20L);
        assertCode(caught(() -> service.uploadShp(List.of(shpPart("a.shp", SHP_HEAD), shpPart("a.dbf", new byte[1])), "n", null, null, ALICE)),
                GisErrorCode.MYMAP_LAYER_LIMIT);
        verifyNoInteractions(processor);
        verify(repo, never()).save(any());
        verify(repo, never()).deleteById(anyLong());
        verify(repo, never()).findAllByOwnerIdAndFileHashOrderByCreatedAtDesc(anyString(), anyString());
    }
}
