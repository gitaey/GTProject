'use client'

import { X } from 'lucide-react'

interface MeasureTooltipProps {
    value: string
    onClose?: () => void
}

export default function MeasureTooltip({ value, onClose }: MeasureTooltipProps) {
    return (
        <div className="flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded pointer-events-auto whitespace-nowrap">
            <span>{value}</span>
            {onClose && (
                <button onClick={onClose} className="ml-1 hover:text-red-400 transition-colors">
                    <X size={10} />
                </button>
            )}
        </div>
    )
}
