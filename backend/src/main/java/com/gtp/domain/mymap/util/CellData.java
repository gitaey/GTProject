package com.gtp.domain.mymap.util;

/**
 * 엑셀 셀 하나를 읽은 결과.
 *
 * @param text    엑셀에서 보이는 값(서식 적용, 앞뒤 공백 제거, 최대 1,000자) — 미리보기·실패 행에 쓴다
 * @param plain   속성(properties)으로 저장할 값. 숫자 셀은 서식(천 단위 쉼표 등)을 빼고 숫자 그대로, 그 밖에는 text와 같다
 * @param numeric 숫자 셀(수식 결과가 숫자인 경우 포함)인가. 날짜 서식 숫자도 true — PNU 판정에서 숫자 서식을 가려내는 데 쓴다
 * @param number  numeric일 때의 double 값, 아니면 null
 */
public record CellData(String text, String plain, boolean numeric, Double number) {

    public static final CellData EMPTY = new CellData("", "", false, null);

    public boolean blank() {
        return text.isEmpty();
    }
}
