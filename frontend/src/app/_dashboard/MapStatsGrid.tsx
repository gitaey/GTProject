'use client'

import { Image as ImageIcon, Layers, Upload, Wind } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { apiGet, devFailLoader } from './api'
import { CardEmpty, CardError, CardSkeleton } from './CardState'
import { CardLinkItem } from './DashboardCard'
import type { CardLink } from './DashboardCard'
import { compactNumber, formatBytes, formatLayerBreakdown } from './format'
import { formatCycle, isWindStale, nextWindAttemptLabel } from './kst'
import type { DashFailKey } from './sections'
import type { LayerTreeSummary } from './useLayerTreeSummary'
import { useResource } from './useResource'
import type { Resource } from './useResource'

/* ───────── 응답 모양(쓰는 필드만) ───────── */

interface MyMapItem {
    owner: boolean
    featureCount: number
}

interface MyMapQuotaInfo {
    maxLayers: number
    coverage: {
        parcelVersion: string | null
        sidoCodes: string[]
    }
}

interface GeoTiffItem {
    status: string
    fileSize: number | null
}

interface WindFrame {
    forecastHour: number
    cycleDate?: string
    cycleHour?: number
}

const WIND_TIMEOUT_MS = 3000

/** 모듈 함수로 둬서 참조가 안 바뀐다(useResource가 loader 바뀜을 다시 부르기로 보므로) */
const loadMyMaps = (signal: AbortSignal): Promise<MyMapItem[]> =>
    apiGet<MyMapItem[] | null>('/api/mymap', { signal }).then((d) => d ?? [])
const loadQuota = (signal: AbortSignal): Promise<MyMapQuotaInfo> => apiGet<MyMapQuotaInfo>('/api/mymap/quota', { signal })
const loadGeoTiffs = (signal: AbortSignal): Promise<GeoTiffItem[]> =>
    apiGet<GeoTiffItem[] | null>('/api/geotiff', { signal }).then((d) => d ?? [])
/** 목록(메타)만 — /api/wind/latest는 절대 부르지 않는다(운영 DB 부담) */
const loadWindFrames = (signal: AbortSignal): Promise<WindFrame[]> =>
    apiGet<WindFrame[] | null>('/api/wind/frames', { signal, timeoutMs: WIND_TIMEOUT_MS }).then((d) => d ?? [])

/* ───────── 공통 조각 ───────── */

interface StatTileProps {
    id: string
    icon: LucideIcon
    label: string
    link?: CardLink
    children: ReactNode
}

function StatTile({ id, icon: Icon, label, link, children }: StatTileProps) {
    const titleId = `${id}-title`
    return (
        <section
            aria-labelledby={titleId}
            className="flex h-full min-w-0 flex-col gap-1.5 rounded-[10px] px-4 py-3.5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
                    >
                        <Icon size={15} aria-hidden="true" />
                    </span>
                    <h3
                        id={titleId}
                        className="truncate text-xs font-medium"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        {label}
                    </h3>
                </div>
                {link && <CardLinkItem link={link} />}
            </div>
            {children}
        </section>
    )
}

function Big({ children }: { children: ReactNode }) {
    return (
        <p className="text-2xl font-bold leading-tight tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {children}
        </p>
    )
}

function BigUnit({ children }: { children: ReactNode }) {
    return (
        <small className="text-sm font-medium" style={{ color: 'var(--text-faint)' }}>
            {children}
        </small>
    )
}

function Sub({ children }: { children: ReactNode }) {
    return (
        <p className="text-[11.5px] leading-normal" style={{ color: 'var(--text-muted)' }}>
            {children}
        </p>
    )
}

function Sub2({ children }: { children: ReactNode }) {
    return (
        <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
            {children}
        </p>
    )
}

/* ───────── 카드 4개 ───────── */

interface LayersTileProps {
    layers: Resource<LayerTreeSummary>
    canManageLayers: boolean
}

