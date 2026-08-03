import { NextRequest, NextResponse } from 'next/server'

const GS_URL  = process.env.GEOSERVER_URL           ?? 'https://geo.gitaey-dev.com/geoserver'
const GS_USER = process.env.GEOSERVER_ADMIN_USER     ?? 'admin'
const GS_PASS = process.env.GEOSERVER_ADMIN_PASSWORD ?? 'geoserver'

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ name: string }> },
) {
    const { name } = await params
    const auth = Buffer.from(`${GS_USER}:${GS_PASS}`).toString('base64')

    const res = await fetch(`${GS_URL}/rest/styles/${encodeURIComponent(name)}.sld`, {
        headers: { Authorization: `Basic ${auth}` },
    })
    if (!res.ok) return NextResponse.json({ error: 'style not found' }, { status: res.status })

    let sld = await res.text()

    // ?layers=lt_c_spbd 또는 ?layers=lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun 로 VWorld 레이어명 치환
    const layersParam = req.nextUrl.searchParams.get('layers')
    if (layersParam) {
        const layerNames = layersParam.split(',').map(s => s.trim()).filter(Boolean)
        const userStyleMatch = sld.match(/<(?:sld:)?UserStyle>[\s\S]*?<\/(?:sld:)?UserStyle>/)
        if (userStyleMatch) {
            const userStyle = userStyleMatch[0]
            const prefix = sld.includes('sld:') ? 'sld:' : ''
            const namedLayers = layerNames
                .map(n =>
                    `<${prefix}NamedLayer><${prefix}Name>${n}</${prefix}Name>${userStyle}</${prefix}NamedLayer>`,
                )
                .join('')
            sld = sld.replace(
                /<(?:sld:)?NamedLayer>[\s\S]*<\/(?:sld:)?NamedLayer>/,
                namedLayers,
            )
        }
    }

    return new NextResponse(sld, {
        headers: {
            'Content-Type': 'application/xml',
            'Cache-Control': 'public, max-age=300',
        },
    })
}
