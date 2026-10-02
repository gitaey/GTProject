// 나만의지도 업로드의 "원본 좌표계" 선택지. 타입(UserMapListItem·ExcelPreviewResponse)은 지도 코어(@gtp/gis-map/core)에 있다.
export const SRID_OPTIONS = [
    { value: 'EPSG:5186', label: 'EPSG:5186 (중부원점, 기본)' },
    { value: 'EPSG:4326', label: 'EPSG:4326 (WGS84 경위도)' },
    { value: 'EPSG:5179', label: 'EPSG:5179 (UTM-K)' },
    { value: 'EPSG:3857', label: 'EPSG:3857 (Web Mercator)' },
]
