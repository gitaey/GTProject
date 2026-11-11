// 업로드 창의 파일 판별 — 순수 함수(React·DOM 없음, 이름과 크기만 본다). 시험: _workspace/mymap-upload-redesign/check/run-check.mjs
// 규칙표(설계 8.4): 엑셀 1개 → excel / 여러 개 → choose-excel / SHP 계열 한 벌 → shp / 여러 벌 → choose-shp / 둘이 섞임 → mixed / 그 밖 → unsupported.
// 서버(UserMapUploadService.uploadShp)는 확장자별 "마지막 파일"만 쓰므로 두 벌이 섞여 가지 않게, 보내는 파일은 항상 한 벌(group.files)뿐이다.

/** 이름·크기만 있으면 된다(File도 이 모양) */
export interface FileLike {
    name: string
    size: number
}

export type FileKind = 'xlsx' | 'shp' | 'shx' | 'dbf' | 'prj' | 'companion' | 'xls' | 'csv' | 'zip' | 'other'

/** 서버가 받는 SHP 구성 파일 확장자 */
export const SHP_EXTS: readonly string[] = Object.freeze(['shp', 'shx', 'dbf', 'prj'])
/** 같이 따라오지만 서버가 쓰지 않는 SHP 동반 파일(SHP 묶음에 흔히 딸려 온다 — 오류가 아니라 빼고 올린다) */
export const IGNORED_SHP_EXTS: readonly string[] = Object.freeze(['cpg', 'sbn', 'sbx', 'qix', 'fix', 'xml'])

export type FileProblem = 'EMPTY' | 'XLS' | 'CSV' | 'ZIP' | 'OTHER' | 'COMPANION_ONLY' | 'SOURCE_EXCEL' | 'SOURCE_SHP' | 'NAME_MISMATCH'
export type IgnoredWhy = 'COMPANION' | 'ORPHAN' | 'DUPLICATE' | 'NOT_CHOSEN'

export interface PickItem<F extends FileLike> {
    file: F
    kind: FileKind
    /** use = 올릴 파일 · ignored = 쓰지 않음(빼고 올림) · bad = 올릴 수 없음(이유 = problem) */
    use: 'use' | 'ignored' | 'bad'
    problem?: FileProblem
    why?: IgnoredWhy
}

/** 같은 이름(확장자 앞부분, 대소문자 무시)의 SHP 구성 파일 한 벌 */
export interface ShpGroup<F extends FileLike> {
    key: string
    /** 화면에 보이는 이름(.shp가 있으면 그 이름, 없으면 처음 온 파일 이름) */
    base: string
    shp?: F
    shx?: F
    dbf?: F
    prj?: F
    /** 서버로 보낼 순서: shp · dbf · shx · prj */
    files: F[]
    bytes: number
}

export interface ClassifyOptions {
    /** 없으면(한도를 모르는 호스트) 용량 검사를 건너뛴다 — 서버가 막는다 */
    maxShpMb?: number | null
    maxExcelMb?: number | null
    canShp: boolean
    canExcel: boolean
}

export type UploadPick<F extends FileLike> =
    | { kind: 'empty'; items: PickItem<F>[] }
    | { kind: 'unsupported'; items: PickItem<F>[] }
    | { kind: 'excel'; items: PickItem<F>[]; file: F; overSize: boolean }
    | { kind: 'choose-excel'; items: PickItem<F>[]; excels: F[] }
    | { kind: 'mixed'; items: PickItem<F>[]; excels: F[]; shpFiles: F[] }
    | { kind: 'choose-shp'; items: PickItem<F>[]; groups: ShpGroup<F>[] }
    | {
        kind: 'shp'; items: PickItem<F>[]; group: ShpGroup<F>
        /** 빠진 필수 파일(.shp·.dbf) */
        missing: Array<'shp' | 'dbf'>
        /** .shx 없음(막지 않는다 — 서버가 .shx 없이 받는다) */
        noShx: boolean
        noPrj: boolean
        /** 이름이 서로 다른 파일들(막음) — 속성이 엉뚱하게 붙는 사고 방지 */
        nameMismatch: string[] | null
        overSize: boolean
        bytes: number
        /** 파일은 있는데 0바이트라 빠진 것으로 센 .shp·.dbf("빠졌습니다" 대신 "비어 있습니다"로 안내) */
        emptyNames: Partial<Record<'shp' | 'dbf', string>>
    }

