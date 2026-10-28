package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.gtp.domain.mymap.config.MyMapImportExecutor;
import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.model.ImportFailureReason;
import com.gtp.domain.mymap.model.ImportMode;
import com.gtp.domain.mymap.port.AddressMatch;
import com.gtp.domain.mymap.port.AddressResolver;
import com.gtp.domain.mymap.port.Coverage;
import com.gtp.domain.mymap.port.ParcelShape;
import com.gtp.domain.mymap.port.PnuParcelProvider;
import com.gtp.domain.mymap.service.UserMapImportStore.FailureRow;
import com.gtp.domain.mymap.util.*;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.geotools.geojson.geom.GeometryJSON;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.StringWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.RejectedExecutionException;

/**
 * 엑셀(PNU·좌표) 가져오기 작업. 전용 풀({@link MyMapImportExecutor})에서 돌고, 500행마다 진행률을 남기며,
 * 지도에 오르지 못한 행은 사유와 함께 실패 행으로 저장한다(조용히 건너뛰지 않는다). 끝나면 READY, 처리하지 못하면 FAILED.
 *
 * 호출 순서 규칙: UserMap 행이 커밋된 뒤에 {@link #submit}한다(트랜잭션 안에서 부르지 않는다).
 * 작업은 레이어 행을 엔티티가 아니라 {@link UserMapImportStore} SQL로만 고친다. 레이어가 중간에 지워졌으면(UPDATE 0행) 멈추고 흔적을 지운다.
 */
@Slf4j
@Component
public class UserMapImportJob {

    /** 한 번에 PNU를 조회하는 행 수이자 진행률을 남기는 간격 */
    static final int BATCH = 500;

    /** 한국 범위(변환 후 WGS84). 섬·접경을 넉넉히 덮는다. */
    static final double LON_MIN = 123, LON_MAX = 133, LAT_MIN = 32, LAT_MAX = 40;

    static final String GENERIC_FAILURE = "처리 중 오류가 발생했습니다. 잠시 뒤 다시 시도하세요.";

    /** @param totalRows 미리보기에서 센, 값이 있는 데이터 행 수(진행률 분모) */
    public record Request(long userMapId, String ownerId, ImportMode mode, Path file, int totalRows,
                          String pnuColumn, String latColumn, String lonColumn, String sourceSrid, String addressColumn) {

        /** 주소 컬럼 없이(PNU·좌표 모드) 만드는 요청 */
        public Request(long userMapId, String ownerId, ImportMode mode, Path file, int totalRows,
                       String pnuColumn, String latColumn, String lonColumn, String sourceSrid) {
            this(userMapId, ownerId, mode, file, totalRows, pnuColumn, latColumn, lonColumn, sourceSrid, null);
        }
    }

    private final PnuParcelProvider provider;
    private final AddressResolver addressResolver;
    private final UserMapImportStore store;
    private final JdbcTemplate jdbc;
    private final MyMapProperties props;
    private final MyMapImportExecutor executor;
    private final ImportGuard guard;

    private final ObjectMapper om = new ObjectMapper();
    private final GeometryFactory geometryFactory = new GeometryFactory();
    private final GeometryJSON geometryJSON = new GeometryJSON(9);

    public UserMapImportJob(PnuParcelProvider provider, AddressResolver addressResolver, UserMapImportStore store, JdbcTemplate jdbc,
                            MyMapProperties props, MyMapImportExecutor executor, ImportGuard guard) {
        this.provider = provider;
        this.addressResolver = addressResolver;
        this.store = store;
        this.jdbc = jdbc;
        this.props = props;
        this.executor = executor;
        this.guard = guard;
    }

    /** 풀에 맡긴다. 대기열까지 가득 찼으면 MYMAP_IMPORT_BUSY(이 경우 작업은 시작되지 않았으니 호출한 쪽이 뒷정리). */
    public void submit(Request req) {
        try {
            executor.submit(() -> execute(req));
        } catch (RejectedExecutionException e) {
            throw new CustomException(GisErrorCode.MYMAP_IMPORT_BUSY);
        }
    }

