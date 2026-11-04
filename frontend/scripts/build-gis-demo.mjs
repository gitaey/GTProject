// 정적 예제 폴더(gis-demo) 조립 스크립트. Node 18+, 새 npm 의존성 없음, 쉘 명령(rm·cp·cmd) 의존 없음 — Windows·Linux 모두.
//
//   node scripts/build-gis-demo.mjs [--copy-to <dir>]
//
//   1) packages/gis-map/dist/ 의 UMD 산출물((a) 일반 + (b) attach)이 없거나 소스보다 오래됐으면 스스로 vite build 두 번(= npm run build:gis-umd와 같은 명령)을 돌린다.
//      → 깨끗한 체크아웃(CI·서버, dist 없음)에서도 성공한다. vite가 없으면(devDependencies 미설치) 이유를 말하고 실패한다.
//   2) packages/gis-map/dist/gis-demo/ 를 지우고 examples/gis-demo/* + lib/(번들 6파일 + ol.js·ol.css·LICENSE.md)로 조립, map.jsp 생성.
//   3) 이식성 검사(최상위 html·js·jsp): 절대 경로·서버 경로·localhost·process.env·import.meta·fetch·type="module"·허용 목록 밖 외부 주소·없는 상대 파일 → 실패.
//   4) --copy-to <dir>: 대상 폴더를 비운 뒤 완성본을 그대로 복사(멱등, 옛 파일이 남지 않는다).
//
// 실패는 크게: 원인 한 줄을 stderr에 쓰고 종료 코드 1. 조용히 건너뛰지 않는다(데모 폴더가 빈 채 배포되는 것을 막는다).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND = path.resolve(HERE, '..')
const PKG = path.join(FRONTEND, 'packages', 'gis-map')
const DIST = path.join(PKG, 'dist')
const EXAMPLE_SRC = path.join(PKG, 'examples', 'gis-demo')
const OUT = path.join(DIST, 'gis-demo')

/** (a)·(b) 번들 산출물 — dist 안 파일 이름(고정) */
export const UMD_FILES = [
    'gis-map.umd.js',
    'gis-map.css',
    'gis-map.THIRD-PARTY-NOTICES.txt',
    'gis-map.attach.umd.js',
    'gis-map.attach.css',
    'gis-map.attach.THIRD-PARTY-NOTICES.txt',
]

/** JSP 지시자(첫 줄). JSTL·EL 없음, isELIgnored로 HTML·JS 안의 ${ 글자가 EL로 읽히지 않게 한다 */
export const JSP_DIRECTIVE = '<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" isELIgnored="true" %>'

/** 외부 주소 허용 목록(접두사) — 배경 타일·저작자 표시 링크만 */
export const EXTERNAL_ALLOW = [
    'https://tile.openstreetmap.org/',
    'https://www.openstreetmap.org/',
    'https://api.vworld.kr/',
]

class BuildError extends Error {}

function fail(message) {
    throw new BuildError(message)
}

// ───── 파일 도우미(Node 18 안정 API만) ─────
function rmrf(target) {
    fs.rmSync(target, { recursive: true, force: true })
}

function copyDir(from, to) {
    fs.mkdirSync(to, { recursive: true })
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const a = path.join(from, entry.name)
        const b = path.join(to, entry.name)
        if (entry.isDirectory()) copyDir(a, b)
        else fs.copyFileSync(a, b)
    }
}

function walkFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name)
        if (entry.isDirectory()) walkFiles(p, out)
        else out.push(p)
    }
    return out
}

function newestMtime(dir) {
    let max = 0
    for (const f of walkFiles(dir)) max = Math.max(max, fs.statSync(f).mtimeMs)
    return max
}

// ───── 1) UMD 산출물 확보 ─────
function umdState() {
    const missing = UMD_FILES.filter(f => !fs.existsSync(path.join(DIST, f)))
    if (missing.length > 0) return { ok: false, reason: 'dist에 없음: ' + missing.join(', ') }
    const oldest = Math.min(...UMD_FILES.map(f => fs.statSync(path.join(DIST, f)).mtimeMs))
    const inputs = [newestMtime(path.join(PKG, 'src')), fs.statSync(path.join(PKG, 'vite.config.ts')).mtimeMs, fs.statSync(path.join(PKG, 'package.json')).mtimeMs]
    if (Math.max(...inputs) > oldest) return { ok: false, reason: 'dist가 소스보다 오래됨' }
    return { ok: true, reason: '' }
}

