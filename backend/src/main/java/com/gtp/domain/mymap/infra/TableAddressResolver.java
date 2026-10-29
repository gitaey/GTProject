package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.infra.AddressRefReader.Building;
import com.gtp.domain.mymap.infra.AddressRefReader.BuildingKey;
import com.gtp.domain.mymap.infra.AddressRefReader.JibunKey;
import com.gtp.domain.mymap.infra.AddressRefReader.StandardParts;
import com.gtp.domain.mymap.infra.AddressRefReader.LegalDong;
import com.gtp.domain.mymap.infra.AddressRefReader.RoadCode;
import com.gtp.domain.mymap.model.ImportFailureReason;
import com.gtp.domain.mymap.port.AddressMatch;
import com.gtp.domain.mymap.port.AddressResolver;
import com.gtp.domain.mymap.port.StandardAddress;
import com.gtp.domain.mymap.util.AddressNormalizer;
import com.gtp.domain.mymap.util.AddressNormalizer.Kind;
import com.gtp.domain.mymap.util.AddressNormalizer.Parsed;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import lombok.extern.slf4j.Slf4j;

import java.util.*;

/**
 * 도로명주소 건물DB로 주소 → PNU. 규칙은 설계 4.2~4.4(실제 데이터 기준으로 바뀐 부분은 이 클래스가 기준):
 *
 * - 지번: 법정동 사전(건물정보의 distinct 행정구역 — 메모리, 적재 기준월이 바뀌면 다시 만듦)에서 읍면동·리 이름과 시도·시군구로 법정동코드를
 *   정하고 PNU를 조립한다. DB 조회 없음. 같은 이름이 여럿이면 AMBIGUOUS.
 * - 도로명: 도로명코드 표에서 도로명으로 road_cd 후보 → 시도·시군구로 좁힘(사용 중·말소 없는 것 우선) → 건물정보를 키 묶음으로 조회 →
 *   대표 지번의 PNU. 후보 지역이 둘 이상이면 AMBIGUOUS.
 * - 한 번 부를 때 같은 주소는 한 번만 풀고, DB 조회는 도로명 묶음 1회 + 건물번호 묶음 1회(500개씩)다.
 *
 * 상태: 법정동 사전(불변 스냅샷, volatile)뿐이다. 호출은 여러 스레드에서 동시에 와도 된다.
 */
@Slf4j
public class TableAddressResolver implements AddressResolver {

    private final AddressRefReader reader;
    private final int maxCandidates;
    private volatile Dictionary dictionary;

    public TableAddressResolver(AddressRefReader reader, int maxCandidates) {
        this.reader = reader;
        this.maxCandidates = Math.max(1, maxCandidates);
    }

    /** PNU 19자리 = 법정동코드(10) + 대지구분(1: 대지·2: 산) + 본번(4, 0 채움) + 부번(4, 0 채움) */
    public static String pnu(String admCd, boolean mountain, int main, int sub) {
        return admCd + (mountain ? '2' : '1') + String.format(Locale.ROOT, "%04d%04d", main, sub);
    }

    @Override
    public boolean supported() {
        return true;
    }

    @Override
    public boolean available() {
        return reader.readyVersion() != null;
    }

    @Override
    public String referenceVersion() {
        return reader.readyVersion();
    }

    // ---------- 표준 주소 (변환 전용) ----------

