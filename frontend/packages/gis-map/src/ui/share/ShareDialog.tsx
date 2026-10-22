'use client'

// 범용 공유 대화상자 — 자원 종류와 무관(나만의지도, 이후 TIFF 등). 공유 저장은 `target`(자원별), 공유 상대 찾기는 `directory`(공통)가 한다.
//   · 단일(items 1개): 열면 현재 공유를 받아 칩·체크로 보여 주고, 저장 = 통째로 바꾸기(set). 서버 오류는 창을 닫지 않고 하단에 message로 보여 준다.
//     현재 공유를 받지 못하면 저장을 막는다(빈 칸에서 저장하면 기존 공유가 지워진다)
//   · 일괄(items 2개 이상, target.bulk 필요): [대상 추가 | 대상 빼기] — 덮어쓰기는 없다. 빼기는 선택한 레이어들의 현재 공유 대상(getMany)에서 고른다.
//     저장 = bulk → 결과 화면(성공 n · 실패 m, 실패 사유)
//   · 공유받은 쪽은 보기만 한다(권한 등급 없음). 본인은 대상에서 제외한다(selfUserId)
// 스타일: gm-modal(업로드 모달과 공용) · gm-share-* (styles/gis-map-ui.css)
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Loader2, X } from 'lucide-react'
import type { BulkShareMode, BulkShareResult, ShareDirectorySource, ShareTargetSource } from '../../core'
import { cx } from '../cx'
import GroupPicker from './GroupPicker'
import RemovePicker from './RemovePicker'
import UserPicker from './UserPicker'
import {
    SHARE_MAX_ITEMS, bulkSummary, cleanChange, entryIds, failReason, mergeSnapshots, snapshotUsers, validateChange,
} from './shareModel'
import type { BulkCurrent, ShareUserEntry } from './shareModel'

export interface ShareDialogItem {
    id: number
    name: string
}

export interface ShareDialogProps {
    target: ShareTargetSource
    /** 공유 상대 검색·그룹 목록. 없으면 아이디·코드 직접 입력 */
    directory?: ShareDirectorySource
    items: readonly ShareDialogItem[]
    /** 자원 이름(기본 '레이어') */
    resourceNoun?: string
    /** 아래 안내 문구(기본: 공유받은 사용자는 조회만 가능) */
    note?: string
    /** 단일 공유 본문 맨 위 안내 한 줄(예: 여러 개를 고르다 하나만 골랐을 때) */
    intro?: string
    /** 본인 아이디 — 검색 결과·입력에서 뺀다 */
    selfUserId?: string | null
    onClose: () => void
    /** 저장이 끝났을 때(단일: 인자 없음, 일괄: 결과). 일괄은 결과 화면이 떠 있는 동안 불린다 — 닫기는 onClose */
    onDone?: (result?: BulkShareResult) => void
}

interface Selection {
    users: ShareUserEntry[]
    roles: string[]
}

const emptySelection = (): Selection => ({ users: [], roles: [] })
const DEFAULT_NOTE = '공유받은 사용자도 조회만 가능하며, 편집은 소유자만 할 수 있습니다.'

type Current = { status: 'idle' | 'loading' } | { status: 'ok'; data: BulkCurrent; total: number } | { status: 'error'; message: string }

function errorText(err: unknown, fallback: string): string {
    return err instanceof Error && err.message ? err.message : fallback
}

