package com.gtp.domain.mymap.util;

import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.openxml4j.opc.PackageAccess;
import org.apache.poi.openxml4j.util.ZipSecureFile;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.util.XMLHelper;
import org.apache.poi.xssf.eventusermodel.ReadOnlySharedStringsTable;
import org.apache.poi.xssf.eventusermodel.XSSFReader;
import org.apache.poi.xssf.model.StylesTable;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.XMLReader;
import org.xml.sax.helpers.DefaultHandler;

import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.util.*;
import java.util.function.Consumer;

/**
 * 엑셀 첫 시트를 "첫 행 = 머리글, 나머지 = 데이터 행"으로 <b>스트리밍</b> 읽기한다(SAX). 시트 전체를 메모리에 올리지 않고 한 행씩
 * 읽어 넘기므로, 10MB 한도 안의 xlsx(예: 1열 100만 행 4.9MB)로 서버 힙을 다 쓰게 만드는 일이 없다 — 옛 방식(XSSF DOM)은 그 파일 하나에
 * 힙 약 950MB를 썼다. 호출하는 쪽은 행을 받다가 원하는 때 false를 돌려 읽기를 멈출 수 있고(행 수 한도 초과 등), 예외를 던져도 된다.
 *
 * 미리보기와 가져오기가 같은 규칙(머리글 이름 정리 포함)을 쓰도록 한곳에 둔다 — 미리보기가 돌려준 머리글 이름으로 가져오기가 컬럼을 찾기 때문이다.
 * 값은 엑셀이 파일에 저장해 둔 값이다: 수식 셀은 저장된 계산 결과를 읽는다(계산 결과가 저장되지 않은 파일은 빈 칸으로 보인다).
 * 완전히 빈 데이터 행은 호출하지 않는다.
 */
public final class ExcelSheet {

    public static final int MAX_COLUMNS = 200;
    /** 데이터와 상관없이 시트에 이만큼의 행(빈 서식 행 포함)이 있으면 더 읽지 않고 거절한다 */
    public static final int MAX_SCAN_ROWS = 100_000;
    /** zip 안 파일 하나가 풀렸을 때 최대 크기 — 공유 문자열 표는 메모리에 올라가므로 폭탄 방어선이다 */
    static final long MAX_ENTRY_BYTES = 64L * 1024 * 1024;
    static final int MAX_CELL_CHARS = 1000;
    private static final int RAW_TEXT_CAP = 8192;

    static {
        ZipSecureFile.setMaxEntrySize(MAX_ENTRY_BYTES);
    }

    /** @param rowNo 엑셀 행 번호(머리글 = 1) */
    public record Row(int rowNo, List<CellData> cells, boolean blank) {
    }

    /** 값이 있는 데이터 행마다 호출. false를 돌려주면 읽기를 멈춘다. */
    @FunctionalInterface
    public interface RowVisitor {
        boolean visit(Row row);
    }

    private ExcelSheet() {
    }

    /** 머리글만 읽는다. */
    public static List<String> readHeaders(Path file) {
        List<String>[] out = new List[1];
        read(file, h -> out[0] = h, null);
        return out[0];
    }

    /**
     * @param onHeaders 머리글을 읽은 직후 한 번 호출
     * @param onRow     null이면 머리글만 읽고 끝낸다
     * @throws CustomException INVALID_EXCEL_FILE(열 수 없음·머리글 없음), 행이 너무 많으면 MYMAP_ROW_LIMIT, 그리고 콜백이 던진 예외 그대로
     */
    public static void read(Path file, Consumer<List<String>> onHeaders, RowVisitor onRow) {
        try (OPCPackage pkg = OPCPackage.open(file.toFile(), PackageAccess.READ)) {
            XSSFReader reader = new XSSFReader(pkg);
            ReadOnlySharedStringsTable strings = new ReadOnlySharedStringsTable(pkg);
            StylesTable styles = reader.getStylesTable();
            XSSFReader.SheetIterator sheets = (XSSFReader.SheetIterator) reader.getSheetsData();
            if (!sheets.hasNext()) throw new CustomException(GisErrorCode.INVALID_EXCEL_FILE);
            Handler handler = new Handler(strings, styles, onHeaders, onRow);
            try (InputStream in = sheets.next()) {
                XMLReader xml = XMLHelper.newXMLReader();
                xml.setContentHandler(handler);
                xml.parse(new InputSource(in));
            } catch (Stop stop) {
                // 호출한 쪽이 충분히 읽었다 — 정상 종료
            }
            if (!handler.headerDone) throw new CustomException(GisErrorCode.INVALID_EXCEL_FILE);
        } catch (CallbackFailure f) {
            throw f.cause;   // 콜백(호출한 쪽 코드)이 던진 예외는 그대로 돌려준다
        } catch (CustomException e) {
            throw e;
        } catch (Exception e) {
            throw new CustomException(GisErrorCode.INVALID_EXCEL_FILE);
        }
    }