    /** 작업 본체(동기). 예외를 밖으로 던지지 않는다 — 실패는 레이어 상태(FAILED)와 메시지로 남긴다. */
    public void execute(Request req) {
        long id = req.userMapId();
        try {
            new Run(req).run();
        } catch (LayerGone gone) {
            log.info("[나만의지도] 가져오는 중 레이어가 지워졌습니다 id={} — 중단", id);
            cleanup(id);
        } catch (CustomException e) {
            log.warn("[나만의지도] 가져오기 실패 id={}: {}", id, e.getMessage());
            fail(id, e.getMessage());
        } catch (Exception e) {
            if (!layerExists(id)) {
                // 사용자가 처리 중에 레이어를 지웠다 — 피처 INSERT가 FK 위반으로 먼저 알려 주는 경우. 오류가 아니라 중단이다.
                log.info("[나만의지도] 가져오는 중 레이어가 지워졌습니다 id={} — 중단", id);
                cleanup(id);
            } else {
                log.error("[나만의지도] 가져오기 실패 id={}", id, e);
                fail(id, GENERIC_FAILURE);
            }
        } finally {
            try {
                Files.deleteIfExists(req.file());
            } catch (IOException ignored) {
                // 임시 파일 정리 실패는 TTL 정리 작업이 이어받는다
            }
            guard.release(req.ownerId());
        }
    }

    private boolean layerExists(long id) {
        try {
            return store.exists(id);
        } catch (RuntimeException e) {
            return true; // 확인하지 못하면 실패로 기록하는 쪽이 안전하다
        }
    }

    private void fail(long id, String message) {
        try {
            cleanup(id);
            store.markFailed(id, message);
        } catch (RuntimeException e) {
            log.error("[나만의지도] 실패 상태 기록도 실패 id={}", id, e);
        }
    }

    /** 중간까지 넣은 피처·실패 행을 지운다(FAILED 레이어에 피처가 남아 용량만 차지하는 것을 막는다). */
    private void cleanup(long id) {
        store.deleteFeatures(id);
        store.deleteFailures(id);
    }

    private static final class LayerGone extends RuntimeException {
        LayerGone() {
            super(null, null, false, false);
        }
    }

    /** 한 번의 실행 상태 — 이 객체가 요청 하나의 가변 상태를 전부 가진다(공유 필드 없음). */
    private final class Run {
        final Request req;
        final long id;
        final int maxRows;
        /** 시트를 읽기 시작해 머리글이 나오면 채워진다 */
        List<String> headers = List.of();

        int processed, matched, failed;
        String geomType;
        final Set<String> usedSidos = new TreeSet<>();
        final List<FailureRow> failureBuf = new ArrayList<>();
        final List<PnuRow> batch = new ArrayList<>();
        /** 지도에 오른(매칭된) 행의 컬럼 통계 — 머리글을 읽은 뒤 만든다 */
        ColumnStatsCollector stats;

        Run(Request req) {
            this.req = req;
            this.id = req.userMapId();
            this.maxRows = props.maxRowsFor(req.mode());
        }

        void run() {
            switch (req.mode()) {
                case PNU -> runPnu();
                case ADDRESS -> runAddress();
                case COORD -> runCoord();
            }
        }

        // ---------- PNU ----------

        void runPnu() {
            Coverage coverage = provider.coverage();
            if (!coverage.available()) throw new CustomException(GisErrorCode.MYMAP_REF_UNAVAILABLE);
            Set<String> allowed = new HashSet<>(props.getRef().getAllowedSidoCodes());
            int[] keyIdx = {-1};

            try (FeatureBatchInserter inserter = new FeatureBatchInserter(jdbc, id)) {
                // 시트를 한 행씩 스트리밍으로 읽는다(메모리에 시트 전체를 올리지 않는다)
                ExcelSheet.read(req.file(), h -> {
                    headers = h;
                    stats = new ColumnStatsCollector(h);
                    keyIdx[0] = columnIndex(req.pnuColumn(), GisErrorCode.MYMAP_COLUMN_REQUIRED.exception(ImportMode.PNU.label()));
                }, row -> {
                    if (processed >= maxRows) {
                        rowLimit(row);
                        return false;
                    }
                    processed++;
                    PnuNormalizer.Result r = PnuNormalizer.check(row.cells().get(keyIdx[0]));
                    if (!r.ok()) {
                        fail(row, r.reason(), row.cells().get(keyIdx[0]).text());
                    } else {
                        String sido = r.pnu().substring(0, 2);
                        if ((!allowed.isEmpty() && !allowed.contains(sido)) || !coverage.isLoaded(sido)) {
                            fail(row, ImportFailureReason.OUT_OF_COVERAGE, r.pnu());
                        } else {
                            batch.add(new PnuRow(row, r.pnu(), propertiesOf(row), r.pnu()));
                        }
                    }
                    if (processed % BATCH == 0) {
                        flushPnuBatch(inserter);
                        checkpoint(inserter);
                    }
                    return true;
                });
                flushPnuBatch(inserter);
                inserter.flush();
                finish(coverage.versionFor(usedSidos));
            }
        }

