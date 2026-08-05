'use client'

import { useState, useRef } from 'react'
import {
    PenLine, Ruler, Trash2, Plus, Minus, SquareDashed, CircleDot,
    MapPin, Minus as LineIco, Pentagon, Circle, Square, Type,
    MousePointer2, Trash,
} from 'lucide-react'
import { useMapStore, MapTool } from '@/stores/map/mapStore'
import { useDrawStore, PRESET_COLORS } from '@/stores/map/drawStore'
import Map from 'ol/Map'

// ── 상수 ──────────────────────────────────────────────────────────────────────

const DRAW_TOOLS: {
    id: MapTool; label: string; icon: React.ReactNode
    hasFill: boolean; hasSize: boolean; hasFontSize: boolean
}[] = [
    { id: 'draw-point',   label: '포인트',   icon: <MapPin    size={14} />, hasFill: false, hasSize: true,  hasFontSize: false },
    { id: 'draw-line',    label: '선',       icon: <LineIco   size={14} />, hasFill: false, hasSize: false, hasFontSize: false },
    { id: 'draw-polygon', label: '폴리곤',   icon: <Pentagon  size={14} />, hasFill: true,  hasSize: false, hasFontSize: false },
    { id: 'draw-circle',  label: '원',       icon: <Circle    size={14} />, hasFill: true,  hasSize: false, hasFontSize: false },
    { id: 'draw-box',     label: '직사각형', icon: <Square    size={14} />, hasFill: true,  hasSize: false, hasFontSize: false },
    { id: 'draw-text',    label: '텍스트',   icon: <Type      size={14} />, hasFill: false, hasSize: false, hasFontSize: true  },
]

const STROKE_WIDTHS = [1, 2, 3, 5]
const SHADOW = { boxShadow: '0 2px 8px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.08)' }

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function isDrawMode(tool: MapTool) { return tool.startsWith('draw-') }
function isSelectMode(tool: MapTool) { return tool === 'select' }

// ── 툴팁 ──────────────────────────────────────────────────────────────────────

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
    const [vis, setVis] = useState(false)
    return (
        <div className="relative" onMouseEnter={() => setVis(true)} onMouseLeave={() => setVis(false)}>
            {children}
            {vis && label && (
                <div className="absolute right-11 top-1/2 -translate-y-1/2 pointer-events-none z-50 flex items-center">
                    <div className="bg-gray-800 text-white text-xs px-2.5 py-1.5 rounded-md whitespace-nowrap" style={SHADOW}>{label}</div>
                    <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '6px solid #1f2937' }} />
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
            className={`w-9 h-9 flex items-center justify-center transition-colors cursor-pointer ${
                active ? 'bg-orange-50 text-[#F26722]' : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            } ${cls}`}>
            {children}
        </button>
    )
}

// ── 그리기 패널 ───────────────────────────────────────────────────────────────

