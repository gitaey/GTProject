// 면적 측정 도구 (옛 hooks/map/useAreaMeasure.tsx를 React 없이 옮김 — 값·문구·순서 동일)
//   그리는 중: 도형 안쪽 점에 "N m²" + "우클릭으로 종료"
//   확정(drawend): 같은 자리에 면적 툴팁 + X(도형과 툴팁을 함께 지움)
//   우클릭(그리는 중일 때만 받음): 브라우저 메뉴를 막고 도구를 끈다 → 그리던 도형은 취소된다(옛 동작)
//   면적 = ol/sphere getArea(projection = 뷰 좌표계) — 지상(구면) 면적. EPSG:5186 하드코딩 금지(FE-0 버그 수정 유지)
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Draw from 'ol/interaction/Draw'
import type { DrawEvent } from 'ol/interaction/Draw'
import Polygon from 'ol/geom/Polygon'
import Point from 'ol/geom/Point'
import type Feature from 'ol/Feature'
import type { FeatureLike } from 'ol/Feature'
import { getArea } from 'ol/sphere'
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style'
import type OlMap from 'ol/Map'
import type { ProjectionLike } from 'ol/proj'
import { translucent } from '../lib/color'
import { formatArea } from '../lib/format'
import type { MapResources } from '../tracker'
import type { MapTool } from '../types/draw'
import { MeasureTooltip } from './measureTooltip'
import type { MeasureToolOptions } from './measureTooltip'
import { bindSecondaryContextMenu } from './rightClickFinish'
import type { ToolHandler, ToolManagerImpl } from './ToolManager'

const TOOL: MapTool = 'measure-area'
const FILL_ALPHA = 0.15

/** 폴리곤의 지상 면적(m²). projection = 좌표가 지금 있는 좌표계(뷰 좌표계) */
export function polygonArea(geom: Polygon, projection: ProjectionLike): number {
    return getArea(geom, { projection })
}

function vertexImage(color: string): CircleStyle {
    return new CircleStyle({ radius: 5, fill: new Fill({ color: '#fff' }), stroke: new Stroke({ color, width: 2 }) })
}

interface Fixed {
    feature: Feature
    tooltip: MeasureTooltip
}

interface Sketch {
    geom: Polygon
    onChange: () => void
    offRight: () => void
}

interface Session {
    draw: Draw
    live: MeasureTooltip
    sketch: Sketch | null
}

export class AreaTool implements ToolHandler {
    private readonly olMap: OlMap
    private readonly resources: MapResources
    private readonly tools: ToolManagerImpl
    private readonly color: string
    private readonly fill: string
    private readonly source = new VectorSource<Feature>()
    private fixed: Fixed[] = []
    private session: Session | null = null
    private destroyed = false

    constructor(opts: MeasureToolOptions) {
        this.olMap = opts.olMap
        this.resources = opts.resources
        this.tools = opts.tools
        this.color = opts.color
        // 기본색 #4169e1 → 'rgba(65, 105, 225, 0.15)'(옛 값)
        this.fill = translucent(opts.color, FILL_ALPHA)
        const { color, fill } = this
        this.resources.addLayer(new VectorLayer({
            source: this.source,
            zIndex: opts.zIndex,
            style: (feature: FeatureLike) => {
                const geom = feature.getGeometry()
                const styles: Style[] = [
                    new Style({ stroke: new Stroke({ color, width: 2.5 }), fill: new Fill({ color: fill }) }),
                ]
                if (geom instanceof Polygon) {
                    geom.getCoordinates()[0].forEach(coord => {
                        styles.push(new Style({ geometry: new Point(coord), image: vertexImage(color) }))
                    })
                }
                return styles
            },
        }))
        this.resources.onDispose(() => {
            this.endSession()
            this.destroyed = true
            this.fixed = []
        })
        this.tools.register(this)
    }

    handles(tool: MapTool): boolean {
        return tool === TOOL
    }

    update(next: MapTool): void {
        if (this.destroyed) return
        this.endSession()
        if (next === TOOL) this.startSession()
    }

    /** map.clearAll()용: 확정된 도형과 툴팁 전부 삭제 */
    clear(): void {
        if (this.destroyed) return
        this.source.clear()
        this.fixed.forEach(f => f.tooltip.remove())
        this.fixed = []
    }

    private projection(): ProjectionLike {
        return this.olMap.getView().getProjection()
    }

    private startSession(): void {
        const live = new MeasureTooltip(this.olMap, this.resources)
        live.render({ value: '' })
        const { color, fill } = this
        const draw = new Draw({
            source: this.source,
            type: 'Polygon',
            style: new Style({
                stroke: new Stroke({ color, width: 2.5 }),
                fill: new Fill({ color: fill }),
                image: vertexImage(color),
            }),
        })
        const session: Session = { draw, live, sketch: null }

        draw.on('drawstart', (e: DrawEvent) => {
            this.dropSketch(session)
            const geom = e.feature.getGeometry() as Polygon
            const onChange = (): void => {
                const interior = geom.getInteriorPoint().getCoordinates()
                const area = polygonArea(geom, this.projection())
                live.render({ value: formatArea(area), hint: '우클릭으로 종료' })
                live.setPosition([interior[0], interior[1]])
            }
            geom.on('change', onChange)
            const offRight = bindSecondaryContextMenu(this.olMap, () => this.tools.deactivate())
            session.sketch = { geom, onChange, offRight }
        })

        draw.on('drawend', (e: DrawEvent) => {
            const sketch = session.sketch
            session.sketch = null
            if (sketch) {
                sketch.geom.un('change', sketch.onChange)
                sketch.offRight()
            }
            const geom = e.feature.getGeometry() as Polygon
            const ring = geom.getLinearRing(0)
            if (!ring || ring.getCoordinates().length < 4) return // 최소 3점 이상 (닫힘 포함 4) — 옛 코드와 같음

            const interior = geom.getInteriorPoint().getCoordinates()
            const area = polygonArea(geom, this.projection())
            const feature = e.feature
            const tooltip = new MeasureTooltip(this.olMap, this.resources, [interior[0], interior[1]])
            const item: Fixed = { feature, tooltip }
            this.fixed.push(item)
            tooltip.render({
                value: formatArea(area),
                onClose: () => {
                    this.source.removeFeature(feature)
                    tooltip.remove()
                    this.fixed = this.fixed.filter(f => f !== item)
                },
            })
            live.setPosition(undefined)
            live.render({ value: '' })
        })

        draw.on('drawabort', () => this.dropSketch(session))

        this.session = session
        this.resources.addInteraction(draw)
    }

    private dropSketch(session: Session): void {
        const s = session.sketch
        if (!s) return
        session.sketch = null
        s.geom.un('change', s.onChange)
        s.offRight()
        session.live.setPosition(undefined)
        session.live.render({ value: '' })
    }

    private endSession(): void {
        const s = this.session
        if (!s) return
        this.session = null
        this.resources.removeInteraction(s.draw)
        this.dropSketch(s)
        s.live.remove()
    }
}
