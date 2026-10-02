'use client'

// 그리기 패널(도형 선택·선택/편집 모드·색/두께/채우기/크기) — 툴바의 그리기 버튼이 연다 (스타일: gm-tool-panel, gm-draw-panel)
// FE-5b-2: 옛 MapToolbar.tsx 안의 DrawPanel을 떼어 냈다(본문 그대로)
import {
    MapPin, Minus as LineIco, Pentagon, Circle, Square, Type,
    MousePointer2, Trash, PenSquare,
} from 'lucide-react'
import { useMemo } from 'react'
import { useGisMap, useStoreValue } from '../../react'
import { DEFAULT_DRAW_STYLE, DEFAULT_THEME } from '../../core'
import type { DrawState, DrawStyle, MapTool } from '../../core'
import { cx } from '../cx'
import { isDrawMode, isSelectMode, useActiveTool } from './activeTool'

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

// 색 견본: 첫 칸은 테마 주 색(엔진 theme.primary — 기본 브랜드 오렌지, 그리기 기본색과 같다), 나머지는 고정
const PRESET_COLORS_REST: readonly string[] = Object.freeze([
    '#ef4444', // 빨강
    '#3b82f6', // 파랑
    '#22c55e', // 초록
    '#a855f7', // 보라
    '#eab308', // 노랑
    '#1f2937', // 검정
    '#ffffff', // 흰색
])

const STROKE_WIDTHS = [1, 2, 3, 5]

// ── 엔진 스토어 연결 ──────────────────────────────────────────────────────────

const selectDrawStyle = (s: DrawState): DrawStyle => s.style
const selectSelectedCount = (s: DrawState): number => s.selectedCount

// ── 그리기 패널 ───────────────────────────────────────────────────────────────

