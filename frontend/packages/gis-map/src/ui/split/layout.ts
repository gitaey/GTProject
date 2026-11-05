// 분할 격자의 칸 폭 계산(순수 함수 — React·DOM을 모른다). SplitStage가 무대 폭을 재서 이 함수로 class를 정한다.
//   - 열 수: 2분할 2열 · 3분할 3열(같은 크기 세로 3칸) · 4분할 2열(2×2). 칸 사이는 SPLIT_GAP(CSS gm-split의 gap과 같은 값).
//   - 칸 폭 < minPaneWidth(2·3분할만) → 1열 N행으로 쌓는다(stacked, 칸 폭 = 무대 폭).
//   - 칸 폭 < compactPaneWidth → 촘촘(compact: 번호만·작은 배지).
//   - 맨 오른쪽 열의 칸(edge)은 도구 모음이 위에 떠 있어 칸 안 위젯의 오른쪽 여백을 더 둔다. 쌓였을 때는 모든 칸이 맨 오른쪽 열.
//   - 모바일(활성 칸 하나만 보임): 쌓기·촘촘 없음, 모든 칸이 edge.
//   - 무대 폭을 아직 모르면(<= 0) 보통 모드로 둔다(측정 뒤 바로 바뀐다).
import type { GisMapSplitCount } from '../../react'

/** CSS .gm-split의 gap(px) */
export const SPLIT_GAP = 2
/** 이보다 좁은 칸은 촘촘 모드(번호만·작은 배지). 근거: 칩 `1 · 위성` + 배지 보통 폭 + 도구 모음 여백 + 양쪽 여백 */
export const DEFAULT_COMPACT_PANE_WIDTH = 400
/** 이보다 좁으면 2·3분할을 가로 띠로 쌓는다. 근거: 번호 칩 + 배지 최소 + 도구 모음 여백 + 여유 */
export const DEFAULT_MIN_PANE_WIDTH = 280
/** 셀렉트 기본 선택지 */
export const DEFAULT_SPLIT_COUNTS: readonly GisMapSplitCount[] = Object.freeze([1, 2, 3, 4] as const)

export interface SplitLayoutInput {
    count: GisMapSplitCount
    /** 격자(무대) 폭 px. 모르면 0 */
    stageWidth: number
    /** 뷰포트가 모바일(768px 미만)인가 */
    mobile: boolean
    compactPaneWidth: number
    minPaneWidth: number
}

export interface SplitLayout {
    /** 1열 N행으로 쌓음(gm-split--stacked) */
    stacked: boolean
    /** 촘촘 모드(모든 칸 공통, gm-split__pane--compact) */
    compact: boolean
    /** 화면에 보이는 열 수 */
    columns: number
    /** 칸 폭 px(무대 폭을 모르면 0) */
    paneWidth: number
    /** 칸 번호별 맨 오른쪽 열 여부(gm-split__pane--edge). 길이 = count */
    edge: readonly boolean[]
}

export function computeSplitLayout({ count, stageWidth, mobile, compactPaneWidth, minPaneWidth }: SplitLayoutInput): SplitLayout {
    if (mobile) {
        return { stacked: false, compact: false, columns: 1, paneWidth: Math.max(stageWidth, 0), edge: new Array<boolean>(count).fill(true) }
    }
    const known = stageWidth > 0
    let columns = count === 4 ? 2 : count
    let paneWidth = known ? (stageWidth - SPLIT_GAP * (columns - 1)) / columns : 0
    const stacked = known && (count === 2 || count === 3) && paneWidth < minPaneWidth
    if (stacked) {
        columns = 1
        paneWidth = stageWidth
    }
    const compact = known && count > 1 && paneWidth < compactPaneWidth
    const edge: boolean[] = []
    for (let i = 0; i < count; i++) {
        const column = stacked ? 0 : count === 4 ? i % 2 : i
        edge.push(count > 1 && column === columns - 1)
    }
    return { stacked, compact, columns, paneWidth, edge }
}
