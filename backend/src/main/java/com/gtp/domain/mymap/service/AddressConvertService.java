package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.dto.ConvertRequest;
import com.gtp.domain.mymap.dto.ConvertResult;
import com.gtp.domain.mymap.model.ImportFailureReason;
import com.gtp.domain.mymap.model.ImportMode;
import com.gtp.domain.mymap.port.*;
import com.gtp.domain.mymap.util.CellData;
import com.gtp.domain.mymap.util.CoordinateTransformUtil;
import com.gtp.domain.mymap.util.ExcelSheet;
import com.gtp.domain.mymap.util.ResultXlsx;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.Semaphore;

/**
 * 주소 변환("엑셀로만 받기"): 올려 둔 엑셀의 주소 칸을 풀어 PNU·표준 주소·좌표·면적을 덧붙인 결과 엑셀을 만든다.
 * <b>지도에 레이어를 만들지 않고(UserMap 행 0), 결과를 서버에 저장하지 않는다.</b> 올린 임시 파일(uploadId)은 변환이 성공한 직후에만 지운다
 * (실패하면 — 검사 거절이든 변환 도중 오류든 — 남겨 같은 uploadId로 다시 시도할 수 있게 하고, 30분 만료 정리가 지운다).
 *
 * 흐름(동기, 최대 5,000행): 시트를 한 번 읽고 → 주소 풀기(500개씩) → 표준 주소(도로 키 묶음 + 색인이 있을 때 지번 키 묶음) →
 * 필지 대표점·면적(PNU 묶음 500) → 결과 엑셀(SXSSF)·미리보기 5행. 응답에 base64로 싣는다.
 * 같은 사용자의 가져오기와 같은 자물쇠({@link ImportGuard})를 쓰고, 전체 동시 실행은 {@value #PARALLEL}건으로 막는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AddressConvertService {

    static final int PARALLEL = 2;
    static final int PREVIEW_ROWS = 5;
    static final int CHUNK = 500;

    static final String COL_STATUS = "매칭상태";
    static final String COL_PNU = "PNU";
    static final String COL_LEGAL_CODE = "법정동코드";
    static final String COL_ROAD = "표준_도로명주소";
    static final String COL_JIBUN = "표준_지번주소";
    static final String COL_AREA = "필지면적_㎡";
    static final String COL_REASON = "실패사유/후보";
    static final String STATUS_OK = "성공";
    static final String STATUS_FAIL = "실패";
    /** 지번 입력 행의 도로명주소 안내(색인 유무와 관계없이 같은 문구 — 색인 이야기는 사용자에게 하지 않는다) */
    static final String ROAD_NOTE = "도로명 입력 행은 찾은 건물로 채우고, 지번 입력 행은 건물정보에서 찾은 경우만 채웁니다.";

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final PendingUploadRegistry pendingUploads;
    private final AddressResolver addressResolver;
    private final PnuParcelProvider parcelProvider;
    private final ImportGuard importGuard;
    private final MyMapProperties props;

    private final Semaphore slots = new Semaphore(PARALLEL);

    /** 검사를 통과한 요청 값 */
    private record Options(int addressIdx, ConvertRequest.Include include, int srid) {
    }

    /** 한 행의 해석 결과 */
    private record RowResult(boolean ok, ImportFailureReason reason, List<String> candidates, String pnu,
                             StandardAddress standard, ParcelPoint point) {
    }

    public ConvertResult convert(ConvertRequest req, String ownerId) {
        PendingUploadRegistry.Pending pending = pendingUploads.find(req == null ? null : req.getUploadId(), ownerId)
                .orElseThrow(() -> new CustomException(GisErrorCode.EXCEL_UPLOAD_NOT_FOUND));

        // 검사 단계 — 거절해도 파일은 남긴다(고쳐서 다시 요청 가능)
        Options opt = validate(req, pending);
        if (!addressResolver.supported()) throw new CustomException(GisErrorCode.MYMAP_MODE_UNSUPPORTED, "주소 변환을 지원하지 않는 환경입니다.");
        Coverage coverage = parcelProvider.coverage();
        if (!coverage.available() || !addressResolver.available()) throw new CustomException(GisErrorCode.MYMAP_REF_UNAVAILABLE);
        if (!importGuard.tryAcquire(ownerId)) throw new CustomException(GisErrorCode.MYMAP_IMPORT_BUSY);
        if (!slots.tryAcquire()) {
            importGuard.release(ownerId);
            throw new CustomException(GisErrorCode.MYMAP_IMPORT_BUSY);
        }
        // 변환이 성공한 직후에만 임시 파일을 지운다. 변환 도중 실패(503·413·500 등)에는 남겨 같은 uploadId로 다시 시도할 수 있게 하고,
        // 남은 파일은 만료 정리(미리보기 TTL 30분)가 지운다. 자물쇠·동시 실행 칸은 어느 경로에서도 돌려준다.
        try {
            ConvertResult result = doConvert(pending.file(), pending.headers(), opt, coverage);
            pendingUploads.forget(pending.uploadId());
            deleteQuietly(pending.file());
            return result;
        } finally {
            slots.release();
            importGuard.release(ownerId);
        }
    }

    private Options validate(ConvertRequest req, PendingUploadRegistry.Pending pending) {
        String col = req.getAddressColumn();
        int idx = col == null ? -1 : pending.headers().indexOf(col);
        if (idx < 0) throw GisErrorCode.MYMAP_COLUMN_REQUIRED.exception(ImportMode.ADDRESS.label());
        int srid = req.getSrid() == null ? 4326 : req.getSrid();
        if (!CoordinateTransformUtil.OUTPUT_SRIDS.contains(srid)) throw GisErrorCode.MYMAP_SRID_UNSUPPORTED.exception(srid);
        ConvertRequest.Include inc = req.getInclude();
        if (inc == null) {
            inc = new ConvertRequest.Include();
            inc.setPnu(true);
            inc.setRoadAddress(true);
            inc.setJibunAddress(true);
            inc.setLonLat(true);
        }
        int maxRows = props.maxRowsFor(ImportMode.ADDRESS);
        if (pending.totalRows() > maxRows) throw GisErrorCode.MYMAP_ROW_LIMIT.exception(maxRows);
        return new Options(idx, inc, srid);
    }

    private ConvertResult doConvert(Path file, List<String> headers, Options opt, Coverage coverage) {
        int maxRows = props.maxRowsFor(ImportMode.ADDRESS);
        ConvertRequest.Include inc = opt.include();

        // 1) 시트 읽기 — 보이는 값(문자열)만 모은다(5,000행 한도)
        List<String[]> rows = new ArrayList<>();
        ExcelSheet.read(file, h -> {
        }, row -> {
            if (rows.size() >= maxRows) throw GisErrorCode.MYMAP_ROW_LIMIT.exception(maxRows);
            String[] values = new String[headers.size()];
            for (int c = 0; c < values.length; c++) values[c] = c < row.cells().size() ? row.cells().get(c).text() : "";
            rows.add(values);
            return true;
        });

        // 2) 주소 풀기 — 같은 주소는 한 번만, 500개씩
        Map<String, AddressMatch> matchByText = new HashMap<>();
        List<String> toSolve = new ArrayList<>();
        for (String[] r : rows) {
            String text = r[opt.addressIdx()];
            if (!text.isEmpty() && !matchByText.containsKey(text)) {
                matchByText.put(text, null);
                toSolve.add(text);
            }
        }
        List<AddressMatch> solved = new ArrayList<>(toSolve.size());
        for (int i = 0; i < toSolve.size(); i += CHUNK) {
            List<String> part = toSolve.subList(i, Math.min(i + CHUNK, toSolve.size()));
            List<AddressMatch> res = addressResolver.resolve(part);
            if (res.size() != part.size()) throw new IllegalStateException("주소 해석 결과 수가 입력과 다릅니다");
            solved.addAll(res);
        }
        for (int i = 0; i < toSolve.size(); i++) matchByText.put(toSolve.get(i), solved.get(i));

        // 3) 지도에 놓을 수 있는 PNU만(허용 시도·적재된 시도) — 아니면 OUT_OF_COVERAGE
        Set<String> allowed = new HashSet<>(props.getRef().getAllowedSidoCodes());
        List<AddressMatch> matchedList = new ArrayList<>();
        Map<String, ImportFailureReason> blocked = new HashMap<>();   // 주소 원문 → 사유
        for (String text : toSolve) {
            AddressMatch m = matchByText.get(text);
            if (m.status() != AddressMatch.Status.MATCHED) continue;
            String sido = m.pnu().substring(0, 2);
            if ((!allowed.isEmpty() && !allowed.contains(sido)) || !coverage.isLoaded(sido)) {
                blocked.put(text, ImportFailureReason.OUT_OF_COVERAGE);
            } else if (coverage.isSwapping(sido)) {
                throw new CustomException(GisErrorCode.MYMAP_REF_UNAVAILABLE);   // 지적도 교체 중 — 잠시 뒤 다시
            } else {
                matchedList.add(m);
            }
        }

        // 4) 표준 주소 · 필지 대표점·면적 (찾은 PNU 묶음). 필지 존재 확인을 위해 열 선택과 관계없이 대표점은 조회한다
        List<StandardAddress> standards = (inc.isRoadAddress() || inc.isJibunAddress())
                ? addressResolver.standardize(matchedList, inc.isRoadAddress(), inc.isJibunAddress())
                : null;
        Map<String, StandardAddress> standardByPnu = new HashMap<>();
        Set<String> pnus = new LinkedHashSet<>();
        for (int i = 0; i < matchedList.size(); i++) {
            AddressMatch m = matchedList.get(i);
            pnus.add(m.pnu());
            if (standards != null) standardByPnu.put(m.pnu() + "|" + keyOfBuilding(m), standards.get(i));
        }
        Map<String, ParcelPoint> points;
        try {
            points = pnus.isEmpty() ? Map.of() : parcelProvider.findPointsByPnus(pnus, inc.isArea());
        } catch (UnsupportedOperationException e) {
            throw new CustomException(GisErrorCode.MYMAP_MODE_UNSUPPORTED, "이 환경은 필지 좌표·면적 열을 지원하지 않습니다.");
        }

        // 5) 행별 결과
        List<RowResult> results = new ArrayList<>(rows.size());
        int matched = 0;
        for (String[] r : rows) {
            String text = r[opt.addressIdx()];
            RowResult rr;
            if (text.isEmpty()) {
                rr = new RowResult(false, ImportFailureReason.EMPTY, List.of(), null, StandardAddress.EMPTY, null);
            } else {
                AddressMatch m = matchByText.get(text);
                if (m.status() == AddressMatch.Status.AMBIGUOUS) {
                    rr = new RowResult(false, ImportFailureReason.AMBIGUOUS, m.candidates(), null, StandardAddress.EMPTY, null);
                } else if (m.status() == AddressMatch.Status.FAILED) {
                    rr = new RowResult(false, m.reason() != null ? m.reason() : ImportFailureReason.PARSE_FAILED, List.of(), null,
                            StandardAddress.EMPTY, null);
                } else if (blocked.containsKey(text)) {
                    rr = new RowResult(false, blocked.get(text), List.of(), m.pnu(), StandardAddress.EMPTY, null);
                } else {
                    StandardAddress std = standardByPnu.getOrDefault(m.pnu() + "|" + keyOfBuilding(m), StandardAddress.EMPTY);
                    ParcelPoint pt = points.get(m.pnu());
                    // 필지를 못 찾으면 PNU·표준 주소는 보여 주되 실패로 센다(지도에 오를 수 없는 행 — 가져오기와 같은 판정)
                    rr = pt == null
                            ? new RowResult(false, ImportFailureReason.PARCEL_NOT_FOUND, List.of(), m.pnu(), std, null)
                            : new RowResult(true, null, List.of(), m.pnu(), std, pt);
                }
            }
            if (rr.ok()) matched++;
            results.add(rr);
        }

        // 6) 열 구성 + 결과 엑셀
        Columns cols = new Columns(headers, inc, opt.srid());
        CoordinateTransformUtil.FromWgs84 projector = CoordinateTransformUtil.buildFromWgs84("EPSG:" + opt.srid());
        List<List<Object>> table = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) table.add(cols.rowOf(rows.get(i), results.get(i), projector));

        int failed = rows.size() - matched;
        byte[] bytes = writeXlsx(cols, table, coverage, matched, failed, opt);
        long maxBytes = props.getLimits().getMaxConvertResultMb() * 1024L * 1024L;
        if (bytes.length > maxBytes) throw new CustomException(GisErrorCode.MYMAP_FILE_TOO_LARGE,
                "변환 결과가 너무 큽니다(최대 " + props.getLimits().getMaxConvertResultMb() + "MB). 행을 나눠 올려 주세요");

        List<List<String>> preview = new ArrayList<>();
        for (int i = 0; i < Math.min(PREVIEW_ROWS, table.size()); i++) {
            List<String> line = new ArrayList<>(cols.names.size());
            for (Object v : table.get(i)) line.add(ResultXlsx.text(v));
            preview.add(line);
        }
        log.info("[나만의지도] 주소 변환 완료 행={} 성공={} 실패={} 결과={}KB", rows.size(), matched, failed, bytes.length / 1024);
        return ConvertResult.builder()
                .total(rows.size()).matched(matched).failed(failed)
                .fileName("주소변환_결과_" + LocalDate.now().format(DAY) + ".xlsx")
                .fileBase64(Base64.getEncoder().encodeToString(bytes))
                .preview(ConvertResult.Preview.builder().columns(cols.names).rows(preview).build())
                .build();
    }

    /** 도로명으로 찾은 행은 건물까지 같아야 표준 도로명주소가 같다 — PNU만으로는 건물이 갈릴 수 있다 */
    private static String keyOfBuilding(AddressMatch m) {
        AddressMatch.BuildingRef b = m.building();
        return b == null ? "" : b.roadCd() + "/" + b.udgd() + "/" + b.main() + "/" + b.sub();
    }

    // ---------- 열 ----------

    /** 결과 표의 열 이름과 행 만들기. 원본 열 이름과 겹치면 "이름 (2)"로 바꾼다. */
    private static final class Columns {
        final List<String> names = new ArrayList<>();
        final int original;
        final ConvertRequest.Include inc;
        final int srid;
        /** 덧붙인 열의 이름(열설명 시트용): [이름, 뜻] */
        final List<String[]> added = new ArrayList<>();
        String status, pnu, legalCode, road, jibun, x, y, area, reason;

        Columns(List<String> headers, ConvertRequest.Include inc, int srid) {
            this.original = headers.size();
            this.inc = inc;
            this.srid = srid;
            names.addAll(headers);
            Set<String> used = new HashSet<>(headers);
            status = add(used, COL_STATUS, "주소를 풀어 지적도 필지까지 찾으면 성공, 아니면 실패");
            if (inc.isPnu()) {
                pnu = add(used, COL_PNU, "필지고유번호 19자리 = 법정동코드(10) + 대지구분(1: 대지·2: 산) + 본번(4) + 부번(4)");
                legalCode = add(used, COL_LEGAL_CODE, "PNU의 앞 10자리(법정동코드)");
            }
            if (inc.isRoadAddress()) road = add(used, COL_ROAD, "도로명주소 활용 가이드(건물DB) 표기 규칙의 표준 도로명주소. " + ROAD_NOTE);
            if (inc.isJibunAddress()) jibun = add(used, COL_JIBUN, "시도 시군구 법정동 [리] [산 ]본번[-부번] 형식의 표준 지번주소");
            if (inc.isLonLat()) {
                String unit = srid == 4326 ? "도(WGS84)" : "m";
                x = add(used, srid == 4326 ? "경도" : "X좌표", "필지 안쪽 대표점(필지 안에 있는 점)의 " + (srid == 4326 ? "경도" : "동서 좌표") + ", 단위 " + unit);
                y = add(used, srid == 4326 ? "위도" : "Y좌표", "필지 안쪽 대표점의 " + (srid == 4326 ? "위도" : "남북 좌표") + ", 단위 " + unit);
            }
            if (inc.isArea()) area = add(used, COL_AREA, "필지 면적(제곱미터, 소수 1자리, 지구상 실제 면적)");
            reason = add(used, COL_REASON, "실패한 행의 사유. 같은 이름이 여러 곳이면 후보를 ' / '로 이어 보여 줌");
        }

        private String add(Set<String> used, String base, String meaning) {
            String name = base;
            for (int k = 2; !used.add(name); k++) name = base + " (" + k + ")";
            names.add(name);
            added.add(new String[]{name, meaning});
            return name;
        }

        List<Object> rowOf(String[] original, RowResult rr, CoordinateTransformUtil.FromWgs84 projector) {
            List<Object> out = new ArrayList<>(names.size());
            out.addAll(Arrays.asList(original));
            out.add(rr.ok() ? STATUS_OK : STATUS_FAIL);
            if (inc.isPnu()) {
                out.add(rr.pnu() == null ? "" : rr.pnu());
                out.add(rr.pnu() == null ? "" : rr.pnu().substring(0, 10));
            }
            if (inc.isRoadAddress()) out.add(rr.standard().road());
            if (inc.isJibunAddress()) out.add(rr.standard().jibun());
            if (inc.isLonLat()) {
                if (rr.point() == null) {
                    out.add(null);
                    out.add(null);
                } else if (srid == 4326) {
                    out.add(new ResultXlsx.Num(rr.point().lon(), 7));
                    out.add(new ResultXlsx.Num(rr.point().lat(), 7));
                } else {
                    double[] xy = projector.toXy(rr.point().lon(), rr.point().lat());
                    out.add(new ResultXlsx.Num(xy[0], 2));
                    out.add(new ResultXlsx.Num(xy[1], 2));
                }
            }
            if (inc.isArea()) out.add(rr.point() == null || rr.point().areaSqm() == null ? null : new ResultXlsx.Num(rr.point().areaSqm(), 1));
            out.add(reasonText(rr));
            return out;
        }
    }

    /** 사유 한글 라벨(ImportFailureReason) + 후보가 있으면 " (후보: 가 / 나)". 성공이면 "" */
    static String reasonText(RowResult rr) {
        if (rr.ok() || rr.reason() == null) return "";
        String label = rr.reason().message();
        return rr.candidates().isEmpty() ? label : label + " (후보: " + String.join(" / ", rr.candidates()) + ")";
    }

    private byte[] writeXlsx(Columns cols, List<List<Object>> table, Coverage coverage, int matched, int failed, Options opt) {
        try (ResultXlsx x = new ResultXlsx(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            ResultXlsx.Table sheet = x.table("결과");
            sheet.header(cols.names);
            for (List<Object> r : table) sheet.row(r);

            ResultXlsx.Table desc = x.table("열설명");
            desc.header(List.of("열", "뜻"));
            for (String[] a : cols.added) desc.row(List.of(a[0], a[1]));
            desc.row(List.of("", ""));
            desc.row(List.of("지적도 기준월", orDash(coverage.parcelVersion())));
            desc.row(List.of("건물DB 기준월", orDash(addressResolver.referenceVersion())));
            desc.row(List.of("좌표계", opt.srid() == 4326 ? "EPSG:4326 (경도·위도, 도)" : "EPSG:" + opt.srid() + " (X좌표·Y좌표, m)"));
            desc.row(List.of("참고: 필지면적", "필지면적_㎡는 지구 표면 기준 계산값이라 토지대장 면적과 다를 수 있습니다"));
            desc.row(List.of("참고: 지적도에 없는 필지", "지적도에 없는 필지는 실패로 세지만 PNU·표준 주소는 채워질 수 있습니다"));
            desc.row(List.of("처리 결과", "전체 " + table.size() + "행 · 성공 " + matched + " · 실패 " + failed));
            x.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }

    private static String orDash(String s) {
        return s == null || s.isBlank() ? "-" : s;
    }

    private static void deleteQuietly(Path p) {
        if (p == null) return;
        try {
            Files.deleteIfExists(p);
        } catch (IOException ignored) {
            // 만료 정리 작업이 이어받는다
        }
    }
}
