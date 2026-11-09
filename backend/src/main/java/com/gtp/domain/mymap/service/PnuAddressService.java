package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.dto.PnuAddressRequest;
import com.gtp.domain.mymap.dto.PnuAddressResponse;
import com.gtp.domain.mymap.dto.PnuAddressResponse.Item;
import com.gtp.domain.mymap.dto.PnuAddressResponse.RoadAddress;
import com.gtp.domain.mymap.infra.AddressRefReader;
import com.gtp.domain.mymap.infra.AddressRefReader.JibunAddresses;
import com.gtp.domain.mymap.infra.AddressRefReader.JibunKey;
import com.gtp.domain.mymap.infra.AddressRefReader.RoadAddressRow;
import com.gtp.domain.mymap.infra.StandardAddressFormatter;
import com.gtp.domain.mymap.infra.TableAddressResolver;
import com.gtp.domain.mymap.port.AddressResolver;
import com.gtp.domain.mymap.port.PnuParcelProvider;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * PNU 묶음 → 지번주소·도로명주소(U26, 기타 패널의 엑셀 도구). 브라우저가 PNU를 500개씩 나눠 보낸다.
 * 참조 DB 읽기뿐이라 트랜잭션이 없다. 전체 동시 처리는 3건(넘치면 429 PNU_ADDRESS_BUSY — 브라우저가 잠시 뒤 다시 시도).
 *
 * 지번주소는 법정동 사전(주소 변환·레이어 내보내기와 공유하는 기준월 단위 캐시, 처음 한 번 수 초~수십 초)으로 만들고, 사전에 없는 법정동코드의
 * PNU만 지적도의 법정동 이름으로 메운다(실패해도 그 PNU만 null). 도로명주소는 지번 색인이 있을 때만 건물DB에서 한 번에 찾는다.
 * PNU 값은 로그에 남기지 않는다.
 */
@Slf4j
@Service
public class PnuAddressService {

    public static final int MAX_PNUS = 500;
    /** item별 roadAddresses 상한(응답의 maxRoadAddresses) */
    public static final int MAX_ROAD_ADDRESSES = 20;
    static final int MAX_CONCURRENT = 3;

    /** 19자리, 11번째(대지구분) 1=대지·2=산 */
    private static final Pattern PNU = Pattern.compile("^\\d{10}[12]\\d{8}$");
    private static final Pattern SPACES = Pattern.compile("\\s+");

    private final AddressRefReader reader;
    private final AddressResolver addressResolver;
    private final PnuParcelProvider parcelProvider;
    /** 동시 처리 칸 — 인스턴스 필드(모듈 전역 아님) */
    private final Semaphore slots;

    @Autowired
    public PnuAddressService(AddressRefReader reader, AddressResolver addressResolver, PnuParcelProvider parcelProvider) {
        this(reader, addressResolver, parcelProvider, MAX_CONCURRENT);
    }

    PnuAddressService(AddressRefReader reader, AddressResolver addressResolver, PnuParcelProvider parcelProvider, int maxConcurrent) {
        this.reader = reader;
        this.addressResolver = addressResolver;
        this.parcelProvider = parcelProvider;
        this.slots = new Semaphore(maxConcurrent);
    }

    public PnuAddressResponse lookup(PnuAddressRequest req) {
        // 1) 검사 — 정리(하이픈·공백 제거)는 하지 않는다. 길이를 먼저 봐서 큰 목록을 정규식으로 훑지 않는다.
        List<String> requested = req == null ? null : req.getPnus();
        if (requested == null || requested.isEmpty() || requested.size() > MAX_PNUS) {
            throw new CustomException(GisErrorCode.PNU_ADDRESS_INVALID);
        }
        Set<String> pnus = new LinkedHashSet<>();
        for (String p : requested) {
            if (p == null || !PNU.matcher(p).matches()) throw new CustomException(GisErrorCode.PNU_ADDRESS_INVALID);
            pnus.add(p);
        }

        // 2) 자료 준비 확인
        if (!addressResolver.supported()) throw new CustomException(GisErrorCode.MYMAP_REF_UNAVAILABLE);
        String version = reader.readyVersion();
        if (version == null) throw new CustomException(GisErrorCode.MYMAP_REF_UNAVAILABLE);

        // 3) 동시 처리 제한
        if (!slots.tryAcquire()) throw new CustomException(GisErrorCode.PNU_ADDRESS_BUSY);
        try {
            return find(pnus, version);
        } finally {
            slots.release();
        }
    }

