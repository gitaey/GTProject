'use client'

// 시작 화면 카드: 지도를 열 때 처음 보일 위치·배경지도·화면 분할을 저장소(sources.startView — 계정 또는 브라우저)에 저장·되돌린다.
// 상태는 엔진 map.startView.store(1번 지도). 저장 = 지금 화면(분할이면 칸마다) → buildStartView → startView.save.
// 상태별 화면은 settingsModel.startViewCardModel(F3 표). confirm()을 쓰지 않고 그 자리에서 확인 줄을 펼친다.
import { Clock, Cloud, Database, LocateFixed, Lock, MapPin, RotateCcw, Save, TriangleAlert, CircleCheck, CircleX } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { EMPTY_REGION_STATE, EMPTY_START_VIEW_STATE, buildStartView, captureViewState } from '../../core'
import type { GisMap, RegionState, StartViewState } from '../../core'
import { useGisMap, useGisMapSplit, useStoreValue } from '../../react'
import { cx } from '../cx'
import SettingsCard from './SettingsCard'
import { samePlace, scopeText, startViewCardModel, summarizeStartView } from './settingsModel'
import type { StartViewNotice } from './settingsModel'

export interface StartViewCardProps {
    /** 1번(기본) 지도 — 저장소 상태를 가진 엔진 */
    map: GisMap
    open: boolean
    onToggle: () => void
}

const selectState = (s: StartViewState): StartViewState => s
const selectRegion = (s: RegionState): RegionState => s

const NOTICE_ICON: Readonly<Record<StartViewNotice['icon'], ComponentType<{ size?: number }>>> = Object.freeze({
    clock: Clock, alert: TriangleAlert, database: Database, lock: Lock, x: CircleX,
})

type LocalMessage = 'saved' | 'cleared' | 'moved' | 'unreadable'

const MESSAGE_TEXT: Readonly<Record<LocalMessage, string>> = Object.freeze({
    saved: '저장했습니다',
    cleared: '지웠습니다. 다음에 지도를 열면 기본 위치에서 시작합니다.',
    moved: '저장한 시작 화면으로 이동했습니다',
    unreadable: '지금 화면을 읽지 못해 저장하지 못했습니다',
})

