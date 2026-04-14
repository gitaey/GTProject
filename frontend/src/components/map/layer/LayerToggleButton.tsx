'use client'

import { useState } from 'react'
import { Layers } from 'lucide-react'
import LayerPanel from './LayerPanel'

export default function LayerToggleButton() {
    const [open, setOpen] = useState(false)

    return (
        <div className="absolute top-3 right-3 z-10">
            <div className="relative">
                <button
                    onClick={() => setOpen((prev) => !prev)}
                    title="레이어"
                    className={`w-8 h-8 rounded shadow flex items-center justify-center transition-colors
            ${open ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-100 text-gray-600'}`}
                >
                    <Layers size={14} />
                </button>
                <LayerPanel open={open} />
            </div>
        </div>
    )
}
