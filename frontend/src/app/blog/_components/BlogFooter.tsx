import Link from 'next/link'
import { LayoutDashboard } from 'lucide-react'

export default function BlogFooter() {
    return (
        <footer className="blog-foot">
            <div className="blog-foot-in">
                <span>© 2026 기빵 블로그</span>
                <Link href="/">
                    <LayoutDashboard size={14} aria-hidden="true" />
                    대시보드로 돌아가기
                </Link>
            </div>
        </footer>
    )
}
