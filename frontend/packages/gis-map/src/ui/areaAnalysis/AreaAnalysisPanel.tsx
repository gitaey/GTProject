'use client'

// 영역 분석 패널(떠 있는 비모달 카드 — 지도는 계속 움직인다). 영역(다각형·사각형·원·현재 화면) → 분석할 레이어(GeoServer·VWorld) → 선택 기준 → 분석 → (사전 확인) → 결과 카드.
// 모든 상태는 엔진(map.areaAnalysis.store)이 원본이고 이 패널은 그리기만 한다. 패널이 열려 있는 동안만 지도 클릭(강조 피처 가리키기)을 듣고,
// 닫히면(× · 다른 도구 패널이 열려 밀려남 · 언마운트) 영역·결과·강조를 지운다. 접기 단추는 헤더만 남겨 지도를 가리지 않는다(그리는 중에도 됨).
// 스타일: gm-analysis*
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, ChartPie, ChevronDown, ChevronUp, Monitor, Pentagon, Play, Circle, Square, X } from 'lucide-react'
import { INITIAL_AREA_ANALYSIS_STATE, areaRefKey, areaSameRef, saveBlob } from '../../core'
import type { AreaAnalysisLayerRef, AreaAnalysisState, AreaDrawShape } from '../../core'
import { useGisMap, useStoreValue } from '../../react'
import { cx } from '../cx'
import LayerPickList from './LayerPickList'
import LayerResultCard from './LayerResultCard'
import ResultListDialog from './ResultListDialog'
import {
    ANALYSIS_TITLE, DRAW_HELP, MODE_CHOICES, NO_AREA_NOTE, NO_PICK_NOTE, SHAPE_CHOICES, confirmLines, exportFileName, formatAreaText, shapeLabel,
} from './areaAnalysisModel'

export interface AreaAnalysisPanelProps {
    onClose: () => void
}

const selectState = (s: AreaAnalysisState): AreaAnalysisState => s

const SHAPE_ICON = { polygon: Pentagon, box: Square, circle: Circle, extent: Monitor } as const

/** 모달을 그릴 곳: 지도 요소가 속한 gm-root(스타일 변수·CSS가 걸린 가장 바깥), 없으면 지도 요소 자신 */
function portalRoot(target: HTMLElement | string | null): HTMLElement {
    const el = typeof target === 'string' || target === null ? null : target
    return (el && (el.closest('.gm-root') as HTMLElement | null)) || el || document.body
}

