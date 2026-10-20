package com.gtp.domain.mymap.util;

import com.gtp.domain.mymap.XlsxTestUtil.Fmt;
import com.gtp.domain.mymap.XlsxTestUtil.Formula;
import com.gtp.domain.mymap.XlsxTestUtil.Table;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Date;
import java.util.List;

import static com.gtp.domain.mymap.XlsxTestUtil.read;
import static com.gtp.domain.mymap.XlsxTestUtil.row;
import static com.gtp.domain.mymap.XlsxTestUtil.write;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 셀 하나가 어떻게 읽히는지(스트리밍 리더 {@link ExcelSheet}) — 엑셀에서 보이는 값·속성용 값·숫자 여부. */
class ExcelCellReaderTest {

    @TempDir
    Path tmp;

    /** 값 하나를 첫 데이터 행 첫 칸에 쓰고 읽는다. 빈 값이면 행이 호출되지 않아 EMPTY. */
    private CellData cell(Object value) {
        Path f = write(tmp.resolve("c" + System.nanoTime() + ".xlsx"), List.of(row("h"), row(value)));
        Table t = read(f);
        return t.rows().isEmpty() ? CellData.EMPTY : t.rows().get(0).cells().get(0);
    }

    private static void assertInvalid(Runnable r) {
        assertThatThrownBy(r::run).isInstanceOfSatisfying(CustomException.class,
                e -> assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.INVALID_EXCEL_FILE));
    }

    @Test
    void 문자열_셀은_앞뒤_공백만_뗀다() {
        CellData d = cell("  가나다  ");
        assertThat(d.text()).isEqualTo("가나다");
        assertThat(d.numeric()).isFalse();
    }

    @Test
    void 숫자_셀은_보이는_값과_속성용_값이_다르다() {
        CellData d = cell(new Fmt(1100, "#,##0"));
        assertThat(d.text()).isEqualTo("1,100");   // 엑셀에서 보이는 값
        assertThat(d.plain()).isEqualTo("1100");   // 속성으로 저장할 값(서식 없이)
        assertThat(d.numeric()).isTrue();
        assertThat(d.number()).isEqualTo(1100.0);
    }

    @Test
    void 소수는_소수_그대로() {
        CellData d = cell(37.5663);
        assertThat(d.plain()).isEqualTo("37.5663");
        assertThat(d.number()).isEqualTo(37.5663);
    }

    @Test
    void 정수로_저장된_숫자는_소수점_없이() {
        assertThat(cell(1100).plain()).isEqualTo("1100");
    }

    @Test
    void 수식_셀은_수식_문자열이_아니라_저장된_계산값() {
        CellData sum = cell(new Formula("1+2"));
        assertThat(sum.text()).isEqualTo("3");
        assertThat(sum.numeric()).isTrue();
        assertThat(sum.number()).isEqualTo(3.0);

        CellData concat = cell(new Formula("\"a\"&\"b\""));
        assertThat(concat.text()).isEqualTo("ab");
        assertThat(concat.numeric()).isFalse();
    }

    @Test
    void 수식이_다른_칸을_참조해도_저장된_값을_읽는다() {
        Path f = write(tmp.resolve("ref.xlsx"), List.of(row("a", "b"), row(21, new Formula("A2*2"))));
        assertThat(read(f).rows().get(0).cells().get(1).text()).isEqualTo("42");
    }

    @Test
    void 날짜_서식_숫자는_보이는_날짜_글자를_속성으로() throws Exception {
        Path f = tmp.resolve("date.xlsx");
        try (XSSFWorkbook wb = new XSSFWorkbook(); var out = Files.newOutputStream(f)) {
            Sheet s = wb.createSheet();
            s.createRow(0).createCell(0).setCellValue("h");
            Cell c = s.createRow(1).createCell(0);
            c.setCellValue(new Date(0));
            CellStyle st = wb.createCellStyle();
            st.setDataFormat(wb.getCreationHelper().createDataFormat().getFormat("yyyy-mm-dd"));
            c.setCellStyle(st);
            wb.write(out);
        }
        CellData d = read(f).rows().get(0).cells().get(0);
        assertThat(d.text()).matches("19(69|70)-\\d\\d-\\d\\d");
        assertThat(d.plain()).isEqualTo(d.text());
        assertThat(d.numeric()).isTrue();
    }

    @Test
    void 긴_글은_1000자로_자른다() {
        assertThat(cell("가".repeat(1500)).text()).hasSize(ExcelSheet.MAX_CELL_CHARS);
    }

    @Test
    void 빈_칸은_EMPTY() {
        assertThat(cell(null).blank()).isTrue();
        assertThat(cell("   ").blank()).isTrue();
    }

    @Test
    void 텍스트_서식_숫자_PNU는_문자열로_읽혀_19자리가_보존된다() {
        CellData d = cell("1114010300100310000");
        assertThat(d.numeric()).isFalse();
        assertThat(d.text()).isEqualTo("1114010300100310000");
    }

    @Test
    void 큰_숫자_셀은_numeric으로_표시된다() {
        CellData d = cell(1.114010300100310000E18);
        assertThat(d.numeric()).isTrue();
        assertThat(PnuNormalizer.check(d).ok()).isFalse();
    }

    // ---------- 머리글·행 ----------

    @Test
    void 머리글_정리_빈칸_중복_끝쪽_빈열() {
        Path f = write(tmp.resolve("h.xlsx"), List.of(row("이름", null, "이름", "값", "", "  ", null), row("a", "b", "c", "d")));
        Table t = read(f);
        assertThat(t.headers()).containsExactly("이름", "열2", "이름 (2)", "값");
        assertThat(t.rows().get(0).cells()).hasSize(4);
        assertThat(t.rows().get(0).cells().stream().map(CellData::text)).containsExactly("a", "b", "c", "d");
    }

    @Test
    void 완전히_빈_행은_호출되지_않고_행_번호는_엑셀_번호() {
        Path f = write(tmp.resolve("b.xlsx"), java.util.Arrays.asList(row("h"), row("a"), null, row(""), row("b")));
        Table t = read(f);
        assertThat(t.rows()).extracting(ExcelSheet.Row::rowNo).containsExactly(2, 5);   // 머리글 = 1, 빈 행 3·4는 건너뜀
        assertThat(t.rows()).noneMatch(ExcelSheet.Row::blank);
    }

    @Test
    void 열이_비어_있는_칸은_빈_값으로_채워_머리글과_같은_길이() {
        Path f = write(tmp.resolve("g.xlsx"), List.of(row("a", "b", "c"), row("x", null, "z")));
        List<CellData> cells = read(f).rows().get(0).cells();
        assertThat(cells).hasSize(3);
        assertThat(cells.get(1).blank()).isTrue();
        assertThat(cells.get(2).text()).isEqualTo("z");
    }

    @Test
    void 머리글보다_오른쪽_열의_값은_버린다() {
        Path f = write(tmp.resolve("r.xlsx"), List.of(row("a", "b"), row("x", "y", "넘침")));
        assertThat(read(f).rows().get(0).cells()).hasSize(2);
    }

    @Test
    void 엑셀이_아닌_파일은_INVALID_EXCEL_FILE() throws Exception {
        Path f = tmp.resolve("bad.xlsx");
        Files.writeString(f, "이건 엑셀이 아닙니다");
        assertInvalid(() -> ExcelSheet.readHeaders(f));
    }

    @Test
    void 머리글_행이_없으면_INVALID_EXCEL_FILE() {
        assertInvalid(() -> ExcelSheet.readHeaders(write(tmp.resolve("e.xlsx"), List.of())));
        // 첫 행(머리글)이 비고 2행부터 데이터가 있는 시트
        assertInvalid(() -> ExcelSheet.readHeaders(write(tmp.resolve("e1.xlsx"), java.util.Arrays.asList(null, row("a", "b")))));
    }

    @Test
    void 머리글이_전부_빈칸이면_INVALID_EXCEL_FILE() {
        assertInvalid(() -> ExcelSheet.readHeaders(write(tmp.resolve("e2.xlsx"), List.of(row(null, null), row("a", "b")))));
    }

    @Test
    void 열이_200개를_넘으면_200개까지만() {
        Object[] headers = new Object[250];
        for (int i = 0; i < headers.length; i++) headers[i] = "c" + i;
        Path f = write(tmp.resolve("w.xlsx"), List.of(row(headers)));
        assertThat(ExcelSheet.readHeaders(f)).hasSize(ExcelSheet.MAX_COLUMNS);
    }

    @Test
    void 숫자_정리_함수() {
        assertThat(ExcelSheet.plainNumber(1100)).isEqualTo("1100");
        assertThat(ExcelSheet.plainNumber(37.5663)).isEqualTo("37.5663");
        assertThat(ExcelSheet.plainNumber(-0.5)).isEqualTo("-0.5");
        assertThat(ExcelSheet.plainNumber(1e15)).isEqualTo("1000000000000000");
        assertThat(ExcelSheet.plainNumber(Double.NaN)).isEqualTo("NaN");
    }
}
