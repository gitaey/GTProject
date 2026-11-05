'use client'

// 지도 우측 도구 모음: 줌 · 바람길 · 그리기/측정/반경 · 전체 초기화 (스타일: styles/gis-map-ui.css의 gm-toolbar)
// FE-5b-2: 그리기 패널·반경 패널·활성 도구 연결을 DrawPanel.tsx·RadiusPanel.tsx·activeTool.ts로 떼어 냈다(본문 그대로)
import { useState, useRef, useEffect } from 'react'
import {
    PenLine, Ruler, Trash2, Plus, Minus, SquareDashed, CircleDot, Wind, Printer, ChartPie, LandPlot,
} from 'lucide-react'
import { useGisHost, useGisMap, useWindPlugin, useWindState } from '../../react'
import type { WindState } from '../../core'
import { cx } from '../cx'
import { isDrawMode, isSelectMode, useActiveTool } from './activeTool'
import DrawPanel from './DrawPanel'
import RadiusPanel from './RadiusPanel'
import PrintPanel from '../print/PrintPanel'
import AreaAnalysisPanel from '../areaAnalysis/AreaAnalysisPanel'
import ParcelInfoCard from '../parcelInfo/ParcelInfoCard'

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

export interface MapToolbarProps {
    /** 출력(PNG·PDF·인쇄) 단추와 패널. 기본 true(메뉴 권한 map.tool.print도 통과해야 보인다) */
    showPrint?: boolean
    /** 영역 분석(영역을 정하고 레이어별 개수·면적·열별 집계) 단추와 패널. 기본 true(메뉴 권한 map.tool.area-analysis도 통과해야 보인다) */
    showAreaAnalysis?: boolean
    /** 필지 정보(필지를 눌러 속성·건물 보기) 단추와 카드. 기본 true(메뉴 권한 map.tool.parcel-info도 통과하고, 지도에 parcel.infoAt 소스가 있어야 보인다) */
    showParcelInfo?: boolean
    /** 도구 모음 맨 위 작은 칩(예: 분할 중 '지도 2' — 이 도구 모음이 어느 지도를 조작하는지). 없으면 칩을 그리지 않는다 */
    targetLabel?: string
}

export default function MapToolbar({ showPrint = true, showAreaAnalysis = true, showParcelInfo = true, targetLabel }: MapToolbarProps = {}) {
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
    const [printOpen, setPrintOpen] = useState(false)
    const [analysisOpen, setAnalysisOpen] = useState(false)
    const panelRef = useRef<HTMLDivElement>(null)

    const isAnyDraw = isDrawMode(activeTool) || isSelectMode(activeTool)

    // 그리기·반경 패널, 출력 패널, 영역 분석 패널, 필지 정보 카드는 같은 자리(도구 모음 왼쪽)를 쓴다 → 하나를 열면 나머지를 닫는다
    // (닫히는 영역 분석 패널은 언마운트되며 영역·결과·강조를 지운다). 반경·필지 정보 도구가 켜지면 출력·영역 분석(·그리기) 패널이 닫히고,
    // 출력·영역 분석·그리기 패널을 열면 켜져 있던 반경·필지 정보 도구가 꺼진다(필지 정보 도구가 꺼지면 카드·강조도 엔진이 지운다)
    function toggleDraw() {
        const next = !drawOpen
        setDrawOpen(next)
        if (next) {
            setPrintOpen(false)
            setAnalysisOpen(false)
            if (activeTool === 'parcel-info') setActiveTool('none')
        }
    }
    function toggleParcel() {
        if (activeTool !== 'parcel-info') {
            setDrawOpen(false)
            setPrintOpen(false)
            setAnalysisOpen(false)
        }
        setActiveTool('parcel-info')
    }
    function togglePrint() {
        const next = !printOpen
        setPrintOpen(next)
        if (!next) return
        setDrawOpen(false)
        setAnalysisOpen(false)
        if (activeTool === 'radius-search' || activeTool === 'parcel-info') setActiveTool('none')
    }
    function toggleAnalysis() {
        const next = !analysisOpen
        setAnalysisOpen(next)
        if (!next) return
        setDrawOpen(false)
        setPrintOpen(false)
        if (activeTool === 'radius-search' || activeTool === 'parcel-info') setActiveTool('none')
    }
    useEffect(() => {
        if (activeTool === 'radius-search' || activeTool === 'parcel-info') {
            setPrintOpen(false)
            setAnalysisOpen(false)
        }
        if (activeTool === 'parcel-info') setDrawOpen(false)
    }, [activeTool])

    // loaded가 false(미로그인/미로드)면 전부 표시
    const show = (menuId: string) => !loaded || isAllowed(menuId)

    const showDraw    = show('map.tool.draw')
    const showMeasD   = show('map.tool.measure-distance')
    const showMeasA   = show('map.tool.measure-area')
    const showRadius  = show('map.tool.radius-search')
    // 바람 단추는 이 지도에 바람길 플러그인이 있을 때만(분할의 2~4번 지도처럼 플러그인이 없는 지도에서는 누를 곳이 없다)
    const showWind    = show('map.tool.wind') && wind !== null
    const showPrintBtn = showPrint && show('map.tool.print')
    const showAnalysisBtn = showAreaAnalysis && show('map.tool.area-analysis')
    const showParcelBtn = showParcelInfo && show('map.tool.parcel-info') && !!gis?.parcelInfo.available
    const showToolGrp = showDraw || showMeasD || showMeasA || showRadius

    function zoom(delta: number) {
        if (!map) return
        const v = map.getView()
        v.animate({ zoom: (v.getZoom() ?? 10) + delta, duration: 200 })
    }

    return (
        <div className="gm-toolbar">

            {targetLabel != null && <div className="gm-toolbar__target">{targetLabel}</div>}

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
                            <TBtn active={isAnyDraw || drawOpen} onClick={toggleDraw}
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

            {/* ── 필지 정보 ── */}
            {showParcelBtn && (
                <div className="gm-toolbar__group">
                    <Tip label={activeTool === 'parcel-info' ? '' : '필지 정보'}>
                        <TBtn active={activeTool === 'parcel-info'} onClick={toggleParcel} cls="gm-toolbar__btn--single">
                            <LandPlot size={15} />
                        </TBtn>
                    </Tip>
                </div>
            )}
            {showParcelBtn && activeTool === 'parcel-info' && (
                <div className="gm-toolbar__parcel-slot">
                    <ParcelInfoCard />
                </div>
            )}

            {/* ── 영역 분석 ── */}
            {showAnalysisBtn && (
                <div className="gm-toolbar__group">
                    <Tip label={analysisOpen ? '' : '영역 분석'}>
                        <TBtn active={analysisOpen} onClick={toggleAnalysis} cls="gm-toolbar__btn--single">
                            <ChartPie size={15} />
                        </TBtn>
                    </Tip>
                </div>
            )}
            {showAnalysisBtn && analysisOpen && (
                <div className="gm-toolbar__analysis-slot">
                    <AreaAnalysisPanel onClose={() => setAnalysisOpen(false)} />
                </div>
            )}

            {/* ── 출력 ── */}
            {showPrintBtn && (
                <div className="gm-toolbar__group">
                    <Tip label={printOpen ? '' : '출력'}>
                        <TBtn active={printOpen} onClick={togglePrint} cls="gm-toolbar__btn--single">
                            <Printer size={15} />
                        </TBtn>
                    </Tip>
                </div>
            )}
            {showPrintBtn && printOpen && (
                <div className="gm-toolbar__print-slot">
                    <PrintPanel onClose={() => setPrintOpen(false)} />
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
