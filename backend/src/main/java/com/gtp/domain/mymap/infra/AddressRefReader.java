package com.gtp.domain.mymap.infra;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * {@link TableAddressResolver}가 읽는 주소 자료의 좁은 문. 기본 구현은 도로명주소 건물DB 표를 읽는 {@link JdbcAddressRefReader},
 * 시험·fake는 메모리 구현. 다른 DB(MyBatis·Oracle 등)로 옮길 때는 이 인터페이스만 새로 구현하면 해석 규칙은 그대로 쓴다.
 */
public interface AddressRefReader {

    /** 법정동 사전 한 줄. sigungu·li는 없으면 "" (세종은 시군구가 없고, 동 지역은 리가 없다). */
    record LegalDong(String admCd, String sido, String sigungu, String emd, String li) {
    }

    /** 도로명코드 한 줄(도로명 1건). active = 사용 중이고 말소일자가 없다. */
    record RoadCode(String roadCd, String sido, String sigungu, String name, boolean active) {
    }

    /** 건물 찾기 키: 도로명코드 + 지하여부(0 지상·1 지하) + 건물본번 + 건물부번 */
    record BuildingKey(String roadCd, String udgd, int main, int sub) {
    }

    /** 건물 한 줄: 도로명주소 건물번호에 딸린 지번(대표 필지)과 사람이 읽을 이름 */
    record Building(BuildingKey key, String admCd, boolean mountain, int lnbrMain, int lnbrSub,
                    String sido, String sigungu, String emd, String li, String roadName) {

        /** PNU 19자리 = 법정동코드(10) + 대지구분(1: 대지·2: 산) + 본번(4) + 부번(4) */
        public String pnu() {
            return TableAddressResolver.pnu(admCd, mountain, lnbrMain, lnbrSub);
        }
    }

    /** 지번으로 건물 찾기 키: 법정동코드(10) + 산여부("0" 대지·"1" 산) + 지번본번 + 지번부번 */
    record JibunKey(String admCd, String mntn, int main, int sub) {
    }

    /**
     * 표준 도로명주소의 재료(건물 1건). udgd = 지하여부("0" 지상·"1" 지하·"2" 공중·"3" 수상), emdGb = 도로명코드 표의 읍면동구분
     * ("0" 읍면·"1" 동·"2" 미부여, 모르면 ""), buildingName = 시군구용 건물명(없으면 "").
     */
    record StandardParts(String sido, String sigungu, String emd, String li, String roadName, String udgd, int main, int sub,
                         boolean apartment, String buildingName, String emdGb) {

        public StandardParts {
            sido = sido == null ? "" : sido.strip();
            sigungu = sigungu == null ? "" : sigungu.strip();
            emd = emd == null ? "" : emd.strip();
            li = li == null ? "" : li.strip();
            roadName = roadName == null ? "" : roadName.strip();
            udgd = udgd == null ? "" : udgd.strip();
            buildingName = buildingName == null ? "" : buildingName.strip();
            emdGb = emdGb == null ? "" : emdGb.strip();
        }
    }

    /**
     * 필지 한 곳의 건물 한 줄(필지 정보 카드용). udgd = 지하여부, emdGb = 도로명코드 표의 읍면동구분(모르면 ""),
     * relation = "MAIN"(대표지번이 이 필지) | "RELATED"(관련지번으로만 찾음). 빈 값은 모두 ""로 정규화한다.
     */
    record BuildingRow(String id, String sido, String sigungu, String emd, String li, String roadName, String roadCd, String udgd,
                       int main, int sub, String name, String detailName, String sggName, boolean apartment, String zipCode,
                       String emdGb, String relation) {

        public BuildingRow {
            id = nz(id);
            sido = nz(sido);
            sigungu = nz(sigungu);
            emd = nz(emd);
            li = nz(li);
            roadName = nz(roadName);
            roadCd = nz(roadCd);
            udgd = nz(udgd);
            name = nz(name);
            detailName = nz(detailName);
            sggName = nz(sggName);
            zipCode = nz(zipCode);
            emdGb = nz(emdGb);
            relation = "RELATED".equals(relation) ? "RELATED" : "MAIN";
        }

        /** 표준 도로명주소 조립 재료 */
        public StandardParts standardParts() {
            return new StandardParts(sido, sigungu, emd, li, roadName, udgd, main, sub, apartment, sggName, emdGb);
        }

        private static String nz(String s) {
            return s == null ? "" : s.strip();
        }
    }

    /**
     * 필지 건물 조회 결과: total = limit과 무관한 전체 건수(폐지 제외), rows = 정해진 순서로 잘린 건물,
     * relatedIncluded = 관련지번(ti_scco_mvmn)으로도 찾았다.
     */
    record BuildingPage(int total, boolean relatedIncluded, List<BuildingRow> rows) {

