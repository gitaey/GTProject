'use client'

// 지도 화면 머리줄: 로고(브랜드) + 통합 검색 + (태블릿 이상) 오른쪽 영역(기본: 배경지도 전환·사용자)
// FE-5b-1: 검색(SearchBar)·배경지도(BasemapSwitcher)를 ui/search/로 뗐다. 로고 이모지 → lucide
// FE-5c: 브랜드·표시 여부를 props로(MapShell이 넘긴다). 로고 배경·사용자 원 색은 CSS 변수(--gm-primary)
import { Earth } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { useGisHost } from '../../react'
import SearchBar from '../search/SearchBar'
import BasemapSwitcher from '../search/BasemapSwitcher'
import type { MapShellBrand } from './types'

// 서버 렌더 HTML에는 사용자 영역이 없다(로그인 정보는 브라우저에서만 안다). 첫 클라이언트 렌더도 서버와 똑같이 그린 뒤에 보여 준다 → 하이드레이션 불일치 경고 방지
const subscribeNever = () => () => {}
const getHydrated = () => true
const getHydratedOnServer = () => false

/** brand를 안 넘겼을 때의 로고 영역(특정 서비스 이름이 아닌 중립 값). 서비스 이름은 호스트가 brand로 준다 */
export const DEFAULT_MAP_BRAND: Readonly<MapShellBrand> = Object.freeze({ title: 'GIS Map', logo: <Earth size={16} /> })

export interface MapHeaderProps {
    /** 로고 영역. false면 숨김. 기본 DEFAULT_MAP_BRAND */
    brand?: MapShellBrand | false
    /** 통합 검색창. 기본 true */
    showSearch?: boolean
    /** 오른쪽 영역 내용. 주면 기본 내용(배경지도 전환 + 사용자) 대신 이것을 넣는다 */
    right?: ReactNode
    /** 기본 오른쪽 영역의 배경지도 전환. 기본 true */
    showBasemapSwitcher?: boolean
    /** 기본 오른쪽 영역의 사용자 표시(host.getCurrentUser()가 있을 때). 기본 true */
    showUser?: boolean
}

export default function MapHeader({
    brand = DEFAULT_MAP_BRAND, showSearch = true, right, showBasemapSwitcher = true, showUser = true,
}: MapHeaderProps) {
    // 현재 사용자는 호스트 주입값(GisMapHost.getCurrentUser) — 호스트가 바뀌면(setHost) 다시 그린다
    const user = useGisHost().getCurrentUser()
    const hydrated = useSyncExternalStore(subscribeNever, getHydrated, getHydratedOnServer)
    const userShown = hydrated && showUser && right === undefined ? user : null

    return (
        <div className="gm-header">

            {/* 로고 */}
            {brand !== false && (
                <div className="gm-header__brand">
                    {brand.logo != null && (
                        <div className="gm-header__logo">
                            {brand.logo}
                        </div>
                    )}
                    {brand.title}
                    {brand.subtitle != null && <span className="gm-header__brand-sub">{brand.subtitle}</span>}
                </div>
            )}

            {/* 검색창 */}
            {showSearch && <SearchBar />}

            {/* 우측 액션 */}
            <div className="gm-header__actions">
                {right !== undefined ? right : (showBasemapSwitcher && <BasemapSwitcher />)}
                {userShown && showBasemapSwitcher && <div className="gm-header__divider" />}
                {userShown && (
                    <div className="gm-header__user">
                        <div className="gm-header__avatar">
                            {(userShown.nickname ?? userShown.userId).charAt(0).toUpperCase()}
                        </div>
                        <div className="gm-header__user-text">
                            <p className="gm-header__user-name">
                                {userShown.nickname ?? userShown.userId}
                            </p>
                            <p className="gm-header__user-role">
                                {userShown.roleLabel}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
