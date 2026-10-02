'use client'

import { useEffect, useState } from 'react'
import { toLonLat, transform, getPointResolution, get as getProjection } from 'ol/proj'
import ScaleLine from 'ol/control/ScaleLine'
import { useGisMap } from '../../react'

interface Coords {
    lon: number
    lat: number
    /** 표시 좌표계 좌표. 그 좌표계가 등록돼 있지 않으면 null('—') */
    x: number | null
    y: number | null
}

/** 상태바 두 번째 좌표의 기본 좌표계(GRS80 중부원점 — 엔진이 기본 등록한다) */
export const DEFAULT_STATUS_BAR_PROJECTION = 'EPSG:5186'

export interface MapStatusBarProps {
    /** 경위도 옆에 보일 좌표계 코드(이름도 이 글자로 표시). 엔진(proj4)에 등록된 코드여야 숫자가 나온다. 기본 'EPSG:5186' */
    projection?: string
}

function snapScale(raw: number): number {
    const exp = Math.floor(Math.log10(raw))
    const base = Math.pow(10, exp)
    const candidates = [1, 2, 2.5, 5, 10].map((m) => base * m)
    return candidates.reduce((prev, curr) =>
        Math.abs(Math.log(curr) - Math.log(raw)) < Math.abs(Math.log(prev) - Math.log(raw)) ? curr : prev
    )
}

function calcScale(resolution: number, center: number[]): string {
    const groundRes = getPointResolution('EPSG:3857', resolution, center)
    const raw = groundRes * 3779.5
    const snapped = snapScale(raw)
    return `1 : ${snapped.toLocaleString('ko-KR')}`
}

// OL 지도는 가장 가까운 엔진의 것(엔진이 바뀔 때만 바뀐다)
export default function MapStatusBar({ projection = DEFAULT_STATUS_BAR_PROJECTION }: MapStatusBarProps) {
    const map = useGisMap()?.olMap ?? null
    const [coords, setCoords] = useState<Coords | null>(null)
    const [scale, setScale] = useState<string>('—')
    const [zoom, setZoom] = useState<number | null>(null)

    useEffect(() => {
        if (!map) return

        // OL 내장 ScaleLine 컨트롤 추가
        const scaleLine = new ScaleLine({ units: 'metric', bar: false, minWidth: 80 })
        map.addControl(scaleLine)

        // 표시 좌표계가 등록돼 있지 않으면 변환하지 않는다(ol transform이 예외를 던진다)
        const known = getProjection(projection) != null
        const moveHandler = (e: { coordinate: number[] }) => {
            const [lon, lat] = toLonLat(e.coordinate, 'EPSG:3857')
            const [x, y] = known ? transform(e.coordinate, 'EPSG:3857', projection) : [null, null]
            setCoords({ lon, lat, x, y })
        }

        const resolutionHandler = () => {
            const res = map.getView().getResolution() ?? 0
            const center = map.getView().getCenter() ?? [0, 0]
            setScale(calcScale(res, center))
            setZoom(map.getView().getZoom() ?? null)
        }

        map.on('pointermove', moveHandler)
        map.getView().on('change:resolution', resolutionHandler)
        resolutionHandler()

        return () => {
            map.removeControl(scaleLine)
            map.un('pointermove', moveHandler)
            map.getView().un('change:resolution', resolutionHandler)
        }
    }, [map, projection])

    return (
        <div className="gm-statusbar"
            style={{ fontFamily: "'Consolas', 'Courier New', monospace", fontVariantNumeric: 'tabular-nums' }}>

            <div className="gm-statusbar__spacer" />

            {/* 경위도 좌표 */}
            <div className="gm-statusbar__item gm-statusbar__item--divided">
                <span>경위도</span>
                <span className="gm-statusbar__value">
                    {coords ? `${coords.lon.toFixed(6)} ${coords.lat.toFixed(6)}` : '—'}
                </span>
            </div>

            {/* 표시 좌표계(기본 EPSG:5186) 좌표 */}
            <div className="gm-statusbar__item gm-statusbar__item--divided">
                <span>{projection}</span>
                <span className="gm-statusbar__value">
                    {coords && coords.x != null && coords.y != null ? `${Math.round(coords.x).toLocaleString('ko-KR')} ${Math.round(coords.y).toLocaleString('ko-KR')}` : '—'}
                </span>
            </div>

            {/* 축척 */}
            <div className="gm-statusbar__item gm-statusbar__item--divided">
                <span>축척</span>
                <span className="gm-statusbar__value">{scale}</span>
            </div>

            {/* 줌 레벨 */}
            <div className="gm-statusbar__item">
                <span>줌 레벨</span>
                <span className="gm-statusbar__value">
                    {zoom !== null ? zoom.toFixed(1) : '—'}
                </span>
            </div>
        </div>
    )
}
