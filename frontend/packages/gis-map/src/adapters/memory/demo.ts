// 합성 샘플 데이터 + 배경지도 설정 → "서버 없이 도는 데모 한 벌"(소스·설정·중심). 웹 데모(/demo)와 정적 예제 폴더(gis-demo)가 같은 함수를 쓴다.
// 배경지도: 'osm'(키 없음, 기본) | 'vworld'(그 서버 도메인으로 발급한 키 필요) | 'both'(VWorld + OSM 추가 레이어) | 'none'(폐쇄망 — 타일 요청 0).
import { isVWorldTileUrl } from '../../core'
import type { GisMapConfig, GisMapSources, LayerDef, LayerGroupDef, LayerTree } from '../../core'
import { memorySources } from './sources'
import { createSyntheticData } from './synthetic'
import type { SyntheticData, SyntheticOptions } from './synthetic'
import type { MemorySourcesOptions } from './types'

export type DemoBasemap = 'osm' | 'vworld' | 'both' | 'none'

export interface DemoSourcesOptions extends SyntheticOptions, MemorySourcesOptions {
    /** 기본 'osm' */
    basemap?: DemoBasemap
    /** 'vworld'·'both'일 때만. 비어 있으면 배경지도를 넣지 않고 notice에 안내를 담는다 */
    vworldKey?: string
    /** 트리 맨 뒤에 덧붙일 그룹(웹 데모가 GeoServer 레이어를 더할 때) */
    extraGroups?: LayerGroupDef[]
}

export interface DemoSources {
    /** GisMap.create/attach의 sources에 그대로 */
    sources: Partial<GisMapSources>
    /** create/attach 옵션에 펼쳐 넣을 설정(레이어 crossOrigin·출력 고지). view는 attach에 쓸 수 없어 따로 준다 */
    config: Pick<GisMapConfig, 'layers' | 'print'>
    /** 지도 처음 보기(경도·위도, 줌). create는 view로, attach는 호스트 지도의 View에 직접 */
    view: { center: [number, number]; zoom: number }
    /** 실제로 쓴 배경지도 */
    basemap: DemoBasemap
    /** 화면에 보일 안내(VWorld 키 없음 등). 없으면 null */
    notice: string | null
    /** 합성 데이터 원본(시험·웹 데모가 읽는다) */
    data: SyntheticData
}

function layerDef(id: number, groupId: number, name: string, type: LayerDef['type'], sourceType: LayerDef['sourceType'], url: string, layerName: string | null, visible: boolean, extra?: Partial<LayerDef>): LayerDef {
    return {
        id, name, type, sourceType, url, layerName, styleName: null, styleConfig: null, format: type === 'XYZ' ? 'image/png' : null, projection: null,
        minZoom: null, maxZoom: null, opacity: 1, visible, sortOrder: id, groupId, groupName: null, description: null, createdAt: '', updatedAt: '', ...extra,
    }
}

function basemapLayers(basemap: DemoBasemap): LayerDef[] {
    const vworld = (): LayerDef[] => [
        layerDef(11, 1, 'VWorld 일반', 'XYZ', 'OPENAPI', 'https://api.vworld.kr/req/wmts/1.0.0/{VWORLD_KEY}/Base/{z}/{y}/{x}.png', 'Base', true),
        layerDef(12, 1, 'VWorld 위성', 'XYZ', 'OPENAPI', 'https://api.vworld.kr/req/wmts/1.0.0/{VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg', 'Satellite', false),
        layerDef(13, 1, 'VWorld 하이브리드', 'XYZ', 'OPENAPI', 'https://api.vworld.kr/req/wmts/1.0.0/{VWORLD_KEY}/Hybrid/{z}/{y}/{x}.png', 'Hybrid', false),
    ]
    const osmUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
    if (basemap === 'vworld') return vworld()
    if (basemap === 'both') return [...vworld(), layerDef(14, 1, 'OpenStreetMap', 'XYZ', 'XYZ', osmUrl, 'osm', false, { maxZoom: 19 })]
    if (basemap === 'osm') return [layerDef(14, 1, 'OpenStreetMap', 'XYZ', 'XYZ', osmUrl, 'Base', true, { maxZoom: 19 })]
    return []
}

/** 샘플 주제도 — 영역 분석 대상(그림은 그리지 않는 WFS 자리, 질의는 메모리 소스가 답한다). GEOSERVER 표시여야 영역 분석이 질의 대상으로 본다 */
function themeLayers(): LayerDef[] {
    return [
        layerDef(21, 2, '샘플 필지(가상)', 'WFS', 'GEOSERVER', 'demo://parcel', 'demo:parcel', true, { description: '영역 분석 시연용 — 지도에는 그리지 않습니다. 나만의지도의 "필지(가상) 면"으로 볼 수 있습니다' }),
        layerDef(22, 2, '용도지역(가상)', 'WFS', 'GEOSERVER', 'demo://zone', 'demo:zone', true, { description: '영역 분석 시연용(가상 4개 구역)' }),
    ]
}

/** 레이어 이미지 crossOrigin: VWorld·OSM 타일에 'anonymous'(두 서버 모두 CORS를 준다) — 출력(PNG·PDF) 저장이 되게 한다 */
export function demoLayerCrossOrigin(layer: LayerDef, url: string): 'anonymous' | null {
    if (layer.type === 'WMS' || layer.type === 'WFS') return null
    return isVWorldTileUrl(url) || url.indexOf('tile.openstreetmap.org') >= 0 ? 'anonymous' : null
}

export function demoSources(opts: DemoSourcesOptions = {}): DemoSources {
    let basemap: DemoBasemap = opts.basemap ?? 'osm'
    let notice: string | null = null
    if ((basemap === 'vworld' || basemap === 'both') && !(opts.vworldKey && opts.vworldKey.trim() !== '')) {
        notice = "배경지도 'vworld'는 이 서버 도메인으로 발급한 VWorld 키가 필요합니다. 키가 없어 배경지도를 넣지 않았습니다(설정에서 키를 넣거나 'osm'·'none'을 고르세요)."
        basemap = 'none'
    }
    const data = createSyntheticData(opts)
    const groups: LayerGroupDef[] = []
    const bases = basemapLayers(basemap)
    if (bases.length > 0) groups.push({ id: 1, name: '배경지도', parentId: null, sortOrder: 0, children: [], layers: bases })
    groups.push({ id: 2, name: '주제도(가상)', parentId: null, sortOrder: 1, children: [], layers: themeLayers() })
    for (const g of opts.extraGroups ?? []) groups.push(g)
    const tree: LayerTree = { groups, ungroupedLayers: [] }
    data.tree = tree
    const attributions: string[] = []
    if (basemap === 'osm' || basemap === 'both') attributions.push('© OpenStreetMap contributors')
    // VWorld 고지는 출력이 VWorld 레이어가 보일 때 알아서 넣는다(print.vworldAttribution 기본)
    attributions.push('샘플(가상) 데이터')
    return {
        sources: memorySources(data, { uploadNotice: opts.uploadNotice }),
        config: { layers: { crossOrigin: demoLayerCrossOrigin }, print: { attributions } },
        view: { center: data.center, zoom: data.zoom },
        basemap,
        notice,
        data,
    }
}
