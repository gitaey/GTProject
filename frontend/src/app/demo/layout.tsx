import type { Metadata } from 'next'

// 공개 데모(/demo, /demo/**) 공통 메타 — 검색엔진에 색인하지 않는다(robots.txt·sitemap.xml 도 만들지 않는다)
export const metadata: Metadata = {
    title: 'GIS 지도 모듈 데모',
    description: 'OpenLayers 지도 기능을 React·JSP·기존 ol 지도에 옮겨 쓰는 모듈의 공개 데모. 로그인 없이 샘플(가상) 데이터로 써 볼 수 있습니다.',
    robots: { index: false, follow: false },
}

export default function DemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return <>{children}</>
}
