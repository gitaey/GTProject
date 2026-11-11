// 나만의지도 항목 `⋯` 메뉴에 어떤 항목이 들어가는지 정하는 규칙(순수 함수 — React·DOM과 무관).
// 순서(소유자): 스타일·라벨 / 속성 테이블 / 내보내기 / 업로드 결과 보기 / 삭제(공유는 머리줄 [공유] 단추로만). 공유받은 레이어: 속성 테이블 / 내보내기
// 목록 행에는 실패 개수·사유를 보이지 않으므로 `업로드 결과 보기`가 결과를 다시 보는 유일한 길이다(소유자만 — 서버도 403).
import type { UserMapListItem } from '../../core'

export type ItemMenuId = 'style' | 'report' | 'table' | 'export' | 'delete'

export interface ItemMenuEnv {
    /** 소스가 스타일 저장(update)을 가졌다 */
    styleAvailable: boolean
    /** 소스가 업로드 결과(importReport)를 가졌다 */
    reportAvailable: boolean
    /** 소스가 내보내기(exportLayer)를 가졌다 */
    exportAvailable: boolean
}

type KindFields = Pick<UserMapListItem, 'sourceKind' | 'sourceType'>

/** 엑셀로 만든 레이어인가(새 서버는 sourceKind, 옛 서버는 sourceType) */
export function isExcelItem(item: KindFields): boolean {
    return item.sourceKind ? item.sourceKind.startsWith('EXCEL') : item.sourceType === 'EXCEL'
}

/** 매칭·실패 건수가 있는 항목(처리 중에는 값이 와 있어도 결과가 아니다) */
export function hasImportResult(item: Pick<UserMapListItem, 'status' | 'matchedCount' | 'failedCount'>): boolean {
    return item.status !== 'PROCESSING' && (item.matchedCount ?? 0) + (item.failedCount ?? 0) > 0
}

/**
 * 업로드 결과 창을 열 수 있는 항목인가(소유자만). 처리 실패(FAILED)는 소스의 보고서 없이도 창이 이유 문장을 보여 주므로 항상 열 수 있고,
 * 끝난(READY) 항목은 소스에 importReport가 있고 결과가 확정된 항목(건수가 있거나 엑셀 레이어 — 실패 0이어도 요약을 본다)만
 */
export function canViewImportResult(item: UserMapListItem, reportAvailable: boolean): boolean {
    if (!item.owner || item.status === 'PROCESSING') return false
    if (item.status === 'FAILED') return true
    return reportAvailable && (hasImportResult(item) || isExcelItem(item))
}

export function itemMenuIds(item: UserMapListItem, env: ItemMenuEnv): ItemMenuId[] {
    const ready = item.status === 'READY'
    // 공유받은 레이어: 속성 테이블·내보내기만(스타일·결과·삭제는 소유자 몫 — 서버도 403). 볼 수 있으면 받을 수 있다
    if (!item.owner) return !ready ? [] : env.exportAvailable ? ['table', 'export'] : ['table']
    const ids: ItemMenuId[] = []
    if (env.styleAvailable && ready) ids.push('style')
    if (ready) ids.push('table')
    // 내보내기: 끝난(READY) 항목만 — 처리 중·실패에는 내보낼 피처가 없다
    if (env.exportAvailable && ready) ids.push('export')
    if (canViewImportResult(item, env.reportAvailable)) ids.push('report')
    ids.push('delete')
    return ids
}
