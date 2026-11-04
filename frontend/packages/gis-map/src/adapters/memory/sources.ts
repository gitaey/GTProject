// 메모리 소스 어댑터: 서버·파일 없이 "이미 가진 데이터(MemoryData)"로 GisMapSources를 만든다.
// 폐쇄망 시연·백엔드 없는 시제품·정적 예제(gis-demo)가 같은 코드를 쓴다. 저장소(나만의지도 수정·삭제·공유)는 이 함수가 부를 때마다 새로 만든 객체이며
// 모듈 전역 상태는 없다 — "초기화" = 소스를 다시 만든다. 호출하는 쪽이 서버를 갖지 않으므로 http·host는 쓰지 않는다.
import { AreaQueryUnsupportedError, GisHttpError, transformGeoJson } from '../../core'
import type {
    AddressSearchItem, AddressSearchSource, AreaQuerySource, BulkShareResult, GeoJsonObject, GisMapSources, LayerTree, MyMapSource, ParcelBuildingSource,
    ParcelBuildingsResult, ParcelInfo, ParcelSource, RegionNameSource, ShareChange, ShareDirectorySource, ShareSnapshot, ShareTargetSource,
    UserMapListItem, UserMapShare, WindField, WindFrameMeta, WindSource,
} from '../../core'
import type { MemoryData, MemoryMapLayer, MemoryParcel, MemoryRegion, MemorySourcesOptions } from './types'
import { bboxIntersects, geometryBbox, geometryOf, outerRings, pointInRing, ringBbox } from './util'
import type { Bbox } from './util'
import { buildXlsx } from './xlsx'

export const DEFAULT_UPLOAD_NOTICE = '데모에서는 업로드를 저장하지 않습니다. 로그인 후 사용할 수 있습니다.'

function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T
}

function norm(s: string): string {
    return s.replace(/\s+/g, '').toLowerCase()
}

/** 점이 속한 필지(없으면 null) — 바깥 링 범위로 먼저 거른다 */
function parcelAt(index: Array<{ p: MemoryParcel; bbox: Bbox; rings: number[][][] }>, lon: number, lat: number): MemoryParcel | null {
    for (const e of index) {
        if (lon < e.bbox[0] || lon > e.bbox[2] || lat < e.bbox[1] || lat > e.bbox[3]) continue
        for (const ring of e.rings) if (pointInRing(lon, lat, ring)) return e.p
    }
    return null
}

function addressSource(places: AddressSearchItem[]): AddressSearchSource {
    return {
        search(query: string, size: number): Promise<AddressSearchItem[]> {
            const q = norm(query)
            if (q === '') return Promise.resolve([])
            const hit = places.filter(p => norm(p.title + p.category + p.address.road + p.address.parcel).includes(q))
            return Promise.resolve(clone(hit.slice(0, Math.max(0, size))))
        },
    }
}

function regionSource(regions: MemoryRegion[]): RegionNameSource {
    return {
        nameAt(lon: number, lat: number): Promise<string | null> {
            let best: MemoryRegion | null = null
            let bestArea = Infinity
            for (const r of regions) {
                const b = r.bbox
                if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue
                const area = (b[2] - b[0]) * (b[3] - b[1])
                if (area < bestArea) {
                    best = r
                    bestArea = area
                }
            }
            return Promise.resolve(best ? best.name : null)
        },
    }
}

function parcelSources(parcels: MemoryParcel[]): { parcel: ParcelSource; parcelBuildings: ParcelBuildingSource } {
    const index = parcels.map(p => {
        const rings = outerRings(geometryOf(p.info.geometry as GeoJsonObject))
        return { p, rings, bbox: ringBbox(rings.flat()) }
    })
    const byPnu = new Map<string, MemoryParcel>()
    for (const p of parcels) byPnu.set(p.info.pnu, p)
    return {
        parcel: {
            featuresAt(lon: number, lat: number): Promise<GeoJsonObject[]> {
                const p = parcelAt(index, lon, lat)
                return Promise.resolve(p && p.info.geometry ? [clone(p.info.geometry)] : [])
            },
            infoAt(lon: number, lat: number): Promise<ParcelInfo | null> {
                const p = parcelAt(index, lon, lat)
                return Promise.resolve(p ? clone(p.info) : null)
            },
        },
        parcelBuildings: {
            byPnu(pnu: string, opts?: { limit?: number }): Promise<ParcelBuildingsResult> {
                const p = byPnu.get(pnu)
                const empty: ParcelBuildingsResult = { pnu, referenceVersion: null, buildingCount: 0, truncated: false, relatedIncluded: false, addresses: [] }
                if (!p || !p.buildings) return Promise.resolve(empty)
                const out = clone(p.buildings)
                const limit = opts?.limit
                if (limit !== undefined && limit >= 0) {
                    let left = limit
                    for (const g of out.addresses) {
                        g.buildings = g.buildings.slice(0, left)
                        left -= g.buildings.length
                    }
                    out.addresses = out.addresses.filter(g => g.buildings.length > 0)
                    const shown = out.addresses.reduce((s, g) => s + g.buildings.length, 0)
                    out.truncated = shown < out.buildingCount
                }
                return Promise.resolve(out)
            },
        },
    }
}