function DrawPanel() {
    const { activeTool, setActiveTool } = useMapStore()
    const { drawStyle, setDrawStyle, selectedCount, deleteSelectedFn } = useDrawStore()

    const inDraw   = isDrawMode(activeTool)
    const inSelect = isSelectMode(activeTool)
    const activeDef = DRAW_TOOLS.find(t => t.id === activeTool)

    function enterSelect() { setActiveTool('select') }

    return (
        <div className="bg-white rounded-xl overflow-hidden" style={{ ...SHADOW, width: 208 }}>

            {/* ── 도형 선택 ── */}
            <div className="p-2.5 pb-0">
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-2 px-0.5">도형</p>
                <div className="grid grid-cols-6 gap-1">
                    {DRAW_TOOLS.map(t => (
                        <button key={t.id} title={t.label}
                            onClick={() => setActiveTool(t.id)}
                            className={`h-8 rounded-lg flex items-center justify-center transition-all ${
                                activeTool === t.id
                                    ? 'bg-[#F26722] text-white shadow-sm'
                                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                            }`}>
                            {t.icon}
                        </button>
                    ))}
                </div>
                {/* 선택된 도형 이름 */}
                <p className="text-[10px] text-gray-400 mt-1.5 px-0.5 h-4">
                    {activeDef ? `${activeDef.label} 그리기 · 우클릭으로 완료` : '도형을 선택하세요'}
                </p>
            </div>

            {/* ── 구분선 ── */}
            <div className="mx-2.5 my-2.5 h-px bg-gray-100" />

            {/* ── 선택·편집 모드 ── */}
            <div className="px-2.5 pb-2.5">
                <button
                    onClick={enterSelect}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        inSelect
                            ? 'bg-[#F26722] text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    <MousePointer2 size={13} />
                    <span>선택 · 편집</span>
                    {inSelect && selectedCount > 0 && (
                        <span className="ml-auto bg-white/30 text-white text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                            {selectedCount}
                        </span>
                    )}
                </button>

                {/* 선택 모드 안내 */}
                {inSelect && (
                    <div className="mt-2 space-y-1.5">
                        {selectedCount === 0 ? (
                            <p className="text-[10px] text-gray-400 text-center py-1">
                                도형을 클릭해 선택 · 꼭지점 드래그로 수정
                            </p>
                        ) : (
                            <button
                                onClick={() => deleteSelectedFn?.()}
                                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors">
                                <Trash size={12} />
                                {selectedCount}개 삭제
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* ── 스타일 (그리기 모드일 때만) ── */}
            {inDraw && activeDef && (
                <>
                    <div className="mx-2.5 h-px bg-gray-100" />
                    <div className="p-2.5 space-y-2.5">

                        {/* 색상 */}
                        <div>
                            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">색상</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {PRESET_COLORS.map(c => (
                                    <button key={c} onClick={() => setDrawStyle({ color: c })}
                                        className="w-5 h-5 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                                        style={{
                                            backgroundColor: c,
                                            outline: drawStyle.color === c ? '2px solid #F26722' : '2px solid transparent',
                                            outlineOffset: '1px',
                                            border: c === '#ffffff' ? '1px solid #e2e8f0' : 'none',
                                        }} />
                                ))}
                                <label className="w-5 h-5 rounded-full overflow-hidden cursor-pointer flex-shrink-0 border border-gray-200"
                                    title="직접 선택" style={{ backgroundColor: drawStyle.color }}>
                                    <input type="color" value={drawStyle.color}
                                        onChange={e => setDrawStyle({ color: e.target.value })}
                                        className="opacity-0 w-0 h-0" />
                                </label>
                            </div>
                        </div>

                        {/* 선 두께 (텍스트 제외) */}
                        {activeDef.id !== 'draw-text' && (
                            <div>
                                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">선 두께</p>
                                <div className="flex gap-1">
                                    {STROKE_WIDTHS.map(w => (
                                        <button key={w} onClick={() => setDrawStyle({ strokeWidth: w })}
                                            className={`flex-1 h-7 rounded-md text-xs font-medium transition-colors ${
                                                drawStyle.strokeWidth === w
                                                    ? 'bg-[#F26722] text-white'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}>
                                            {w}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 채우기 (폴리곤/원/직사각형) */}
                        {activeDef.hasFill && (
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest">채우기</p>
                                    <span className="text-[10px] text-gray-500 tabular-nums">{drawStyle.fillOpacity}%</span>
                                </div>
                                <input type="range" min={0} max={100} value={drawStyle.fillOpacity}
                                    onChange={e => setDrawStyle({ fillOpacity: +e.target.value })}
                                    className="w-full accent-[#F26722] h-1.5" />
                            </div>
                        )}

                        {/* 포인트 크기 */}
                        {activeDef.hasSize && (
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest">크기</p>
                                    <span className="text-[10px] text-gray-500 tabular-nums">{drawStyle.pointSize}px</span>
                                </div>
                                <input type="range" min={4} max={20} value={drawStyle.pointSize}
                                    onChange={e => setDrawStyle({ pointSize: +e.target.value })}
                                    className="w-full accent-[#F26722] h-1.5" />
                            </div>
                        )}

                        {/* 폰트 크기 */}
                        {activeDef.hasFontSize && (
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest">폰트 크기</p>
                                    <span className="text-[10px] text-gray-500 tabular-nums">{drawStyle.fontSize}px</span>
                                </div>
                                <input type="range" min={10} max={24} value={drawStyle.fontSize}
                                    onChange={e => setDrawStyle({ fontSize: +e.target.value })}
                                    className="w-full accent-[#F26722] h-1.5" />
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function MapToolbar({ map }: { map: Map | null }) {
    const { activeTool, setActiveTool, clearAll } = useMapStore()
    const [drawOpen, setDrawOpen] = useState(false)
    const panelRef = useRef<HTMLDivElement>(null)

    const isAnyDraw = isDrawMode(activeTool) || isSelectMode(activeTool)

    function zoom(delta: number) {
        if (!map) return
        const v = map.getView()
        v.animate({ zoom: (v.getZoom() ?? 10) + delta, duration: 200 })
    }

    return (
        <div className="absolute top-4 right-3 z-10 flex flex-col gap-2 select-none">

            {/* ── 줌 ── */}
            <div className="flex flex-col rounded-md overflow-hidden" style={SHADOW}>
                <Tip label="확대"><TBtn onClick={() => zoom(1)} cls="rounded-t-md border-b border-gray-100"><Plus size={16} /></TBtn></Tip>
                <Tip label="축소"><TBtn onClick={() => zoom(-1)} cls="rounded-b-md"><Minus size={16} /></TBtn></Tip>
            </div>

            {/* ── 도구 (그리기 + 측정) ── overflow-hidden 없이 bg+rounded만 → 패널이 잘리지 않음 */}
            <div ref={panelRef} className="relative flex flex-col bg-white rounded-md" style={SHADOW}>
                <Tip label={drawOpen ? '' : '그리기'}>
                    <TBtn active={isAnyDraw || drawOpen} onClick={() => setDrawOpen(p => !p)} cls="rounded-t-md border-b border-gray-100">
                        <PenLine size={15} />
                    </TBtn>
                </Tip>
                <Tip label="거리측정">
                    <TBtn active={activeTool === 'measure-distance'} onClick={() => setActiveTool('measure-distance')} cls="border-b border-gray-100">
                        <Ruler size={15} />
                    </TBtn>
                </Tip>
                <Tip label="면적측정">
                    <TBtn active={activeTool === 'measure-area'} onClick={() => setActiveTool('measure-area')} cls="border-b border-gray-100">
                        <SquareDashed size={15} />
                    </TBtn>
                </Tip>
                <Tip label="반경검색">
                    <TBtn active={activeTool === 'radius-search'} onClick={() => setActiveTool('radius-search')} cls="rounded-b-md">
                        <CircleDot size={15} />
                    </TBtn>
                </Tip>
                {drawOpen && (
                    <div className="absolute right-11 top-0 z-50">
                        <DrawPanel />
                    </div>
                )}
            </div>

            {/* ── 초기화 ── */}
            <div className="flex flex-col rounded-md overflow-hidden" style={SHADOW}>
                <Tip label="전체 초기화">
                    <button onClick={clearAll}
                        className="w-9 h-9 flex items-center justify-center bg-white text-gray-400 hover:bg-red-50 hover:text-red-400 transition-colors rounded-md cursor-pointer">
                        <Trash2 size={15} />
                    </button>
                </Tip>
            </div>
        </div>
    )
}
