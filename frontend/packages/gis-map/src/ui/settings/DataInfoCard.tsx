'use client'

// 데이터 기준 정보 카드: 건물DB 기준월·지적도 적재·바람 예보 발표·출처를 한곳에 보인다.
// 처음 펼칠 때 한 번만 sources.dataInfo.list()를 부른다(패널을 열기만 해서는 요청 0). 카드가 닫히면 진행 중 요청을 끊고, 다시 펼치면 다시 부른다.
// 호스트가 준 정적 항목(예: 배경지도 제공처 안내)은 요청 없이 목록 끝에 붙는다. 상태는 이 컴포넌트의 로컬 state(카드가 마운트된 동안).
import { CircleX, Database, Lock, RefreshCw, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GisHttpError } from '../../core'
import type { DataInfoSource, GisDataInfoItem } from '../../core'
import { cx } from '../cx'
import SettingsCard from './SettingsCard'
import { dataInfoChip, dataInfoErrorText, dataInfoMeta, dataInfoPartialNote, dataInfoVersion, formatSavedAt } from './settingsModel'

export interface DataInfoCardProps {
    /** 없으면 정적 항목만 보인다 */
    source?: DataInfoSource
    /** 요청 없이 목록 끝에 붙는 항목 */
    staticItems?: readonly GisDataInfoItem[]
    open: boolean
    onToggle: () => void
}

type LoadState =
    | { phase: 'idle' }
    | { phase: 'loading' }
    | { phase: 'ready'; items: readonly GisDataInfoItem[]; checkedAt: string }
    | { phase: 'error'; kind: 'unauthorized' | 'failed' }

const IDLE: LoadState = { phase: 'idle' }
const NO_STATIC: readonly GisDataInfoItem[] = Object.freeze([])

function isAbort(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
}

export default function DataInfoCard({ source, staticItems = NO_STATIC, open, onToggle }: DataInfoCardProps) {
    const [state, setState] = useState<LoadState>(IDLE)
    const abortRef = useRef<AbortController | null>(null)

    const load = useCallback(() => {
        if (!source) return
        abortRef.current?.abort()
        const ac = new AbortController()
        abortRef.current = ac
        setState({ phase: 'loading' })
        source.list(ac.signal).then(
            items => {
                if (ac.signal.aborted) return
                setState({ phase: 'ready', items, checkedAt: new Date().toISOString() })
            },
            err => {
                if (ac.signal.aborted || isAbort(err)) return
                const status = err instanceof GisHttpError ? err.status : null
                setState({ phase: 'error', kind: status === 401 || status === 403 ? 'unauthorized' : 'failed' })
            },
        )
    }, [source])

    // 펼쳐지면(처음 또는 닫혀서 끊긴 뒤) 부른다. 닫히면 진행 중 요청을 끊고 처음 상태로 — 다시 펼치면 새로 읽는다
    useEffect(() => {
        if (!source) return
        if (open) {
            if (state.phase === 'idle' || (state.phase === 'loading' && abortRef.current?.signal.aborted)) load()
            return
        }
        if (state.phase === 'loading') {
            abortRef.current?.abort()
            setState(IDLE)
        }
    }, [open, source, state.phase, load])

    useEffect(() => () => abortRef.current?.abort(), [])

    const fetched = state.phase === 'ready' ? state.items : NO_STATIC
    const loading = !!source && (state.phase === 'idle' || state.phase === 'loading')

    return (
        <SettingsCard id="data-info" icon={Database} title="데이터 기준 정보" description="건물DB·지적도·바람 예보의 기준일과 출처" open={open} onToggle={onToggle}>
            {source && (
                <div className="gm-settings-di-head">
                    <span>{state.phase === 'ready' ? '확인 ' + formatSavedAt(state.checkedAt) : ''}</span>
                    <button type="button" className="gm-settings-link" disabled={state.phase === 'loading'} onClick={load}>
                        <RefreshCw size={11} />다시 불러오기
                    </button>
                </div>
            )}

            {loading && (
                <div className="gm-settings-skels" aria-busy="true" aria-label="불러오는 중">
                    <div className="gm-settings-skel gm-settings-skel--w70" />
                    <div className="gm-settings-skel gm-settings-skel--w90" />
                    <div className="gm-settings-skel gm-settings-skel--w55" />
                    <div className="gm-settings-skel gm-settings-skel--w80" />
                </div>
            )}

            {state.phase === 'error' && (
                <div className="gm-settings-box gm-settings-box--error" role="alert">
                    {state.kind === 'unauthorized' ? <Lock size={12} /> : <CircleX size={12} />}
                    <span>{dataInfoErrorText(state.kind)}</span>
                    {state.kind === 'failed' && <button type="button" className="gm-settings-box__retry" onClick={load}>다시 시도</button>}
                </div>
            )}

            {fetched.map(item => <DataInfoRow key={item.id} item={item} />)}
            {!loading && staticItems.map(item => <DataInfoRow key={item.id} item={item} />)}

            {!loading && state.phase === 'ready' && fetched.length === 0 && staticItems.length === 0 && (
                <p className="gm-settings-empty">표시할 기준 정보가 없습니다.</p>
            )}
        </SettingsCard>
    )
}

function DataInfoRow({ item }: { item: GisDataInfoItem }) {
    const chip = dataInfoChip(item)
    const meta = dataInfoMeta(item)
    const partial = dataInfoPartialNote(item)
    const stale = item.stale && item.status === 'ready' ? item.staleNote ?? null : null
    return (
        <div className="gm-settings-di">
            <div className="gm-settings-di__l1">
                <b className="gm-settings-di__name">{item.label}</b>
                {chip && (
                    <span className={cx('gm-settings-chip', 'gm-settings-chip--' + chip.tone)}>
                        {chip.tone === 'err' ? <CircleX size={10} /> : chip.tone === 'warn' ? <TriangleAlert size={10} /> : chip.tone === 'info' ? <RefreshCw size={10} /> : null}
                        {chip.text}
                    </span>
                )}
                <span className="gm-settings-di__ver">{dataInfoVersion(item)}</span>
            </div>
            {item.source && <div className="gm-settings-di__src">{item.source}</div>}
            {partial && <div className="gm-settings-di__src">{partial}</div>}
            {meta && <div className="gm-settings-di__meta">{meta}</div>}
            {item.note && <div className="gm-settings-di__meta">{item.note}</div>}
            {stale && (
                <div className="gm-settings-di__stale"><TriangleAlert size={11} /><span>{stale}</span></div>
            )}
        </div>
    )
}
