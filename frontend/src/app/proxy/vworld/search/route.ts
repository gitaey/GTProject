import { NextRequest, NextResponse } from 'next/server'

const VWORLD_KEY = process.env.NEXT_PUBLIC_VWORLD_API_KEY ?? ''
const VWORLD_SEARCH = 'https://api.vworld.kr/req/search'

interface SearchItem {
    id: string
    title: string
    category: string
    address: { road: string; parcel: string }
    point: { lon: number; lat: number }
}

function parseItems(json: unknown): SearchItem[] {
    const items = (json as any)?.response?.result?.items
    if (!Array.isArray(items)) return []

    return items.map((item: any) => ({
        id:       item.id    ?? '',
        title:    item.title ?? '',
        category: item.category ?? '',
        address: {
            road:   item.address?.road   ?? '',
            parcel: item.address?.parcel ?? '',
        },
        point: {
            lon: parseFloat(item.point?.x ?? '0'),
            lat: parseFloat(item.point?.y ?? '0'),
        },
    }))
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl
    const query = searchParams.get('query') ?? ''
    const page  = searchParams.get('page')  ?? '1'
    const size  = searchParams.get('size')  ?? '10'

    if (!query.trim()) return NextResponse.json({ items: [], total: 0 })

    const base = {
        service: 'search', request: 'search', version: '2.0',
        crs: 'EPSG:4326', size, page, query,
        key: VWORLD_KEY, format: 'json',
    }

    const [roadRes, parcelRes, placeRes] = await Promise.allSettled([
        fetch(`${VWORLD_SEARCH}?${new URLSearchParams({ ...base, type: 'address', category: 'road' })}`),
        fetch(`${VWORLD_SEARCH}?${new URLSearchParams({ ...base, type: 'address', category: 'parcel' })}`),
        fetch(`${VWORLD_SEARCH}?${new URLSearchParams({ ...base, type: 'place' })}`),
    ])

    const items: SearchItem[] = []

    for (const res of [roadRes, parcelRes, placeRes]) {
        if (res.status === 'fulfilled' && res.value.ok) {
            items.push(...parseItems(await res.value.json()))
        }
    }

    // id 기준 중복 제거
    const seen = new Set<string>()
    const unique = items.filter(item => {
        const key = item.id || item.title
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })

    return NextResponse.json({ items: unique, total: unique.length })
}