function LayersTile({ layers, canManageLayers }: LayersTileProps) {
    const link: CardLink | undefined = canManageLayers
        ? { href: '/map-admin/layer', label: '레이어 관리', muted: true }
        : undefined
    return (
        <StatTile id="stat-layers" icon={Layers} label="레이어" link={link}>
            {layers.status === 'loading' && <CardSkeleton />}
            {layers.status === 'error' && (
                <>
                    <Big>—</Big>
                    <CardError message={layers.error ?? ''} onRetry={layers.reload} />
                </>
            )}
            {layers.status === 'success' && layers.data && (
                layers.data.summary.layerCount === 0 ? (
                    <>
                        <Big>0</Big>
                        <CardEmpty text="볼 수 있는 레이어가 없습니다" />
                    </>
                ) : (
                    <>
                        <Big>{layers.data.summary.layerCount}</Big>
                        <Sub>{formatLayerBreakdown(layers.data.summary.groupCount, layers.data.summary.entries)}</Sub>
                    </>
                )
            )}
        </StatTile>
    )
}

interface FailProps {
    failKeys: ReadonlySet<DashFailKey>
}

function MyMapTile({ failKeys }: FailProps) {
    const list = useResource<MyMapItem[]>('mymap-list', failKeys.has('mymap') ? devFailLoader : loadMyMaps)
    // 한도·적재 범위는 보조 정보 — 실패해도 카드는 유지하고 그 부분만 숨긴다
    const quota = useResource<MyMapQuotaInfo>('mymap-quota', failKeys.has('quota') ? devFailLoader : loadQuota)

    const loading = list.status === 'loading' || quota.status === 'loading'
    return (
        <StatTile id="stat-mymap" icon={Upload} label="나만의지도">
            {loading && <CardSkeleton />}
            {!loading && list.status === 'error' && (
                <>
                    <Big>—</Big>
                    <CardError message={list.error ?? ''} onRetry={list.reload} />
                </>
            )}
            {!loading && list.status === 'success' && list.data && (
                <MyMapBody items={list.data} quota={quota.status === 'success' ? quota.data : null} />
            )}
        </StatTile>
    )
}

interface MyMapBodyProps {
    items: MyMapItem[]
    quota: MyMapQuotaInfo | null
}

function MyMapBody({ items, quota }: MyMapBodyProps) {
    const owned = items.filter((i) => i.owner)
    const shared = items.length - owned.length
    const featureSum = owned.reduce((sum, i) => sum + (i.featureCount ?? 0), 0)
    const big = (
        <Big>
            {owned.length}
            {quota && <BigUnit> / {quota.maxLayers}</BigUnit>}
        </Big>
    )
    if (items.length === 0) {
        return (
            <>
                {big}
                <CardEmpty text="아직 올린 레이어가 없습니다" />
            </>
        )
    }
    const coverage = quota?.coverage
    const coverageLine = coverage
        ? [
              coverage.parcelVersion ? `필지 자료 ${coverage.parcelVersion}` : '필지 자료 준비 중',
              coverage.sidoCodes.length > 0 ? `${coverage.sidoCodes.length}개 시도` : '',
          ]
              .filter(Boolean)
              .join(' · ')
        : ''
    return (
        <>
            {big}
            <Sub>
                피처 {compactNumber(featureSum)} · 공유받음 {shared}
            </Sub>
            {coverageLine && <Sub2>{coverageLine}</Sub2>}
        </>
    )
}

function GeoTiffTile({ failKeys }: FailProps) {
    const res = useResource<GeoTiffItem[]>('geotiff', failKeys.has('geotiff') ? devFailLoader : loadGeoTiffs)
    return (
        <StatTile id="stat-geotiff" icon={ImageIcon} label="GeoTIFF">
            {res.status === 'loading' && <CardSkeleton />}
            {res.status === 'error' && (
                <>
                    <Big>—</Big>
                    <CardError message={res.error ?? ''} onRetry={res.reload} />
                </>
            )}
            {res.status === 'success' && res.data && (
                res.data.length === 0 ? (
                    <>
                        <Big>0</Big>
                        <CardEmpty text="올린 영상이 없습니다" />
                    </>
                ) : (
                    <>
                        <Big>{res.data.length}</Big>
                        <Sub>
                            처리 완료 {res.data.filter((i) => i.status === 'READY').length} ·{' '}
                            {formatBytes(res.data.reduce((sum, i) => sum + (i.fileSize ?? 0), 0))}
                        </Sub>
                    </>
                )
            )}
        </StatTile>
    )
}

