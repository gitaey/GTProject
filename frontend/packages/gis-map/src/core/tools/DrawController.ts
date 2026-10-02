// 그리기 도구: 포인트/선/폴리곤/원/직사각형/텍스트 + 선택·편집·삭제 (옛 hooks/map/useDrawing.ts를 React 없이 옮김)
//   - 레이어 1개(zIndex.tools)에 도형을 모은다. 스타일은 "지금 스타일"을 모든 도형에 적용한다(옛 동작)
//   - Select/Modify/Draw interaction은 해당 도구가 켜졌을 때만 지도에 붙인다(붙이기 모드 규칙)
//   - 선·폴리곤 등은 우클릭으로 끝내고 도구를 끈다. 텍스트는 지도 클릭 → 입력창
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Draw, { createBox } from 'ol/interaction/Draw'
import Modify from 'ol/interaction/Modify'
import Select from 'ol/interaction/Select'
import { click } from 'ol/events/condition'
import { Style, Fill, Stroke, Circle as CircleStyle, Text as OlText } from 'ol/style'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { fromCircle } from 'ol/geom/Polygon'
import GeoJSON from 'ol/format/GeoJSON'
import { getCenter } from 'ol/extent'
import type OlMap from 'ol/Map'
import type MapBrowserEvent from 'ol/MapBrowserEvent'
import type Interaction from 'ol/interaction/Interaction'
import type { FeatureLike } from 'ol/Feature'
import type CircleGeom from 'ol/geom/Circle'
import type { Type as GeometryType } from 'ol/geom/Geometry'
import { DEFAULT_THEME } from '../config'
import type { TextInputRequest } from '../config'
import { hexToRgba } from '../lib/color'
import { createStore } from '../store'
import type { ReadableStore, WritableStore } from '../store'
import type { MapResources } from '../tracker'
import type { DrawStyle, MapTool } from '../types/draw'
import type { GeoJsonObject } from '../types/geojson'
import { bindRightClickFinish } from './rightClickFinish'
import { TextInputOverlay } from './textInputOverlay'
import type { ToolHandler, ToolManagerImpl } from './ToolManager'

export interface DrawState {
    style: DrawStyle
    selectedCount: number
    /** 선택된 첫 도형 범위 중심의 화면 픽셀 */
    selectedPixel: [number, number] | null
}

export interface DrawController {
    readonly store: ReadableStore<DrawState>
    setStyle(patch: Partial<DrawStyle>): void
    deleteSelected(): void
    /** 그린 도형을 EPSG:4326 FeatureCollection으로(원은 64각형 폴리곤으로 근사, 텍스트는 drawText 속성) */
    toGeoJSON(): GeoJsonObject
}

/** color는 엔진이 theme.primary로 바꿔 넣는다(기본값도 테마 기본 주 색 — 옛 drawStore 기본값과 같은 글자) */
export const DEFAULT_DRAW_STYLE: Readonly<DrawStyle> = Object.freeze({
    color: DEFAULT_THEME.primary,
    strokeWidth: 2,
    fillOpacity: 30,
    pointSize: 8,
    fontSize: 14,
})

// MapTool → OL geometry type (draw-box는 Circle + createBox)
const TOOL_GEOM: Readonly<Partial<Record<MapTool, GeometryType>>> = Object.freeze({
    'draw-point': 'Point',
    'draw-line': 'LineString',
    'draw-polygon': 'Polygon',
    'draw-circle': 'Circle',
    'draw-box': 'Circle',
})

const SELECTED_COLOR = '#3b82f6'

