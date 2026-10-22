// 나만의지도 스타일 함수(ol/style만). 설정(MyMapStyleConfig)은 core/lib/mymapStyleConfig.ts가 정하고, 여기서는 그 설정으로 OL 스타일을 만든다.
//   · 본 레이어 스타일: 면(채우기+선) / 점(폴리곤 안쪽 대표점에 원) · 단색 / 범주 / 구간 — 같은 색은 Style 하나를 재사용한다(피처 수와 무관)
//   · 라벨 레이어 스타일: 같은 VectorSource를 쓰는 별도 레이어(declutter·minZoom은 레이어 옵션) — 본 레이어의 점·선이 겹침 제거로 사라지지 않게 분리
//   · 대표점은 피처마다 한 번만 계산해 둔다(폴리곤 안쪽 점 계산은 비싸다). 캐시는 엔진 인스턴스의 컨트롤러가 가진다(모듈 전역 없음)
import { Style, Fill, Stroke, Circle as CircleStyle, Text } from 'ol/style'
import Point from 'ol/geom/Point'
import type { FeatureLike } from 'ol/Feature'
import type Geometry from 'ol/geom/Geometry'
import type LineString from 'ol/geom/LineString'
import type MultiLineString from 'ol/geom/MultiLineString'
import type MultiPoint from 'ol/geom/MultiPoint'
import type MultiPolygon from 'ol/geom/MultiPolygon'
import type Polygon from 'ol/geom/Polygon'
import type { StyleFunction } from 'ol/style/Style'
import type { MyMapStyleConfig } from '../types/mymap'
import { hexToRgba } from './color'
import { displayText, makeClassColorFn } from './mymapStyleConfig'

/** 한글이 깨지지 않게 시스템 한글 글꼴을 앞에 둔다(웹폰트는 싣지 않는다 — 호스트가 이미 가진 글꼴만) */
export const MYMAP_LABEL_FONT_FAMILY =
    '"Pretendard", "Noto Sans KR", "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Nanum Gothic", "NanumGothic", sans-serif'

/** 라벨 글자 최대 길이(넘으면 …) */
const LABEL_MAX_CHARS = 24
/** 라벨 후광 두께(px) */
const HALO_WIDTH = 3

/** 피처의 대표점을 한 번만 계산해 두는 캐시. 점·폴리곤 안쪽점·선 가운데 */
export interface MyMapAnchors {
    of(feature: FeatureLike): Point | null
    /** 범위(extent) 한가운데 점 — 작은 도형을 점 기호로 그릴 때 쓴다(폴리곤 안쪽점 계산 없이 값싸게, 피처마다 한 번만) */
    centerOf(feature: FeatureLike): Point | null
}

function extentCenterPoint(g: Geometry): Point | null {
    const e = g.getExtent()
    if (e.some(v => !Number.isFinite(v))) return null
    return new Point([(e[0] + e[2]) / 2, (e[1] + e[3]) / 2])
}

function computeAnchor(g: Geometry): Point | null {
    switch (g.getType()) {
        case 'Point':
            return g as Point
        case 'MultiPoint': {
            const first = (g as MultiPoint).getPoint(0)
            return first ?? null
        }
        case 'Polygon': {
            const c = (g as Polygon).getInteriorPoint().getCoordinates()
            return Number.isFinite(c[0]) && Number.isFinite(c[1]) ? new Point([c[0], c[1]]) : extentCenterPoint(g)
        }
        case 'MultiPolygon': {
            // 가장 넓은 조각의 안쪽 점(세 번째 값 = 그 점에서의 폭)
            const pts = (g as MultiPolygon).getInteriorPoints().getCoordinates()
            let best: number[] | null = null
            for (const p of pts) if (!best || p[2] > best[2]) best = p
            return best && Number.isFinite(best[0]) && Number.isFinite(best[1]) ? new Point([best[0], best[1]]) : extentCenterPoint(g)
        }
        case 'LineString': {
            const c = (g as LineString).getCoordinateAt(0.5)
            return new Point([c[0], c[1]])
        }
        case 'MultiLineString': {
            const line = (g as MultiLineString).getLineString(0)
            if (!line) return extentCenterPoint(g)
            const c = line.getCoordinateAt(0.5)
            return new Point([c[0], c[1]])
        }
        default:
            return extentCenterPoint(g)
    }
}