    /**
     * 해석된 행의 표준 주소. 지번주소는 법정동 사전(메모리)으로, 도로명주소는 도로명 입력 행이면 해석 때 찾은 건물로,
     * 지번 입력 행이면 건물정보에서 지번으로 찾을 수 있을 때만({@link AddressRefReader#jibunLookupReady()} — 색인이 있을 때) 만든다.
     * DB 조회는 도로 키 묶음 1회 + (지번 행이 있고 색인이 있으면) 지번 키 묶음 1회(500개씩).
     */
    @Override
    public List<StandardAddress> standardize(List<AddressMatch> matches, boolean wantRoad, boolean wantJibun) {
        String version = reader.readyVersion();
        if (version == null) throw new CustomException(GisErrorCode.MYMAP_REF_UNAVAILABLE);
        Dictionary dict = dictionaryFor(version);

        Set<BuildingKey> roadKeys = new LinkedHashSet<>();
        Set<JibunKey> jibunKeys = new LinkedHashSet<>();
        boolean jibunLookup = wantRoad && matches.stream().anyMatch(m -> isMatched(m) && m.building() == null) && reader.jibunLookupReady();
        for (AddressMatch m : matches) {
            if (!isMatched(m) || !wantRoad) continue;
            if (m.building() != null) roadKeys.add(keyOf(m.building()));
            else if (jibunLookup && m.pnu().length() == 19) jibunKeys.add(jibunKeyOf(m.pnu()));
        }
        Map<BuildingKey, StandardParts> byRoad = roadKeys.isEmpty() ? Map.of() : reader.standardPartsByRoad(roadKeys);
        Map<JibunKey, StandardParts> byJibun = jibunKeys.isEmpty() ? Map.of() : reader.standardPartsByJibun(jibunKeys);

        List<StandardAddress> out = new ArrayList<>(matches.size());
        for (AddressMatch m : matches) {
            if (!isMatched(m)) {
                out.add(StandardAddress.EMPTY);
                continue;
            }
            String jibun = wantJibun ? StandardAddressFormatter.jibunOfPnu(m.pnu(), dict.byCode::get) : "";
            String road = "";
            if (wantRoad) {
                StandardParts parts = m.building() != null ? byRoad.get(keyOf(m.building()))
                        : (jibunLookup && m.pnu().length() == 19 ? byJibun.get(jibunKeyOf(m.pnu())) : null);
                if (parts != null) road = StandardAddressFormatter.road(parts);
            }
            out.add(new StandardAddress(road, jibun));
        }
        return out;
    }

    @Override
    public java.util.function.Function<String, String> jibunAddressFormatter() {
        String version = reader.readyVersion();
        if (version == null) return pnu -> "";
        Dictionary dict = dictionaryFor(version);
        return pnu -> StandardAddressFormatter.jibunOfPnu(pnu, dict.byCode::get);
    }

    private static boolean isMatched(AddressMatch m) {
        return m != null && m.status() == AddressMatch.Status.MATCHED && m.pnu() != null;
    }

    private static BuildingKey keyOf(AddressMatch.BuildingRef b) {
        return new BuildingKey(b.roadCd(), b.udgd(), b.main(), b.sub());
    }

    /** PNU 19자리 → 지번 찾기 키(법정동코드 10 + 산여부 + 본번 + 부번) */
    private static JibunKey jibunKeyOf(String pnu) {
        return new JibunKey(pnu.substring(0, 10), pnu.charAt(10) == '2' ? "1" : "0",
                Integer.parseInt(pnu.substring(11, 15)), Integer.parseInt(pnu.substring(15, 19)));
    }

    // ---------- 법정동 사전 ----------

    private static final class Dictionary {
        final String version;
        /** 이름(리가 있으면 리, 없으면 읍면동) → 같은 이름의 법정동 */
        final Map<String, List<LegalDong>> byName;
        /** 법정동코드 → 법정동(표준 지번주소용) */
        final Map<String, LegalDong> byCode;

        Dictionary(String version, Map<String, List<LegalDong>> byName, Map<String, LegalDong> byCode) {
            this.version = version;
            this.byName = byName;
            this.byCode = byCode;
        }
    }

    private Dictionary dictionaryFor(String version) {
        Dictionary d = dictionary;
        if (d != null && d.version.equals(version)) return d;
        synchronized (this) {
            d = dictionary;
            if (d != null && d.version.equals(version)) return d;
            Map<String, List<LegalDong>> by = new HashMap<>();
            Map<String, LegalDong> byCode = new HashMap<>();
            int n = 0;
            for (LegalDong l : reader.legalDongs()) {
                if (l.admCd().length() != 10 || l.emd().isEmpty()) continue;
                by.computeIfAbsent(l.li().isEmpty() ? l.emd() : l.li(), k -> new ArrayList<>(2)).add(l);
                byCode.putIfAbsent(l.admCd(), l);
                n++;
            }
            d = new Dictionary(version, by, byCode);
            dictionary = d;
            log.info("[나만의지도] 법정동 사전을 만들었습니다 기준월={} {}건", version, n);
            return d;
        }
    }