/** 프레임 목록에서 가장 늦은 발표(사이클)와 그 프레임 수. 발표 정보가 없는 옛 서버 응답이면 null */
function latestCycle(frames: WindFrame[]): { cycleDate: string; cycleHour: number; frameCount: number } | null {
    let best: { cycleDate: string; cycleHour: number } | null = null
    for (const f of frames) {
        if (!f.cycleDate || typeof f.cycleHour !== 'number') continue
        const newer =
            !best || f.cycleDate > best.cycleDate || (f.cycleDate === best.cycleDate && f.cycleHour > best.cycleHour)
        if (newer) best = { cycleDate: f.cycleDate, cycleHour: f.cycleHour }
    }
    if (!best) return null
    const { cycleDate, cycleHour } = best
    const frameCount = frames.filter((f) => f.cycleDate === cycleDate && f.cycleHour === cycleHour).length
    return { cycleDate, cycleHour, frameCount }
}

function WindTile({ failKeys }: FailProps) {
    const res = useResource<WindFrame[]>('wind-frames', failKeys.has('wind') ? devFailLoader : loadWindFrames)
    return (
        <StatTile id="stat-wind" icon={Wind} label="바람 예보">
            {res.status === 'loading' && <CardSkeleton />}
            {res.status === 'error' && (
                <>
                    <Big>—</Big>
                    <CardError message={res.error ?? ''} onRetry={res.reload} />
                </>
            )}
            {res.status === 'success' && res.data && <WindBody frames={res.data} />}
        </StatTile>
    )
}

function WindBody({ frames }: { frames: WindFrame[] }) {
    if (frames.length === 0) {
        return (
            <>
                <Big>—</Big>
                <CardEmpty text="수집된 바람 자료가 없습니다" />
            </>
        )
    }
    const cycle = latestCycle(frames)
    if (!cycle) {
        return (
            <>
                <Big>—</Big>
                <Sub>발표 시각 정보가 없습니다</Sub>
            </>
        )
    }
    const now = new Date()
    const stale = isWindStale(cycle.cycleDate, cycle.cycleHour, now)
    return (
        <>
            <Big>{formatCycle(cycle.cycleDate, cycle.cycleHour)}</Big>
            <Sub>
                기상청 발표 · 예보 {cycle.frameCount}시간
                {stale && (
                    <span
                        className="ml-1.5 inline-block rounded-full px-1.5 py-px align-[1px] text-[10px]"
                        style={{
                            background: 'rgba(245, 158, 11, 0.14)',
                            color: '#d97706',
                            border: '1px solid rgba(245, 158, 11, 0.35)',
                        }}
                    >
                        갱신 지연
                    </span>
                )}
            </Sub>
            <Sub2>다음 갱신 시도 {nextWindAttemptLabel(now)}</Sub2>
        </>
    )
}

/* ───────── 묶음 ───────── */

interface MapStatsGridProps {
    layers: Resource<LayerTreeSummary>
    canManageLayers: boolean
    failKeys: ReadonlySet<DashFailKey>
}

/** 지도 현황 카드 4개 — 1440 2×2 · 1024 한 줄 4개 · 모바일 2×2 */
export default function MapStatsGrid({ layers, canManageLayers, failKeys }: MapStatsGridProps) {
    return (
        <div className="grid h-full grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-2 xl:grid-rows-2 xl:gap-4">
            <LayersTile layers={layers} canManageLayers={canManageLayers} />
            <MyMapTile failKeys={failKeys} />
            <GeoTiffTile failKeys={failKeys} />
            <WindTile failKeys={failKeys} />
        </div>
    )
}
