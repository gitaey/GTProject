package com.gtp.domain.mymap.port;

/**
 * 필지 하나의 모양. {@code geometryJson}은 EPSG:4326 GeoJSON geometry(Polygon·MultiPolygon) 문자열이다.
 * 업로드 때 이 값을 피처에 그대로 복사(스냅샷)하므로, 이후 참조 테이블이 갱신돼도 레이어는 바뀌지 않는다.
 */
public record ParcelShape(String pnu, String jibun, String geometryJson) {
}
