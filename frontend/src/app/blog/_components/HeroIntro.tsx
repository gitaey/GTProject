interface HeroIntroProps {
    title: string
    description: string
}

export default function HeroIntro({ title, description }: HeroIntroProps) {
    return (
        <section className="blog-hero">
            <h1>{title}</h1>
            <p>{description}</p>
        </section>
    )
}
