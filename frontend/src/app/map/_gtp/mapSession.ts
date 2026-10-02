// /map을 떠났다 돌아와도 옛 화면처럼 이어지게 하는 "앱 쪽 기억" (FE-5c)
//
// 옛 코드는 drawStore·mapStore·panelStore가 모듈 전역 zustand라 페이지 안 이동(/map → /blog → /map)에서 그리기 스타일·켠 도구·
// 반경 입력값·열린 패널이 남았다(새로고침하면 처음부터). 지도 패키지는 이제 모듈 전역 상태를 갖지 않는다(이식성 규칙) →
// 기억은 앱이 하고, 패키지는 초기값을 받는 통로만 준다.
//   · 열린 패널: MapShell defaultPanel(처음 값) + onPanelChange(바뀔 때)
//   · 그리기 스타일·켠 도구·반경 입력값: GisMapProvider setup에서 엔진 공개 API로 되살리고(map.draw.setStyle, map.tools.*),
//     엔진 스토어를 구독해 바뀔 때마다 적어 둔다(엔진 destroy 이벤트에서 구독 해제)
//   · 바람길 켬 여부는 기억하지 않는다 — 항상 꺼진 채 시작한다. 켠 채 돌아오면 곧바로 /api/wind/latest를 다시 불러
//     (원격 DB 4.7MB·약 115초, StrictMode에선 요청 2개) 백엔드가 OutOfMemoryError로 멈춘 사고가 있었다
//
// 저장 위치는 메모리(이 모듈의 Map) — 옛 zustand 스토어와 같은 수명이다: 페이지 안 이동에서는 남고 새로고침하면 사라진다.
// sessionStorage를 쓰면 새로고침 뒤에도 남아 옛 동작과 달라지고, 서버 렌더 HTML(기본값)과 첫 화면이 어긋날 수 있어 쓰지 않았다.
// 서버(SSR)에서는 읽어도 항상 빈 값이고 쓰지 않는다(쓰기는 브라우저의 엔진 구독·패널 클릭에서만 일어난다 — 서버 요청끼리 섞이지 않음).
// 이름(name)마다 따로 기억한다 — 한 화면에 지도가 둘이면 이름을 다르게 준다.
// 기억에는 주인(owner = 로그인 사용자 id, 앱이 호출 인자로 넘긴다)을 붙인다. 같은 탭에서 로그아웃 → 다른 사용자로 로그인하면
// (GTProject는 새로고침 없는 SPA 이동이라 메모리가 남는다) 다른 주인으로 읽거나 쓰는 순간 앞 사용자의 기억을 모두 지운다
// → 앞 사용자의 열린 패널·그리기 스타일·켠 도구·반경이 다음 사용자에게 이어지지 않는다. 같은 사용자 왕복은 그대로 이어진다.
// owner를 생략하면 사용자를 구분하지 않는다(옛 호출과 같음 — 시험·점검용. 앱은 항상 넘긴다).
import type { DrawStyle, GisMap, MapTool } from '@gtp/gis-map/core'

export interface MapSessionState {
    /** 열린 패널 id(닫혔으면 null, 한 번도 안 바꿨으면 없음) */
    panel?: string | null
    drawStyle?: Readonly<DrawStyle>
    activeTool?: MapTool
    radiusMeters?: number | null
}

interface SessionEntry {
    readonly owner: string | undefined
    readonly state: Readonly<MapSessionState>
}

const EMPTY: Readonly<MapSessionState> = Object.freeze({})
const sessions = new Map<string, SessionEntry>()

function isBrowser(): boolean {
    return typeof window !== 'undefined'
}

/**
 * 주인이 바뀌었으면(로그인 사용자가 바뀜) 다른 주인의 기억을 모두 지운다. owner 생략이면 아무것도 안 한다.
 * 주인 없이 적은 기억(owner 생략 호출)은 지우지 않는다 — 대신 주인을 주고 읽으면 돌려주지 않는다(readMapSession)
 */
