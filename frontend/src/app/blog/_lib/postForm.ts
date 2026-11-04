import type { Post, PostFormState, PostRequest } from '@/types/post'
import { GRADIENT_PRESETS } from '@/types/post'

export function toSlug(title: string): string {
    const base = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    const suffix = Date.now().toString(36)
    return base ? `${base}-${suffix}` : `post-${suffix}`
}

export const EMPTY_FORM: PostFormState = {
    slug: '', title: '', excerpt: '', content: '',
    category: 'DEV', tags: '', gradient: GRADIENT_PRESETS[0].value,
    featured: false, status: 'PUBLISHED',
}

export function formFromPost(post: Post): PostFormState {
    return {
        slug: post.slug, title: post.title, excerpt: post.excerpt ?? '',
        content: post.content ?? '', category: post.category,
        tags: post.tags.join(', '),
        gradient: post.gradient ?? GRADIENT_PRESETS[0].value,
        featured: post.featured, status: post.status,
    }
}

export function toPostRequest(form: PostFormState): PostRequest {
    return {
        slug: form.slug, title: form.title,
        excerpt: form.excerpt || undefined,
        content: form.content || undefined,
        category: form.category,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        gradient: form.gradient || undefined,
        featured: form.featured, status: form.status,
    }
}

export function isFormDirty(initial: PostFormState, current: PostFormState): boolean {
    return (Object.keys(initial) as (keyof PostFormState)[]).some((key) => initial[key] !== current[key])
}
