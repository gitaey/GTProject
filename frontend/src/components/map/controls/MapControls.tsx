'use client'

import { Plus, Minus } from 'lucide-react'
import Map from 'ol/Map'

interface MapControlsProps {
    map: Map | null
}

export default function MapControls({ map }: MapControlsProps) {
    function zoomIn() {
        if (!map) return
        const view = map.getView()
        view.animate({ zoom: (view.getZoom() ?? 10) + 1, duration: 200 })
    }

    function zoomOut() {
        if (!map) return
        const view = map.getView()
        view.animate({ zoom: (view.getZoom() ?? 10) - 1, duration: 200 })
    }

    return (
        <div className="absolute bottom-8 right-3 z-10 flex flex-col shadow-md rounded-lg overflow-hidden border border-gray-200">
            <button
                onClick={zoomIn}
                className="w-9 h-9 flex items-center justify-center bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors border-b border-gray-200"
                aria-label="확대"
            >
                <Plus size={16} strokeWidth={2} />
            </button>
            <button
                onClick={zoomOut}
                className="w-9 h-9 flex items-center justify-center bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                aria-label="축소"
            >
                <Minus size={16} strokeWidth={2} />
            </button>
        </div>
    )
}
