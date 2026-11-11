'use client'

// 나만의지도 패널의 목록 한 행 — 스타일: gm-mymap-panel__row 계열.
// 구조: [표시 체크 32px] [색 견본 · 이름(2줄) / 정보 줄 / 상태·단추 줄 / 진행 막대] [위치 이동] [⋯].
// 이름도 체크의 라벨이라 이름을 눌러도 지도 표시가 바뀐다. 선택 모드(일괄 공유)에서는 같은 자리가 둥근 선택 표시로 바뀌고 행 전체가 선택 대상이다.
// 실패 개수·사유는 그리지 않는다(처리 실패 = "등록하지 못했습니다" + 지우기, 표시할 위치 없음 = 중립 한 줄). 판단은 listModel.rowView가 한다.
import { useId } from 'react'
import { Check, CircleOff, Layers, Loader2, Locate, Trash2, Users, XCircle } from 'lucide-react'
import type { UserMapListItem } from '../../core'
import { cx } from '../cx'
import MyMapItemMenu from './MyMapItemMenu'
import type { ItemMenuEntry } from './MyMapItemMenu'
import { formatCount } from './format'
import type { RowView, Swatch } from './listModel'

interface MyMapListRowProps {
    item: UserMapListItem
    view: RowView
    swatch: Swatch
    /** 지도에 켜져 있는가 */
    active: boolean
    /** 선택 모드 중인가(이 행이 고를 수 있는지는 view.pickable) */
    selecting: boolean
    /** 선택 모드에서 골라져 있는가 */
    picked: boolean
    /** 지도에 그리는 중 진행률(0~100) — 막대용, 모르면 null */
    mapLoadPct: number | null
    menuEntries: readonly ItemMenuEntry[]
    menuOpen: boolean
    onMenuOpenChange: (open: boolean) => void
    onToggle: () => void
    onLocate: () => void
    onPick: () => void
    onDelete: () => void
}

const CLUSTER_HINT = '화면 안 피처가 많아 원과 숫자로 묶어 보여 줍니다. 확대하거나 원을 누르면 원래 모양이 보입니다'

const SWATCH_CLASS: Readonly<Record<Swatch['shape'], string>> = Object.freeze({
    square: 'gm-mymap-panel__swatch--square', circle: 'gm-mymap-panel__swatch--circle', line: 'gm-mymap-panel__swatch--line',
})

function Dot() {
    return <span className="gm-mymap-panel__dot" aria-hidden="true" />
}

