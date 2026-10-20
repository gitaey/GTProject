package com.gtp.domain.mymap.util;

import com.gtp.domain.mymap.model.ImportFailureReason;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PnuNormalizerTest {

    static final String PNU = "1114010300100310000";

    static CellData str(String s) {
        String t = s.strip();
        return new CellData(t, t, false, null);
    }

    static CellData num(double v, String shown) {
        return new CellData(shown, shown, true, v);
    }

    @Test
    void 정상_19자리는_그대로() {
        PnuNormalizer.Result r = PnuNormalizer.check(str(PNU));
        assertThat(r.ok()).isTrue();
        assertThat(r.pnu()).isEqualTo(PNU);
    }

    @Test
    void 공백_하이픈_앞_작은따옴표_전각숫자를_정리한다() {
        assertThat(PnuNormalizer.check(str("1114010300 1 0031 0000")).pnu()).isEqualTo(PNU);
        assertThat(PnuNormalizer.check(str("1114010300-1-0031-0000")).pnu()).isEqualTo(PNU);
        assertThat(PnuNormalizer.check(str("'" + PNU)).pnu()).isEqualTo(PNU);
        assertThat(PnuNormalizer.check(str("１１１４０１０３００１００３１００００")).pnu()).isEqualTo(PNU);
    }

    @Test
    void 폭_없는_공백과_NBSP_BOM도_정리한다() {
        assertThat(PnuNormalizer.check(str("1114010300\u200B100310000")).pnu()).isEqualTo(PNU);
        assertThat(PnuNormalizer.check(str("\uFEFF" + PNU)).pnu()).isEqualTo(PNU);
        assertThat(PnuNormalizer.check(str("1114010300\u00A01\u200D0031\u20600000")).pnu()).isEqualTo(PNU);
    }

    @Test
    void 자리수가_19가_아니면_PNU_FORMAT() {
        assertThat(PnuNormalizer.check(str("111401030010031000")).reason()).isEqualTo(ImportFailureReason.PNU_FORMAT);   // 18
        assertThat(PnuNormalizer.check(str(PNU + "0")).reason()).isEqualTo(ImportFailureReason.PNU_FORMAT);               // 20
        assertThat(PnuNormalizer.check(str("abc4010300100310000")).reason()).isEqualTo(ImportFailureReason.PNU_FORMAT);  // 글자
    }

    @Test
    void 대지구분_11번째_자리는_1또는_2만() {
        assertThat(PnuNormalizer.check(str("1114010300200310000")).ok()).isTrue();
        assertThat(PnuNormalizer.check(str("1114010300000310000")).reason()).isEqualTo(ImportFailureReason.PNU_FORMAT);
        assertThat(PnuNormalizer.check(str("1114010300300310000")).reason()).isEqualTo(ImportFailureReason.PNU_FORMAT);
    }

    @Test
    void 비어_있으면_EMPTY() {
        assertThat(PnuNormalizer.check(CellData.EMPTY).reason()).isEqualTo(ImportFailureReason.EMPTY);
        assertThat(PnuNormalizer.check(null).reason()).isEqualTo(ImportFailureReason.EMPTY);
    }

    @Test
    void 숫자_셀은_값이_이미_깨졌으므로_사유로_돌린다() {
        // 지수로 보이는 숫자 셀
        assertThat(PnuNormalizer.check(num(1.11401030010031E18, "1.11401E+18")).reason()).isEqualTo(ImportFailureReason.PNU_EXP_NOTATION);
        assertThat(PnuNormalizer.check(num(1.11401030010031E18, "1.11401e+18")).reason()).isEqualTo(ImportFailureReason.PNU_EXP_NOTATION);   // 소문자 e로 보여도
        // 전체 자리로 보이지만 숫자 서식인 셀 — 19자리 뒤쪽이 double 정밀도로 이미 틀렸을 수 있다
        assertThat(PnuNormalizer.check(num(1.11401030010031E18, PNU)).reason()).isEqualTo(ImportFailureReason.PNU_NUMERIC_CELL);
        // 숫자 셀이면 19자리처럼 보여도 통과시키지 않는다
        assertThat(PnuNormalizer.check(num(1.11401030010031E18, PNU)).ok()).isFalse();
    }

    @Test
    void 문자열로_적힌_지수_표기도_PNU_EXP_NOTATION() {
        assertThat(PnuNormalizer.check(str("1.11401E+18")).reason()).isEqualTo(ImportFailureReason.PNU_EXP_NOTATION);
        assertThat(PnuNormalizer.check(str("1.1e18")).reason()).isEqualTo(ImportFailureReason.PNU_EXP_NOTATION);
        assertThat(PnuNormalizer.check(str("1.11401 E+18")).reason()).isEqualTo(ImportFailureReason.PNU_EXP_NOTATION);
    }
}
