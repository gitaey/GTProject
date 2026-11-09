package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.port.RefLoadMetaReader;
import org.springframework.jdbc.core.JdbcOperations;

import java.sql.Date;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;

/**
 * 적재 기록 표(기본 ref.load_meta)를 읽는 구현. SELECT만 한다. 표 이름은 설정에서 오므로
 * {@link PostgisPnuParcelProvider#ident}로 모양을 검사한다. 읽기 실패는 그대로 던진다(서비스가 UNAVAILABLE로 바꾼다).
 */
public class JdbcRefLoadMetaReader implements RefLoadMetaReader {

    private final JdbcOperations jdbc;
    private final String sql;
    private final Object[] datasets;

    public JdbcRefLoadMetaReader(JdbcOperations jdbc, MyMapProperties.Ref ref) {
        this.jdbc = jdbc;
        MyMapProperties.Address a = ref.getAddress();
        this.datasets = new Object[]{
                RefLoadMetaReader.datasetOf(a.getBuildingTable()),
                RefLoadMetaReader.datasetOf(a.getRoadCodeTable()),
                RefLoadMetaReader.datasetOf(a.getRelatedJibunTable())};
        this.sql = "SELECT dataset, sido, version, status, row_count, base_date, loaded_at FROM "
                + PostgisPnuParcelProvider.ident(ref.getLoadMetaTable())
                + " WHERE dataset IN (?, ?, ?, '" + PARCEL + "')";
    }

    String sql() {
        return sql;
    }

    @Override
    public List<LoadRecord> records() {
        List<LoadRecord> out = new ArrayList<>();
        jdbc.query(sql, rs -> {
            Date base = rs.getDate("base_date");
            Timestamp loaded = rs.getTimestamp("loaded_at");
            long rows = rs.getLong("row_count");
            Long rowCount = rs.wasNull() ? null : rows;
            String sido = rs.getString("sido");
            out.add(new LoadRecord(rs.getString("dataset"), sido == null ? null : sido.trim(), rs.getString("version"),
                    rs.getString("status"), rowCount,
                    base == null ? null : base.toLocalDate(),
                    loaded == null ? null : loaded.toLocalDateTime()));
        }, datasets);
        return out;
    }
}
