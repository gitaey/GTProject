'use client'

// /map-dev/dual(FE-6a 검증용, 개발 환경 전용) — 한 화면에 지도 2개(각자 GisMapProvider + MapShell)를 띄우고
// 한쪽 조작이 다른 쪽에 영향을 주지 않는지 사람이 눌러 확인한다.
//   · 위: 기준 저장 → (한쪽 지도 조작) → 비교 = 지도별로 바뀐 항목 수. 요청 수(Resource Timing)
//   · 가운데: 지도 A(왼쪽) · 지도 B(오른쪽). 같은 호스트 객체·같은 데이터 소스, 설정은 서로 다름(dualConfig)
//   · 아래: 지도별 시험 버튼 + 지금 상태 / 두 지도의 변화 기록(어느 지도에서 일어났는지 [A]/[B])
// 읽기 전용: 업로드·삭제·저장 버튼은 이 페이지의 시험 버튼에 없다(패널 안의 그런 버튼도 누르지 않는다). 바람길은 숨겼다.
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { toLonLat } from 'ol/proj'
import type { GisMap, PartialGisMapHost } from '@gtp/gis-map/core'
import { GisMapProvider, useGisMap } from '@gtp/gis-map/react'
import { MapShell } from '@gtp/gis-map/ui'
import { useGtpMapHost } from '@/app/map/_gtp/useGtpMapHost'
import { SIDE_A, SIDE_B, hideWindTool } from './dualConfig'
import type { DualSide, DualSideDef } from './dualConfig'
import { countRequests, createDevLog, diffSnapshots, snapshotOf, watchEngine } from './probe'
import type { DevLog, Snapshot } from './probe'

// ── 엔진을 페이지로 꺼내는 작은 연결부(Provider 안에서 useGisMap → 페이지 state) ──
function EngineTap({ onMap }: { onMap: (map: GisMap | null) => void }) {
    const map = useGisMap()
    useEffect(() => {
        onMap(map)
    }, [map, onMap])
    return null
}

// ── 지도 하나 ──
const DualSideView = memo(function DualSideView({ def, host, onMap }: {
    def: Readonly<DualSideDef>
    host: PartialGisMapHost
    onMap: (map: GisMap | null) => void
}) {
    // 마운트 때 한 번만 읽는다(앱 기억이 있으면 그 패널)
    const [initialPanel] = useState(def.initialPanel)
    return (
        <section data-dual-side={def.side} style={{ position: 'relative', minWidth: 0, minHeight: 0, height: '100%' }}>
            <GisMapProvider host={host} config={def.config} setup={def.setup}>
                <EngineTap onMap={onMap} />
                <MapShell brand={def.brand} panels={def.panels} defaultPanel={initialPanel} onPanelChange={def.onPanelChange}
                    statusBarProjection={def.statusBarProjection} showUser={def.showUser}
                    showMobileLayerButton={def.showMobileLayerButton} showWindLegend={false} />
            </GisMapProvider>
        </section>
    )
})

// ── 지도별 시험 버튼(전부 엔진 공개 API, 서버에 쓰는 동작 없음) ──
const DRAW_COLORS = ['#ef4444', '#22c55e', '#a855f7', '#0ea5e9'] as const

function centerLonLat(map: GisMap): [number, number] {
    const v = map.olMap.getView()
    const c = v.getCenter()
    const ll = c ? toLonLat(c, v.getProjection()) : [0, 0]
    return [ll[0], ll[1]]
}

interface ProbeAction {
    id: string
    label: string
    run: (map: GisMap, say: (text: string) => void) => void
}

