// 나만의지도 항목 `⋯` 메뉴에 어떤 항목이 들어가는지 정하는 규칙(순수 함수 — React·DOM과 무관).
// 순서(소유자): 스타일·라벨 / 업로드 결과 / 속성 테이블 / 삭제 (공유는 패널 상단 `공유` 하나로만)
import type { UserMapListItem } from '../../core'

export type ItemMenuId = 'style' | 'report' | 'table' | 'delete'

export interface ItemMenuEnv {
    /** 소스가 스타일 저장(update)을 가졌다 */
    styleAvailable: boolean
    /** 소스가 업로드 결과(importReport)를 가졌다 */
    reportAvailable: boolean
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

export function itemMenuIds(item: UserMapListItem, env: ItemMenuEnv): ItemMenuId[] {
    const ready = item.status === 'READY'
    // 공유받은 레이어: 속성 테이블만(스타일·결과·삭제는 소유자 몫 — 서버도 403)
    if (!item.owner) return ready ? ['table'] : []
    const ids: ItemMenuId[] = []
    if (env.styleAvailable && ready) ids.push('style')
    // 결과가 확정된 항목: 건수가 있거나(실패한 업로드도 포함) 끝난 엑셀 레이어(실패 0이어도 요약을 본다)
    if (env.reportAvailable && item.status !== 'PROCESSING' && (hasImportResult(item) || (ready && isExcelItem(item)))) ids.push('report')
    if (ready) ids.push('table')
    ids.push('delete')
    return ids
}
