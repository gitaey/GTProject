// 그리기 도구 훅 — 포인트/선/폴리곤/원/직사각형/텍스트 지원
// OL Draw + Modify + Select interaction 관리
import { useEffect, useRef } from 'react'
import Map from 'ol/Map'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Draw, { createBox } from 'ol/interaction/Draw'
import Modify from 'ol/interaction/Modify'
import Select from 'ol/interaction/Select'
import { click } from 'ol/events/condition'
import { Style, Fill, Stroke, Circle as CircleStyle, Text as OLText } from 'ol/style'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import type { FeatureLike } from 'ol/Feature'
import { MapTool, onClear, useMapStore } from '@/stores/map/mapStore'
import { useDrawStore, DrawStyle } from '@/stores/map/drawStore'
import type { Coordinate } from 'ol/coordinate'
import { getCenter } from 'ol/extent'
import MapBrowserEvent from 'ol/MapBrowserEvent'

// MapTool → OL geometry type 매핑 (draw-box는 Circle type + createBox geometryFunction)
const TOOL_GEOM: Partial<Record<MapTool, string>> = {
    'draw-point':   'Point',
    'draw-line':    'LineString',
    'draw-polygon': 'Polygon',
    'draw-circle':  'Circle',
    'draw-box':     'Circle', // createBox() 사용 시 type은 'Circle'
}

// hex 색상을 rgba로 변환
function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
}

// 피처 스타일 생성 함수
function createFeatureStyle(feature: FeatureLike, style: DrawStyle, selected: boolean): Style {
    const alpha = style.fillOpacity / 100
    const strokeColor = selected ? '#3b82f6' : style.color
    const strokeWidth = selected ? style.strokeWidth + 2 : style.strokeWidth

    const stroke = new Stroke({ color: strokeColor, width: strokeWidth })
    const fill = new Fill({ color: hexToRgba(style.color, alpha) })

    // 텍스트 라벨 피처
    const text = (feature as Feature).get?.('drawText') as string | undefined
    if (text) {
        return new Style({
            image: new CircleStyle({
                radius: 3,
                fill: new Fill({ color: strokeColor }),
                stroke: new Stroke({ color: '#ffffff', width: 1.5 }),
            }),
            text: new OLText({
                text,
                font: `bold ${style.fontSize}px sans-serif`,
                fill: new Fill({ color: strokeColor }),
                stroke: new Stroke({ color: '#ffffff', width: 3 }),
                offsetY: -14,
                textAlign: 'center',
            }),
        })
    }

    // 포인트
    const geomType = (feature as Feature).getGeometry?.()?.getType?.()
    if (geomType === 'Point') {
        return new Style({
            image: new CircleStyle({
                radius: style.pointSize / 2,
                fill,
                stroke,
            }),
        })
    }

    // 선/폴리곤/원/직사각형
    return new Style({ stroke, fill })
}

function isDrawTool(tool: MapTool): boolean { return tool.startsWith('draw-') }

