'use client'

import { useState } from 'react'
import { GIS_MAP_VERSION } from '@gtp/gis-map/core'
import { GisMapProvider } from '@gtp/gis-map/react'
import { MapShell } from '@gtp/gis-map/ui'
import { useGtpMapHost } from './_gtp/useGtpMapHost'
import { useGtpUserMenu } from './_gtp/useGtpUserMenu'
import {
    GTP_BRAND, GTP_LAYER_FLOAT, GTP_MAP_CONFIG, GTP_PANELS, GTP_SETTINGS, GTP_SPLIT,
    gtpInitialLayerFloatOpen, gtpInitialPanel, rememberGtpLayerFloat, rememberGtpPanel, setupGtpMap,
} from './_gtp/gtpMap'
import { useGtpMapTheme } from './_gtp/gtpTheme'

/*
 * 지도 모듈(packages/gis-map)은 이 프로젝트의 authStore/menuStore/환경 변수를 모른다. GTProject 전용 값은 _gtp/에만 있고
 * 여기서는 조립만 한다:
 *   - host: 인증 헤더·주소·키·현재 사용자·메뉴 권한(_gtp/useGtpMapHost)
 *   - config·setup·brand·panels: 중심좌표·브랜드 색·데이터 소스, 바람길 플러그인(1번 지도만), 로고, 네비 패널(TIFF·나만의지도·바람지도·기타)(_gtp/gtpMap)
 *   - layerFloat: 레이어는 네비가 아니라 지도 오른쪽 위 "레이어 목록" 플로팅 패널. 열림 여부는 페이지 이동 사이에만 기억(_gtp/mapSession)
 *   - split: 화면 분할(머리줄 셀렉트 — 분할 Provider는 MapShell이 만든다). 처음엔 분할 없음(_gtp/gtpMap의 GTP_SPLIT)
 *   - userMenuItems: 머리줄 사용자 메뉴의 대시보드 이동·로그아웃(_gtp/useGtpUserMenu — 패키지는 이동·로그아웃 방식을 모른다)
 *   - settings·theme: 설정 패널(화면 테마·시작 화면·데이터 기준 정보). 시작 화면 저장소는 restSources()에 자동 포함, 테마 선택은 대시보드와 따로 기억(_gtp/gtpTheme)
 *   - 떠났다 돌아올 때 이어지는 상태(열린 패널·그리기 스타일·켠 도구·반경 입력값, 바람길 제외): _gtp/mapSession
 * 지도 모듈을 다른 프로젝트로 옮길 때는 이 페이지와 _gtp/만 그 프로젝트에 맞게 새로 작성하면 된다.
 */
export default function MapPage() {
    const host = useGtpMapHost()
    const userMenuItems = useGtpUserMenu()
    const [theme, setTheme] = useGtpMapTheme()
    // 마운트 때 한 번만 읽는다(서버 렌더·새로고침 직후 = undefined → 왼쪽 패널 닫힘, 레이어 목록 열림)
    const [initialPanel] = useState(gtpInitialPanel)
    const [initialLayerFloat] = useState(gtpInitialLayerFloatOpen)

    return (
        <div style={{ width: '100%', height: '100vh' }} data-gis-map-version={GIS_MAP_VERSION}>
            <GisMapProvider host={host} config={GTP_MAP_CONFIG} setup={setupGtpMap}>
                <MapShell brand={GTP_BRAND} panels={GTP_PANELS}
                    defaultPanel={initialPanel} onPanelChange={rememberGtpPanel} userMenuItems={userMenuItems}
                    layerFloat={GTP_LAYER_FLOAT} defaultLayerFloatOpen={initialLayerFloat} onLayerFloatOpenChange={rememberGtpLayerFloat}
                    split={GTP_SPLIT} settings={GTP_SETTINGS} theme={theme} onThemeChange={setTheme} />
            </GisMapProvider>
        </div>
    )
}
