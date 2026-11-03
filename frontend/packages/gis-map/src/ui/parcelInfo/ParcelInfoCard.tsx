'use client'

// 필지 정보 카드(도구 모음 왼쪽에 붙는 떠 있는 카드 — 출력·영역 분석 패널과 같은 자리, 모바일은 아래 시트). "필지 정보" 도구가 켜진 동안
// 필지를 누르면 열린다. 모든 상태는 엔진(map.parcelInfo.store)이 원본이고 이 카드는 그리기만 한다. × = 카드·강조를 지움(도구는 켜진 채),
// 접기 = 머리줄 + 한 줄 요약만. 건물 전체 보기 대화상자는 지도 루트(gm-root)로 portal.
// 스타일: gm-parcel-card*
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Building2, Check, ChevronDown, ChevronUp, Copy, Info, LandPlot, List, Loader2, Lock, RotateCw, X } from 'lucide-react'
import { INITIAL_PARCEL_INFO_STATE } from '../../core'
import type { ParcelInfoState } from '../../core'
import { useGisMap, useStoreValue } from '../../react'
import { cx } from '../cx'
import ParcelBuildingsDialog from './ParcelBuildingsDialog'
import {
    AREA_NOTE, BUILDINGS_STATE_TEXT, NO_BUILDING_TEXT, NO_PARCEL_TEXT, PARCEL_TITLE, buildingCountText, dongLine, footText, formatParcelArea,
    formatPrice, formatPriceDate, groupMeta, jimokText, shortAddress, splitGroups, summaryLine,
} from './parcelInfoModel'

const selectState = (s: ParcelInfoState): ParcelInfoState => s

/** 모달을 그릴 곳: 지도 요소가 속한 gm-root(스타일 변수·CSS가 걸린 가장 바깥), 없으면 지도 요소 자신 */
function portalRoot(target: HTMLElement | string | null): HTMLElement {
    const el = typeof target === 'string' || target === null ? null : target
    return (el && (el.closest('.gm-root') as HTMLElement | null)) || el || document.body
}

