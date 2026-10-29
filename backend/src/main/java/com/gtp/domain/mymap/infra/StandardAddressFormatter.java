package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.infra.AddressRefReader.LegalDong;
import com.gtp.domain.mymap.infra.AddressRefReader.StandardParts;

import java.util.regex.Pattern;

/**
 * 표준 주소 조립(순수 함수). 도로명주소는 「도로명주소 활용 가이드(건물DB)」 붙임 2 표기 규칙:
 * <pre>시도 + 시군구 + [법정읍면동(법정리명이 있을 때)] + 도로명 + [지하·공중·수상] + 건물본번[-건물부번(0이면 생략)] + (참고항목)</pre>
 * 참고항목: 읍면(읍면동구분 0)이고 공동주택이 아니면 없음 / 읍면+공동주택이면 (시군구용건물명) /
 * 동(1)이고 공동주택이 아니면 (법정동명) / 동+공동주택이면 (법정동명, 시군구용건물명).
 * 지하(udgd_yn 1)는 건물본번 앞에 "지하", 2는 "공중", 3은 "수상"을 붙여 쓴다(예 {@code 왕산로 지하205}).
 * 시군구가 없으면(세종) 생략하고 공백은 하나로 모은다.
 */
public final class StandardAddressFormatter {

    private static final Pattern SPACES = Pattern.compile("\\s+");

    private StandardAddressFormatter() {
    }

    public static String road(StandardParts p) {
        StringBuilder sb = new StringBuilder();
        append(sb, p.sido());
        append(sb, p.sigungu());
        if (!p.li().isEmpty()) append(sb, p.emd());   // 법정리가 있는 읍면은 "읍면 + 도로명"으로 쓴다
        append(sb, p.roadName());
        append(sb, undergroundPrefix(p.udgd()) + number(p.main(), p.sub()));
        String ref = reference(p);
        if (!ref.isEmpty()) append(sb, "(" + ref + ")");
        return SPACES.matcher(sb.toString()).replaceAll(" ").trim();
    }

    /** 참고항목 안의 글자(괄호 제외). 없으면 "" */
    static String reference(StandardParts p) {
        String name = p.apartment() ? p.buildingName() : "";
        if (isEup(p)) return name;
        if (name.isEmpty()) return p.emd();
        return p.emd() + ", " + name;
    }

    /**
     * 읍면 지역인가. 읍면동구분 0이면 읍면, 1이면 동. 구분을 모르면(2 미부여·빈 값) 법정동 이름이 읍·면으로 끝나는지로 가린다.
     */
    static boolean isEup(StandardParts p) {
        return switch (p.emdGb()) {
            case "0" -> true;
            case "1" -> false;
            default -> p.emd().endsWith("읍") || p.emd().endsWith("면");
        };
    }

    /** 가이드 붙임4의 SQL이 {@code Decode(지하여부, 1, '지하', 2, '공중', 3, '수상') || 건물본번}으로 띄어쓰기 없이 이어 붙이므로 붙여 쓴다(예 지하205). */
    static String undergroundPrefix(String udgd) {
        return switch (udgd == null ? "" : udgd) {
            case "1" -> "지하";
            case "2" -> "공중";
            case "3" -> "수상";
            default -> "";
        };
    }

    /** 표준 지번주소: 시도 시군구 법정동 [리] [산 ]본번[-부번] */
    public static String jibun(LegalDong l, boolean mountain, int main, int sub) {
        StringBuilder sb = new StringBuilder();
        append(sb, l.sido());
        append(sb, l.sigungu());
        append(sb, l.emd());
        append(sb, l.li());
        append(sb, (mountain ? "산 " : "") + number(main, sub));
        return SPACES.matcher(sb.toString()).replaceAll(" ").trim();
    }

    /** PNU 19자리에서 지번주소를 만든다. 사전에 없는 법정동코드거나 형식이 틀리면 "" */
    public static String jibunOfPnu(String pnu, java.util.function.Function<String, LegalDong> byAdmCd) {
        if (pnu == null || pnu.length() != 19) return "";
        LegalDong l = byAdmCd.apply(pnu.substring(0, 10));
        if (l == null) return "";
        try {
            boolean mountain = pnu.charAt(10) == '2';
            return jibun(l, mountain, Integer.parseInt(pnu.substring(11, 15)), Integer.parseInt(pnu.substring(15, 19)));
        } catch (NumberFormatException e) {
            return "";
        }
    }

    private static String number(int main, int sub) {
        return sub > 0 ? main + "-" + sub : String.valueOf(main);
    }

    private static void append(StringBuilder sb, String part) {
        if (part == null || part.isBlank()) return;
        if (sb.length() > 0) sb.append(' ');
        sb.append(part.strip());
    }
}
