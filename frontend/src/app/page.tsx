'use client'

import { useEffect, useMemo, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { useAuthStore } from '@/stores/authStore'
import { useMenuStore } from '@/stores/menuStore'
import BotCard from './_dashboard/BotCard'
import { DashboardNoAccess, DashboardSkeleton } from './_dashboard/CardState'
import { SectionHeading } from './_dashboard/DashboardCard'
import MapSection from './_dashboard/MapSection'
import RecentPostsCard from './_dashboard/RecentPostsCard'
import { opsGridLayout, readDevOverrides, resolveDashboardSections } from './_dashboard/sections'
import type { DashDevOverrides } from './_dashboard/sections'

/**
 * 로그인 사용자 대시보드 — 위 줄 "지도"(지도 칸 + 지도 현황), 아래 줄 "운영 현황"(기빵봇 · 최근 게시글).
 * 이 파일은 조립만 한다. 권한 계산은 sections.ts, 카드는 _dashboard/ 아래.
 */
export default function Home() {
    const user = useAuthStore((s) => s.user)
    const loaded = useMenuStore((s) => s.loaded)
    const allowedMenus = useMenuStore((s) => s.allowedMenus)

    // 개발 전용 ?dashMenus·?dashFail. null = 아직 마운트 전(서버 렌더와 첫 렌더를 똑같이 뼈대로 맞춰 hydration 불일치를 막는다)
    const [dev, setDev] = useState<DashDevOverrides | null>(null)
    useEffect(() => {
        setDev(readDevOverrides(window.location.search))
    }, [])

    const role = user?.role ?? null
    const sections = useMemo(
        () =>
            resolveDashboardSections(
                role === null ? null : { role },
                { loaded, isAllowed: (menuId: string) => allowedMenus.has(menuId) },
                dev?.menus ?? null,
            ),
        [role, loaded, allowedMenus, dev],
    )

    const ready = dev !== null && sections.ready
    const showOps = sections.bot || sections.blog
    const ops = opsGridLayout({ bot: sections.bot, blog: sections.blog })

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
                <Header title="대시보드" />
                <main className="flex-1 space-y-5 px-3 py-4 sm:p-6">
                    <h1 className="sr-only">대시보드</h1>

                    {!ready && <DashboardSkeleton />}

                    {ready && !sections.map && !showOps && <DashboardNoAccess />}

                    {ready && dev && sections.map && (
                        <MapSection canManageLayers={sections.mapLayerAdmin} failKeys={dev.fail} />
                    )}

                    {ready && dev && showOps && (
                        <section aria-labelledby="dash-ops-heading" className="space-y-3">
                            <SectionHeading id="dash-ops-heading" title="운영 현황" hint="기빵봇 · 블로그" />
                            <div className="grid grid-cols-12 gap-4">
                                {sections.bot && (
                                    <div className={`${ops.bot} min-w-0`}>
                                        <BotCard failBot={dev.fail.has('bot')} failSchedule={dev.fail.has('schedule')} />
                                    </div>
                                )}
                                {sections.blog && (
                                    <div className={`${ops.blog} min-w-0`}>
                                        <RecentPostsCard canManage={sections.blogAdmin} forceFail={dev.fail.has('posts')} />
                                    </div>
                                )}
                            </div>
                        </section>
                    )}
                </main>
            </div>
        </div>
    )
}
