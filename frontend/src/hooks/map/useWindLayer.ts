// 바람길 레이어 — 백엔드가 6시간마다 갱신하는 GFS 바람 데이터(grib2json 포맷)를
// ol-wind의 WindLayer로 렌더링한다.
// 기상청 바람예상도처럼 단색(흰색 계열) 가는 선으로 간결하게 표시한다.
import { useEffect, useRef } from 'react'
import Map from 'ol/Map'
import { WindLayer } from 'ol-wind'
import { getToken } from '@/stores/authStore'
import { windSpeedColor } from '@/lib/windColorScale'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

// LDAPS 격자 해상도(~2.2km)보다 훨씬 가깝게 확대하면 데이터가 표현할 수 있는
// 수준을 넘어서므로, 지도 해상도(m/px)가 이보다 작아지면(더 확대되면) 레이어를 숨긴다.
const MIN_RESOLUTION = 8

// ol-wind는 매 프레임 지리좌표를 화면 픽셀로 다시 투영하기 때문에, velocityScale이
// 고정값이면 확대할수록 같은 지리적 이동거리가 화면에서 훨씬 길게 그려진다.
// 줌13(세종시 전체, 해상도 ≈14m/px)에서 velocityScale 0.003이 적당했던 걸 기준으로,
// 해상도에 비례해서 velocityScale을 재계산하면 화면상 선 길이가 줌과 무관하게 일정해진다.
const VELOCITY_SCALE_PER_RESOLUTION = 0.003 / 14
const MIN_VELOCITY_SCALE = 0.0005
const MAX_VELOCITY_SCALE = 0.02

function velocityScaleForResolution(resolution: number): number {
    // const scale = VELOCITY_SCALE_PER_RESOLUTION * resolution
    const scale = 0.00001 * resolution
    return scale
}

// paths(선 개수): 지도에서 가능한 최대 줌아웃일 때 500개, 최대 줌인일 때 80개가 되도록
// 현재 해상도를 [minResolution, maxResolution] 구간에서 선형으로 매핑한다.
const MIN_PATHS = 80
const MAX_PATHS = 500

function pathsForResolution(resolution: number, minResolution: number, maxResolution: number): number {
    if (maxResolution <= minResolution) return MAX_PATHS
    const t = (resolution - minResolution) / (maxResolution - minResolution) // 0(최대 줌인) ~ 1(최대 줌아웃)
    const clamped = Math.max(0, Math.min(1, t))
    return Math.round(MIN_PATHS + (MAX_PATHS - MIN_PATHS) * clamped)
}

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
        let unsubscribeResolution: (() => void) | null = null

        const load = async () => {
            try {
                const token = getToken()
                const res = await fetch(`${API}/api/wind/latest`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                })
                const json = await res.json()
                if (cancelled || !json.success) return

                const view = map.getView()
                const initialResolution = view.getResolution() ?? 14
                const minResolution = view.getMinResolution()
                const maxResolution = view.getMaxResolution()

                const layer = new WindLayer(json.data, {
                    windOptions: {
                        velocityScale: velocityScaleForResolution(initialResolution),
                        paths: pathsForResolution(initialResolution, minResolution, maxResolution),
                        frameRate: 50,
                        lineWidth: 2.5,
                        colorScale: windSpeedColor,
                    },
                })
                // LDAPS 격자(약 2.2km)보다 훨씬 가깝게 확대하면(대략 동 블록 단위 이하)
                // 실제 데이터가 표현할 수 있는 수준을 넘어서므로 레이어를 숨긴다.
                // layer.setMinResolution(MIN_RESOLUTION)
                map.addLayer(layer)
                layerRef.current = layer

                // 줌이 바뀔 때마다 velocityScale을 재계산해서 화면상 선 길이를 일정하게 유지
                const handleResolutionChange = () => {
                    const resolution = view.getResolution()
                    if (resolution == null) return
                    layer.setWindOptions({
                        velocityScale: velocityScaleForResolution(resolution),
                        paths: pathsForResolution(resolution, minResolution, maxResolution),
                    })
                }
                view.on('change:resolution', handleResolutionChange)
                unsubscribeResolution = () => view.un('change:resolution', handleResolutionChange)
            } catch {
                /* 바람길 데이터가 아직 준비되지 않았을 수 있음 — 조용히 무시 */
            }
        }

        load()

        return () => {
            cancelled = true
            unsubscribeResolution?.()
            if (layerRef.current) {
                map.removeLayer(layerRef.current)
                layerRef.current = null
            }
        }
    }, [map, enabled])
}
