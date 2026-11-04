interface GradientMarkProps {
    gradient: string | null
}

/** 32x3 짧은 막대 — gradient가 없으면 옅은 단색 */
export default function GradientMark({ gradient }: GradientMarkProps) {
    return (
        <div
            className={`blog-gmark ${gradient ? `bg-gradient-to-r ${gradient}` : 'blog-gmark-plain'}`}
            aria-hidden="true"
        />
    )
}
