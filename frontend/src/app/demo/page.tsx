import Link from 'next/link'
import {
    ArrowRight, ChartPie, CodeXml, FolderTree, Globe, Github, Grip, LandPlot, Layers, Lock, LogIn, MapPinned, Play,
    Printer, Table2, Wind,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/*
 * 공개 소개 페이지(/demo) — 서버 컴포넌트, 로그인·백엔드 호출 없음. 미들웨어가 /demo 경로를 로그인 없이 연다.
 * 지도 데모(/demo/map)와 정적 예제(/demo/umd/)는 다른 단계에서 만든다 — 여기서는 링크만 건다.
 * 기능 카드의 step id 는 /demo/map?step=<id> 계약(layers, parcel, mymap-style, table-export, big-data, area, print, wind).
 */

const GITHUB_URL = 'https://github.com/gitaey/GTProject'
const SRC_PACKAGE = `${GITHUB_URL}/tree/master/frontend/packages/gis-map`
const SRC_EXAMPLES = `${GITHUB_URL}/tree/master/frontend/packages/gis-map/examples`
const SRC_MAP_PAGE = `${GITHUB_URL}/tree/master/frontend/src/app/map`

type FeatureKind = 'sample' | 'real'

interface FeatureCard {
    step: string
    title: string
    desc: string
    tag: string
    kind: FeatureKind
    Icon: LucideIcon
}

const FEATURES: FeatureCard[] = [
    { step: 'layers', title: '레이어·배경지도', desc: '레이어 트리, 투명도, 범례, 일반/위성 배경.', tag: '실제 GeoServer', kind: 'real', Icon: Layers },
    { step: 'parcel', title: '필지 정보', desc: '필지를 누르면 지번·지목·면적·공시지가와 건물 목록.', tag: '샘플', kind: 'sample', Icon: LandPlot },
    { step: 'mymap-style', title: '나만의지도 스타일', desc: '값별·구간별 색, 라벨, 클릭 팝업을 바로 미리보기.', tag: '샘플', kind: 'sample', Icon: MapPinned },
    { step: 'table-export', title: '속성 표·내보내기', desc: '정렬·필터, GeoJSON·엑셀로 좌표계를 골라 저장.', tag: '샘플', kind: 'sample', Icon: Table2 },
    { step: 'big-data', title: '10만 피처 묶음', desc: '화면 안 피처가 많으면 격자 원으로 묶고, 확대하면 풀린다.', tag: '브라우저 합성', kind: 'sample', Icon: Grip },
    { step: 'area', title: '영역 분석', desc: '영역을 정하고 레이어를 골라 건수·범주별 면적 집계.', tag: '실제 GeoServer', kind: 'real', Icon: ChartPie },
    { step: 'print', title: '지도 출력', desc: '제목·범례·축척·방위표가 들어간 A4/A3 PNG·PDF.', tag: '브라우저', kind: 'sample', Icon: Printer },
    { step: 'wind', title: '바람지도', desc: '예보 프레임 재생, 입자·풍속 색상 오버레이.', tag: '가상 바람장', kind: 'sample', Icon: Wind },
]

const STATS: { value: string; label: string }[] = [
    { value: '3가지', label: '이식 방법' },
    { value: 'ol 7.1~10.x', label: 'attach 호환' },
    { value: '15항목', label: '이식성 자동 감사' },
    { value: '10만', label: '피처 묶음 표시' },
]

const CODE_REACT = `<GisMapProvider host={host} config={CONFIG}>
  <MapShell brand={{ title: '업무 지도' }} />
</GisMapProvider>`

const CODE_CREATE = `var map = GisMap.create({
  target: 'map',
  host: { keys: { vworld: '' } },
  sources: [mySources]  // 데이터는 소스로 주입
});`

const CODE_ATTACH = `if (GisMap.checkOl().ok) {
  gis = GisMap.attach(workMap, { sources: [mySources] });
}
gis.destroy(); // 업무 지도는 그대로`

const FOLDER_TREE = `gis-demo/
├─ index.html      예제 목록·호환 표
├─ create.html     UMD GisMap.create
├─ attach.html     기존 ol 지도에 붙이기
├─ map.jsp         create.html + JSP 지시자 1줄
├─ demo-data.js    가짜 소스·샘플(서버 호출 0)
├─ demo.css · README.txt
└─ lib/
   ├─ gis-map.umd.js · gis-map.css
   ├─ gis-map.attach.umd.js · gis-map.attach.css
   ├─ *.THIRD-PARTY-NOTICES.txt
   └─ ol/ol.js · ol.css · LICENSE.md`

const LOGIN_FEATURES: string[] = [
    '나만의지도 파일 업로드·공유(데모에서는 저장하지 않습니다)',
    'GeoTIFF 올리기와 래스터 표시',
    '주소 엑셀 변환·내보내기',
    '실제 연속지적도·공시지가 필지 정보와 도로명주소 건물',
    '기상청 예보 자료 기반 실제 바람지도',
    '레이어 개인 설정과 메뉴 권한',
]

function Tag({ kind, children }: { kind: FeatureKind; children: React.ReactNode }) {
    const style = kind === 'real'
        ? { background: 'rgba(37,99,235,0.1)', color: '#2563eb' }
        : { background: 'rgba(22,163,74,0.1)', color: '#16a34a' }
    return <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full" style={style}>{children}</span>
}

function CodeBlock({ code }: { code: string }) {
    return (
        <pre className="m-0 rounded-lg p-3 overflow-x-auto text-[12px] leading-relaxed" style={{ background: '#0f172a', color: '#e2e8f0' }}>
            <code className="font-mono">{code}</code>
        </pre>
    )
}

const btnBase = 'inline-flex items-center gap-1.5 rounded-lg text-[13px] font-semibold px-3.5 py-2 transition-opacity hover:opacity-85'
const btnLine = { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
const btnPrimary = { background: 'var(--accent)', border: '1px solid var(--accent)', color: '#ffffff' }

export default function DemoPage() {
    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
            <div className="mx-auto w-full max-w-[1120px]">
                {/* 상단 바 */}
                <nav className="flex items-center gap-4 sm:gap-5 px-4 sm:px-6 h-[52px] text-[13px]" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    <span className="flex items-center gap-2 font-extrabold mr-auto" style={{ color: 'var(--accent)' }}>
                        <Globe size={18} />
                        <span>GIS 지도 모듈 데모</span>
                    </span>
                    <a href="#features" className="hidden sm:inline hover:underline">기능</a>
                    <a href="#ways" className="hidden sm:inline hover:underline">이식 방법</a>
                    <a href="#static" className="hidden sm:inline hover:underline">정적 예제</a>
                    <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={btnBase} style={btnLine}>
                        <Github size={14} />
                        <span className="hidden sm:inline">GitHub</span>
                    </a>
                    <Link href="/login" className={btnBase} style={btnLine}>
                        <LogIn size={14} />
                        <span>로그인</span>
                    </Link>
                </nav>

                {/* 첫 화면 */}
                <header className="grid gap-7 px-4 sm:px-6 py-10 md:grid-cols-[1.15fr_1fr] items-center" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div>
                        <h1 className="text-[26px] sm:text-[28px] leading-snug font-bold mb-3 tracking-tight">
                            OpenLayers 지도 기능을<br />
                            <em className="not-italic" style={{ color: 'var(--accent)' }}>폴더 하나</em>로 어디든 옮겨 쓴다
                        </h1>
                        <p className="text-sm leading-7 mb-5" style={{ color: 'var(--text-secondary)' }}>
                            React 앱, JSP·전자정부 화면, 이미 <code className="font-mono text-[13px]">new ol.Map</code>을 쓰는 업무 지도까지
                            — 같은 엔진을 세 가지 방법으로 붙입니다. 아래 데모는 로그인 없이 샘플(가상) 데이터로 동작하며
                            서버에 아무것도 저장하지 않습니다.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Link href="/demo/map" className={btnBase} style={btnPrimary}>
                                <Play size={14} />
                                지도 데모 열기
                            </Link>
                            <a href="/demo/umd/index.html" className={btnBase} style={btnLine}>
                                <CodeXml size={14} />
                                JSP·attach 예제
                            </a>
                            <a href={SRC_PACKAGE} target="_blank" rel="noopener noreferrer" className={btnBase} style={btnLine}>
                                <Github size={14} />
                                소스 보기
                            </a>
                        </div>
                        <dl className="flex flex-wrap gap-x-6 gap-y-3 mt-6">
                            {STATS.map(s => (
                                <div key={s.label} className="flex flex-col text-xs" style={{ color: 'var(--text-muted)' }}>
                                    <dd className="text-xl font-bold order-first" style={{ color: 'var(--text-primary)' }}>{s.value}</dd>
                                    <dt>{s.label}</dt>
                                </div>
                            ))}
                        </dl>
                    </div>
                    <div
                        className="relative h-[220px] md:h-[250px] rounded-xl overflow-hidden"
                        style={{ border: '1px solid var(--border)', background: 'linear-gradient(135deg,#eef3ea,#e3ecf3)' }}
                        aria-hidden="true"
                    >
                        <svg viewBox="0 0 400 250" className="absolute inset-0 w-full h-full">
                            <path d="M0 170 Q120 140 200 160 T400 130" stroke="#cbd5c0" strokeWidth="10" fill="none" />
                            <g fill="rgba(242,103,34,.15)" stroke="#F26722" strokeWidth="1">
                                <rect x="150" y="70" width="40" height="30" />
                                <rect x="194" y="70" width="36" height="30" />
                                <rect x="150" y="104" width="38" height="34" />
                                <rect x="192" y="104" width="38" height="34" fill="rgba(242,103,34,.4)" strokeWidth="2" />
                            </g>
                            <g fill="#2563eb" opacity=".8">
                                <circle cx="90" cy="60" r="12" />
                                <circle cx="300" cy="190" r="16" />
                                <circle cx="320" cy="80" r="9" />
                            </g>
                            <g fill="#fff" fontSize="9" textAnchor="middle">
                                <text x="90" y="63">1.2천</text>
                                <text x="300" y="193">3.4만</text>
                                <text x="320" y="83">640</text>
                            </g>
                        </svg>
                    </div>
                </header>

                {/* 기능 카드 */}
                <section id="features" className="px-4 sm:px-6 py-7" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-[17px] font-bold mb-1">기능별로 써 보기</h2>
                    <p className="text-[13px] mb-4 flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: 'var(--text-muted)' }}>
                        카드를 누르면 지도 데모가 그 단계의 안내와 함께 열립니다. 표시:
                        <Tag kind="sample">샘플</Tag> 브라우저 안 가짜 데이터
                        <Tag kind="real">실제</Tag> 실제 외부 서버 호출
                    </p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {FEATURES.map(({ step, title, desc, tag, kind, Icon }) => (
                            <Link
                                key={step}
                                href={`/demo/map?step=${step}`}
                                className="flex flex-col gap-1.5 rounded-xl p-3.5 transition-shadow hover:shadow-md"
                                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                            >
                                <span className="flex items-center justify-center w-[34px] h-[34px] rounded-lg" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                                    <Icon size={18} />
                                </span>
                                <b className="text-[13.5px]">{title}</b>
                                <p className="m-0 flex-1 text-xs leading-normal" style={{ color: 'var(--text-muted)' }}>{desc}</p>
                                <span><Tag kind={kind}>{tag}</Tag></span>
                                <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                                    써 보기 <ArrowRight size={13} />
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* 이식 3가지 */}
                <section id="ways" className="px-4 sm:px-6 py-7" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-[17px] font-bold mb-1">이식 방법 3가지</h2>
                    <p className="text-[13px] mb-4" style={{ color: 'var(--text-muted)' }}>
                        엔진은 인증·주소·키·권한을 <b>호스트(GisMapHost)</b>로, 데이터를 <b>소스(GisMapSources)</b>로 주입받습니다.
                        그래서 어느 화면에든 같은 코드가 붙습니다.
                    </p>
                    <div className="grid gap-3.5 md:grid-cols-3">
                        <WayCard n={1} title="React 앱 — MapShell" who="Next.js·Vite. 폴더 복사 + 경로 별칭 6개" code={CODE_REACT}>
                            <Link href="/demo/map" className={`${btnBase} !px-2.5 !py-1 !text-xs`} style={btnPrimary}>이 데모가 이 방식</Link>
                            <a href={SRC_MAP_PAGE} target="_blank" rel="noopener noreferrer" className={`${btnBase} !px-2.5 !py-1 !text-xs`} style={btnLine}>
                                <Github size={12} /> 소스
                            </a>
                        </WayCard>
                        <WayCard n={2} title="JSP — GisMap.create" who="React 없는 페이지. script 한 줄(ol 포함 번들)" code={CODE_CREATE}>
                            <a href="/demo/umd/create.html" className={`${btnBase} !px-2.5 !py-1 !text-xs`} style={btnPrimary}>예제 열기</a>
                            <a href={SRC_EXAMPLES} target="_blank" rel="noopener noreferrer" className={`${btnBase} !px-2.5 !py-1 !text-xs`} style={btnLine}>
                                <Github size={12} /> 소스
                            </a>
                        </WayCard>
                        <WayCard n={3} title="기존 ol 지도 — GisMap.attach" who="업무 화면의 ol 7.1 이상에 붙였다 떼기" code={CODE_ATTACH}>
                            <a href="/demo/umd/attach.html" className={`${btnBase} !px-2.5 !py-1 !text-xs`} style={btnPrimary}>예제 열기</a>
                            <a href={SRC_EXAMPLES} target="_blank" rel="noopener noreferrer" className={`${btnBase} !px-2.5 !py-1 !text-xs`} style={btnLine}>
                                <Github size={12} /> 소스
                            </a>
                        </WayCard>
                    </div>
                </section>

                {/* 정적 예제 폴더 */}
                <section id="static" className="px-4 sm:px-6 py-7" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-[17px] font-bold mb-1">자바 서버에 복사해 쓰기 (JDK 11 톰캣·전자정부)</h2>
                    <p className="text-[13px] mb-4" style={{ color: 'var(--text-muted)' }}>
                        정적 예제 폴더 하나에 번들·CSS·샘플 데이터가 다 들어 있습니다. 서버 프로그램 없이 정적 폴더나 JSP 옆에 그대로 놓으면 열립니다.
                    </p>
                    <div className="grid gap-4 md:grid-cols-[1fr_1.1fr]">
                        <pre
                            className="m-0 rounded-lg p-3 overflow-x-auto font-mono text-xs leading-[1.7]"
                            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        >
                            {FOLDER_TREE}
                        </pre>
                        <div className="flex flex-col gap-2.5 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                            <Step n={1}>
                                <b>받기</b> — 저장소에서 <code className="font-mono">npm run build:gis-demo</code> →{' '}
                                <code className="font-mono">dist/gis-demo/</code>
                            </Step>
                            <Step n={2}>
                                <b>복사</b> — <code className="font-mono">webapp/gis-demo/</code>(WEB-INF 밖)에 폴더째.
                                경로는 전부 상대 경로라 컨텍스트 경로와 무관합니다.
                            </Step>
                            <Step n={3}>
                                <b>열기</b> — <code className="font-mono">/컨텍스트/gis-demo/map.jsp</code> 또는{' '}
                                <code className="font-mono">index.html</code>. 배경지도는 키 없는 OSM이 기본이고, 폐쇄망이면{' '}
                                <code className="font-mono">DEMO_BASEMAP = &apos;none&apos;</code>
                            </Step>
                            <p className="m-0 rounded-lg px-3 py-2 text-xs leading-relaxed" style={{ background: 'rgba(180,83,9,0.08)', color: '#b45309' }}>
                                map.jsp는 JSTL·EL·스크립틀릿 없이 page 지시자 한 줄만 씁니다(JSP 2.0 문법 — Tomcat 9·JDK 11에서 해석).
                                이 저장소에서는 실제 톰캣으로 실행해 보지 못했습니다.
                            </p>
                            <div>
                                <a href="/demo/umd/index.html" className={btnBase} style={btnLine}>
                                    <FolderTree size={14} />
                                    정적 예제 열기
                                </a>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 로그인 후 기능 */}
                <section className="px-4 sm:px-6 py-7" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-[17px] font-bold mb-1">로그인 후 기능</h2>
                    <p className="text-[13px] mb-3" style={{ color: 'var(--text-muted)' }}>
                        아래 기능은 계정과 서버 데이터가 필요해 이 공개 데모에는 넣지 않았습니다.
                    </p>
                    <ul className="m-0 mb-4 p-0 list-none grid gap-1.5 sm:grid-cols-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                        {LOGIN_FEATURES.map(text => (
                            <li key={text} className="flex items-start gap-2">
                                <Lock size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--text-faint)' }} />
                                <span>{text}</span>
                            </li>
                        ))}
                    </ul>
                    <Link href="/login" className={btnBase} style={btnLine}>
                        <LogIn size={14} />
                        로그인
                    </Link>
                </section>

                <footer className="flex flex-wrap gap-x-5 gap-y-1 px-4 sm:px-6 py-4 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                    <span>배경지도: 브이월드(국토교통부) / © OpenStreetMap contributors</span>
                    <span>필지·건물·시설·바람은 <b>가상 데이터</b></span>
                    <span>© gitaey</span>
                </footer>
            </div>
        </div>
    )
}

interface WayCardProps {
    n: number
    title: string
    who: string
    code: string
    children: React.ReactNode
}

function WayCard({ n, title, who, code, children }: WayCardProps) {
    return (
        <div className="flex flex-col gap-2.5 min-w-0 rounded-xl p-3.5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>{n}</span>
                <b className="text-sm">{title}</b>
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{who}</div>
            <CodeBlock code={code} />
            <div className="flex flex-wrap gap-1.5">{children}</div>
        </div>
    )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
    return (
        <div className="flex gap-2.5">
            <span className="flex items-center justify-center w-5 h-5 rounded-full text-[11px] shrink-0" style={{ background: 'var(--text-primary)', color: 'var(--bg-page)' }}>{n}</span>
            <span>{children}</span>
        </div>
    )
}
