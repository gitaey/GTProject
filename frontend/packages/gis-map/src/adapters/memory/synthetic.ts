// 합성(가상) 샘플 데이터 생성기 — 시드가 같으면 어디서나 같은 데이터. 실제 필지·건물·시설·관측과 무관하다.
// 시범 구역은 세종 인근 격자(필지 300개). 가상 PNU는 실제 지번과 겹치지 않게 법정동코드 3611099900(없는 동)·본번 9000번대를 쓴다.
// 모든 생성은 함수 호출 안에서만 한다(모듈 전역에 데이터를 두지 않는다). 내보내는 상수는 얼려 둔다.
import type { AddressSearchItem, GeoJsonObject, ParcelBuildingsResult, ParcelInfo, WindField, WindFrameMeta } from '../../core'
import type { MemoryData, MemoryMapLayer, MemoryParcel, MemoryRegion, MemoryWindFrame } from './types'
import { createRng, hash01, utcHourIso } from './util'
import type { Bbox } from './util'

export interface SyntheticOptions {
    /** 난수 시드. 기본 20261103 */
    seed?: number
    /** 바람 프레임의 기준 시각(epoch ms). 기본 지금 — 시험은 고정값을 준다 */
    now?: number
    /** 큰 나만의지도 점 수 목록(각각 레이어 하나). 기본 [20000, 100000]. 모바일은 [20000] */
    bigCounts?: number[]
}

/** 합성 데이터 + 시범 구역 보기(중심·줌) */
export interface SyntheticData extends MemoryData {
    center: [number, number]
    zoom: number
}

/** 시범 구역(격자) 상수. 경도·위도 기준점, 칸 크기(도), 칸 수 */
export const SYNTHETIC_AREA: Readonly<{ lon0: number; lat0: number; dx: number; dy: number; nx: number; ny: number; zoom: number }> =
    Object.freeze({ lon0: 127.286, lat0: 36.4773, dx: 0.0004, dy: 0.00036, nx: 20, ny: 15, zoom: 15 })

/** 시범 구역 중심(경도, 위도) */
export function syntheticCenter(): [number, number] {
    const a = SYNTHETIC_AREA
    return [round7(a.lon0 + (a.nx * a.dx) / 2), round7(a.lat0 + (a.ny * a.dy) / 2)]
}

/** 가상 PNU 법정동코드(10자리). 실제로 쓰이지 않는 동 번호 */
export const SYNTHETIC_LEGAL_DONG = '3611099900'
/** 가상 본번 시작(9000번대) */
export const SYNTHETIC_BUNHO_BASE = 9000
export const SYNTHETIC_DEFAULT_SEED = 20261103
export const SYNTHETIC_DEFAULT_BIG_COUNTS: readonly number[] = Object.freeze([20000, 100000])

const JIMOK = Object.freeze(['대', '전', '답', '도', '공', '잡'])
const JIMOK_WEIGHT = Object.freeze([0.5, 0.2, 0.15, 0.08, 0.04, 0.03])
const JIMOK_PRICE_RATE = Object.freeze([1, 0.3, 0.25, 0.5, 0.8, 0.2])
const FACILITY_KINDS = Object.freeze(['도서관', '주민센터', '공원', '학교', '체육시설', '보건소'])
const ZONE_NAMES = Object.freeze(['주거지역', '상업지역', '공업지역', '녹지지역'])

function pad4(n: number): string {
    return ('0000' + n).slice(-4)
}
function round7(n: number): number {
    return Math.round(n * 1e7) / 1e7
}
function pickWeighted(r: number): number {
    let acc = 0
    for (let i = 0; i < JIMOK_WEIGHT.length; i++) {
        acc += JIMOK_WEIGHT[i]
        if (r < acc) return i
    }
    return 0
}

/** 가상 PNU(19자리): 법정동 10 + 대지구분 1 + 본번 4 + 부번 4 */
export function syntheticPnu(parcelIndex: number): string {
    return SYNTHETIC_LEGAL_DONG + '1' + pad4(SYNTHETIC_BUNHO_BASE + parcelIndex) + '0000'
}