function findVite() {
    const req = createRequire(path.join(FRONTEND, 'package.json'))
    let pkgPath
    try {
        pkgPath = req.resolve('vite/package.json')
    } catch {
        fail('vite를 찾을 수 없다 — devDependencies 설치 필요(frontend/에서 npm install 또는 npm ci, NODE_ENV=production이면 --include=dev)')
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && pkg.bin.vite
    if (!bin) fail('vite 패키지에서 실행 파일(bin)을 찾지 못했다: ' + pkgPath)
    return path.join(path.dirname(pkgPath), bin)
}

function runVite(viteBin, extraArgs, label) {
    const started = Date.now()
    console.log('[gis-demo] vite build ' + label + ' …')
    const res = spawnSync(process.execPath, [viteBin, 'build', '-c', path.join('packages', 'gis-map', 'vite.config.ts'), ...extraArgs], {
        cwd: FRONTEND,
        stdio: 'inherit',
    })
    if (res.error) fail('vite 실행 실패(' + label + '): ' + res.error.message)
    if (res.status !== 0) fail('vite build 실패(' + label + ', 종료 코드 ' + res.status + ') — 위 출력 참고')
    console.log('[gis-demo] vite build ' + label + ' 완료 (' + ((Date.now() - started) / 1000).toFixed(1) + 's)')
}

function ensureUmd() {
    const state = umdState()
    if (state.ok) {
        console.log('[gis-demo] dist의 UMD 산출물이 최신 — vite build 건너뜀')
        return
    }
    console.log('[gis-demo] UMD 산출물을 새로 만든다: ' + state.reason)
    const viteBin = findVite()
    runVite(viteBin, [], '(a) 일반')
    runVite(viteBin, ['--mode', 'attach'], '(b) attach')
    const after = UMD_FILES.filter(f => !fs.existsSync(path.join(DIST, f)))
    if (after.length > 0) fail('vite build 뒤에도 산출물이 없다: ' + after.join(', '))
}

// ───── 2) 조립 ─────
function olDir() {
    const req = createRequire(path.join(FRONTEND, 'package.json'))
    let p
    try {
        p = req.resolve('ol/package.json')
    } catch {
        fail('ol 패키지를 찾을 수 없다 — npm install 필요')
    }
    return path.dirname(p)
}

/** create.html → map.jsp 내용(Buffer). JSP로 오해될 문자열이 있으면 실패 */
export function generateJsp(createHtml) {
    const text = createHtml.toString('utf8')
    for (const bad of ['<%', '%>', '<jsp:', 'taglib', '${', '#{']) {
        if (text.includes(bad)) fail('create.html에 JSP·EL로 읽힐 수 있는 문자열이 있다: ' + bad)
    }
    return Buffer.concat([Buffer.from(JSP_DIRECTIVE + '\n', 'utf8'), createHtml])
}

function assemble() {
    if (!fs.existsSync(EXAMPLE_SRC)) fail('예제 원본 폴더가 없다: ' + EXAMPLE_SRC)
    rmrf(OUT)
    copyDir(EXAMPLE_SRC, OUT)
    const lib = path.join(OUT, 'lib')
    fs.mkdirSync(path.join(lib, 'ol'), { recursive: true })
    for (const f of UMD_FILES) fs.copyFileSync(path.join(DIST, f), path.join(lib, f))
    const ol = olDir()
    fs.copyFileSync(path.join(ol, 'dist', 'ol.js'), path.join(lib, 'ol', 'ol.js'))
    fs.copyFileSync(path.join(ol, 'ol.css'), path.join(lib, 'ol', 'ol.css'))
    fs.copyFileSync(path.join(ol, 'LICENSE.md'), path.join(lib, 'ol', 'LICENSE.md'))
    const createPath = path.join(OUT, 'create.html')
    if (!fs.existsSync(createPath)) fail('create.html이 없다')
    fs.writeFileSync(path.join(OUT, 'map.jsp'), generateJsp(fs.readFileSync(createPath)))
}

// ───── 3) 이식성 검사 ─────
const FORBIDDEN = ['/api/', '/proxy/', 'localhost', 'process.env', 'import.meta', 'fetch(', 'type="module"', "type='module'", 'XMLHttpRequest', 'new Worker', 'new SharedWorker']

function refTargets(html) {
    const out = []
    const re = /\b(?:src|href)\s*=\s*("([^"]*)"|'([^']*)')/gi
    let m
    while ((m = re.exec(html))) out.push(m[2] !== undefined ? m[2] : m[3])
    return out
}

