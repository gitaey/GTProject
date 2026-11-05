// 정적 지도 그림(SVG). 라이브 미리보기가 준비되기 전·실패했을 때 지도 칸을 채운다. 색은 전부 CSS 변수라 라이트/다크를 따라간다.

const WAVES: readonly string[] = [
    'M0 340c120-40 220 10 330-30s200-120 330-90 160 40 160 40',
    'M0 300c120-40 220 10 330-30s200-120 330-90 160 40 160 40',
    'M0 260c120-40 220 10 330-30s200-120 330-90 160 40 160 40',
    'M0 220c120-40 220 10 330-30s200-120 330-90 160 40 160 40',
]

export default function MapIllustration() {
    return (
        <svg
            viewBox="0 0 820 410"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
            className="block h-full w-full"
        >
            <rect width="820" height="410" style={{ fill: 'var(--bg-page)' }} />
            <g style={{ fill: 'none', stroke: 'var(--border)' }} strokeWidth="1.5">
                {WAVES.map((d) => (
                    <path key={d} d={d} />
                ))}
            </g>
            <g style={{ fill: 'var(--accent-bg)', stroke: 'var(--accent-border)' }} strokeWidth="2">
                <path d="M250 120l120-40 110 50-30 110-140 20-70-60z" />
                <path d="M500 150l90-30 80 60-40 90-100-20z" />
            </g>
            {/* 표시점: lg 이상에서 글자 판이 왼쪽 아래를 덮으므로 판이 안 덮는 오른쪽 위쪽 도형 안에 둔다(라이브 미리보기의 보정과 같은 쪽) */}
            <g transform="translate(590 175)">
                <circle r="18" style={{ fill: 'var(--accent)' }} opacity=".15" />
                <circle r="7" style={{ fill: 'var(--accent)' }} />
            </g>
        </svg>
    )
}
