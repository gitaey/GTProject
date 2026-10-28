package com.gtp.domain.mymap.util;

import com.gtp.domain.mymap.model.ImportFailureReason;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 주소 한 칸 → 도로명/지번 분류 + 조각(시도·지역 토큰·도로명/법정동·번호). DB·네트워크 없는 순수 함수라 시험이 쉽다.
 *
 * 한 칸에 도로명주소와 지번주소가 섞여 올 수 있어서 이름 토큰의 끝 글자로 가른다:
 * "…로|길 + [지하] 번호" = 도로명, "…동|읍|면|리|가 + [산] 번호" = 지번. 둘 다 아니면 PARSE_FAILED.
 * 번호 뒤에 오는 것(건물명·동·호·층·외 N필지)은 전부 버린다. 시도 약칭은 {@link #sidoNames}로 현행·옛 명칭 후보로 늘린다.
 * 여기서는 "형식"만 본다 — 그 주소가 실제로 있는지는 {@code TableAddressResolver}가 사전·DB로 확인한다.
 */
public final class AddressNormalizer {

    private AddressNormalizer() {
    }

    public enum Kind { ROAD, JIBUN, FAILED }

    /**
     * @param failure   kind가 FAILED일 때 사유(PARSE_FAILED·BUILDING_NO_NOT_FOUND·JIBUN_MISSING), 아니면 null
     * @param normalized 정리된 주소(같은 주소를 한 번만 조회하는 키이자 보고서 표시용)
     * @param sido      입력한 시도 표기(약칭 그대로) 또는 null
     * @param sidoUnknown 첫 토큰이 시도처럼 생겼는데 아는 이름이 아니다
     * @param places    시도와 이름 사이의 토큰들(시군구·읍면동 …, 입력 그대로)
     * @param name      도로명(ROAD, 예 "세종대로"·"중앙로1길") 또는 법정동·리 이름(JIBUN, 예 "태평로1가"·"월하리")
     * @param underground ROAD 전용 — 지하 건물
     * @param mountain  JIBUN 전용 — 산 번지
     * @param main      건물본번(ROAD)·지번 본번(JIBUN)
     * @param sub       건물부번·지번 부번(없으면 0)
     */
    public record Parsed(Kind kind, ImportFailureReason failure, String normalized, String sido, boolean sidoUnknown,
                         List<String> places, String name, boolean underground, boolean mountain, int main, int sub) {

        static Parsed failed(ImportFailureReason reason, String normalized) {
            return new Parsed(Kind.FAILED, reason, normalized, null, false, List.of(), null, false, false, 0, 0);
        }
    }

    // ---------- 시도 ----------

    private static final Map<String, List<String>> SIDO_ALIASES = new LinkedHashMap<>();

    private static void sido(List<String> officialNames, String... aliases) {
        List<String> names = Collections.unmodifiableList(new ArrayList<>(officialNames));
        for (String a : aliases) SIDO_ALIASES.put(a, names);
    }

    static {
        sido(List.of("서울특별시"), "서울", "서울시", "서울특별시");
        sido(List.of("부산광역시"), "부산", "부산시", "부산광역시");
        sido(List.of("대구광역시"), "대구", "대구시", "대구광역시");
        sido(List.of("인천광역시"), "인천", "인천시", "인천광역시");
        sido(List.of("대전광역시"), "대전", "대전시", "대전광역시");
        sido(List.of("울산광역시"), "울산", "울산시", "울산광역시");
        // 광주는 전남과 합쳐진 시기의 명칭을 함께 후보로 둔다(자료에 있는 이름만 쓰인다). "광주시"는 경기도의 시라 약칭이 아니다
        sido(List.of("광주광역시", "전남광주통합특별시"), "광주", "광주광역시");
        sido(List.of("세종특별자치시"), "세종", "세종시", "세종특별자치시");
        sido(List.of("경기도"), "경기", "경기도");
        sido(List.of("강원특별자치도", "강원도"), "강원", "강원도", "강원특별자치도");
        sido(List.of("충청북도"), "충북", "충청북도");
        sido(List.of("충청남도"), "충남", "충청남도");
        sido(List.of("전북특별자치도", "전라북도"), "전북", "전라북도", "전북특별자치도");
        sido(List.of("전라남도", "전남광주통합특별시"), "전남", "전라남도");
        sido(List.of("전남광주통합특별시"), "전남광주", "전남광주통합시", "전남광주통합특별시");
        sido(List.of("경상북도"), "경북", "경상북도");
        sido(List.of("경상남도"), "경남", "경상남도");
        sido(List.of("제주특별자치도"), "제주", "제주도", "제주특별자치도");
    }

    /** 시도 표기(약칭 가능) → 현행·옛 정식 명칭 후보. 모르는 표기면 빈 목록. */
    public static List<String> sidoNames(String token) {
        List<String> names = token == null ? null : SIDO_ALIASES.get(token);
        return names == null ? List.of() : names;
    }

    // ---------- 정리 ----------

    private static final Pattern PAREN_ROUND = Pattern.compile("\\([^)]*+\\)");
    private static final Pattern PAREN_SQUARE = Pattern.compile("\\[[^\\]]*+]");
    private static final Pattern OPEN_PAREN_TAIL = Pattern.compile("[(\\[].*$");
    private static final Pattern DASHES = Pattern.compile("[\\u2010-\\u2015\\u2212]");
    // 번지 뒤 부번: "422번지 5호"·"422번지 5" → 422-5. 소유 수량자(++, *+)로 긴 입력에서도 되돌아가기(역추적)를 막는다
    private static final Pattern BEONJI_HO = Pattern.compile("(?<!\\d)(\\d++)\\s*+번지\\s*+(\\d++)\\s*+호");
    private static final Pattern BEONJI_NUM = Pattern.compile("(?<!\\d)(\\d++)\\s*+번지\\s*+(\\d++)(?=\\s|\\z)");
    private static final Pattern BEONJI = Pattern.compile("(\\d)\\s*+번지");
    private static final Pattern DASH_SPACE = Pattern.compile("(\\d)\\s*-\\s*(\\d)");
    private static final Pattern WS = Pattern.compile("\\s+");

    private static final String NUM = "\\d{1,6}(?:-\\d{1,6})?";
    private static final Pattern NUMBER = Pattern.compile("^(\\d{1,6})(?:-(\\d{1,6}))?$");
    private static final Pattern SAN_NUM = Pattern.compile("^산(" + NUM + ")$");
    private static final Pattern JIHA_NUM = Pattern.compile("^지하(" + NUM + ")$");
    private static final Pattern NAME_NUM = Pattern.compile("^(.*[로길동읍면리가])(" + NUM + ")$");
    private static final Pattern GIL_PART = Pattern.compile("^\\d{1,4}(?:번)?길$");
    private static final Pattern GA_PART = Pattern.compile("^\\d{1,3}가$");
    private static final Pattern ZIP = Pattern.compile("^\\d{5}$");

    /** 주소 한 칸의 최대 글자 수 */
    static final int MAX_CHARS = 300;
    private static final int ROAD_MAIN_MAX = 99_999, SUB_MAX = 9_999, JIBUN_MAIN_MAX = 9_999;

    /** 로|길로 끝나면 ROAD, 동|읍|면|리|가로 끝나면 JIBUN, 아니면 FAILED(이름 토큰이 아니다) */
    static Kind nameKind(String token) {
        if (token.length() < 2) return Kind.FAILED;
        char c = token.charAt(token.length() - 1);
        if (c == '로' || c == '길') return Kind.ROAD;
        if (c == '동' || c == '읍' || c == '면' || c == '리' || c == '가') return Kind.JIBUN;
        return Kind.FAILED;
    }

    /** 지도에 올릴 수 있는 형태의 주소인가(컬럼 추천용) */
    public static boolean looksLikeAddress(String text) {
        return parse(text).kind() != Kind.FAILED;
    }

    public static Parsed parse(String raw) {
        if (raw == null || raw.isBlank()) return Parsed.failed(ImportFailureReason.PARSE_FAILED, "");
        // 실제 주소는 훨씬 짧다. 이보다 길면 읽지 않고 실패로(정규식 처리 시간 상한 + 번호가 잘려 틀린 번지가 되는 일 방지)
        if (raw.length() > MAX_CHARS) return Parsed.failed(ImportFailureReason.PARSE_FAILED, "");

        String s = Normalizer.normalize(raw, Normalizer.Form.NFKC);   // 전각 → 반각, 분해된 한글 합치기
        // 닫는 괄호가 없으면 건너뛴다(여는 괄호마다 끝까지 훑는 O(n^2)를 피함). 닫히지 않은 괄호는 아래 OPEN_PAREN_TAIL이 처리
        if (s.indexOf(')') >= 0) s = PAREN_ROUND.matcher(s).replaceAll(" ");
        if (s.indexOf(']') >= 0) s = PAREN_SQUARE.matcher(s).replaceAll(" ");
        s = OPEN_PAREN_TAIL.matcher(s).replaceAll(" ");
        s = s.replace(',', ' ');
        s = DASHES.matcher(s).replaceAll("-");
        s = BEONJI_HO.matcher(s).replaceAll("$1-$2");
        s = BEONJI_NUM.matcher(s).replaceAll("$1-$2");
        s = BEONJI.matcher(s).replaceAll("$1");
        s = DASH_SPACE.matcher(s).replaceAll("$1-$2");
        s = WS.matcher(s.strip()).replaceAll(" ");
        if (s.isEmpty()) return Parsed.failed(ImportFailureReason.PARSE_FAILED, "");

        List<String> tokens = new ArrayList<>(List.of(s.split(" ")));
        if (tokens.size() > 1 && ZIP.matcher(tokens.get(0)).matches()) tokens.remove(0);   // 앞의 우편번호
        tokens = splitGlued(tokens);
        tokens = joinParts(tokens);

        int start = 0;
        String sido = null;
        boolean sidoUnknown = false;
        String t0 = tokens.get(0);
        if (SIDO_ALIASES.containsKey(t0) && !(t0.equals("광주") && tokens.size() > 1 && !tokens.get(1).endsWith("구"))) {
            sido = t0;
            start = 1;
        } else if (tokens.size() > 1 && looksLikeUnknownSido(t0)) {
            sidoUnknown = true;
            start = 1;
        }

        // 번호: 시도 뒤에서 처음 나오는 순수 숫자 토큰
        int j = -1;
        for (int i = start; i < tokens.size(); i++) {
            if (NUMBER.matcher(tokens.get(i)).matches()) {
                j = i;
                break;
            }
        }
        if (j < 0) {
            String last = tokens.get(tokens.size() - 1);
            Kind lk = tokens.size() > start ? nameKind(last) : Kind.FAILED;
            // "어딘가"처럼 그냥 "가"로 끝나는 말은 지번 이름이 아니다("종로1가"처럼 숫자 뒤의 가만 지번 이름) — 번지 없음이 아니라 형식 불명
            if (lk == Kind.JIBUN && last.endsWith("가") && !Character.isDigit(last.charAt(last.length() - 2))) lk = Kind.FAILED;
            ImportFailureReason r = lk == Kind.ROAD ? ImportFailureReason.BUILDING_NO_NOT_FOUND
                    : lk == Kind.JIBUN ? ImportFailureReason.JIBUN_MISSING : ImportFailureReason.PARSE_FAILED;
            return Parsed.failed(r, String.join(" ", tokens));
        }

        int k = j - 1;
        boolean underground = false, mountain = false;
        if (k >= start && tokens.get(k).equals("지하")) {
            underground = true;
            k--;
        } else if (k >= start && tokens.get(k).equals("산")) {
            mountain = true;
            k--;
        }
        Kind kind = k >= start ? nameKind(tokens.get(k)) : Kind.FAILED;
        if (kind == Kind.FAILED) return Parsed.failed(ImportFailureReason.PARSE_FAILED, String.join(" ", tokens));

        // 번호 바로 뒤에 숫자만 남은 꼬리("422 5"·"226 12")는 부번인지 아닌지 알 수 없다 — 틀린 위치에 찍느니 실패.
        // (동·호·층 같은 상세주소 "101동"·"202호"·"3층"은 숫자만이 아니라서 아래에서 그대로 버려진다)
        if (j + 1 < tokens.size() && NUMBER.matcher(tokens.get(j + 1)).matches()) {
            return Parsed.failed(ImportFailureReason.PARSE_FAILED, String.join(" ", tokens));
        }

        Matcher m = NUMBER.matcher(tokens.get(j));
        m.matches();
        int main = Integer.parseInt(m.group(1));
        int sub = m.group(2) == null ? 0 : Integer.parseInt(m.group(2));
        int mainMax = kind == Kind.ROAD ? ROAD_MAIN_MAX : JIBUN_MAIN_MAX;
        if (main < 1 || main > mainMax || sub > SUB_MAX) {
            return Parsed.failed(ImportFailureReason.PARSE_FAILED, String.join(" ", tokens));
        }
        if (kind == Kind.ROAD) mountain = false;
        else underground = false;

        List<String> places = new ArrayList<>(tokens.subList(start, k));
        String name = tokens.get(k);

        StringBuilder norm = new StringBuilder();
        if (sido != null) norm.append(sido).append(' ');
        else if (sidoUnknown) norm.append(t0).append(' ');
        for (String p : places) norm.append(p).append(' ');
        norm.append(name).append(' ');
        if (underground) norm.append("지하 ");
        if (mountain) norm.append("산 ");
        norm.append(main);
        if (sub > 0) norm.append('-').append(sub);

        return new Parsed(kind, null, norm.toString(), sido, sidoUnknown, List.copyOf(places), name, underground, mountain, main, sub);
    }

    /** "산12-3"·"지하110"·"세종대로110" 처럼 붙어 온 토큰을 나눈다. */
    private static List<String> splitGlued(List<String> tokens) {
        List<String> out = new ArrayList<>(tokens.size() + 2);
        for (String t : tokens) {
            Matcher san = SAN_NUM.matcher(t);
            Matcher jiha = JIHA_NUM.matcher(t);
            Matcher glued = NAME_NUM.matcher(t);
            if (san.matches()) {
                out.add("산");
                out.add(san.group(1));
            } else if (jiha.matches()) {
                out.add("지하");
                out.add(jiha.group(1));
            } else if (glued.matches()) {
                out.add(glued.group(1));
                out.add(glued.group(2));
            } else {
                out.add(t);
            }
        }
        return out;
    }

    /** "중앙로 1길"·"보수대로 289번길"·"종로 1가"처럼 떨어져 온 조각을 앞 토큰에 붙인다. */
    private static List<String> joinParts(List<String> tokens) {
        List<String> out = new ArrayList<>(tokens.size());
        for (String t : tokens) {
            if (!out.isEmpty() && (GIL_PART.matcher(t).matches() || GA_PART.matcher(t).matches())) {
                String prev = out.get(out.size() - 1);
                char c = prev.charAt(prev.length() - 1);
                if (!Character.isDigit(c) && !prev.equals("산") && !prev.equals("지하")) {
                    out.set(out.size() - 1, prev + t);
                    continue;
                }
            }
            out.add(t);
        }
        return out;
    }

    private static boolean looksLikeUnknownSido(String t) {
        if (t.endsWith("특별시") || t.endsWith("광역시") || t.endsWith("특별자치시") || t.endsWith("특별자치도")) return true;
        return t.length() >= 3 && t.endsWith("도") && !SIDO_ALIASES.containsKey(t);
    }
}
