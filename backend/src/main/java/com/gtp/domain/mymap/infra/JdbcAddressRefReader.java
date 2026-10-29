package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.config.MyMapProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcOperations;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * 도로명주소 건물DB(ref.ti_spbd_buld·ref.ti_sprd_stret)를 JDBC로 읽는 기본 구현. 읽기 전용 SELECT뿐이고 JPA로 매핑하지 않는다.
 * PostgreSQL 배열 바인딩({@code ANY(?::varchar[])}·{@code unnest})을 쓴다 — 다른 DB로 옮길 때는 이 클래스 대신 {@link AddressRefReader}를 새로 구현한다.
 *
 * 건물 조회는 {@code (road_cd, udgd_yn, buld_mnnm, buld_slno)} 인덱스를 타는 키 묶음 JOIN이고, 법정동 사전은 건물정보에서
 * distinct로 한 번 읽는다(약 1.9만 줄 — 새 표·인덱스를 만들지 않는다).
 */
@Slf4j
public class JdbcAddressRefReader implements AddressRefReader {

    static final int CHUNK = 500;

    private final JdbcOperations jdbc;
    private final String legalDongSql;
    private final String roadCodeSql;
    private final String buildingSql;
    private final String readySql;
    private final String buildingDataset;
    private final String roadDataset;
    private final String standardByRoadSql;
    private final String standardByJibunSql;
    private final String jibunIndexName;
    private final String jibunIndexSql;

    /** 색인이 없다고 확인한 결과는 이 시간이 지나면 다시 확인한다(운영자가 색인을 만든 뒤 재시작 없이 켜지게) */
    static final long NEGATIVE_RECHECK_NANOS = 5L * 60 * 1_000_000_000L;

    private record IndexState(String version, boolean ready, long checkedAtNanos) {
    }

    private volatile IndexState indexState;

    public JdbcAddressRefReader(JdbcOperations jdbc, MyMapProperties.Ref ref) {
        this.jdbc = jdbc;
        String building = PostgisPnuParcelProvider.ident(ref.getAddress().getBuildingTable());
        String road = PostgisPnuParcelProvider.ident(ref.getAddress().getRoadCodeTable());
        this.buildingDataset = datasetOf(building);
        this.roadDataset = datasetOf(road);
        this.legalDongSql = "SELECT DISTINCT adm_cd, ctp_kor_nm, sig_kor_nm, emd_kor_nm, li_kor_nm FROM " + building;
        this.roadCodeSql = "SELECT road_cd, ctp_kor_nm, sig_kor_nm, rn, "
                + "bool_or(coalesce(use_yn, '0') = '0' AND coalesce(ersr_de, '') = '') AS active "
                + "FROM " + road + " WHERE rn = ANY(?::varchar[]) GROUP BY road_cd, ctp_kor_nm, sig_kor_nm, rn";
        this.buildingSql = "SELECT b.road_cd, b.udgd_yn, b.buld_mnnm, b.buld_slno, b.adm_cd, b.mntn_yn, b.lnbr_mnnm, b.lnbr_slno, "
                + "b.ctp_kor_nm, b.sig_kor_nm, b.emd_kor_nm, b.li_kor_nm, b.rn "
                + "FROM unnest(?::varchar[], ?::varchar[], ?::int[], ?::int[]) AS k(road_cd, udgd_yn, buld_mnnm, buld_slno) "
                + "JOIN " + building + " b ON b.road_cd = k.road_cd AND b.udgd_yn = k.udgd_yn "
                + "AND b.buld_mnnm = k.buld_mnnm AND b.buld_slno = k.buld_slno "
                + "WHERE coalesce(b.mv_rs_cd, '') NOT IN ('63', '72')";
        this.readySql = "SELECT dataset, version, status FROM " + PostgisPnuParcelProvider.ident(ref.getLoadMetaTable())
                + " WHERE dataset IN (?, ?)";

        // 표준 주소 재료: 건물 1건 + 도로명코드 표의 읍면동구분(도로명코드 PK로 찾는다 — 도로명코드 12자리 = 시군구코드 5 + 도로명번호 7)
        String standardCols = "k.n, b.udgd_yn, b.buld_mnnm, b.buld_slno, b.ctp_kor_nm, b.sig_kor_nm, b.emd_kor_nm, b.li_kor_nm, b.rn, "
                + "b.apt_yn, b.sgg_buld_nm, s.emd_gb";
        String standardJoin = " LEFT JOIN " + road + " s ON s.sgg_cd = substr(b.road_cd, 1, 5) AND s.road_no = substr(b.road_cd, 6, 7) "
                + "AND s.emd_no = b.emd_no WHERE coalesce(b.mv_rs_cd, '') NOT IN ('63', '72') ";
        this.standardByRoadSql = "SELECT DISTINCT ON (k.n) " + standardCols
                + " FROM unnest(?::varchar[], ?::varchar[], ?::int[], ?::int[]) WITH ORDINALITY AS k(road_cd, udgd_yn, buld_mnnm, buld_slno, n) "
                + "JOIN " + building + " b ON b.road_cd = k.road_cd AND b.udgd_yn = k.udgd_yn "
                + "AND b.buld_mnnm = k.buld_mnnm AND b.buld_slno = k.buld_slno" + standardJoin
                + "ORDER BY k.n, b.adm_cd, b.mntn_yn, b.lnbr_mnnm, b.lnbr_slno, b.bd_mgt_sn";
        this.standardByJibunSql = "SELECT DISTINCT ON (k.n) " + standardCols
                + " FROM unnest(?::varchar[], ?::varchar[], ?::int[], ?::int[]) WITH ORDINALITY AS k(adm_cd, mntn_yn, lnbr_mnnm, lnbr_slno, n) "
                + "JOIN " + building + " b ON b.adm_cd = k.adm_cd AND b.mntn_yn = k.mntn_yn "
                + "AND b.lnbr_mnnm = k.lnbr_mnnm AND b.lnbr_slno = k.lnbr_slno" + standardJoin
                + "ORDER BY k.n, b.buld_mnnm, b.buld_slno, b.udgd_yn, b.bd_mgt_sn";
        // 지번 → 건물 색인 이름: 건물 표와 같은 스키마의 ix_{표}_jibun (backend/scripts/mymap-ref/add-ix-juso-jibun.sql)
        int dot = building.indexOf('.');
        String schemaPrefix = dot < 0 ? "" : building.substring(0, dot + 1);
        this.jibunIndexName = schemaPrefix + "ix_" + buildingDataset + "_jibun";
        this.jibunIndexSql = "SELECT to_regclass(?) IS NOT NULL";
    }

