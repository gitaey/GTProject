package com.gtp.domain.mymap.util;

import com.gtp.domain.mymap.XlsxTestUtil;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 스트리밍 리더의 동작: 중간에 멈추기, 호출한 쪽 예외 그대로 전달, 손으로 만든 최소 xlsx, 행·크기 방어. */
class ExcelSheetStreamTest {

    @TempDir
    Path tmp;

    @Test
    void 호출한_쪽이_false를_돌려주면_거기서_읽기를_멈춘다() {
        Path f = XlsxTestUtil.hugeRows(tmp.resolve("many.xlsx"), 20_000);
        AtomicInteger seen = new AtomicInteger();
        ExcelSheet.read(f, h -> {
        }, row -> seen.incrementAndGet() < 3);   // 세 번째 행에서 멈춘다
        assertThat(seen.get()).isEqualTo(3);
    }

    @Test
    void 머리글만_읽으면_행은_호출하지_않는다() {
        Path f = XlsxTestUtil.hugeRows(tmp.resolve("many2.xlsx"), 20_000);
        assertThat(ExcelSheet.readHeaders(f)).containsExactly("값");
    }

    @Test
    void 호출한_쪽이_던진_예외는_INVALID로_바뀌지_않고_그대로_나온다() {
        Path f = XlsxTestUtil.hugeRows(tmp.resolve("ex.xlsx"), 50);
        IllegalStateException boom = new IllegalStateException("호출한 쪽 오류");
        assertThatThrownBy(() -> ExcelSheet.read(f, h -> {
        }, row -> {
            throw boom;
        })).isSameAs(boom);

        CustomException limit = new CustomException(GisErrorCode.MYMAP_ROW_LIMIT, "한도");
        assertThatThrownBy(() -> ExcelSheet.read(f, h -> {
        }, row -> {
            throw limit;
        })).isSameAs(limit);

        IllegalArgumentException inHeader = new IllegalArgumentException("머리글 처리 오류");
        assertThatThrownBy(() -> ExcelSheet.read(f, h -> {
            throw inHeader;
        }, row -> true)).isSameAs(inHeader);
    }

    @Test
    void 스타일_공유문자열_파트가_없는_최소_xlsx와_인라인_문자열_숫자_행번호() {
        Path f = XlsxTestUtil.writeRaw(tmp.resolve("raw.xlsx"), w -> {
            try {
                w.write("<row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>이름</t></is></c><c r=\"C1\" t=\"inlineStr\"><is><r><t>값</t></r><rPh><t>무시</t></rPh></is></c></row>");
                w.write("<row r=\"5\"><c r=\"A5\" t=\"inlineStr\"><is><t>서울</t></is></c><c r=\"B5\"><v>1100</v></c><c r=\"C5\" t=\"b\"><v>1</v></c></row>");
                w.write("<row r=\"7\"><c r=\"A7\" t=\"e\"><v>#DIV/0!</v></c><c r=\"B7\" t=\"str\"><v>수식 결과</v></c></row>");
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
        XlsxTestUtil.Table t = XlsxTestUtil.read(f);
        assertThat(t.headers()).containsExactly("이름", "열2", "값");
        assertThat(t.rows()).extracting(ExcelSheet.Row::rowNo).containsExactly(5, 7);   // 실제 행 번호
        List<CellData> r5 = t.rows().get(0).cells();
        assertThat(r5.get(0).text()).isEqualTo("서울");
        assertThat(r5.get(1).text()).isEqualTo("1100");
        assertThat(r5.get(1).numeric()).isTrue();
        assertThat(r5.get(2).text()).isEqualTo("TRUE");
        List<CellData> r7 = t.rows().get(1).cells();
        assertThat(r7.get(0).text()).isEqualTo("#DIV/0!");
        assertThat(r7.get(1).text()).isEqualTo("수식 결과");
        assertThat(t.headers().get(2)).isEqualTo("값");   // 인라인 문자열의 발음 표기(rPh)는 머리글에 섞이지 않는다
    }

    @Test
    void 첫_시트만_읽는다() throws Exception {
        Path f = tmp.resolve("two.xlsx");
        try (XSSFWorkbook wb = new XSSFWorkbook(); var out = Files.newOutputStream(f)) {
            wb.createSheet("첫째").createRow(0).createCell(0).setCellValue("A");
            wb.createSheet("둘째").createRow(0).createCell(0).setCellValue("B");
            wb.write(out);
        }
        assertThat(ExcelSheet.readHeaders(f)).containsExactly("A");
    }

    @Test
    void 시트의_행이_너무_많으면_빈_서식_행이라도_거절한다() {
        Path f = XlsxTestUtil.writeRaw(tmp.resolve("blankrows.xlsx"), w -> {
            try {
                w.write("<row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>h</t></is></c></row>");
                for (int i = 2; i <= ExcelSheet.MAX_SCAN_ROWS + 5; i++) w.write("<row r=\"" + i + "\"/>");
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
        assertThatThrownBy(() -> ExcelSheet.read(f, h -> {
        }, row -> true)).isInstanceOfSatisfying(CustomException.class,
                e -> assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.MYMAP_ROW_LIMIT));
    }

    @Test
    void 압축_폭탄은_풀지_않고_INVALID_EXCEL_FILE() {
        // 시트 XML이 70MB(공백)로 풀리지만 압축 파일은 수십 KB — 풀린 크기·압축률 방어에 걸린다
        Path f = XlsxTestUtil.writeRaw(tmp.resolve("bomb.xlsx"), w -> {
            try {
                w.write("<row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>h</t></is></c></row>");
                String pad = " ".repeat(1 << 20);
                for (int i = 0; i < 70; i++) w.write(pad);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
        assertThat(f.toFile().length()).isLessThan(2L * 1024 * 1024);
        assertThatThrownBy(() -> ExcelSheet.read(f, h -> {
        }, row -> true)).isInstanceOfSatisfying(CustomException.class,
                e -> assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.INVALID_EXCEL_FILE));
    }

    @Test
    void 빈_행_사이의_데이터만_호출한다() {
        List<Integer> rowNos = new ArrayList<>();
        Path f = XlsxTestUtil.writeRaw(tmp.resolve("gap.xlsx"), w -> {
            try {
                w.write("<row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>h</t></is></c></row>");
                w.write("<row r=\"2\"/>");
                w.write("<row r=\"3\"><c r=\"A3\"><v>3</v></c></row>");
                w.write("<row r=\"4\"><c r=\"A4\" t=\"inlineStr\"><is><t>   </t></is></c></row>");
                w.write("<row r=\"9\"><c r=\"A9\"><v>9</v></c></row>");
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
        ExcelSheet.read(f, h -> {
        }, row -> rowNos.add(row.rowNo()));
        assertThat(rowNos).containsExactly(3, 9);
    }
}
