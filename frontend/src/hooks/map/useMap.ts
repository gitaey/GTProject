import { useEffect, useRef } from 'react'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import { get as getProjection, fromLonLat } from 'ol/proj'
import { register } from 'ol/proj/proj4'
import proj4 from 'proj4'

// EPSG:5186 등록
proj4.defs('EPSG:5186', '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs')
register(proj4)

// 세종특별시 중심 좌표 (EPSG:5186)
const SEJONG_3857 = fromLonLat([127.289, 36.48])

interface UseMapOptions {
    center?: [number, number]
    zoom?: number
}

export function useMap(targetRef: React.RefObject<HTMLDivElement | null>, options: UseMapOptions = {}) {
    const mapRef = useRef<Map | null>(null)
    const { center = SEJONG_3857, zoom = 10 } = options

    useEffect(() => {
        if (!targetRef.current || mapRef.current) return

        const projection = getProjection('EPSG:3857')!

        mapRef.current = new Map({
            target: targetRef.current,
            layers: [],
            view: new View({
                projection,
                center,
                zoom,
            }),
        })

        return () => {
            mapRef.current?.setTarget(undefined)
            mapRef.current = null
        }
    }, [])

    return mapRef
}
