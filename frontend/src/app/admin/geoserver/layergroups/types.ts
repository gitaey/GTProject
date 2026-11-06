// GeoServer 레이어 그룹 화면의 타입·상수·표시 도우미. 백엔드 DTO(domain/geoserver/dto/LayerGroup*)와 필드 이름·null 여부가 1:1이다.
// 순서 약속(D2): 모든 layers/members 배열은 인덱스 0 = 가장 먼저 그림 = 지도에서 맨 아래 = 화면 목록 맨 위 줄. 어느 쪽도 뒤집지 않는다.

/** 고를 수 있는 그리기 방식(D3) */
export type LayerGroupMode = 'SINGLE' | 'NAMED'

export interface LayerGroupSummary {
    /** 접두사 없는 그룹 이름 */
    name: string
    /** null = 전역 */
    workspace: string | null
}

export interface LayerGroupMember {
    /** 'layer' | 'layerGroup' | 그 밖(모르는 값 그대로) */
    type: string
    /** GeoServer가 준 이름 그대로(보통 'ws:layer') */
    name: string
    /** null = 레이어 기본 스타일. 작업공간 스타일이면 'ws:style'. 표시용 */
    style: string | null
}

export interface LayerGroupBounds {
    minx: number
    miny: number
    maxx: number
    maxy: number
    /** 'EPSG:4326' 등. 못 읽으면 null */
    crs: string | null
}

export interface LayerGroupDetail {
    name: string
    workspace: string | null
    /** workspace ? `${workspace}:${name}` : name */
    wmsName: string
    title: string | null
    /** GeoServer abstractTxt */
    description: string | null
    /** SINGLE·NAMED·OPAQUE_CONTAINER·CONTAINER·EO 또는 모르는 값 */
    mode: string
    /** 그리는 순서, 0 = 맨 아래(= 화면 맨 위 줄) */
    members: LayerGroupMember[]
    bounds: LayerGroupBounds | null
    /** true = GeoServer에서 다시 읽은 값. false = 만들기는 성공했지만 다시 읽기 실패 */
    verified: boolean
    /** 내용 지문(16자 hex). 수정 요청에 그대로 돌려보낸다 */
    revision: string
    /** null이 아니면 이 도구로 수정 불가(EO·점 이름·옛 형식) — 한국어 이유 */
    editBlockedReason: string | null
    /** null이 아니면 레이어 구성은 못 바꿈(제목·설명·방식은 가능) — 그룹 스타일 있음 */
    layersLockedReason: string | null
}

export interface LayerGroupCreateRequest {
    /** null = 전역 */
    workspace: string | null
    name: string
    /** 빈 문자열은 null로 */
    title: string | null
    description: string | null
    mode: LayerGroupMode
    /** 'ws:layer', 그리는 순서(0 = 맨 아래 = 화면 맨 위), 1~100개, 중복 없음 */
    layers: string[]
}

export interface LayerGroupMemberRef {
    type: 'layer' | 'layerGroup'
    /** 기존 멤버면 LayerGroupMember.name 그대로, 새 레이어면 'ws:layer' */
    name: string
}

export interface LayerGroupUpdateRequest {
    /** 편집을 시작할 때 받은 LayerGroupDetail.revision */
    revision: string
    title: string | null
    description: string | null
    mode: string
    /** 저장 후 최종 목록(그리는 순서), 1~100개. 스타일은 보내지 않음 */
    members: LayerGroupMemberRef[]
}

export type BoundsAction = 'KEPT' | 'RECALCULATED' | 'STALE'

export interface LayerGroupUpdateResult {
    group: LayerGroupDetail
    /** false = 바뀐 게 없어 PUT을 보내지 않음 */
    changed: boolean
    boundsAction: BoundsAction
    /** RECALCULATED이면서 좌표계가 원래와 다름 */
    boundsCrsChanged: boolean
    boundsNote: string | null
}

/** 그룹 이름 규칙(D4) — 영문 또는 _로 시작, 영문·숫자·_·-, 최대 100자. 점·한글·공백 불가 */
export const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,99}$/
/** 그룹당 레이어 수 상한(실수 방지) */
export const MAX_LAYERS = 100
/** 레이어 고르기 목록의 한 번에 그리는 줄 수 상한(가상화 라이브러리 없이) */
export const PICKER_RENDER_LIMIT = 300
export const MAX_TITLE = 200
export const MAX_DESCRIPTION = 2000

