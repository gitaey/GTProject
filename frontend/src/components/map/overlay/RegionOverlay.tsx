'use client'

import { useRegionName } from '@/hooks/map/useRegionName'
import Map from 'ol/Map'
import { MapPin } from 'lucide-react'

interface RegionOverlayProps {
    map: Map | null
}

export default function RegionOverlay({ map }: RegionOverlayProps) {
    const region = useRegionName(map)

    if (!region) return null

    return (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md border border-gray-100 text-sm font-medium text-gray-800 whitespace-nowrap">
                <MapPin size={13} className="text-orange-500 flex-shrink-0" />
                {region}
            </div>
        </div>
    )
}
