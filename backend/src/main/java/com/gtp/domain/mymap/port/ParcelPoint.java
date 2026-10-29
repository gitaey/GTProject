package com.gtp.domain.mymap.port;

/**
 * 필지의 안쪽 대표점(경도·위도, EPSG:4326)과 면적. {@code areaSqm}은 ㎡(소수 1자리)이고 면적을 요청하지 않았으면 null이다.
 * 대표점은 중심점이 아니라 필지 <b>안쪽</b>에 있는 점이다(ST_PointOnSurface) — 오목한 필지에서도 필지 위에 찍힌다.
 */
public record ParcelPoint(String pnu, double lon, double lat, Double areaSqm) {
}
