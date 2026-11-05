'use client'

// 엔진 하나를 만들어(또는 기존 ol.Map에 붙여) 아래 위젯들에 내려준다.
// 생성은 effect 안에서만 한다 → SSR에서 OL이 DOM을 건드리지 않고, StrictMode의 생성→정리→생성에도 누수가 없다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type OlMap from 'ol/Map'
import { attachGisMap, createGisMap, DEFAULT_HOST, mergeHost } from '../core'
import type { GisMap, GisMapConfig, PartialGisMapHost } from '../core'
import { GisMapContext } from './context'
import type { GisMapContextValue } from './context'
import { GisMapFactoryContext } from './split/context'
import type { GisMapFactoryValue, GisMapSetupInfo } from './split/context'

export interface GisMapProviderProps {
    /** 최초 렌더 1회만 사용(바꿔도 엔진을 다시 만들지 않음). target은 <GisMapView>가 준다 */
    config?: Omit<GisMapConfig, 'target' | 'host'>
    /** 바뀔 때마다 map.setHost(host) — 엔진은 유지 */
    host?: PartialGisMapHost
    /**
     * 엔진 생성 직후 1회(플러그인 설치 등). 두 번째 인자 info.pane = 분할 번호(이 Provider가 만든 지도는 0,
     * 화면 분할로 더 만든 지도는 1~3). 한 인자만 받는 함수도 그대로 넘길 수 있다
     */
    setup?: (map: GisMap, info: GisMapSetupInfo) => void
    /** 이미 만든 ol.Map에 붙이기(선택). 주면 attachGisMap을 쓰고 <GisMapView>는 필요 없다 */
    attachTo?: OlMap
    children: ReactNode
}

/** 이 Provider가 만든 기본 지도의 setup 정보(얼린 상수 — 렌더마다 새로 만들지 않는다) */
const FIRST_PANE: GisMapSetupInfo = Object.freeze({ pane: 0 })

export function GisMapProvider({ config, host, setup, attachTo, children }: GisMapProviderProps) {
    const [map, setMap] = useState<GisMap | null>(null)

    const configRef = useRef(config)
    const hostRef = useRef(host)
    hostRef.current = host
    const setupRef = useRef(setup)
    setupRef.current = setup
    /** 엔진에 마지막으로 넣은 host 객체(같은 객체면 setHost를 건너뜀) */
    const appliedHostRef = useRef<PartialGisMapHost | undefined>(undefined)

    const mapRef = useRef<GisMap | null>(null)
    const targetRef = useRef<HTMLDivElement | null>(null)

    // GisMapView의 콜백 ref. 엔진 생성보다 먼저 불려도, 나중에 불려도 동작한다
    const setTarget = useCallback((el: HTMLDivElement | null) => {
        targetRef.current = el
        const m = mapRef.current
        if (!m || !m.owned) return
        if (el) m.mount(el)
        else m.unmount()
    }, [])

    useEffect(() => {
        const cfg = configRef.current ?? {}
        const initialHost = hostRef.current
        let m: GisMap
        if (attachTo) {
            const { view: _view, ...attachOptions } = cfg
            void _view
            m = attachGisMap(attachTo, { ...attachOptions, host: initialHost })
        } else {
            m = createGisMap({ ...cfg, host: initialHost })
            if (targetRef.current) m.mount(targetRef.current)
        }
        mapRef.current = m
        appliedHostRef.current = initialHost
        setupRef.current?.(m, FIRST_PANE)
        setMap(m)
        return () => {
            if (mapRef.current === m) mapRef.current = null
            setMap(cur => (cur === m ? null : cur))
            m.destroy()
        }
    }, [attachTo])

    useEffect(() => {
        if (!map || !host || host === appliedHostRef.current) return
        appliedHostRef.current = host
        map.setHost(host)
    }, [map, host])

    const fallbackHost = useMemo(() => mergeHost(DEFAULT_HOST, host), [host])
    const value = useMemo<GisMapContextValue>(
        () => ({ map, setTarget, host: fallbackHost }),
        [map, setTarget, fallbackHost],
    )

    // 화면 분할 Provider가 "같은 설정의 지도를 더 만들" 재료. config는 최초 렌더 값(엔진 생성과 같은 규칙), setup은 항상 최신 prop을 부른다
    const callSetup = useCallback((m: GisMap, info: GisMapSetupInfo) => setupRef.current?.(m, info), [])
    const factory = useMemo<GisMapFactoryValue>(
        () => ({ config: configRef.current, host, setup: callSetup, canSpawn: !attachTo }),
        [host, callSetup, attachTo],
    )

    return (
        <GisMapFactoryContext.Provider value={factory}>
            <GisMapContext.Provider value={value}>{children}</GisMapContext.Provider>
        </GisMapFactoryContext.Provider>
    )
}