function feature(geometry: GeoJsonObject, properties: Record<string, unknown>, id?: string): GeoJsonObject {
    return id === undefined ? { type: 'Feature', properties, geometry } : { type: 'Feature', id, properties, geometry }
}

/** 위경도 링 → 대략 ㎡(시범 구역 안에서만 쓰는 평면 근사 — 속성의 "면적"용) */
function approxAreaM2(ring: number[][]): number {
    const kx = 111320 * Math.cos((ring[0][1] * Math.PI) / 180)
    const ky = 110574
    let s = 0
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        s += ring[j][0] * kx * (ring[i][1] * ky) - ring[i][0] * kx * (ring[j][1] * ky)
    }
    return Math.abs(s) / 2
}

function buildParcels(seed: number): { parcels: MemoryParcel[]; features: GeoJsonObject[] } {
    const { lon0, lat0, dx, dy, nx, ny } = SYNTHETIC_AREA
    // 격자 꼭짓점을 칸마다 정해진 값으로 흔든다(이웃 필지가 같은 꼭짓점을 공유 → 틈·겹침 없음)
    const vx = (i: number, j: number): number => lon0 + i * dx + (hash01(seed, i, j) - 0.5) * dx * 0.28
    const vy = (i: number, j: number): number => lat0 + j * dy + (hash01(seed + 7, i, j) - 0.5) * dy * 0.28
    const parcels: MemoryParcel[] = []
    const features: GeoJsonObject[] = []
    const shrink = 0.9
    for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
            const n = j * nx + i
            const corners = [
                [vx(i, j), vy(i, j)],
                [vx(i + 1, j), vy(i + 1, j)],
                [vx(i + 1, j + 1), vy(i + 1, j + 1)],
                [vx(i, j + 1), vy(i, j + 1)],
            ]
            const cx = (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4
            const cy = (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4
            const ring = corners.map(c => [round7(cx + (c[0] - cx) * shrink), round7(cy + (c[1] - cy) * shrink)])
            ring.push([ring[0][0], ring[0][1]])
            const jim = pickWeighted(hash01(seed + 13, i, j))
            const jimok = JIMOK[jim]
            const price = Math.round(((400000 + hash01(seed + 29, i, j) * 1400000) * JIMOK_PRICE_RATE[jim]) / 1000) * 1000
            const bunho = SYNTHETIC_BUNHO_BASE + n
            const pnu = syntheticPnu(n)
            const geometry: GeoJsonObject = { type: 'Polygon', coordinates: [ring] }
            const info: ParcelInfo = {
                pnu,
                address: '세종특별자치시 가상동 ' + bunho,
                lotNumber: String(bunho),
                mountain: false,
                jimok,
                officialPrice: price,
                priceYear: '2026',
                priceMonth: '01',
                geometry: feature(geometry, {}),
            }
            let buildings: ParcelBuildingsResult | undefined
            if (jimok === '대' && hash01(seed + 41, i, j) < 0.6) {
                const count = hash01(seed + 43, i, j) < 0.3 ? 2 : 1
                buildings = {
                    pnu,
                    referenceVersion: null,
                    buildingCount: count,
                    truncated: false,
                    relatedIncluded: false,
                    addresses: [
                        {
                            roadAddress: '세종특별자치시 가상로 ' + (10 + (n % 40)) + ' (가상동)',
                            underground: false,
                            zipCode: '30100',
                            name: '샘플빌딩 ' + (n + 1),
                            apartment: false,
                            relation: 'MAIN',
                            buildings: Array.from({ length: count }, (_, k) => ({
                                id: 'VIRTUAL-' + pnu + '-' + (k + 1),
                                name: '샘플빌딩 ' + (n + 1),
                                detailName: count === 1 ? null : 101 + k + '동',
                                sggName: null,
                            })),
                        },
                    ],
                }
            }
            parcels.push({ info, buildings })
            features.push(
                feature(geometry, { pnu, 지번: String(bunho), 지목: jimok, 공시지가: price, 면적: Math.round(approxAreaM2(ring)) }, 'parcel.' + n),
            )
        }
    }
    return { parcels, features }
}