const MB = 1024 * 1024

/** 마지막 점 뒤(소문자). 점이 없으면 '' */
export function extOf(name: string): string {
    const i = name.lastIndexOf('.')
    return i < 0 ? '' : name.slice(i + 1).toLowerCase()
}

/** 마지막 점 앞부분(없으면 이름 전체) */
export function baseOf(name: string): string {
    const i = name.lastIndexOf('.')
    return i < 0 ? name : name.slice(0, i)
}

export function kindOf(name: string): FileKind {
    const ext = extOf(name)
    if (ext === 'xlsx') return 'xlsx'
    if (ext === 'shp' || ext === 'shx' || ext === 'dbf' || ext === 'prj') return ext
    if (IGNORED_SHP_EXTS.includes(ext)) return 'companion'
    if (ext === 'xls') return 'xls'
    if (ext === 'csv') return 'csv'
    if (ext === 'zip') return 'zip'
    return 'other'
}

export function isShpFamily(kind: FileKind): boolean {
    return kind === 'shp' || kind === 'shx' || kind === 'dbf' || kind === 'prj'
}

/** 묶음을 구분하는 열쇠(확장자 앞 이름, 대소문자 무시) */
export function groupKeyOf(name: string): string {
    return baseOf(name).toLowerCase()
}

export function maxBytes(mb: number | null | undefined): number | null {
    return typeof mb === 'number' && Number.isFinite(mb) && mb > 0 ? mb * MB : null
}

/** 파일을 이름이 같은 묶음으로 나눈다. 같은 자리(확장자)에 두 개가 오면 나중 것이 이긴다(앞 것은 DUPLICATE로 뺀다) */
function buildGroups<F extends FileLike>(items: PickItem<F>[]): ShpGroup<F>[] {
    const map = new Map<string, ShpGroup<F>>()
    const slotItem = new Map<string, PickItem<F>>()
    for (const it of items) {
        if (it.use !== 'use' || !isShpFamily(it.kind)) continue
        const key = groupKeyOf(it.file.name)
        let g = map.get(key)
        if (!g) {
            g = { key, base: baseOf(it.file.name), files: [], bytes: 0 }
            map.set(key, g)
        }
        const slot = it.kind as 'shp' | 'shx' | 'dbf' | 'prj'
        const slotKey = `${key}\u0000${slot}`
        const prev = slotItem.get(slotKey)
        if (prev) {
            prev.use = 'ignored'
            prev.why = 'DUPLICATE'
        }
        slotItem.set(slotKey, it)
        g[slot] = it.file
        if (slot === 'shp') g.base = baseOf(it.file.name)
    }
    for (const g of Array.from(map.values())) {
        g.files = [g.shp, g.dbf, g.shx, g.prj].filter((f): f is F => f !== undefined)
        g.bytes = g.files.reduce((n, f) => n + f.size, 0)
    }
    return Array.from(map.values())
}