function forgetOtherOwners(owner: string | undefined): void {
    if (owner === undefined) return
    for (const [name, entry] of sessions) {
        if (entry.owner !== undefined && entry.owner !== owner) sessions.delete(name)
    }
}

/** 기억한 값(없거나 주인이 다르면 빈 객체). 서버에서는 항상 빈 객체 */
export function readMapSession(name: string, owner?: string): Readonly<MapSessionState> {
    if (!isBrowser()) return EMPTY
    forgetOtherOwners(owner)
    const entry = sessions.get(name)
    if (!entry || (owner !== undefined && entry.owner !== owner)) return EMPTY
    return entry.state
}

function remember(name: string, owner: string | undefined, patch: Partial<MapSessionState>): void {
    if (!isBrowser()) return
    forgetOtherOwners(owner)
    const prev = sessions.get(name)
    const same = prev !== undefined && (owner === undefined || prev.owner === owner)
    sessions.set(name, Object.freeze({
        owner: owner ?? prev?.owner,
        state: Object.freeze({ ...(same ? prev.state : undefined), ...patch }),
    }))
}

/** 그리기·도구·반경 기억만 지운다(열린 패널은 남긴다 — 되살리기 실패 때) */
function forgetEngineState(name: string): void {
    const prev = sessions.get(name)
    if (!prev) return
    const { panel } = prev.state
    sessions.set(name, Object.freeze({ owner: prev.owner, state: Object.freeze(panel === undefined ? {} : { panel }) }))
}

/** 열린 패널 기억(MapShell onPanelChange) */
export function rememberMapPanel(name: string, panel: string | null, owner?: string): void {
    remember(name, owner, { panel })
}

/**
 * GisMapProvider setup에서 부른다(엔진이 만들어질 때마다 — StrictMode에서는 두 번째 엔진에도 다시).
 * 위젯이 엔진을 처음 보기 전에 실행되므로, 툴바·그리기 패널은 처음부터 되살린 값을 본다.
 * 되살리다 예외가 나면 경고만 남기고 엔진을 기본 상태로 되돌린 뒤 그 기억(그리기·도구·반경)을 지운다
 * — setup 예외는 GisMapProvider가 잡지 않으므로 여기서 막지 않으면 /map 전체가 죽고 만든 엔진도 정리되지 않는다.
 */
export function restoreMapSession(map: GisMap, name: string, owner?: string): void {
    let initial: { style: Readonly<DrawStyle>; radiusMeters: number | null } | null = null
    try {
        const saved = readMapSession(name, owner)
        initial = { style: map.draw.store.getState().style, radiusMeters: map.tools.store.getState().radiusMeters }
        if (saved.drawStyle) map.draw.setStyle(saved.drawStyle)
        if (saved.radiusMeters !== undefined) map.tools.setRadiusMeters(saved.radiusMeters)
        if (saved.activeTool !== undefined && saved.activeTool !== 'none') map.tools.activate(saved.activeTool)
    } catch (err) {
        console.warn('[gtp-map] 떠나기 전 지도 상태를 되살리지 못해 기본 상태로 시작한다', err)
        forgetEngineState(name)
        try {
            map.tools.deactivate()
            if (initial) {
                map.draw.setStyle(initial.style)
                map.tools.setRadiusMeters(initial.radiusMeters)
            }
        } catch {
            // 되돌리기마저 실패하면 그대로 둔다(화면은 계속 동작한다)
        }
    }

    // 되살린 뒤에 구독한다(되살리기·되돌리기 자체는 다시 적지 않는다). 되살리기가 실패해도 구독은 한다 → 그 뒤 바꾼 값은 기억된다
    const offTools = map.tools.store.subscribe(s => remember(name, owner, { activeTool: s.activeTool, radiusMeters: s.radiusMeters }))
    const offDraw = map.draw.store.subscribe((s, prev) => {
        if (s.style !== prev.style) remember(name, owner, { drawStyle: s.style })
    })
    // 떠날 때(엔진 destroy)는 도구를 끄지 않고 구독만 끊는다 → 마지막 상태가 남는다
    map.on('destroy', () => {
        offTools()
        offDraw()
    })
}