        // ---------- 주소 ----------

        /** 주소 컬럼 → PNU(AddressResolver) → 이후는 PNU 모드와 같다. 500행씩 묶어 풀고, 같은 주소는 한 번만 푼다. */
        void runAddress() {
            if (!addressResolver.supported()) throw new CustomException(GisErrorCode.MYMAP_MODE_UNSUPPORTED);
            if (!addressResolver.available()) throw new CustomException(GisErrorCode.MYMAP_REF_UNAVAILABLE);
            Coverage coverage = provider.coverage();
            if (!coverage.available()) throw new CustomException(GisErrorCode.MYMAP_REF_UNAVAILABLE);
            Set<String> allowed = new HashSet<>(props.getRef().getAllowedSidoCodes());
            int[] keyIdx = {-1};
            List<ExcelSheet.Row> pending = new ArrayList<>();
            Map<String, AddressMatch> solved = new HashMap<>();   // 이번 작업에서 이미 푼 주소(원문 → 결과), 한도 5,000행이라 작다

            try (FeatureBatchInserter inserter = new FeatureBatchInserter(jdbc, id)) {
                ExcelSheet.read(req.file(), h -> {
                    headers = h;
                    stats = new ColumnStatsCollector(h);
                    keyIdx[0] = columnIndex(req.addressColumn(), GisErrorCode.MYMAP_COLUMN_REQUIRED.exception(ImportMode.ADDRESS.label()));
                }, row -> {
                    if (processed >= maxRows) {
                        rowLimit(row);
                        return false;
                    }
                    processed++;
                    CellData cell = row.cells().get(keyIdx[0]);
                    if (cell.blank()) fail(row, ImportFailureReason.EMPTY, cell.text());
                    else pending.add(row);
                    if (processed % BATCH == 0) {
                        resolveAddresses(pending, keyIdx[0], solved, coverage, allowed);
                        flushPnuBatch(inserter);
                        checkpoint(inserter);
                    }
                    return true;
                });
                resolveAddresses(pending, keyIdx[0], solved, coverage, allowed);
                flushPnuBatch(inserter);
                inserter.flush();
                finish(coverage.versionFor(usedSidos));
            }
        }

        /** 모아 둔 행의 주소를 풀어 PNU가 나온 행은 batch로, 아닌 행은 사유와 함께 실패로 보낸다. */
        void resolveAddresses(List<ExcelSheet.Row> pending, int keyIdx, Map<String, AddressMatch> solved,
                              Coverage coverage, Set<String> allowed) {
            if (pending.isEmpty()) return;
            List<String> toSolve = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            for (ExcelSheet.Row row : pending) {
                String text = row.cells().get(keyIdx).text();
                if (!solved.containsKey(text) && seen.add(text)) toSolve.add(text);
            }
            if (!toSolve.isEmpty()) {
                List<AddressMatch> results = addressResolver.resolve(toSolve);
                if (results.size() != toSolve.size()) throw new IllegalStateException("주소 해석 결과 수가 입력과 다릅니다");
                for (int i = 0; i < toSolve.size(); i++) solved.put(toSolve.get(i), results.get(i));
            }
            for (ExcelSheet.Row row : pending) {
                String text = row.cells().get(keyIdx).text();
                AddressMatch m = solved.get(text);
                switch (m.status()) {
                    case MATCHED -> {
                        String sido = m.pnu().substring(0, 2);
                        if ((!allowed.isEmpty() && !allowed.contains(sido)) || !coverage.isLoaded(sido)) {
                            fail(row, ImportFailureReason.OUT_OF_COVERAGE, text);
                        } else {
                            batch.add(new PnuRow(row, m.pnu(), propertiesOf(row), text));
                        }
                    }
                    case AMBIGUOUS -> failWithCandidates(row, ImportFailureReason.AMBIGUOUS, text, m.candidates());
                    default -> fail(row, m.reason() != null ? m.reason() : ImportFailureReason.PARSE_FAILED, text);
                }
            }
            pending.clear();
        }

