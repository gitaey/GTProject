import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const lon = searchParams.get('lon')
    const lat = searchParams.get('lat')
    const apiKey = process.env.NEXT_PUBLIC_VWORLD_API_KEY

    if (!lon || !lat) return NextResponse.json({ error: 'missing params' }, { status: 400 })

    const url = `https://api.vworld.kr/req/address?service=address&request=getAddress&point=${lon},${lat}&type=parcel&zipcode=false&simple=false&key=${apiKey}`
    const res = await fetch(url)
    const json = await res.json()

    return NextResponse.json(json)
}
