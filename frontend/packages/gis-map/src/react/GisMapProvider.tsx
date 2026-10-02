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

export interface GisMapProviderProps {
    /** 최초 렌더 1회만 사용(바꿔도 엔진을 다시 만들지 않음). target은 <GisMapView>가 준다 */
    config?: Omit<GisMapConfig, 'target' | 'host'>
    /** 바뀔 때마다 map.setHost(host) — 엔진은 유지 */
    host?: PartialGisMapHost
    /** 엔진 생성 직후 1회(플러그인 설치 등) */
    setup?: (map: GisMap) => void
    /** 이미 만든 ol.Map에 붙이기(선택). 주면 attachGisMap을 쓰고 <GisMapView>는 필요 없다 */
    attachTo?: OlMap
    children: ReactNode
}

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
        setupRef.current?.(m)
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

    return <GisMapContext.Provider value={value}>{children}</GisMapContext.Provider>
}
