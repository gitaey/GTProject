import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import type { AcceptedPlugin, Rule } from 'postcss'

/*
 * JSP용 UMD 라이브러리 빌드 + standalone 개발 서버 설정. GTProject 앱 빌드(next build)와는 무관하다.
 *   npm run build:gis-umd    → 아래 두 빌드를 차례로 실행한다(frontend/package.json)
 *   vite build               → (a) ol 포함:   dist/gis-map.umd.js, gis-map.es.js, gis-map.css (ol.css를 .gm-root 안으로 한정 + 코어 CSS)
 *   vite build --mode attach → (b) ol 외부화: dist/gis-map.attach.umd.js, gis-map.attach.css (ol.css 없음, 엔진 DOM에만 걸리는 규칙)
 *                              두 빌드 모두 dist를 비우지 않는다(emptyOutDir: false) — 어느 한쪽만 다시 빌드해도 다른 쪽 산출물이 남는다.
 *                              파일 이름이 고정이라 같은 이름은 덮어쓴다. 깨끗이 하려면 dist 폴더를 지우고 build:gis-umd를 돌린다
 *   두 빌드 모두 번들에 실제로 들어간 서드파티 패키지의 라이선스 고지를 dist/<번들>.THIRD-PARTY-NOTICES.txt로 함께 낸다
 *   vite (개발 서버)         → http://localhost:5199/examples/standalone.html (src/standalone.ts를 직접 로드, Tailwind 없음)
 *                              기본은 가짜 호스트(백엔드 없이 뜸). ?host=real 이면 아래 proxy로 GTProject 개발 서버(/api → 8080, /proxy → 3000)에 붙는다.
 * 환경 변수를 읽지 않는다(패키지 파일은 process.env 0) — mock/real 선택은 페이지 주소의 ?host= 로 한다.
 */
const PKG_ROOT = fileURLToPath(new URL('.', import.meta.url))
// ol·proj4·ol-wind는 frontend/node_modules에 있다(패키지는 의존성을 따로 설치하지 않는다)
const FRONTEND_NODE_MODULES = fileURLToPath(new URL('../../node_modules', import.meta.url))
const PKG_VERSION = (JSON.parse(fs.readFileSync(PKG_ROOT + 'package.json', 'utf8')) as { version: string }).version

/* ───────────── (b) attach: ol/* → 전역 ol 경로 ─────────────
 * 'ol/layer/Vector' 같은 import를 가상 모듈로 바꿔 전역 `ol.layer.Vector`를 가리키게 한다. 바깥(external) 모듈은 'ol' 하나뿐이다.
 * Rollup globals로 ol/* 마다 바깥 모듈을 두면 UMD 래퍼가 불러오는 순간 `ol.renderer.canvas.Layer` 같은 경로를 전부 읽어서,
 * 하나라도 없는 ol 버전에서는 GisMap이 만들어지기 전에 TypeError로 멈춘다(그러면 checkOl()로 원인을 알려 줄 수 없다).
 * 가상 모듈은 경로를 안전하게 따라가고, 없으면 "부르면 이유를 말하며 실패하는 함수"를 대신 둔다 → 번들은 어느 버전에서나 뜨고,
 * attach()가 먼저 checkOl()로 막는다. 내보내는 이름 목록은 빌드에 쓰는 실제 ol ESM 파일의 export에서 읽는다(추측 없음). */
const OL_VIRTUAL = '\0gis-map-ol:'
const OL_RUNTIME = '\0gis-map-ol-runtime'
const OL_RUNTIME_CODE = [
    "import ol from 'ol'",
    'export function olPath(path) {',
    '    var cur = ol',
    "    var keys = path ? path.split('.') : []",
    '    for (var i = 0; i < keys.length; i++) cur = cur == null ? undefined : cur[keys[i]]',
    "    return cur == null ? olMissing(path || 'ol') : cur",
    '}',
    'export function olMember(base, path, name) {',
    '    var v = base[name]',
    '    // toString 같은 Object·Function 기본 멤버는 ol이 준 것이 아니다(상속으로 보일 뿐)',
    "    var inherited = v === Object.prototype[name] || v === Function.prototype[name]",
    "    return v == null || inherited ? olMissing(path + '.' + name) : v",
    '}',
    'function olMissing(path) {',
    "    return function () { throw new Error('[gis-map] 전역 ol에 ' + path + '가 없다 — GisMap.checkOl()로 호환 여부를 확인한다') }",
    '}',
].join('\n')

interface EsTreeNode {
    type: string
    [k: string]: unknown
}

