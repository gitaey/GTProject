'use client'

// 나만의지도 패널의 탭 두 개 — `내 레이어 3` / `공유받은 1`. 한 번에 한쪽 목록만 보인다(지도에 켠 레이어는 탭과 무관하게 그대로).
// 접근성: role=tablist/tab, aria-selected, 선택된 탭만 Tab 순서에 들어가고(roving tabindex) ←→·Home·End로 옮긴다(옮기면 바로 선택).
// 선택 표시는 글자 굵기 + 아래 줄 + 색(색만으로 구분하지 않는다). 높이 36px(누르는 영역 32px 이상). 스타일: gm-mymap-panel__tabs 계열
import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { cx } from '../cx'
import { formatCount } from './format'
import type { ListTab } from './listModel'

interface MyMapTabsProps {
    active: ListTab
    ownedCount: number
    sharedCount: number
    onChange: (tab: ListTab) => void
    /** 탭·패널 id의 공통 앞부분(패널이 aria-controls·aria-labelledby에 같은 규칙으로 쓴다) */
    idBase: string
}

/** 접근 이름은 보이는 글자(`내 레이어 3`·`공유받은 1`)로 시작해 이어지게 한다(음성 조작이 보이는 글자로 눌러지게) — suffix만 덧붙인다 */
const TABS: readonly { id: ListTab; label: string; suffix: string }[] = Object.freeze([
    Object.freeze({ id: 'owned' as ListTab, label: '내 레이어', suffix: '개' }),
    Object.freeze({ id: 'shared' as ListTab, label: '공유받은', suffix: '개 레이어' }),
])

export function tabId(idBase: string, tab: ListTab): string {
    return `${idBase}-tab-${tab}`
}

export function tabPanelId(idBase: string): string {
    return `${idBase}-panel`
}

export default function MyMapTabs({ active, ownedCount, sharedCount, onChange, idBase }: MyMapTabsProps) {
    const refs = useRef<Record<ListTab, HTMLButtonElement | null>>({ owned: null, shared: null })

    const move = (to: ListTab) => {
        onChange(to)
        refs.current[to]?.focus()
    }
    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault()
            move(active === 'owned' ? 'shared' : 'owned')
        } else if (e.key === 'Home') {
            e.preventDefault()
            move('owned')
        } else if (e.key === 'End') {
            e.preventDefault()
            move('shared')
        }
    }

    return (
        <div className="gm-mymap-panel__tabs" role="tablist" aria-label="나만의지도 목록 구분" onKeyDown={onKeyDown}>
            {TABS.map(t => {
                const count = t.id === 'owned' ? ownedCount : sharedCount
                const selected = active === t.id
                return (
                    <button key={t.id} type="button" role="tab" id={tabId(idBase, t.id)} aria-selected={selected}
                        aria-controls={tabPanelId(idBase)} tabIndex={selected ? 0 : -1}
                        aria-label={`${t.label} ${formatCount(count)}${t.suffix}`}
                        ref={el => { refs.current[t.id] = el }}
                        className={cx('gm-mymap-panel__tab', selected && 'gm-is-selected')}
                        onClick={() => onChange(t.id)}>
                        <span>{t.label}</span>
                        <span className="gm-mymap-panel__tab-count">{formatCount(count)}</span>
                    </button>
                )
            })}
        </div>
    )
}
