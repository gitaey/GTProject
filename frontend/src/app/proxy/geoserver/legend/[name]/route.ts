import { NextRequest, NextResponse } from 'next/server'

const GS_URL  = process.env.GEOSERVER_URL           ?? 'https://geo.gitaey-dev.com/geoserver'
const GS_USER = process.env.GEOSERVER_ADMIN_USER     ?? 'admin'
const GS_PASS = process.env.GEOSERVER_ADMIN_PASSWORD ?? 'geoserver'
const GS_LEGEND_LAYER = process.env.GEOSERVER_LEGEND_LAYER ?? 'gtp:tl_scco_ctprvn'

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ name: string }> },
) {
    const { name } = await params
    const auth = Buffer.from(`${GS_USER}:${GS_PASS}`).toString('base64')

    const url = `${GS_URL}/ows?service=WMS&version=1.1.0&request=GetLegendGraphic&format=image/png&width=16&height=16&LAYER=${GS_LEGEND_LAYER}&STYLE=${encodeURIComponent(name)}`

    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } })
    if (!res.ok) return new NextResponse(null, { status: 502 })

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('image')) return new NextResponse(null, { status: 502 })

    const img = await res.arrayBuffer()
    return new NextResponse(img, {
        headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=3600',
        },
    })
}
