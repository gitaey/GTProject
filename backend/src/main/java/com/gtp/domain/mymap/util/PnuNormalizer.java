package com.gtp.domain.mymap.util;

import com.gtp.domain.mymap.model.ImportFailureReason;

import java.text.Normalizer;
import java.util.regex.Pattern;

/**
 * PNU 셀 검사·정규화. PNU는 19자리 숫자(법정동코드 10 + 대지구분 1[1 일반·2 산] + 본번 4 + 부번 4)다.
 *
 * 숫자 서식 셀은 double로 읽히면서 19자리 중 뒤쪽이 이미 깨져 있어서(double은 15~17자리) 값을 복구할 수 없다.
 * 그래서 숫자 셀은 값을 보지 않고 사유(PNU_NUMERIC_CELL / PNU_EXP_NOTATION)로 돌려 "텍스트 서식으로 바꾸세요"를 안내한다.
 */
public final class PnuNormalizer {

    private PnuNormalizer() {
    }

    public record Result(String pnu, ImportFailureReason reason) {
        public boolean ok() {
            return reason == null;
        }
    }

    private static final Pattern EXP = Pattern.compile("^[+-]?\\d+(\\.\\d+)?[eE][+-]?\\d+$");
    private static final Pattern PNU = Pattern.compile("\\d{19}");

    public static Result check(CellData cell) {
        if (cell == null || cell.blank()) return new Result(null, ImportFailureReason.EMPTY);

        String text = cell.text();
        if (cell.numeric()) {
            boolean exp = text.indexOf('E') >= 0 || text.indexOf('e') >= 0;
            return new Result(null, exp ? ImportFailureReason.PNU_EXP_NOTATION : ImportFailureReason.PNU_NUMERIC_CELL);
        }
        if (EXP.matcher(text.replace(" ", "")).matches()) {
            return new Result(null, ImportFailureReason.PNU_EXP_NOTATION);
        }
        String pnu = normalize(text);
        if (pnu == null) return new Result(null, ImportFailureReason.PNU_FORMAT);
        return new Result(pnu, null);
    }

    /** 공백·하이픈·앞의 작은따옴표·전각 숫자를 정리해 19자리 PNU면 돌려주고, 아니면 null. */
    public static String normalize(String raw) {
        if (raw == null) return null;
        String s = Normalizer.normalize(raw, Normalizer.Form.NFKC).strip();
        if (s.startsWith("'")) s = s.substring(1);
        s = s.replaceAll("[\\s\\-\\u00A0\\u200B\\u200C\\u200D\\u2060\\uFEFF]", "");   // 공백·하이픈·폭 없는 공백(웹에서 복사할 때 섞임)
        if (!PNU.matcher(s).matches()) return null;
        char landType = s.charAt(10);
        if (landType != '1' && landType != '2') return null;
        return s;
    }

    /** 미리보기 추천용: 이 문자열이 PNU 모양인가 */
    public static boolean looksLikePnu(String raw) {
        return normalize(raw) != null;
    }
}
