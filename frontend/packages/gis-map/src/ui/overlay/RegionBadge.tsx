'use client'

// 지도 중심 지역명 배지(FE-5b-1: 옛 overlay/RegionOverlay). 조회·이동 감시는 엔진(map.region)이 하고, 이 위젯이 떠 있는 동안만 지켜본다
import { useRegionState } from '../../react'
import { MapPin } from 'lucide-react'

export default function RegionBadge() {
    const { name: region, loading } = useRegionState()

    if (!region && !loading) return null

    return (
        <div className="gm-region-badge">
            <div className="gm-region-badge__pill">
                <MapPin size={13} className="gm-region-badge__icon" />
                {loading ? (
                    <div className="gm-region-badge__skeleton">
                        <div className="gm-region-badge__shimmer" />
                    </div>
                ) : (
                    <span className="gm-region-badge__text">{region}</span>
                )}
            </div>
        </div>
    )
}
