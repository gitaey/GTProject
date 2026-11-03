// 영역 분석 영역 그리기 도구(ToolHandler): 'analysis-polygon' | 'analysis-box' | 'analysis-circle'.
// interaction은 도구를 켤 때만 붙이고 끝나거나 다른 도구로 바뀌면 바로 뗀다. 그린 도형은 이 도구가 보관하지 않고
// onDrawn(shape, 링)으로 컨트롤러에 넘긴다(컨트롤러가 영역 레이어에 그린다). 원 = 측지 원(반경 도구와 같은 함수).
import Draw, { createBox } from 'ol/interaction/Draw'
import type { DrawEvent, GeometryFunction } from 'ol/interaction/Draw'
import type Polygon from 'ol/geom/Polygon'
import type OlMap from 'ol/Map'
import type { Coordinate } from 'ol/coordinate'
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style'
import { translucent } from '../lib/color'
import type { MapResources } from '../tracker'
import type { MapTool } from '../types/draw'
import { geodesicCircle, groundDistance } from '../tools/RadiusTool'
import { bindSecondaryContextMenu } from '../tools/rightClickFinish'
import type { ToolHandler, ToolManagerImpl } from '../tools/ToolManager'
import type { AreaDrawShape } from './types'

export const ANALYSIS_TOOLS: Readonly<Record<AreaDrawShape, MapTool>> = Object.freeze({
    polygon: 'analysis-polygon',
    box: 'analysis-box',
    circle: 'analysis-circle',
})

export function analysisToolShape(tool: MapTool): AreaDrawShape | null {
    return tool === 'analysis-polygon' ? 'polygon' : tool === 'analysis-box' ? 'box' : tool === 'analysis-circle' ? 'circle' : null
}

export interface AreaDrawToolOptions {
    olMap: OlMap
    resources: MapResources
    tools: ToolManagerImpl
    color: string
    /** 도형이 끝났다 — ring = 뷰 좌표계 바깥 링(닫힘) */
    onDrawn(shape: AreaDrawShape, ring: number[][]): void
}

interface Session {
    draw: Draw
    offRight: (() => void) | null
}

export class AreaDrawTool implements ToolHandler {
    private readonly opts: AreaDrawToolOptions
    private readonly style: Style
    private session: Session | null = null
    private destroyed = false

    constructor(opts: AreaDrawToolOptions) {
        this.opts = opts
        const color = opts.color
        this.style = new Style({
            stroke: new Stroke({ color, width: 2.5, lineDash: [9, 6] }),
            fill: new Fill({ color: translucent(color, 0.08) }),
            image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#fff' }), stroke: new Stroke({ color, width: 2 }) }),
        })
        opts.resources.onDispose(() => {
            this.endSession()
            this.destroyed = true
        })
        opts.tools.register(this)
    }

    handles(tool: MapTool): boolean {
        return analysisToolShape(tool) !== null
    }

    update(next: MapTool): void {
        if (this.destroyed) return
        this.endSession()
        const shape = analysisToolShape(next)
        if (shape) this.startSession(shape)
    }

    private startSession(shape: AreaDrawShape): void {
        const { olMap, resources, tools } = this.opts
        let draw: Draw
        if (shape === 'polygon') {
            draw = new Draw({ type: 'Polygon', style: this.style })
        } else if (shape === 'box') {
            draw = new Draw({ type: 'Circle', geometryFunction: createBox(), style: this.style })
        } else {
            const geometryFunction: GeometryFunction = (coords, geometry, projection) => {
                const pts = coords as Coordinate[]
                const r = groundDistance(pts[0], pts[pts.length - 1], projection)
                const circle = geodesicCircle(pts[0], r, projection)
                if (geometry) {
                    (geometry as Polygon).setCoordinates(circle.getCoordinates())
                    return geometry
                }
                return circle
            }
            draw = new Draw({ type: 'Circle', geometryFunction, style: this.style })
        }
        const session: Session = { draw, offRight: null }
        draw.on('drawstart', () => {
            session.offRight?.()
            session.offRight = bindSecondaryContextMenu(olMap, () => tools.deactivate())
        })
        draw.on('drawend', (e: DrawEvent) => {
            session.offRight?.()
            session.offRight = null
            const geom = e.feature.getGeometry() as Polygon | undefined
            const ring = geom && geom.getType() === 'Polygon' ? geom.getCoordinates()[0] : null
            // 그리기가 끝난 직후 도구를 끈다(interaction을 자기 이벤트 안에서 떼지 않게 한 박자 뒤)
            queueMicrotask(() => {
                if (this.destroyed) return
                if (ring) this.opts.onDrawn(shape, ring.map(p => [p[0], p[1]]))
                if (this.session === session) tools.deactivate()
            })
        })
        draw.on('drawabort', () => {
            session.offRight?.()
            session.offRight = null
        })
        this.session = session
        resources.addInteraction(draw)
    }

    private endSession(): void {
        const s = this.session
        if (!s) return
        this.session = null
        s.offRight?.()
        this.opts.resources.removeInteraction(s.draw)
    }
}
