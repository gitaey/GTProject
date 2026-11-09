package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.dto.ParcelBuildingsResponse;
import com.gtp.domain.mymap.dto.ParcelBuildingsResponse.AddressGroup;
import com.gtp.domain.mymap.dto.ParcelBuildingsResponse.BuildingItem;
import com.gtp.domain.mymap.infra.AddressRefReader;
import com.gtp.domain.mymap.infra.AddressRefReader.BuildingPage;
import com.gtp.domain.mymap.infra.AddressRefReader.BuildingRow;
import com.gtp.domain.mymap.infra.AddressRefReader.JibunKey;
import com.gtp.domain.mymap.infra.StandardAddressFormatter;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 필지 정보 카드의 건물 목록(U25) — PNU → 그 필지에 걸린 건물을 표준 도로명주소별로 묶어 돌려준다.
 * 건물DB(참조 DB) 읽기뿐이라 트랜잭션이 없다. 지번 색인이 없으면 1,000만 행 전체 스캔이라 조회하지 않고 503(PARCEL_BUILDINGS_UNAVAILABLE).
 * 지번 주소는 만들지 않는다(법정동 사전을 만들면 첫 요청이 수 초~수십 초 걸린다 — 화면은 VWorld의 지번 주소를 쓴다).
 */
@Service
@RequiredArgsConstructor
public class ParcelBuildingService {

    public static final int DEFAULT_LIMIT = 200;
    public static final int MAX_LIMIT = 1000;

    /** 19자리, 11번째(대지구분) 1=대지·2=산 */
    private static final Pattern PNU = Pattern.compile("^\\d{10}[12]\\d{8}$");
    private static final Pattern CHUNK = Pattern.compile("\\d+|\\D+");

    private final AddressRefReader reader;

    /** limitText가 null이거나 빈 값이면 기본 200. 숫자가 아니거나 1~1000을 벗어나면 400 */
    public ParcelBuildingsResponse buildings(String pnu, String limitText) {
        if (pnu == null || !PNU.matcher(pnu).matches()) throw new CustomException(GisErrorCode.PARCEL_QUERY_INVALID);
        int limit = parseLimit(limitText);

        String version = reader.readyVersion();
        if (version == null || !reader.jibunLookupReady()) throw new CustomException(GisErrorCode.PARCEL_BUILDINGS_UNAVAILABLE);

        JibunKey key = new JibunKey(pnu.substring(0, 10), pnu.charAt(10) == '2' ? "1" : "0",
                Integer.parseInt(pnu.substring(11, 15)), Integer.parseInt(pnu.substring(15, 19)));
        BuildingPage page = reader.buildingsByJibun(key, limit);

        return ParcelBuildingsResponse.builder()
                .pnu(pnu)
                .referenceVersion(blankToNull(version))
                .buildingCount(page.total())
                .truncated(page.rows().size() < page.total())
                .relatedIncluded(page.relatedIncluded())
                .addresses(group(page.rows()))
                .build();
    }

    static int parseLimit(String text) {
        if (text == null || text.isBlank()) return DEFAULT_LIMIT;
        int n;
        try {
            n = Integer.parseInt(text.trim());
        } catch (NumberFormatException e) {
            throw new CustomException(GisErrorCode.PARCEL_QUERY_INVALID);
        }
        if (n < 1 || n > MAX_LIMIT) throw new CustomException(GisErrorCode.PARCEL_QUERY_INVALID);
        return n;
    }

