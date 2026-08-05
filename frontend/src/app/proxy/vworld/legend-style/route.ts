import { NextRequest, NextResponse } from 'next/server'

const VWORLD_KEY = process.env.NEXT_PUBLIC_VWORLD_API_KEY ?? ''
const DOMAIN = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.gitaey-dev.com'

export async function GET(req: NextRequest) {
    const layer = req.nextUrl.searchParams.get('layer') ?? ''
    if (!layer) return new NextResponse('layer required', { status: 400 })

    const url = `https://api.vworld.kr/req/image?service=image&request=GetLegendStyle&format=xml` +
        `&layer=${encodeURIComponent(layer)}&style=${encodeURIComponent(layer)}` +
        `&key=${VWORLD_KEY}&domain=${encodeURIComponent(DOMAIN)}`

    try {
        const res = await fetch(url)
        const xml = await res.text()
        return new NextResponse(xml, {
            headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' },
        })
    } catch {
        return new NextResponse('', { status: 500 })
    }
}
