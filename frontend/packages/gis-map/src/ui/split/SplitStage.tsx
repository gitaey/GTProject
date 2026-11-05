'use client'

// 분할 무대(2~4분할): 격자 + 칸 + 칸 위 위젯(번호 칩·활성 칸 지역명·칸별 바람 범례) + 칸 폭에 따른 class.
//   - 지도 div는 GisMapPane(react)이 칸마다 준다. 엔진은 분할 Provider가 소유하므로 이 컴포넌트가 사라져도(분할 1로 돌아가도) 지도는 산다.
//   - 도구 모음·모바일 레이어 버튼·호스트 children은 칸 밖(MapShell의 무대)에 하나만 둔다.
//   - 칸 폭: 격자 요소 하나를 ResizeObserver로 지켜 layout.ts(순수 함수)로 stacked·compact·edge를 정한다. 모바일은 matchMedia(CSS와 같은 768px).
// 분할이 1이면 MapShell이 이 컴포넌트를 쓰지 않는다(지금 그대로의 GisMapView).
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { GisMapPane, useGisMapSplit } from '../../react'
import type { GisMapSplitCount } from '../../react'
import type { BasemapMode, LayerTreeState } from '../../core'
import { useLayerTreeState } from '../../react'
import { cx } from '../cx'
import RegionBadge from '../overlay/RegionBadge'
import WindLegend from '../overlay/WindLegend'
import { DEFAULT_COMPACT_PANE_WIDTH, DEFAULT_MIN_PANE_WIDTH, computeSplitLayout } from './layout'

export interface SplitStageProps {
    /** 활성 칸에 지역명 배지. 기본 true */
    showRegionBadge?: boolean
    /** 칸마다 바람 범례(바람길이 켜진 지도에서만 보인다). 기본 true */
    showWindLegend?: boolean
    /** 이보다 좁은 칸은 촘촘 모드. 기본 400 */
    compactPaneWidth?: number
    /** 이보다 좁으면 2·3분할을 가로 띠로 쌓는다. 기본 280 */
    minPaneWidth?: number
}

// 모바일 판정은 CSS(@media (max-width: 47.99rem))와 같은 값
const MOBILE_QUERY = '(max-width: 47.99rem)'

function subscribeMobile(onChange: () => void): () => void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
    const mq = window.matchMedia(MOBILE_QUERY)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
}

function getMobile(): boolean {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches
}

function getMobileOnServer(): boolean {
    return false
}

// 격자 class(템플릿 문자열 금지 — 표로 고른다)
const GRID_CLASS: Readonly<Record<GisMapSplitCount, string>> = Object.freeze({
    1: 'gm-split--n1', 2: 'gm-split--n2', 3: 'gm-split--n3', 4: 'gm-split--n4',
})

const BASEMAP_LABEL: Readonly<Record<BasemapMode, string>> = Object.freeze({ normal: '일반', satellite: '위성', none: '없음' })

const selectBasemapMode = (s: LayerTreeState) => s.basemapMode

interface PaneOverlayProps {
    index: number
    active: boolean
    showRegionBadge: boolean
    showWindLegend: boolean
}

/** 칸 위 위젯. GisMapPane 안이라 useGisMap() = 이 칸의 지도 */
function PaneOverlay({ index, active, showRegionBadge, showWindLegend }: PaneOverlayProps) {
    const basemapMode = useLayerTreeState(selectBasemapMode)
    const basemapLabel = BASEMAP_LABEL[basemapMode]
    return (
        <>
            <div className={cx('gm-split__chip', active && 'gm-is-active')} title={'지도 ' + (index + 1) + ' · ' + basemapLabel}>
                <span className="gm-split__chip-num">{index + 1}</span>
                <span className="gm-split__chip-label">{basemapLabel}</span>
            </div>
            {/* 지역명은 활성 칸에만(칸마다 두면 이동 때 지역명 요청이 칸 수만큼 나간다) */}
            {active && showRegionBadge && <RegionBadge />}
            {showWindLegend && <WindLegend />}
        </>
    )
}

export default function SplitStage({
    showRegionBadge = true, showWindLegend = true,
    compactPaneWidth = DEFAULT_COMPACT_PANE_WIDTH, minPaneWidth = DEFAULT_MIN_PANE_WIDTH,
}: SplitStageProps) {
    const split = useGisMapSplit()
    const count: GisMapSplitCount = split?.count ?? 1
    const activeIndex = split?.activeIndex ?? 0

    const gridRef = useRef<HTMLDivElement>(null)
    const [stageWidth, setStageWidth] = useState(0)
    useEffect(() => {
        const el = gridRef.current
        if (!el) return
        const measure = () => setStageWidth(el.clientWidth)
        measure()
        if (typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(measure)
        observer.observe(el)
        return () => observer.disconnect()
    }, [])
    const mobile = useSyncExternalStore(subscribeMobile, getMobile, getMobileOnServer)

    const layout = useMemo(
        () => computeSplitLayout({ count, stageWidth, mobile, compactPaneWidth, minPaneWidth }),
        [count, stageWidth, mobile, compactPaneWidth, minPaneWidth],
    )

    const indices: number[] = []
    for (let i = 0; i < count; i++) indices.push(i)

    return (
        <div ref={gridRef} className={cx('gm-split', GRID_CLASS[count], layout.stacked && 'gm-split--stacked')}>
            {indices.map(i => (
                <GisMapPane key={i} index={i}
                    className={cx('gm-split__pane', i === activeIndex && 'gm-is-active',
                        layout.compact && 'gm-split__pane--compact', layout.edge[i] && 'gm-split__pane--edge')}>
                    <PaneOverlay index={i} active={i === activeIndex} showRegionBadge={showRegionBadge} showWindLegend={showWindLegend} />
                </GisMapPane>
            ))}
        </div>
    )
}
