package com.gtp.domain.mymap.infra;

import java.util.Collection;
import java.util.List;

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

    /** 주소 자료가 읽을 수 있는 상태면 그 기준월(예 "2026-09"), 아니면 null. 기준월이 바뀌면 법정동 사전을 다시 만든다. */
    String readyVersion();

    /** 법정동 사전의 원천(중복 없는 행정구역 목록). 한 번 읽어 메모리에 둔다. */
    List<LegalDong> legalDongs();

    /** 도로명으로 도로명코드 후보를 찾는다(시도·시군구가 달라 같은 이름이 여러 줄일 수 있다). */
    List<RoadCode> findRoadCodes(Collection<String> roadNames);

    /** 건물번호로 건물(지번)을 찾는다. 폐지된 건물은 돌려주지 않는다. */
    List<Building> findBuildings(Collection<BuildingKey> keys);
}