/** 컨트롤러 인스턴스마다 하나씩 만든다(WeakMap이라 피처가 사라지면 같이 사라진다) */
export function createMyMapAnchors(): MyMapAnchors {
    const cache = new WeakMap<object, Point | null>()
    const centers = new WeakMap<object, Point | null>()
    return {
        centerOf(feature: FeatureLike): Point | null {
            const key = feature as object
            const hit = centers.get(key)
            if (hit !== undefined) return hit
            const g = feature.getGeometry()
            const p = g ? extentCenterPoint(g as Geometry) : null
            centers.set(key, p)
            return p
        },
        of(feature: FeatureLike): Point | null {
            const key = feature as object
            const hit = cache.get(key)
            if (hit !== undefined) return hit
            const g = feature.getGeometry()
            let p: Point | null = null
            if (g) {
                try {
                    p = computeAnchor(g as Geometry)
                } catch {
                    p = null
                }
            }
            cache.set(key, p)
            return p
        },
    }
}

function isAreaType(type: string): boolean {
    return type === 'Polygon' || type === 'MultiPolygon' || type === 'GeometryCollection'
}

function isPointType(type: string): boolean {
    return type === 'Point' || type === 'MultiPoint'
}

/** 면 도형의 화면 크기(extent 긴 변 ÷ resolution)가 이 값(px) 미만이면 면 대신 점 기호로 그린다 */
export const MYMAP_MIN_SHAPE_PX = 6
/** 작은 도형을 대신하는 점 기호의 최소 반지름(px) */
export const MYMAP_TINY_DOT_RADIUS = 5

/**
 * 면(Polygon·MultiPolygon)이 resolution에서 MYMAP_MIN_SHAPE_PX 미만으로 보이는지. 점·선·그 밖의 도형은 항상 false.
 * 지오메트리가 캐시한 extent를 읽어 뺄셈·나눗셈·비교만 한다(좌표를 훑지 않음 — 렌더마다 피처 수만큼 불려도 가볍다)
 */
export function isTinyArea(g: Geometry, resolution: number): boolean {
    if (!(resolution > 0) || !Number.isFinite(resolution)) return false
    const type = g.getType()
    if (type !== 'Polygon' && type !== 'MultiPolygon') return false
    const e = g.getExtent()
    const span = Math.max(e[2] - e[0], e[3] - e[1])
    return Number.isFinite(span) && span / resolution < MYMAP_MIN_SHAPE_PX
}

function tinyDotStyle(anchors: MyMapAnchors, color: string, radius: number, stroke: Stroke | null): Style {
    return new Style({
        geometry: f => anchors.centerOf(f) ?? undefined,
        image: new CircleStyle({ radius: Math.max(radius, MYMAP_TINY_DOT_RADIUS), fill: new Fill({ color }), ...(stroke ? { stroke } : {}) }),
    })
}

/**
 * 스타일 설정이 없는 레이어(옛 고정 스타일)용 함수. 보통은 base(옛 Style) 그대로, 면이 6px 미만이면 같은 색의 점 기호(반지름 5·흰 테두리 1px)
 */
export function createLegacyMyMapStyle(base: Style, color: string, anchors: MyMapAnchors): StyleFunction {
    let tiny: Style | null = null
    return (feature: FeatureLike, resolution: number): Style | undefined => {
        const g = feature.getGeometry()
        if (!g) return undefined
        if (!isTinyArea(g as Geometry, resolution)) return base
        if (!tiny) tiny = tinyDotStyle(anchors, color, MYMAP_TINY_DOT_RADIUS, new Stroke({ color: '#fff', width: 1 }))
        return tiny
    }
}

/**
 * 본 레이어 스타일 함수. 색 하나(단색이면 설정의 fill/stroke/pointColor, 범주·구간이면 값에서 나온 색)마다 Style을 하나만 만든다.
 * 채우기는 투명도 0이어도 Fill을 둔다(OL 클릭 판정은 채우기가 있는 도형만 잡는다).
 * 면이 화면에서 MYMAP_MIN_SHAPE_PX 미만이면 그 도형 대신 중심점에 점 기호(점 색·테두리 설정을 따름)를 그린다 — 전국 줌에서 작은 필지가 안 보이는 문제
 */
