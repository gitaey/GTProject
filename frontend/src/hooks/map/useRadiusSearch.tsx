import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import Map from 'ol/Map'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Draw from 'ol/interaction/Draw'
import Overlay from 'ol/Overlay'
import { Circle, LineString, Point } from 'ol/geom'
import Feature from 'ol/Feature'
import Style from 'ol/style/Style'
import Stroke from 'ol/style/Stroke'
import Fill from 'ol/style/Fill'
import CircleStyle from 'ol/style/Circle'
import { MapTool, onClear } from '@/stores/map/mapStore'
import MeasureTooltip from '@/components/map/overlay/MeasureTooltip'

import { useMapStore } from '@/stores/map/mapStore'


export function useRadiusSearch(map: Map | null, activeTool: MapTool) {
    const sourceRef = useRef(new VectorSource())
    const layerRef = useRef(new VectorLayer({
        source: sourceRef.current,
        zIndex: 100,
        style: new Style({
            stroke: new Stroke({ color: '#7c3aed', width: 2.5 }),
            fill: new Fill({ color: 'rgba(124, 58, 237, 0.15)' }),
        }),
    }))
    const drawRef = useRef<Draw | null>(null)
    const liveLineRef = useRef<Feature | null>(null)
    const tooltipElRef = useRef<HTMLDivElement | null>(null)
    const tooltipOverlayRef = useRef<Overlay | null>(null)
    const rootRef = useRef<ReturnType<typeof createRoot> | null>(null)
    const fixedOverlaysRef = useRef<{ overlay: Overlay; root: ReturnType<typeof createRoot>; el: HTMLDivElement; extraFeatures: Feature[] }[]>([])

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

        if (activeTool !== 'radius-search') return

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
            type: 'Circle',
            style: new Style({
                stroke: new Stroke({ color: '#7c3aed', width: 2.5 }),
                fill: new Fill({ color: 'rgba(124, 58, 237, 0.15)' }),
                image: new CircleStyle({
                    radius: 5,
                    fill: new Fill({ color: '#7c3aed' }),
                    stroke: new Stroke({ color: '#fff', width: 2 }),
                }),
            }),
        })

        let lastPointerCoord: [number, number] = [0, 0]

        draw.on('drawstart', (e) => {
            const geom = e.feature.getGeometry() as Circle

            // 드래그 중 실시간 반경선 feature
            const liveLineFeature = new Feature(new LineString([]))
            liveLineFeature.setStyle(new Style({
                stroke: new Stroke({ color: '#7c3aed', width: 1.5, lineDash: [4, 4] }),
            }))
            sourceRef.current.addFeature(liveLineFeature)
            liveLineRef.current = liveLineFeature

            const onPointerMove = (evt: { coordinate: number[] }) => {
                lastPointerCoord = evt.coordinate as [number, number]
                const center = geom.getCenter()
                if (center[0] !== 0 || center[1] !== 0) {
                    ;(liveLineFeature.getGeometry() as LineString).setCoordinates([center, lastPointerCoord])
                }
            }
            map.on('pointermove', onPointerMove)
            draw.once('drawend', () => {
                map.un('pointermove', onPointerMove)
                sourceRef.current.removeFeature(liveLineFeature)
                liveLineRef.current = null
            })

            geom.on('change', () => {
                const center = geom.getCenter()
                const radius = geom.getRadius()
                root.render(<MeasureTooltip value={radius >= 1000
    ? `반경: ${(radius / 1000).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`
    : `반경: ${Math.round(radius).toLocaleString('ko-KR')} m`} />)
                overlay.setPosition(center)
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
            const geom = e.feature.getGeometry() as Circle
            const center = geom.getCenter()
            const radius = geom.getRadius()
            const feature = e.feature

            // 중심점 feature
            const centerDotStyle = new Style({
                image: new CircleStyle({
                    radius: 5,
                    fill: new Fill({ color: '#7c3aed' }),
                    stroke: new Stroke({ color: '#fff', width: 2 }),
                }),
            })
            const centerFeature = new Feature(new Point(center))
            centerFeature.setStyle(centerDotStyle)
            sourceRef.current.addFeature(centerFeature)

            // 반경선 feature (중심 → 마우스 놓은 위치)
            const edgePoint: [number, number] = lastPointerCoord
            const lineStyle = new Style({
                stroke: new Stroke({ color: '#7c3aed', width: 1.5, lineDash: [4, 4] }),
            })
            const lineFeature = new Feature(new LineString([center, edgePoint]))
            lineFeature.setStyle(lineStyle)
            sourceRef.current.addFeature(lineFeature)

            const extraFeatures = [centerFeature, lineFeature]

            const fixedEl = document.createElement('div')
            const fixedRoot = createRoot(fixedEl)

            const fixedOverlay = new Overlay({
                element: fixedEl,
                offset: [0, -10],
                positioning: 'bottom-center',
                position: center,
            })
            map.addOverlay(fixedOverlay)

            fixedOverlaysRef.current.push({ overlay: fixedOverlay, root: fixedRoot, el: fixedEl, extraFeatures })

            const handleClose = () => {
                sourceRef.current.removeFeature(feature)
                extraFeatures.forEach((f) => sourceRef.current.removeFeature(f))
                map.removeOverlay(fixedOverlay)
                setTimeout(() => fixedRoot.unmount(), 0)
                fixedEl.remove()
                fixedOverlaysRef.current = fixedOverlaysRef.current.filter((item) => item.overlay !== fixedOverlay)
            }

            fixedRoot.render(<MeasureTooltip value={radius >= 1000
    ? `반경: ${(radius / 1000).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`
    : `반경: ${Math.round(radius).toLocaleString('ko-KR')} m`} onClose={handleClose} />)

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
            if (liveLineRef.current) {
                sourceRef.current.removeFeature(liveLineRef.current)
                liveLineRef.current = null
            }
            drawRef.current = null
            tooltipOverlayRef.current = null
            rootRef.current = null
            tooltipElRef.current = null
        }
    }, [activeTool, map])
}
