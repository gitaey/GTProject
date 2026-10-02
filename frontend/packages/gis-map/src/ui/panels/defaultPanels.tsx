'use client'

// 패키지가 기본으로 주는 패널 3개(레이어·TIFF·나만의지도). MapShell panels를 안 주면 이 목록을 쓴다.
// 호스트 패널을 더하려면: panels={[...defaultPanels, { id: 'etc', label: '기타', icon: MoreHorizontal, render: () => <EtcPanel /> }]}
import { Aperture, Layers, Map as MapIcon } from 'lucide-react'
import LayerPanel from '../layer/LayerPanel'
import ImagePanel from './ImagePanel'
import MyMapPanel from './MyMapPanel'
import type { MapPanelDef } from '../shell/types'

/** 레이어 트리 패널(featureId 'map.panel.layer') */
export const layerPanel: Readonly<MapPanelDef> = Object.freeze({
    id: 'layer', label: '레이어', icon: Layers, featureId: 'map.panel.layer', render: () => <LayerPanel />,
})

/** GeoTIFF(항공영상) 패널(featureId 'map.panel.image') — 짝 백엔드 geoTiff 소스가 필요하다 */
export const imagePanel: Readonly<MapPanelDef> = Object.freeze({
    id: 'image', label: 'TIFF', icon: Aperture, featureId: 'map.panel.image', render: () => <ImagePanel />,
})

/** 나만의지도 패널(featureId 'map.panel.mymap') — 짝 백엔드 myMap 소스가 필요하다 */
export const myMapPanel: Readonly<MapPanelDef> = Object.freeze({
    id: 'mymap', label: '나만의지도', icon: MapIcon, featureId: 'map.panel.mymap', render: () => <MyMapPanel />,
})

/** 기본 패널 목록(이 순서로 네비에 나온다) */
export const defaultPanels: readonly MapPanelDef[] = Object.freeze([layerPanel, imagePanel, myMapPanel])
