import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import Map from 'ol/Map'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Draw from 'ol/interaction/Draw'
import Overlay from 'ol/Overlay'
import { LineString, Polygon, Point } from 'ol/geom'
import { getArea, getLength } from 'ol/sphere'
import Style from 'ol/style/Style'
import Stroke from 'ol/style/Stroke'
import Fill from 'ol/style/Fill'
import CircleStyle from 'ol/style/Circle'
import { MapTool, onClear } from '@/stores/map/mapStore'
import MeasureTooltip from '@/components/map/overlay/MeasureTooltip'

import { useMapStore } from '@/stores/map/mapStore'

function formatArea(sqMeters: number): string {
    if (sqMeters >= 1_000_000) {
        return `${(sqMeters / 1_000_000).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km²`
    }
    return `${Math.round(sqMeters).toLocaleString('ko-KR')} m²`
}

export function useAreaMeasure(map: Map | null, activeTool: MapTool) {
    const sourceRef = useRef(new VectorSource())
    const layerRef = useRef(new VectorLayer({
        source: sourceRef.current,
        zIndex: 100,
        style: (feature) => {
            const geom = feature.getGeometry()
            const styles: Style[] = [
                new Style({
                    stroke: new Stroke({ color: '#4169e1', width: 2.5 }),
                    fill: new Fill({ color: 'rgba(65, 105, 225, 0.15)' }),
                }),
            ]
            if (geom instanceof Polygon) {
                geom.getCoordinates()[0].forEach((coord) => {
                    styles.push(new Style({
                        geometry: new Point(coord),
                        image: new CircleStyle({
                            radius: 5,
                            fill: new Fill({ color: '#fff' }),
                            stroke: new Stroke({ color: '#4169e1', width: 2 }),
                        }),
                    }))
                })
            }
            return styles
        },
    }))
    const drawRef = useRef<Draw | null>(null)
    const tooltipElRef = useRef<HTMLDivElement | null>(null)
    const tooltipOverlayRef = useRef<Overlay | null>(null)
    const rootRef = useRef<ReturnType<typeof createRoot> | null>(null)
    const fixedOverlaysRef = useRef<{ overlay: Overlay; root: ReturnType<typeof createRoot>; el: HTMLDivElement }[]>([])

    useEffect(() => {
        if (!map) return
        map.addLayer(layerRef.current)

        // 초기화 버튼 클릭 시 해당 레이어 피처 전체 삭제
        const unsubscribe = onClear(() => {
            sourceRef.current.clear()
            fixedOverlaysRef.current.forEach(({ overlay, root, el }) => {
                map.removeOverlay(overlay)
                setTimeout(() => root.unmount(), 0)
                el.remove()
            })
            fixedOverlaysRef.current = []
        })

        return () => {
            unsubscribe()
            map.removeLayer(layerRef.current)
        }
    }, [map])

    useEffect(() => {
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

        if (activeTool !== 'measure-area') return

        const el = document.createElement('div')
        tooltipElRef.current = el
        const root = createRoot(el)
        rootRef.current = root
        root.render(<MeasureTooltip value="" />)

        const overlay = new Overlay({
            element: el,
            offset: [0, -10],
            positioning: 'bottom-center',
        })
        map.addOverlay(overlay)
        tooltipOverlayRef.current = overlay

        const draw = new Draw({
            source: sourceRef.current,
            type: 'Polygon',
            style: new Style({
                stroke: new Stroke({ color: '#4169e1', width: 2.5 }),
                fill: new Fill({ color: 'rgba(65, 105, 225, 0.15)' }),
                image: new CircleStyle({
                    radius: 5,
                    fill: new Fill({ color: '#fff' }),
                    stroke: new Stroke({ color: '#4169e1', width: 2 }),
                }),
            }),
        })

        draw.on('drawstart', (e) => {
            const geom = e.feature.getGeometry() as Polygon
            geom.on('change', () => {
                const interior = geom.getInteriorPoint().getCoordinates()
                const area = getArea(geom, { projection: 'EPSG:5186' })
                root.render(<MeasureTooltip value={formatArea(area)} hint="우클릭으로 종료" />)
                overlay.setPosition([interior[0], interior[1]])
            })

            // 우클릭 시 그리기 종료
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
        })

        draw.on('drawend', (e) => {
            const geom = e.feature.getGeometry() as Polygon
            const rings = geom.getLinearRing(0)
            if (!rings || rings.getCoordinates().length < 4) return // 최소 3점 이상 (닫힘 포함 4)

            const interior = geom.getInteriorPoint().getCoordinates()
            const area = getArea(geom, { projection: 'EPSG:5186' })
            const feature = e.feature

            const fixedEl = document.createElement('div')
            const fixedRoot = createRoot(fixedEl)

            const fixedOverlay = new Overlay({
                element: fixedEl,
                offset: [0, -10],
                positioning: 'bottom-center',
                position: [interior[0], interior[1]],
            })
            map.addOverlay(fixedOverlay)

            fixedOverlaysRef.current.push({ overlay: fixedOverlay, root: fixedRoot, el: fixedEl })

            const handleClose = () => {
                sourceRef.current.removeFeature(feature)
                map.removeOverlay(fixedOverlay)
                setTimeout(() => fixedRoot.unmount(), 0)
                fixedEl.remove()
                fixedOverlaysRef.current = fixedOverlaysRef.current.filter((item) => item.overlay !== fixedOverlay)
            }

            fixedRoot.render(<MeasureTooltip value={formatArea(area)} onClose={handleClose} />)

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
    }, [activeTool, map])
}