    String standardByRoadSql() {
        return standardByRoadSql;
    }

    String standardByJibunSql() {
        return standardByJibunSql;
    }

    String jibunIndexName() {
        return jibunIndexName;
    }

    /**
     * 지번 → 건물 색인이 있는가. 결과를 적재 기준월 단위로 기억한다: 기준월이 바뀌면(새 표로 교체) 다시 확인하고,
     * "없음"은 {@link #NEGATIVE_RECHECK_NANOS}가 지나면 다시 확인한다. 확인하지 못하면(DB 오류) false.
     */
    @Override
    public boolean jibunLookupReady() {
        String version = readyVersion();
        if (version == null) return false;
        IndexState s = indexState;
        long now = System.nanoTime();
        if (s != null && s.version().equals(version) && (s.ready() || now - s.checkedAtNanos() < NEGATIVE_RECHECK_NANOS)) {
            return s.ready();
        }
        boolean ready;
        try {
            Boolean b = jdbc.queryForObject(jibunIndexSql, Boolean.class, jibunIndexName);
            ready = Boolean.TRUE.equals(b);
        } catch (DataAccessException e) {
            log.warn("[나만의지도] 지번 색인 확인 실패 — 지번 입력 행의 도로명주소는 비웁니다: {}", e.getMessage());
            ready = false;
        }
        indexState = new IndexState(version, ready, now);
        return ready;
    }

    @Override
    public Map<BuildingKey, StandardParts> standardPartsByRoad(Collection<BuildingKey> keys) {
        List<BuildingKey> all = new ArrayList<>(new java.util.LinkedHashSet<>(keys));
        Map<BuildingKey, StandardParts> out = new HashMap<>();
        for (int i = 0; i < all.size(); i += CHUNK) {
            List<BuildingKey> chunk = all.subList(i, Math.min(i + CHUNK, all.size()));
            jdbc.query(standardByRoadSql, ps -> bindKeys(ps, chunk), rs -> {
                out.put(chunk.get(rs.getInt("n") - 1), standardPartsOf(rs));
            });
        }
        return out;
    }

    @Override
    public Map<JibunKey, StandardParts> standardPartsByJibun(Collection<JibunKey> keys) {
        List<JibunKey> all = new ArrayList<>(new java.util.LinkedHashSet<>(keys));
        Map<JibunKey, StandardParts> out = new HashMap<>();
        for (int i = 0; i < all.size(); i += CHUNK) {
            List<JibunKey> chunk = all.subList(i, Math.min(i + CHUNK, all.size()));
            jdbc.query(standardByJibunSql, ps -> {
                Connection con = ps.getConnection();
                int n = chunk.size();
                String[] adm = new String[n], mntn = new String[n];
                Integer[] mains = new Integer[n], subs = new Integer[n];
                for (int j = 0; j < n; j++) {
                    JibunKey k = chunk.get(j);
                    adm[j] = k.admCd();
                    mntn[j] = k.mntn();
                    mains[j] = k.main();
                    subs[j] = k.sub();
                }
                ps.setArray(1, con.createArrayOf("varchar", adm));
                ps.setArray(2, con.createArrayOf("varchar", mntn));
                ps.setArray(3, con.createArrayOf("int4", mains));
                ps.setArray(4, con.createArrayOf("int4", subs));
            }, rs -> {
                out.put(chunk.get(rs.getInt("n") - 1), standardPartsOf(rs));
            });
        }
        return out;
    }