export default function ShareDialog({ target, directory, items, resourceNoun = '레이어', note = DEFAULT_NOTE, intro, selfUserId, onClose, onDone }: ShareDialogProps) {
    const single = items.length === 1
    const firstId = items[0]?.id
    const idsKey = items.map(i => i.id).join(',')
    const bulkUnsupported = !single && !target.bulk
    const [loading, setLoading] = useState(single)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [mode, setMode] = useState<BulkShareMode>('ADD')
    const [sel, setSel] = useState<Record<BulkShareMode, Selection>>({ ADD: emptySelection(), REMOVE: emptySelection() })
    const [labels, setLabels] = useState<Readonly<Record<string, string | null>>>({})
    const [current, setCurrent] = useState<Current>({ status: 'idle' })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<BulkShareResult | null>(null)
    const [showNames, setShowNames] = useState(false)
    const [reload, setReload] = useState(0)
    // 저장 요청이 도는 동안 true — 같은 틱의 두 번째 클릭까지 막는다(state는 다음 렌더에야 바뀐다)
    const savingRef = useRef(false)
    const key: BulkShareMode = single ? 'ADD' : mode
    const cur = sel[key]
    const nameOf = useMemo(() => new Map(items.map(i => [i.id, i.name])), [items])

    // 단일: 현재 공유 받기
    useEffect(() => {
        if (!single || firstId === undefined) return
        let alive = true
        setLoading(true)
        setLoadError(null)
        target.get(firstId).then(snap => {
            if (!alive) return
            setSel({ ADD: { users: snapshotUsers(snap), roles: snap.roles.map(r => r.code) }, REMOVE: emptySelection() })
            setLabels(Object.fromEntries(snap.roles.map(r => [r.code, r.label])))
            setLoading(false)
        }, (err: unknown) => {
            if (!alive) return
            setLoadError(errorText(err, '공유 설정을 불러오지 못했습니다.'))
            setLoading(false)
        })
        return () => { alive = false }
    }, [single, firstId, target, reload])

    // 일괄 빼기: 선택한 레이어들의 현재 공유 모으기(처음 빼기를 열 때 한 번)
    const canListCurrent = !single && mode === 'REMOVE' && !!target.getMany
    useEffect(() => {
        if (!canListCurrent || !target.getMany) return
        let alive = true
        setCurrent({ status: 'loading' })
        target.getMany(idsKey.split(',').map(Number)).then(rows => {
            if (!alive) return
            const data = mergeSnapshots(rows)
            setCurrent({ status: 'ok', data, total: rows.length })
            setLabels(prev => {
                const next = { ...prev }
                for (const r of data.roles) if (r.label) next[r.code] = r.label
                return next
            })
        }, (err: unknown) => {
            if (alive) setCurrent({ status: 'error', message: errorText(err, '현재 공유 대상을 불러오지 못했습니다.') })
        })
        return () => { alive = false }
    }, [canListCurrent, target, idsKey, reload])

    const update = (fn: (s: Selection) => Selection) => setSel(all => ({ ...all, [key]: fn(all[key]) }))
    const addUser = (u: ShareUserEntry) => update(s => (s.users.some(x => x.userId === u.userId) ? s : { ...s, users: [...s.users, u] }))
    const removeUser = (userId: string) => update(s => ({ ...s, users: s.users.filter(u => u.userId !== userId) }))
    const toggleRole = (code: string) => update(s => ({
        ...s, roles: s.roles.includes(code) ? s.roles.filter(c => c !== code) : [...s.roles, code],
    }))

    const closable = !saving
    const close = () => { if (closable) onClose() }
    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') close()
    }

    const handleSave = async () => {
        if (savingRef.current) return
        setError(null)
        const change = cleanChange({ userIds: entryIds(cur.users), roleCodes: cur.roles }, selfUserId)
        const invalid = validateChange(change, { requireTarget: !single })
        if (invalid) { setError(invalid); return }
        if (!single && items.length > SHARE_MAX_ITEMS) { setError(`한 번에 ${SHARE_MAX_ITEMS}개까지 선택할 수 있습니다.`); return }
        savingRef.current = true
        setSaving(true)
        try {
            if (single) {
                await target.set(items[0].id, change)
                onDone?.()
                onClose()
            } else if (target.bulk) {
                const res = await target.bulk(items.map(i => i.id), mode, change)
                setResult(res)
                onDone?.(res)
            }
        } catch (err) {
            setError(errorText(err, '저장하지 못했습니다.'))
        } finally {
            savingRef.current = false
            setSaving(false)
        }
    }

    const title = result ? '공유 결과'
        : single ? `공유 설정 — ${items[0].name}`
            : `일괄 공유 — ${resourceNoun} ${items.length}개`

    // ── 본문 ──
    let body
    if (result) {
        body = (
            <div className="gm-modal__body">
                <div className={cx('gm-share__result-summary', result.failed.length > 0 && 'gm-has-fail')}>{bulkSummary(result)}</div>
                <div className="gm-modal__note">
                    {mode === 'ADD' ? '선택한 대상을 공유에 더했습니다.' : '선택한 대상을 공유에서 뺐습니다.'}
                    {result.succeededIds.length > 0 && ' 이미 같은 상태였던 것도 성공으로 셉니다.'}
                </div>
                {result.failed.length > 0 && (
                    <ul className="gm-share__fails" aria-label="실패한 항목">
                        {result.failed.map(f => (
                            <li key={f.id}><strong>{nameOf.get(f.id) ?? `#${f.id}`}</strong> — {failReason(f.reason)}</li>
                        ))}
                    </ul>
                )}
                <button type="button" onClick={onClose} className="gm-modal__submit">닫기</button>
            </div>
        )
    } else if (bulkUnsupported) {
        body = (
            <div className="gm-modal__body">
                <div className="gm-modal__error" role="alert">이 소스는 일괄 공유를 지원하지 않습니다.</div>
                <button type="button" onClick={onClose} className="gm-modal__submit">닫기</button>
            </div>
        )
    } else if (loading) {
        body = (
            <div className="gm-modal__loading">
                <Loader2 size={18} className="gm-loader gm-loader--primary" />
            </div>
        )
    } else if (loadError) {
        body = (
            <div className="gm-modal__body">
                <div className="gm-modal__error" role="alert">{loadError}</div>
                <div className="gm-share__actions">
                    <button type="button" className="gm-share__btn" onClick={() => setReload(n => n + 1)}>다시 시도</button>
                    <button type="button" className="gm-share__btn" onClick={onClose}>닫기</button>
                </div>
            </div>
        )
    } else {
        const removing = !single && mode === 'REMOVE'
        const removeCurrent = removing && canListCurrent
        const saveLabel = single ? '저장' : mode === 'ADD' ? '대상 추가' : '대상 빼기'
        body = (
            <div className="gm-modal__body gm-share__body">
                {single && intro && <div className="gm-share__intro">{intro}</div>}
                {!single && (
                    <div className="gm-share__targets">
                        <button type="button" aria-expanded={showNames} onClick={() => setShowNames(v => !v)} className="gm-share__targets-toggle">
                            선택한 {resourceNoun} {items.length}개 {showNames ? '접기' : '보기'}
                        </button>
                        {showNames && (
                            <ul className="gm-share__names">{items.map(i => <li key={i.id}>{i.name}</li>)}</ul>
                        )}
                    </div>
                )}
                {!single && (
                    <div className="gm-share__seg" role="group" aria-label="일괄 공유 방식">
                        {(['ADD', 'REMOVE'] as const).map(m => (
                            <button key={m} type="button" aria-pressed={mode === m} disabled={saving}
                                onClick={() => { setMode(m); setError(null) }}
                                className={cx('gm-share__seg-btn', mode === m && 'gm-is-active')}>
                                {m === 'ADD' ? '대상 추가' : '대상 빼기'}
                            </button>
                        ))}
                    </div>
                )}

                {removeCurrent ? (
                    current.status === 'ok' ? (
                        <>
                            <RemovePicker current={current.data} total={current.total} disabled={saving}
                                pickedUsers={new Set(cur.users.map(u => u.userId))} pickedRoles={new Set(cur.roles)}
                                onToggleUser={userId => {
                                    const known = current.data.users.find(u => u.userId === userId)
                                    if (cur.users.some(u => u.userId === userId)) removeUser(userId)
                                    else if (known) addUser({ userId, name: known.name, state: known.state })
                                }}
                                onToggleRole={toggleRole} />
                            {current.total < items.length && (
                                <div className="gm-modal__note">{items.length - current.total}개 {resourceNoun}는 조회할 수 없어 제외했습니다.</div>
                            )}
                        </>
                    ) : current.status === 'error' ? (
                        <div className="gm-share__hint gm-share__hint--error" role="alert">
                            {current.message}
                            <button type="button" className="gm-share__link" onClick={() => setReload(n => n + 1)}>다시 시도</button>
                        </div>
                    ) : (
                        <div className="gm-share__hint"><Loader2 size={11} className="gm-loader" /> 현재 공유 대상을 불러오는 중</div>
                    )
                ) : (
                    <>
                        <div className="gm-modal__label">{removing ? '뺄 사용자' : '공유할 사용자'}</div>
                        <UserPicker directory={directory} selfUserId={selfUserId} entries={cur.users} disabled={saving}
                            onAdd={addUser} onRemove={removeUser} />
                        <div className="gm-modal__label">{removing ? '뺄 역할' : '공유할 역할'}</div>
                        <GroupPicker directory={directory} selected={cur.roles} labels={labels} disabled={saving} onToggle={toggleRole} />
                    </>
                )}

                <div className="gm-modal__note">{note}</div>
                {error && <div className="gm-modal__error" role="alert">{error}</div>}

                <button type="button" onClick={handleSave} disabled={saving || (removeCurrent && current.status !== 'ok')}
                    className="gm-modal__submit">
                    {saving && <Loader2 size={13} className="gm-loader" />}
                    {saveLabel}
                </button>
            </div>
        )
    }

    return (
        <div className="gm-modal" onClick={close}>
            <div onClick={e => e.stopPropagation()} onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-label={title}
                className="gm-modal__dialog gm-share-dialog">
                <div className="gm-modal__header">
                    <span className="gm-modal__title">{title}</span>
                    <button type="button" onClick={close} aria-label="닫기" className="gm-modal__close"><X size={16} /></button>
                </div>
                {body}
            </div>
        </div>
    )
}
