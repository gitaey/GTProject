package com.gtp.domain.mymap.util;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.streaming.SXSSFSheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.regex.Pattern;

/**
 * 결과 엑셀 쓰기(주소 변환·레이어 내보내기 공용). 행을 하나씩 써 내려가고(SXSSF — 100행만 메모리, 나머지는 임시 파일) 마지막에 한 번
 * {@link #write}한다. 머리글 굵게·첫 행 고정·열 폭 자동(글자 수로 계산 — AWT 글꼴이 없는 서버에서도 돈다).
 *
 * 값은 String · {@link Num} · null(빈 칸)만 받는다. <b>수식 주입 방지</b>: 문자열이 {@code = + - @}(또는 탭·CR)로 시작하면
 * 셀을 텍스트 서식 + 인용 접두(quotePrefix — 엑셀의 앞 작은따옴표)로 써서 값은 그대로 두고 수식으로 해석되지 못하게 한다.
 * 문자열 셀은 원래 수식이 아니지만, 사용자가 셀을 편집(F2)하면 다시 해석되는 일을 막는다.
 * 쓰는 쪽은 {@code try (ResultXlsx x = new ResultXlsx()) { … }}로 임시 파일을 지운다.
 */
public final class ResultXlsx implements AutoCloseable {

    /** 숫자 셀. decimals는 표시 자릿수(미리보기 문자열과 같은 값) */
    public record Num(double value, int decimals) {
        public String text() {
            return BigDecimal.valueOf(value).setScale(decimals, RoundingMode.HALF_UP).toPlainString();
        }
    }

    static final int MAX_CELL_CHARS = 32_000;
    static final int MAX_WIDTH_CHARS = 60;
    private static final Pattern ILLEGAL_XML = Pattern.compile("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]");

    private final SXSSFWorkbook wb = new SXSSFWorkbook(100);
    private final CellStyle headerStyle;
    private final CellStyle guardStyle;
    private final CellStyle headerGuardStyle;
    private final Map<Integer, CellStyle> numberStyles = new HashMap<>();
    private final List<Table> tables = new ArrayList<>();

    public ResultXlsx() {
        wb.setCompressTempFiles(true);
        Font bold = wb.createFont();
        bold.setBold(true);
        headerStyle = wb.createCellStyle();
        headerStyle.setFont(bold);
        guardStyle = wb.createCellStyle();
        guardStyle.setDataFormat(wb.createDataFormat().getFormat("@"));
        guardStyle.setQuotePrefixed(true);
        // 머리글 이름이 수식처럼 보이면(원본 열 이름 "=SUM(A1)" 등) 굵게 + 텍스트 서식·인용 접두
        headerGuardStyle = wb.createCellStyle();
        headerGuardStyle.setFont(bold);
        headerGuardStyle.setDataFormat(wb.createDataFormat().getFormat("@"));
        headerGuardStyle.setQuotePrefixed(true);
    }

    /** 새 시트. 머리글은 {@link Table#header}로 먼저 쓴다. */
    public Table table(String name) {
        Table t = new Table(wb.createSheet(name));
        tables.add(t);
        return t;
    }

    public final class Table {
        private final SXSSFSheet sheet;
        private int next = 0;
        private int[] widths = new int[0];

        private Table(SXSSFSheet sheet) {
            this.sheet = sheet;
        }

        public void header(List<String> names) {
            Row row = sheet.createRow(next++);
            for (int c = 0; c < names.size(); c++) {
                Cell cell = row.createCell(c);
                String h = clean(names.get(c));
                cell.setCellValue(h);
                cell.setCellStyle(needsGuard(names.get(c), h) ? headerGuardStyle : headerStyle);
                grow(c, displayWidth(names.get(c)));
            }
            sheet.createFreezePane(0, 1);
        }

        /** 한 행. String·Num·null만 */
        public void row(List<?> values) {
            Row row = sheet.createRow(next++);
            for (int c = 0; c < values.size(); c++) {
                Object v = values.get(c);
                if (v == null) continue;
                Cell cell = row.createCell(c);
                if (v instanceof Num n) {
                    cell.setCellValue(n.value());
                    cell.setCellStyle(numberStyles.computeIfAbsent(n.decimals(), ResultXlsx.this::numberStyle));
                    grow(c, n.text().length());
                } else {
                    String raw = String.valueOf(v);
                    String s = clean(raw);
                    if (s.isEmpty()) continue;
                    cell.setCellValue(s);
                    if (needsGuard(raw, s)) cell.setCellStyle(guardStyle);
                    grow(c, displayWidth(s));
                }
            }
        }

        public int rows() {
            return next;
        }

        private void grow(int col, int width) {
            if (col >= widths.length) widths = Arrays.copyOf(widths, col + 1);
            widths[col] = Math.max(widths[col], Math.min(width, MAX_WIDTH_CHARS));
        }

        private void applyWidths() {
            for (int c = 0; c < widths.length; c++) {
                sheet.setColumnWidth(c, Math.min(255, Math.max(8, widths[c] + 2)) * 256);
            }
        }
    }

    /** 수식으로 읽힐 수 있는 시작 글자. 엑셀은 = + - @ 로 시작하는 입력을 수식으로 본다(탭·CR은 앞 글자를 가리는 데 쓰인다). */
    public static boolean isFormulaLike(String s) {
        if (s == null || s.isEmpty()) return false;
        char c = s.charAt(0);
        return c == '=' || c == '+' || c == '-' || c == '@' || c == '\t' || c == '\r' || c == '\n';
    }

    /** 제어문자를 공백으로 바꾸기 전 원본과 바꾼 뒤(앞 공백 제외) 모두 검사한다 — 제어문자로 앞 글자를 가려 검사를 피하지 못하게 */
    static boolean needsGuard(String raw, String cleaned) {
        return isFormulaLike(raw) || isFormulaLike(cleaned) || isFormulaLike(cleaned.stripLeading());
    }

    /** 미리보기용 문자열(파일에 쓰이는 값과 같다) */
    public static String text(Object v) {
        if (v == null) return "";
        if (v instanceof Num n) return n.text();
        return clean(String.valueOf(v));
    }

    private static String clean(String s) {
        String t = ILLEGAL_XML.matcher(s == null ? "" : s).replaceAll(" ");
        return t.length() > MAX_CELL_CHARS ? t.substring(0, MAX_CELL_CHARS) : t;
    }

    /** 한글 등 넓은 글자는 2칸으로 센다 */
    static int displayWidth(String s) {
        int w = 0;
        for (int i = 0; i < s.length(); i++) w += s.charAt(i) > 0x2E80 ? 2 : 1;
        return w;
    }

    private CellStyle numberStyle(int decimals) {
        CellStyle st = wb.createCellStyle();
        String fmt = decimals <= 0 ? "0" : "0." + "0".repeat(decimals);
        st.setDataFormat(wb.createDataFormat().getFormat(fmt));
        return st;
    }

    /** 열 폭을 정하고 파일로 쓴다. 한 번만 부른다. */
    public void write(OutputStream out) {
        try {
            for (Table t : tables) t.applyWidths();
            wb.write(out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Override
    public void close() {
        try {
            wb.dispose();   // 임시 파일 삭제
            wb.close();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
