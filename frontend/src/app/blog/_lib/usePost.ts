'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Post } from '@/types/post'
import { fetchPost } from './api'

export interface UsePostResult {
    post: Post | null
    status: 'loading' | 'ready' | 'notFound' | 'error'
    replacePost: (post: Post) => void
    reload: () => void
}

export function usePost(slug: string): UsePostResult {
    const [post, setPost] = useState<Post | null>(null)
    const [status, setStatus] = useState<UsePostResult['status']>('loading')
    const [reloadKey, setReloadKey] = useState(0)

    useEffect(() => {
        let cancelled = false
        setStatus('loading')
        fetchPost(slug)
            .then((result) => {
                if (cancelled) return
                if (result.kind === 'ok') { setPost(result.post); setStatus('ready') }
                else { setPost(null); setStatus('notFound') }
            })
            .catch((e: unknown) => {
                if (cancelled) return
                console.error(e)
                setPost(null)
                setStatus('error')
            })
        return () => { cancelled = true }
    }, [slug, reloadKey])

    const replacePost = useCallback((next: Post) => setPost(next), [])
    const reload = useCallback(() => setReloadKey((k) => k + 1), [])

    return { post, status, replacePost, reload }
}
