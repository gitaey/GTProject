import { Hash, X } from 'lucide-react'

interface TagIndexProps {
    tags: string[]
    activeTag: string
    showReset: boolean
    onSelect: (tag: string) => void
    onReset: () => void
}

export default function TagIndex({ tags, activeTag, showReset, onSelect, onReset }: TagIndexProps) {
    return (
        <section className="blog-tagidx" aria-label="태그">
            <h2>
                <Hash size={14} aria-hidden="true" />
                태그
            </h2>
            <div>
                {tags.map((tag) => (
                    <button
                        key={tag}
                        type="button"
                        className="blog-tagbtn"
                        aria-pressed={activeTag === tag}
                        onClick={() => onSelect(tag)}
                    >
                        #{tag}
                    </button>
                ))}
                {showReset && (
                    <button type="button" className="blog-tagbtn" onClick={onReset}>
                        <X size={14} aria-hidden="true" />
                        필터 해제
                    </button>
                )}
            </div>
        </section>
    )
}