function areaQuerySource(data: MemoryData): AreaQuerySource {
    const layers = data.areaLayers ?? {}
    const boxes = new Map<string, Array<{ f: GeoJsonObject; b: Bbox }>>()
    const boxesOf = (name: string): Array<{ f: GeoJsonObject; b: Bbox }> => {
        let list = boxes.get(name)
        if (!list) {
            list = layers[name].features.map(f => ({ f, b: geometryBbox(geometryOf(f)) ?? ([0, 0, 0, 0] as Bbox) }))
            boxes.set(name, list)
        }
        return list
    }
    // 서버가 하는 일 흉내: 영역(링)의 범위와 겹치는 후보만 돌려준다 — 정확한 걸침 판정·잘라낸 면적은 엔진이 한다
    const candidates = (name: string, ring: number[][]): GeoJsonObject[] => {
        const rb = ringBbox(ring)
        return boxesOf(name).filter(e => bboxIntersects(e.b, rb)).map(e => e.f)
    }
    const nameOf = (layerName: string | null | undefined): string | null => (layerName && layers[layerName] ? layerName : null)
    return {
        describe(layer) {
            const name = nameOf(layer.layerName)
            if (!name) return Promise.resolve({ queryable: false, reason: '샘플 데이터에 없는 레이어' })
            const l = layers[name]
            return Promise.resolve({ queryable: true, columns: l.columns, defaultCategory: l.defaultCategory ?? null, supportsCount: true })
        },
        count(layer, _part, ring) {
            const name = nameOf(layer.layerName)
            return Promise.resolve(name ? candidates(name, ring).length : null)
        },
        query(layer, _part, ring, page) {
            const name = nameOf(layer.layerName)
            if (!name) return Promise.reject(new AreaQueryUnsupportedError('샘플 데이터에 없는 레이어입니다'))
            if (page > 1) return Promise.resolve({ features: [], total: null, hasMore: false })
            const hit = candidates(name, ring)
            return Promise.resolve({ features: clone(hit), total: hit.length, hasMore: false })
        },
    }
}

function windSource(data: MemoryData): WindSource | undefined {
    const frames = data.windFrames
    if (!frames || frames.length === 0) return undefined
    const cache = new Map<number, WindField>()
    const fieldOf = (id: number): WindField | null => {
        const f = frames.find(x => x.meta.id === id)
        if (!f) return null
        let v = cache.get(id)
        if (!v) {
            v = typeof f.field === 'function' ? f.field() : f.field
            cache.set(id, v)
        }
        return v
    }
    return {
        latest: () => Promise.resolve(fieldOf(frames[0].meta.id)),
        frames: (): Promise<WindFrameMeta[]> => Promise.resolve(frames.map(f => ({ ...f.meta }))),
        frame: (id: number) => Promise.resolve(fieldOf(id)),
    }
}

interface Share {
    userIds: string[]
    roleCodes: string[]
}

