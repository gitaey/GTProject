import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Noto_Serif_KR } from 'next/font/google'
import './blog.css'

/* 블로그 안에서만 쓰는 세리프(제목·대표 글·본문 소제목·인용). 다른 페이지는 이 글꼴을 받지 않는다 */
const serif = Noto_Serif_KR({
    weight: ['600', '700'],
    subsets: ['latin'],
    display: 'swap',
    preload: false,
    variable: '--font-blog-serif',
    fallback: ['AppleMyungjo', 'Batang', 'serif'],
})

export const metadata: Metadata = {
    title: '기빵 블로그',
    description: '개발 이야기, 육아 일기, 그리고 일상을 기록합니다.',
}

/* 첫 그리기 전에 저장된 테마(light/dark)를 <html data-blog-theme>에 붙여 깜빡임을 막는다. 시스템이면 속성 없음 */
const THEME_SCRIPT =
    "try{var t=localStorage.getItem('gtp-blog-theme');var e=document.documentElement;" +
    "if(t==='light'||t==='dark'){e.setAttribute('data-blog-theme',t)}else{e.removeAttribute('data-blog-theme')}}catch(_){}"

export default function BlogLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
            <div className={`${serif.variable} blog-root`}>{children}</div>
        </>
    )
}
