'use client'

import { useEffect, useState } from 'react'
import Map from 'ol/Map'
import { toLonLat, transform, getPointResolution } from 'ol/proj'
import ScaleLine from 'ol/control/ScaleLine'

interface MapStatusBarProps {
    map: Map | null
}

interface Coords {
    lon: number
    lat: number
    x: number
    y: number
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

export default function MapStatusBar({ map }: MapStatusBarProps) {
    const [coords, setCoords] = useState<Coords | null>(null)
    const [scale, setScale] = useState<string>('—')

    useEffect(() => {
        if (!map) return

        // OL 내장 ScaleLine 컨트롤 추가
        const scaleLine = new ScaleLine({ units: 'metric', bar: false, minWidth: 80 })
        map.addControl(scaleLine)

        const moveHandler = (e: { coordinate: number[] }) => {
            const [lon, lat] = toLonLat(e.coordinate, 'EPSG:3857')
            const [x, y] = transform(e.coordinate, 'EPSG:3857', 'EPSG:5186')
            setCoords({ lon, lat, x, y })
        }

        const resolutionHandler = () => {
            const res = map.getView().getResolution() ?? 0
            const center = map.getView().getCenter() ?? [0, 0]
            setScale(calcScale(res, center))
        }

        map.on('pointermove', moveHandler)
        map.getView().on('change:resolution', resolutionHandler)
        resolutionHandler()

        return () => {
            map.removeControl(scaleLine)
            map.un('pointermove', moveHandler)
            map.getView().un('change:resolution', resolutionHandler)
        }
    }, [map])

    return (
        <div className="hidden md:flex items-center h-7 px-3 bg-white border-t border-gray-200 flex-shrink-0 text-xs text-gray-400"
            style={{ fontFamily: "'Consolas', 'Courier New', monospace", fontVariantNumeric: 'tabular-nums' }}>

            <div className="flex-1" />

            {/* 경위도 좌표 */}
            <div className="flex items-center gap-1.5 px-3 border-r border-gray-200">
                <span>경위도</span>
                <span className="text-amber-700 font-semibold">
                    {coords ? `${coords.lon.toFixed(6)}, ${coords.lat.toFixed(6)}` : '—'}
                </span>
            </div>

            {/* EPSG:5186 좌표 */}
            <div className="flex items-center gap-1.5 px-3 border-r border-gray-200">
                <span>EPSG:5186</span>
                <span className="text-amber-700 font-semibold">
                    {coords ? `${Math.round(coords.x).toLocaleString('ko-KR')}, ${Math.round(coords.y).toLocaleString('ko-KR')}` : '—'}
                </span>
            </div>

            {/* 축척 */}
            <div className="flex items-center gap-1.5 px-3 border-r border-gray-200">
                <span>축척</span>
                <span className="text-amber-700 font-semibold">{scale}</span>
            </div>
        </div>
    )
}
