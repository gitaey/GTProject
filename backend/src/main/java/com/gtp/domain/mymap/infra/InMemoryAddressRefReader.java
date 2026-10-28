package com.gtp.domain.mymap.infra;

import java.util.*;

/**
 * 메모리 주소 자료 — 시험과 {@code mymap.ref.provider=fake}(로컬 개발)용. 실제 건물DB 없이 주소 업로드 흐름을 돌려 볼 수 있다.
 * {@link #samples()}는 샘플 엑셀의 공공청사 7곳(주소 샘플 파일의 주소)과, 모호함·후보 표시를 시험하려는 가짜 동명 지역을 담는다.
 * 도로명코드·법정동코드의 앞자리는 실제와 같지만 도로명번호(7자리)는 가짜다.
 */
public class InMemoryAddressRefReader implements AddressRefReader {

    private final List<LegalDong> legalDongs = new ArrayList<>();
    private final List<RoadCode> roadCodes = new ArrayList<>();
    private final Map<BuildingKey, List<Building>> buildings = new HashMap<>();
    private volatile String version;

    public InMemoryAddressRefReader(String version) {
        this.version = version;
    }

    /** 시험용: null이면 "자료 준비 안 됨" */
    public void setReadyVersion(String version) {
        this.version = version;
    }

    public InMemoryAddressRefReader legalDong(String admCd, String sido, String sigungu, String emd, String li) {
        legalDongs.add(new LegalDong(admCd, sido, sigungu, emd, li));
        return this;
    }

    public InMemoryAddressRefReader road(String roadCd, String sido, String sigungu, String name, boolean active) {
        roadCodes.add(new RoadCode(roadCd, sido, sigungu, name, active));
        return this;
    }

    /** 건물 1건: 도로명코드·건물번호에 딸린 대표 지번(법정동코드·본번·부번) */
    public InMemoryAddressRefReader building(String roadCd, boolean underground, int main, int sub, String admCd, boolean mountain,
                                             int lnbrMain, int lnbrSub, String sido, String sigungu, String emd, String li, String roadName) {
        BuildingKey key = new BuildingKey(roadCd, underground ? "1" : "0", main, sub);
        buildings.computeIfAbsent(key, k -> new ArrayList<>(1)).add(
                new Building(key, admCd, mountain, lnbrMain, lnbrSub, sido, sigungu, emd, li, roadName));
        return this;
    }

    public int findRoadCodesCalls = 0;
    public int findBuildingsCalls = 0;
    public int legalDongsCalls = 0;

    @Override
    public String readyVersion() {
        return version;
    }

    @Override
    public List<LegalDong> legalDongs() {
        legalDongsCalls++;
        return List.copyOf(legalDongs);
    }

    @Override
    public List<RoadCode> findRoadCodes(Collection<String> roadNames) {
        findRoadCodesCalls++;
        Set<String> names = new HashSet<>(roadNames);
        List<RoadCode> out = new ArrayList<>();
        for (RoadCode c : roadCodes) {
            if (names.contains(c.name())) out.add(c);
        }
        return out;
    }

    @Override
    public List<Building> findBuildings(Collection<BuildingKey> keys) {
        findBuildingsCalls++;
        List<Building> out = new ArrayList<>();
        for (BuildingKey k : new LinkedHashSet<>(keys)) {
            List<Building> b = buildings.get(k);
            if (b != null) out.addAll(b);
        }
        return out;
    }

    /** 공공청사 7곳(parcels.json의 필지와 PNU가 같다) + 모호함 시험용 가짜 동명 지역·도로 */
    public static InMemoryAddressRefReader samples() {
        InMemoryAddressRefReader r = new InMemoryAddressRefReader("FAKE");
        String 서울 = "서울특별시", 세종 = "세종특별자치시", 부산 = "부산광역시", 대구 = "대구광역시", 대전 = "대전광역시", 인천 = "인천광역시", 울산 = "울산광역시";

        r.legalDong("1114010300", 서울, "중구", "태평로1가", "");
        r.road("111402005001", 서울, "중구", "세종대로", true)
                .building("111402005001", false, 110, 0, "1114010300", false, 31, 0, 서울, "중구", "태평로1가", "", "세종대로");

        r.legalDong("3611010300", 세종, "", "보람동", "");
        r.road("361102000002", 세종, "", "한누리대로", true)
                .building("361102000002", false, 2130, 0, "3611010300", false, 718, 0, 세종, "", "보람동", "", "한누리대로");

        r.legalDong("2647010200", 부산, "연제구", "연산동", "");
        r.road("264702000003", 부산, "연제구", "중앙대로", true)
                .building("264702000003", false, 1001, 0, "2647010200", false, 1000, 0, 부산, "연제구", "연산동", "", "중앙대로");

        r.legalDong("2711010100", 대구, "중구", "동인동1가", "");
        r.road("271102000004", 대구, "중구", "공평로", true)
                .building("271102000004", false, 88, 0, "2711010100", false, 2, 1, 대구, "중구", "동인동1가", "", "공평로");

        r.legalDong("3017011200", 대전, "서구", "둔산동", "");
        r.road("301702000005", 대전, "서구", "둔산로", true)
                .building("301702000005", false, 100, 0, "3017011200", false, 1420, 0, 대전, "서구", "둔산동", "", "둔산로");

        r.legalDong("2820010100", 인천, "남동구", "구월동", "");
        r.road("282002000006", 인천, "남동구", "정각로", true)
                .building("282002000006", false, 29, 0, "2820010100", false, 1138, 0, 인천, "남동구", "구월동", "", "정각로");

        r.legalDong("3114010400", 울산, "남구", "신정동", "");
        r.road("311402000007", 울산, "남구", "중앙로", true)
                .building("311402000007", false, 201, 0, "3114010400", false, 646, 4, 울산, "남구", "신정동", "", "중앙로");

        // 모호함 시험: 같은 이름이 다른 지역에도 있다("신정동 646-4"·"중앙로 201"은 시도·시군구를 붙여야 정해진다)
        r.legalDong("1147010200", 서울, "양천구", "신정동", "");
        r.road("271102000099", 대구, "중구", "중앙로", true)
                .building("271102000099", false, 201, 0, "2711010100", false, 3, 0, 대구, "중구", "동인동1가", "", "중앙로");
        return r;
    }
}
