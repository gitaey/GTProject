import { NextRequest, NextResponse } from 'next/server'

const VWORLD_KEY = process.env.NEXT_PUBLIC_VWORLD_API_KEY ?? ''

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const typenames = searchParams.get('TYPENAMES') ?? ''
    const bbox = searchParams.get('BBOX') ?? ''
    const srsname = searchParams.get('SRSNAME') ?? 'EPSG:3857'

    const upstream = new URL('https://api.vworld.kr/req/wfs')
    upstream.searchParams.set('SERVICE', 'WFS')
    upstream.searchParams.set('VERSION', '2.0.0')
    upstream.searchParams.set('REQUEST', 'GetFeature')
    upstream.searchParams.set('TYPENAMES', typenames)
    upstream.searchParams.set('key', VWORLD_KEY)
    upstream.searchParams.set('BBOX', bbox)
    upstream.searchParams.set('SRSNAME', srsname)
    upstream.searchParams.set('outputFormat', 'application/json')

    const res = await fetch(upstream.toString())
    const data = await res.json()

    return NextResponse.json(data)
}
