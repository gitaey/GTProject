'use client'

import { X } from 'lucide-react'

interface MeasureTooltipProps {
    value: string
    hint?: string
    onClose?: () => void
}

export default function MeasureTooltip({ value, hint, onClose }: MeasureTooltipProps) {
    return (
        <div className="bg-black/60 text-white text-xs px-2.5 py-1 rounded pointer-events-auto whitespace-nowrap">
            <div className="flex items-center gap-1">
                <span>{value}</span>
                {onClose && (
                    <button onClick={onClose} className="ml-1 hover:text-red-400 transition-colors">
                        <X size={10} />
                    </button>
                )}
            </div>
            {hint && (
                <div className="text-[10px] text-white/60 mt-0.5">{hint}</div>
            )}
        </div>
    )
}