function myMapSource(data: MemoryData, opts: MemorySourcesOptions): MyMapSource {
    // 저장소: 부를 때마다 새로 만든 사본(소스를 다시 만들면 처음 상태)
    const layers: MemoryMapLayer[] = (data.myMaps ?? []).map(l => ({ ...l }))
    const shares = new Map<number, Share>()
    for (const l of layers) shares.set(l.id, l.shares ? { userIds: l.shares.userIds.slice(), roleCodes: l.shares.roleCodes.slice() } : { userIds: [], roleCodes: [] })
    const users = data.users ?? []
    const groups = data.groups ?? []
    const find = (id: number): MemoryMapLayer => {
        const l = layers.find(x => x.id === id)
        if (!l) throw new GisHttpError(404, '레이어를 찾을 수 없습니다')
        return l
    }
    const owned = (id: number): MemoryMapLayer => {
        const l = find(id)
        if (!l.owner) throw new GisHttpError(403, '등록자만 할 수 있습니다')
        return l
    }
    const item = (l: MemoryMapLayer): UserMapListItem => {
        const s = shares.get(l.id)
        return {
            id: l.id, name: l.name, description: l.description ?? null, sourceType: l.sourceKind === 'SHP' ? 'SHP' : 'EXCEL', sourceKind: l.sourceKind, geomType: l.geomType,
            status: 'READY', visible: false, featureCount: l.featureCount, owner: l.owner, styleConfig: l.styleConfig ?? null, createdAt: l.createdAt,
            ownerId: l.ownerId ?? null, ownerName: l.ownerName ?? null, shareCount: l.owner && s ? s.userIds.length + s.roleCodes.length : null,
        }
    }
    const snapshot = (id: number): ShareSnapshot => {
        const s = shares.get(id) ?? { userIds: [], roleCodes: [] }
        return {
            users: s.userIds.map(uid => {
                const u = users.find(x => x.userId === uid)
                return { userId: uid, name: u ? u.name : null, state: u ? ('ACTIVE' as const) : ('MISSING' as const) }
            }),
            roles: s.roleCodes.map(code => {
                const g = groups.find(x => x.code === code)
                return { code, label: g ? g.label : null, state: g ? ('ACTIVE' as const) : ('MISSING' as const) }
            }),
        }
    }
    const uniq = (a: string[]): string[] => Array.from(new Set(a))
    const geojsonOf = (l: MemoryMapLayer): GeoJsonObject => (typeof l.geojson === 'function' ? l.geojson() : l.geojson)

    const src: MyMapSource = {
        list: () => Promise.resolve(layers.map(item)),
        status: async id => {
            const l = find(id)
            return Promise.resolve({ status: 'READY' as const, featureCount: l.featureCount, geomType: l.geomType })
        },
        geojson: async id => geojsonOf(find(id)),
        remove: async id => {
            owned(id)
            layers.splice(layers.findIndex(x => x.id === id), 1)
            shares.delete(id)
            return Promise.resolve()
        },
        update: async (id, patch) => {
            const l = owned(id)
            if (patch.name !== undefined) {
                const name = patch.name.trim()
                if (name === '') return Promise.reject(new Error('이름을 입력하세요'))
                l.name = name
            }
            if (patch.description !== undefined) l.description = patch.description
            if (patch.styleConfig !== undefined) l.styleConfig = patch.styleConfig === '' ? null : patch.styleConfig
            return Promise.resolve()
        },
        shareTarget: shareTarget(),
        // 가상 소유자·공유 읽기: shareTarget이 있으면 쓰이지 않지만 옛 화면 호환으로 둔다
        getShare: async (id): Promise<UserMapShare> => {
            owned(id)
            const s = shares.get(id) ?? { userIds: [], roleCodes: [] }
            return Promise.resolve({ userIds: s.userIds.slice(), roleCodes: s.roleCodes.slice() })
        },
        setShare: async (id, share) => {
            owned(id)
            shares.set(id, { userIds: uniq(share.userIds), roleCodes: uniq(share.roleCodes) })
            return Promise.resolve()
        },
        exportLayer: async (id, o, signal) => {
            if (signal?.aborted) throw new Error('취소됨')
            const l = find(id)
            const code = 'EPSG:' + o.srid
            const fc = transformGeoJson(geojsonOf(l), 'EPSG:4326', code)
            const base = l.name.replace(/[\\/:*?"<>|]/g, '_') + '_EPSG' + o.srid
            if (o.format === 'geojson') {
                return { blob: new Blob([JSON.stringify(fc)], { type: 'application/geo+json' }), fileName: base + '.geojson', failedSkipped: false }
            }
            const feats = (fc.features as GeoJsonObject[]) ?? []
            const cols: string[] = []
            const seen = new Set<string>()
            for (const f of feats) {
                for (const k of Object.keys((f.properties as Record<string, unknown>) ?? {})) {
                    if (!seen.has(k)) {
                        seen.add(k)
                        cols.push(k)
                    }
                }
            }
            const rows = feats.map(f => {
                const props = (f.properties as Record<string, unknown>) ?? {}
                const gb = geometryBbox(f.geometry as GeoJsonObject)
                const cells = cols.map(c => {
                    const v = props[c]
                    return typeof v === 'number' || typeof v === 'string' ? v : v == null ? null : JSON.stringify(v)
                })
                return [...cells, gb ? (gb[0] + gb[2]) / 2 : null, gb ? (gb[1] + gb[3]) / 2 : null, ((f.geometry as GeoJsonObject | null)?.type as string) ?? null]
            })
            if (signal?.aborted) throw new Error('취소됨')
            const bytes = buildXlsx(l.name, [...cols, 'X', 'Y', '도형'], rows)
            const buf = new ArrayBuffer(bytes.length)
            new Uint8Array(buf).set(bytes)
            return {
                blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                fileName: base + '.xlsx',
                failedSkipped: false,
            }
        },
    }

    function shareTarget(): ShareTargetSource {
        const apply = (id: number, mode: 'ADD' | 'REMOVE' | 'SET', c: ShareChange): void => {
            owned(id)
            const cur = shares.get(id) ?? { userIds: [], roleCodes: [] }
            if (mode === 'SET') shares.set(id, { userIds: uniq(c.userIds), roleCodes: uniq(c.roleCodes) })
            else if (mode === 'ADD') shares.set(id, { userIds: uniq([...cur.userIds, ...c.userIds]), roleCodes: uniq([...cur.roleCodes, ...c.roleCodes]) })
            else shares.set(id, { userIds: cur.userIds.filter(u => !c.userIds.includes(u)), roleCodes: cur.roleCodes.filter(r => !c.roleCodes.includes(r)) })
        }
        return {
            get: async id => {
                owned(id)
                return Promise.resolve(snapshot(id))
            },
            set: async (id, change) => {
                apply(id, 'SET', change)
                return Promise.resolve()
            },
            getMany: ids => Promise.resolve(ids.filter(id => layers.some(l => l.id === id && l.owner)).map(id => ({ id, ...snapshot(id) }))),
            bulk: (ids, mode, change) => {
                const out: BulkShareResult = { succeededIds: [], failed: [] }
                for (const id of ids) {
                    const l = layers.find(x => x.id === id)
                    if (!l || !l.owner) out.failed.push({ id, reason: 'NOT_AVAILABLE' })
                    else {
                        apply(id, mode, change)
                        out.succeededIds.push(id)
                    }
                }
                return Promise.resolve(out)
            },
        }
    }

    const notice = opts.uploadNotice === undefined ? DEFAULT_UPLOAD_NOTICE : opts.uploadNotice
    if (notice !== null) {
        const reject = (): Promise<never> => Promise.reject(new Error(notice))
        src.uploadShp = reject
        src.previewExcel = reject
        src.confirmExcel = reject
        src.convertExcel = reject
    }
    return src
}

function shareDirectorySource(data: MemoryData): ShareDirectorySource | undefined {
    const users = data.users
    const groups = data.groups
    if (!users && !groups) return undefined
    return {
        searchUsers(query: string, opts?: { limit?: number }) {
            const q = norm(query)
            const hit = (users ?? []).filter(u => norm((u.name ?? '') + u.userId).includes(q))
            return Promise.resolve(clone(hit.slice(0, opts?.limit ?? 20)))
        },
        listGroups: () => Promise.resolve(clone(groups ?? [])),
    }
}

/**
 * MemoryData → GisMapSources. 데이터에 없는 항목의 소스는 만들지 않는다(그 기능은 조용히 꺼진다).
 * 예: `GisMap.create({ sources: [GisMap.adapters.memory(data)] })`. 반환 객체는 호출마다 새 저장소를 가진다.
 */
export function memorySources(data: MemoryData, opts: MemorySourcesOptions = {}): Partial<GisMapSources> {
    const out: Partial<GisMapSources> = {}
    const tree = data.tree
    if (tree) out.layerTree = { loadTree: () => Promise.resolve(clone<LayerTree>(tree)) }
    if (data.myMaps) out.myMap = myMapSource(data, opts)
    if (data.parcels) {
        const p = parcelSources(data.parcels)
        out.parcel = p.parcel
        out.parcelBuildings = p.parcelBuildings
    }
    if (data.places) out.addressSearch = addressSource(data.places)
    if (data.regions) out.regionName = regionSource(data.regions)
    if (data.areaLayers) out.areaQuery = areaQuerySource(data)
    const wind = windSource(data)
    if (wind) out.wind = wind
    const dir = shareDirectorySource(data)
    if (dir) out.shareDirectory = dir
    return out
}