    /** 빈 머리글은 "열N", 중복은 "이름 (2)"로 바꿔 모든 머리글이 서로 달라야 속성 키·컬럼 선택이 어긋나지 않는다. 끝쪽 빈 열은 버린다. */
    static List<String> normalizeHeaders(CellData[] cells) {
        int lastNonBlank = -1;
        for (int c = 0; c < cells.length; c++) {
            if (cells[c] != null && !cells[c].blank()) lastNonBlank = c;
        }
        List<String> out = new ArrayList<>();
        Set<String> used = new HashSet<>();
        for (int c = 0; c <= lastNonBlank; c++) {
            String raw = cells[c] == null ? "" : cells[c].text();
            String name = raw.isEmpty() ? "열" + (c + 1) : raw;
            String unique = name;
            for (int k = 2; !used.add(unique); k++) unique = name + " (" + k + ")";
            out.add(unique);
        }
        return out;
    }

    /** 정수는 정수로·소수는 소수 그대로, 천 단위 쉼표 같은 서식 없이. */
    static String plainNumber(double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) return String.valueOf(v);
        if (v == Math.rint(v) && Math.abs(v) < 1e15) return Long.toString((long) v);
        return new BigDecimal(Double.toString(v)).stripTrailingZeros().toPlainString();
    }

    // ---------- 내부: 읽기 중단·콜백 예외 포장 ----------

    private static final class Stop extends RuntimeException {
        Stop() {
            super(null, null, false, false);
        }
    }

    private static final class CallbackFailure extends RuntimeException {
        final RuntimeException cause;

        CallbackFailure(RuntimeException cause) {
            super(null, cause, false, false);
            this.cause = cause;
        }
    }

    private record StyleInfo(int index, String format) {
    }

    // ---------- 내부: 시트 XML 핸들러 ----------

    private static final class Handler extends DefaultHandler {
        private final ReadOnlySharedStringsTable strings;
        private final StylesTable styles;
        private final Consumer<List<String>> onHeaders;
        private final RowVisitor onRow;
        private final DataFormatter formatter = new DataFormatter(Locale.US);
        private final Map<Integer, StyleInfo> styleCache = new HashMap<>();

        boolean headerDone;
        private int headerCols;
        private int physicalRows;
        private int lastRowNo;

        private int rowNo;
        private CellData[] row;

        private String cellRef;
        private String cellType;
        private int cellStyle;
        private final StringBuilder value = new StringBuilder();
        private final StringBuilder inline = new StringBuilder();
        private boolean inValue, inInlineString, inText, inPhonetic;

        Handler(ReadOnlySharedStringsTable strings, StylesTable styles, Consumer<List<String>> onHeaders, RowVisitor onRow) {
            this.strings = strings;
            this.styles = styles;
            this.onHeaders = onHeaders;
            this.onRow = onRow;
        }

        @Override
        public void startElement(String uri, String localName, String qName, Attributes atts) {
            String name = localName != null && !localName.isEmpty() ? localName : qName;
            switch (name) {
                case "row" -> {
                    if (++physicalRows > MAX_SCAN_ROWS) {
                        throw new CustomException(GisErrorCode.MYMAP_ROW_LIMIT,
                                "시트의 행이 너무 많습니다(빈 서식 행 포함 최대 " + MAX_SCAN_ROWS + "행까지 읽습니다). 데이터만 남기고 다시 올려 주세요.");
                    }
                    String r = atts.getValue("r");
                    rowNo = r != null ? parseInt(r, lastRowNo + 1) : lastRowNo + 1;
                    lastRowNo = rowNo;
                    row = new CellData[headerDone ? headerCols : MAX_COLUMNS];
                }
                case "c" -> {
                    cellRef = atts.getValue("r");
                    cellType = atts.getValue("t");
                    cellStyle = parseInt(atts.getValue("s"), 0);
                    value.setLength(0);
                    inline.setLength(0);
                }
                case "v" -> inValue = true;
                case "is" -> inInlineString = true;
                case "rPh" -> inPhonetic = true;
                case "t" -> inText = inInlineString && !inPhonetic;
                default -> {
                }
            }
        }

        @Override
        public void characters(char[] ch, int start, int length) {
            if (inValue) append(value, ch, start, length);
            else if (inText) append(inline, ch, start, length);
        }

        private static void append(StringBuilder sb, char[] ch, int start, int length) {
            if (sb.length() < RAW_TEXT_CAP) sb.append(ch, start, Math.min(length, RAW_TEXT_CAP - sb.length()));
        }

        @Override
        public void endElement(String uri, String localName, String qName) {
            String name = localName != null && !localName.isEmpty() ? localName : qName;
            switch (name) {
                case "v" -> inValue = false;
                case "t" -> inText = false;
                case "rPh" -> inPhonetic = false;
                case "is" -> inInlineString = false;
                case "c" -> endCell();
                case "row" -> endRow();
                default -> {
                }
            }
        }

        private void endCell() {
            if (row == null || cellRef == null) return;
            int col = new CellReference(cellRef).getCol();
            if (col < 0 || col >= row.length) return;
            CellData d = build();
            if (!d.blank()) row[col] = d;
        }

        private CellData build() {
            String type = cellType == null ? "n" : cellType;
            String text;
            boolean numeric = false;
            Double number = null;
            String plain = null;
            switch (type) {
                case "s" -> text = sharedString(value.toString().trim());
                case "str", "d" -> text = value.toString();
                case "inlineStr" -> text = inline.toString();
                case "b" -> text = "1".equals(value.toString().trim()) ? "TRUE" : "FALSE";
                case "e" -> text = value.toString();
                default -> {
                    String raw = value.toString().trim();
                    if (raw.isEmpty()) return CellData.EMPTY;
                    try {
                        double v = Double.parseDouble(raw);
                        StyleInfo si = style(cellStyle);
                        text = formatter.formatRawCellContents(v, si.index(), si.format());
                        numeric = true;
                        number = v;
                        plain = DateUtil.isADateFormat(si.index(), si.format()) ? null : plainNumber(v);
                    } catch (RuntimeException e) {
                        text = raw;
                        numeric = false;
                        number = null;
                    }
                }
            }
            text = clip(text == null ? "" : text.strip());
            if (text.isEmpty()) return CellData.EMPTY;
            return new CellData(text, plain != null ? plain : text, numeric, number);
        }

        private String sharedString(String idx) {
            try {
                return strings.getItemAt(Integer.parseInt(idx)).getString();
            } catch (RuntimeException e) {
                return "";
            }
        }

        private StyleInfo style(int idx) {
            return styleCache.computeIfAbsent(idx, i -> {
                if (styles == null) return new StyleInfo(0, "General");   // 스타일 파트가 없는 최소 xlsx
                try {
                    XSSFCellStyle st = styles.getStyleAt(i);
                    String f = st.getDataFormatString();
                    return new StyleInfo(st.getDataFormat(), f == null ? "General" : f);
                } catch (RuntimeException e) {
                    return new StyleInfo(0, "General");
                }
            });
        }

        private static String clip(String s) {
            return s.length() > MAX_CELL_CHARS ? s.substring(0, MAX_CELL_CHARS) : s;
        }

        private static int parseInt(String s, int dflt) {
            try {
                return s == null ? dflt : Integer.parseInt(s.trim());
            } catch (NumberFormatException e) {
                return dflt;
            }
        }

        private void endRow() {
            CellData[] cells = row;
            row = null;
            if (cells == null) return;
            if (!headerDone) {
                if (rowNo != 1) throw new CustomException(GisErrorCode.INVALID_EXCEL_FILE);   // 첫 행(머리글)이 없다
                List<String> headers = normalizeHeaders(cells);
                if (headers.isEmpty()) throw new CustomException(GisErrorCode.INVALID_EXCEL_FILE);
                headerCols = headers.size();
                headerDone = true;
                if (onHeaders != null) callback(() -> onHeaders.accept(headers));
                if (onRow == null) throw new Stop();
                return;
            }
            if (rowNo < 2) return;
            List<CellData> list = new ArrayList<>(headerCols);
            boolean blank = true;
            for (CellData c : cells) {
                CellData d = c == null ? CellData.EMPTY : c;
                if (!d.blank()) blank = false;
                list.add(d);
            }
            if (blank) return;   // 완전히 빈 행은 호출하지 않는다
            Row r = new Row(rowNo, list, false);
            boolean[] more = {true};
            callback(() -> more[0] = onRow.visit(r));
            if (!more[0]) throw new Stop();
        }

        private void callback(Runnable r) {
            try {
                r.run();
            } catch (RuntimeException e) {
                throw new CallbackFailure(e);
            }
        }
    }
}