const ACTIONS: readonly ProbeAction[] = Object.freeze([
    { id: 'area', label: '면적측정', run: (m: GisMap) => m.tools.activate('measure-area') },
    { id: 'distance', label: '거리측정', run: (m: GisMap) => m.tools.activate('measure-distance') },
    { id: 'radius', label: '반경 500m', run: (m: GisMap) => { m.tools.setRadiusMeters(500); m.tools.activate('radius-search') } },
    { id: 'tool-off', label: '도구 끄기', run: (m: GisMap) => m.tools.deactivate() },
    {
        id: 'color', label: '그리기 색 바꾸기', run: (m: GisMap) => {
            const cur = m.draw.store.getState().style.color.toLowerCase()
            const i = DRAW_COLORS.findIndex(c => c === cur)
            m.draw.setStyle({ color: DRAW_COLORS[(i + 1) % DRAW_COLORS.length] })
        },
    },
    {
        id: 'layer', label: '첫 레이어 켜기/끄기', run: (m: GisMap, say: (text: string) => void) => {
            const l = m.layers.allLayers().find(x => x.type !== 'XYZ')
            if (!l) { say('켤 레이어가 없다(트리가 비었거나 배경지도뿐)'); return }
            m.layers.toggleLayer(l.id)
            say(`레이어 ${l.id} '${l.name}' 토글`)
        },
    },
    {
        id: 'basemap', label: '배경지도 위성↔일반', run: (m: GisMap) => {
            m.layers.setBasemapMode(m.layers.store.getState().basemapMode === 'satellite' ? 'normal' : 'satellite')
        },
    },
    { id: 'move', label: '동쪽으로 조금 이동', run: (m: GisMap) => { const [lon, lat] = centerLonLat(m); m.flyTo({ lon: lon + 0.01, lat }) } },
    { id: 'parcel', label: '필지 강조(지도 중심)', run: (m: GisMap) => { const [lon, lat] = centerLonLat(m); m.parcel.highlight(lon, lat, '검증용 강조') } },
    { id: 'clear', label: '전체 초기화', run: (m: GisMap) => m.clearAll() },
])

/** 엔진에 변화가 있을 때마다 숫자가 1씩 오른다(지금 상태 표를 다시 그리는 신호) */
function useEngineVersion(map: GisMap | null): number {
    const [version, setVersion] = useState(0)
    useEffect(() => (map ? watchEngine(map, () => setVersion(v => v + 1)) : undefined), [map])
    return version
}

// 크기에 관한 값은 인라인 style로 고정한다(Tailwind 클래스가 없더라도 아래 칸의 높이가 늘어 지도 크기가 바뀌지 않게 —
// 지도 크기가 바뀌면 moveend → 지역명 요청 + 기록 한 줄 → 기록 칸이 늘어 지도가 또 줄어드는 고리가 생긴다)
const PROBE_STYLE = { height: 150, overflow: 'auto', minWidth: 0 } as const
const SNAP_GRID_STYLE = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 12 } as const
const SNAP_VALUE_STYLE = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const
const LOG_STYLE = { height: 112, flexShrink: 0, overflow: 'auto' } as const

function Probe({ side, map, log }: { side: DualSide; map: GisMap | null; log: DevLog }) {
    useEngineVersion(map)
    const snap = map ? snapshotOf(map) : null
    return (
        <div data-dual-probe={side} style={PROBE_STYLE} className="flex flex-col gap-1 p-2 border-t border-gray-200 bg-gray-50">
            <div className="flex flex-wrap gap-1 items-center">
                <b className="text-xs mr-1">지도 {side}</b>
                {ACTIONS.map(a => (
                    <button key={a.id} type="button" data-act={a.id} disabled={!map}
                        onClick={() => {
                            if (!map) return
                            log.push(side, `▶ ${a.label}`)
                            a.run(map, t => log.push(side, t))
                        }}
                        className="text-[11px] px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40">
                        {a.label}
                    </button>
                ))}
            </div>
            <dl style={SNAP_GRID_STYLE} className="text-[10.5px] leading-4 text-gray-700">
                {snap
                    ? Object.entries(snap).map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', gap: 4, minWidth: 0 }} data-snap-key={k}>
                              <dt className="text-gray-400" style={{ flexShrink: 0 }}>{k}</dt>
                              <dd className="font-mono" style={SNAP_VALUE_STYLE} title={v}>{v}</dd>
                          </div>
                      ))
                    : <div className="text-gray-400">엔진 준비 중</div>}
            </dl>
        </div>
    )
}

