'use client'

// 좌측 컨텐츠 패널 컨테이너 (FE-5b-1: 옛 panel/PanelLeft)
// 브레이크포인트별 동작(gis-map-ui.css .gm-side-panel):
//   모바일 (<768px):  표시 안 함 (MobileLayerButton 사용)
//   태블릿 (768px~):  absolute → 지도 위에 떠서 겹침 (지도 크기 유지)
//   데스크탑 (1024px+): relative + 줄어들지 않음 → 지도 옆에 고정 (지도가 줄어듦)
// FE-5c: 내용 = 열린 패널 정의의 render(map). 패널이 바뀌면 key(패널 id)로 내용을 새로 마운트한다(옛: 패널마다 다른 자리)
// 화면 분할 중(split)에는 위에 "대상 지도" 탭을 두고, key에 지도 id를 더해 활성 지도가 바뀌면 패널을 새로 마운트한다
// (패널 안 로컬 상태 — 목록·열린 대화상자·선택 — 가 이전 지도 것으로 남지 않게). 분할이 아니면 지금 그대로(패널 id만).
import { Fragment } from 'react'
import type { GisMap } from '../../core'
import MapSplitTargetTabs from '../split/MapSplitTargetTabs'
import type { MapPanelDef } from './types'

export interface SidePanelProps {
    /** 열린 패널(없으면 패널을 그리지 않는다) — 상태는 지도 화면(MapShell)이 가진다 */
    panel: MapPanelDef | null
    map: GisMap | null
    /** 화면 분할 중(칸 2개 이상). 대상 지도 탭을 보이고 패널을 지도마다 새로 마운트한다. 기본 false */
    split?: boolean
}

export default function SidePanel({ panel, map, split = false }: SidePanelProps) {

    if (!panel) return null

    // 화면 전체에 걸린 패널(설정): 대상 지도 탭 없이, 지도가 바뀌어도 다시 마운트하지 않는다
    if (panel.scope === 'shell') {
        return (
            <div className="gm-side-panel">
                <Fragment key={panel.id}>{panel.render(map)}</Fragment>
            </div>
        )
    }

    if (!split) {
        return (
            <div className="gm-side-panel">
                <Fragment key={panel.id}>{panel.render(map)}</Fragment>
            </div>
        )
    }

    return (
        <div className="gm-side-panel">
            <MapSplitTargetTabs />
            <div className="gm-side-panel__body">
                <Fragment key={map ? panel.id + ':' + map.id : panel.id}>{panel.render(map)}</Fragment>
            </div>
        </div>
    )
}