/** 들어온 파일 목록을 종류별로 판별한다 */
export function classifyFiles<F extends FileLike>(files: readonly F[], opts: ClassifyOptions): UploadPick<F> {
    if (files.length === 0) return { kind: 'empty', items: [] }
    const items: PickItem<F>[] = files.map(file => ({ file, kind: kindOf(file.name), use: 'use' as const }))
    for (const it of items) {
        if (it.kind === 'companion') { it.use = 'ignored'; it.why = 'COMPANION'; continue }
        const bad = (problem: FileProblem) => { it.use = 'bad'; it.problem = problem }
        if (it.kind === 'xls') bad('XLS')
        else if (it.kind === 'csv') bad('CSV')
        else if (it.kind === 'zip') bad('ZIP')
        else if (it.kind === 'other') bad('OTHER')
        else if (it.file.size === 0) bad('EMPTY')
        else if (it.kind === 'xlsx' && !opts.canExcel) bad('SOURCE_EXCEL')
        else if (isShpFamily(it.kind) && !opts.canShp) bad('SOURCE_SHP')
    }
    const valid = items.filter(i => i.use === 'use')
    const excels = valid.filter(i => i.kind === 'xlsx').map(i => i.file)
    const fam = valid.filter(i => isShpFamily(i.kind))

    if (valid.length > 0) {
        // 쓸 파일이 있으면 .txt·.qpj·.xls 같은 곁다리는 막지 않고 회색 "쓰지 않음"으로 빼고 올린다(SHP 폴더에 흔히 섞여 있다)
        for (const it of items) {
            if (it.use === 'bad' && (it.problem === 'XLS' || it.problem === 'CSV' || it.problem === 'ZIP' || it.problem === 'OTHER')) {
                it.use = 'ignored'
                it.why = 'COMPANION'
                delete it.problem
            }
        }
    }
    if (valid.length === 0) {
        // 동반 파일만 온 경우도 올릴 수 없다 — "빼고 올림"이 아니라 이유를 말해 준다
        for (const it of items) if (it.use === 'ignored' && it.why === 'COMPANION') { it.use = 'bad'; it.problem = 'COMPANION_ONLY'; delete it.why }
        return { kind: 'unsupported', items }
    }
    if (excels.length > 0 && fam.length > 0) return { kind: 'mixed', items, excels, shpFiles: fam.map(i => i.file) }
    if (excels.length >= 2) return { kind: 'choose-excel', items, excels }
    if (excels.length === 1) {
        const limit = maxBytes(opts.maxExcelMb)
        return { kind: 'excel', items, file: excels[0], overSize: limit !== null && excels[0].size > limit }
    }

    // SHP 계열만
    const groups = buildGroups(items)
    const withShp = groups.filter(g => g.shp)
    const orphans = groups.filter(g => !g.shp)
    const markOrphans = (list: ShpGroup<F>[]) => {
        const keys = new Set(list.map(g => g.key))
        for (const it of items) if (it.use === 'use' && isShpFamily(it.kind) && keys.has(groupKeyOf(it.file.name))) { it.use = 'ignored'; it.why = 'ORPHAN' }
    }
    if (withShp.length >= 2) {
        markOrphans(orphans)
        return { kind: 'choose-shp', items, groups: withShp }
    }
    const limit = maxBytes(opts.maxShpMb)
    const shpPick = (group: ShpGroup<F>, nameMismatch: string[] | null): UploadPick<F> => {
        const missing: Array<'shp' | 'dbf'> = []
        if (!group.shp) missing.push('shp')
        if (!group.dbf) missing.push('dbf')
        const emptyNames: Partial<Record<'shp' | 'dbf', string>> = {}
        for (const it of items) {
            if (it.use === 'bad' && it.problem === 'EMPTY' && (it.kind === 'shp' || it.kind === 'dbf') && groupKeyOf(it.file.name) === group.key) emptyNames[it.kind] = it.file.name
        }
        return {
            kind: 'shp', items, group, missing, emptyNames, noShx: !group.shx, noPrj: !group.prj, nameMismatch,
            overSize: limit !== null && group.bytes > limit, bytes: group.bytes,
        }
    }
    if (withShp.length === 1) {
        const g = withShp[0]
        if (!g.dbf && orphans.some(o => o.dbf)) {
            // a.shp + b.dbf — 이름이 달라 한 묶음이 아니다(서버는 확장자만 보고 섞어 버린다)
            const involved = [g.shp as F, ...orphans.map(o => o.dbf).filter((f): f is F => f !== undefined)]
            for (const it of items) if (involved.includes(it.file)) { it.use = 'bad'; it.problem = 'NAME_MISMATCH' }
            return shpPick(g, involved.map(f => f.name))
        }
        markOrphans(orphans)
        return shpPick(g, null)
    }
    // .shp가 하나도 없다 — 이름이 하나뿐이면 .shp가 빠진 한 벌, 여럿이면 이름 불일치
    if (orphans.length === 1) return shpPick(orphans[0], null)
    const names = valid.map(i => i.file.name)
    for (const it of valid) { it.use = 'bad'; it.problem = 'NAME_MISMATCH' }
    return shpPick(orphans[0], names)
}

