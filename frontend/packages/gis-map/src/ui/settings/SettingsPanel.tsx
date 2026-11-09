'use client'

// 설정 패널(네비 아래 '설정'): 카드 3장 — 화면 테마 · 시작 화면 · 데이터 기준 정보. 모양은 기타 패널의 도구 카드 톤(gm-settings* CSS).
// 카드는 그 기능을 쓸 수 있을 때만 보인다: 테마 = options.theme !== false, 시작 화면 = 소스가 있고 서버가 이 기능을 알며(404 아님) 엔진이 지도를 만든 경우,
// 데이터 기준 = sources.dataInfo가 있거나 호스트가 정적 항목을 준 경우. 화면 분할 중에도 "대상 지도" 탭은 없다(설정은 화면 전체에 걸린다 — SidePanel scope 'shell').
// 처음에는 보이는 첫 카드만 펼친다. 패널을 열기만 해서는 요청을 보내지 않는다(시작 화면은 엔진이 열 때 이미 읽은 값을 쓰고, 데이터 기준은 카드를 펼칠 때).
import { SunMoon } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import type { GisMapAppearance } from '../../core'
import type { StartViewState } from '../../core'
import { useGisMap, useGisMapSplit, useStoreValue } from '../../react'
import SettingsCard from './SettingsCard'
import ThemeCard from './ThemeCard'
import StartViewCard from './StartViewCard'
import DataInfoCard from './DataInfoCard'
import type { MapShellSettingsOptions } from '../shell/types'

export interface SettingsPanelProps {
    options: Readonly<MapShellSettingsOptions>
    theme: GisMapAppearance
    onThemeChange: (value: GisMapAppearance) => void
}

const selectStartViewStatus = (s: StartViewState): StartViewState['status'] => s.status

type CardId = 'theme' | 'startView' | 'dataInfo'

export default function SettingsPanel({ options, theme, onThemeChange }: SettingsPanelProps) {
    const active = useGisMap()
    const split = useGisMapSplit()
    // 시작 화면 저장소 상태는 1번(기본) 지도가 가진다. 분할 Provider 밖이면 지금 지도가 곧 1번
    const first = (split && split.panes[0]) || active

    const showTheme = options.theme !== false
    const sources = first ? first.sources : null
    // 서버가 404로 답하면(store.status 'unsupported') 카드가 사라진다 — 기본 펼침도 그 카드를 건너뛰어 다음 카드로 간다
    const startViewStatus = useStoreValue(first?.startView.store, selectStartViewStatus, 'unsupported')
    const showStartView = options.startView !== false && !!first && first.owned && !!sources?.startView && startViewStatus !== 'unsupported'
    const staticItems = options.staticDataInfo
    const showDataInfo = options.dataInfo !== false && (!!sources?.dataInfo || (!!staticItems && staticItems.length > 0))

    // 처음 펼칠 카드: 보이는 첫 카드. 사용자가 한 번이라도 누르면 그 뒤로는 사용자 선택을 따른다(여러 장을 같이 펼칠 수 있다).
    // 엔진이 아직 없어 카드가 늦게 나타나도(패널이 먼저 열린 채 돌아온 경우) 첫 카드가 펼쳐지도록 렌더마다 기본값을 계산한다
    const [chosen, setChosen] = useState<Readonly<Record<CardId, boolean>> | null>(null)
    const defaults: Record<CardId, boolean> = {
        theme: showTheme,
        startView: !showTheme && showStartView,
        dataInfo: !showTheme && !showStartView && showDataInfo,
    }
    const openIds = chosen ?? defaults
    const defaultsRef = useRef(defaults)
    defaultsRef.current = defaults
    const toggle = useCallback((id: CardId) => setChosen(prev => ({ ...(prev ?? defaultsRef.current), [id]: !(prev ?? defaultsRef.current)[id] })), [])
    const toggleTheme = useCallback(() => toggle('theme'), [toggle])
    const toggleStartView = useCallback(() => toggle('startView'), [toggle])
    const toggleDataInfo = useCallback(() => toggle('dataInfo'), [toggle])

    return (
        <div className="gm-panel gm-settings">
            <div className="gm-panel__header">
                <span className="gm-panel__title">{options.label ?? '설정'}</span>
            </div>
            <div className="gm-settings__list">
                {showTheme && (
                    <SettingsCard id="theme" icon={SunMoon} title="화면 테마" description="지도 화면을 밝게 또는 어둡게" open={openIds.theme} onToggle={toggleTheme}>
                        <ThemeCard value={theme} onChange={onThemeChange} />
                    </SettingsCard>
                )}
                {showStartView && first && <StartViewCard map={first} open={openIds.startView} onToggle={toggleStartView} />}
                {showDataInfo && (
                    <DataInfoCard source={sources?.dataInfo} staticItems={staticItems} open={openIds.dataInfo} onToggle={toggleDataInfo} />
                )}
                {options.children}
            </div>
        </div>
    )
}
