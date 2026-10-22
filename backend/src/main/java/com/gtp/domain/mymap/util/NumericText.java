package com.gtp.domain.mymap.util;

import java.text.Normalizer;
import java.util.regex.Pattern;

/**
 * 속성값(문자열로 저장됨)이 숫자인지 판정하는 규칙 — 서버의 컬럼 통계와 프론트의 구간 색칠이 같은 규칙을 써야 한다.
 *
 * 숫자로 보는 것: 앞뒤 공백(NBSP·전각 공백 포함)을 뗀 뒤
 * - 부호(+/-) 소수점 지수(1.5E+3, 1e5)가 있는 보통 숫자: {@code 12}, {@code -3.5}, {@code .5}, {@code 5.}, {@code 1.5E+3}
 * - <b>올바르게 묶은</b> 천 단위 쉼표: {@code 1,234}, {@code 1,234,567.89} (쉼표 뒤가 정확히 3자리씩일 때만)
 * - 전각 숫자(１２) — NFKC로 정리
 * 숫자로 보지 않는 것(null): 빈 값, {@code NaN}·{@code Infinity}, 16진수, 퍼센트·통화 기호가 붙은 값({@code 12%}, {@code ₩100}),
 * 잘못 묶은 쉼표({@code 1,5} {@code 12,34}), 공백으로 자리를 나눈 값({@code 1 000}),
 * <b>앞에 0이 붙은 코드</b>({@code 007}, {@code 0123} — 우편번호·관리번호처럼 앞자리 0이 의미 있는 값), <b>16자리 이상 정수</b>(PNU 같은 식별자, 실수로 정밀도가 깨진다).
 * <b>절댓값이 1e15 이상인 값</b>({@code 1e15}, {@code 9e15}, {@code 1.5E+16} — 16자리 이상 정수와 같은 취지)도 숫자가 아니다.
 * ({@code 0}, {@code 0.5}, {@code -0.5}, {@code 9.99e14}는 숫자.)
 */
public final class NumericText {

    private static final Pattern GROUPED = Pattern.compile("^[+-]?\\d{1,3}(,\\d{3})+(\\.\\d+)?$");
    private static final Pattern PLAIN = Pattern.compile("^[+-]?(\\d+(\\.\\d*)?|\\.\\d+)([eE][+-]?\\d+)?$");
    private static final int MAX_INTEGER_DIGITS = 15;
    /** 숫자로 보는 절댓값의 상한(미포함). 정수부 15자리 상한(=1e15 미만)과 같은 취지로 지수 표기({@code 9e15}, {@code 1.5E+16})에도 적용한다. 구간 경계 상한과 같다. */
    public static final double ABS_LIMIT = 1e15;

    private NumericText() {
    }

    /** 숫자면 그 값, 아니면 null. */
    public static Double parse(String raw) {
        if (raw == null) return null;
        String s = jsTrim(Normalizer.normalize(raw, Normalizer.Form.NFKC));
        if (s.isEmpty()) return null;
        if (s.indexOf(',') >= 0) {
            if (!GROUPED.matcher(s).matches()) return null;
            s = s.replace(",", "");
        }
        if (!PLAIN.matcher(s).matches()) return null;

        String body = s.charAt(0) == '+' || s.charAt(0) == '-' ? s.substring(1) : s;
        int end = body.length();
        for (int i = 0; i < body.length(); i++) {
            char c = body.charAt(i);
            if (c == '.' || c == 'e' || c == 'E') {
                end = i;
                break;
            }
        }
        String intPart = body.substring(0, end);
        if (intPart.length() > 1 && intPart.charAt(0) == '0') return null;               // 007 같은 코드
        if (intPart.length() > MAX_INTEGER_DIGITS) return null;                           // PNU 같은 긴 식별자

        try {
            double v = Double.parseDouble(s);
            return Double.isFinite(v) && Math.abs(v) < ABS_LIMIT ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * 프론트(JS {@code String.prototype.trim})와 같은 공백 기준으로 앞뒤를 뗀다. Java {@code strip()}은 U+001C~U+001F(제어문자)를 공백으로 보고
     * NBSP·U+2007·U+202F·BOM은 공백으로 안 봐서 JS와 다르다 — 두 쪽의 "값 있음"·"숫자" 판정이 어긋나면 서버가 숫자 컬럼이라 한 곳을 프론트가 못 칠한다.
     * JS 기준: 탭·줄바꿈 등(U+0009~000D), 공백, NBSP(U+00A0), U+1680, U+2000~200A, U+2028·2029, U+202F, U+205F, U+3000, BOM(U+FEFF).
     */
    public static String jsTrim(String s) {
        int from = 0, to = s.length();
        while (from < to && isJsSpace(s.charAt(from))) from++;
        while (to > from && isJsSpace(s.charAt(to - 1))) to--;
        return s.substring(from, to);
    }

    private static boolean isJsSpace(char c) {
        return (c >= 0x09 && c <= 0x0D) || c == 0x20 || c == 0xA0 || c == 0x1680 || (c >= 0x2000 && c <= 0x200A)
                || c == 0x2028 || c == 0x2029 || c == 0x202F || c == 0x205F || c == 0x3000 || c == 0xFEFF;
    }

    public static boolean isNumeric(String raw) {
        return parse(raw) != null;
    }
}
