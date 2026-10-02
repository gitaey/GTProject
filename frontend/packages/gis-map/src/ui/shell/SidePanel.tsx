'use client'

// 좌측 컨텐츠 패널 컨테이너 (FE-5b-1: 옛 panel/PanelLeft)
// 브레이크포인트별 동작(gis-map-ui.css .gm-side-panel):
//   모바일 (<768px):  표시 안 함 (MobileLayerButton 사용)
//   태블릿 (768px~):  absolute → 지도 위에 떠서 겹침 (지도 크기 유지)
//   데스크탑 (1024px+): relative + 줄어들지 않음 → 지도 옆에 고정 (지도가 줄어듦)
// FE-5c: 내용 = 열린 패널 정의의 render(map). 패널이 바뀌면 key(패널 id)로 내용을 새로 마운트한다(옛: 패널마다 다른 자리)
import { Fragment } from 'react'
import type { GisMap } from '../../core'
import type { MapPanelDef } from './types'

export interface SidePanelProps {
    /** 열린 패널(없으면 패널을 그리지 않는다) — 상태는 지도 화면(MapShell)이 가진다 */
    panel: MapPanelDef | null
    map: GisMap | null
}

export default function SidePanel({ panel, map }: SidePanelProps) {

    if (!panel) return null

    return (
        <div className="gm-side-panel">
            <Fragment key={panel.id}>{panel.render(map)}</Fragment>
        </div>
    )
}