        void flushPnuBatch(FeatureBatchInserter inserter) {
            if (batch.isEmpty()) return;
            Set<String> pnus = new LinkedHashSet<>();
            Set<String> sidos = new TreeSet<>();
            for (PnuRow pr : batch) {
                pnus.add(pr.pnu());
                sidos.add(pr.pnu().substring(0, 2));
            }
            waitWhileSwapping(sidos);
            Map<String, ParcelShape> found = provider.findByPnus(pnus);
            for (PnuRow pr : batch) {
                ParcelShape shape = found.get(pr.pnu());
                if (shape == null) {
                    fail(pr.row(), ImportFailureReason.PARCEL_NOT_FOUND, pr.input());
                    continue;
                }
                inserter.add(shape.geometryJson(), pr.properties(), pr.pnu(), pr.row().rowNo());
                matched++;
                stats.addRow(plainValues(pr.row()));
                usedSidos.add(pr.pnu().substring(0, 2));
                if (geomType == null) geomType = geometryTypeOf(shape.geometryJson());
            }
            batch.clear();
        }

        /** 시도 파티션을 교체하는 중이면(적재 스크립트가 SWAPPING 표시) 끝날 때까지 잠시 기다린다. */
        void waitWhileSwapping(Set<String> sidos) {
            long deadline = System.nanoTime() + props.getRef().getSwapWaitSeconds() * 1_000_000_000L;
            while (true) {
                Coverage c = provider.coverage();
                boolean swapping = sidos.stream().anyMatch(c::isSwapping);
                if (!swapping) return;
                if (System.nanoTime() > deadline) throw new CustomException(GisErrorCode.MYMAP_REF_UNAVAILABLE);
                try {
                    Thread.sleep(props.getRef().getSwapPollMillis());
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("가져오기가 중단되었습니다", e);
                }
            }
        }

        // ---------- 좌표 ----------

        void runCoord() {
            CoordinateTransformUtil.ToWgs84 transform;
            try {
                transform = CoordinateTransformUtil.buildTransform(req.sourceSrid());
            } catch (IllegalArgumentException e) {
                throw GisErrorCode.MYMAP_SRID_UNSUPPORTED.exception(req.sourceSrid());
            }
            int[] idx = {-1, -1};   // 위도, 경도 열 번호

            try (FeatureBatchInserter inserter = new FeatureBatchInserter(jdbc, id)) {
                ExcelSheet.read(req.file(), h -> {
                    headers = h;
                    stats = new ColumnStatsCollector(h);
                    idx[0] = columnIndex(req.latColumn(), new CustomException(GisErrorCode.INVALID_COORDINATE_COLUMN));
                    idx[1] = columnIndex(req.lonColumn(), new CustomException(GisErrorCode.INVALID_COORDINATE_COLUMN));
                }, row -> {
                    if (processed >= maxRows) {
                        rowLimit(row);
                        return false;
                    }
                    processed++;
                    CellData latCell = row.cells().get(idx[0]), lonCell = row.cells().get(idx[1]);
                    String input = latCell.text() + ", " + lonCell.text();
                    if (latCell.blank() && lonCell.blank()) {
                        fail(row, ImportFailureReason.EMPTY, input);
                    } else {
                        Double lat = numberOf(latCell), lon = numberOf(lonCell);
                        if (lat == null || lon == null) {
                            fail(row, ImportFailureReason.COORD_INVALID, input);
                        } else {
                            Coordinate c = CoordinateTransformUtil.transformPoint(lon, lat, transform);
                            if (!inKorea(c.x, c.y)) {
                                fail(row, ImportFailureReason.COORD_OUT_OF_RANGE, input);
                            } else {
                                inserter.add(pointJson(c), propertiesOf(row), null, row.rowNo());
                                matched++;
                                stats.addRow(plainValues(row));
                            }
                        }
                    }
                    if (processed % BATCH == 0) checkpoint(inserter);
                    return true;
                });
                inserter.flush();
                geomType = "POINT";
                finish(null);
            }
        }

        // ---------- 공통 ----------

        void rowLimit(ExcelSheet.Row row) {
            processed++;
            fail(row, ImportFailureReason.ROW_LIMIT, "한도(" + maxRows + "행) 이후 행은 처리하지 않았습니다");
        }