function olGlobalsPlugin(): Plugin {
    const realFile = new Map<string, string>()
    return {
        name: 'gis-map-ol-globals',
        enforce: 'pre',
        async resolveId(source, importer) {
            if (source === 'ol') return { id: 'ol', external: true }
            if (source === OL_RUNTIME) return OL_RUNTIME
            if (!source.startsWith('ol/')) return null
            const spec = source.replace(/\.js$/, '')
            if (spec.endsWith('.css')) throw new Error('[gis-map attach] ol CSS를 번들에 넣지 않는다: ' + source)
            const resolved = await this.resolve(source, importer, { skipSelf: true })
            if (!resolved) throw new Error('[gis-map attach] ol 모듈을 찾지 못함: ' + source)
            realFile.set(spec, resolved.id)
            return OL_VIRTUAL + spec
        },
        load(id) {
            if (id === OL_RUNTIME) return OL_RUNTIME_CODE
            if (!id.startsWith(OL_VIRTUAL)) return null
            const spec = id.slice(OL_VIRTUAL.length)
            const file = realFile.get(spec)
            if (!file) throw new Error('[gis-map attach] 해석 안 된 ol 모듈: ' + spec)
            const ast = this.parse(fs.readFileSync(file, 'utf8')) as unknown as { body: EsTreeNode[] }
            const names = new Set<string>()
            for (const node of ast.body) {
                if (node.type === 'ExportAllDeclaration') throw new Error('[gis-map attach] export * 는 다루지 않는다: ' + spec)
                if (node.type !== 'ExportNamedDeclaration') continue
                const decl = node.declaration as EsTreeNode | null
                if (decl && (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration')) {
                    names.add((decl.id as { name: string }).name)
                } else if (decl && decl.type === 'VariableDeclaration') {
                    for (const d of decl.declarations as Array<{ id: EsTreeNode }>) {
                        if (d.id.type !== 'Identifier') throw new Error('[gis-map attach] 구조분해 export는 다루지 않는다: ' + spec)
                        names.add((d.id as unknown as { name: string }).name)
                    }
                }
                for (const s of (node.specifiers as Array<{ exported: { name?: string; value?: string } }> | undefined) ?? []) {
                    const n = s.exported.name ?? s.exported.value
                    if (n && n !== 'default') names.add(n)
                }
            }
            // 'ol/layer/Vector' → 'layer.Vector'. full build는 기본 내보내기가 있는 모듈의 이름 내보내기를 그 클래스의 정적 속성으로 붙인다
            // (ol.interaction.Draw.createBox, ol.geom.Polygon.circular). 기본 내보내기가 없는 모듈은 네임스페이스(ol.proj.fromLonLat)
            const globalPath = spec.slice(3).split('/').join('.')
            const lines = [
                'import { olPath, olMember } from ' + JSON.stringify(OL_RUNTIME),
                'const base = olPath(' + JSON.stringify(globalPath) + ')',
                'export default base',
            ]
            for (const n of names) {
                lines.push(
                    'export const ' + n + ' = /* @__PURE__ */ olMember(base, ' + JSON.stringify(globalPath) + ', ' + JSON.stringify(n) + ')',
                )
            }
            return { code: lines.join('\n'), moduleSideEffects: false }
        },
    }
}

/* ───────────── CSS 범위 (QA FE-6b M2) ─────────────
 * (a) ol.css를 .gm-root 안으로 한정한다 — 같은 페이지의 다른 OL 지도(다른 버전 ol.css)의 모양을 바꾸지 않는다.
 *     엔진 지도 요소(또는 조상)에 class "gm-root"가 있어야 ol.css가 걸린다(README 1절).
 * (b) attach: 코어 CSS만 내고 ol.css는 넣지 않는다(호스트 것 그대로). OL 컨트롤을 꾸미는 규칙(.ol-*)은 빼고,
 *     .gm-root 기준 규칙은 엔진이 그리는 DOM(측정 툴팁·텍스트 입력·커서 안내)의 뿌리로 옮긴다 → 호스트 지도·DOM에 걸리는 규칙 0,
 *     호스트 지도에 gm-root를 붙일 필요도 없다. */
const ENGINE_DOM_ROOTS = ['.gm-measure-tooltip', '.gm-text-input', '.gm-tool-hint']

function insideKeyframes(rule: Rule): boolean {
    const p = rule.parent
    return !!p && p.type === 'atrule' && /keyframes$/i.test((p as unknown as { name: string }).name)
}

function cssFileOf(rule: { source?: { input: { file?: string } } }): string {
    return (rule.source?.input.file ?? '').split(path.sep).join('/')
}

function scopeOlCssPlugin(): AcceptedPlugin {
    return {
        postcssPlugin: 'gis-map-scope-ol-css',
        Once(root) {
            if (!cssFileOf(root).endsWith('/ol/ol.css')) return
            root.walkRules(rule => {
                if (insideKeyframes(rule)) return
                const out: string[] = []
                for (const sel of rule.selectors) {
                    const s = sel.trim()
                    if (s === ':host') continue
                    if (s === ':root') out.push('.gm-root')
                    else if (s.startsWith(':root') || s.startsWith(':host') || /^(html|body)\b/.test(s)) {
                        throw new Error('[gis-map] ol.css 범위 지정이 다루지 않는 선택자: ' + s)
                    } else out.push('.gm-root ' + s)
                }
                if (out.length === 0) rule.remove()
                else rule.selectors = out
            })
        },
    }
}

function attachCorePlugin(): AcceptedPlugin {
    return {
        postcssPlugin: 'gis-map-attach-core-css',
        Once(root) {
            const file = cssFileOf(root)
            if (!file.endsWith('/styles/gis-map.css')) throw new Error('[gis-map attach] 코어 CSS 말고는 들어오면 안 된다: ' + file)
            root.walkRules(rule => {
                if (insideKeyframes(rule)) return
                const sels = rule.selectors.map(s => s.trim())
                if (sels.every(s => s.includes('.ol-'))) {
                    rule.remove()
                    return
                }
                const out: string[] = []
                for (const s of sels) {
                    if (s.includes('.ol-')) throw new Error('[gis-map attach] .ol- 와 다른 선택자가 섞인 규칙: ' + rule.selector)
                    if (s === '.gm-root') {
                        out.push(...ENGINE_DOM_ROOTS)
                    } else if (s.startsWith('.gm-root ')) {
                        const rest = s.slice('.gm-root '.length)
                        if (rest.includes('.gm-root')) throw new Error('[gis-map attach] .gm-root가 두 번: ' + s)
                        for (const r of ENGINE_DOM_ROOTS) {
                            out.push(r + ' ' + rest)
                            // :where(…)로 시작하면 뿌리 요소 자신도 대상(.gm-root 아래에서는 뿌리도 자손이라 같은 규칙을 받았다)
                            if (rest.startsWith(':where(')) out.push(r + rest)
                        }
                    } else if (s.includes('.gm-root')) {
                        throw new Error('[gis-map attach] 다루지 않는 .gm-root 위치: ' + s)
                    } else {
                        out.push(s)
                    }
                }
                rule.selectors = out
            })
            root.walkAtRules(at => {
                if (at.nodes && at.nodes.length === 0) at.remove()
            })
        },
    }
}

/* ───────────── 서드파티 라이선스 고지 (QA FE-6b L6) ─────────────
 * 번들에 실제로 들어간 모듈(렌더 길이 > 0)을 node_modules 패키지별로 모아, 각 패키지의 LICENSE 파일 원문을 그대로 옮긴다.
 * 라이선스 파일이 없는 패키지는 없다고 적는다(내용을 지어내지 않는다). */
interface PkgInfo {
    name: string
    version: string
    license: string
    author: string
    dir: string
}

function packageOf(id: string): PkgInfo | null {
    const norm = id.split(path.sep).join('/')
    const at = norm.lastIndexOf('/node_modules/')
    if (at < 0 || norm.startsWith('\0')) return null
    const rest = norm.slice(at + '/node_modules/'.length).split('/')
    const name = rest[0].startsWith('@') ? rest[0] + '/' + rest[1] : rest[0]
    const dir = norm.slice(0, at) + '/node_modules/' + name
    const pj = JSON.parse(fs.readFileSync(dir + '/package.json', 'utf8')) as {
        version?: string
        license?: string | { type?: string }
        author?: string | { name?: string }
    }
    const license = typeof pj.license === 'string' ? pj.license : pj.license?.type ?? '(package.json에 license 없음)'
    const author = typeof pj.author === 'string' ? pj.author : pj.author?.name ?? ''
    return { name, version: pj.version ?? '?', license, author, dir }
}

function licenseText(dir: string): string | null {
    const file = fs
        .readdirSync(dir)
        .filter(f => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f))
        .sort()[0]
    return file ? fs.readFileSync(dir + '/' + file, 'utf8').replace(/\r\n/g, '\n').trim() : null
}

