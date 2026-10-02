// 거리 측정 도구 (옛 hooks/map/useDistanceMeasure.tsx를 React 없이 옮김 — 값·문구·순서 동일)
//   그리는 중: 마지막 점에 "합계: N m" + "우클릭으로 종료", 확정된 구간마다 가운데에 구간 거리
//   확정(drawend): 구간 툴팁마다 X(그 툴팁만 닫음), 끝점에 "합계" 툴팁 + X(선과 그 선의 툴팁 전부 지움)
//   우클릭(그리는 중일 때만 받음): 브라우저 메뉴를 막고 도구를 끈다 → Draw가 빠지며 그리던 선은 취소된다(옛 동작)
//   거리 = ol/sphere getLength(뷰 좌표계를 projection으로) — 지상 거리
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Draw from 'ol/interaction/Draw'
import type { DrawEvent } from 'ol/interaction/Draw'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import type Feature from 'ol/Feature'
import type { FeatureLike } from 'ol/Feature'
import { getLength } from 'ol/sphere'
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style'
import type OlMap from 'ol/Map'
import type { Coordinate } from 'ol/coordinate'
import type { ProjectionLike } from 'ol/proj'
import { formatLength } from '../lib/format'
import type { MapResources } from '../tracker'
import type { MapTool } from '../types/draw'
import { MeasureTooltip } from './measureTooltip'
import type { MeasureToolOptions } from './measureTooltip'
import { bindSecondaryContextMenu } from './rightClickFinish'
import type { ToolHandler, ToolManagerImpl } from './ToolManager'

const TOOL: MapTool = 'measure-distance'

/** 점 목록의 지상 길이(m). projection = 좌표가 지금 있는 좌표계(뷰 좌표계) */
export function lineLength(coords: Coordinate[], projection: ProjectionLike): number {
    return getLength(new LineString(coords), { projection })
}

function vertexImage(color: string): CircleStyle {
    return new CircleStyle({ radius: 5, fill: new Fill({ color: '#fff' }), stroke: new Stroke({ color, width: 2 }) })
}

interface Group {
    feature: Feature
    items: MeasureTooltip[]
}

interface Sketch {
    geom: LineString
    onChange: () => void
    segItems: MeasureTooltip[]
    offRight: () => void
}

interface Session {
    draw: Draw
    live: MeasureTooltip
    sketch: Sketch | null
}

export class DistanceTool implements ToolHandler {
    private readonly olMap: OlMap
    private readonly resources: MapResources
    private readonly tools: ToolManagerImpl
    private readonly color: string
    private readonly source = new VectorSource<Feature>()
    private groups: Group[] = []
    private session: Session | null = null
    private destroyed = false

