'use client'

// MapShell 조립(데모용): 브랜드·패널·사용자 메뉴를 넣고, OSM 배경을 골랐을 때는 머리줄 일반/위성 단추를 숨긴다(OSM이 위를 덮어 보이므로
// 단추가 먹통처럼 보이는 것을 막는다 — 되돌리는 것은 안내 띠의 VWorld 단추). 배경지도 출처 문구를 지도 오른쪽 아래에 둔다.
import type { DemoBasemap } from '@gtp/gis-map/adapters/memory'
import { MapShell } from '@gtp/gis-map/ui'
import { DEMO_BRAND, DEMO_PANELS, DEMO_USER_MENU, useOsmOn } from './demoConfig'

export interface DemoShellProps {
    basemap: DemoBasemap
    /** 처음 열 패널(마운트 때 한 번만 읽는다 — 바꾸려면 key를 바꿔 다시 마운트) */
    panel: string | null
    onPanelChange: (panel: string | null) => void
}

export function attributionText(basemap: DemoBasemap, osmOn: boolean): string {
    const base = basemap === 'osm' || osmOn ? '© OpenStreetMap contributors' : '배경지도: 브이월드(국토교통부)'
    return base + ' · 샘플(가상) 데이터'
}

export default function DemoShell({ basemap, panel, onPanelChange }: DemoShellProps) {
    const osmOn = useOsmOn()
    return (
        <MapShell brand={DEMO_BRAND} panels={DEMO_PANELS} defaultPanel={panel} onPanelChange={onPanelChange}
            userMenuItems={DEMO_USER_MENU} showBasemapSwitcher={basemap === 'both' && !osmOn}>
            <div className="demo-attr">{attributionText(basemap, osmOn)}</div>
        </MapShell>
    )
}