function noticeFileName(attach: boolean): string {
    return attach ? 'gis-map.attach.THIRD-PARTY-NOTICES.txt' : 'gis-map.THIRD-PARTY-NOTICES.txt'
}

function thirdPartyNoticesPlugin(attach: boolean): Plugin {
    const fileName = noticeFileName(attach)
    const pkgs = new Map<string, PkgInfo>()
    const files = new Set<string>()
    return {
        name: 'gis-map-third-party-notices',
        apply: 'build',
        // 출력 형식(umd·es)마다 한 번씩 불린다 → 모아 두었다가 마지막 형식에서 한 번 낸다(같은 이름 파일을 두 번 내지 않음)
        generateBundle(options, bundle) {
            for (const out of Object.values(bundle)) {
                if (out.type !== 'chunk') continue
                files.add(out.fileName)
                for (const [id, m] of Object.entries(out.modules)) {
                    if (m.renderedLength === 0) continue
                    const p = packageOf(id)
                    if (p && !pkgs.has(p.name)) pkgs.set(p.name, p)
                }
            }
            const lastFormat = attach ? 'umd' : 'es'
            if (options.format !== lastFormat) return
            const list = Array.from(pkgs.values()).sort((a, b) => a.name.localeCompare(b.name))
            const head = [
                '@gtp/gis-map ' + PKG_VERSION + ' — 서드파티 소프트웨어 고지 (Third-party software notices)',
                '대상 파일: ' + Array.from(files).sort().join(', '),
                '이 파일은 빌드(vite build' + (attach ? ' --mode attach' : '') + ')가 번들에 실제로 포함된 모듈에서 자동으로 만든다.',
            ]
            if (attach) head.push('OpenLayers(ol)는 이 번들에 들어 있지 않다 — 페이지가 따로 불러오는 ol.js의 고지는 ol 배포본을 따른다.')
            head.push('', '포함된 패키지 ' + list.length + '개:', ...list.map(p => '  - ' + p.name + ' ' + p.version + ' (' + p.license + ')'), '')
            const body = list.map(p => {
                const text = licenseText(p.dir)
                return [
                    '='.repeat(78),
                    p.name + ' ' + p.version + ' — ' + p.license + (p.author ? ' — ' + p.author : ''),
                    '='.repeat(78),
                    text ?? '(이 패키지 배포본에 라이선스 파일이 없다. package.json의 license 필드: ' + p.license + ')',
                    '',
                ].join('\n')
            })
            this.emitFile({ type: 'asset', fileName, source: head.join('\n') + '\n' + body.join('\n') })
        },
    }
}