    // ---------- 해석 ----------

    @Override
    public List<AddressMatch> resolve(List<String> rawAddresses) {
        String version = reader.readyVersion();
        if (version == null) throw new CustomException(GisErrorCode.MYMAP_REF_UNAVAILABLE);
        Dictionary dict = dictionaryFor(version);

        // 1) 형식 분석(같은 주소는 한 번만)
        Map<String, Parsed> parsedByRaw = new HashMap<>();
        Map<String, Parsed> pending = new LinkedHashMap<>();   // 정리된 주소 → 분석 결과
        for (String raw : rawAddresses) {
            Parsed p = parsedByRaw.computeIfAbsent(raw == null ? "" : raw, AddressNormalizer::parse);
            if (p.kind() != Kind.FAILED) pending.putIfAbsent(p.normalized(), p);
        }

        // 2) 풀기: 지번은 메모리, 도로명은 DB 두 번
        Map<String, AddressMatch> resolved = new HashMap<>();
        List<Parsed> roads = new ArrayList<>();
        for (Parsed p : pending.values()) {
            if (p.sidoUnknown()) {
                resolved.put(p.normalized(), AddressMatch.failed(ImportFailureReason.SIDO_UNKNOWN, p.normalized()));
            } else if (p.kind() == Kind.JIBUN) {
                resolved.put(p.normalized(), resolveJibun(p, dict));
            } else {
                roads.add(p);
            }
        }
        resolveRoads(roads, dict, resolved);

        // 3) 입력 순서대로
        List<AddressMatch> out = new ArrayList<>(rawAddresses.size());
        for (String raw : rawAddresses) {
            Parsed p = parsedByRaw.get(raw == null ? "" : raw);
            if (p.kind() == Kind.FAILED) out.add(AddressMatch.failed(p.failure(), p.normalized()));
            else out.add(resolved.get(p.normalized()));
        }
        return out;
    }

    // ---------- 지번 ----------

    private AddressMatch resolveJibun(Parsed p, Dictionary dict) {
        List<LegalDong> hits = findLegalDongs(p, dict);
        if (hits.isEmpty()) return AddressMatch.failed(ImportFailureReason.LEGAL_DONG_NOT_FOUND, p.normalized());
        if (hits.size() == 1) {
            return AddressMatch.matched(pnu(hits.get(0).admCd(), p.mountain(), p.main(), p.sub()), p.normalized());
        }
        List<String> candidates = new ArrayList<>();
        for (LegalDong l : hits) {
            candidates.add(joinNonEmpty(l.sido(), l.sigungu(), l.emd(), l.li()) + " " + (p.mountain() ? "산 " : "") + number(p.main(), p.sub()));
        }
        return AddressMatch.ambiguous(p.normalized(), limit(candidates));
    }

    /** 이름·시도·시군구가 맞는 법정동(법정동코드 중복 없이, 정렬됨) */
    private List<LegalDong> findLegalDongs(Parsed p, Dictionary dict) {
        List<LegalDong> byName = dict.byName.get(p.name());
        if (byName == null) return List.of();
        Set<String> sidoNames = p.sido() == null ? null : new HashSet<>(AddressNormalizer.sidoNames(p.sido()));
        Map<String, LegalDong> byCode = new TreeMap<>();
        for (LegalDong l : byName) {
            if (sidoNames != null && !sidoNames.contains(l.sido())) continue;
            List<String> rest = new ArrayList<>(p.places());
            // 리가 있는 법정동은 "읍면 리"로 적는 경우가 많다 — 앞 토큰이 그 읍면동이면 먹는다
            if (!l.li().isEmpty() && !rest.isEmpty() && rest.get(rest.size() - 1).equals(l.emd())) rest.remove(rest.size() - 1);
            boolean ok = true;
            for (String t : rest) {
                if (!sigunguMatches(t, l.sigungu())) {
                    ok = false;
                    break;
                }
            }
            if (ok) byCode.putIfAbsent(l.admCd(), l);
        }
        List<LegalDong> out = new ArrayList<>(byCode.values());
        out.sort(Comparator.comparing(LegalDong::sido).thenComparing(LegalDong::sigungu).thenComparing(LegalDong::emd).thenComparing(LegalDong::li));
        return out;
    }

