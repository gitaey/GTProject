'use client'

// Provider와 훅이 함께 쓰는 Context. 위젯은 가장 가까운 Provider의 엔진만 본다.
import { createContext } from 'react'
import type { GisMap, GisMapHost } from '../core'

export interface GisMapContextValue {
    /** 엔진. 생성 전(SSR/첫 렌더)에는 null */
    map: GisMap | null
    /** GisMapView가 지도 div를 넘기는 콜백 ref */
    setTarget: (el: HTMLDivElement | null) => void
    /** 엔진 생성 전에 쓸 호스트 값(host prop + 기본값) */
    host: GisMapHost
}

export const GisMapContext = createContext<GisMapContextValue | null>(null)