export default function ParcelInfoCard() {
    const gis = useGisMap()
    const ctrl = gis ? gis.parcelInfo : null
    const state = useStoreValue(ctrl?.store, selectState, INITIAL_PARCEL_INFO_STATE)
    const [collapsed, setCollapsed] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [copied, setCopied] = useState(false)
    const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const pnu = state.parcel.info?.pnu ?? null
    // 다른 필지로 바뀌면 대화상자를 닫고 접힘을 푼다
    useEffect(() => {
        setDialogOpen(false)
        setCollapsed(false)
    }, [pnu])
    // 대화상자가 열리면 잘린 목록을 전체(1000건)로 다시 받는다
    useEffect(() => {
        if (dialogOpen && ctrl) void ctrl.loadAllBuildings()
    }, [dialogOpen, ctrl])
    useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])

    if (!state.open || !ctrl) return null

    const { parcel, buildings } = state
    const info = parcel.info
    const result = buildings.result

    const copyPnu = (): void => {
        if (!info || typeof navigator === 'undefined' || !navigator.clipboard) return
        navigator.clipboard.writeText(info.pnu).then(() => {
            setCopied(true)
            if (copyTimer.current) clearTimeout(copyTimer.current)
            copyTimer.current = setTimeout(() => setCopied(false), 1500)
        }, () => undefined)
    }

    const jimok = info ? jimokText(info.jimok) : null
    const area = formatParcelArea(parcel.areaM2)
    const price = info ? formatPrice(info.officialPrice) : null
    const priceDate = info ? formatPriceDate(info.priceYear, info.priceMonth) : null
    const split = result ? splitGroups(result.addresses) : null

    return (
        <div className={cx('gm-parcel-card', collapsed && 'gm-is-collapsed')} role="dialog" aria-label={PARCEL_TITLE}>
            <div className="gm-parcel-card__head">
                <span className="gm-parcel-card__title"><LandPlot size={14} />{PARCEL_TITLE}</span>
                <span className="gm-parcel-card__head-actions">
                    <button type="button" onClick={() => setCollapsed(c => !c)} className="gm-parcel-card__icon-btn"
                        aria-label={collapsed ? '펼치기' : '접기'} aria-expanded={!collapsed} title={collapsed ? '펼치기' : '접어서 지도 보기'}>
                        {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </button>
                    <button type="button" onClick={() => ctrl.close()} className="gm-parcel-card__icon-btn" aria-label="닫기" title="카드와 강조 지우기"><X size={16} /></button>
                </span>
            </div>

            {collapsed && <div className="gm-parcel-card__summary">{summaryLine(state)}</div>}

            <div className="gm-parcel-card__body" hidden={collapsed}>
                {/* ── 필지 ── */}
                {parcel.status === 'loading' && (
                    <div className="gm-parcel-card__state" role="status">
                        <Loader2 size={14} className="gm-loader" />
                        <span>필지 정보를 불러오는 중…</span>
                    </div>
                )}
                {parcel.status === 'none' && (
                    <div className="gm-parcel-card__state gm-parcel-card__state--empty" role="status">
                        <Info size={14} />
                        <span>{NO_PARCEL_TEXT}</span>
                    </div>
                )}
                {parcel.status === 'error' && (
                    <div className="gm-parcel-card__state gm-parcel-card__state--error" role="alert">
                        <AlertTriangle size={14} />
                        <span>
                            {parcel.error ?? '필지 정보를 불러오지 못했습니다.'}
                            <button type="button" className="gm-parcel-card__link" onClick={() => void ctrl.retry()}><RotateCw size={11} />다시 시도</button>
                        </span>
                    </div>
                )}
                {parcel.status === 'ready' && info && (
                    <div className="gm-parcel-card__sec">
                        <div className="gm-parcel-card__addr">{info.address ?? shortAddress(info)}</div>
                        <dl className="gm-parcel-card__kv">
                            <dt>PNU</dt>
                            <dd>
                                <span className="gm-parcel-card__mono">{info.pnu}</span>
                                <button type="button" className="gm-parcel-card__icon-btn gm-parcel-card__copy" onClick={copyPnu}
                                    aria-label="PNU 복사" title={copied ? '복사했습니다' : 'PNU 복사'}>
                                    {copied ? <Check size={12} /> : <Copy size={12} />}
                                </button>
                            </dd>
                            <dt>지목</dt>
                            <dd>
                                {jimok ? (
                                    <>
                                        <span className="gm-parcel-card__chip">{jimok.abbr}</span>
                                        <span>{jimok.name}</span>
                                    </>
                                ) : <span className="gm-parcel-card__muted">—</span>}
                                {info.mountain && <span className="gm-parcel-card__badge gm-parcel-card__badge--sub">산</span>}
                            </dd>
                            <dt>면적</dt>
                            <dd>
                                {area ? <span>{area}</span> : <span className="gm-parcel-card__muted">—</span>}
                                {area && <span className="gm-parcel-card__note">{AREA_NOTE}</span>}
                            </dd>
                            <dt>공시지가</dt>
                            <dd>
                                {price ? <span>{price}</span> : <span className="gm-parcel-card__muted">—</span>}
                                {price && priceDate && <span className="gm-parcel-card__note">{priceDate}</span>}
                            </dd>
                        </dl>
                    </div>
                )}

                {/* ── 건물 ── */}
                {parcel.status === 'ready' && buildings.status === 'loading' && (
                    <div className="gm-parcel-card__state" role="status">
                        <Loader2 size={14} className="gm-loader" />
                        <span>건물 정보를 불러오는 중…</span>
                    </div>
                )}
                {parcel.status === 'ready' && (buildings.status === 'unavailable' || buildings.status === 'unauthorized' || buildings.status === 'error') && (
                    <div className={cx('gm-parcel-card__state', buildings.status === 'unavailable' ? 'gm-parcel-card__state--warn' : 'gm-parcel-card__state--error')} role="alert">
                        {buildings.status === 'unauthorized' ? <Lock size={14} /> : <AlertTriangle size={14} />}
                        <span>
                            {buildings.status === 'error' && buildings.error ? buildings.error : BUILDINGS_STATE_TEXT[buildings.status]}
                            <button type="button" className="gm-parcel-card__link" onClick={() => void ctrl.retry()}><RotateCw size={11} />다시 시도</button>
                        </span>
                    </div>
                )}
                {parcel.status === 'ready' && buildings.status === 'ready' && result && split && (
                    <div className="gm-parcel-card__sec">
                        <div className="gm-parcel-card__sec-head">
                            <span className="gm-parcel-card__sec-title"><Building2 size={13} />{buildingCountText(result)}</span>
                            {result.addresses.length > 0 && <em>주소 {result.addresses.length}곳</em>}
                        </div>
                        {result.addresses.length === 0 ? (
                            <div className="gm-parcel-card__state gm-parcel-card__state--empty" role="status">
                                <Info size={14} />
                                <span>{NO_BUILDING_TEXT}{result.referenceVersion ? ` (${footText(result)})` : ''}</span>
                            </div>
                        ) : (
                            <div className="gm-parcel-card__groups">
                                {split.shown.map((g, i) => {
                                    const dongs = dongLine(g)
                                    return (
                                        <div key={g.roadAddress + '|' + i} className="gm-parcel-card__group">
                                            <div className="gm-parcel-card__road">{g.roadAddress}</div>
                                            <div className="gm-parcel-card__name">
                                                <span>{g.name ?? '이름 없음'}</span>
                                                {g.apartment && <span className="gm-parcel-card__badge gm-parcel-card__badge--apt">공동주택</span>}
                                                {g.underground && <span className="gm-parcel-card__badge gm-parcel-card__badge--sub">지하</span>}
                                                {g.relation === 'RELATED' && <span className="gm-parcel-card__badge gm-parcel-card__badge--rel">관련지번</span>}
                                            </div>
                                            {dongs && <div className="gm-parcel-card__dongs">{dongs}</div>}
                                            <div className="gm-parcel-card__meta">{groupMeta(g)}</div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        {result.addresses.length > 0 && (
                            <button type="button" className="gm-parcel-card__more" onClick={() => setDialogOpen(true)}>
                                <List size={12} />
                                {split.hidden > 0 ? `외 ${split.hidden}개 주소 — 전체 보기` : `건물 ${result.buildingCount}동 전체 보기`}
                            </button>
                        )}
                    </div>
                )}

                {parcel.status === 'ready' && (
                    <div className="gm-parcel-card__foot">
                        <Info size={12} />
                        <span>{buildings.status === 'ready' || buildings.status === 'off' || buildings.status === 'unsupported' ? footText(result) + ' · ' : ''}필지 속성·경계는 연속지적도 기준</span>
                    </div>
                )}
            </div>

            {/* 전체 보기 모달은 지도 루트(gm-root)로 옮겨 그린다 — 도구 모음(z-index 10)의 쌓임 맥락 안이면 모달(1000)이 왼쪽 패널 뒤로 깔린다 */}
            {dialogOpen && result && createPortal(
                <ParcelBuildingsDialog result={result} loadingAll={buildings.loadingAll} error={buildings.error}
                    onRetry={() => void ctrl.loadAllBuildings()} onClose={() => setDialogOpen(false)} />,
                portalRoot(gis ? gis.olMap.getTargetElement() : null),
            )}
        </div>
    )
}