export default function DrawPanel() {
    const gis = useGisMap()
    const [activeTool, setActiveTool] = useActiveTool()
    const drawStyle = useStoreValue(gis?.draw.store, selectDrawStyle, DEFAULT_DRAW_STYLE)
    const selectedCount = useStoreValue(gis?.draw.store, selectSelectedCount, 0)
    const setDrawStyle = (patch: Partial<DrawStyle>) => gis?.draw.setStyle(patch)
    const primary = gis ? gis.theme.primary : DEFAULT_THEME.primary
    const presetColors = useMemo(
        () => [primary, ...PRESET_COLORS_REST.filter(c => c.toLowerCase() !== primary.toLowerCase())],
        [primary],
    )

    const inDraw   = isDrawMode(activeTool)
    const inSelect = isSelectMode(activeTool)
    const activeDef = DRAW_TOOLS.find(t => t.id === activeTool)

    function enterSelect() { setActiveTool('select') }
    function enterEdit() { setActiveTool('edit') }

    return (
        <div className="gm-tool-panel gm-draw-panel">

            {/* ── 도형 선택 ── */}
            <div className="gm-draw-panel__shapes">
                <p className="gm-tool-panel__label gm-tool-panel__label--head">도형</p>
                <div className="gm-draw-panel__shape-grid">
                    {DRAW_TOOLS.map(t => (
                        <button key={t.id} title={t.label}
                            onClick={() => setActiveTool(t.id)}
                            className={cx('gm-draw-panel__shape', activeTool === t.id && 'gm-is-active')}>
                            {t.icon}
                        </button>
                    ))}
                </div>
                {/* 선택된 도형 이름 */}
                <p className="gm-draw-panel__hint">
                    {activeDef ? `${activeDef.label} 그리기 · 우클릭으로 완료` : '도형을 선택하세요'}
                </p>
            </div>

            {/* ── 구분선 ── */}
            <div className="gm-draw-panel__divider gm-draw-panel__divider--spaced" />

            {/* ── 선택 / 편집 모드 ── */}
            <div className="gm-draw-panel__modes">
                <div className="gm-draw-panel__mode-grid">
                    <button
                        onClick={enterSelect}
                        className={cx('gm-draw-panel__mode', activeTool === 'select' && 'gm-is-active')}>
                        <MousePointer2 size={13} />
                        <span>선택</span>
                    </button>
                    <button
                        onClick={enterEdit}
                        className={cx('gm-draw-panel__mode', activeTool === 'edit' && 'gm-is-active')}>
                        <PenSquare size={13} />
                        <span>편집</span>
                    </button>
                </div>

                {inSelect && selectedCount > 0 && (
                    <span className="gm-draw-panel__count">
                        {selectedCount}개 선택됨
                    </span>
                )}

                {/* 선택/편집 모드 안내 */}
                {inSelect && (
                    <div className="gm-draw-panel__select-info">
                        {selectedCount === 0 ? (
                            <p className="gm-draw-panel__select-hint">
                                {activeTool === 'edit'
                                    ? '도형을 클릭해 선택 · 꼭지점 드래그로 수정'
                                    : '클릭해서 선택 · Shift+클릭으로 여러 개 선택'}
                            </p>
                        ) : (
                            <button
                                onClick={() => gis?.draw.deleteSelected()}
                                className="gm-draw-panel__delete">
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
                    <div className="gm-draw-panel__divider" />
                    <div className="gm-draw-panel__style">

                        {/* 색상 */}
                        <div>
                            <p className="gm-tool-panel__label gm-tool-panel__label--spaced">색상</p>
                            <div className="gm-draw-panel__swatches">
                                {presetColors.map(c => (
                                    <button key={c} onClick={() => setDrawStyle({ color: c })}
                                        className="gm-draw-panel__swatch"
                                        style={{
                                            backgroundColor: c,
                                            outline: drawStyle.color === c ? '2px solid var(--gm-primary)' : '2px solid transparent',
                                            border: c === '#ffffff' ? '1px solid #e2e8f0' : 'none',
                                        }} />
                                ))}
                                <label className="gm-draw-panel__custom-color"
                                    title="직접 선택" style={{ backgroundColor: drawStyle.color }}>
                                    <input type="color" value={drawStyle.color}
                                        onChange={e => setDrawStyle({ color: e.target.value })}
                                        className="gm-draw-panel__color-input" />
                                </label>
                            </div>
                        </div>

                        {/* 선 두께 (텍스트 제외) */}
                        {activeDef.id !== 'draw-text' && (
                            <div>
                                <p className="gm-tool-panel__label gm-tool-panel__label--spaced">선 두께</p>
                                <div className="gm-draw-panel__widths">
                                    {STROKE_WIDTHS.map(w => (
                                        <button key={w} onClick={() => setDrawStyle({ strokeWidth: w })}
                                            className={cx('gm-draw-panel__width', drawStyle.strokeWidth === w && 'gm-is-active')}>
                                            {w}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 채우기 (폴리곤/원/직사각형) */}
                        {activeDef.hasFill && (
                            <div>
                                <div className="gm-draw-panel__range-head">
                                    <p className="gm-tool-panel__label">채우기</p>
                                    <span className="gm-draw-panel__range-value">{drawStyle.fillOpacity}%</span>
                                </div>
                                <input type="range" min={0} max={100} value={drawStyle.fillOpacity}
                                    onChange={e => setDrawStyle({ fillOpacity: +e.target.value })}
                                    className="gm-draw-panel__range" />
                            </div>
                        )}

                        {/* 포인트 크기 */}
                        {activeDef.hasSize && (
                            <div>
                                <div className="gm-draw-panel__range-head">
                                    <p className="gm-tool-panel__label">크기</p>
                                    <span className="gm-draw-panel__range-value">{drawStyle.pointSize}px</span>
                                </div>
                                <input type="range" min={4} max={20} value={drawStyle.pointSize}
                                    onChange={e => setDrawStyle({ pointSize: +e.target.value })}
                                    className="gm-draw-panel__range" />
                            </div>
                        )}

                        {/* 폰트 크기 */}
                        {activeDef.hasFontSize && (
                            <div>
                                <div className="gm-draw-panel__range-head">
                                    <p className="gm-tool-panel__label">폰트 크기</p>
                                    <span className="gm-draw-panel__range-value">{drawStyle.fontSize}px</span>
                                </div>
                                <input type="range" min={10} max={24} value={drawStyle.fontSize}
                                    onChange={e => setDrawStyle({ fontSize: +e.target.value })}
                                    className="gm-draw-panel__range" />
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