        public static BuildingPage empty() {
            return new BuildingPage(0, false, List.of());
        }
    }

    /**
     * 필지 한 곳의 도로명주소 한 줄(도로 키당 대표 건물 1건, PNU → 주소 엑셀용). zipCode·name·sggName은 없으면 "",
     * relation = 이 주소의 건물 중 하나라도 이 필지가 대표지번이면 "MAIN", 관련지번으로만 걸렸으면 "RELATED".
     */
    record RoadAddressRow(StandardParts parts, String zipCode, String name, String sggName, boolean apartment, String relation) {

        public RoadAddressRow {
            zipCode = zipCode == null ? "" : zipCode.strip();
            name = name == null ? "" : name.strip();
            sggName = sggName == null ? "" : sggName.strip();
            relation = "RELATED".equals(relation) ? "RELATED" : "MAIN";
        }
    }

    /**
     * 필지 한 곳의 도로명주소 결과: buildingCount = 건물 수(폐지 제외·건물당 1번), addressCount = 서로 다른 도로명주소 수(자르기 전),
     * rows = 정해진 순서(대표지번 묶음 먼저 → 도로명 → 지하여부 → 건물본번 → 건물부번)로 잘린 목록.
     */
    record JibunAddresses(int buildingCount, int addressCount, List<RoadAddressRow> rows) {
    }

    /**
     * 지번 → 건물 조회(색인 ix_ti_spbd_buld_jibun)를 써도 되는가. 건물 표에 (법정동코드, 산여부, 지번본번, 지번부번) 색인이 없으면 이 조회가
     * 1,000만 행 전체 스캔이라 false여야 한다(그러면 지번 입력 행의 도로명주소 열은 비워 둔다).
     */
    default boolean jibunLookupReady() {
        return false;
    }

    /** 건물번호(도로 키)로 표준 주소 재료를 찾는다. 같은 키에 건물이 여럿(건물군)이면 지번이 가장 앞선 1건. 폐지 건물 제외. */
    default Map<BuildingKey, StandardParts> standardPartsByRoad(Collection<BuildingKey> keys) {
        return Map.of();
    }

    /**
     * 지번으로 표준 주소 재료를 찾는다. 건물이 여럿이면 건물본번·부번 오름차순 첫 1건, 없으면 결과에서 빠진다.
     * {@link #jibunLookupReady()}가 true일 때만 부른다.
     */
    default Map<JibunKey, StandardParts> standardPartsByJibun(Collection<JibunKey> keys) {
        return Map.of();
    }

    /**
     * 관련지번 → 건물 조회(색인 ix_ti_scco_mvmn_jibun)를 써도 되는가. 없으면 {@link #buildingsByJibun}이 대표지번으로만 찾는다
     * (관련지번 표를 전체 스캔하지 않는다).
     */
    default boolean relatedJibunLookupReady() {
        return false;
    }

    /**
     * 필지(지번 키) 한 곳에 걸린 건물을 최대 limit건 찾는다(필지 정보 카드). 건물이 없으면 total 0.
     * {@link #jibunLookupReady()}가 true일 때만 부른다(아니면 건물 표 전체 스캔).
     */
    default BuildingPage buildingsByJibun(JibunKey key, int limit) {
        return BuildingPage.empty();
    }

    /**
     * 필지(지번 키) 여러 곳의 도로명주소를 한 번에 찾는다(PNU → 주소 엑셀). 키마다 도로명주소(도로 키 = 도로명코드·지하여부·건물본번·건물부번)별
     * 대표 건물 1건을 perKey개까지, 건물이 없는 키는 결과에서 빠진다. 관련지번 색인이 있으면({@link #relatedJibunLookupReady()}) 관련지번 건물도 합친다.
     * {@link #jibunLookupReady()}가 true일 때만 부른다(아니면 건물 표 전체 스캔). perKey는 1 이상.
     */
    default Map<JibunKey, JibunAddresses> roadAddressesByJibun(Collection<JibunKey> keys, int perKey) {
        return Map.of();
    }

    /** 주소 자료가 읽을 수 있는 상태면 그 기준월(예 "2026-09"), 아니면 null. 기준월이 바뀌면 법정동 사전을 다시 만든다. */
    String readyVersion();

    /** 법정동 사전의 원천(중복 없는 행정구역 목록). 한 번 읽어 메모리에 둔다. */
    List<LegalDong> legalDongs();

    /** 도로명으로 도로명코드 후보를 찾는다(시도·시군구가 달라 같은 이름이 여러 줄일 수 있다). */
    List<RoadCode> findRoadCodes(Collection<String> roadNames);

    /** 건물번호로 건물(지번)을 찾는다. 폐지된 건물은 돌려주지 않는다. */
    List<Building> findBuildings(Collection<BuildingKey> keys);
}
