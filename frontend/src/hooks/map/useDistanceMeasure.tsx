import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import Map from 'ol/Map'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Draw from 'ol/interaction/Draw'
import Overlay from 'ol/Overlay'
import { LineString } from 'ol/geom'
import { getLength } from 'ol/sphere'
import Feature from 'ol/Feature'
import { MapTool, useMapStore, onClear } from '@/stores/mapStore'
import MeasureTooltip from '@/components/map/overlay/MeasureTooltip'

function formatDistance(meters: number): string {
    return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(0)} m`
}

type OverlayItem = { overlay: Overlay; root: ReturnType<typeof createRoot>; el: HTMLDivElement }
type FeatureGroup = { feature: Feature; items: OverlayItem[] }

export function useDistanceMeasure(mapRef: React.RefObject<Map | null>, activeTool: MapTool) {
    const sourceRef = useRef(new VectorSource())
    const layerRef = useRef(new VectorLayer({ source: sourceRef.current }))
    const drawRef = useRef<Draw | null>(null)
    const tooltipElRef = useRef<HTMLDivElement | null>(null)
    const tooltipOverlayRef = useRef<Overlay | null>(null)
    const rootRef = useRef<ReturnType<typeof createRoot> | null>(null)
    const featureGroupsRef = useRef<FeatureGroup[]>([])

    const removeOverlayItem = (map: Map, item: OverlayItem) => {
        map.removeOverlay(item.overlay)
        setTimeout(() => item.root.unmount(), 0)
        item.el.remove()
    }

    const removeFeatureGroup = (map: Map, group: FeatureGroup) => {
        sourceRef.current.removeFeature(group.feature)
        group.items.forEach((item) => removeOverlayItem(map, item))
        featureGroupsRef.current = featureGroupsRef.current.filter((g) => g !== group)
    }

    const createOverlayItem = (map: Map): OverlayItem => {
        const el = document.createElement('div')
        const root = createRoot(el)
        const overlay = new Overlay({ element: el, offset: [0, -10], positioning: 'bottom-center' })
        map.addOverlay(overlay)
        return { overlay, root, el }
    }

    useEffect(() => {
        const map = mapRef.current
        if (!map) return
        map.addLayer(layerRef.current)

        const unsubscribe = onClear(() => {
            sourceRef.current.clear()
            featureGroupsRef.current.forEach((group) => group.items.forEach((item) => removeOverlayItem(map, item)))
            featureGroupsRef.current = []
        })

        return () => {
            unsubscribe()
            map.removeLayer(layerRef.current)
        }
    }, [mapRef.current])

    useEffect(() => {
        const map = mapRef.current
        if (!map) return

        const { setActiveTool } = useMapStore.getState()

        if (drawRef.current) {
            map.removeInteraction(drawRef.current)
            drawRef.current = null
        }
        if (tooltipOverlayRef.current) {
            map.removeOverlay(tooltipOverlayRef.current)
            tooltipOverlayRef.current = null
        }
        if (rootRef.current) {
            rootRef.current.unmount()
            rootRef.current = null
        }
        if (tooltipElRef.current) {
            tooltipElRef.current.remove()
            tooltipElRef.current = null
        }

        if (activeTool !== 'measure-distance') return

        const el = document.createElement('div')
        tooltipElRef.current = el
        const root = createRoot(el)
        rootRef.current = root
        root.render(<MeasureTooltip value="" />)

        const overlay = new Overlay({ element: el, offset: [0, -10], positioning: 'bottom-center' })
        map.addOverlay(overlay)
        tooltipOverlayRef.current = overlay

        const draw = new Draw({ source: sourceRef.current, type: 'LineString' })

        draw.on('drawstart', (e) => {
            const geom = e.feature.getGeometry() as LineString
            const segItems: OverlayItem[] = []

            geom.on('change', () => {
                const coords = geom.getCoordinates()
                const last = coords[coords.length - 1]

                // 합계 툴팁
                const totalDist = getLength(new LineString(coords), { projection: 'EPSG:5186' })
                root.render(<MeasureTooltip value={`합계: ${formatDistance(totalDist)}`} />)
                overlay.setPosition(last)

                // 구간 툴팁 추가
                const segCount = coords.length - 2
                for (let i = segItems.length; i < segCount; i++) {
                    segItems.push(createOverlayItem(map))
                }

                // 구간 툴팁 업데이트
                for (let i = 0; i < segItems.length; i++) {
                    const segDist = getLength(new LineString([coords[i], coords[i + 1]]), { projection: 'EPSG:5186' })
                    const mid: [number, number] = [
                        (coords[i][0] + coords[i + 1][0]) / 2,
                        (coords[i][1] + coords[i + 1][1]) / 2,
                    ]
                    segItems[i].root.render(<MeasureTooltip value={formatDistance(segDist)} />)
                    segItems[i].overlay.setPosition(mid)
                }
            })

            const handleRightClick = (ev: MouseEvent) => {
                if (ev.button === 2) {
                    ev.preventDefault()
                    setActiveTool('none')
                }
            }
            map.getViewport().addEventListener('contextmenu', handleRightClick)
            draw.once('drawend', () => {
                map.getViewport().removeEventListener('contextmenu', handleRightClick)
            })

            // drawend 시 segItems를 group에 등록
            draw.once('drawend', (endEvt) => {
                const group: FeatureGroup = { feature: endEvt.feature, items: [...segItems] }
                featureGroupsRef.current.push(group)

                const coords = (endEvt.feature.getGeometry() as LineString).getCoordinates()

                // 구간 툴팁 — 개별 삭제
                segItems.forEach((item, i) => {
                    const segDist = getLength(new LineString([coords[i], coords[i + 1]]), { projection: 'EPSG:5186' })
                    item.root.render(
                        <MeasureTooltip
                            value={formatDistance(segDist)}
                            onClose={() => {
                                removeOverlayItem(map, item)
                                group.items = group.items.filter((g) => g !== item)
                            }}
                        />,
                    )
                })
            })
        })

        draw.on('drawend', (e) => {
            const geom = e.feature.getGeometry() as LineString
            const coords = geom.getCoordinates()
            if (coords.length < 2) return

            const last = coords[coords.length - 1]
            const dist = getLength(geom, { projection: 'EPSG:5186' })

            const totalItem = createOverlayItem(map)
            totalItem.overlay.setPosition(last)

            // featureGroupsRef에 totalItem 추가 (drawstart의 once drawend보다 나중에 실행되므로 group 찾아서 추가)
            setTimeout(() => {
                const group = featureGroupsRef.current.find((g) => g.feature === e.feature)
                if (group) {
                    group.items.push(totalItem)
                    totalItem.root.render(
                        <MeasureTooltip
                            value={`합계: ${formatDistance(dist)}`}
                            onClose={() => removeFeatureGroup(map, group)}
                        />,
                    )
                }
            }, 0)

            overlay.setPosition(undefined)
            root.render(<MeasureTooltip value="" />)
        })

        map.addInteraction(draw)
        drawRef.current = draw

        return () => {
            map.removeInteraction(draw)
            map.removeOverlay(overlay)
            setTimeout(() => root.unmount(), 0)
            el.remove()
            drawRef.current = null
            tooltipOverlayRef.current = null
            rootRef.current = null
            tooltipElRef.current = null
        }
    }, [activeTool, mapRef.current])
}