function createFeatureStyle(feature: FeatureLike, style: DrawStyle, selected: boolean): Style {
    const alpha = style.fillOpacity / 100
    const strokeColor = selected ? SELECTED_COLOR : style.color
    const strokeWidth = selected ? style.strokeWidth + 2 : style.strokeWidth
    const stroke = new Stroke({ color: strokeColor, width: strokeWidth })
    const fill = new Fill({ color: hexToRgba(style.color, alpha) })

    // 텍스트 라벨
    const text = feature.get('drawText') as string | undefined
    if (text) {
        return new Style({
            image: new CircleStyle({
                radius: 3,
                fill: new Fill({ color: strokeColor }),
                stroke: new Stroke({ color: '#ffffff', width: 1.5 }),
            }),
            text: new OlText({
                text,
                font: `bold ${style.fontSize}px sans-serif`,
                fill: new Fill({ color: strokeColor }),
                stroke: new Stroke({ color: '#ffffff', width: 3 }),
                offsetY: -14,
                textAlign: 'center',
            }),
        })
    }

    if (feature.getGeometry()?.getType() === 'Point') {
        return new Style({ image: new CircleStyle({ radius: style.pointSize / 2, fill, stroke }) })
    }
    // 선/폴리곤/원/직사각형
    return new Style({ stroke, fill })
}

function isDrawTool(tool: MapTool): boolean {
    return tool.startsWith('draw-')
}

function isSelectTool(tool: MapTool): boolean {
    return tool === 'select' || tool === 'edit'
}

export interface DrawControllerOptions {
    olMap: OlMap
    resources: MapResources
    tools: ToolManagerImpl
    zIndex: number
    initialStyle: DrawStyle
    /** config.ui.textInput(호스트 입력 UI). 없으면 코어 DOM 입력창 */
    textInput?: (req: TextInputRequest) => void
}

export class DrawControllerImpl implements DrawController, ToolHandler {
    readonly store: ReadableStore<DrawState>

    private readonly olMap: OlMap
    private readonly resources: MapResources
    private readonly tools: ToolManagerImpl
    private readonly state: WritableStore<DrawState>
    private readonly source: VectorSource<Feature>
    private readonly layer: VectorLayer<Feature>
    private readonly select: Select
    private readonly modify: Modify
    private readonly onMapInteractions = new Set<Interaction>()
    private readonly textOverlay: TextInputOverlay | null
    private readonly customTextInput: ((req: TextInputRequest) => void) | null
    private draw: Draw | null = null
    private endSessionListeners: (() => void) | null = null
    private destroyed = false

    constructor(opts: DrawControllerOptions) {
        this.olMap = opts.olMap
        this.resources = opts.resources
        this.tools = opts.tools
        this.state = createStore<DrawState>({ style: { ...opts.initialStyle }, selectedCount: 0, selectedPixel: null })
        this.store = this.state

        this.source = new VectorSource<Feature>()
        this.layer = this.resources.addLayer(new VectorLayer({
            source: this.source,
            zIndex: opts.zIndex,
            style: (feature: FeatureLike) => createFeatureStyle(feature, this.state.getState().style, false),
        }))
        this.select = new Select({
            condition: click,
            layers: [this.layer],
            style: (feature: FeatureLike) => createFeatureStyle(feature, this.state.getState().style, true),
        })
        this.modify = new Modify({ source: this.source })

        // 선택된 도형 수 + 첫 도형 중심 픽셀
        const selected = this.select.getFeatures()
        const onLength = (): void => {
            const count = selected.getLength()
            if (count === 0) {
                this.state.setState({ selectedCount: 0, selectedPixel: null })
                return
            }
            const geom = selected.item(0).getGeometry()
            const px = geom ? this.olMap.getPixelFromCoordinate(getCenter(geom.getExtent())) : null
            this.state.setState(px ? { selectedCount: count, selectedPixel: [px[0], px[1]] } : { selectedCount: count })
        }
        selected.on('change:length', onLength)
        this.resources.onDispose(() => selected.un('change:length', onLength))

        this.customTextInput = opts.textInput ?? null
        this.textOverlay = this.customTextInput ? null : new TextInputOverlay(this.olMap, this.resources)

        this.resources.onDispose(() => {
            this.destroyed = true
            this.endSessionListeners?.()
            this.endSessionListeners = null
            this.draw = null
            this.onMapInteractions.clear()
            this.state.destroy()
        })
        this.tools.register(this)
    }

    // ── ToolHandler ───────────────────────────────────────────────────────────

    handles(tool: MapTool): boolean {
        return isDrawTool(tool) || isSelectTool(tool)
    }

