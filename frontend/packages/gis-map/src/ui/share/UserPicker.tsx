'use client'

// 공유 상대(사용자) 고르기 — 검색해서 칩으로 추가·제거. 자원과 무관(ShareDialog가 쓴다).
//   · 디렉터리가 있으면: 2글자 이상 입력 → 250ms 뒤 검색(늦게 온 옛 결과는 버림), 결과 목록(이름·아이디·소속, 고른 사람은 체크),
//     ↑↓ 이동 · Enter 고르기/빼기 · Esc 목록 닫기. 본인은 결과에서 뺀다. 빈 결과·오류(서버 message)·"다시 시도"를 보여 준다
//   · 디렉터리가 없거나 검색 경로가 없는 서버(404·405)면: 아이디 직접 입력 + 추가 단추(콤마·공백으로 여러 명)
// 스타일: gm-share-* (styles/gis-map-ui.css)
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Check, Loader2, Search, X } from 'lucide-react'
import { GisHttpError } from '../../core'
import type { ShareDirectorySource, ShareUser } from '../../core'
import { cx } from '../cx'
import { SHARE_MAX_QUERY, SHARE_MIN_QUERY, parseDirectInput, stateBadge } from './shareModel'
import type { ShareUserEntry } from './shareModel'

/** 입력이 멈춘 뒤 검색을 보내기까지(ms) */
const SEARCH_DEBOUNCE_MS = 250
const SEARCH_LIMIT = 10

interface UserPickerProps {
    directory?: ShareDirectorySource
    /** 본인 아이디 — 검색 결과·직접 입력에서 뺀다 */
    selfUserId?: string | null
    entries: readonly ShareUserEntry[]
    onAdd: (user: ShareUserEntry) => void
    onRemove: (userId: string) => void
    disabled?: boolean
}

type Phase = 'idle' | 'short' | 'loading' | 'ok' | 'error'

