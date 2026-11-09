'use client'

// 기타 기능 패널 - 지도 좌측 사이드바의 '기타(⋯)' 탭에서 렌더링(GTProject 전용 연결부, 지도 패키지 아님).
// 껍데기만 둔다: 머리줄은 다른 패널과 같은 gm-panel 클래스, 본문은 도구 카드 목록(etc/etcTools.tsx).
// 새 도구는 etc/etcTools.tsx의 ETC_TOOLS에 한 줄 추가.

import { useCallback, useState } from 'react'
import EtcToolCard from './etc/EtcToolCard'
import { ETC_THEME_VARS } from './etc/EtcParts'
import { ETC_TOOLS } from './etc/etcTools'

export default function EtcPanel() {
    // 펼침 상태: 처음엔 모두 접힘. 작업 중이거나 결과가 남은 도구는 패널을 다시 열 때 펼쳐 둔다. 여러 개를 동시에 펼칠 수 있다.
    const [open, setOpen] = useState<ReadonlySet<string>>(
        () => new Set(ETC_TOOLS.filter((t) => t.isActive?.() === true).map((t) => t.id)),
    )
    const toggle = useCallback((id: string) => {
        setOpen((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    return (
        // 루트가 --etc-* 별칭을 정한다(화면 테마의 --gm-* 를 읽음). 바탕은 .gm-panel(--gm-surface), 글자색을 안 준 요소는 여기서 상속
        <div className="gm-panel text-(--etc-text)" style={ETC_THEME_VARS}>
            <div className="gm-panel__header">
                <span className="gm-panel__title">기타 기능</span>
            </div>
            <div className="gm-panel__list">
                <div className="flex flex-col gap-2 p-2.5">
                    {ETC_TOOLS.map((tool) => (
                        <EtcToolCard key={tool.id} tool={tool} open={open.has(tool.id)} onToggle={toggle} />
                    ))}
                </div>
            </div>
        </div>
    )
}