/** 폴더의 최상위 html·js·jsp(lib/ 제외)를 검사해 위반 목록을 돌려준다 */
export function checkFolder(dir) {
    const problems = []
    const files = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && /\.(html|js|jsp)$/i.test(e.name)).map(e => e.name)
    for (const name of files) {
        const text = fs.readFileSync(path.join(dir, name), 'utf8')
        for (const f of FORBIDDEN) if (text.includes(f)) problems.push(name + ': 금지 문자열 ' + JSON.stringify(f))
        if (!/\.js$/i.test(name)) {
            for (const ref of refTargets(text)) {
                if (ref === '' || ref.startsWith('#') || ref.startsWith('data:')) continue
                if (/^https?:\/\//i.test(ref)) {
                    if (!EXTERNAL_ALLOW.some(a => ref.startsWith(a))) problems.push(name + ': 허용 목록 밖 외부 주소 ' + ref)
                } else if (ref.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) {
                    problems.push(name + ': 절대 경로·다른 스킴 ' + ref)
                } else if (!/^(\.\/|[A-Za-z0-9_.-]+(\/|$|\?|#))/.test(ref) || ref.startsWith('../')) {
                    problems.push(name + ': 상대 경로 형식 ' + ref)
                } else {
                    const file = ref.split('#')[0].split('?')[0]
                    if (!fs.existsSync(path.join(dir, file))) problems.push(name + ': 참조 파일이 없다 ' + ref)
                }
            }
        }
    }
    return problems
}

// ───── 4) 복사 ─────
function copyTo(rawDest) {
    const dest = path.resolve(process.cwd(), rawDest)
    // 지우기 전 안전 장치: 소스·패키지·frontend를 품은 폴더(루트·상위)이거나 완성본 자신이면 거부
    const inside = (outer, inner) => {
        const rel = path.relative(outer, inner)
        return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
    }
    if (dest === path.parse(dest).root || inside(dest, FRONTEND) || inside(dest, PKG) || dest === OUT || inside(OUT, dest) || inside(EXAMPLE_SRC, dest)) {
        fail('--copy-to 대상이 위험하다(루트·frontend·패키지·원본 폴더를 품거나 완성본 자신): ' + dest)
    }
    rmrf(dest)
    copyDir(OUT, dest)
    console.log('[gis-demo] 복사 완료 → ' + dest)
}

export function parseArgs(argv) {
    const args = { copyTo: null }
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--copy-to') {
            args.copyTo = argv[++i]
            if (!args.copyTo) fail('--copy-to 뒤에 폴더 경로가 필요하다')
        } else fail('알 수 없는 인자: ' + argv[i] + ' (사용법: node scripts/build-gis-demo.mjs [--copy-to <dir>])')
    }
    return args
}

export function main(argv) {
    const started = Date.now()
    const args = parseArgs(argv)
    ensureUmd()
    assemble()
    const problems = checkFolder(OUT)
    if (problems.length > 0) fail('이식성 검사 실패:\n  - ' + problems.join('\n  - '))
    console.log('[gis-demo] 이식성 검사 통과 → ' + OUT)
    if (args.copyTo) copyTo(args.copyTo)
    console.log('[gis-demo] 끝 (' + ((Date.now() - started) / 1000).toFixed(1) + 's)')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main(process.argv.slice(2))
    } catch (e) {
        console.error('[gis-demo] 실패: ' + (e instanceof BuildError ? e.message : e && e.stack ? e.stack : String(e)))
        process.exit(1)
    }
}
