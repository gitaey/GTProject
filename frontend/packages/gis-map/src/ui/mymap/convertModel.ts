// 주소 변환(엑셀로만 받기) 화면의 순수 규칙 — React·DOM과 무관.
import type { MyMapConvertInclude } from '../../core'

/** 결과 엑셀에서 붙은 열이 시작되는 열(원본 열 뒤) · 실패 사유 열 · 실패를 뜻하는 값 */
export const STATUS_COLUMN = '매칭상태'
export const REASON_COLUMN = '실패사유/후보'
export const FAILED_STATUS = '실패'
/** 결과 화면 미리보기 행 수 */
export const CONVERT_PREVIEW_ROWS = 5

/** "결과 받는 방법" */
export type Delivery = 'map' | 'excel'

/** 화면의 체크 네 개(도로명·지번 주소는 한 체크로 같이 켜고 끈다) */
export interface ConvertFlags {
    pnu: boolean
    address: boolean
    lonLat: boolean
    area: boolean
}

/** 기본: 면적만 꺼짐 */
export const DEFAULT_CONVERT_FLAGS: Readonly<ConvertFlags> = Object.freeze({ pnu: true, address: true, lonLat: true, area: false })

/** 화면 체크 → 요청 include */
export function toConvertInclude(f: ConvertFlags): MyMapConvertInclude {
    return { pnu: f.pnu, roadAddress: f.address, jibunAddress: f.address, lonLat: f.lonLat, area: f.area }
}

/** 서버가 붙인 상태 열 이름: `매칭상태`, 원본에 같은 이름이 있으면 `매칭상태 (2)`처럼 번호가 붙는다 */
const STATUS_COLUMN_PATTERN = /^매칭상태(\s*\(\d+\))?$/

/** 붙은 열이 시작하는 위치(마지막 `매칭상태`·`매칭상태 (숫자)` 열). 없으면 -1 — 이때는 강조하지 않는다 */
export function appendedStart(columns: readonly string[]): number {
    for (let i = columns.length - 1; i >= 0; i--) if (STATUS_COLUMN_PATTERN.test(columns[i].trim())) return i
    return -1
}

/** 이 행이 매칭 실패인가(`매칭상태` 열이 있고 그 값이 `실패`) */
export function isFailedRow(columns: readonly string[], row: readonly string[]): boolean {
    const at = appendedStart(columns)
    return at >= 0 && (row[at] ?? '').trim() === FAILED_STATUS
}

/** 파일 크기 글자('12.3KB'·'1.2MB'). 시스템 로캘에 기대지 않는다 */
export function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n < 0) return '-'
    if (n < 1024) return `${n}B`
    if (n < 1024 * 1024) return `${Number((n / 1024).toFixed(1))}KB`
    return `${Number((n / (1024 * 1024)).toFixed(1))}MB`
}