export function createMyMapStyle(cfg: MyMapStyleConfig, anchors: MyMapAnchors): StyleFunction {
    const classColor = cfg.classify ? makeClassColorFn(cfg.classify) : null
    const field = cfg.classify ? cfg.classify.field : null
    const cache = new Map<string, Style>()

    const image = (color: string): CircleStyle =>
        new CircleStyle({
            radius: cfg.pointRadius,
            fill: new Fill({ color }),
            ...(cfg.pointStrokeWidth > 0 ? { stroke: new Stroke({ color: cfg.pointStroke, width: cfg.pointStrokeWidth }) } : {}),
        })

    // 점 색: 값별·구간 색이 있으면 그 색, 아니면 설정한 점 색, 없으면 선 색(옛 모양)
    const dot = (color: string | null): string => color ?? cfg.pointColor ?? cfg.stroke
    const build = (color: string | null, asPoint: boolean, tiny: boolean): Style => {
        if (tiny) {
            const stroke = cfg.pointStrokeWidth > 0 ? new Stroke({ color: cfg.pointStroke, width: cfg.pointStrokeWidth }) : null
            return tinyDotStyle(anchors, dot(color), cfg.pointRadius, stroke)
        }
        if (asPoint) {
            return new Style({
                geometry: f => anchors.of(f) ?? undefined,
                image: image(dot(color)),
            })
        }
        const fill = color ?? cfg.fill
        const stroke = color ?? cfg.stroke
        return new Style({
            fill: new Fill({ color: hexToRgba(fill, cfg.fillOpacity) }),
            ...(cfg.strokeWidth > 0 ? { stroke: new Stroke({ color: stroke, width: cfg.strokeWidth }) } : {}),
            image: image(dot(color)),
        })
    }

    return (feature: FeatureLike, resolution: number): Style | undefined => {
        const g = feature.getGeometry()
        if (!g) return undefined
        const asPoint = cfg.display === 'point' && isAreaType((g as Geometry).getType())
        const tiny = !asPoint && isTinyArea(g as Geometry, resolution)
        const color = classColor && field ? classColor(feature.get(field)) : null
        const key = (asPoint ? 'p|' : tiny ? 't|' : 'g|') + (color ?? '')
        let style = cache.get(key)
        if (!style) {
            style = build(color, asPoint, tiny)
            cache.set(key, style)
        }
        return style
    }
}

/**
 * 라벨 레이어 스타일 함수(cfg.label이 있을 때). Style·Text는 하나를 돌려 쓰며 피처마다 글자만 바꾼다(OL이 그 자리에서 읽어 간다).
 * 위치는 대표점(폴리곤 안쪽·선 가운데). 점이거나 표시 방식이 "점"이면 점 위쪽에 띄운다. 값이 없으면 라벨 없음
 */
export function createMyMapLabelStyle(cfg: MyMapStyleConfig, anchors: MyMapAnchors): StyleFunction | null {
    const label = cfg.label
    if (!label) return null
    const text = new Text({
        font: `${label.size}px ${MYMAP_LABEL_FONT_FAMILY}`,
        fill: new Fill({ color: label.color }),
        stroke: new Stroke({ color: label.halo, width: HALO_WIDTH }),
        textAlign: 'center',
        textBaseline: 'middle',
        padding: [1, 2, 1, 2],
    })
    const style = new Style({ geometry: f => anchors.of(f) ?? undefined, text })
    const lift = -(cfg.pointRadius + Math.round(label.size / 2) + 2)
    return (feature: FeatureLike): Style | undefined => {
        const g = feature.getGeometry()
        if (!g) return undefined
        const s = displayText(feature.get(label.field), LABEL_MAX_CHARS)
        if (s === '') return undefined
        const type = (g as Geometry).getType()
        const above = isPointType(type) || (cfg.display === 'point' && isAreaType(type))
        text.setText(s)
        text.setOffsetY(above ? lift : 0)
        return style
    }
}
