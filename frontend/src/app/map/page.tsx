'use client'

import { useState } from 'react'
import { GIS_MAP_VERSION } from '@gtp/gis-map/core'
import { GisMapProvider } from '@gtp/gis-map/react'
import { MapShell } from '@gtp/gis-map/ui'
import { useGtpMapHost } from './_gtp/useGtpMapHost'
import { GTP_BRAND, GTP_MAP_CONFIG, GTP_PANELS, gtpInitialPanel, rememberGtpPanel, setupGtpMap } from './_gtp/gtpMap'

/*
 * 지도 모듈(packages/gis-map)은 이 프로젝트의 authStore/menuStore/환경 변수를 모른다. GTProject 전용 값은 _gtp/에만 있고
 * 여기서는 조립만 한다:
 *   - host: 인증 헤더·주소·키·현재 사용자·메뉴 권한(_gtp/useGtpMapHost)
 *   - config·setup·brand·panels: 중심좌표·브랜드 색·데이터 소스, 바람길 플러그인, 로고, 기본 패널 + '기타'(_gtp/gtpMap)
 *   - 떠났다 돌아올 때 이어지는 상태(열린 패널·그리기 스타일·켠 도구·반경 입력값, 바람길 제외): _gtp/mapSession
 * 지도 모듈을 다른 프로젝트로 옮길 때는 이 페이지와 _gtp/만 그 프로젝트에 맞게 새로 작성하면 된다.
 */
export default function MapPage() {
    const host = useGtpMapHost()
    // 마운트 때 한 번만 읽는다(서버 렌더·새로고침 직후 = undefined → 레이어 패널)
    const [initialPanel] = useState(gtpInitialPanel)

    return (
        <div style={{ width: '100%', height: '100vh' }} data-gis-map-version={GIS_MAP_VERSION}>
            <GisMapProvider host={host} config={GTP_MAP_CONFIG} setup={setupGtpMap}>
                <MapShell brand={GTP_BRAND} panels={GTP_PANELS}
                    defaultPanel={initialPanel} onPanelChange={rememberGtpPanel} />
            </GisMapProvider>
        </div>
    )
}
