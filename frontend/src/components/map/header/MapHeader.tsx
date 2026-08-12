'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, MapPin, Navigation, X } from 'lucide-react'
import { useLayerStore, BasemapMode } from '@/stores/map/layerStore'
import { useAuthStore } from '@/stores/authStore'
import { useMapStore, highlightParcel } from '@/stores/map/mapStore'

const BASEMAP_OPTIONS: { value: BasemapMode; label: string }[] = [
    { value: 'normal',   label: '일반' },
    { value: 'satellite', label: '위성' },
    { value: 'none',     label: '없음' },
]

interface SearchItem {
    id: string
    title: string
    category: string
    address: { road: string; parcel: string }
    point: { lon: number; lat: number }
}

function BasemapSwitcher() {
    const basemapMode = useLayerStore(s => s.basemapMode)
    const setBasemapMode = useLayerStore(s => s.setBasemapMode)

    return (
        <div className="flex items-center p-0.5 rounded-lg"
            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
            {BASEMAP_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setBasemapMode(opt.value)}
                    className="px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer"
                    style={{
                        background: basemapMode === opt.value ? '#F26722' : 'transparent',
                        color: basemapMode === opt.value ? '#fff' : '#64748b',
                        fontWeight: basemapMode === opt.value ? 600 : 400,
                    }}>
                    {opt.label}
                </button>
            ))}
        </div>
    )
}

function SearchBar() {
    const flyTo = useMapStore(s => s.flyTo)
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<SearchItem[]>([])
    const [loading, setLoading] = useState(false)
    const [open, setOpen] = useState(false)
    const [focusedIndex, setFocusedIndex] = useState(-1)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const wrapRef = useRef<HTMLDivElement>(null)
    const listRef = useRef<HTMLDivElement>(null)

    useEffect(() => { setFocusedIndex(-1) }, [results])

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const search = useCallback(async (q: string) => {
        if (!q.trim()) { setResults([]); setOpen(false); return }
        setLoading(true)
        try {
            const res = await fetch(`/proxy/vworld/search?query=${encodeURIComponent(q)}&type=all&size=8`)
            const json = await res.json()
            setResults(json.items ?? [])
            setOpen(true)
        } finally {
            setLoading(false)
        }
    }, [])

    const handleChange = (value: string) => {
        setQuery(value)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => search(value), 350)
    }

    const handleSelect = (item: SearchItem) => {
        const label = item.title || displayAddress(item)
        flyTo({ lon: item.point.lon, lat: item.point.lat, zoom: 16 })
        highlightParcel(item.point.lon, item.point.lat, label)
        setOpen(false)
        setFocusedIndex(-1)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open || results.length === 0) {
            if (e.key === 'Enter') search(query)
            return
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setFocusedIndex(i => {
                const next = Math.min(i + 1, results.length - 1)
                listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
                return next
            })
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setFocusedIndex(i => {
                const next = Math.max(i - 1, 0)
                listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
                return next
            })
        } else if (e.key === 'Enter') {
            if (focusedIndex >= 0 && results[focusedIndex]) {
                handleSelect(results[focusedIndex])
            } else {
                search(query)
            }
        } else if (e.key === 'Escape') {
            setOpen(false)
            setFocusedIndex(-1)
        }
    }

    const handleClear = () => {
        setQuery('')
        setResults([])
        setOpen(false)
        setFocusedIndex(-1)
    }

    const displayAddress = (item: SearchItem) =>
        item.address.road || item.address.parcel || item.category || ''

    return (
        <div ref={wrapRef} className="relative flex-1 max-w-xs ml-5">
            <div className="relative flex items-center">
                <Search size={13} className="absolute left-3 text-gray-400 pointer-events-none" />
                <input
                    type="text"
                    value={query}
                    onChange={e => handleChange(e.target.value)}
                    onFocus={() => results.length > 0 && setOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="통합 검색"
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none
                        focus:border-orange-400 focus:ring-2 focus:ring-orange-50 transition-all"
                />
                {query && (
                    <button onClick={handleClear}
                        className="absolute right-2 text-gray-300 hover:text-gray-500 cursor-pointer">
                        <X size={12} />
                    </button>
                )}
            </div>

            {open && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50"
                    style={{ maxHeight: '320px', overflowY: 'auto' }}>
                    {loading ? (
                        <div className="flex items-center justify-center py-6 gap-2 text-xs text-gray-400">
                            <div className="w-3 h-3 border border-orange-400 border-t-transparent rounded-full animate-spin" />
                            검색 중...
                        </div>
                    ) : results.length === 0 ? (
                        <div className="py-6 text-center text-xs text-gray-400">검색 결과가 없습니다.</div>
                    ) : (
                        <div ref={listRef}>
                            {results.map((item, index) => (
                                <button key={item.id || item.title}
                                    onClick={() => handleSelect(item)}
                                    onMouseEnter={() => setFocusedIndex(index)}
                                    className="w-full flex items-start gap-2.5 px-3 py-2.5 transition-colors cursor-pointer text-left"
                                    style={{
                                        borderBottom: '1px solid #f1f5f9',
                                        background: index === focusedIndex ? '#fff7ed' : 'transparent',
                                    }}>
                                    <div className="flex-shrink-0 mt-0.5">
                                        {item.category?.includes('주소') || item.address.road
                                            ? <Navigation size={13} className="text-orange-400" />
                                            : <MapPin size={13} className="text-orange-400" />
                                        }
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-gray-800 truncate">{item.title}</p>
                                        {displayAddress(item) && (
                                            <p className="text-[10.5px] text-gray-400 truncate mt-0.5">
                                                {displayAddress(item)}
                                            </p>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default function MapHeader() {
    const user = useAuthStore(s => s.user)

    return (
        <div className="flex items-center gap-3 h-12 px-4 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">

            {/* 로고 */}
            <div className="flex items-center gap-2 font-bold text-sm text-gray-800 whitespace-nowrap w-[282px] flex-shrink-0">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm text-white"
                    style={{ background: 'linear-gradient(135deg, #F26722 0%, #E04E0A 100%)', boxShadow: '0 2px 6px rgba(242,103,34,0.35)' }}>
                    🗺
                </div>
                SIS-Map
                <span className="text-xs font-normal text-gray-400">GIS</span>
            </div>

            {/* 검색창 */}
            <SearchBar />

            {/* 우측 액션 */}
            <div className="hidden md:flex items-center gap-3 ml-auto">
                <BasemapSwitcher />
                {user && <div className="w-px h-5 bg-gray-200" />}
                {user && (
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
                            style={{ background: '#F26722' }}>
                            {(user.nickname ?? user.userId).charAt(0).toUpperCase()}
                        </div>
                        <div className="text-left">
                            <p className="text-xs font-medium leading-none text-gray-800">
                                {user.nickname ?? user.userId}
                            </p>
                            <p className="font-mono text-[10px] mt-0.5 text-gray-400">
                                {user.roleLabel}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
