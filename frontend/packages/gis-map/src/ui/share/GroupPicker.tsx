'use client'

// 공유 상대(역할·세부권한) 고르기 — 한글 이름 체크 목록. 자원과 무관(ShareDialog가 쓴다).
//   · 디렉터리의 listGroups()를 마운트 때 한 번 받는다. 역할 아래에 세부권한(부서)을 들여쓴다 — 체크는 서로 독립(역할 전체 ≠ 세부권한)
//   · 코드(`역할:세부`)는 회색 작은 글씨로만. 8개를 넘으면 위에 걸러보기 입력
//   · 목록에 없는 선택값(옛 코드·삭제된 역할)은 맨 아래 "목록에 없는 역할" 칩 — 지울 수 있다
//   · 디렉터리가 없거나 경로가 없는 서버(404·405)면 코드 직접 입력 + 칩
import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { GisHttpError } from '../../core'
import type { ShareDirectorySource, ShareGroup } from '../../core'
import { cx } from '../cx'
import { buildGroupTree, filterGroupTree, parseDirectInput, unlistedCodes } from './shareModel'

/** 이 개수를 넘으면 걸러보기 입력을 단다 */
const FILTER_THRESHOLD = 8

interface GroupPickerProps {
    directory?: ShareDirectorySource
    /** 고른 그룹 코드 */
    selected: readonly string[]
    /** 저장된 값의 이름(코드 → 한글 이름). 목록에 없는 코드 칩에 쓴다 */
    labels?: Readonly<Record<string, string | null>>
    onToggle: (code: string) => void
    disabled?: boolean
}

type Load = { status: 'loading' } | { status: 'ok'; groups: ShareGroup[] } | { status: 'error'; message: string } | { status: 'direct' }

export default function GroupPicker({ directory, selected, labels, onToggle, disabled }: GroupPickerProps) {
    const [load, setLoad] = useState<Load>(() => (directory ? { status: 'loading' } : { status: 'direct' }))
    const [filter, setFilter] = useState('')
    const [text, setText] = useState('')
    const [retry, setRetry] = useState(0)

    useEffect(() => {
        if (!directory) { setLoad({ status: 'direct' }); return }
        let alive = true
        setLoad({ status: 'loading' })
        directory.listGroups().then(groups => {
            if (alive) setLoad({ status: 'ok', groups })
        }, (err: unknown) => {
            if (!alive) return
            if (err instanceof GisHttpError && (err.status === 404 || err.status === 405)) setLoad({ status: 'direct' })
            else setLoad({ status: 'error', message: err instanceof Error && err.message ? err.message : '역할 목록을 불러오지 못했습니다.' })
        })
        return () => { alive = false }
    }, [directory, retry])

    const chip = (code: string, badge?: string) => (
        <li key={code} className={cx('gm-share__chip', badge && 'gm-share__chip--muted')}>
            <span className="gm-share__chip-name">{labels?.[code] ?? code}</span>
            {labels?.[code] && <span className="gm-share__chip-sub">{code}</span>}
            {badge && <span className="gm-share__badge">{badge}</span>}
            <button type="button" onClick={() => onToggle(code)} disabled={disabled}
                aria-label={`${code} 제거`} className="gm-share__chip-x"><X size={11} /></button>
        </li>
    )

    if (load.status === 'loading') {
        return <div className="gm-share__hint"><Loader2 size={11} className="gm-loader" /> 역할 목록을 불러오는 중</div>
    }
    if (load.status === 'error') {
        return (
            <div className="gm-share__hint gm-share__hint--error" role="alert">
                {load.message}
                <button type="button" className="gm-share__link" onClick={() => setRetry(n => n + 1)}>다시 시도</button>
            </div>
        )
    }
    if (load.status === 'direct') {
        const add = () => {
            for (const code of parseDirectInput(text)) if (!selected.includes(code)) onToggle(code)
            setText('')
        }
        return (
            <div className="gm-share__picker">
                <div className="gm-share__search">
                    <input value={text} onChange={e => setText(e.target.value)} disabled={disabled}
                        onKeyDown={e => {
                            if ((e.nativeEvent as { isComposing?: boolean } | undefined)?.isComposing) return
                            if (e.key === 'Enter') { e.preventDefault(); add() }
                        }}
                        placeholder="역할 코드 (콤마로 여러 개)" aria-label="공유할 역할 코드"
                        className="gm-modal__field gm-share__search-input" />
                    <button type="button" onClick={add} disabled={disabled || parseDirectInput(text).length === 0}
                        className="gm-share__add">추가</button>
                </div>
                <ul className="gm-share__chips" aria-label="공유할 역할">
                    {selected.length === 0 && <li className="gm-share__empty">선택한 역할 없음</li>}
                    {selected.map(code => chip(code))}
                </ul>
            </div>
        )
    }

    const tree = buildGroupTree(load.groups)
    const shown = filterGroupTree(tree, filter)
    const unlisted = unlistedCodes(selected, load.groups)
    const row = (g: ShareGroup, child: boolean) => (
        <label key={g.code} className={cx('gm-share__group', child && 'gm-share__group--child')}>
            <input type="checkbox" checked={selected.includes(g.code)} disabled={disabled}
                onChange={() => onToggle(g.code)} className="gm-panel__item-check" />
            <span className="gm-share__group-name">{g.label}</span>
            <span className="gm-share__group-code">{g.code}</span>
        </label>
    )
    return (
        <div className="gm-share__picker">
            {load.groups.length > FILTER_THRESHOLD && (
                <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="역할 걸러보기"
                    aria-label="역할 걸러보기" className="gm-modal__field" />
            )}
            <div className="gm-share__groups" role="group" aria-label="공유할 역할">
                {load.groups.length === 0 && <div className="gm-share__empty">공유할 수 있는 역할이 없습니다.</div>}
                {load.groups.length > 0 && shown.length === 0 && <div className="gm-share__empty">일치하는 역할이 없습니다.</div>}
                {shown.map(n => (
                    <div key={n.group.code} className="gm-share__group-block">
                        {row(n.group, false)}
                        {n.children.map(c => row(c, true))}
                    </div>
                ))}
            </div>
            {unlisted.length > 0 && (
                <div className="gm-share__unlisted">
                    <div className="gm-share__sub-title">목록에 없는 역할</div>
                    <ul className="gm-share__chips">{unlisted.map(code => chip(code, '목록에 없음'))}</ul>
                </div>
            )}
        </div>
    )
}
