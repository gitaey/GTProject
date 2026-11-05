'use client'

// 사이드 패널 위 "대상 지도" 탭. 분할 중(칸 2개 이상)에만 그린다 — 눌러서 활성 지도를 바꾼다.
// 패널 안의 레이어·TIFF·나만의지도는 활성 지도에 적용되므로 이 탭이 "지금 어느 지도를 만지는지"의 손잡이다.
// 아직 만들어지지 않은 지도(엔진 생성 직후 한 틱)는 눌러도 무시되므로 흐리게 보인다.
import { useGisMapSplit } from '../../react'
import { cx } from '../cx'

export default function MapSplitTargetTabs() {
    const split = useGisMapSplit()
    if (!split || !split.available || split.count < 2) return null

    const { count, activeIndex, panes, setActive } = split
    const tabs: number[] = []
    for (let i = 0; i < count; i++) tabs.push(i)

    return (
        <div className="gm-split-tabs" role="tablist" aria-label="대상 지도">
            <em className="gm-split-tabs__label">대상 지도</em>
            {tabs.map(i => (
                <button key={i} type="button" role="tab" aria-selected={i === activeIndex}
                    className={cx('gm-split-tabs__tab', i === activeIndex && 'gm-is-active')}
                    disabled={panes[i] === null} title={'지도 ' + (i + 1)} onClick={() => setActive(i)}>
                    {i + 1}
                </button>
            ))}
        </div>
    )
}