export default function AreaAnalysisPanel({ onClose }: AreaAnalysisPanelProps) {
    const gis = useGisMap()
    const analysis = gis ? gis.areaAnalysis : null
    const state = useStoreValue(analysis?.store, selectState, INITIAL_AREA_ANALYSIS_STATE)
    const [collapsed, setCollapsed] = useState(false)
    const [listTarget, setListTarget] = useState<AreaAnalysisLayerRef | null>(null)
    const [error, setError] = useState<string | null>(null)

    // 패널이 열려 있는 동안: 레이어 이름 다시 읽기 + 지도 클릭으로 강조 피처 가리키기. 닫히면 영역·결과·강조를 지운다
    useEffect(() => {
        if (!analysis) return
        analysis.refreshLayers()
        const offPick = analysis.enableMapPick()
        return () => {
            offPick()
            analysis.clear()
        }
    }, [analysis])

    const confirming = state.status === 'confirm'
    const running = state.status === 'running' || confirming
    const drawing = state.drawing
    const hasPick = state.picked.length > 0
    const canRun = !!analysis && !!state.area && hasPick && !running && drawing === null

    const pickShape = (key: AreaDrawShape | 'extent'): void => {
        if (!analysis) return
        setError(null)
        if (key === 'extent') analysis.useViewExtent()
        else if (drawing === key) analysis.stopDrawing()
        else analysis.startDrawing(key)
    }

    const run = (): void => {
        if (!analysis) return
        setError(null)
        analysis.run().catch((e: unknown) => setError(e instanceof Error ? e.message : '분석하지 못했습니다.'))
    }

    const exportAs = (ref: AreaAnalysisLayerRef, name: string, format: 'csv' | 'geojson'): void => {
        if (!analysis) return
        try {
            saveBlob(analysis.exportResult(ref, format), exportFileName(name, format, new Date()))
        } catch (e) {
            setError(e instanceof Error ? e.message : '내보내지 못했습니다.')
        }
    }

    // 열려 있는 결과 목록: 결과가 사라지거나(새 분석·영역 변경) 끝난 결과가 아니면 닫는다
    const listResult = listTarget ? state.results.find(r => areaSameRef(r.ref, listTarget) && (r.status === 'done' || r.status === 'partial')) ?? null : null
    const listRecords = useMemo(() => (analysis && listResult ? analysis.resultRecords(listResult.ref) : []), [analysis, listResult])

    const active = drawing ?? state.area?.shape ?? null
    const note = drawing ? DRAW_HELP[drawing] : !state.area ? NO_AREA_NOTE : !hasPick ? NO_PICK_NOTE : null

    return (
        <div className={cx('gm-analysis', collapsed && 'gm-is-collapsed')} role="dialog" aria-label={ANALYSIS_TITLE}>
            <div className="gm-analysis__head">
                <span className="gm-analysis__title"><ChartPie size={14} />{ANALYSIS_TITLE}</span>
                <span className="gm-analysis__head-actions">
                    <button type="button" onClick={() => setCollapsed(c => !c)} className="gm-analysis__icon-btn"
                        aria-label={collapsed ? '펼치기' : '접기'} aria-expanded={!collapsed} title={collapsed ? '펼치기' : '접어서 지도 보기'}>
                        {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </button>
                    <button type="button" onClick={onClose} className="gm-analysis__icon-btn" aria-label="닫기"><X size={16} /></button>
                </span>
            </div>

            <div className="gm-analysis__body" hidden={collapsed}>
                <div>
                    <div className="gm-analysis__sec">1. 영역</div>
                    <div className="gm-analysis__shapes" role="group" aria-label="영역 종류">
                        {SHAPE_CHOICES.map(c => {
                            const Icon = SHAPE_ICON[c.key]
                            return (
                                <button key={c.key} type="button" className={cx('gm-analysis__shape', active === c.key && 'gm-is-active')}
                                    aria-pressed={active === c.key} disabled={running} onClick={() => pickShape(c.key)}>
                                    <Icon size={15} />{c.label}
                                </button>
                            )
                        })}
                    </div>
                    {state.area && !drawing ? (
                        <div className="gm-analysis__areainfo">
                            <span>영역 넓이 <b>{formatAreaText(state.area.areaM2)}</b></span>
                            <span>{shapeLabel(state.area.shape)} · 꼭짓점 {state.area.vertices}</span>
                        </div>
                    ) : null}
                    {state.areaError && <div className="gm-analysis__error" role="alert">{state.areaError}</div>}
                    {note && <p className="gm-analysis__note">{note}</p>}
                </div>

                <div>
                    <div className="gm-analysis__sec">
                        2. 분석할 레이어 <em>{state.picked.length}개 선택</em>
                    </div>
                    <LayerPickList layers={state.layers} picked={state.picked} disabled={running}
                        onChange={refs => analysis?.setPicked(refs)} />
                </div>

                <div>
                    <div className="gm-analysis__sec">3. 선택 기준</div>
                    <div className="gm-analysis__seg" role="radiogroup" aria-label="선택 기준">
                        {MODE_CHOICES.map(c => (
                            <button key={c.key} type="button" role="radio" aria-checked={state.mode === c.key} title={c.hint}
                                className={cx('gm-analysis__seg-btn', state.mode === c.key && 'gm-is-active')}
                                disabled={running} onClick={() => analysis?.setMode(c.key)}>
                                {c.label}
                            </button>
                        ))}
                    </div>
                    <p className="gm-analysis__fine">{MODE_CHOICES.find(c => c.key === state.mode)?.hint}</p>
                </div>

                {running ? (
                    <button type="button" className="gm-analysis__btn" onClick={() => analysis?.cancel()}>
                        <Square size={13} />분석 멈추기
                    </button>
                ) : (
                    <button type="button" className="gm-analysis__btn gm-analysis__btn--primary" disabled={!canRun} onClick={run}>
                        <Play size={13} />분석
                    </button>
                )}
                {state.confirm && (
                    <div className="gm-analysis__confirm" role="alertdialog" aria-label="계속할지 확인">
                        <div className="gm-analysis__confirm-title"><AlertTriangle size={13} />계속할까요?</div>
                        {confirmLines(state.confirm).map(line => <p key={line} className="gm-analysis__confirm-line">{line}</p>)}
                        <div className="gm-analysis__confirm-actions">
                            <button type="button" className="gm-analysis__btn gm-analysis__btn--sm gm-analysis__btn--primary" onClick={() => analysis?.answerConfirm('limit')}>
                                {state.confirm.items.length > 0 ? '상한까지만 분석' : '계속'}
                            </button>
                            {state.confirm.items.length > 0 && (
                                <button type="button" className="gm-analysis__btn gm-analysis__btn--sm" onClick={() => analysis?.answerConfirm('skip-over')}>넘는 레이어 빼기</button>
                            )}
                            <button type="button" className="gm-analysis__btn gm-analysis__btn--sm" onClick={() => analysis?.answerConfirm('cancel')}>취소</button>
                        </div>
                    </div>
                )}
                {error && <div className="gm-analysis__error" role="alert">{error}</div>}

                {state.results.map(r => (
                    <LayerResultCard key={areaRefKey(r.ref)} result={r}
                        onList={r.status === 'done' || r.status === 'partial' ? () => setListTarget(r.ref) : undefined}
                        onCategory={column => analysis?.setCategory(r.ref, column)}
                        onExport={format => exportAs(r.ref, r.name, format)} />
                ))}
            </div>

            {/* 결과 목록 모달은 지도 루트(gm-root)로 옮겨 그린다 — 도구 모음(z-index 10)의 쌓임 맥락 안이면 모달(1000)이 왼쪽 패널 뒤로 깔린다 */}
            {listResult && analysis && createPortal(
                <ResultListDialog key={areaRefKey(listResult.ref)} result={listResult} records={listRecords}
                    activeIndex={state.active && areaSameRef(state.active.ref, listResult.ref) ? state.active.index : null}
                    onPick={index => analysis.setActive(listResult.ref, index, { fit: true })}
                    onClose={() => setListTarget(null)} />,
                portalRoot(gis ? gis.olMap.getTargetElement() : null),
            )}
        </div>
    )
}