    // ---------- 도로명 ----------

    private void resolveRoads(List<Parsed> roads, Dictionary dict, Map<String, AddressMatch> resolved) {
        if (roads.isEmpty()) return;
        Set<String> names = new TreeSet<>();
        for (Parsed p : roads) names.add(p.name());
        Map<String, List<RoadCode>> codesByName = new HashMap<>();
        for (RoadCode c : reader.findRoadCodes(names)) {
            codesByName.computeIfAbsent(c.name(), k -> new ArrayList<>(2)).add(c);
        }

        Map<Parsed, List<RoadCode>> plans = new LinkedHashMap<>();
        Set<BuildingKey> keys = new LinkedHashSet<>();
        for (Parsed p : roads) {
            List<RoadCode> narrowed = narrow(p, codesByName.getOrDefault(p.name(), List.of()));
            if (narrowed.isEmpty()) {
                // 세종로처럼 "로"로 끝나는 법정동 이름일 수 있다 — 도로명이 없으면 지번으로 한 번 더 본다
                AddressMatch asJibun = resolveJibun(p, dict);
                resolved.put(p.normalized(), asJibun.status() != AddressMatch.Status.FAILED
                        ? asJibun : AddressMatch.failed(ImportFailureReason.ROAD_NOT_FOUND, p.normalized()));
                continue;
            }
            plans.put(p, narrowed);
            for (RoadCode c : narrowed) keys.add(keyOf(c, p));
        }
        if (plans.isEmpty()) return;

        Map<BuildingKey, List<Building>> buildings = new HashMap<>();
        for (Building b : reader.findBuildings(keys)) {
            buildings.computeIfAbsent(b.key(), k -> new ArrayList<>(1)).add(b);
        }
        for (Map.Entry<Parsed, List<RoadCode>> e : plans.entrySet()) {
            resolved.put(e.getKey().normalized(), finishRoad(e.getKey(), e.getValue(), buildings));
        }
    }

    private static BuildingKey keyOf(RoadCode c, Parsed p) {
        return new BuildingKey(c.roadCd(), p.underground() ? "1" : "0", p.main(), p.sub());
    }

    /** 시도·시군구로 좁히고, 사용 중이고 말소 없는 도로명코드가 있으면 그것만 남긴다. road_cd 중복은 하나로. */
    private List<RoadCode> narrow(Parsed p, List<RoadCode> all) {
        Set<String> sidoNames = p.sido() == null ? null : new HashSet<>(AddressNormalizer.sidoNames(p.sido()));
        List<String> sigTokens = new ArrayList<>();
        for (String t : p.places()) {
            if (t.endsWith("시") || t.endsWith("군") || t.endsWith("구")) sigTokens.add(t);
        }
        Map<String, RoadCode> byCode = new LinkedHashMap<>();
        for (RoadCode c : all) {
            if (sidoNames != null && !sidoNames.contains(c.sido())) continue;
            boolean ok = true;
            for (String t : sigTokens) {
                if (!c.sigungu().isEmpty() && !sigunguMatches(t, c.sigungu())) {
                    ok = false;
                    break;
                }
            }
            if (!ok) continue;
            byCode.merge(c.roadCd(), c, (a, b) -> a.active() ? a : b);
        }
        boolean anyActive = byCode.values().stream().anyMatch(RoadCode::active);
        List<RoadCode> out = new ArrayList<>();
        for (RoadCode c : byCode.values()) {
            if (!anyActive || c.active()) out.add(c);
        }
        return out;
    }

