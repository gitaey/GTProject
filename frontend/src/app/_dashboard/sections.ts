// 어떤 카드를 보여 줄지 계산하는 순수 함수들 + 개발 전용 확인 장치(?dashMenus, ?dashFail).

/** 카드 실패를 흉내 낼 수 있는 이름(?dashFail=bot,wind …) */
export type DashFailKey = 'bot' | 'schedule' | 'posts' | 'layers' | 'mymap' | 'quota' | 'geotiff' | 'wind'

const DASH_FAIL_KEYS: readonly DashFailKey[] = ['bot', 'schedule', 'posts', 'layers', 'mymap', 'quota', 'geotiff', 'wind']

/** ?dashMenus 덮어쓰기: 'loading' = 권한 로딩 중 흉내, 'menus' = 이 메뉴 ID 목록(접두사 sidebar. 없이)만 허용 */
export type DevMenusOverride = { kind: 'loading' } | { kind: 'menus'; ids: ReadonlySet<string> }

export interface DashDevOverrides {
    menus: DevMenusOverride | null
    fail: ReadonlySet<DashFailKey>
}

const NO_FAIL: ReadonlySet<DashFailKey> = new Set<DashFailKey>()
const NO_OVERRIDES: DashDevOverrides = { menus: null, fail: NO_FAIL }

const MENU_PREFIX = 'sidebar.'

function stripPrefix(menuId: string): string {
    return menuId.startsWith(MENU_PREFIX) ? menuId.slice(MENU_PREFIX.length) : menuId
}

export function parseDashMenus(search: string): DevMenusOverride | null {
    const raw = new URLSearchParams(search).get('dashMenus')
    if (raw === null) return null
    const value = raw.trim()
    if (value === 'loading') return { kind: 'loading' }
    if (value === 'none' || value === '') return { kind: 'menus', ids: new Set<string>() }
    const ids = value.split(',').map((s) => stripPrefix(s.trim())).filter((s) => s.length > 0)
    return { kind: 'menus', ids: new Set(ids) }
}

export function parseDashFail(search: string): ReadonlySet<DashFailKey> {
    const raw = new URLSearchParams(search).get('dashFail')
    if (!raw) return NO_FAIL
    const wanted = raw.split(',').map((s) => s.trim())
    return new Set(DASH_FAIL_KEYS.filter((k) => wanted.includes(k)))
}

/** 개발 서버에서만 주소 쿼리를 읽는다. 운영 빌드는 NODE_ENV가 상수라 아래 코드가 빠진다 */
export function readDevOverrides(search: string): DashDevOverrides {
    if (process.env.NODE_ENV !== 'development') return NO_OVERRIDES
    return { menus: parseDashMenus(search), fail: parseDashFail(search) }
}

export interface SectionsUser {
    role: string
}

export interface SectionsMenu {
    loaded: boolean
    isAllowed: (menuId: string) => boolean
}

export interface DashboardSections {
    /** false면 뼈대만 그리고 어떤 카드도 마운트하지 않는다(= API 호출 0) */
    ready: boolean
    map: boolean
    mapLayerAdmin: boolean
    bot: boolean
    blog: boolean
    blogAdmin: boolean
}

const NOT_READY: DashboardSections = {
    ready: false, map: false, mapLayerAdmin: false, bot: false, blog: false, blogAdmin: false,
}

/**
 * 메뉴 권한 → 보여 줄 구역. 권한을 아직 못 받았으면(SUPER_ADMIN 제외) ready=false.
 * 사이드바와 같은 기준(권한 확인 전에는 관리자 메뉴를 숨김)으로 맞춘다.
 */
export function resolveDashboardSections(
    user: SectionsUser | null,
    menu: SectionsMenu,
    override: DevMenusOverride | null = null,
): DashboardSections {
    let allowed: (menuId: string) => boolean
    if (override) {
        if (override.kind === 'loading') return NOT_READY
        allowed = (menuId) => override.ids.has(stripPrefix(menuId))
    } else if (!user) {
        return NOT_READY
    } else if (user.role === 'SUPER_ADMIN') {
        allowed = () => true
    } else if (!menu.loaded) {
        return NOT_READY
    } else {
        allowed = menu.isAllowed
    }
    return {
        ready: true,
        map: allowed('sidebar.map-view'),
        mapLayerAdmin: allowed('sidebar.map-layer'),
        bot: allowed('sidebar.bot-log'),
        blog: allowed('sidebar.blog-view'),
        blogAdmin: allowed('sidebar.blog-admin'),
    }
}

export interface OpsGridLayout {
    /** 기빵봇 카드 칸(Tailwind 클래스) */
    bot: string
    blog: string
}

/** 운영 현황 칸 배치 — 카드 2개 = 1280px 이상 8/4(그 밑은 12/12), 1개 = 12 */
export function opsGridLayout(visible: { bot: boolean; blog: boolean }): OpsGridLayout {
    if (visible.bot && visible.blog) {
        return { bot: 'col-span-12 xl:col-span-8', blog: 'col-span-12 xl:col-span-4' }
    }
    return { bot: 'col-span-12', blog: 'col-span-12' }
}