export const NAME_RULE_MESSAGE = '그룹 이름은 영문으로 시작하고 영문·숫자·_·-만 쓸 수 있습니다(최대 100자).'
export const DOT_NAME_MESSAGE = '이름에 점(.)이 있는 그룹은 GeoServer 관리 화면에서 수정·삭제하세요.'

export const MODE_LABEL: Record<string, string> = {
    SINGLE: '단일 레이어',
    NAMED: '이름 있는 트리',
    OPAQUE_CONTAINER: '불투명 컨테이너',
    CONTAINER: '컨테이너',
    EO: '위성영상(EO)',
}

/** 작업공간 그룹이면 'ws:name', 전역이면 'name' */
export function wmsName(workspace: string | null, name: string): string {
    return workspace ? `${workspace}:${name}` : name
}

export function hasDot(name: string): boolean {
    return name.includes('.')
}

/** 'ws:layer' → ['ws', 'layer'] (첫 ':'에서 나눔, 접두사가 없으면 ws는 빈 문자열) */
export function splitQualified(qualified: string): [string, string] {
    const i = qualified.indexOf(':')
    return i < 0 ? ['', qualified] : [qualified.slice(0, i), qualified.slice(i + 1)]
}

function formatNumber(v: number, geographic: boolean): string {
    return v.toFixed(geographic ? 6 : 2)
}

/** 영역 표시 — 경위도(|값| ≤ 180)면 소수 6자리, 아니면 2자리 */
export function formatBounds(b: LayerGroupBounds): string {
    const geographic = [b.minx, b.miny, b.maxx, b.maxy].every(v => Math.abs(v) <= 180)
    return `${formatNumber(b.minx, geographic)}, ${formatNumber(b.miny, geographic)} ~ ` +
        `${formatNumber(b.maxx, geographic)}, ${formatNumber(b.maxy, geographic)}`
}

/** 그룹 소속 범위의 캐시 키 — 전역은 빈 문자열 */
export function scopeKey(workspace: string | null): string {
    return workspace ?? ''
}

/** 그룹 한 개의 캐시 키(펼친 상세·삭제 중 표시용) */
export function groupKey(workspace: string | null, name: string): string {
    return `${workspace ?? ''}\n${name}`
}

/** 고르는 작업공간의 발행된 레이어 이름 목록(G1) 상태 — 만들기·수정 화면이 같은 캐시를 쓴다 */
export interface NamesState {
    status: 'loading' | 'ok' | 'error'
    items: string[]
    message: string | null
}

/** 백엔드 GEOSERVER_LAYERGROUP_NOT_EDITABLE(400) 메시지의 앞부분 — 응답에 코드가 없어 문구로 구별한다 */
export const NOT_EDITABLE_PREFIX = '이 레이어 그룹은 이 도구로 수정할 수 없습니다'

/** 그룹 한 개의 API 경로(G4·G5 읽기, G7·G8 삭제, G9·G10 수정이 같은 경로) */
export function groupApiPath(workspace: string | null, name: string): string {
    return workspace
        ? `/api/geoserver/workspaces/${encodeURIComponent(workspace)}/layergroups/${encodeURIComponent(name)}`
        : `/api/geoserver/layergroups/${encodeURIComponent(name)}`
}

/** 비교용 줄바꿈 정규화 — `\r\n`·`\r`을 `\n`으로(서버로 보내는 값이 아니라 "바뀌었나" 판단에만 쓴다) */
export function normalizeNewlines(s: string): string {
    return s.replace(/\r\n?/g, '\n')
}

/**
 * 이 화면(수정)이 안전하게 다룰 수 있는 멤버 종류만 있는지 — 모르는 type이 하나라도 있으면 이유(한국어), 없으면 null.
 * 모르는 type을 layer로 바꿔 보내면 그룹이 망가질 수 있어 프론트 단에서 수정 불가로 막는다(백엔드 editBlockedReason과 별개)
 */
export function frontBlockedReason(detail: LayerGroupDetail): string | null {
    const unknown = Array.from(new Set(
        detail.members.filter(m => m.type !== 'layer' && m.type !== 'layerGroup').map(m => m.type),
    ))
    if (unknown.length === 0) return null
    return `이 도구가 모르는 종류의 멤버(${unknown.join(', ')})가 있어 수정할 수 없습니다. GeoServer 관리 화면에서 수정하세요.`
}

/** 작업공간 그룹에서 접두사 없이 온 멤버 이름은 그 작업공간 레이어로 본다(체크 맞춤용). 보낼 이름은 바꾸지 않는다 */
export function canonicalLayerName(workspace: string | null, name: string): string {
    return workspace && !name.includes(':') ? `${workspace}:${name}` : name
}