export function useDrawing(map: Map | null, activeTool: MapTool) {
    const { drawStyle, showTextInput, registerDeleteSelected, setSelectedCount, setSelectedPixel } = useDrawStore()
    const drawStyleRef = useRef<DrawStyle>(drawStyle)
    drawStyleRef.current = drawStyle

    const sourceRef   = useRef(new VectorSource())
    const layerRef    = useRef<VectorLayer<Feature> | null>(null)
    const drawRef     = useRef<Draw | null>(null)
    const selectRef   = useRef<Select | null>(null)
    const modifyRef   = useRef<Modify | null>(null)

    // 지도에 레이어 추가 + clearAll 구독
    useEffect(() => {
        if (!map) return

        const source = sourceRef.current
        const layer = new VectorLayer({
            source,
            zIndex: 100,
            style: (feature) => createFeatureStyle(feature, drawStyleRef.current, false),
        })
        layerRef.current = layer
        map.addLayer(layer)

        const unsubscribe = onClear(() => {
            source.clear()
            setSelectedCount(0)
        })

        return () => {
            unsubscribe()
            try { map.removeLayer(layer) } catch { /* 무시 */ }
        }
    }, [map])

    // Select + Modify 인터랙션 초기화 (map 생성 시 한 번)
    useEffect(() => {
        if (!map || !layerRef.current) return

        const select = new Select({
            condition: click,
            layers: [layerRef.current],
            style: (feature) => createFeatureStyle(feature, drawStyleRef.current, true),
        })

        const modify = new Modify({
            source: sourceRef.current,
        })

        map.addInteraction(select)
        map.addInteraction(modify)
        selectRef.current = select
        modifyRef.current = modify

        // 선택된 피처 수 추적 + 픽셀 위치 계산
        const featColl = select.getFeatures()
        featColl.on('change:length' as never, () => {
            const count = featColl.getLength()
            setSelectedCount(count)
            if (count === 0 || !map) {
                setSelectedPixel(null)
                return
            }
            // 선택된 피처들의 extent 중심을 픽셀로 변환
            const first = featColl.item(0) as Feature
            const geom = first.getGeometry()
            if (geom) {
                const center = getCenter(geom.getExtent())
                const px = map.getPixelFromCoordinate(center)
                if (px) setSelectedPixel([px[0], px[1]])
            }
        })

        // 삭제 콜백 등록
        registerDeleteSelected(() => {
            featColl.forEach((f) => sourceRef.current.removeFeature(f as Feature))
            featColl.clear()
            setSelectedCount(0)
            setSelectedPixel(null)
        })

        return () => {
            try { map.removeInteraction(select) } catch { /* 무시 */ }
            try { map.removeInteraction(modify) } catch { /* 무시 */ }
        }
    }, [map])

    // drawStyle 변경 시 레이어 강제 재렌더
    useEffect(() => {
        layerRef.current?.changed()
    }, [drawStyle])

    // 활성 도구 변경 시 Draw 인터랙션 교체 + Select 토글
    useEffect(() => {
        if (!map) return

        const drawing = isDrawTool(activeTool)

        // Select/Modify 는 그리기 중에는 비활성
        selectRef.current?.setActive(!drawing)
        modifyRef.current?.setActive(!drawing)

        // 기존 Draw 인터랙션 제거
        if (drawRef.current) {
            map.removeInteraction(drawRef.current)
            drawRef.current = null
        }

        if (!drawing) return

        // 텍스트 라벨: singleclick 핸들러로 처리
        if (activeTool === 'draw-text') {
            const handleClick = (e: MapBrowserEvent<UIEvent>) => {
                const pixel = e.pixel as [number, number]
                const coord = e.coordinate as Coordinate
                showTextInput(pixel[0], pixel[1], (text: string) => {
                    if (!text.trim()) return
                    const feature = new Feature(new Point(coord))
                    feature.set('drawText', text.trim())
                    sourceRef.current.addFeature(feature)
                })
            }
            map.on('singleclick', handleClick)
            return () => map.un('singleclick', handleClick)
        }

        // 일반 도형 Draw 인터랙션
        const geomType = TOOL_GEOM[activeTool]
        if (!geomType) return

        const drawOptions: ConstructorParameters<typeof Draw>[0] = {
            source: sourceRef.current,
            type: geomType as never,
            stopClick: true,
        }
        if (activeTool === 'draw-box') {
            drawOptions.geometryFunction = createBox()
        }

        const draw = new Draw(drawOptions)
        map.addInteraction(draw)
        drawRef.current = draw

        // 우클릭으로 그리기 완료 + 도구 해제
        const handleRightClick = (e: MouseEvent) => {
            e.preventDefault()
            try { draw.finishDrawing() } catch { /* 무시 */ }
            useMapStore.setState({ activeTool: 'none' })
        }
        map.getViewport().addEventListener('contextmenu', handleRightClick)

        return () => {
            map.getViewport().removeEventListener('contextmenu', handleRightClick)
            try { map.removeInteraction(draw) } catch { /* 무시 */ }
            drawRef.current = null
        }
    }, [activeTool, map])
}
