'use client'

// 머리줄 분할 셀렉트 + 화면 연동 토글. GisMapSplitProvider 안에서만 보인다(바깥이거나 붙이기 모드면 아무것도 안 그림).
// 네이티브 <select>라 키보드·스크린리더가 그대로 된다. 연동 단추는 분할 중에만 나온다.
import { ChevronDown, LayoutGrid, Link2, Unlink } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useGisMapSplit } from '../../react'
import type { GisMapSplitCount } from '../../react'
import { cx } from '../cx'
import { DEFAULT_SPLIT_COUNTS } from './layout'

export interface MapSplitSelectProps {
    /** 셀렉트 선택지(순서대로). 기본 [1, 2, 3, 4] */
    counts?: readonly GisMapSplitCount[]
}

function countLabel(count: GisMapSplitCount): string {
    return count === 1 ? '분할 없음' : count + '분할'
}

export default function MapSplitSelect({ counts = DEFAULT_SPLIT_COUNTS }: MapSplitSelectProps) {
    const split = useGisMapSplit()
    if (!split || !split.available) return null

    const { count, sync, setCount, setSync } = split
    const onChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const next = Number(e.target.value)
        if (next === 1 || next === 2 || next === 3 || next === 4) setCount(next)
    }

    return (
        <div className="gm-split-ctl">
            <label className="gm-split-select" title="화면 분할">
                <LayoutGrid size={14} className="gm-split-select__icon" />
                <select className="gm-split-select__select" aria-label="화면 분할" value={count} onChange={onChange}>
                    {counts.map(n => <option key={n} value={n}>{countLabel(n)}</option>)}
                </select>
                <ChevronDown size={12} className="gm-split-select__chev" />
            </label>
            {count > 1 && (
                <button type="button" className={cx('gm-split-sync', sync && 'gm-is-active')} aria-pressed={sync}
                    title={sync ? '화면 연동 끄기' : '화면 연동 켜기'} onClick={() => setSync(!sync)}>
                    {sync ? <Link2 size={14} /> : <Unlink size={14} />}
                    {sync ? '화면 연동' : '연동 끔'}
                </button>
            )}
        </div>
    )
}
