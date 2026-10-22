package com.gtp.domain.mymap.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** 속성 문자열이 숫자인지 가리는 규칙(구간 색칠용 컬럼 판정) — 서버와 프론트가 같은 규칙을 써야 하므로 경계를 표로 고정한다. */
class NumericTextTest {

    private static void num(String raw, double expected) {
        Double v = NumericText.parse(raw);
        assertThat(v).as("숫자여야 함: [" + raw + "]").isNotNull();
        assertThat(v).as(raw).isCloseTo(expected, within(1e-9));
    }

    private static void notNum(String raw) {
        assertThat(NumericText.parse(raw)).as("숫자가 아니어야 함: [" + raw + "]").isNull();
        assertThat(NumericText.isNumeric(raw)).isFalse();
    }

    @Test
    void 보통_숫자() {
        num("12", 12);
        num("-3.5", -3.5);
        num("+7", 7);
        num(".5", 0.5);
        num("5.", 5);
        num("0", 0);
        num("0.5", 0.5);
        num("-0.5", -0.5);
        num("+0.0", 0);
        num("123456789012345", 123456789012345.0);   // 15자리까지
        num("37.5663", 37.5663);
    }

    @Test
    void 지수_표기() {
        num("1.5E+3", 1500);
        num("1e5", 100000);
        num("2.5e-2", 0.025);
        num("0e5", 0);
    }

    @Test
    void 공백과_전각_숫자는_정리해서_읽는다() {
        num(" 12 ", 12);
        num(" 12 ", 12);   // NBSP
        num("　12　", 12);            // 전각 공백
        num("１２", 12);              // 전각 숫자
        num("－3", -3);               // 전각 마이너스(NFKC)
    }

    @Test
    void 올바르게_묶은_천_단위_쉼표만_숫자() {
        num("1,234", 1234);
        num("1,234,567", 1234567);
        num("1,234,567.89", 1234567.89);
        num("-1,234", -1234);
        num("999", 999);
        notNum("1,5");          // 유럽식 소수점일 수 있어 모호
        notNum("12,34");
        notNum("1,23,456");
        notNum("1,234,5");
        notNum("1,234.5.6");
        notNum(",123");
        notNum("1234,567");     // 앞이 3자리를 넘음
        notNum("1,2345");
    }

    @Test
    void 앞자리_0_코드와_긴_식별자는_숫자가_아니다() {
        notNum("007");
        notNum("0123");
        notNum("00");
        notNum("-007");
        notNum("1114010300100310000");   // 19자리 PNU
        notNum("1234567890123456");      // 16자리
        num("100", 100);                 // 0으로 끝나는 건 숫자
        num("10.05", 10.05);
    }

    @Test
    void 숫자가_아닌_글자() {
        notNum(null);
        notNum("");
        notNum("   ");
        notNum("NaN");
        notNum("Infinity");
        notNum("-Infinity");
        notNum("0x1F");
        notNum("12%");
        notNum("₩100");
        notNum("$1");
        notNum("1 000");
        notNum("abc");
        notNum("1.2.3");
        notNum("1e");
        notNum("e5");
        notNum("--1");
        notNum("1-2");
        notNum("٣");             // 아랍-인도 숫자
        notNum("1e999");         // 무한대로 넘침
    }

    @Test
    void 공백_기준은_프론트_JS_trim과_같다() {
        // Java strip()과 다른 곳: 제어문자 U+001C~001F는 공백이 아니고(JS), NBSP·U+2007·U+202F·BOM은 공백이다
        notNum("12");
        notNum("12");
        notNum("᠎12");
        notNum("12");
        assertThat(NumericText.parse(" 12 ")).isEqualTo(12.0);
        assertThat(NumericText.parse("﻿12﻿")).isEqualTo(12.0);
        assertThat(NumericText.parse(" 12")).isEqualTo(12.0);
        assertThat(NumericText.parse("  12 ")).isEqualTo(12.0);
        assertThat(NumericText.jsTrim("  a ﻿　")).isEqualTo("  a");   // 앞이 제어문자라 앞쪽은 안 떼진다
    }
}
