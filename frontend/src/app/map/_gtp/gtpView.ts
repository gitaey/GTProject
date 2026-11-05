// GTProject 지도 시점·브랜드 색 상수(지도 패키지 밖 — 이식하지 않는다).
// 일부러 아무것도 import하지 않는 작은 모듈: /map(gtpMap.tsx)과 대시보드 미리보기(app/_dashboard)가 같은 값을 쓰되,
// gtpMap.tsx(바람길 플러그인·패널 UI·xlsx)를 끌어오지 않게 상수만 따로 뒀다.

/** 세종특별자치시청 부근 [lon, lat] (EPSG:4326) — 변경 불가(얼림) */
export const GTP_VIEW_CENTER: readonly [number, number] = Object.freeze([127.289, 36.48] as [number, number])
export const GTP_VIEW_ZOOM = 10
export const GTP_VIEW_MIN_ZOOM = 7
export const GTP_VIEW_MAX_ZOOM = 21

/** 브랜드 주 색 #rrggbb */
export const GTP_BRAND_PRIMARY = '#F26722'