    update(next: MapTool): void {
        if (this.destroyed) return
        // 1) 이전 그리기 세션 정리(Draw, 우클릭·클릭 리스너, 열린 텍스트 입력창)
        this.endSession()

        // 2) 선택: 클릭으로 선택만. 편집: 선택 + 꼭지점 드래그 수정
        const selecting = isSelectTool(next)
        const editing = next === 'edit'
        this.select.setActive(selecting)
        this.modify.setActive(editing)
        if (!selecting) this.select.getFeatures().clear()
        this.place(this.select, selecting)
        this.place(this.modify, editing)

        if (!isDrawTool(next)) return

        // 3) 텍스트: 지도 클릭 → 입력창 (우클릭 종료 없음 — 옛 동작 그대로)
        if (next === 'draw-text') {
            const onClick = (e: MapBrowserEvent<UIEvent>): void => this.requestText(e)
            this.olMap.on('singleclick', onClick)
            this.endSessionListeners = this.resources.onDispose(() => this.olMap.un('singleclick', onClick))
            return
        }

        // 4) 도형 그리기
        const type = TOOL_GEOM[next]
        if (!type) return
        const draw = new Draw({
            source: this.source,
            type,
            stopClick: true,
            ...(next === 'draw-box' ? { geometryFunction: createBox() } : {}),
        })
        this.draw = this.resources.addInteraction(draw)
        // 우클릭 → 그리던 도형 완료 + 도구 해제
        const off = bindRightClickFinish(this.olMap, () => {
            try {
                draw.finishDrawing()
            } catch {
                /* 무시 */
            }
            this.tools.deactivate()
        })
        this.endSessionListeners = this.resources.onDispose(off)
    }

    // ── 공개 API ─────────────────────────────────────────────────────────────

    setStyle(patch: Partial<DrawStyle>): void {
        if (this.destroyed) return
        this.state.setState(s => ({ style: { ...s.style, ...patch } }))
        this.layer.changed()
    }

    deleteSelected(): void {
        if (this.destroyed) return
        const selected = this.select.getFeatures()
        selected.forEach(f => this.source.removeFeature(f as Feature))
        selected.clear()
        this.state.setState({ selectedCount: 0, selectedPixel: null })
    }

    toGeoJSON(): GeoJsonObject {
        const features = this.source.getFeatures().map(f => {
            const geom = f.getGeometry()
            if (geom && geom.getType() === 'Circle') {
                const copy = f.clone()
                copy.setGeometry(fromCircle(geom as CircleGeom, 64))
                return copy
            }
            return f
        })
        const out = new GeoJSON().writeFeaturesObject(features, {
            featureProjection: this.olMap.getView().getProjection(),
            dataProjection: 'EPSG:4326',
        })
        return out as unknown as GeoJsonObject
    }

    /** map.clearAll()용: 도형 전부 삭제 + 열린 텍스트 입력창 닫기 */
    clear(): void {
        if (this.destroyed) return
        this.textOverlay?.close()
        this.source.clear()
        this.state.setState({ selectedCount: 0 })
    }

    // ── 내부 ─────────────────────────────────────────────────────────────────

    private endSession(): void {
        this.endSessionListeners?.()
        this.endSessionListeners = null
        if (this.draw) {
            this.resources.removeInteraction(this.draw)
            this.draw = null
        }
        this.textOverlay?.close()
    }

    private place(interaction: Interaction, on: boolean): void {
        if (on && !this.onMapInteractions.has(interaction)) {
            this.resources.addInteraction(interaction)
            this.onMapInteractions.add(interaction)
        } else if (!on && this.onMapInteractions.has(interaction)) {
            this.resources.removeInteraction(interaction)
            this.onMapInteractions.delete(interaction)
        }
    }

    private requestText(e: MapBrowserEvent<UIEvent>): void {
        const pixel: [number, number] = [e.pixel[0], e.pixel[1]]
        const coordinate = e.coordinate
        const req: TextInputRequest = {
            pixel,
            coordinate,
            submit: (text: string) => {
                if (this.destroyed || !text.trim()) return
                const feature = new Feature(new Point(coordinate))
                feature.set('drawText', text.trim())
                this.source.addFeature(feature)
            },
            cancel: () => {},
        }
        if (this.customTextInput) this.customTextInput(req)
        else this.textOverlay?.open(req)
    }
}
