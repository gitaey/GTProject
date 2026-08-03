'use client'

import { useEffect, useState } from 'react'
import Map from 'ol/Map'
import { toLonLat } from 'ol/proj'

export function useRegionName(map: Map | null): { region: string; loading: boolean } {
    const [region, setRegion]   = useState<string>('')
    const [loading, setLoading] = useState<boolean>(false)

    useEffect(() => {
        if (!map) return

        async function fetchRegion(lon: number, lat: number) {
            try {
                const url = `/proxy/region?lon=${lon}&lat=${lat}`
                const res = await fetch(url)
                const json = await res.json()

                const result = json?.response?.result?.[0]
                if (!result) {
                    setRegion('-')
                    return
                }

                const text = (result.text as string).replace(/\s+(산\s*)?\d+(-\d+)*$/, '').trim()
                setRegion(text)
            } catch {
                setRegion('-')
            } finally {
                setLoading(false)
            }
        }

        function handleMoveStart() {
            setLoading(true)
        }

        function handleMoveEnd() {
            const center = map!.getView().getCenter()
            if (!center) return
            const [lon, lat] = toLonLat(center, 'EPSG:3857')
            fetchRegion(lon, lat)
        }

        map.on('movestart', handleMoveStart)
        map.on('moveend', handleMoveEnd)
        handleMoveEnd()

        return () => {
            map.un('movestart', handleMoveStart)
            map.un('moveend', handleMoveEnd)
        }
    }, [map])

    return { region, loading }
}
