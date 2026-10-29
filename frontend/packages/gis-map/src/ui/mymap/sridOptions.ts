import type { MyMapExportSrid } from '../../core'

/** 주소 변환·내보내기의 "결과 좌표계" 선택지(EPSG 번호, 기본 4326 = 첫 항목) */
export const EXPORT_SRID_OPTIONS: readonly Readonly<{ value: MyMapExportSrid; label: string }>[] = Object.freeze([
    Object.freeze({ value: 4326, label: 'WGS84 경위도 (EPSG:4326)' }),
    Object.freeze({ value: 5186, label: '중부원점 TM (EPSG:5186)' }),
    Object.freeze({ value: 5179, label: '통일원점 TM·UTM-K (EPSG:5179)' }),
    Object.freeze({ value: 3857, label: 'Web Mercator (EPSG:3857)' }),
])
export const DEFAULT_EXPORT_SRID: MyMapExportSrid = 4326

/** 값이 선택지에 있는 EPSG 번호면 그 값, 아니면 기본(4326) */
export function toExportSrid(v: unknown): MyMapExportSrid {
    const n = Number(v)
    return EXPORT_SRID_OPTIONS.find(o => o.value === n)?.value ?? DEFAULT_EXPORT_SRID
}

// 나만의지도 업로드의 "원본 좌표계" 선택지. 타입(UserMapListItem·ExcelPreviewResponse)은 지도 코어(@gtp/gis-map/core)에 있다.
export const SRID_OPTIONS: readonly Readonly<{ value: string; label: string }>[] = Object.freeze([
    Object.freeze({ value: 'EPSG:5186', label: 'EPSG:5186 (중부원점, 기본)' }),
    Object.freeze({ value: 'EPSG:4326', label: 'EPSG:4326 (WGS84 경위도)' }),
    Object.freeze({ value: 'EPSG:5179', label: 'EPSG:5179 (UTM-K)' }),
    Object.freeze({ value: 'EPSG:3857', label: 'EPSG:3857 (Web Mercator)' }),
])