export default function UserPicker({ directory, selfUserId, entries, onAdd, onRemove, disabled }: UserPickerProps) {
    const listId = useId()
    const [query, setQuery] = useState('')
    const [phase, setPhase] = useState<Phase>('idle')
    const [users, setUsers] = useState<ShareUser[]>([])
    const [message, setMessage] = useState('')
    // 서버가 거절·실패한 검색만 다시 시도할 수 있다(길이 초과는 입력을 고쳐야 한다)
    const [retryable, setRetryable] = useState(false)
    const [open, setOpen] = useState(true)
    const [active, setActive] = useState(-1)
    // 검색 경로가 없는 서버(404·405)면 직접 입력으로 바꾼다
    const [serverLacksSearch, setServerLacksSearch] = useState(false)
    const [retry, setRetry] = useState(0)
    const [directNote, setDirectNote] = useState('')
    // 요청 순번 — 늦게 온 옛 결과를 버린다
    const seqRef = useRef(0)
    const direct = !directory || serverLacksSearch
    const selectedIds = new Set(entries.map(e => e.userId))

    useEffect(() => {
        if (!directory || serverLacksSearch) return
        const q = query.trim()
        if (q === '') { setPhase('idle'); setUsers([]); return }
        if (q.length < SHARE_MIN_QUERY) { setPhase('short'); setUsers([]); return }
        if (q.length > SHARE_MAX_QUERY) { setPhase('error'); setRetryable(false); setMessage(`검색어는 ${SHARE_MAX_QUERY}자 이하로 입력하세요.`); setUsers([]); return }
        const seq = ++seqRef.current
        setPhase('loading')
        const timer = setTimeout(() => {
            directory.searchUsers(q, { limit: SEARCH_LIMIT }).then(list => {
                if (seq !== seqRef.current) return
                setUsers(list)
                setActive(-1)
                setPhase('ok')
            }, (err: unknown) => {
                if (seq !== seqRef.current) return
                if (err instanceof GisHttpError && (err.status === 404 || err.status === 405)) {
                    setServerLacksSearch(true)
                    return
                }
                setUsers([])
                setMessage(err instanceof Error && err.message ? err.message : '검색하지 못했습니다.')
                setRetryable(true)
                setPhase('error')
            })
        }, SEARCH_DEBOUNCE_MS)
        return () => {
            clearTimeout(timer)
            seqRef.current++
        }
    }, [query, directory, serverLacksSearch, retry])

    const self = selfUserId?.trim() ?? ''
    const results = users.filter(u => u.userId !== self)

    const toggle = (u: ShareUser) => {
        if (selectedIds.has(u.userId)) onRemove(u.userId)
        else onAdd({ userId: u.userId, name: u.name, state: 'ACTIVE', groupLabel: u.groupLabel })
    }

    const addDirect = () => {
        const ids = parseDirectInput(query)
        if (ids.length === 0) return
        let skippedSelf = false
        for (const id of ids) {
            if (id === self) { skippedSelf = true; continue }
            if (!selectedIds.has(id)) onAdd({ userId: id, name: null, state: 'ACTIVE' })
        }
        setDirectNote(skippedSelf ? '본인은 공유 대상에서 제외됩니다.' : '')
        setQuery('')
    }

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        // 한글 조합 중 Enter는 글자 확정이다
        if ((e.nativeEvent as { isComposing?: boolean } | undefined)?.isComposing) return
        if (direct) {
            if (e.key === 'Enter') { e.preventDefault(); addDirect() }
            return
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (phase !== 'ok' || results.length === 0) return
            e.preventDefault()
            setOpen(true)
            setActive(cur => {
                const step = e.key === 'ArrowDown' ? 1 : -1
                return (cur + step + results.length) % results.length
            })
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (open && phase === 'ok' && active >= 0 && active < results.length) toggle(results[active])
        } else if (e.key === 'Escape' && open && phase !== 'idle') {
            // 목록만 닫고 대화상자는 닫지 않는다
            e.stopPropagation()
            setOpen(false)
        }
    }

    const showList = !direct && open
    return (
        <div className="gm-share__picker">
            <div className="gm-share__search">
                <Search size={12} className="gm-share__search-icon" />
                <input
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true); setDirectNote('') }}
                    onKeyDown={onKeyDown}
                    disabled={disabled}
                    maxLength={direct ? undefined : SHARE_MAX_QUERY}
                    placeholder={direct ? '사용자 아이디 (콤마로 여러 명)' : '이름 또는 아이디로 검색'}
                    aria-label={direct ? '공유할 사용자 아이디' : '공유할 사용자 검색'}
                    role={direct ? undefined : 'combobox'}
                    aria-expanded={direct ? undefined : showList && phase === 'ok' && results.length > 0}
                    aria-controls={direct ? undefined : listId}
                    aria-activedescendant={!direct && active >= 0 ? `${listId}-${active}` : undefined}
                    autoComplete="off"
                    className="gm-modal__field gm-share__search-input" />
                {direct && (
                    <button type="button" onClick={addDirect} disabled={disabled || parseDirectInput(query).length === 0}
                        className="gm-share__add">추가</button>
                )}
            </div>

            {direct && (
                <div className="gm-share__hint">
                    {directory ? '이 서버는 사용자 검색을 지원하지 않아 아이디를 직접 입력합니다.' : '아이디를 입력하고 추가를 누르세요.'}
                    {directNote && <span className="gm-share__hint-warn"> {directNote}</span>}
                </div>
            )}

            {!direct && phase === 'short' && <div className="gm-share__hint">{SHARE_MIN_QUERY}글자 이상 입력하세요.</div>}
            {!direct && phase === 'loading' && (
                <div className="gm-share__hint"><Loader2 size={11} className="gm-loader" /> 검색 중</div>
            )}
            {!direct && phase === 'error' && (
                <div className="gm-share__hint gm-share__hint--error" role="alert">
                    {message}
                    {retryable && (
                        <button type="button" className="gm-share__link" onClick={() => setRetry(n => n + 1)}>다시 시도</button>
                    )}
                </div>
            )}
            {showList && phase === 'ok' && results.length === 0 && (
                <div className="gm-share__hint">일치하는 사용자가 없습니다.</div>
            )}
            {showList && phase === 'ok' && results.length > 0 && (
                <ul id={listId} role="listbox" className="gm-share__results">
                    {results.map((u, i) => {
                        const picked = selectedIds.has(u.userId)
                        return (
                            <li key={u.userId} id={`${listId}-${i}`} role="option" aria-selected={picked}
                                className={cx('gm-share__result', picked && 'gm-is-picked', i === active && 'gm-is-active')}
                                onMouseEnter={() => setActive(i)}
                                onClick={() => toggle(u)}>
                                <span className="gm-share__result-check">{picked && <Check size={12} />}</span>
                                <span className="gm-share__result-name">{u.name ?? u.userId}</span>
                                {u.name && <span className="gm-share__result-id">{u.userId}</span>}
                                {u.groupLabel && <span className="gm-share__result-group">{u.groupLabel}</span>}
                            </li>
                        )
                    })}
                </ul>
            )}

            <ul className="gm-share__chips" aria-label="공유할 사용자">
                {entries.length === 0 && <li className="gm-share__empty">선택한 사용자 없음</li>}
                {entries.map(e => {
                    const badge = stateBadge(e.state)
                    return (
                        <li key={e.userId} className={cx('gm-share__chip', e.state !== 'ACTIVE' && 'gm-share__chip--muted')}>
                            <span className="gm-share__chip-name">{e.name ?? e.userId}</span>
                            {e.name && <span className="gm-share__chip-sub">{e.userId}</span>}
                            {badge && <span className="gm-share__badge">{badge}</span>}
                            <button type="button" onClick={() => onRemove(e.userId)} disabled={disabled}
                                aria-label={`${e.userId} 제거`} className="gm-share__chip-x"><X size={11} /></button>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
