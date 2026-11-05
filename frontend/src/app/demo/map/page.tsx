'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GIS_MAP_VERSION } from '@gtp/gis-map/core'
import { GisMapProvider, GisMapSplitProvider } from '@gtp/gis-map/react'
import '../_demo/demo.css'
import DemoBand from '../_demo/DemoBand'
import { buildDemoConfig, setupDemoMap } from '../_demo/demoConfig'
import { DEMO_HOST, DEMO_VWORLD_KEY } from '../_demo/demoHost'
import { createDemoBundle, isMobileViewport } from '../_demo/demoSources'
import DemoShell from '../_demo/DemoShell'
import DemoTour from '../_demo/tour/DemoTour'
import { TOUR_STEPS, panelOfStep, parseStepParam } from '../_demo/tour/steps'
import type { TourPanel } from '../_demo/tour/steps'
import { useIsMobile } from '../_demo/useIsMobile'

/*
 * 공개 데모 지도(/demo/map) — 로그인·백엔드 없이 샘플(가상) 데이터로 지도 기능을 써 보는 화면. 조립만 한다(GTProject /map의 app/map/page.tsx와 같은 역할):
 *   - host: 서버 없는 호스트(_demo/demoHost — /api·/proxy 주소는 일부러 없는 경로)
 *   - config·sources: 합성 샘플 한 벌(패키지 adapters/memory) + 자체 GeoServer 직접 호출(_demo/demoSources·demoConfig)
 *   - 가이드 투어(_demo/tour): 단계 12개, ?step=<id>로 시작
 *   - 화면 분할: 바깥 GisMapSplitProvider(기본 분할 없음·연동 켬). 안내 띠·투어·셸이 같은 분할 상태를 보고, 안내 띠·투어의 "활성 지도"는 지금 고른 칸이다
 * 상태는 이 페이지 메모리에만 있다(localStorage·앱 기억 없음). "데모 초기화" = 데모 한 벌을 다시 만들고 Provider key를 바꿔 엔진을 새로 만든다.
 * 서버 렌더 때는 ?step·화면 폭을 알 수 없어 빈 틀만 그리고, 마운트 뒤에 읽어 본 화면을 그린다(데이터 개수·투어 시작 단계가 서버/클라이언트에서 어긋나지 않게).
 */

interface Initial {
    step: number
    mobile: boolean
}

function DemoApp({ initial }: { initial: Initial }) {
    const mobile = useIsMobile()
    // 데모 한 벌(저장소 포함)은 한 번 만들어 state에 둔다 — 모듈 최상위가 아니라 페이지 인스턴스에 있다
    const [bundle, setBundle] = useState(() => createDemoBundle({ vworldKey: DEMO_VWORLD_KEY, mobile: initial.mobile }))
    const config = useMemo(() => buildDemoConfig(bundle), [bundle])
    const [epoch, setEpoch] = useState(0)
    const [stepIndex, setStepIndex] = useState(initial.step)
    const [tourOpen, setTourOpen] = useState(true)
    // 패널은 MapShell 로컬 상태라 key를 바꿔 다시 마운트하며 defaultPanel로 연다(엔진은 Provider에 있어 그대로)
    const [shell, setShell] = useState<{ key: number; panel: string | null }>(() => ({ key: 0, panel: panelOfStep(initial.step) }))
    const panelRef = useRef<string | null>(shell.panel)

    const openPanel = useCallback((panel: TourPanel | null) => {
        if (panelRef.current === panel) return
        panelRef.current = panel
        setShell(s => ({ key: s.key + 1, panel }))
    }, [])
    const onPanelChange = useCallback((panel: string | null) => { panelRef.current = panel }, [])
    const toggleTour = useCallback(() => setTourOpen(o => !o), [])

    const reset = useCallback(() => {
        const panel = panelOfStep(stepIndex)
        panelRef.current = panel
        setBundle(createDemoBundle({ vworldKey: DEMO_VWORLD_KEY, mobile: isMobileViewport() }))
        setShell(s => ({ key: s.key + 1, panel }))
        setEpoch(e => e + 1)
    }, [stepIndex])

    return (
        <div className="demo-root" data-gis-map-version={GIS_MAP_VERSION}>
            <GisMapProvider key={epoch} host={DEMO_HOST} config={config} setup={setupDemoMap}>
                {/* 분할 Provider가 2~4번 지도를 소유한다 — 투어가 패널을 열 때마다 셸을 다시 마운트해도 지도·레이어 상태가 산다. DOM을 만들지 않는다 */}
                <GisMapSplitProvider defaultSync>
                    <DemoBand basemap={bundle.basemap} tourOpen={tourOpen} onToggleTour={toggleTour} onReset={reset} />
                    <div className="demo-body">
                        <DemoTour steps={TOUR_STEPS} index={stepIndex} onIndexChange={setStepIndex} open={tourOpen} onOpenChange={setTourOpen}
                            mobile={mobile} openPanel={openPanel} center={bundle.demo.view.center} bigLayerId={bundle.bigLayerId} />
                        <div className="demo-stage">
                            <div className="demo-stage__fill">
                                <DemoShell key={shell.key} basemap={bundle.basemap} panel={shell.panel} onPanelChange={onPanelChange} />
                            </div>
                        </div>
                    </div>
                </GisMapSplitProvider>
            </GisMapProvider>
        </div>
    )
}

export default function DemoMapPage() {
    const [initial, setInitial] = useState<Initial | null>(null)
    useEffect(() => {
        setInitial({ step: parseStepParam(window.location.search), mobile: isMobileViewport() })
    }, [])
    if (!initial) return <div className="demo-root demo-root--loading" aria-busy="true" />
    return <DemoApp initial={initial} />
}
