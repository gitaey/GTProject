'use client'

// 지도 우측 도구 모음: 줌 · 바람길 · 그리기/측정/반경 · 전체 초기화 (스타일: styles/gis-map-ui.css의 gm-toolbar)
// FE-5b-2: 그리기 패널·반경 패널·활성 도구 연결을 DrawPanel.tsx·RadiusPanel.tsx·activeTool.ts로 떼어 냈다(본문 그대로)
import { useState, useRef } from 'react'
import {
    PenLine, Ruler, Trash2, Plus, Minus, SquareDashed, CircleDot, Wind,
} from 'lucide-react'
import { useGisHost, useGisMap, useWindPlugin, useWindState } from '../../react'
import type { WindState } from '../../core'
import { cx } from '../cx'
import { isDrawMode, isSelectMode, useActiveTool } from './activeTool'
import DrawPanel from './DrawPanel'
import RadiusPanel from './RadiusPanel'

// ── 툴팁 ──────────────────────────────────────────────────────────────────────

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
    const [vis, setVis] = useState(false)
    return (
        <div className="gm-toolbar__tip" onMouseEnter={() => setVis(true)} onMouseLeave={() => setVis(false)}>
            {children}
            {vis && label && (
                <div className="gm-toolbar__tip-pop">
                    <div className="gm-toolbar__tip-label">{label}</div>
                    <div className="gm-toolbar__tip-arrow" />
                </div>
            )}
        </div>
    )
}

// ── 툴바 버튼 ─────────────────────────────────────────────────────────────────

function TBtn({ active, onClick, children, cls = '' }: {
    active?: boolean; onClick?: () => void; children: React.ReactNode; cls?: string
}) {
    return (
        <button onClick={onClick}
            className={cx('gm-toolbar__btn', active && 'gm-is-active', cls)}>
            {children}
        </button>
    )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

const selectWindVisible = (s: WindState) => s.visible

export default function MapToolbar() {
    // 바람길 토글은 엔진의 바람길 플러그인(설치: app/map/page.tsx의 setup)
    const wind = useWindPlugin()
    const windLayerVisible = useWindState(selectWindVisible)
    const toggleWindLayer = () => wind?.toggle()
    const [activeTool, setActiveTool] = useActiveTool()
    // 메뉴 권한은 호스트 주입값(GisMapHost.isFeatureAllowed / permissionsReady)
    const { isFeatureAllowed: isAllowed, permissionsReady: loaded } = useGisHost()
    // 전체 초기화는 엔진이 한다(그리기·측정·반경·필지 강조 정리)
    const gis = useGisMap()
    const map = gis ? gis.olMap : null
    const [drawOpen, setDrawOpen] = useState(false)
    const panelRef = useRef<HTMLDivElement>(null)

    const isAnyDraw = isDrawMode(activeTool) || isSelectMode(activeTool)

    // loaded가 false(미로그인/미로드)면 전부 표시
    const show = (menuId: string) => !loaded || isAllowed(menuId)

    const showDraw    = show('map.tool.draw')
    const showMeasD   = show('map.tool.measure-distance')
    const showMeasA   = show('map.tool.measure-area')
    const showRadius  = show('map.tool.radius-search')
    const showWind    = show('map.tool.wind')
    const showToolGrp = showDraw || showMeasD || showMeasA || showRadius

    function zoom(delta: number) {
        if (!map) return
        const v = map.getView()
        v.animate({ zoom: (v.getZoom() ?? 10) + delta, duration: 200 })
    }

    return (
        <div className="gm-toolbar">

            {/* ── 줌 ── */}
            {show('map.tool.zoom') && (
                <div className="gm-toolbar__group">
                    <Tip label="확대"><TBtn onClick={() => zoom(1)} cls="gm-toolbar__btn--first gm-toolbar__btn--divided"><Plus size={16} /></TBtn></Tip>
                    <Tip label="축소"><TBtn onClick={() => zoom(-1)} cls="gm-toolbar__btn--last"><Minus size={16} /></TBtn></Tip>
                </div>
            )}

            {/* ── 바람길 ── */}
            {showWind && (
                <div className="gm-toolbar__group">
                    <Tip label="바람길">
                        <TBtn active={windLayerVisible} onClick={toggleWindLayer} cls="gm-toolbar__btn--single">
                            <Wind size={15} />
                        </TBtn>
                    </Tip>
                </div>
            )}

            {/* ── 도구 (그리기 + 측정) ── */}
            {showToolGrp && (
                <div ref={panelRef} className="gm-toolbar__tools">
                    {showDraw && (
                        <Tip label={drawOpen ? '' : '그리기'}>
                            <TBtn active={isAnyDraw || drawOpen} onClick={() => setDrawOpen(p => !p)}
                                cls={cx('gm-toolbar__btn--first', (showMeasD || showMeasA || showRadius) ? 'gm-toolbar__btn--divided' : 'gm-toolbar__btn--last')}>
                                <PenLine size={15} />
                            </TBtn>
                        </Tip>
                    )}
                    {showMeasD && (
                        <Tip label="거리측정">
                            <TBtn active={activeTool === 'measure-distance'} onClick={() => setActiveTool('measure-distance')}
                                cls={cx(!showDraw && 'gm-toolbar__btn--first', (showMeasA || showRadius) ? 'gm-toolbar__btn--divided' : 'gm-toolbar__btn--last')}>
                                <Ruler size={15} />
                            </TBtn>
                        </Tip>
                    )}
                    {showMeasA && (
                        <Tip label="면적측정">
                            <TBtn active={activeTool === 'measure-area'} onClick={() => setActiveTool('measure-area')}
                                cls={cx(!showDraw && !showMeasD && 'gm-toolbar__btn--first', showRadius ? 'gm-toolbar__btn--divided' : 'gm-toolbar__btn--last')}>
                                <SquareDashed size={15} />
                            </TBtn>
                        </Tip>
                    )}
                    {showRadius && (
                        <Tip label="반경검색">
                            <TBtn active={activeTool === 'radius-search'} onClick={() => setActiveTool('radius-search')}
                                cls={cx(!showDraw && !showMeasD && !showMeasA && 'gm-toolbar__btn--first', 'gm-toolbar__btn--last')}>
                                <CircleDot size={15} />
                            </TBtn>
                        </Tip>
                    )}
                    {drawOpen && showDraw && (
                        <div className="gm-toolbar__draw-slot">
                            <DrawPanel />
                        </div>
                    )}
                    {showRadius && activeTool === 'radius-search' && (
                        <div className="gm-toolbar__radius-slot">
                            <RadiusPanel />
                        </div>
                    )}
                </div>
            )}

            {/* ── 초기화 ── */}
            {show('map.tool.clear') && (
                <div className="gm-toolbar__group">
                    <Tip label="전체 초기화">
                        <button onClick={() => gis?.clearAll()}
                            className="gm-toolbar__clear">
                            <Trash2 size={15} />
                        </button>
                    </Tip>
                </div>
            )}
        </div>
    )
}
