'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Component, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTheme } from 'next-themes'
import {
    Columns2,
    Image as ImageIcon,
    Layers,
    Map as MapIcon,
    MapPin,
    Printer,
    Scan,
    Upload,
    Wind,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LayerTree } from '@gtp/gis-map/core'
import MapIllustration from './MapIllustration'
import type { PreviewStatus } from './MapPreview'
import { buildPreviewTree } from './previewTree'
import type { PreviewTheme } from './previewTree'
import type { ResourceStatus } from './useResource'

// 라이브 미리보기는 OpenLayers 엔진을 끌어오므로 따로 불러온다(대시보드 첫 번들에 안 들어간다). PreviewStatus는 타입이라 번들과 무관
const MapPreview = dynamic(() => import('./MapPreview'), { ssr: false })

/** 미리보기(동적 불러오기 포함)가 던진 오류를 잡아 정적 그림으로 되돌린다 — 오류가 페이지 전체를 무너뜨리지 않게 */
interface PreviewBoundaryProps {
    onError: () => void
    children: ReactNode
}

class PreviewBoundary extends Component<PreviewBoundaryProps, { failed: boolean }> {
    state = { failed: false }

    static getDerivedStateFromError(): { failed: boolean } {
        return { failed: true }
    }

    componentDidCatch(): void {
        this.props.onError()
    }

    render(): ReactNode {
        return this.state.failed ? null : this.props.children
    }
}

interface FeatureChip {
    icon: LucideIcon
    label: string
}

const FEATURE_CHIPS: readonly FeatureChip[] = [
    { icon: Layers, label: '레이어 트리' },
    { icon: Upload, label: '나만의지도' },
    { icon: ImageIcon, label: 'GeoTIFF' },
    { icon: Wind, label: '바람길' },
    { icon: MapPin, label: '필지 정보' },
    { icon: Scan, label: '영역 분석' },
    { icon: Columns2, label: '화면 분할' },
    { icon: Printer, label: '지도 출력' },
]

export interface MapHeroProps {
    /** 레이어 트리 불러오기 상태 — 불러오는 중·실패일 때 안내 글자를 보여 준다 */
    treeStatus: ResourceStatus
    /** 레이어 트리(성공했을 때만). 라이브 미리보기가 이 값에서 배경지도 하나를 고른다 */
    tree: LayerTree | null
}

/** 지도 칸 위쪽 글자 판의 반투명 배경(--bg-card 위에 투명도) — lg 이상(지도 위에 덮을 때)만 */
const PANEL_OVERLAY =
    'lg:absolute lg:bottom-4 lg:left-4 lg:max-w-[min(400px,56%)] lg:pointer-events-none lg:rounded-xl lg:p-[14px_16px] ' +
    'lg:border lg:border-[color:var(--border)] lg:bg-[color-mix(in_srgb,var(--bg-card)_88%,transparent)] lg:backdrop-blur-sm'

const BADGE =
    'absolute top-3 flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] ' +
    'border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--bg-card)_88%,transparent)]'

