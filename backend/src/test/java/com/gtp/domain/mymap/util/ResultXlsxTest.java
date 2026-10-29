package com.gtp.domain.mymap.util;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** 결과 엑셀의 수식 주입 방지: 머리글 포함, 줄바꿈·제어문자로 앞 글자를 가려도 걸린다. */
class ResultXlsxTest {

    private static Sheet write(List<String> header, List<Object> row, XSSFWorkbook[] holder) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ResultXlsx x = new ResultXlsx()) {
            ResultXlsx.Table t = x.table("s");
            t.header(header);
            t.row(row);
            x.write(out);
        }
        holder[0] = new XSSFWorkbook(new ByteArrayInputStream(out.toByteArray()));
        return holder[0].getSheetAt(0);
    }

    @Test
    void 머리글_이름이_수식처럼_보여도_텍스트_서식_굵게() throws Exception {
        XSSFWorkbook[] h = new XSSFWorkbook[1];
        Sheet s = write(Arrays.asList("=SUM(A1)", "+1", "보통"), Arrays.asList("a", "b", "c"), h);
        try (XSSFWorkbook wb = h[0]) {
            Cell evil = s.getRow(0).getCell(0);
            assertThat(evil.getStringCellValue()).isEqualTo("=SUM(A1)");
            assertThat(evil.getCellStyle().getQuotePrefixed()).isTrue();
            assertThat(wb.getFontAt(evil.getCellStyle().getFontIndex()).getBold()).as("머리글은 여전히 굵게").isTrue();
            assertThat(s.getRow(0).getCell(1).getCellStyle().getQuotePrefixed()).isTrue();
            assertThat(s.getRow(0).getCell(2).getCellStyle().getQuotePrefixed()).isFalse();
            assertThat(wb.getFontAt(s.getRow(0).getCell(2).getCellStyle().getFontIndex()).getBold()).isTrue();
        }
    }

    @Test
    void 줄바꿈_시작과_제어문자로_가린_수식도_보호() throws Exception {
        XSSFWorkbook[] h = new XSSFWorkbook[1];
        Sheet s = write(Arrays.asList("a", "b", "c", "d", "e"),
                Arrays.asList("\n=1+1", "\u000B=1+1", "\u0001@x", "\t=1", "그냥 글자"), h);
        try (XSSFWorkbook wb = h[0]) {
            for (int c = 0; c < 4; c++) assertThat(s.getRow(1).getCell(c).getCellStyle().getQuotePrefixed()).as("열 " + c).isTrue();
            assertThat(s.getRow(1).getCell(4).getCellStyle().getQuotePrefixed()).isFalse();
        }
        assertThat(ResultXlsx.isFormulaLike("\n=1")).isTrue();
        assertThat(ResultXlsx.needsGuard("\u000B=1", " =1")).isTrue();
        assertThat(ResultXlsx.needsGuard("abc", "abc")).isFalse();
    }
}