    private PnuAddressResponse find(Set<String> pnus, String version) {
        long started = System.nanoTime();

        // 4) 지번주소: 법정동 사전. 사전에 없으면(건물이 하나도 없는 법정동) 지적도의 법정동 이름으로 한 번 더
        Function<String, String> fmt = addressResolver.jibunAddressFormatter();
        Map<String, String> jibunByPnu = new HashMap<>();
        List<String> unresolved = new ArrayList<>();
        for (String pnu : pnus) {
            String jibun = fmt.apply(pnu);
            if (jibun == null || jibun.isEmpty()) unresolved.add(pnu);
            else jibunByPnu.put(pnu, jibun);
        }
        int dictionaryHits = jibunByPnu.size();
        if (!unresolved.isEmpty()) fillFromParcelNames(unresolved, jibunByPnu);

        // 5) 도로명주소: 지번 색인이 있을 때만(없으면 건물 표 전체 스캔이라 찾지 않는다)
        boolean roadAvailable = reader.jibunLookupReady();
        boolean relatedIncluded = false;
        Map<JibunKey, JibunAddresses> found = Map.of();
        if (roadAvailable) {
            Map<String, JibunKey> keys = new LinkedHashMap<>();
            for (String pnu : pnus) keys.put(pnu, TableAddressResolver.jibunKeyOf(pnu));
            found = reader.roadAddressesByJibun(keys.values(), MAX_ROAD_ADDRESSES);
            relatedIncluded = reader.relatedJibunLookupReady();
        }

        // 6) 조립 — 요청의 모든 PNU가 한 번씩, 처음 나온 순서
        List<Item> items = new ArrayList<>(pnus.size());
        int withRoad = 0;
        for (String pnu : pnus) {
            JibunAddresses a = roadAvailable ? found.get(TableAddressResolver.jibunKeyOf(pnu)) : null;
            List<RoadAddress> roads = new ArrayList<>();
            int buildingCount = 0, addressCount = 0;
            if (a != null) {
                buildingCount = a.buildingCount();
                addressCount = a.addressCount();
                List<RoadAddressRow> rows = a.rows();
                for (RoadAddressRow r : rows.subList(0, Math.min(MAX_ROAD_ADDRESSES, rows.size()))) {
                    roads.add(RoadAddress.builder()
                            .roadAddress(StandardAddressFormatter.road(r.parts()))
                            .zipCode(blankToNull(r.zipCode()))
                            .buildingName(blankToNull(ParcelBuildingService.displayName(r.apartment(), r.name(), r.sggName())))
                            .relation(r.relation())
                            .build());
                }
                if (addressCount > 0) withRoad++;
            }
            items.add(Item.builder()
                    .pnu(pnu)
                    .jibunAddress(blankToNull(jibunByPnu.get(pnu)))
                    .buildingCount(buildingCount)
                    .roadAddressCount(addressCount)
                    .roadAddresses(roads)
                    .build());
        }

        // 7) 로그 — PNU 값은 남기지 않는다
        log.info("[나만의지도] PNU 주소 찾기 요청={} 지번={}(사전 {}) 도로명있음={} 도로명조회={} 걸림={}ms", pnus.size(), jibunByPnu.size(),
                dictionaryHits, withRoad, roadAvailable, (System.nanoTime() - started) / 1_000_000L);

        return PnuAddressResponse.builder()
                .referenceVersion(blankToNull(version))
                .roadAvailable(roadAvailable)
                .relatedIncluded(relatedIncluded)
                .maxRoadAddresses(MAX_ROAD_ADDRESSES)
                .items(items)
                .build();
    }

    /** 사전에 없는 PNU의 지번주소를 지적도의 법정동 이름으로 만든다. DB 오류는 알리고 넘어간다(그 PNU는 지번주소 null). */
    private void fillFromParcelNames(List<String> unresolved, Map<String, String> jibunByPnu) {
        Map<String, String> names;
        try {
            names = parcelProvider.legalDongNamesByPnus(unresolved);
        } catch (DataAccessException e) {
            log.warn("[나만의지도] 지적도 법정동 이름 조회 실패 {}건 — 지번주소 없이 진행합니다: {}", unresolved.size(), e.getMessage());
            return;
        }
        for (String pnu : unresolved) {
            String name = names.get(pnu);
            if (name == null) continue;
            String clean = SPACES.matcher(name).replaceAll(" ").strip();   // "세종특별자치시  금남면" 처럼 공백이 둘일 수 있다
            if (clean.isEmpty()) continue;
            boolean mountain = pnu.charAt(10) == '2';
            int main = Integer.parseInt(pnu.substring(11, 15));
            int sub = Integer.parseInt(pnu.substring(15, 19));
            jibunByPnu.put(pnu, clean + " " + (mountain ? "산 " : "") + (sub > 0 ? main + "-" + sub : String.valueOf(main)));
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
