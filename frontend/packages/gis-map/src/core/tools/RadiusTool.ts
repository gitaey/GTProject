// 반경 도구 (옛 hooks/map/useRadiusSearch.tsx를 React 없이 옮김)
//   직접 입력(tools.radiusMeters > 0): 지도를 클릭할 때마다 그 반경의 원 + 중심점 + "반경: N m" 툴팁(X)
//   드래그(radiusMeters 없음): 클릭 → 움직임 → 클릭으로 원을 그린다. 그리는 중 중심에 "반경: N m", 중심→커서 점선
//   반경 입력값이 도구 사용 중 바뀌면 그 모드로 다시 시작(옛 effect 의존성과 같음). 우클릭은 그리는 중일 때만 받는다
//
// 좌표계 수정(FE-3b, 의도된 동작 변경): 옛 코드는 뷰 좌표(EPSG:3857) 단위를 지상 미터로 착각했다
//   (세종 위도에서 1,000 m 입력 → 지상 약 804 m 원, 드래그 표시는 실제보다 약 24% 크게).
//   이제 원은 ol/geom/Polygon의 circular(측지 원: 구 위에서 중심으로부터 모든 꼭짓점이 같은 지상 거리)로 만들어 뷰 좌표계로 옮기고,
//   표시하는 반경은 그 원의 지상 반경(ol/sphere, 거리 측정 도구와 같은 구)이다. 뷰 좌표계가 무엇이든(3857·5186·4326) 맞다.
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Draw from 'ol/interaction/Draw'
import type { DrawEvent, GeometryFunction } from 'ol/interaction/Draw'
import Polygon, { circular } from 'ol/geom/Polygon'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import Feature from 'ol/Feature'
import type { Geometry } from 'ol/geom'
import type MapBrowserEvent from 'ol/MapBrowserEvent'
import { getLength } from 'ol/sphere'
import { transform } from 'ol/proj'
import type { ProjectionLike } from 'ol/proj'
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style'
import type OlMap from 'ol/Map'
import type { Coordinate } from 'ol/coordinate'
import { translucent } from '../lib/color'
import { formatRadius } from '../lib/format'
import type { MapResources } from '../tracker'
import type { MapTool } from '../types/draw'
import type { ToolState } from './ToolManager'
import { MeasureTooltip } from './measureTooltip'
import type { MeasureToolOptions } from './measureTooltip'
import { bindSecondaryContextMenu } from './rightClickFinish'
import type { ToolHandler, ToolManagerImpl } from './ToolManager'

const TOOL: MapTool = 'radius-search'
const FILL_ALPHA = 0.15
/** 측지 원 꼭짓점 수. 128이면 반경 1 km 원을 줌 19(0.3 m/px)에서 봐도 변과 원호의 차이가 약 1 px */
export const RADIUS_CIRCLE_SEGMENTS = 128

/** 두 점 사이 지상 거리(m). projection = 좌표가 지금 있는 좌표계(뷰 좌표계). 거리 측정 도구와 같은 계산 */
export function groundDistance(a: Coordinate, b: Coordinate, projection: ProjectionLike): number {
    return getLength(new LineString([a, b]), { projection })
}

/**
 * 중심(뷰 좌표)에서 지상 meters만큼 떨어진 측지 원 폴리곤(뷰 좌표).
 * toLonLat이 아니라 transform을 쓴다 — toLonLat은 경도를 -180~180으로 접어서, 옆 세계 복사본·날짜변경선 동쪽을 클릭하면
 * 원만 지구 한 바퀴(약 40,075 km) 떨어진 곳에 그려진다(QA FE-3b F1)
 */
export function geodesicCircle(center: Coordinate, meters: number, projection: ProjectionLike): Polygon {
    const poly = circular(transform(center, projection, 'EPSG:4326'), Math.max(0, meters), RADIUS_CIRCLE_SEGMENTS)
    poly.transform('EPSG:4326', projection)
    return poly
}

interface Fixed {
    tooltip: MeasureTooltip
    features: Feature[]
}

interface Shape {
    center: Coordinate
    edge: Coordinate
    meters: number
}

interface Sketch {
    geom: Geometry
    onChange: () => void
    offRight: () => void
    liveLine: Feature<LineString>
}

interface Session {
    live: MeasureTooltip
    draw: Draw | null
    offClick: (() => void) | null
    shape: Shape | null
    sketch: Sketch | null
}

export class RadiusTool implements ToolHandler {
    private readonly olMap: OlMap
    private readonly resources: MapResources
    private readonly tools: ToolManagerImpl
    private readonly circleStyle: Style
    private readonly centerDotStyle: Style
    private readonly dashStyle: Style
    private readonly sketchStyle: Style
    private readonly source = new VectorSource<Feature>()
    private fixed: Fixed[] = []
    private session: Session | null = null
    private destroyed = false

