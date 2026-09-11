// 바람길 레이어 — 백엔드가 6시간마다 갱신하는 GFS 바람 데이터(grib2json 포맷)를
// ol-wind의 WindLayer로 렌더링한다.
// 기상청 바람예상도처럼 단색(흰색 계열) 가는 선으로 간결하게 표시한다.
import { useEffect, useRef } from 'react'
import Map from 'ol/Map'
import { WindLayer } from 'ol-wind'
import { getToken } from '@/stores/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export function useWindLayer(map: Map | null, enabled: boolean) {
    const layerRef = useRef<InstanceType<typeof WindLayer> | null>(null)

    useEffect(() => {
        if (!map) return

        if (!enabled) {
            if (layerRef.current) {
                map.removeLayer(layerRef.current)
                layerRef.current = null
            }
            return
        }

        let cancelled = false

        const load = async () => {
            try {
                const token = getToken()
                const res = await fetch(`${API}/api/wind/latest`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                })
                const json = await res.json()
                if (cancelled || !json.success) return

                const layer = new WindLayer(json.data, {
                    windOptions: {
                        velocityScale: 1 / 70,
                        paths: 1200,
                        lineWidth: 1,
                        colorScale: 'rgba(255,255,255,0.85)',
                        globalAlpha: 0.94, // 값이 클수록 잔상이 빨리 지워짐(간결하게)
                    },
                })
                map.addLayer(layer)
                layerRef.current = layer
            } catch {
                /* 바람길 데이터가 아직 준비되지 않았을 수 있음 — 조용히 무시 */
            }
        }

        load()

        return () => {
            cancelled = true
            if (layerRef.current) {
                map.removeLayer(layerRef.current)
                layerRef.current = null
            }
        }
    }, [map, enabled])
}
