'use client'

// 통합 검색(주소·장소). FE-5b-1: 옛 header/MapHeader.tsx 안의 함수를 파일로 뗐다(본문 동일)
import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, MapPin, Navigation, X } from 'lucide-react'
import type { AddressSearchItem } from '../../core'
import { useGisMap } from '../../react'

// 검색 결과 항목(EPSG:4326 좌표) — 코어 타입과 같은 모양
type SearchItem = AddressSearchItem

export default function SearchBar() {
    // 이동·필지 강조는 엔진(가장 가까운 GisMapProvider의 지도)에 바로 시킨다. 검색 요청은 엔진의 주소 검색 소스
    const gis = useGisMap()
    const addressSearch = gis?.sources.addressSearch
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
            // 소스가 없으면(예: 폐쇄망에서 VWorld 소스를 뺌) 결과 없음
            setResults(addressSearch ? await addressSearch.search(q, 8) : [])
            setOpen(true)
        } finally {
            setLoading(false)
        }
    }, [addressSearch])

    const handleChange = (value: string) => {
        setQuery(value)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => search(value), 350)
    }

    const handleSelect = (item: SearchItem) => {
        const label = item.title || displayAddress(item)
        gis?.flyTo({ lon: item.point.lon, lat: item.point.lat, zoom: 16 })
        gis?.parcel.highlight(item.point.lon, item.point.lat, label)
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
        <div ref={wrapRef} className="gm-search">
            <div className="gm-search__field">
                <Search size={13} className="gm-search__icon" />
                <input
                    type="text"
                    value={query}
                    onChange={e => handleChange(e.target.value)}
                    onFocus={() => results.length > 0 && setOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="통합 검색"
                    className="gm-search__input"
                />
                {query && (
                    <button onClick={handleClear}
                        className="gm-search__clear">
                        <X size={12} />
                    </button>
                )}
            </div>

            {open && (
                <div className="gm-search__dropdown"
                    style={{ maxHeight: '320px', overflowY: 'auto' }}>
                    {loading ? (
                        <div className="gm-search__loading">
                            <div className="gm-search__spinner" />
                            검색 중...
                        </div>
                    ) : results.length === 0 ? (
                        <div className="gm-search__empty">검색 결과가 없습니다.</div>
                    ) : (
                        <div ref={listRef}>
                            {results.map((item, index) => (
                                <button key={item.id || item.title}
                                    onClick={() => handleSelect(item)}
                                    onMouseEnter={() => setFocusedIndex(index)}
                                    className="gm-search__item"
                                    style={{
                                        borderBottom: '1px solid #f1f5f9',
                                        background: index === focusedIndex ? '#fff7ed' : 'transparent',
                                    }}>
                                    <div className="gm-search__item-icon">
                                        {item.category?.includes('주소') || item.address.road
                                            ? <Navigation size={13} className="gm-search__item-glyph" />
                                            : <MapPin size={13} className="gm-search__item-glyph" />
                                        }
                                    </div>
                                    <div className="gm-search__item-body">
                                        <p className="gm-search__item-title">{item.title}</p>
                                        {displayAddress(item) && (
                                            <p className="gm-search__item-addr">
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
