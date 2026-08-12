import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    const token = request.cookies.get('token')?.value
    const role  = request.cookies.get('role')?.value
    const { pathname } = request.nextUrl

    const isLoginPage  = pathname === '/login'
    const isMapUser    = role === 'MAP_USER'

    /* 토큰 없이 보호된 페이지 접근 → 로그인으로 리다이렉트 */
    if (!token && !isLoginPage) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    /* 이미 로그인된 상태로 로그인 페이지 접근 → 역할별 홈으로 리다이렉트 */
    if (token && isLoginPage) {
        return NextResponse.redirect(new URL(isMapUser ? '/map' : '/', request.url))
    }

    /* MAP_USER는 대시보드(/) 접근 불가 → 지도로 리다이렉트 */
    if (token && isMapUser && pathname === '/') {
        return NextResponse.redirect(new URL('/map', request.url))
    }

    return NextResponse.next()
}

export const config = {
    /* _next, api, 정적 파일, favicon 제외한 모든 경로 */
    matcher: ['/((?!_next/static|_next/image|favicon.ico|api|proxy).*)'],
}
