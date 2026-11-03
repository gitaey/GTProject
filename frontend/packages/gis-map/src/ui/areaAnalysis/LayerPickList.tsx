'use client'

// 영역 분석: 분석할 레이어 고르기(종류 배지 · 켜짐 점 · 체크 · 회색 사유). 목록·선택은 엔진 상태가 원본이다.
import type { AreaAnalysisLayerItem, AreaAnalysisLayerRef } from '../../core'
import { areaRefKey, areaSameRef } from '../../core'
import { cx } from '../cx'
import { formatCount } from '../mymap/format'
import { EMPTY_LAYERS_NOTE, NO_QUERYABLE_NOTE, badgeClass, providerLabel } from './areaAnalysisModel'

export interface LayerPickListProps {
    layers: readonly AreaAnalysisLayerItem[]
    picked: readonly AreaAnalysisLayerRef[]
    disabled?: boolean
    onChange(refs: AreaAnalysisLayerRef[]): void
}

export default function LayerPickList({ layers, picked, disabled = false, onChange }: LayerPickListProps) {
    if (layers.length === 0) return <p className="gm-analysis__note">{EMPTY_LAYERS_NOTE}</p>
    const toggle = (ref: AreaAnalysisLayerRef, on: boolean): void => {
        const rest = picked.filter(r => !areaSameRef(r, ref))
        onChange(on ? [...rest, ref] : rest)
    }
    const anyQueryable = layers.some(l => l.queryable !== false)
    return (
        <>
        {!anyQueryable && <p className="gm-analysis__note">{NO_QUERYABLE_NOTE}</p>}
        <ul className="gm-analysis__layers" aria-label="분석할 레이어">
            {layers.map(item => {
                const gray = item.queryable === false
                const on = picked.some(r => areaSameRef(r, item.ref))
                return (
                    <li key={areaRefKey(item.ref)} className={cx('gm-analysis__layer', gray && 'gm-is-disabled')}>
                        <label className="gm-analysis__layer-label">
                            <input type="checkbox" checked={on && !gray} disabled={disabled || gray}
                                onChange={e => toggle(item.ref, e.target.checked)} />
                            <span className={badgeClass(item.provider, gray)}>{providerLabel(item.provider)}</span>
                            <span className="gm-analysis__layer-name" title={item.name}>{item.name}</span>
                        </label>
                        {gray && item.reason ? <span className="gm-analysis__why">{item.reason}</span>
                            : item.queryable === 'unknown' && item.provider === 'geoserver' ? <span className="gm-analysis__why">확인 중</span>
                            : item.count !== null ? <span className="gm-analysis__count">{formatCount(item.count)}</span> : null}
                        <i className={cx('gm-analysis__dot', !item.on && 'gm-is-off')} aria-label={item.on ? '지도에 켜짐' : '지도에 꺼짐'} />
                    </li>
                )
            })}
        </ul>
        </>
    )
}
