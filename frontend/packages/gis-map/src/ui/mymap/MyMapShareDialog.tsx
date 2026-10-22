'use client'

// 나만의지도 공유 — 범용 ShareDialog(ui/share)에 나만의지도 소스를 연결하는 얇은 래퍼.
//   · 저장소: map.sources.myMap.shareTarget, 없으면 옛 getShare/setShare를 legacyShareTarget으로 감싼다(단일 모드만)
//   · 상대 찾기: map.sources.shareDirectory(없으면 아이디·코드 직접 입력)
//   · 본인 아이디: host.getCurrentUser()
// 스타일: gm-modal · gm-share-* (styles/gis-map-ui.css)
import { useMemo } from 'react'
import type { BulkShareResult } from '../../core'
import { useGisHost, useGisMap } from '../../react'
import ShareDialog from '../share/ShareDialog'
import { legacyShareTarget } from '../share/legacyShareTarget'

interface MyMapShareDialogProps {
    /** 하나면 단일 공유, 둘 이상이면 일괄 공유(소스에 bulk가 있을 때) */
    items: ReadonlyArray<{ id: number; name: string }>
    /** 선택 모드에서 하나만 골라 연 경우 — 일괄이 아니라 현재 공유 목록을 편집한다는 안내를 붙인다 */
    fromSelection?: boolean
    onClose: () => void
    onDone?: (result?: BulkShareResult) => void
}

export default function MyMapShareDialog({ items, fromSelection, onClose, onDone }: MyMapShareDialogProps) {
    // 소스 객체는 엔진마다 하나(참조 고정) → 대상·effect가 다시 돌지 않는다
    const map = useGisMap()
    const myMap = map?.sources.myMap
    const directory = map?.sources.shareDirectory
    const host = useGisHost()
    const target = useMemo(() => myMap?.shareTarget ?? legacyShareTarget(myMap), [myMap])
    const selfUserId = host.getCurrentUser()?.userId ?? null

    return (
        <ShareDialog target={target} directory={directory} items={items} resourceNoun="레이어"
            selfUserId={selfUserId}
            intro={fromSelection && items.length === 1 ? '레이어 1개 — 현재 공유 목록을 편집합니다' : undefined} onClose={onClose} onDone={onDone} />
    )
}
