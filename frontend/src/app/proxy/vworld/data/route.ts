import { NextRequest, NextResponse } from 'next/server'

const VWORLD_KEY = process.env.NEXT_PUBLIC_VWORLD_API_KEY ?? ''
const VWORLD_DATA = 'https://api.vworld.kr/req/data'
const DOMAIN = process.env.NODE_ENV === 'production'
    ? 'https://gitaey-dev.com'
    : 'http://localhost:3000'

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl
    const params = new URLSearchParams(searchParams.toString())
    params.set('key', VWORLD_KEY)
    params.set('domain', DOMAIN)

    const res = await fetch(`${VWORLD_DATA}?${params}`)
    const text = await res.text()

    return new NextResponse(text, {
        headers: {
            'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
            'Cache-Control': 'no-store',
        },
    })
}