    private static StandardParts standardPartsOf(java.sql.ResultSet rs) throws SQLException {
        return new StandardParts(trim(rs.getString("ctp_kor_nm")), trim(rs.getString("sig_kor_nm")), trim(rs.getString("emd_kor_nm")),
                trim(rs.getString("li_kor_nm")), trim(rs.getString("rn")), trim(rs.getString("udgd_yn")),
                rs.getInt("buld_mnnm"), rs.getInt("buld_slno"), "1".equals(rs.getString("apt_yn")),
                trim(rs.getString("sgg_buld_nm")), trim(rs.getString("emd_gb")));
    }

    /** "ref.ti_spbd_buld" → "ti_spbd_buld" (적재 기록의 dataset 값) */
    static String datasetOf(String table) {
        int dot = table.indexOf('.');
        return dot < 0 ? table : table.substring(dot + 1);
    }

    String legalDongSql() {
        return legalDongSql;
    }

    String roadCodeSql() {
        return roadCodeSql;
    }

    String buildingSql() {
        return buildingSql;
    }

    String readySql() {
        return readySql;
    }

    @Override
    public String readyVersion() {
        try {
            Map<String, String> version = new HashMap<>();
            Map<String, String> status = new HashMap<>();
            jdbc.query(readySql, rs -> {
                String d = rs.getString("dataset");
                version.put(d, rs.getString("version"));
                status.put(d, rs.getString("status"));
            }, buildingDataset, roadDataset);
            for (String d : List.of(buildingDataset, roadDataset)) {
                if (!"READY".equalsIgnoreCase(status.get(d))) return null;
            }
            String v = version.get(buildingDataset);
            return v == null || v.isBlank() ? "unknown" : v;
        } catch (DataAccessException e) {
            log.warn("[나만의지도] 주소 자료 적재 기록을 읽지 못했습니다(load_meta): {}", e.getMessage());
            return null;
        }
    }

    @Override
    public List<LegalDong> legalDongs() {
        List<LegalDong> out = new ArrayList<>(20_000);
        jdbc.query(legalDongSql, rs -> {
            out.add(new LegalDong(trim(rs.getString("adm_cd")), trim(rs.getString("ctp_kor_nm")), trim(rs.getString("sig_kor_nm")),
                    trim(rs.getString("emd_kor_nm")), trim(rs.getString("li_kor_nm"))));
        });
        return out;
    }

    @Override
    public List<RoadCode> findRoadCodes(Collection<String> roadNames) {
        TreeSet<String> names = new TreeSet<>(roadNames);
        List<RoadCode> out = new ArrayList<>();
        List<String> all = new ArrayList<>(names);
        for (int i = 0; i < all.size(); i += CHUNK) {
            String[] chunk = all.subList(i, Math.min(i + CHUNK, all.size())).toArray(String[]::new);
            jdbc.query(roadCodeSql, ps -> ps.setArray(1, ps.getConnection().createArrayOf("varchar", chunk)), rs -> {
                out.add(new RoadCode(rs.getString("road_cd"), trim(rs.getString("ctp_kor_nm")), trim(rs.getString("sig_kor_nm")),
                        rs.getString("rn"), rs.getBoolean("active")));
            });
        }
        return out;
    }

    @Override
    public List<Building> findBuildings(Collection<BuildingKey> keys) {
        List<BuildingKey> all = new ArrayList<>(new java.util.LinkedHashSet<>(keys));
        List<Building> out = new ArrayList<>();
        for (int i = 0; i < all.size(); i += CHUNK) {
            List<BuildingKey> chunk = all.subList(i, Math.min(i + CHUNK, all.size()));
            jdbc.query(buildingSql, ps -> bindKeys(ps, chunk), rs -> {
                BuildingKey key = new BuildingKey(rs.getString("road_cd"), rs.getString("udgd_yn"), rs.getInt("buld_mnnm"), rs.getInt("buld_slno"));
                out.add(new Building(key, trim(rs.getString("adm_cd")), "1".equals(rs.getString("mntn_yn")),
                        rs.getInt("lnbr_mnnm"), rs.getInt("lnbr_slno"), trim(rs.getString("ctp_kor_nm")), trim(rs.getString("sig_kor_nm")),
                        trim(rs.getString("emd_kor_nm")), trim(rs.getString("li_kor_nm")), rs.getString("rn")));
            });
        }
        return out;
    }

    private static void bindKeys(PreparedStatement ps, List<BuildingKey> keys) throws SQLException {
        Connection con = ps.getConnection();
        int n = keys.size();
        String[] roads = new String[n], udgd = new String[n];
        Integer[] mains = new Integer[n], subs = new Integer[n];
        for (int i = 0; i < n; i++) {
            BuildingKey k = keys.get(i);
            roads[i] = k.roadCd();
            udgd[i] = k.udgd();
            mains[i] = k.main();
            subs[i] = k.sub();
        }
        ps.setArray(1, con.createArrayOf("varchar", roads));
        ps.setArray(2, con.createArrayOf("varchar", udgd));
        ps.setArray(3, con.createArrayOf("int4", mains));
        ps.setArray(4, con.createArrayOf("int4", subs));
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }
}
