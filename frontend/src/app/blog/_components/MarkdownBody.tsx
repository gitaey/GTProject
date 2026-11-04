'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import type { Components } from 'react-markdown'

interface MarkdownBodyProps {
    content: string
    variant?: 'article' | 'preview'
}

/* 표는 좁은 화면에서 자기 안에서만 가로 스크롤되도록 감싼다 */
const COMPONENTS: Components = {
    table: ({ children }) => (
        <div className="blog-table-wrap">
            <table>{children}</table>
        </div>
    ),
}

/** 상세 본문·작성 미리보기 공용 마크다운 렌더러. 코드 색은 blog.css의 --blog-hl-* 변수(테마 자동 전환) */
export default function MarkdownBody({ content, variant = 'article' }: MarkdownBodyProps) {
    return (
        <div className={`blog-prose blog-prose-${variant}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight, rehypeRaw]}
                components={COMPONENTS}
            >
                {content}
            </ReactMarkdown>
        </div>
    )
}