export default defineConfig(({ mode }) => {
    const attach = mode === 'attach'
    return {
        root: PKG_ROOT,
        publicDir: false,
        // 사전 번들 캐시를 패키지 폴더(폴더째 복사하는 이식 단위) 밖에 둔다
        cacheDir: FRONTEND_NODE_MODULES + '/.vite-gis-map',
        define: { 'process.env.NODE_ENV': '"production"' },
        // 앱의 postcss.config.mjs(Tailwind)를 찾아 쓰지 않게 설정을 직접 준다 — 패키지 CSS는 Tailwind 없이 나간다. 플러그인은 위 범위 지정뿐
        css: { postcss: { plugins: [attach ? attachCorePlugin() : scopeOlCssPlugin()] } },
        plugins: attach ? [olGlobalsPlugin(), thirdPartyNoticesPlugin(true)] : [thirdPartyNoticesPlugin(false)],
        server: {
            // 3000(Next)·8080(백엔드)·5173(vite 기본)과 겹치지 않는 고정 포트. 이미 쓰고 있으면 다른 포트로 넘어가지 않고 멈춘다
            port: 5199,
            strictPort: true,
            fs: { allow: [PKG_ROOT, FRONTEND_NODE_MODULES] },
            proxy: {
                '/api': { target: 'http://localhost:8080', changeOrigin: true },
                '/proxy': { target: 'http://localhost:3000', changeOrigin: true },
            },
        },
        optimizeDeps: { entries: ['examples/standalone.html'] },
        build: {
            outDir: 'dist',
            // (a)·(b)가 같은 dist에 나눠 쓰므로 서로의 산출물을 지우지 않게 한다(QA FE-6c L-5)
            emptyOutDir: false,
            // ES2019 = Chrome·Edge 73+, Firefox 67+, Safari 12.1+ 문법. ?. ?? 클래스 필드 등은 esbuild가 낮춰 쓴다(ol 코드 포함). 근거: 03_map_FE-6b 4절
            target: 'es2019',
            cssCodeSplit: false,
            lib: attach
                ? {
                      entry: 'src/standalone-attach.ts',
                      name: 'GisMap',
                      formats: ['umd'],
                      fileName: () => 'gis-map.attach.umd.js',
                      cssFileName: 'gis-map.attach',
                  }
                : {
                      entry: 'src/standalone.ts',
                      name: 'GisMap',
                      formats: ['umd', 'es'],
                      fileName: (format: string) => (format === 'umd' ? 'gis-map.umd.js' : 'gis-map.es.js'),
                      cssFileName: 'gis-map',
                  },
            rollupOptions: {
                output: {
                    banner:
                        '/*! @gtp/gis-map ' + PKG_VERSION + (attach ? ' (attach, ol 제외)' : '') + ' | 서드파티 라이선스: ' + noticeFileName(attach) + ' */',
                    // attach: 바깥 모듈은 전역 ol 하나(위 olGlobalsPlugin). default import = 전역 객체 그 자체
                    ...(attach ? { globals: { ol: 'ol' }, interop: 'default' as const } : {}),
                },
            },
        },
    }
})
