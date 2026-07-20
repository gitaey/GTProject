'use client'

import { useState } from 'react'
import { PenLine, Ruler, Trash2, MapPin, Spline, Pentagon, SquareDashed, Plus, Minus, CircleDot } from 'lucide-react'
import { useMapStore, MapTool } from '@/stores/map/mapStore'
import Map from 'ol/Map'

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
    const [visible, setVisible] = useState(false)
    return (
        <div className="relative" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
            {children}
            {visible && (
                <div className="absolute right-11 top-1/2 -translate-y-1/2 pointer-events-none z-50 flex items-center">
                    <div className="bg-gray-800 text-white text-xs px-2.5 py-1.5 rounded-md whitespace-nowrap shadow-md">
                        {label}
                    </div>
                    {/* 말풍선 꼬리 */}
                    <div style={{
                        width: 0, height: 0,
                        borderTop: '5px solid transparent',
                        borderBottom: '5px solid transparent',
                        borderLeft: '6px solid #1f2937',
                    }} />
                </div>
            )}
        </div>
    )
}

const DRAW_TOOLS: { id: MapTool; label: string; icon: React.ReactNode }[] = [
    { id: 'draw-point',   label: '포인트', icon: <MapPin size={15} /> },
    { id: 'draw-line',    label: '선',     icon: <Spline size={15} /> },
    { id: 'draw-polygon', label: '폴리곤', icon: <Pentagon size={15} /> },
]

const GROUP_SHADOW = { boxShadow: '0 1px 4px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.10)' }

function btnBase(active = false) {
    return `w-9 h-9 flex items-center justify-center transition-colors
        ${active
            ? 'bg-blue-50 text-blue-500'
            : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'
        }`
}

interface MapToolbarProps {
    map: Map | null
}

export default function MapToolbar({ map }: MapToolbarProps) {
    const { activeTool, setActiveTool, clearAll } = useMapStore()
    const [drawOpen, setDrawOpen] = useState(false)

    const isDrawActive = DRAW_TOOLS.some((t) => t.id === activeTool)

    function handleToolSelect(id: MapTool) {
        setActiveTool(id)
        setDrawOpen(false)
    }

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
        <div className="absolute top-4 right-3 z-10 flex flex-col gap-2">
            {/* 줌 컨트롤 */}
            <div className="flex flex-col rounded-md overflow-visible" style={GROUP_SHADOW}>
                <Tooltip label="확대">
                    <button onClick={zoomIn} className={`${btnBase()} rounded-t-md border-b border-gray-100`}>
                        <Plus size={16} strokeWidth={2} />
                    </button>
                </Tooltip>
                <Tooltip label="축소">
                    <button onClick={zoomOut} className={`${btnBase()} rounded-b-md`}>
                        <Minus size={16} strokeWidth={2} />
                    </button>
                </Tooltip>
            </div>

            {/* 도구 그룹 */}
            <div className="flex flex-col rounded-md overflow-visible" style={GROUP_SHADOW}>
                {/* 그리기 (드롭다운 유지) */}
                <Tooltip label="그리기">
                    <div className="relative">
                        <button
                            onClick={() => setDrawOpen((p) => !p)}
                            className={`${btnBase(isDrawActive)} rounded-t-md border-b border-gray-100`}
                        >
                            <PenLine size={15} />
                        </button>
                        {drawOpen && (
                            <div className="absolute right-11 top-0 bg-white rounded-md overflow-hidden flex flex-col" style={GROUP_SHADOW}>
                                {DRAW_TOOLS.map((tool) => (
                                    <button
                                        key={tool.id}
                                        onClick={() => handleToolSelect(tool.id)}
                                        className={`flex items-center gap-2 px-3 h-9 text-xs whitespace-nowrap transition-colors
                                            ${activeTool === tool.id ? 'bg-blue-50 text-blue-500' : 'text-gray-600 hover:bg-gray-50'}`}
                                    >
                                        {tool.icon}
                                        <span>{tool.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </Tooltip>

                {/* 거리측정 */}
                <Tooltip label="거리측정">
                    <button
                        onClick={() => handleToolSelect('measure-distance')}
                        className={`${btnBase(activeTool === 'measure-distance')} border-b border-gray-100`}
                    >
                        <Ruler size={15} />
                    </button>
                </Tooltip>

                {/* 면적측정 */}
                <Tooltip label="면적측정">
                    <button
                        onClick={() => handleToolSelect('measure-area')}
                        className={`${btnBase(activeTool === 'measure-area')} border-b border-gray-100`}
                    >
                        <SquareDashed size={15} />
                    </button>
                </Tooltip>

                {/* 반경검색 */}
                <Tooltip label="반경검색">
                    <button
                        onClick={() => handleToolSelect('radius-search')}
                        className={`${btnBase(activeTool === 'radius-search')} rounded-b-md`}
                    >
                        <CircleDot size={15} />
                    </button>
                </Tooltip>
            </div>

            {/* 초기화 */}
            <div className="flex flex-col rounded-md overflow-visible" style={GROUP_SHADOW}>
                <Tooltip label="전체 초기화">
                    <button
                        onClick={clearAll}
                        className="w-9 h-9 flex items-center justify-center bg-white text-gray-400 hover:bg-red-50 hover:text-red-400 transition-colors rounded-md"
                    >
                        <Trash2 size={15} />
                    </button>
                </Tooltip>
            </div>
        </div>
    )
}