    constructor(opts: MeasureToolOptions) {
        this.olMap = opts.olMap
        this.resources = opts.resources
        this.tools = opts.tools
        this.color = opts.color
        const color = this.color
        this.resources.addLayer(new VectorLayer({
            source: this.source,
            zIndex: opts.zIndex,
            style: (feature: FeatureLike) => {
                const geom = feature.getGeometry()
                const styles: Style[] = [new Style({ stroke: new Stroke({ color, width: 2.5 }) })]
                if (geom instanceof LineString) {
                    geom.getCoordinates().forEach(coord => {
                        styles.push(new Style({ geometry: new Point(coord), image: vertexImage(color) }))
                    })
                }
                return styles
            },
        }))
        this.resources.onDispose(() => {
            this.endSession()
            this.destroyed = true
            this.groups = []
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

    /** map.clearAll()용: 확정된 선과 툴팁 전부 삭제 */
    clear(): void {
        if (this.destroyed) return
        this.source.clear()
        this.groups.forEach(g => g.items.forEach(t => t.remove()))
        this.groups = []
    }

    private projection(): ProjectionLike {
        return this.olMap.getView().getProjection()
    }

    private startSession(): void {
        const live = new MeasureTooltip(this.olMap, this.resources)
        live.render({ value: '' })
        const color = this.color
        const draw = new Draw({
            source: this.source,
            type: 'LineString',
            style: new Style({ stroke: new Stroke({ color, width: 2.5 }), image: vertexImage(color) }),
        })
        const session: Session = { draw, live, sketch: null }

        draw.on('drawstart', (e: DrawEvent) => {
            this.dropSketch(session)
            const geom = e.feature.getGeometry() as LineString
            const segItems: MeasureTooltip[] = []
            const onChange = (): void => {
                const coords = geom.getCoordinates()
                const last = coords[coords.length - 1]
                // 합계 툴팁
                const total = lineLength(coords, this.projection())
                live.render({ value: `합계: ${formatLength(total)}`, hint: '우클릭으로 종료' })
                live.setPosition(last)
                // 확정된 구간 수만큼 구간 툴팁을 늘린다(마지막 점은 커서를 따라다니는 점)
                const segCount = coords.length - 2
                for (let i = segItems.length; i < segCount; i++) {
                    segItems.push(new MeasureTooltip(this.olMap, this.resources))
                }
                for (let i = 0; i < segItems.length; i++) {
                    if (!coords[i + 1]) continue
                    const segDist = lineLength([coords[i], coords[i + 1]], this.projection())
                    segItems[i].render({ value: formatLength(segDist) })
                    segItems[i].setPosition([(coords[i][0] + coords[i + 1][0]) / 2, (coords[i][1] + coords[i + 1][1]) / 2])
                }
            }
            geom.on('change', onChange)
            const offRight = bindSecondaryContextMenu(this.olMap, () => this.tools.deactivate())
            session.sketch = { geom, onChange, segItems, offRight }
        })

        draw.on('drawend', (e: DrawEvent) => {
            const sketch = session.sketch
            session.sketch = null
            if (sketch) {
                sketch.geom.un('change', sketch.onChange)
                sketch.offRight()
            }
            const segItems = sketch ? sketch.segItems : []
            const feature = e.feature
            const coords = (feature.getGeometry() as LineString).getCoordinates()

            // 끝점 합계 툴팁(구간 툴팁보다 나중에 지도에 붙는다 — 옛 순서)
            const total = coords.length >= 2 ? new MeasureTooltip(this.olMap, this.resources, coords[coords.length - 1]) : null

            const group: Group = { feature, items: [...segItems] }
            this.groups.push(group)
            // 구간 툴팁 — 하나씩 닫기
            segItems.forEach((item, i) => {
                if (!coords[i + 1]) return
                const segDist = lineLength([coords[i], coords[i + 1]], this.projection())
                item.render({
                    value: formatLength(segDist),
                    onClose: () => {
                        item.remove()
                        group.items = group.items.filter(g => g !== item)
                    },
                })
            })
            if (!total) return   // 점 1개짜리(옛 코드도 합계 툴팁 없이 끝냄)
            group.items.push(total)
            total.render({
                value: `합계: ${formatLength(lineLength(coords, this.projection()))}`,
                onClose: () => this.removeGroup(group),
            })
            live.setPosition(undefined)
            live.render({ value: '' })
        })

        // 도구를 끄거나 바꿔서 그리던 선이 취소될 때: 그리던 선의 구간 툴팁·우클릭 리스너 정리
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
        s.segItems.forEach(t => t.remove())
        session.live.setPosition(undefined)
        session.live.render({ value: '' })
    }

    private endSession(): void {
        const s = this.session
        if (!s) return
        this.session = null
        // Draw를 빼면 OL이 그리던 선을 취소하고 drawabort를 보낸다 → dropSketch
        this.resources.removeInteraction(s.draw)
        this.dropSketch(s)
        s.live.remove()
    }

    private removeGroup(group: Group): void {
        this.source.removeFeature(group.feature)
        group.items.forEach(t => t.remove())
        this.groups = this.groups.filter(g => g !== group)
    }
}
