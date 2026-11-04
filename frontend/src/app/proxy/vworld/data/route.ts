import { NextRequest, NextResponse } from 'next/server'
import { requireLogin } from '../../_auth'

const VWORLD_KEY = process.env.NEXT_PUBLIC_VWORLD_API_KEY ?? ''
const VWORLD_DATA = 'https://api.vworld.kr/req/data'
const DOMAIN = process.env.NODE_ENV === 'production'
    ? 'https://gitaey-dev.com'
    : 'http://localhost:3000'

/**
 * 넘겨 주는 `data`(레이어 이름) 허용 목록 — 대소문자 무시. 열린 프록시로 두면 아무 레이어나 키 한도를 쓸 수 있어 막는다.
 * 근거: 필지 강조(LP_PA_CBND_BUBUN)·지도 레이어 트리·영역 분석이 쓰는 이름(_workspace/area-stats/02b_probe.md).
 * 트리에 다른 VWorld 레이어를 올려 영역 분석에 쓰려면 이 식에 이름을 더한다.
 */
const ALLOWED_DATA = /^(LP_PA_CBND_(BUBUN|BONBUN)|LT_C_SPBD|LT_C_UQ\d{3}|LT_C_AD(SIDO|SIGG|EMD|RI)_INFO)$/i

/** 그대로 전달하는 파라미터(그 밖의 것은 버린다 — key·domain은 아래에서 서버가 붙인다) */
const ALLOWED_PARAMS = ['service', 'version', 'request', 'format', 'size', 'page', 'crs', 'data', 'geomFilter', 'geometry', 'attribute'] as const

/** VWorld Data API 한 쪽 최대 건수 */
const MAX_SIZE = 1000
/** geomFilter 최대 길이(영역 분석은 꼭짓점 200개 이하 ≈ 5 KB) */
const MAX_FILTER_LENGTH = 20000

/** 거절 응답 — 본문 모양을 VWorld 오류(response.status = ERROR)와 같게 둬 지도 패키지의 기존 판정(status !== 'OK')이 그대로 동작한다 */
function reject(status: number, code: string, text: string): NextResponse {
    return NextResponse.json({ response: { status: 'ERROR', error: { level: '1', code, text } } }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(req: NextRequest) {
    const denied = await requireLogin(req)
    if (denied) return denied

    const { searchParams } = req.nextUrl
    const data = searchParams.get('data') ?? ''
    if (!ALLOWED_DATA.test(data)) return reject(400, 'PROXY_REJECTED', '허용 목록에 없는 data 레이어입니다.')

    const size = searchParams.get('size')
    if (size !== null && !(/^\d+$/.test(size) && Number(size) >= 1 && Number(size) <= MAX_SIZE)) {
        return reject(400, 'PROXY_REJECTED', 'size는 1~' + MAX_SIZE + ' 범위여야 합니다.')
    }
    const page = searchParams.get('page')
    if (page !== null && !/^\d{1,6}$/.test(page)) return reject(400, 'PROXY_REJECTED', 'page 값이 올바르지 않습니다.')
    const filter = searchParams.get('geomFilter')
    if (filter !== null && filter.length > MAX_FILTER_LENGTH) return reject(400, 'PROXY_REJECTED', 'geomFilter가 너무 깁니다.')

    const params = new URLSearchParams()
    for (const name of ALLOWED_PARAMS) {
        const v = searchParams.get(name)
        if (v !== null) params.set(name, v)
    }
    params.set('key', VWORLD_KEY)
    params.set('domain', DOMAIN)

    let res: Response
    try {
        res = await fetch(`${VWORLD_DATA}?${params}`)
    } catch {
        return reject(502, 'PROXY_UPSTREAM', 'VWorld에 연결하지 못했습니다.')
    }
    const text = await res.text()

    // 업스트림 상태를 그대로 돌려준다(오류를 200으로 감추지 않는다). VWorld가 본문 status로 알리는 오류는 VWorld 계약 그대로 전달
    return new NextResponse(text, {
        status: res.status,
        headers: {
            'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
            'Cache-Control': 'no-store',
        },
    })
}
