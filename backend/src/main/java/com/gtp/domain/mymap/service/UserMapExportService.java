package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.core.JsonEncoding;
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapImportFailure;
import com.gtp.domain.mymap.model.ImportFailureReason;
import com.gtp.domain.mymap.port.AddressResolver;
import com.gtp.domain.mymap.repository.UserMapImportFailureRepository;
import com.gtp.domain.mymap.util.CoordinateTransformUtil;
import com.gtp.domain.mymap.util.ResultXlsx;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.geotools.geojson.geom.GeometryJSON;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.Point;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.OutputStream;
import java.io.StringReader;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.PreparedStatement;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * 나만의지도 레이어 내보내기(엑셀·GeoJSON). 권한은 geojson 보기와 같다({@link UserMapService#loadExportable} — 소유자·공유받은 사람, 처리 끝난 레이어만).
 *
 * <b>메모리에 전부 올리지 않는다</b>: 피처는 JDBC 커서(fetchSize 500)로 한 행씩 읽어 바로 쓰고(엑셀은 SXSSF 100행 창, GeoJSON은 JsonGenerator),
 * 실패 행은 1,000건씩 페이지로 읽는다. 호출 순서: {@link #prepare}(검사·헤더 재료) → 응답 헤더 설정 → {@link #stream}(본문). 본문을 쓰기 시작하면
 * 오류를 JSON 봉투로 못 돌려주므로 모든 검사는 prepare에서 끝낸다.
 *
 * 엑셀 열: 속성 열(레이어 column_schema 순서) + [PNU·표준_지번주소 — PNU 레이어만] + 경도·위도(또는 X좌표·Y좌표) + [includeFailed: 매칭상태·실패사유].
 * GeoJSON: 저장된 피처 그대로(properties + geometry), srid가 4326이 아니면 좌표를 변환하고 FeatureCollection에 crs 멤버를 넣는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserMapExportService {

    static final int STREAM_FETCH_SIZE = 500;
    static final int EXPORT_PARALLEL = 2;
    static final int FAILURE_PAGE = 1000;
    static final String COL_STATUS = "매칭상태";
    static final String COL_REASON = "실패사유";
    static final String STATUS_OK = "성공";
    static final String STATUS_FAIL = "실패";
    public static final String HEADER_FAILED_SKIPPED = "X-Export-Failed-Skipped";

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final Pattern UNSAFE_NAME = Pattern.compile("[\\p{Cntrl}\"'\\\\/:*?<>|;%,&]+");
    private static final Pattern DOTS_SPACES = Pattern.compile("^[.\\s_]+|[.\\s_]+$");

    public enum Format {
        XLSX("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        GEOJSON("geojson", "application/geo+json");

        final String ext;
        final String contentType;

        Format(String ext, String contentType) {
            this.ext = ext;
            this.contentType = contentType;
        }
    }

    /** 검사를 마친 내보내기 요청 — 응답 헤더 재료와 본문 쓰기에 필요한 값 */
    public record Prepared(UserMap map, Format format, int srid, boolean includeFailed, boolean failedSkipped,
                           String fileName, String contentType, List<String> columns) {
    }

    private final UserMapService userMapService;
    private final MyMapColumnService columnService;
    private final UserMapImportFailureRepository failureRepository;
    private final AddressResolver addressResolver;
    private final JdbcTemplate jdbc;

    private final java.util.concurrent.Semaphore exportSlots = new java.util.concurrent.Semaphore(EXPORT_PARALLEL);
    private final ObjectMapper om = new ObjectMapper();
    private final JsonFactory jsonFactory = new JsonFactory();

    // ---------- 검사 ----------

    /**
     * 요청 값(형식·좌표계)과 권한을 검사하고 응답 헤더에 쓸 값을 정한다. 아무것도 쓰지 않는다.
     * 오류: 형식 400 MYMAP_EXPORT_FORMAT_INVALID, 좌표계 400 MYMAP_SRID_UNSUPPORTED, 레이어 없음 404, 권한 없음 403, 처리 중 409.
     */
    public Prepared prepare(Long id, String userId, List<String> roleCodes, String formatRaw, String sridRaw, boolean includeFailed) {
        Format format = parseFormat(formatRaw);
        int srid = parseSrid(sridRaw);
        UserMap map = userMapService.loadExportable(id, userId, roleCodes);
        boolean xlsxFailed = includeFailed && format == Format.XLSX;
        // 실패 행을 붙이라고 했는데 보관 기간(30일)이 지나 지워졌으면 건너뛰고 알린다. 처음부터 실패가 없던 레이어는 해당 없음.
        boolean skipped = xlsxFailed && map.getFailedCount() > 0 && failureRepository.countByUserMapId(map.getId()) == 0;
        List<String> columns = format == Format.XLSX ? attributeColumns(map) : List.of();
        return new Prepared(map, format, srid, xlsxFailed && !skipped, skipped, fileName(map.getName(), format),
                format.contentType, columns);
    }

    static Format parseFormat(String raw) {
        String f = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        return switch (f) {
            case "xlsx" -> Format.XLSX;
            case "geojson" -> Format.GEOJSON;
            default -> throw new CustomException(GisErrorCode.MYMAP_EXPORT_FORMAT_INVALID);
        };
    }

    /** "4326"·"EPSG:5186" 모두 받는다. 비어 있으면 4326. 네 가지 밖이면 400 */
    static int parseSrid(String raw) {
        String s = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        if (s.isEmpty()) return 4326;
        if (s.startsWith("EPSG:")) s = s.substring(5);
        try {
            int srid = Integer.parseInt(s);
            if (CoordinateTransformUtil.OUTPUT_SRIDS.contains(srid)) return srid;
        } catch (NumberFormatException ignored) {
            // 아래에서 거절
        }
        throw GisErrorCode.MYMAP_SRID_UNSUPPORTED.exception(raw == null ? "" : raw.length() > 20 ? raw.substring(0, 20) : raw);
    }

    /** 레이어 이름 → 안전한 파일 이름 "{이름}_yyyyMMdd.{확장자}". 제어문자·따옴표·경로·헤더에 쓰이는 글자를 지운다. */
    static String fileName(String layerName, Format format) {
        String base = UNSAFE_NAME.matcher(layerName == null ? "" : layerName).replaceAll("_");
        base = DOTS_SPACES.matcher(base).replaceAll("");
        if (base.codePointCount(0, base.length()) > 80) base = base.substring(0, base.offsetByCodePoints(0, 80));   // 서로게이트 쌍을 가르지 않는다
        if (base.isEmpty()) base = "layer";
        return base + "_" + LocalDate.now().format(DAY) + "." + format.ext;
    }

    private List<String> attributeColumns(UserMap map) {
        List<String> names = new ArrayList<>();
        for (JsonNode c : columnService.schemaOf(map).path("columns")) names.add(c.path("name").asText());
        return names;
    }

    // ---------- 본문 ----------

    /**
     * 본문을 쓴다. 커서를 쓰려면 트랜잭션이 필요하다(PostgreSQL). 호출 전에 prepare로 모든 검사를 끝내야 한다.
     *
     * <b>전체 동시 {@value #EXPORT_PARALLEL}건 제한</b>: 스트리밍하는 동안 DB 연결(커서)을 계속 잡으므로 연결 풀이 마르지 않게 막는다.
     * 자리는 본문을 다 쓰거나 예외가 나거나 클라이언트가 끊어도(쓰기 IOException) finally에서 돌려준다 — 스트림이 끝나기 전에는 풀리지 않는다.
     * 자리가 없으면 아무것도 쓰기 전에 429 MYMAP_EXPORT_BUSY(JSON 봉투).
     *
     * @param beforeBody 자리를 얻은 뒤 본문을 쓰기 직전에 부른다(응답 헤더 설정용 — 429일 때는 헤더가 먼저 나가지 않는다)
     */
    @Transactional(readOnly = true)
    public void stream(Prepared p, Runnable beforeBody, OutputStream out) {
        if (!exportSlots.tryAcquire()) throw new CustomException(GisErrorCode.MYMAP_EXPORT_BUSY);
        try {
            beforeBody.run();
            if (p.format() == Format.GEOJSON) streamGeoJson(p, out);
            else streamXlsx(p, out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } finally {
            exportSlots.release();
        }
    }

    /** 시험용: 남은 동시 실행 자리 */
    int availableExportSlots() {
        return exportSlots.availablePermits();
    }

    private void forEachFeature(long mapId, FeatureVisitor visitor) {
        jdbc.query(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "SELECT pnu, geometry_json, properties_json FROM tbl_user_map_feature WHERE user_map_id = ? ORDER BY id");
            ps.setFetchSize(STREAM_FETCH_SIZE);
            ps.setLong(1, mapId);
            return ps;
        }, rs -> {
            try {
                visitor.visit(rs.getString("pnu"), rs.getString("geometry_json"), rs.getString("properties_json"));
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
    }

    @FunctionalInterface
    private interface FeatureVisitor {
        void visit(String pnu, String geometryJson, String propertiesJson) throws IOException;
    }

    // ---------- GeoJSON ----------

    private void streamGeoJson(Prepared p, OutputStream out) throws IOException {
        CoordinateTransformUtil.FromWgs84 projector = p.srid() == 4326 ? null : CoordinateTransformUtil.buildFromWgs84("EPSG:" + p.srid());
        try (JsonGenerator gen = jsonFactory.createGenerator(out, JsonEncoding.UTF8)) {
            gen.configure(JsonGenerator.Feature.AUTO_CLOSE_TARGET, false);
            gen.writeStartObject();
            gen.writeStringField("type", "FeatureCollection");
            if (projector != null) {
                gen.writeObjectFieldStart("crs");
                gen.writeStringField("type", "name");
                gen.writeObjectFieldStart("properties");
                gen.writeStringField("name", "urn:ogc:def:crs:EPSG::" + p.srid());
                gen.writeEndObject();
                gen.writeEndObject();
            }
            gen.writeArrayFieldStart("features");
            forEachFeature(p.map().getId(), (pnu, geometryJson, propertiesJson) -> {
                gen.writeStartObject();
                gen.writeStringField("type", "Feature");
                gen.writeFieldName("geometry");
                if (projector == null) gen.writeRawValue(geometryJson);
                else writeGeometry(gen, om.readTree(geometryJson), projector);
                gen.writeFieldName("properties");
                gen.writeRawValue(propertiesJson != null ? propertiesJson : "{}");
                gen.writeEndObject();
            });
            gen.writeEndArray();
            gen.writeEndObject();
            gen.flush();
        }
    }

    /** 저장된 4326 geometry를 대상 좌표계로 바꿔 쓴다(미터 좌표계는 소수 3자리). */
    private static void writeGeometry(JsonGenerator gen, JsonNode g, CoordinateTransformUtil.FromWgs84 t) throws IOException {
        gen.writeStartObject();
        String type = g.path("type").asText();
        gen.writeStringField("type", type);
        if ("GeometryCollection".equals(type)) {
            gen.writeArrayFieldStart("geometries");
            for (JsonNode sub : g.path("geometries")) writeGeometry(gen, sub, t);
            gen.writeEndArray();
        } else {
            gen.writeFieldName("coordinates");
            writeCoordinates(gen, g.path("coordinates"), t);
        }
        gen.writeEndObject();
    }

    private static void writeCoordinates(JsonGenerator gen, JsonNode n, CoordinateTransformUtil.FromWgs84 t) throws IOException {
        gen.writeStartArray();
        if (n.size() >= 2 && n.get(0).isNumber()) {
            double[] xy = t.toXy(n.get(0).asDouble(), n.get(1).asDouble());
            gen.writeNumber(BigDecimal.valueOf(xy[0]).setScale(3, RoundingMode.HALF_UP));
            gen.writeNumber(BigDecimal.valueOf(xy[1]).setScale(3, RoundingMode.HALF_UP));
            for (int i = 2; i < n.size(); i++) gen.writeNumber(n.get(i).asDouble());
        } else {
            for (JsonNode child : n) writeCoordinates(gen, child, t);
        }
        gen.writeEndArray();
    }

    // ---------- 엑셀 ----------

    private void streamXlsx(Prepared p, OutputStream out) throws IOException {
        UserMap map = p.map();
        boolean hasPnu = "EXCEL_PNU".equals(map.getSourceKind()) || "EXCEL_ADDRESS".equals(map.getSourceKind());
        boolean lonLat = p.srid() == 4326;
        CoordinateTransformUtil.FromWgs84 projector = lonLat ? null : CoordinateTransformUtil.buildFromWgs84("EPSG:" + p.srid());
        Function<String, String> jibun = hasPnu ? addressResolver.jibunAddressFormatter() : pnu -> "";
        List<String> attrs = p.columns();

        List<String> header = new ArrayList<>(attrs);
        Set<String> used = new HashSet<>(attrs);
        if (hasPnu) {
            header.add(unique(used, "PNU"));
            header.add(unique(used, "표준_지번주소"));
        }
        header.add(unique(used, lonLat ? "경도" : "X좌표"));
        header.add(unique(used, lonLat ? "위도" : "Y좌표"));
        String statusCol = null, reasonCol = null;
        if (p.includeFailed()) {
            statusCol = unique(used, COL_STATUS);
            reasonCol = unique(used, COL_REASON);
            header.add(statusCol);
            header.add(reasonCol);
        }

        try (ResultXlsx x = new ResultXlsx()) {
            ResultXlsx.Table sheet = x.table(sheetName(map.getName()));
            sheet.header(header);
            boolean withFailed = p.includeFailed();
            forEachFeature(map.getId(), (pnu, geometryJson, propertiesJson) -> {
                JsonNode props = parse(propertiesJson);
                List<Object> row = new ArrayList<>(header.size());
                for (String col : attrs) {
                    JsonNode v = props == null ? null : props.get(col);
                    row.add(v == null || v.isNull() ? "" : v.asText());
                }
                if (hasPnu) {
                    row.add(pnu == null ? "" : pnu);
                    row.add(pnu == null ? "" : jibun.apply(pnu));
                }
                double[] pt = representativePoint(geometryJson);
                if (pt == null) {
                    row.add(null);
                    row.add(null);
                } else if (lonLat) {
                    row.add(new ResultXlsx.Num(pt[0], 7));
                    row.add(new ResultXlsx.Num(pt[1], 7));
                } else {
                    double[] xy = projector.toXy(pt[0], pt[1]);
                    row.add(new ResultXlsx.Num(xy[0], 2));
                    row.add(new ResultXlsx.Num(xy[1], 2));
                }
                if (withFailed) {
                    row.add(STATUS_OK);
                    row.add("");
                }
                sheet.row(row);
            });
            if (withFailed) appendFailures(map.getId(), attrs, hasPnu, sheet, header.size());
            x.write(out);
        }
        out.flush();
    }

    /** 보관 중인 실패 행을 뒤에 덧붙인다(원본 값 + 매칭상태 "실패" + 사유 라벨(+ 후보)). 1,000건씩 읽는다. */
    private void appendFailures(long mapId, List<String> attrs, boolean hasPnu, ResultXlsx.Table sheet, int width) {
        int extra = (hasPnu ? 2 : 0) + 2;   // PNU·지번주소, 좌표 두 칸
        for (int pageNo = 0; ; pageNo++) {
            Page<UserMapImportFailure> page = failureRepository.findByUserMapId(mapId,
                    PageRequest.of(pageNo, FAILURE_PAGE, Sort.by("rowNo").ascending().and(Sort.by("id").ascending())));
            for (UserMapImportFailure f : page.getContent()) {
                JsonNode json = parse(f.getRowJson());
                List<Object> row = new ArrayList<>(width);
                for (String col : attrs) {
                    JsonNode v = json == null ? null : json.get(col);
                    row.add(v == null || v.isNull() ? "" : v.asText());
                }
                for (int i = 0; i < extra; i++) row.add(null);
                row.add(STATUS_FAIL);
                row.add(failureText(f));
                sheet.row(row);
            }
            if (!page.hasNext()) break;
        }
    }

    private String failureText(UserMapImportFailure f) {
        String label = ImportFailureReason.messageOf(f.getReasonCode());
        List<String> candidates = candidatesOf(f.getCandidatesJson());
        return candidates.isEmpty() ? label : label + " (후보: " + String.join(" / ", candidates) + ")";
    }

    private List<String> candidatesOf(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            List<String> out = new ArrayList<>();
            for (JsonNode n : om.readTree(json)) out.add(n.asText());
            return out;
        } catch (IOException e) {
            return List.of();
        }
    }

    /** 이름이 이미 있으면 "이름 (2)" */
    private static String unique(Set<String> used, String base) {
        String name = base;
        for (int k = 2; !used.add(name); k++) name = base + " (" + k + ")";
        return name;
    }

    /** 시트 이름 규칙(31자 이하, \ / ? * [ ] : 금지)에 맞춘 레이어 이름 */
    static String sheetName(String layerName) {
        String s = layerName == null ? "" : layerName.replaceAll("[\\\\/?*\\[\\]:\\p{Cntrl}']", "_").strip();
        if (s.length() > 31) s = s.substring(0, 31);
        return s.isEmpty() ? "레이어" : s;
    }

    private JsonNode parse(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return om.readTree(json);
        } catch (IOException e) {
            return null;
        }
    }

    private final GeometryJSON geometryReader = new GeometryJSON(9);

    /**
     * 피처의 대표점 [경도, 위도](4326). 점은 그 점, 그 밖에는 모양 안쪽의 점(JTS getInteriorPoint — 오목한 필지에서도 안쪽).
     * 읽을 수 없는 모양이면 null.
     */
    double[] representativePoint(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            JsonNode g = om.readTree(json);
            if ("Point".equals(g.path("type").asText())) {
                JsonNode c = g.path("coordinates");
                if (c.size() >= 2 && c.get(0).isNumber() && c.get(1).isNumber()) return new double[]{c.get(0).asDouble(), c.get(1).asDouble()};
                return null;
            }
            Geometry geom;
            synchronized (geometryReader) {   // GeometryJSON이 스레드 안전한지 문서화돼 있지 않아 요청마다 하나씩이 아니라 잠가서 쓴다
                geom = geometryReader.read(new StringReader(json));
            }
            if (geom == null || geom.isEmpty()) return null;
            Point pt = geom.getInteriorPoint();
            return new double[]{pt.getX(), pt.getY()};
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }
}