    /** 도로 키(도로명코드·지하여부·건물본번·건물부번)별로 묶는다. 묶음 정렬: 대표지번 먼저 → 도로명 → 지하여부 → 본번 → 부번 */
    static List<AddressGroup> group(List<BuildingRow> rows) {
        Map<String, List<BuildingRow>> byRoad = new LinkedHashMap<>();
        for (BuildingRow r : rows) {
            byRoad.computeIfAbsent(r.roadCd() + "|" + r.udgd() + "|" + r.main() + "|" + r.sub(), k -> new ArrayList<>()).add(r);
        }
        List<List<BuildingRow>> groups = new ArrayList<>(byRoad.values());
        for (List<BuildingRow> g : groups) {
            g.sort(Comparator.comparing(BuildingRow::detailName, ParcelBuildingService::naturalCompareEmptyLast)
                    .thenComparing(BuildingRow::id));
        }
        groups.sort(Comparator.<List<BuildingRow>, Integer>comparing(g -> isMain(g) ? 0 : 1)
                .thenComparing(g -> g.get(0).roadName())
                .thenComparing(g -> g.get(0).udgd())
                .thenComparing(g -> g.get(0).main())
                .thenComparing(g -> g.get(0).sub()));

        List<AddressGroup> out = new ArrayList<>(groups.size());
        for (List<BuildingRow> g : groups) {
            BuildingRow rep = representative(g);
            String name = null;
            boolean apartment = false;
            List<BuildingItem> items = new ArrayList<>(g.size());
            for (BuildingRow r : g) {
                if (name == null) name = blankToNull(displayName(r));
                apartment |= r.apartment();
                items.add(BuildingItem.builder().id(r.id()).name(blankToNull(r.name())).detailName(blankToNull(r.detailName()))
                        .sggName(blankToNull(r.sggName())).build());
            }
            out.add(AddressGroup.builder()
                    .roadAddress(StandardAddressFormatter.road(rep.standardParts()))
                    .underground("1".equals(rep.udgd()))
                    .zipCode(blankToNull(rep.zipCode()))
                    .name(name)
                    .apartment(apartment)
                    .relation(isMain(g) ? "MAIN" : "RELATED")
                    .buildings(items)
                    .build());
        }
        return out;
    }

    private static boolean isMain(List<BuildingRow> g) {
        for (BuildingRow r : g) {
            if ("MAIN".equals(r.relation())) return true;
        }
        return false;
    }

    /** 묶음의 표준 주소 재료: 시군구용 건물명이 있는 공동주택 건물이 있으면 그것, 없으면 첫 건물 */
    private static BuildingRow representative(List<BuildingRow> g) {
        for (BuildingRow r : g) {
            if (r.apartment() && !r.sggName().isEmpty()) return r;
        }
        return g.get(0);
    }

    /** 대표 이름: 공동주택이면 시군구용 건물명(없으면 건축물대장 건물명), 아니면 건축물대장 건물명(없으면 시군구용 건물명) */
    static String displayName(BuildingRow r) {
        return displayName(r.apartment(), r.name(), r.sggName());
    }

    /** 위 규칙의 재료 버전(PNU → 주소 엑셀도 같은 규칙을 쓴다). name·sggName은 null이 아닌 값 */
    static String displayName(boolean apartment, String name, String sggName) {
        String first = apartment ? sggName : name;
        if (!first.isEmpty()) return first;
        return apartment ? name : sggName;
    }

    private static int naturalCompareEmptyLast(String a, String b) {
        if (a.isEmpty() || b.isEmpty()) return a.isEmpty() == b.isEmpty() ? 0 : (a.isEmpty() ? 1 : -1);
        return naturalCompare(a, b);
    }

    /** 숫자 덩어리는 크기로, 글자 덩어리는 사전순으로 비교한다("2동"이 "10동"보다 앞). JDK 8 문법만 쓴다. */
    static int naturalCompare(String a, String b) {
        Matcher ma = CHUNK.matcher(a);
        Matcher mb = CHUNK.matcher(b);
        while (ma.find() && mb.find()) {
            String x = ma.group();
            String y = mb.group();
            int c;
            if (Character.isDigit(x.charAt(0)) && Character.isDigit(y.charAt(0))) {
                String nx = stripZeros(x);
                String ny = stripZeros(y);
                c = nx.length() != ny.length() ? Integer.compare(nx.length(), ny.length()) : nx.compareTo(ny);
            } else {
                c = x.compareTo(y);
            }
            if (c != 0) return c;
        }
        return a.compareTo(b);   // 덩어리가 모두 같으면 길이·글자로(앞자리 0 차이 등) 결정적으로
    }

    private static String stripZeros(String s) {
        int i = 0;
        while (i < s.length() - 1 && s.charAt(i) == '0') i++;
        return s.substring(i);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