function LogPanel({ log }: { log: DevLog }) {
    const entries = useSyncExternalStore(log.subscribe, log.getEntries, log.getEntries)
    return (
        <div data-dual-log="" style={LOG_STYLE} className="border-t border-gray-300 bg-white px-2 py-1 font-mono text-[10.5px] leading-4">
            {entries.length === 0 && <div className="text-gray-400">변화 기록이 여기에 쌓인다(최신이 위)</div>}
            {entries.map(e => (
                <div key={e.seq} data-log-side={e.side}
                    className={e.side === 'A' ? 'text-orange-700' : e.side === 'B' ? 'text-blue-700' : 'text-gray-700'}>
                    {e.time} [{e.side}] {e.text}
                </div>
            ))}
        </div>
    )
}

/** 엔진이 생기고 바뀔 때마다 기록에 남긴다 */
function useEngineLog(map: GisMap | null, side: DualSide, log: DevLog): void {
    useEffect(() => {
        if (!map) return
        log.push(side, `엔진 생성 ${map.id}`)
        return watchEngine(map, t => log.push(side, t))
    }, [map, side, log])
}

export default function DualMaps() {
    const gtpHost = useGtpMapHost()
    // 두 지도가 같은 호스트 객체를 쓴다(바람길 도구만 막음). gtpHost가 바뀔 때만 새 객체
    const host = useMemo(() => hideWindTool(gtpHost), [gtpHost])
    // 기록 저장소는 페이지마다 하나(참조 고정)
    const [log] = useState(createDevLog)
    const [mapA, setMapA] = useState<GisMap | null>(null)
    const [mapB, setMapB] = useState<GisMap | null>(null)
    useEngineLog(mapA, 'A', log)
    useEngineLog(mapB, 'B', log)

    const baseline = useRef<{ A: Snapshot; B: Snapshot } | null>(null)
    const [summary, setSummary] = useState('기준을 저장한 뒤 한쪽 지도만 조작하고 [비교]를 누른다')

    const saveBaseline = useCallback(() => {
        if (!mapA || !mapB) return
        baseline.current = { A: snapshotOf(mapA), B: snapshotOf(mapB) }
        log.push('비교', '기준 저장')
        setSummary('기준 저장됨 — 이제 한쪽 지도만 조작하고 [비교]')
    }, [mapA, mapB, log])

    const compare = useCallback(() => {
        const base = baseline.current
        if (!mapA || !mapB || !base) {
            setSummary('먼저 [기준 저장]')
            return
        }
        const dA = diffSnapshots(base.A, snapshotOf(mapA))
        const dB = diffSnapshots(base.B, snapshotOf(mapB))
        dA.forEach(t => log.push('A', `바뀜 ${t}`))
        dB.forEach(t => log.push('B', `바뀜 ${t}`))
        const text = `A 바뀐 항목 ${dA.length} · B 바뀐 항목 ${dB.length}`
        log.push('비교', text)
        setSummary(text)
    }, [mapA, mapB, log])

    const showRequests = useCallback(() => {
        const counts = countRequests()
        const text = Object.entries(counts).sort().map(([k, v]) => `${k} ${v}`).join(' · ') || '없음'
        log.push('요청', text)
    }, [log])

    return (
        <div className="bg-white text-gray-800" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flexShrink: 0 }} className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-gray-300 text-xs">
                <b>지도 2개 독립 검증</b>
                <span className="text-gray-400">(개발 전용 · 읽기 전용 · 바람길 숨김)</span>
                <button type="button" data-dev="baseline" onClick={saveBaseline} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">기준 저장</button>
                <button type="button" data-dev="compare" onClick={compare} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">비교</button>
                <button type="button" data-dev="requests" onClick={showRequests} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">요청 수</button>
                <button type="button" data-dev="clear-log" onClick={log.clear} className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100">기록 지우기</button>
                <span data-dev="summary" className="font-semibold">{summary}</span>
            </div>
            <div style={{ display: 'grid', flex: '1 1 0', minHeight: 0, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 4, background: '#d1d5db' }}>
                <DualSideView def={SIDE_A} host={host} onMap={setMapA} />
                <DualSideView def={SIDE_B} host={host} onMap={setMapB} />
            </div>
            <div style={{ display: 'grid', flexShrink: 0, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 4 }}>
                <Probe side="A" map={mapA} log={log} />
                <Probe side="B" map={mapB} log={log} />
            </div>
            <LogPanel log={log} />
        </div>
    )
}
