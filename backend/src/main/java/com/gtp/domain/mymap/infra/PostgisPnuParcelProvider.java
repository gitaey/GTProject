package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.port.Coverage;
import com.gtp.domain.mymap.port.ParcelPoint;
import com.gtp.domain.mymap.port.ParcelShape;
import com.gtp.domain.mymap.port.PnuParcelProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcOperations;

import java.sql.Connection;
import java.util.*;
import java.util.regex.Pattern;

/**
 * 서비스 DB(또는 별도 참조 DB)의 연속지적도 표를 PNU로 읽는 기본 구현. JPA 엔티티로 매핑하지 않고 JDBC만 쓴다
 * ({@code ddl-auto: update}가 참조 표를 건드리지 못하게).
 *
 * 조회는 {@code sido = ANY(앞 2자리 목록) AND pnu = ANY(500개)}라서 시도별 파티션만 읽는다. 같은 PNU가 여러 폴리곤이면
 * (드묾) 따로 한 번 더 {@code ST_Union}으로 합친다 — 보통의 경로는 저장된 모양을 그대로 돌려준다.
 */
@Slf4j
public class PostgisPnuParcelProvider implements PnuParcelProvider {

    static final int CHUNK = 500;
    private static final Pattern IDENT = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z_][A-Za-z0-9_]*)?");
    private static final Pattern PNU = Pattern.compile("\\d{19}");

    private final JdbcOperations jdbc;
    private final String selectSql;
    private final String unionSql;
    private final String coverageSql;
    private final String pointSql;
    private final String pointAreaSql;

    public PostgisPnuParcelProvider(JdbcOperations jdbc, MyMapProperties.Ref ref) {
        this.jdbc = jdbc;
        MyMapProperties.Parcel p = ref.getParcel();
        String table = ident(p.getTable());
        String pnu = ident(p.getPnuColumn());
        String jibun = ident(p.getJibunColumn());
        String sido = ident(p.getSidoColumn());
        String geom = ident(p.getGeomColumn());
        String geomExpr = p.getSrid() == 4326 ? geom : "ST_Transform(" + geom + ", 4326)";
        String where = " FROM " + table + " WHERE " + sido + " = ANY(?::char(2)[]) AND " + pnu + " = ANY(?::varchar[])";
        this.selectSql = "SELECT " + pnu + " AS pnu, " + jibun + " AS jibun, ST_AsGeoJSON(" + geomExpr + ", 7) AS geojson" + where;
        this.unionSql = "SELECT " + pnu + " AS pnu, min(" + jibun + ") AS jibun, ST_AsGeoJSON(ST_Union(" + geomExpr + "), 7) AS geojson"
                + where + " GROUP BY " + pnu;
        // 대표점·면적: PNU 한 건에 폴리곤이 여럿이면(드묾) 가장 넓은 폴리곤의 안쪽 점 + 면적 합. 면적은 geography(㎡). 모양 전체는 읽지 않는다.
        String inner = "SELECT " + pnu + " AS pnu, " + geomExpr + " AS g" + where;
        String pointHead = "SELECT pnu, ST_X(p) AS lon, ST_Y(p) AS lat, a FROM (SELECT pnu, "
                + "(array_agg(ST_PointOnSurface(g) ORDER BY ST_Area(g) DESC))[1] AS p, ";
        this.pointSql = pointHead + "NULL::float8 AS a FROM (" + inner + ") s GROUP BY pnu) t";
        this.pointAreaSql = pointHead + "sum(ST_Area(g::geography)) AS a FROM (" + inner + ") s GROUP BY pnu) t";
        this.coverageSql = "SELECT sido, version, status FROM " + ident(ref.getLoadMetaTable()) + " WHERE dataset = 'parcel'";
    }

    /** 설정에서 온 표·컬럼 이름이 SQL에 그대로 들어가므로 식별자 모양만 허용한다. */
    static String ident(String name) {
        if (name == null || !IDENT.matcher(name).matches()) {
            throw new IllegalArgumentException("mymap.ref 설정의 표·컬럼 이름이 올바르지 않습니다: " + name);
        }
        return name;
    }

    String selectSql() {
        return selectSql;
    }

    String unionSql() {
        return unionSql;
    }

    String pointSql(boolean withArea) {
        return withArea ? pointAreaSql : pointSql;
    }

    /** 필지 안쪽 대표점(ST_PointOnSurface)과 면적(ST_Area(geography), ㎡ 소수 1자리). PNU 목록으로만 조회한다(500개씩, 시도 파티션 키 포함). */
    @Override
    public Map<String, ParcelPoint> findPointsByPnus(Collection<String> pnus, boolean withArea) {
        TreeSet<String> distinct = new TreeSet<>();
        for (String p : pnus) {
            if (p != null && PNU.matcher(p).matches()) distinct.add(p);
        }
        Map<String, ParcelPoint> out = new HashMap<>();
        List<String> all = new ArrayList<>(distinct);
        String sql = pointSql(withArea);
        for (int i = 0; i < all.size(); i += CHUNK) {
            List<String> chunk = all.subList(i, Math.min(i + CHUNK, all.size()));
            String[] sidos = chunk.stream().map(p -> p.substring(0, 2)).distinct().toArray(String[]::new);
            String[] pnuArr = chunk.toArray(String[]::new);
            jdbc.query(sql, ps -> bind(ps, sidos, pnuArr), rs -> {
                double a = rs.getDouble("a");
                Double area = withArea && !rs.wasNull() ? Math.round(a * 10.0) / 10.0 : null;
                out.put(rs.getString("pnu"), new ParcelPoint(rs.getString("pnu"), rs.getDouble("lon"), rs.getDouble("lat"), area));
            });
        }
        return out;
    }

    @Override
    public Map<String, ParcelShape> findByPnus(Collection<String> pnus) {
        TreeSet<String> distinct = new TreeSet<>();
        for (String p : pnus) {
            if (p != null && PNU.matcher(p).matches()) distinct.add(p);
        }
        Map<String, ParcelShape> out = new HashMap<>();
        List<String> all = new ArrayList<>(distinct);
        for (int i = 0; i < all.size(); i += CHUNK) {
            queryChunk(all.subList(i, Math.min(i + CHUNK, all.size())), out);
        }
        return out;
    }

    private void queryChunk(List<String> chunk, Map<String, ParcelShape> out) {
        String[] sidos = chunk.stream().map(p -> p.substring(0, 2)).distinct().toArray(String[]::new);
        String[] pnuArr = chunk.toArray(String[]::new);

        Map<String, List<ParcelShape>> byPnu = new HashMap<>();
        jdbc.query(selectSql, ps -> bind(ps, sidos, pnuArr), rs -> {
            ParcelShape s = new ParcelShape(rs.getString("pnu"), rs.getString("jibun"), rs.getString("geojson"));
            byPnu.computeIfAbsent(s.pnu(), k -> new ArrayList<>(1)).add(s);
        });

        List<String> multi = new ArrayList<>();
        for (Map.Entry<String, List<ParcelShape>> e : byPnu.entrySet()) {
            if (e.getValue().size() == 1) out.put(e.getKey(), e.getValue().get(0));
            else multi.add(e.getKey());
        }
        if (multi.isEmpty()) return;

        // 같은 PNU 다중 폴리곤 — ST_Union으로 하나로. 합치기에 실패하면 첫 폴리곤을 쓰고 알린다.
        try {
            String[] multiSidos = multi.stream().map(p -> p.substring(0, 2)).distinct().toArray(String[]::new);
            String[] multiPnus = multi.toArray(String[]::new);
            jdbc.query(unionSql, ps -> bind(ps, multiSidos, multiPnus), rs -> {
                out.put(rs.getString("pnu"), new ParcelShape(rs.getString("pnu"), rs.getString("jibun"), rs.getString("geojson")));
            });
        } catch (DataAccessException ex) {
            log.warn("[나만의지도] 같은 PNU 다중 폴리곤 합치기 실패 {}건 — 첫 폴리곤을 씁니다: {}", multi.size(), ex.getMessage());
        }
        for (String p : multi) {
            out.computeIfAbsent(p, k -> byPnu.get(k).get(0));
        }
    }

    private static void bind(java.sql.PreparedStatement ps, String[] sidos, String[] pnus) throws java.sql.SQLException {
        Connection con = ps.getConnection();
        ps.setArray(1, con.createArrayOf("varchar", sidos)); // SQL에서 ::char(2)[]로 바꾼다(파티션 키 형식)
        ps.setArray(2, con.createArrayOf("varchar", pnus));
    }

    @Override
    public Coverage coverage() {
        try {
            Map<String, String> versions = new HashMap<>();
            Set<String> swapping = new HashSet<>();
            jdbc.query(coverageSql, rs -> {
                String sido = rs.getString("sido");
                if (sido == null) return;
                sido = sido.trim();
                versions.put(sido, rs.getString("version"));
                if ("SWAPPING".equalsIgnoreCase(rs.getString("status"))) swapping.add(sido);
            });
            return new Coverage(versions, swapping);
        } catch (DataAccessException e) {
            log.warn("[나만의지도] 지적도 적재 기록을 읽지 못했습니다(load_meta): {}", e.getMessage());
            return Coverage.unavailable();
        }
    }
}
