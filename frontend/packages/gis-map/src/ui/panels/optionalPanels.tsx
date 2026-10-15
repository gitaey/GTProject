'use client'

// 옵션 패널 정의 — defaultPanels에 들어 있지 않다. 해당 기능의 플러그인·소스를 설치한 호스트만 panels에 더한다.
//   <MapShell panels={[...defaultPanels, windPanel, 호스트 패널]} />
// 플러그인이 없는 지도에서 열려도 패널이 "설치되지 않았습니다"로 안전하게 보인다(네비 버튼이 없도록 목록에 안 넣는 것이 기본).
import { Wind } from 'lucide-react'
import WindPanel from './WindPanel'
import type { MapPanelDef } from '../shell/types'

/** 바람지도 패널(바람길 플러그인 필요). 권한 기능 ID는 툴바 바람 버튼과 같은 'map.tool.wind' — 그 버튼을 쓸 수 있는 사용자만 탭이 보인다 */
export const windPanel: Readonly<MapPanelDef> = Object.freeze({
    id: 'wind', label: '바람지도', icon: Wind, featureId: 'map.tool.wind', render: () => <WindPanel />,
})