export default function StartViewCard({ map, open, onToggle }: StartViewCardProps) {
    const state = useStoreValue(map.startView.store, selectState, EMPTY_START_VIEW_STATE)
    const split = useGisMapSplit()
    // useGisMap()은 분할 Provider 안에서 "활성 지도" — 지역명·현재 위치는 활성 지도 기준
    const active = useGisMap()
    const region = useStoreValue(active?.region.store, selectRegion, EMPTY_REGION_STATE)
    const [confirming, setConfirming] = useState(false)
    const [message, setMessage] = useState<LocalMessage | null>(null)

    const model = startViewCardModel(state)
    const scope = scopeText(map.startView.scope)

    // 카드가 열려 있는데 저장소를 아직 안 읽었거나(idle) 사용자가 바뀌어 비워졌으면 읽는다(읽기 시작하면 loading이라 되풀이되지 않는다)
    const status = state.status
    useEffect(() => {
        if (open && status === 'idle') void map.startView.load()
    }, [open, status, map])

    const toggle = useCallback(() => {
        setConfirming(false)
        setMessage(null)
        // 사용자가 펼칠 때: 사용자가 바뀌어 비워졌거나(idle) 시간 초과·오류였으면 다시 읽는다
        if (!open) {
            const status = map.startView.store.getState().status
            if (status === 'idle' || status === 'timeout' || status === 'error') void map.startView.load()
        }
        onToggle()
    }, [open, map, onToggle])

    const save = useCallback(async () => {
        setConfirming(false)
        setMessage(null)
        const maps: GisMap[] = []
        if (split && split.available) {
            for (let i = 0; i < split.count; i++) {
                const m = split.panes[i]
                if (m) maps.push(m)
            }
        }
        if (maps.length === 0) maps.push(map)
        let view
        try {
            view = buildStartView(maps, { count: maps.length, sync: split && split.available ? split.sync : false, activeIndex: split && split.available ? split.activeIndex : 0 })
        } catch {
            setMessage('unreadable')
            return
        }
        await map.startView.save(view)
        // 다른 요청에 밀려 끊긴 저장이면 문구를 바꾸지 않는다: 지금 store가 이 저장의 결과(같은 savedAt의 값, 오류 없음, 요청 끝)일 때만
        const after = map.startView.store.getState()
        if (!after.saving && after.errorOp === null && after.value?.view.savedAt === view.savedAt) setMessage('saved')
    }, [map, split])

    const go = useCallback(() => {
        const value = map.startView.store.getState().value
        if (!value) return
        setConfirming(false)
        if (split && split.available) split.applyStartView(value.view)
        map.startView.applyNow()
        setMessage('moved')
    }, [map, split])

    const clear = useCallback(async () => {
        setConfirming(false)
        setMessage(null)
        await map.startView.clear()
        // 끊긴 삭제는 문구를 바꾸지 않는다: 요청이 끝났고 오류가 없고 값이 비어 있을 때만
        const after = map.startView.store.getState()
        if (!after.saving && after.errorOp === null && after.status === 'ready' && after.value === null) setMessage('cleared')
    }, [map])

    const retry = useCallback((what: 'load' | 'save' | 'clear') => {
        setMessage(null)
        if (what === 'load') void map.startView.load()
        else if (what === 'save') void save()
        else void clear()
    }, [map, save, clear])

    if (model.hidden) return null

    const value = state.value
    let summary = null
    if (model.showSummary && value) {
        const view = value.view
        const savedPane = view.panes[view.split.activeIndex]
        const here = active ? captureViewState(active) : null
        const near = !!(savedPane && here && samePlace(savedPane.center, here.center))
        summary = summarizeStartView(view, value.updatedAt, region.name, near)
    }

    const disabled = !model.canWrite
    const hasSummary = summary !== null

    return (
        <SettingsCard id="start-view" icon={MapPin} title="시작 화면" description="지도를 열 때 이 위치·배경지도·분할로" open={open} onToggle={toggle}>
            <div className="gm-settings-scope">
                <Cloud size={12} />
                <span><b>{scope.strong}</b>{scope.rest}</span>
            </div>

            {model.loading && (
                <div className="gm-settings-skels" aria-busy="true" aria-label="불러오는 중">
                    <div className="gm-settings-skel gm-settings-skel--w70" />
                    <div className="gm-settings-skel gm-settings-skel--w90" />
                    <div className="gm-settings-skel gm-settings-skel--w55" />
                </div>
            )}

            {summary && (
                <div className="gm-settings-sum">
                    <div className="gm-settings-sum__head">{summary.head}</div>
                    {summary.panes.map(p => (
                        <div key={p.index} className="gm-settings-sum__pane" title={p.title}>
                            <i className="gm-settings-sum__num">{p.index}</i>
                            <span className="gm-settings-sum__name">{p.name}</span>
                            <span className="gm-settings-sum__detail">· {p.detail}</span>
                        </div>
                    ))}
                </div>
            )}

            {model.showEmpty && (
                <p className="gm-settings-empty">저장된 시작 화면이 없습니다. 지도를 열면 기본 위치에서 시작합니다.</p>
            )}

            {model.notices.map(n => {
                const Icon = NOTICE_ICON[n.icon]
                return (
                    <div key={n.text} className={cx('gm-settings-box', 'gm-settings-box--' + n.tone)} role={n.tone === 'info' ? 'status' : 'alert'}>
                        <Icon size={12} />
                        <span>{n.text}</span>
                        {n.retry && (
                            <button type="button" className="gm-settings-box__retry" onClick={() => retry(n.retry as 'load' | 'save' | 'clear')}>다시 시도</button>
                        )}
                    </div>
                )
            })}

            {model.showButtons && !hasSummary && (
                <button type="button" className="gm-settings-btn gm-settings-btn--pri" disabled={disabled} onClick={() => void save()}>
                    <Save size={14} />현재 화면을 시작 화면으로 저장
                </button>
            )}

            {model.showButtons && hasSummary && (
                <>
                    {model.emphasizeGo ? (
                        <button type="button" className="gm-settings-btn gm-settings-btn--pri" onClick={go}>
                            <LocateFixed size={14} />시작 화면으로 이동
                        </button>
                    ) : (
                        <button type="button" className="gm-settings-btn gm-settings-btn--pri" disabled={disabled} onClick={() => void save()}>
                            <Save size={14} />현재 화면으로 덮어쓰기
                        </button>
                    )}
                    <div className="gm-settings-row2">
                        {model.emphasizeGo ? (
                            <button type="button" className="gm-settings-btn gm-settings-btn--sec" disabled={disabled} onClick={() => void save()}>
                                <Save size={14} />덮어쓰기
                            </button>
                        ) : (
                            <button type="button" className="gm-settings-btn gm-settings-btn--sec" onClick={go}>
                                <LocateFixed size={14} />시작 화면으로
                            </button>
                        )}
                        <button type="button" className="gm-settings-btn gm-settings-btn--sec" disabled={disabled}
                            onClick={() => { setMessage(null); setConfirming(true) }}>
                            <RotateCcw size={14} />기본값으로
                        </button>
                    </div>
                </>
            )}

            {confirming && model.showButtons && hasSummary && (
                <div className="gm-settings-confirm" role="alertdialog" aria-label="저장한 시작 화면 지우기">
                    <p>저장한 시작 화면을 지울까요? 다음에 지도를 열면 기본 위치에서 시작합니다.</p>
                    <div className="gm-settings-row2">
                        <button type="button" className="gm-settings-btn gm-settings-btn--del" onClick={() => void clear()}>지우기</button>
                        <button type="button" className="gm-settings-btn gm-settings-btn--sec" onClick={() => setConfirming(false)}>취소</button>
                    </div>
                </div>
            )}

            {state.saving && <div className="gm-settings-hint" role="status">처리하는 중…</div>}
            {!state.saving && message && model.notices.length === 0 && (
                <div className={cx('gm-settings-ok', message === 'unreadable' && 'gm-settings-ok--bad')} role="status">
                    {message === 'unreadable' ? <CircleX size={12} /> : <CircleCheck size={12} />}
                    {MESSAGE_TEXT[message]}
                </div>
            )}
        </SettingsCard>
    )
}
