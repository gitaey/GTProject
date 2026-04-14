'use client'

import { useState } from 'react'
import { PenLine, Ruler, Trash2, MapPin, Spline, Pentagon, SquareDashed } from 'lucide-react'
import { useMapStore, MapTool } from '@/stores/mapStore'

const DRAW_TOOLS: { id: MapTool; label: string; icon: React.ReactNode }[] = [
    { id: 'draw-point', label: '포인트', icon: <MapPin size={14} /> },
    { id: 'draw-line', label: '선', icon: <Spline size={14} /> },
    { id: 'draw-polygon', label: '폴리곤', icon: <Pentagon size={14} /> },
]

const MEASURE_TOOLS: { id: MapTool; label: string; icon: React.ReactNode }[] = [
    { id: 'measure-distance', label: '거리측정', icon: <Ruler size={14} /> },
    { id: 'measure-area', label: '면적측정', icon: <SquareDashed size={14} /> },
]

export default function MapToolbar() {
    const { activeTool, setActiveTool, clearAll } = useMapStore()
    const [openMenu, setOpenMenu] = useState<'draw' | 'measure' | null>(null)

    const isDrawActive = DRAW_TOOLS.some((t) => t.id === activeTool)
    const isMeasureActive = MEASURE_TOOLS.some((t) => t.id === activeTool)

    const handleToolSelect = (id: MapTool) => {
        setActiveTool(id)
        setOpenMenu(null)
    }

    const toggleMenu = (menu: 'draw' | 'measure') => {
        setOpenMenu((prev) => (prev === menu ? null : menu))
    }

    return (
        <div className="absolute top-12 right-3 z-10 flex flex-col gap-1">
            {/* 그리기 */}
            <div className="relative">
                <button
                    onClick={() => toggleMenu('draw')}
                    title="그리기"
                    className={`w-8 h-8 rounded shadow flex items-center justify-center transition-colors
            ${isDrawActive ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-100 text-gray-600'}`}
                >
                    <PenLine size={14} />
                </button>
                {openMenu === 'draw' && (
                    <div className="absolute right-10 top-0 bg-white rounded shadow flex flex-col overflow-hidden">
                        {DRAW_TOOLS.map((tool) => (
                            <button
                                key={tool.id}
                                onClick={() => handleToolSelect(tool.id)}
                                className={`flex items-center gap-2 px-3 h-8 text-xs whitespace-nowrap transition-colors
                  ${activeTool === tool.id ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 text-gray-600'}`}
                            >
                                {tool.icon}
                                <span>{tool.label}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* 측정 */}
            <div className="relative">
                <button
                    onClick={() => toggleMenu('measure')}
                    title="측정"
                    className={`w-8 h-8 rounded shadow flex items-center justify-center transition-colors
            ${isMeasureActive ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-100 text-gray-600'}`}
                >
                    <Ruler size={14} />
                </button>
                {openMenu === 'measure' && (
                    <div className="absolute right-10 top-0 bg-white rounded shadow flex flex-col overflow-hidden">
                        {MEASURE_TOOLS.map((tool) => (
                            <button
                                key={tool.id}
                                onClick={() => handleToolSelect(tool.id)}
                                className={`flex items-center gap-2 px-3 h-8 text-xs whitespace-nowrap transition-colors
                  ${activeTool === tool.id ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 text-gray-600'}`}
                            >
                                {tool.icon}
                                <span>{tool.label}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* 초기화 */}
            <button
                onClick={clearAll}
                title="전체 초기화"
                className="w-8 h-8 rounded shadow bg-white flex items-center justify-center hover:bg-red-50 text-gray-400 hover:text-red-400 transition-colors"
            >
                <Trash2 size={14} />
            </button>
        </div>
    )
}