export default function MyMapListRow({
    item, view, swatch, active, selecting, picked, mapLoadPct, menuEntries, menuOpen, onMenuOpenChange,
    onToggle, onLocate, onPick, onDelete,
}: MyMapListRowProps) {
    const checkId = useId()
    const pickable = view.pickable
    const toggleOn = !selecting && view.canToggle
    const swatchFill = swatch.colors.length === 0
        ? 'var(--gm-primary)'
        : swatch.colors.length === 1
            ? swatch.colors[0]
            : `linear-gradient(90deg, ${swatch.colors.map((c, i, a) => `${c} ${Math.round((i / a.length) * 100)}% ${Math.round(((i + 1) / a.length) * 100)}%`).join(', ')})`

    return (
        <div className={cx('gm-mymap-panel__row', toggleOn && active && 'gm-is-on', pickable && 'gm-is-pickable', picked && 'gm-is-picked', view.dim && 'gm-is-dim')}
            onClick={pickable ? e => {
                // 체크 상자를 직접 누른 클릭은 onChange가 처리한다(두 번 바뀌지 않게)
                if ((e?.target as { tagName?: string } | null | undefined)?.tagName !== 'INPUT') onPick()
            } : undefined}>
            {pickable ? (
                <div className="gm-mymap-panel__hit">
                    <input type="checkbox" id={checkId} checked={picked} onChange={onPick} aria-label={`${item.name} 선택`}
                        className="gm-mymap-panel__pick-input" />
                    <span className="gm-mymap-panel__pick" aria-hidden="true"><Check size={11} strokeWidth={3} /></span>
                </div>
            ) : (
                <label className={cx('gm-mymap-panel__hit', toggleOn && 'gm-is-clickable')} title={!view.canToggle && view.toggleHint ? view.toggleHint : undefined}>
                    <input type="checkbox" id={checkId} checked={active && view.canToggle} disabled={!view.canToggle || selecting}
                        onChange={onToggle} aria-label={`${item.name} 지도에 표시`} className="gm-mymap-panel__check" />
                </label>
            )}

            <div className="gm-mymap-panel__body">
                <div className="gm-mymap-panel__nm">
                    <span className={cx('gm-mymap-panel__swatch', SWATCH_CLASS[swatch.shape])} aria-hidden="true"
                        style={{ background: swatchFill }} />
                    {toggleOn ? (
                        <label htmlFor={checkId} className={cx('gm-mymap-panel__nt', 'gm-is-clickable', active && 'gm-is-active')} title={item.name}>{item.name}</label>
                    ) : (
                        <span className={cx('gm-mymap-panel__nt', active && view.canToggle && 'gm-is-active', view.phase !== 'ready' && 'gm-is-muted')} title={item.name}>{item.name}</span>
                    )}
                </div>

                <div className="gm-mymap-panel__info">
                    <span className="gm-mymap-panel__kindchip">{view.kind}</span>
                    {view.countText && <><Dot /><span>{view.countText}</span></>}
                    {view.processing && (
                        <>
                            <Dot />
                            <span className="gm-mymap-panel__busy"><Loader2 size={11} className="gm-loader gm-loader--primary" aria-hidden="true" />{view.processing.text}</span>
                        </>
                    )}
                    {view.failed && (
                        <>
                            <Dot />
                            <span className="gm-mymap-panel__bad"><XCircle size={11} aria-hidden="true" />등록하지 못했습니다</span>
                        </>
                    )}
                    {view.mapLoadingText && (
                        <>
                            <Dot />
                            <span className="gm-mymap-panel__busy" role="status"><Loader2 size={11} className="gm-loader gm-loader--primary" aria-hidden="true" />{view.mapLoadingText}</span>
                        </>
                    )}
                    {view.clustered && (
                        <>
                            <Dot />
                            <span className="gm-mymap-panel__chip" title={CLUSTER_HINT} aria-description={CLUSTER_HINT}><Layers size={10} aria-hidden="true" />묶음 표시</span>
                        </>
                    )}
                    {view.shareCount > 0 && (
                        <>
                            <Dot />
                            <span className="gm-mymap-panel__share-count" title={`공유 대상 ${view.shareCount}`} role="img" aria-label={`${view.shareCount}곳에 공유 중(사람·그룹)`}>
                                <Users size={10} aria-hidden="true" />공유 {formatCount(view.shareCount)}
                            </span>
                        </>
                    )}
                    {view.senderText && (
                        <>
                            <Dot />
                            <span className="gm-mymap-panel__sender" title={view.senderTitle ?? undefined}>{view.senderText}</span>
                        </>
                    )}
                </div>

                {view.processing && <div className="gm-mymap-panel__sub">{view.processing.sub}</div>}
                {view.note && (
                    <div className="gm-mymap-panel__note"><CircleOff size={11} aria-hidden="true" />{view.note}</div>
                )}
                {view.canDelete && (
                    <div className="gm-mymap-panel__btns">
                        <button type="button" className="gm-mymap-panel__sbtn gm-is-danger" onClick={onDelete}>
                            <Trash2 size={11} aria-hidden="true" />지우기
                        </button>
                    </div>
                )}

                {view.processing && view.processing.total > 0 && (
                    <div className="gm-mymap-panel__bar" role="progressbar" aria-label={`${item.name} 처리 진행률`}
                        aria-valuemin={0} aria-valuemax={view.processing.total} aria-valuenow={view.processing.done}>
                        <div className="gm-mymap-panel__bar-fill" style={{ width: `${(view.processing.done / view.processing.total) * 100}%` }} />
                    </div>
                )}
                {view.mapLoadingText && mapLoadPct !== null && (
                    <div className="gm-mymap-panel__bar" role="progressbar" aria-label={`${item.name} 불러오기 진행률`}
                        aria-valuemin={0} aria-valuemax={100} aria-valuenow={mapLoadPct}>
                        <div className="gm-mymap-panel__bar-fill gm-is-instant" style={{ width: `${mapLoadPct}%` }} />
                    </div>
                )}
            </div>

            {!selecting && (view.canLocate || menuEntries.length > 0) && (
                <div className="gm-mymap-panel__acts">
                    {view.canLocate && (
                        <button type="button" onClick={onLocate} title="레이어 위치로 이동" aria-label={`${item.name} 위치로 이동`}
                            className="gm-panel__item-btn gm-mymap-panel__ib">
                            <Locate size={14} />
                        </button>
                    )}
                    {menuEntries.length > 0 && (
                        <MyMapItemMenu label={item.name} open={menuOpen} onOpenChange={onMenuOpenChange} entries={menuEntries} />
                    )}
                </div>
            )}
        </div>
    )
}