export default function MapHero({ treeStatus, tree }: MapHeroProps) {
    const { resolvedTheme } = useTheme()
    // 테마를 알기 전(마운트 직후)에는 미리보기를 만들지 않는다 — 라이트로 만들었다가 바로 다크로 바꾸면 엔진을 두 번 만든다
    const theme: PreviewTheme | null = resolvedTheme === 'dark' ? 'dark' : resolvedTheme === 'light' ? 'light' : null
    const previewTree = useMemo(() => (tree && theme ? buildPreviewTree(tree, theme) : null), [tree, theme])
    const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('loading')
    /** lg 이상에서 지도 위에 얹히는 글자 판 — 미리보기가 이 판이 안 덮는 곳 가운데에 세종이 오게 시점을 옮긴다 */
    const panelRef = useRef<HTMLDivElement>(null)
    // 테마가 바뀌면 엔진을 새로 만든다 → 이전 실패 표시는 지운다
    useEffect(() => setPreviewStatus('loading'), [theme])

    const treeWithoutBase = tree != null && theme != null && previewTree == null
    const failedNotice = treeStatus === 'error' || treeWithoutBase || previewStatus === 'failed'

    return (
        <section
            aria-labelledby="map-hero-title"
            className="relative flex flex-col overflow-hidden rounded-xl lg:block lg:h-[340px] xl:h-[360px] min-[1400px]:h-[380px]"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
            {/* 지도 칸: lg 미만은 위쪽 220~260px, lg 이상은 카드 전체 */}
            <div className="relative h-[220px] shrink-0 sm:h-[260px] lg:absolute lg:inset-0 lg:h-auto">
                <div aria-hidden="true" className="absolute inset-0" data-hero-map="">
                    {/* 정적 그림은 늘 깔아 둔다(불러오는 중·실패 대체). 라이브 지도는 그림이 끝나면(ready) 위에서 서서히 나타난다 */}
                    <MapIllustration />
                    {previewTree && theme && (
                        <div
                            className="pointer-events-none absolute inset-0 transition-opacity duration-300"
                            style={{ opacity: previewStatus === 'ready' ? 1 : 0 }}
                            data-hero-live=""
                            data-preview-status={previewStatus}
                        >
                            <PreviewBoundary key={theme} onError={() => setPreviewStatus('failed')}>
                                <MapPreview previewTree={previewTree} theme={theme} onStatus={setPreviewStatus} coverRef={panelRef} />
                            </PreviewBoundary>
                        </div>
                    )}
                    {previewStatus === 'ready' && previewTree && (
                        <span
                            className="absolute bottom-1.5 right-2 rounded px-1 text-[10px]"
                            style={{
                                color: 'var(--text-secondary)',
                                background: 'color-mix(in srgb, var(--bg-card) 75%, transparent)',
                            }}
                            data-hero-copyright=""
                        >
                            배경지도: 브이월드(국토교통부)
                        </span>
                    )}
                </div>
                <Link
                    href="/map"
                    aria-label="지도 열기 — 전체 지도 화면으로 이동"
                    className="absolute inset-0 focus-visible:outline focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-[color:var(--accent)]"
                />
                {treeStatus === 'loading' && (
                    <span className={`${BADGE} left-3`} style={{ color: 'var(--text-secondary)' }}>
                        <span
                            aria-hidden="true"
                            className="h-[7px] w-[7px] animate-pulse rounded-full"
                            style={{ background: 'var(--text-faint)' }}
                        />
                        지도를 불러오는 중…
                    </span>
                )}
                {failedNotice && (
                    <span className={`${BADGE} right-3`} style={{ color: 'var(--text-muted)' }} role="status">
                        지도 미리보기를 불러오지 못했습니다
                    </span>
                )}
            </div>

            <div ref={panelRef} data-hero-panel="" className={`px-4 pb-4 pt-3.5 ${PANEL_OVERLAY}`}>
                <div className="text-[10.5px] font-semibold tracking-[0.06em] lg:text-[11px]" style={{ color: 'var(--accent)' }}>
                    SIS-MAP · OPENLAYERS
                </div>
                <h3 id="map-hero-title" className="mb-1 mt-0.5 text-[19px] font-bold lg:text-[20px]" style={{ color: 'var(--text-primary)' }}>
                    이식형 GIS 지도
                </h3>
                <p className="mb-2.5 text-[12.5px] lg:mb-2 lg:text-[13px]" style={{ color: 'var(--text-muted)' }}>
                    React·JSP·기존 OpenLayers 지도에 그대로 붙여 쓰는 지도 모듈
                </p>
                <ul
                    aria-label="지도 기능"
                    className="-mx-4 mb-3 flex flex-nowrap gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 lg:mb-2.5 lg:gap-1"
                >
                    {FEATURE_CHIPS.map(({ icon: Icon, label }) => (
                        <li
                            key={label}
                            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px]"
                            style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <Icon size={12} aria-hidden="true" style={{ color: 'var(--accent)' }} />
                            {label}
                        </li>
                    ))}
                </ul>
                <Link
                    href="/map"
                    className="flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)] lg:pointer-events-auto lg:inline-flex"
                    style={{ background: 'var(--accent)' }}
                >
                    <MapIcon size={15} aria-hidden="true" />
                    지도 열기
                </Link>
            </div>
        </section>
    )
}
