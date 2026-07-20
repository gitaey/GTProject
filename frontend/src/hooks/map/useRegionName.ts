'use client'

import { useEffect, useState, useRef } from 'react'
import Map from 'ol/Map'
import { toLonLat } from 'ol/proj'

export function useRegionName(map: Map | null): string {
    const [region, setRegion] = useState<string>('')
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!map) return

        async function fetchRegion(lon: number, lat: number) {
            try {
                const url = `/api/region?lon=${lon}&lat=${lat}`
                const res = await fetch(url)
                const json = await res.json()

                const result = json?.response?.result?.[0]
                if (!result) {
                    setRegion("-")
                    return
                }

                // text 예시: "세종특별자치시 연서면 신대리 123-45"
                // 끝의 번지수(숫자 및 -숫자)만 제거
                const text = (result.text as string).replace(/\s+(산\s*)?\d+(-\d+)*$/, '').trim()
                setRegion(text)
            } catch {
                // 네트워크 오류시 '-' 표시
                setRegion("-")
            }
        }

        function handleMoveEnd() {
            if (timerRef.current) clearTimeout(timerRef.current)
            timerRef.current = setTimeout(() => {
                const center = map!.getView().getCenter()
                if (!center) return
                const [lon, lat] = toLonLat(center, 'EPSG:3857')
                fetchRegion(lon, lat)
            }, 500)
        }

        map.on('moveend', handleMoveEnd)
        handleMoveEnd() // 초기 로드 시 1회 실행

        return () => {
            map.un('moveend', handleMoveEnd)
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [map])

    return region
}