    private AddressMatch finishRoad(Parsed p, List<RoadCode> roads, Map<BuildingKey, List<Building>> buildings) {
        Map<String, List<Building>> hits = new LinkedHashMap<>();   // road_cd → 그 도로에서 찾은 건물
        Set<String> areas = new HashSet<>();                        // 후보 도로가 걸친 시도·시군구
        for (RoadCode c : roads) {
            areas.add(c.sido() + "|" + c.sigungu());
            List<Building> found = buildings.get(keyOf(c, p));
            if (found != null && !found.isEmpty()) hits.put(c.roadCd(), found);
        }
        if (hits.isEmpty()) return AddressMatch.failed(ImportFailureReason.BUILDING_NO_NOT_FOUND, p.normalized());

        // 확정 조건: 건물이 있는 도로가 하나뿐이고, (시도를 적어서 범위가 그 시도로 좁혀졌거나 후보 도로가 한 시도·시군구에만 있다).
        // 시도도 없이 건물이 한 곳뿐인 경우는 오타 하나로 다른 도에 찍힐 수 있어 확정하지 않는다.
        boolean scoped = p.sido() != null || areas.size() == 1;
        if (scoped && hits.size() == 1) {
            Building rep = representative(hits.values().iterator().next());
            return AddressMatch.matched(rep.pnu(), p.normalized(),
                    new AddressMatch.BuildingRef(rep.key().roadCd(), rep.key().udgd(), rep.key().main(), rep.key().sub()));
        }
        // 지역을 못 가렸거나(시도·시군구 생략) 같은 지역에 같은 번호가 둘 이상 — 고르지 않고 후보를 보여 준다
        List<String> candidates = new ArrayList<>();
        for (List<Building> found : hits.values()) {
            Building b = representative(found);
            String emd = b.emd().isEmpty() ? "" : " (" + b.emd() + ")";
            candidates.add(joinNonEmpty(b.sido(), b.sigungu(), b.roadName()) + " " + (p.underground() ? "지하 " : "") + number(p.main(), p.sub()) + emd);
        }
        return AddressMatch.ambiguous(p.normalized(), limit(candidates));
    }

    /** 같은 도로명주소에 건물이 여럿(건물군)이면 PNU가 가장 작은 것을 대표로 쓴다 — 결과가 실행마다 달라지지 않게. */
    private static Building representative(List<Building> found) {
        Building best = null;
        for (Building b : found) {
            if (best == null || b.pnu().compareTo(best.pnu()) < 0) best = b;
        }
        return best;
    }

    // ---------- 공통 ----------

    /** 입력의 시군구 토큰이 사전·도로명코드의 시군구("수원시 장안구")에 맞는가. "수원"처럼 시·군·구를 뺀 표기도 받는다. 시군구가 없는 곳(세종)은 거짓(호출한 쪽이 따로 다룬다). */
    static boolean sigunguMatches(String token, String sigungu) {
        if (sigungu.isEmpty()) return false;
        boolean bare = token.length() >= 2 && !(token.endsWith("시") || token.endsWith("군") || token.endsWith("구"));
        for (String s : sigungu.split(" ")) {
            if (s.equals(token)) return true;
            if (bare && (s.equals(token + "시") || s.equals(token + "군") || s.equals(token + "구"))) return true;
        }
        return false;
    }

    private List<String> limit(List<String> candidates) {
        List<String> distinct = new ArrayList<>(new TreeSet<>(candidates));
        return distinct.size() > maxCandidates ? new ArrayList<>(distinct.subList(0, maxCandidates)) : distinct;
    }

    private static String number(int main, int sub) {
        return sub > 0 ? main + "-" + sub : String.valueOf(main);
    }

    private static String joinNonEmpty(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String s : parts) {
            if (s == null || s.isEmpty()) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(s);
        }
        return sb.toString();
    }
}
