interface SkBoxProps {
    h: number
    w: string
    mb?: number
    mt?: number
}

function Sk({ h, w, mb = 0, mt = 0 }: SkBoxProps) {
    return <div className="blog-sk" style={{ height: h, width: w, marginBottom: mb, marginTop: mt }} />
}

const ROW_SHAPES: { title: string; line1: string; line2: string }[] = [
    { title: '72%', line1: '96%', line2: '60%' },
    { title: '58%', line1: '90%', line2: '48%' },
    { title: '66%', line1: '94%', line2: '52%' },
    { title: '62%', line1: '92%', line2: '56%' },
]

/** 목록 줄 모양 스켈레톤 4줄 */
export function ListSkeleton() {
    return (
        <ul className="blog-rows" aria-busy="true">
            <li className="blog-sr">글 목록을 불러오는 중</li>
            {ROW_SHAPES.map((s, i) => (
                <li key={i}>
                    <div className="blog-row" aria-hidden="true">
                        <div className="blog-row-date">
                            <Sk h={12} w="96px" />
                        </div>
                        <div>
                            <Sk h={12} w="40px" mt={6} />
                            <Sk h={22} w={s.title} mt={12} mb={12} />
                            <Sk h={12} w={s.line1} mb={8} />
                            <Sk h={12} w={s.line2} />
                        </div>
                    </div>
                </li>
            ))}
        </ul>
    )
}

/** 상세: 제목 2줄 + 본문 줄 */
export function ArticleSkeleton() {
    return (
        <article className="blog-article" aria-busy="true">
            <span className="blog-sr">글을 불러오는 중</span>
            <div aria-hidden="true">
                <Sk h={12} w="140px" />
                <Sk h={36} w="92%" mt={28} mb={12} />
                <Sk h={36} w="60%" mb={24} />
                <Sk h={14} w="100%" mb={10} />
                <Sk h={14} w="80%" />
                <div className="blog-rule" />
                <Sk h={12} w="100%" mb={12} />
                <Sk h={12} w="96%" mb={12} />
                <Sk h={12} w="98%" mb={12} />
                <Sk h={12} w="70%" mb={28} />
                <Sk h={12} w="100%" mb={12} />
                <Sk h={12} w="88%" />
            </div>
        </article>
    )
}