function buildFacilities(seed: number): GeoJsonObject[] {
    const rng = createRng(seed + 101)
    const { lon0, lat0, dx, dy, nx, ny } = SYNTHETIC_AREA
    const out: GeoJsonObject[] = []
    for (let k = 0; k < 30; k++) {
        const kind = FACILITY_KINDS[k % FACILITY_KINDS.length]
        const lon = round7(lon0 + rng() * nx * dx)
        const lat = round7(lat0 + rng() * ny * dy)
        out.push(
            feature(
                { type: 'Point', coordinates: [lon, lat] },
                {
                    시설명: '가상' + kind + ' ' + (Math.floor(k / FACILITY_KINDS.length) + 1),
                    구분: kind,
                    개관연도: 1990 + Math.floor(rng() * 35),
                    이용자수: 200 + Math.floor(rng() * 9800),
                },
            ),
        )
    }
    return out
}

function buildRoutes(seed: number): GeoJsonObject[] {
    const rng = createRng(seed + 211)
    const { lon0, lat0, dx, dy, nx, ny } = SYNTHETIC_AREA
    const out: GeoJsonObject[] = []
    const names = ['가상 1호선', '가상 2호선', '가상 순환선']
    for (let r = 0; r < names.length; r++) {
        const pts: number[][] = []
        const phase = rng() * Math.PI
        for (let s = 0; s <= 10; s++) {
            const t = s / 10
            let x: number
            let y: number
            if (r === 0) {
                x = t
                y = 0.25 + 0.12 * Math.sin(t * 6 + phase)
            } else if (r === 1) {
                x = 0.3 + 0.12 * Math.sin(t * 5 + phase)
                y = t
            } else {
                x = 0.5 + 0.4 * Math.cos(t * 2 * Math.PI)
                y = 0.5 + 0.38 * Math.sin(t * 2 * Math.PI)
            }
            pts.push([round7(lon0 + x * nx * dx), round7(lat0 + y * ny * dy)])
        }
        let km = 0
        for (let s = 1; s < pts.length; s++) {
            const ax = (pts[s][0] - pts[s - 1][0]) * 111320 * Math.cos((pts[0][1] * Math.PI) / 180)
            const ay = (pts[s][1] - pts[s - 1][1]) * 110574
            km += Math.sqrt(ax * ax + ay * ay) / 1000
        }
        out.push(feature({ type: 'LineString', coordinates: pts }, { 노선명: names[r], 구분: r === 2 ? '순환' : '간선', 길이km: Math.round(km * 100) / 100 }))
    }
    return out
}

function buildShared(seed: number): GeoJsonObject[] {
    const rng = createRng(seed + 307)
    const { lon0, lat0, dx, dy, nx, ny } = SYNTHETIC_AREA
    const out: GeoJsonObject[] = []
    for (let k = 0; k < 12; k++) {
        out.push(
            feature(
                { type: 'Point', coordinates: [round7(lon0 + rng() * nx * dx), round7(lat0 + rng() * ny * dy)] },
                { 이름: '공유 지점 ' + (k + 1), 분류: ['A', 'B', 'C'][k % 3] },
            ),
        )
    }
    return out
}

/** 큰 점 데이터: 클러스터 12곳 주변에 정규분포로 흩뿌린다. 같은 시드·개수면 같은 결과 */
export function buildBigPoints(seed: number, count: number): GeoJsonObject {
    const rng = createRng(seed + 401)
    const centers: number[][] = []
    for (let c = 0; c < 12; c++) centers.push([127.15 + rng() * 0.28, 36.38 + rng() * 0.2, 0.01 + rng() * 0.03])
    const features: GeoJsonObject[] = new Array(count)
    for (let i = 0; i < count; i++) {
        const c = centers[i % centers.length]
        // Box-Muller: 정규분포 거리 + 균등 각도
        const u = Math.max(rng(), 1e-9)
        const v = rng()
        const m = Math.sqrt(-2 * Math.log(u)) * c[2]
        features[i] = {
            type: 'Feature',
            properties: { 번호: i, 구분: ['A', 'B', 'C', 'D'][Math.floor(rng() * 4)], 값: Math.floor(rng() * 1000) },
            geometry: { type: 'Point', coordinates: [round7(c[0] + m * Math.cos(2 * Math.PI * v)), round7(c[1] + m * Math.sin(2 * Math.PI * v) * 0.8)] },
        }
    }
    return { type: 'FeatureCollection', features }
}

