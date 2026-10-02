// 필지 강조(지도 인스턴스마다 하나). 옛 hooks/map/useParcelHighlight.ts + stores/map/mapStore.ts의
// 모듈 전역 registerParcelHighlighter/highlightParcel을 대신한다. 검색창은 자기 지도의 map.parcel.highlight()를 부른다.
//   1) 핀을 곧바로 표시(검색 좌표)
//   2) ParcelSource(짝 호스트 프록시면 VWorld 데이터 API)로 그 지점의 필지 폴리곤을 받아 같은 레이어에 넣고
//   3) 핀을 첫 폴리곤 범위의 중심으로 옮긴다
// 새로 강조하면 이전 강조 레이어를 떼고, clear()(엔진 clearAll)나 destroy 때도 뗀다.
import type OlMap from 'ol/Map'
import type Feature from 'ol/Feature'
import type Geometry from 'ol/geom/Geometry'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import GeoJSON from 'ol/format/GeoJSON'
import FeatureClass from 'ol/Feature'
import Point from 'ol/geom/Point'
import { getCenter } from 'ol/extent'
import { Style, Fill, Stroke, Icon, Text } from 'ol/style'
import { fromLonLat } from 'ol/proj'
import type { ResolvedGisMapTheme } from '../config'
import type { ParcelSource } from '../sources'
import type { MapResources } from '../tracker'

export interface ParcelHighlighter {
    /** 핀 즉시 표시 → parcel 소스가 있으면 필지 폴리곤 로드 후 핀을 중심으로 이동 */
    highlight(lon: number, lat: number, title?: string): void
    clear(): void
    /** 지금 붙어 있는 강조 레이어(없으면 null) */
    getOlLayer(): VectorLayer<Feature<Geometry>> | null
}

export interface ParcelHighlighterOptions {
    olMap: OlMap
    resources: MapResources
    source?: ParcelSource
    zIndex: number
    theme: Readonly<ResolvedGisMapTheme>
}

/** 옛 PIN_SVG와 같은 글자(색만 테마 primary. 테마 기본값 DEFAULT_THEME.primary이면 옛 문자열과 한 글자도 다르지 않다) */
export function pinSvg(color: string): string {
    return encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
  <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="${color}"/>
  <circle cx="14" cy="14" r="6" fill="white"/>
  <circle cx="14" cy="14" r="3.5" fill="${color}"/>
</svg>`
    )
}

/** 옛 makePinStyle 그대로 */
export function makePinStyle(color: string, title?: string): Style[] {
    const styles: Style[] = [
        new Style({
            image: new Icon({
                src: `data:image/svg+xml;utf8,${pinSvg(color)}`,
                anchor: [0.5, 1],
                anchorXUnits: 'fraction',
                anchorYUnits: 'fraction',
            }),
        }),
    ]

    if (title) {
        const text = title
        styles.push(new Style({
            text: new Text({
                text,
                font: 'bold 13px -apple-system, sans-serif',
                offsetY: -52,
                textAlign: 'center',
                fill: new Fill({ color: '#1a1a1a' }),
                stroke: new Stroke({ color: 'rgba(255,255,255,0.9)', width: 4 }),
            }),
        }))
    }

    return styles
}

/** 옛 PARCEL_STYLE(채우기·선 색은 테마 parcel, 기본값이 옛 값) */
export function makeParcelStyle(theme: Readonly<ResolvedGisMapTheme>): Style {
    return new Style({
        fill: new Fill({ color: theme.parcel.fill }),
        stroke: new Stroke({ color: theme.parcel.stroke, width: 2 }),
    })
}

export class ParcelHighlighterImpl implements ParcelHighlighter {
    private readonly opts: ParcelHighlighterOptions
    private readonly parcelStyle: Style
    private layer: VectorLayer<Feature<Geometry>> | null = null
    private destroyed = false

    constructor(opts: ParcelHighlighterOptions) {
        this.opts = opts
        this.parcelStyle = makeParcelStyle(opts.theme)
    }

    highlight(lon: number, lat: number, title?: string): void {
        if (this.destroyed) return
        const { olMap, resources, source, zIndex, theme } = this.opts
        const projection = olMap.getView().getProjection()

        // 기존 레이어 제거
        this.clear()

        // 핀 즉시 표시 (searched 좌표)
        const pinFeature = new FeatureClass({ geometry: new Point(fromLonLat([lon, lat], projection)) })
        pinFeature.setStyle(makePinStyle(theme.primary, title))

        const vectorSource = new VectorSource<Feature<Geometry>>({ features: [pinFeature as Feature<Geometry>] })
        const layer = new VectorLayer<Feature<Geometry>>({ source: vectorSource, zIndex })
        resources.addLayer(layer)
        this.layer = layer

        if (!source) return
        // 필지 폴리곤 비동기 로드 → 핀을 폴리곤 중심으로 이동.
        // 그사이 다른 곳을 강조했거나 지웠으면 이 소스는 이미 지도에서 떨어진 레이어의 것이라 화면에 나오지 않는다(옛 동작과 같음)
        source.featuresAt(lon, lat)
            .then(features => {
                if (this.destroyed || !features.length) return
                const olFeatures = new GeoJSON().readFeatures(
                    { type: 'FeatureCollection', features },
                    { featureProjection: projection },
                )
                if (!olFeatures.length) return

                olFeatures.forEach(f => f.setStyle(this.parcelStyle))

                // 핀을 폴리곤 중심으로 이동
                const extent = olFeatures[0].getGeometry()?.getExtent()
                if (extent) {
                    pinFeature.setGeometry(new Point(getCenter(extent)))
                }

                vectorSource.addFeatures(olFeatures)
            })
            .catch(() => {})
    }

    clear(): void {
        if (this.layer) {
            this.opts.resources.removeLayer(this.layer)
            this.layer = null
        }
    }

    getOlLayer(): VectorLayer<Feature<Geometry>> | null {
        return this.layer
    }

    destroy(): void {
        if (this.destroyed) return
        this.clear()
        this.destroyed = true
    }
}