        int columnIndex(String column, CustomException whenMissing) {
            int idx = column == null ? -1 : headers.indexOf(column);
            if (idx < 0) throw whenMissing;
            return idx;
        }

        void fail(ExcelSheet.Row row, ImportFailureReason reason, String input) {
            failed++;
            failureBuf.add(new FailureRow(row.rowNo(), reason.name(), input, null, rowJsonOf(row)));
        }

        /** AMBIGUOUS: 후보 문장을 JSON 배열로 함께 저장한다(보고서·실패 행 엑셀에 보인다). */
        void failWithCandidates(ExcelSheet.Row row, ImportFailureReason reason, String input, List<String> candidates) {
            failed++;
            String json = null;
            if (candidates != null && !candidates.isEmpty()) {
                try {
                    json = om.writeValueAsString(candidates);
                } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                    throw new IllegalStateException(e);
                }
            }
            failureBuf.add(new FailureRow(row.rowNo(), reason.name(), input, json, rowJsonOf(row)));
        }

        /** 진행률·실패 행을 저장한다. 레이어가 지워졌으면 LayerGone. */
        void checkpoint(FeatureBatchInserter inserter) {
            inserter.flush();
            store.insertFailures(id, failureBuf);
            failureBuf.clear();
            if (!store.updateProgress(id, processed, Math.max(req.totalRows(), processed))) throw new LayerGone();
        }

        void finish(String parcelVersion) {
            store.insertFailures(id, failureBuf);
            failureBuf.clear();
            String columnSchema = stats == null ? null : stats.toJson(false);
            if (!store.markReady(id, geomType, matched, matched, failed, processed, parcelVersion, columnSchema)) throw new LayerGone();
            log.info("[나만의지도] 가져오기 완료 id={} mode={} 처리={} 매칭={} 실패={}", id, req.mode(), processed, matched, failed);
        }

        /** 지도 속성: 모든 열의 값(숫자는 서식 없이). */
        String propertiesOf(ExcelSheet.Row row) {
            ObjectNode n = om.createObjectNode();
            for (int c = 0; c < headers.size(); c++) n.put(headers.get(c), row.cells().get(c).plain());
            return n.toString();
        }

        /** 통계용 값(속성으로 저장하는 값과 같다 — 숫자는 서식 없이). */
        List<String> plainValues(ExcelSheet.Row row) {
            List<String> out = new ArrayList<>(row.cells().size());
            for (CellData c : row.cells()) out.add(c.plain());
            return out;
        }

        /** 실패 행 원본: 엑셀에서 보이던 그대로. */
        String rowJsonOf(ExcelSheet.Row row) {
            ObjectNode n = om.createObjectNode();
            for (int c = 0; c < headers.size(); c++) n.put(headers.get(c), row.cells().get(c).text());
            return n.toString();
        }
    }

    /** @param input 실패 보고서에 보일 입력값(PNU 모드는 PNU, 주소 모드는 주소 원문) */
    private record PnuRow(ExcelSheet.Row row, String pnu, String properties, String input) {
    }

    static boolean inKorea(double lon, double lat) {
        return lon >= LON_MIN && lon <= LON_MAX && lat >= LAT_MIN && lat <= LAT_MAX;
    }

    private static Double numberOf(CellData d) {
        if (d.numeric()) return d.number();
        try {
            double v = Double.parseDouble(d.text().replace(",", "").strip());
            return Double.isFinite(v) ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String pointJson(Coordinate c) {
        try {
            StringWriter w = new StringWriter();
            geometryJSON.write(geometryFactory.createPoint(c), w);
            return w.toString();
        } catch (IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }

    /** {"type":"Polygon",…} 앞부분에서 타입만 읽어 대문자로(저장된 geom_type 형식과 맞춤). */
    static String geometryTypeOf(String geometryJson) {
        int i = geometryJson.indexOf("\"type\"");
        if (i < 0) return null;
        int q1 = geometryJson.indexOf('"', geometryJson.indexOf(':', i) + 1);
        int q2 = q1 < 0 ? -1 : geometryJson.indexOf('"', q1 + 1);
        return q2 < 0 ? null : geometryJson.substring(q1 + 1, q2).toUpperCase(Locale.ROOT);
    }
}