    constructor(opts: MeasureToolOptions) {
        this.olMap = opts.olMap
        this.resources = opts.resources
        this.tools = opts.tools
        const color = opts.color
        // 기본색 #7c3aed → 채우기 'rgba(124, 58, 237, 0.15)'(옛 값)
        const fill = translucent(color, FILL_ALPHA)
        this.circleStyle = new Style({ stroke: new Stroke({ color, width: 2.5 }), fill: new Fill({ color: fill }) })
        this.centerDotStyle = new Style({
            image: new CircleStyle({ radius: 5, fill: new Fill({ color }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
        })
        this.dashStyle = new Style({ stroke: new Stroke({ color, width: 1.5, lineDash: [4, 4] }) })
        this.sketchStyle = new Style({
            stroke: new Stroke({ color, width: 2.5 }),
            fill: new Fill({ color: fill }),
            image: new CircleStyle({ radius: 5, fill: new Fill({ color }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
        })
        this.resources.addLayer(new VectorLayer({ source: this.source, zIndex: opts.zIndex, style: this.circleStyle }))

        // 도구를 쓰는 중에 반경 입력값이 바뀌면 새 모드로 다시 시작
        const offStore = this.tools.store.subscribe((s: ToolState, prev: ToolState) => {
            if (this.destroyed || s.radiusMeters === prev.radiusMeters) return
            if (this.session && s.activeTool === TOOL) {
                this.endSession()
                this.startSession()
            }
        })
        this.resources.onDispose(() => {
            offStore()
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

    /** map.clearAll()용: 원·중심점·점선·툴팁 전부 삭제 */
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
        const session: Session = { live, draw: null, offClick: null, shape: null, sketch: null }
        this.session = session

        // ── 직접 입력 모드: 클릭 한 번으로 고정 반경 원 ──
        const meters = this.tools.store.getState().radiusMeters
        if (meters && meters > 0) {
            const onClick = (evt: MapBrowserEvent<UIEvent>): void => {
                const center = evt.coordinate
                const circle = new Feature(geodesicCircle(center, meters, this.projection()))
                circle.setStyle(this.circleStyle)
                this.source.addFeature(circle)
                this.finalize(center, meters, circle, null)
            }
            this.olMap.on('click', onClick)
            session.offClick = () => this.olMap.un('click', onClick)
            return
        }

        // ── 드래그 모드: Draw(Circle 모드)의 도형을 측지 원으로 ──
        const geometryFunction: GeometryFunction = (coords, geometry, projection) => {
            const pts = coords as Coordinate[]
            const center = pts[0]
            const edge = pts[pts.length - 1]
            const r = groundDistance(center, edge, projection)
            session.shape = { center, edge, meters: r }
            const circle = geodesicCircle(center, r, projection)
            if (geometry) {
                (geometry as Polygon).setCoordinates(circle.getCoordinates())
                return geometry
            }
            return circle
        }
        const draw = new Draw({ source: this.source, type: 'Circle', geometryFunction, style: this.sketchStyle })

        draw.on('drawstart', (e: DrawEvent) => {
            this.dropSketch(session)
            const geom = e.feature.getGeometry() as Geometry
            // 그리는 중 중심 → 커서 점선
            const liveLine = new Feature(new LineString([]))
            liveLine.setStyle(this.dashStyle)
            this.source.addFeature(liveLine)
            const onChange = (): void => {
                const shape = session.shape
                if (!shape) return
                live.render({ value: formatRadius(shape.meters) })
                live.setPosition(shape.center)
                liveLine.getGeometry()?.setCoordinates([shape.center, shape.edge])
            }
            geom.on('change', onChange)
            const offRight = bindSecondaryContextMenu(this.olMap, () => this.tools.deactivate())
            session.sketch = { geom, onChange, offRight, liveLine }
        })

        draw.on('drawend', (e: DrawEvent) => {
            const shape = session.shape
            this.dropSketch(session, false)
            session.shape = null
            if (shape) this.finalize(shape.center, shape.meters, e.feature, shape.edge)
            live.setPosition(undefined)
            live.render({ value: '' })
        })

        draw.on('drawabort', () => {
            this.dropSketch(session)
            session.shape = null
        })

        session.draw = draw
        this.resources.addInteraction(draw)
    }

    // 원 확정 후 공통: 중심점 + (드래그면) 중심→가장자리 점선 + 중심에 반경 툴팁(X = 원·점·선·툴팁 함께 지움)
    private finalize(center: Coordinate, meters: number, circle: Feature, edge: Coordinate | null): void {
        const centerFeature = new Feature(new Point(center))
        centerFeature.setStyle(this.centerDotStyle)
        this.source.addFeature(centerFeature)
        const extras: Feature[] = [centerFeature]
        if (edge) {
            const line = new Feature(new LineString([center, edge]))
            line.setStyle(this.dashStyle)
            this.source.addFeature(line)
            extras.push(line)
        }
        const tooltip = new MeasureTooltip(this.olMap, this.resources, center)
        const item: Fixed = { tooltip, features: [circle, ...extras] }
        this.fixed.push(item)
        tooltip.render({
            value: formatRadius(meters),
            onClose: () => {
                item.features.forEach(f => {
                    if (this.source.hasFeature(f)) this.source.removeFeature(f)
                })
                tooltip.remove()
                this.fixed = this.fixed.filter(f => f !== item)
            },
        })
    }

    private dropSketch(session: Session, resetLive = true): void {
        const s = session.sketch
        if (!s) return
        session.sketch = null
        s.geom.un('change', s.onChange)
        s.offRight()
        if (this.source.hasFeature(s.liveLine)) this.source.removeFeature(s.liveLine)
        if (resetLive) {
            session.live.setPosition(undefined)
            session.live.render({ value: '' })
        }
    }

    private endSession(): void {
        const s = this.session
        if (!s) return
        this.session = null
        s.offClick?.()
        if (s.draw) this.resources.removeInteraction(s.draw)
        this.dropSketch(s)
        s.live.remove()
    }
}
