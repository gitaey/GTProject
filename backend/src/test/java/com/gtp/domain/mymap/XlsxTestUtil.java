package com.gtp.domain.mymap;

import com.gtp.domain.mymap.util.ExcelSheet;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** 시험용 xlsx 만들기·읽기. 값 종류: String(문자열 셀) · Number(숫자 셀) · Formula(수식 셀) · Fmt(서식 있는 숫자 셀) · null(빈 칸). */
public final class XlsxTestUtil {

    private XlsxTestUtil() {
    }

    public record Formula(String text) {
    }

    /** 표시 서식(예: "#,##0")이 붙은 숫자 */
    public record Fmt(double value, String format) {
    }

    /** 스트리밍 리더로 읽은 결과(값이 있는 데이터 행만) */
    public record Table(List<String> headers, List<ExcelSheet.Row> rows) {
    }

    /** 앱과 같은 스트리밍 리더로 파일 전체를 읽는다. */
    public static Table read(Path file) {
        List<String> headers = new ArrayList<>();
        List<ExcelSheet.Row> rows = new ArrayList<>();
        ExcelSheet.read(file, headers::addAll, r -> {
            rows.add(r);
            return true;
        });
        return new Table(headers, rows);
    }

    public static Path write(Path file, List<List<Object>> rows) {
        try (XSSFWorkbook wb = new XSSFWorkbook(); OutputStream out = Files.newOutputStream(file)) {
            Sheet sheet = wb.createSheet("데이터");
            CreationHelper helper = wb.getCreationHelper();
            for (int r = 0; r < rows.size(); r++) {
                if (rows.get(r) == null) continue; // 완전히 빈 행
                Row row = sheet.createRow(r);
                List<Object> values = rows.get(r);
                for (int c = 0; c < values.size(); c++) {
                    Object v = values.get(c);
                    if (v == null) continue;
                    Cell cell = row.createCell(c);
                    if (v instanceof String s) cell.setCellValue(s);
                    else if (v instanceof Number n) cell.setCellValue(n.doubleValue());
                    else if (v instanceof Formula f) cell.setCellFormula(f.text());
                    else if (v instanceof Fmt f) {
                        cell.setCellValue(f.value());
                        CellStyle style = wb.createCellStyle();
                        style.setDataFormat(helper.createDataFormat().getFormat(f.format()));
                        cell.setCellStyle(style);
                    } else throw new IllegalArgumentException("지원하지 않는 시험 값: " + v);
                }
            }
            // 수식 결과를 파일에 저장해 둔다 — 앱은 엑셀이 저장한 계산값을 읽는다(실제 엑셀 파일과 같은 모양)
            wb.getCreationHelper().createFormulaEvaluator().evaluateAll();
            wb.write(out);
            return file;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static byte[] bytes(Path dir, List<List<Object>> rows) {
        try {
            Path f = write(Files.createTempFile(dir, "t", ".xlsx"), rows);
            byte[] b = Files.readAllBytes(f);
            Files.delete(f);
            return b;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static List<Object> row(Object... values) {
        return java.util.Arrays.asList(values);
    }

    // ---------- 손으로 만든 xlsx(POI 없이 zip으로 직접) ----------

    private static final String NS = "xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"";

    /**
     * sheetData 안쪽 XML을 직접 넣어 최소 xlsx를 만든다(스타일·공유 문자열 파트 없음). 아주 큰 파일을 빠르게 만들거나
     * 인라인 문자열 같은 POI가 안 쓰는 모양을 시험할 때 쓴다. rowsXml은 {@code <row>…</row>}들을 이어 붙인 문자열 또는 쓰는 함수.
     */
    public static Path writeRaw(Path file, java.util.function.Consumer<java.io.Writer> sheetDataWriter) {
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(file))) {
            zip.setLevel(Deflater.BEST_COMPRESSION);
            put(zip, "[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                    + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                    + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
                    + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
                    + "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>"
                    + "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"
                    + "</Types>");
            put(zip, "_rels/.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                    + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                    + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>"
                    + "</Relationships>");
            put(zip, "xl/workbook.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                    + "<workbook " + NS + " xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">"
                    + "<sheets><sheet name=\"s\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>");
            put(zip, "xl/_rels/workbook.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                    + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                    + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>"
                    + "</Relationships>");
            zip.putNextEntry(new ZipEntry("xl/worksheets/sheet1.xml"));
            java.io.Writer w = new java.io.BufferedWriter(new java.io.OutputStreamWriter(zip, StandardCharsets.UTF_8), 1 << 16);
            w.write("<?xml version=\"1.0\" encoding=\"UTF-8\"?><worksheet " + NS + "><sheetData>");
            sheetDataWriter.accept(w);
            w.write("</sheetData></worksheet>");
            w.flush();
            zip.closeEntry();
            return file;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void put(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    /** 1열 머리글 + 숫자 데이터 {@code rows}행짜리 xlsx(100만 행이 약 5MB로 압축된다 — 10MB 한도 안의 "작은" 파일). */
    public static Path hugeRows(Path file, int rows) {
        return writeRaw(file, w -> {
            try {
                w.write("<row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>값</t></is></c></row>");
                for (int i = 2; i <= rows + 1; i++) {
                    w.write("<row r=\"" + i + "\"><c r=\"A" + i + "\"><v>" + (i * 7919L % 100003) + "</v></c></row>");
                }
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
    }
}