/** choose-shp에서 고른 묶음만 남긴 목록 */
export function filesOfGroup<F extends FileLike>(files: readonly F[], key: string): F[] {
    return files.filter(f => !isShpFamily(kindOf(f.name)) || groupKeyOf(f.name) === key)
}

export interface ResolvedPick<F extends FileLike> {
    /** 놓은 그대로의 판별 */
    raw: UploadPick<F>
    /** 화면이 따를 판별(choose-shp면 고른 묶음 하나로 다시 판별한 것) */
    pick: UploadPick<F>
    /** 칩으로 보여 줄 항목(고르지 않은 묶음은 NOT_CHOSEN으로 회색) */
    items: PickItem<F>[]
    /** choose-shp에서 실제로 고른 열쇠(고른 적 없으면 첫 묶음) */
    shpKey: string | null
}

export function resolvePick<F extends FileLike>(files: readonly F[], opts: ClassifyOptions, shpKey: string | null): ResolvedPick<F> {
    const raw = classifyFiles(files, opts)
    if (raw.kind !== 'choose-shp') return { raw, pick: raw, items: raw.items, shpKey: null }
    const key = shpKey !== null && raw.groups.some(g => g.key === shpKey) ? shpKey : raw.groups[0].key
    const pick = classifyFiles(filesOfGroup(files, key), opts)
    const items = raw.items.map(it => (it.use === 'use' && isShpFamily(it.kind) && groupKeyOf(it.file.name) !== key
        ? { ...it, use: 'ignored' as const, why: 'NOT_CHOSEN' as const } : it))
    return { raw, pick, items, shpKey: key }
}

/** 새로 놓은 파일을 지금 SHP에 합칠까(같은 이름은 새 것으로 교체). 지금이 SHP(부족 포함)이고 새 파일에 SHP 계열이 있으며 엑셀이 없을 때 */
export function shouldMergeShp(curKind: UploadPick<FileLike>['kind'], added: readonly FileLike[]): boolean {
    if (curKind !== 'shp' && curKind !== 'choose-shp') return false
    const kinds = added.map(f => kindOf(f.name))
    return kinds.some(isShpFamily) && !kinds.includes('xlsx')
}

/** 같은 이름(대소문자 무시)은 added가 이긴다 */
export function mergeShpFiles<F extends FileLike>(cur: readonly F[], added: readonly F[]): F[] {
    const names = new Set(added.map(f => f.name.toLowerCase()))
    return [...cur.filter(f => !names.has(f.name.toLowerCase())), ...added]
}

/** 레이어 이름 기본값: 엑셀 = 파일 이름(.xlsx 뺌), SHP = .shp 이름(확장자 뺌) */
export function defaultLayerName(pick: UploadPick<FileLike>): string {
    if (pick.kind === 'excel') return baseOf(pick.file.name)
    if (pick.kind === 'shp' && pick.group.shp) return baseOf(pick.group.shp.name)
    return ''
}

/** 지금 판별이 서버로 보낼 수 있는 모양인가(엑셀은 미리보기가 따로 필요) */
export function shpReady(pick: UploadPick<FileLike>): boolean {
    return pick.kind === 'shp' && pick.missing.length === 0 && pick.nameMismatch === null && !pick.overSize
}
