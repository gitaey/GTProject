'use client'

import { SectionHeading } from './DashboardCard'
import MapHero from './MapHero'
import MapStatsGrid from './MapStatsGrid'
import type { DashFailKey } from './sections'
import { useLayerTreeSummary } from './useLayerTreeSummary'

interface MapSectionProps {
    canManageLayers: boolean
    failKeys: ReadonlySet<DashFailKey>
}

/**
 * 위 줄 "지도" — 지도 칸 + 지도 현황 카드 4개.
 * 레이어 트리는 여기서 한 번만 받아 지도 칸(미리보기)과 레이어 카드가 나눠 쓴다.
 * 지도 권한이 있을 때만 마운트된다(없으면 이 안의 API 호출도 없다).
 */
export default function MapSection({ canManageLayers, failKeys }: MapSectionProps) {
    const layers = useLayerTreeSummary(failKeys.has('layers'))

    return (
        <section aria-labelledby="dash-map-heading" className="space-y-3">
            <SectionHeading id="dash-map-heading" title="지도" hint="로그인 사용자 권한 기준 · 미리보기는 읽기 전용" />
            <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 min-w-0 xl:col-span-7 min-[1400px]:col-span-8">
                    <MapHero treeStatus={layers.status} tree={layers.data?.tree ?? null} />
                </div>
                <div className="col-span-12 min-w-0 xl:col-span-5 min-[1400px]:col-span-4">
                    <MapStatsGrid layers={layers} canManageLayers={canManageLayers} failKeys={failKeys} />
                </div>
            </div>
        </section>
    )
}