function bigLabel(count: number): string {
    return count >= 10000 && count % 10000 === 0 ? count / 10000 + '만' : String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function buildZones(): GeoJsonObject[] {
    const { lon0, lat0, dx, dy, nx, ny } = SYNTHETIC_AREA
    const m = 0.0004
    const x0 = lon0 - m
    const x2 = lon0 + nx * dx + m
    const x1 = (x0 + x2) / 2
    const y0 = lat0 - m
    const y2 = lat0 + ny * dy + m
    const y1 = (y0 + y2) / 2
    const rect = (a: number, b: number, c: number, d: number): GeoJsonObject => ({
        type: 'Polygon',
        coordinates: [[[round7(a), round7(b)], [round7(c), round7(b)], [round7(c), round7(d)], [round7(a), round7(d)], [round7(a), round7(b)]]],
    })
    return [
        feature(rect(x0, y1, x1, y2), { zone: ZONE_NAMES[0] }, 'zone.0'),
        feature(rect(x1, y1, x2, y2), { zone: ZONE_NAMES[1] }, 'zone.1'),
        feature(rect(x0, y0, x1, y1), { zone: ZONE_NAMES[2] }, 'zone.2'),
        feature(rect(x1, y0, x2, y1), { zone: ZONE_NAMES[3] }, 'zone.3'),
    ]
}

function buildPlaces(parcels: MemoryParcel[]): AddressSearchItem[] {
    // 샘플 장소(위치는 대략 — 데모용). [이름, 경도, 위도]
    const table: Array<[string, number, number]> = [
        ['세종특별자치시청', 127.289, 36.48], ['세종호수공원', 127.2656, 36.4967], ['정부세종청사', 127.258, 36.504], ['조치원역', 127.2961, 36.6019],
        ['서울시청', 126.978, 37.5663], ['광화문', 126.9769, 37.5759], ['인천시청', 126.7052, 37.4563], ['수원시청', 127.0286, 37.2636],
        ['춘천시청', 127.7298, 37.8813], ['강릉시청', 128.8761, 37.7519], ['청주시청', 127.489, 36.6424], ['대전시청', 127.3845, 36.3504],
        ['전주시청', 127.148, 35.8242], ['광주시청', 126.8513, 35.1601], ['목포시청', 126.3922, 34.8118], ['대구시청', 128.6014, 35.8714],
        ['안동시청', 128.7295, 36.5684], ['울산시청', 129.3114, 35.5384], ['부산시청', 129.0753, 35.1796], ['창원시청', 128.6811, 35.228],
        ['제주도청', 126.5312, 33.4996],
    ]
    const out: AddressSearchItem[] = table.map((p, i) => ({
        id: 'place-' + (i + 1),
        title: p[0],
        category: '샘플 장소',
        address: { road: '', parcel: '' },
        point: { lon: p[1], lat: p[2] },
    }))
    for (const n of [12, 45, 100, 150, 222]) {
        const p = parcels[n]
        const ring = ((p.info.geometry as GeoJsonObject).geometry as GeoJsonObject).coordinates as number[][][]
        const pts = ring[0].slice(0, 4)
        out.push({
            id: 'vparcel-' + (SYNTHETIC_BUNHO_BASE + n),
            title: '세종 가상동 ' + (SYNTHETIC_BUNHO_BASE + n) + ' (가상)',
            category: '가상 필지',
            address: { road: '세종특별자치시 가상로 ' + (10 + (n % 40)), parcel: '세종특별자치시 가상동 ' + (SYNTHETIC_BUNHO_BASE + n) },
            point: { lon: round7(pts.reduce((s, q) => s + q[0], 0) / 4), lat: round7(pts.reduce((s, q) => s + q[1], 0) / 4) },
        })
    }
    return out
}

function buildRegions(): MemoryRegion[] {
    const { lon0, lat0, dx, dy, nx, ny } = SYNTHETIC_AREA
    const grid: Bbox = [lon0 - 0.0005, lat0 - 0.0005, lon0 + nx * dx + 0.0005, lat0 + ny * dy + 0.0005]
    return [
        { name: '세종특별자치시 가상동', bbox: grid },
        { name: '세종특별자치시', bbox: [127.1, 36.43, 127.4, 36.72] },
        { name: '서울특별시', bbox: [126.76, 37.43, 127.18, 37.7] },
        { name: '대전광역시', bbox: [127.26, 36.19, 127.55, 36.42] },
        { name: '부산광역시', bbox: [128.75, 34.95, 129.3, 35.4] },
        { name: '제주특별자치도', bbox: [126.1, 33.1, 126.99, 33.6] },
    ]
}

/** 바람장 한 프레임(U·V) — 편서풍 + 프레임마다 움직이는 소용돌이. 0.1° 격자, 북쪽 시작, 경도 124~132·위도 33~39 */
export function buildWindField(seed: number, hour: number, refTimeIso: string): WindField {
    const lo1 = 124
    const la1 = 39
    const step = 0.1
    const nx = 81
    const ny = 61
    const rng = createRng(seed + 503)
    const phase = rng() * 6.28
    // 소용돌이 중심: 서쪽에서 동쪽으로 시간당 0.25도, 위도는 천천히 흔들림
    const xc = 125.5 + hour * 0.25
    const yc = 36 + 0.8 * Math.sin(phase + hour * 0.3)
    const us: number[] = new Array(nx * ny)
    const vs: number[] = new Array(nx * ny)
    for (let r = 0; r < ny; r++) {
        const lat = la1 - r * step
        for (let c = 0; c < nx; c++) {
            const lon = lo1 + c * step
            const dX = lon - xc
            const dY = lat - yc
            const k = 6 / (dX * dX + dY * dY + 1.2)
            const u = 4 + 2.5 * Math.sin((lat - 33) * 0.9 + phase) - k * dY
            const v = 0.8 * Math.sin((lon - 124) * 0.7 + hour * 0.4) + k * dX
            us[r * nx + c] = Math.round(u * 10) / 10
            vs[r * nx + c] = Math.round(v * 10) / 10
        }
    }
    const header = (num: number): Record<string, unknown> => ({
        parameterCategory: 2, parameterNumber: num, parameterUnit: 'm.s-1', refTime: refTimeIso, forecastTime: hour,
        lo1, la1, lo2: Math.round((lo1 + (nx - 1) * step) * 10) / 10, la2: Math.round((la1 - (ny - 1) * step) * 10) / 10,
        dx: step, dy: step, nx, ny, numberPoints: nx * ny,
    })
    return [
        { header: header(2), data: us },
        { header: header(3), data: vs },
    ]
}

function buildWindFrames(seed: number, now: number): MemoryWindFrame[] {
    const HOUR = 3600000
    const base = Math.floor(now / HOUR) * HOUR
    const ref = utcHourIso(base)
    const frames: MemoryWindFrame[] = []
    for (let h = 0; h < 9; h++) {
        const meta: WindFrameMeta = { id: h + 1, forecastHour: h, validTime: utcHourIso(base + h * HOUR) }
        frames.push({ meta, field: () => buildWindField(seed, h, ref) })
    }
    return frames
}

/** 합성 데이터 한 벌(레이어 트리는 demo.ts가 배경지도 설정을 받아 만든다 — 여기는 tree 없음) */
export function createSyntheticData(opts: SyntheticOptions = {}): SyntheticData {
    const seed = opts.seed ?? SYNTHETIC_DEFAULT_SEED
    const now = opts.now ?? Date.now()
    const bigCounts = opts.bigCounts ?? Array.from(SYNTHETIC_DEFAULT_BIG_COUNTS)
    const { parcels, features: parcelFeatures } = buildParcels(seed)
    const facilities = buildFacilities(seed)
    const routes = buildRoutes(seed)
    const shared = buildShared(seed)
    const fc = (features: GeoJsonObject[]): GeoJsonObject => ({ type: 'FeatureCollection', features })
    const myMaps: MemoryMapLayer[] = [
        { id: 1, name: '공공시설(가상)', description: '가상 시설 30곳 — 구분 열로 범주 스타일을 써 보세요', sourceKind: 'SHP', geomType: 'Point', owner: true, createdAt: '2026-11-03', featureCount: facilities.length, geojson: fc(facilities) },
        { id: 2, name: '필지(가상) 면', description: '가상 필지 300개 — 공시지가 열로 구간 스타일을 써 보세요', sourceKind: 'SHP', geomType: 'Polygon', owner: true, createdAt: '2026-11-03', featureCount: parcelFeatures.length, geojson: fc(parcelFeatures) },
        { id: 3, name: '가상 노선', description: '가상 노선 3개', sourceKind: 'SHP', geomType: 'LineString', owner: true, createdAt: '2026-11-03', featureCount: routes.length, geojson: fc(routes) },
        { id: 4, name: '공유받은 샘플(가상)', description: '다른 가상 사용자가 공유한 레이어 — 보기만 가능', sourceKind: 'EXCEL_COORD', geomType: 'Point', owner: false, ownerId: 'sample-kim', ownerName: '김가상', createdAt: '2026-11-02', featureCount: shared.length, geojson: fc(shared) },
    ]
    bigCounts.forEach((count, i) => {
        myMaps.push({
            id: 11 + i, name: '합성 점 ' + bigLabel(count) + '개', description: '큰 데이터 시연 — 확대하면 묶음이 풀립니다', sourceKind: 'EXCEL_COORD', geomType: 'Point', owner: true,
            createdAt: '2026-11-03', featureCount: count, geojson: () => buildBigPoints(seed, count),
        })
    })
    const read = (f: GeoJsonObject, k: string): unknown => (f.properties as Record<string, unknown>)[k]
    return {
        center: syntheticCenter(),
        zoom: SYNTHETIC_AREA.zoom,
        myMaps,
        parcels,
        places: buildPlaces(parcels),
        regions: buildRegions(),
        areaLayers: {
            'demo:parcel': {
                features: parcelFeatures.map(f => ({ ...f, properties: { pnu: read(f, 'pnu'), jimok: read(f, '지목'), jiga: read(f, '공시지가') } })),
                columns: [
                    { name: 'jiga', label: '공시지가(원/㎡)', kind: 'number', sum: false },
                    { name: 'jimok', label: '지목', kind: 'text' },
                    { name: 'pnu', label: 'PNU(가상)', kind: 'text' },
                ],
                defaultCategory: 'jimok',
            },
            'demo:zone': { features: buildZones(), columns: [{ name: 'zone', label: '용도지역(가상)', kind: 'text' }], defaultCategory: 'zone' },
        },
        windFrames: buildWindFrames(seed, now),
        users: [
            { userId: 'sample-kim', name: '김가상', groupLabel: '가상팀A' }, { userId: 'sample-lee', name: '이샘플', groupLabel: '가상팀A' },
            { userId: 'sample-park', name: '박예시', groupLabel: '가상팀A' }, { userId: 'sample-choi', name: '최데모', groupLabel: '가상팀B' },
            { userId: 'sample-jung', name: '정시범', groupLabel: '가상팀B' }, { userId: 'sample-kang', name: '강가상', groupLabel: '가상팀B' },
            { userId: 'sample-yoon', name: '윤샘플', groupLabel: null }, { userId: 'sample-han', name: '한예시', groupLabel: null },
        ],
        groups: [
            { code: 'DEMO_ADMIN', label: '가상 관리자' },
            { code: 'DEMO_USER', label: '가상 일반 사용자' },
            { code: 'DEMO_USER:팀A', label: '가상팀A', parentCode: 'DEMO_USER' },
        ],
    }
}
