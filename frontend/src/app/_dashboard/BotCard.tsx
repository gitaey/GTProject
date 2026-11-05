'use client'

import { Bot, Swords } from 'lucide-react'
import type { ReactNode } from 'react'
import { apiGet, devFailLoader } from './api'
import { CardEmpty, CardError, CardSkeleton, SkeletonBar } from './CardState'
import DashboardCard from './DashboardCard'
import { successRatePercent } from './format'
import { kstDateString } from './kst'
import { useResource } from './useResource'
import type { Resource } from './useResource'

/* ───────── 응답 모양(쓰는 필드만 — 발신자 sender는 일부러 타입에도 넣지 않는다) ───────── */

interface DailyStats {
    total: number
    successCount: number
    failCount: number
    byType: Record<string, number> | null
}

interface BotLogItem {
    id: number
    room: string | null
    command: string
    detail: string | null
    success: boolean
    /** 한국 벽시계 'YYYY-MM-DDTHH:mm:ss' — new Date()로 바꾸면 브라우저 시간대로 해석되니 문자열 그대로 자른다 */
    createdAt: string
}

interface BotLogPage {
    content: BotLogItem[]
}

interface RaidParty {
    raidName: string
    time: string | null
    members: string[]
}

const RECENT_COMMAND_COUNT = 5
const MAX_RAIDS_SHOWN = 4
const SCHEDULE_TIMEOUT_MS = 8000

/** 오늘 날짜는 호출 때마다 한국 기준으로 계산한다(UTC 날짜 버그 수정) */
const loadStats = (signal: AbortSignal): Promise<DailyStats> =>
    apiGet<DailyStats>(`/api/bot-log/stats/daily?date=${kstDateString()}`, { signal })
const loadRecent = (signal: AbortSignal): Promise<BotLogItem[]> =>
    apiGet<BotLogPage | null>(`/api/bot-log?page=0&size=${RECENT_COMMAND_COUNT}&type=COMMAND`, { signal }).then(
        (page) => page?.content ?? [],
    )
/** 구글시트를 읽어 느릴 수 있어 8초 제한 */
const loadRaids = (signal: AbortSignal): Promise<RaidParty[]> =>
    apiGet<RaidParty[] | null>('/api/schedule/today', { signal, timeoutMs: SCHEDULE_TIMEOUT_MS }).then((d) => d ?? [])

/* ───────── 조각 ───────── */

interface MiniStatProps {
    label: string
    value: string
    color?: string
    hint?: string
}

function MiniStat({ label, value, color, hint }: MiniStatProps) {
    return (
        <div className="min-w-0">
            <strong
                className="block text-lg font-bold leading-tight"
                style={{ color: color ?? 'var(--text-primary)' }}
            >
                {value}
            </strong>
            <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                {label}
                {hint && ` · ${hint}`}
            </span>
        </div>
    )
}

function SummaryRow({ stats }: { stats: Resource<DailyStats> }) {
    if (stats.status === 'loading') {
        return (
            <div aria-busy="true" className="flex gap-6">
                <span className="sr-only">불러오는 중</span>
                {[0, 1, 2].map((i) => (
                    <SkeletonBar key={i} className="h-9 w-16" />
                ))}
            </div>
        )
    }
    if (stats.status === 'error' || !stats.data) {
        return (
            <div className="space-y-2">
                <div className="flex gap-6">
                    <MiniStat label="오늘 명령" value="—" />
                    <MiniStat label="성공률" value="—" />
                    <MiniStat label="API 오류" value="—" />
                </div>
                <CardError message={stats.error ?? ''} onRetry={stats.reload} />
            </div>
        )
    }
    const d = stats.data
    const commands = d.byType?.COMMAND ?? 0
    const apiErrors = d.byType?.API_ERROR ?? 0
    const rate = successRatePercent(d.successCount, d.total)
    return (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
            <MiniStat label="오늘 명령" value={String(commands)} />
            <MiniStat
                label="성공률"
                value={rate === null ? '—' : `${rate}%`}
                color={rate === null ? undefined : '#22c55e'}
                hint={rate === null ? '기록 없음' : `${d.successCount}/${d.total}`}
            />
            <MiniStat label="API 오류" value={String(apiErrors)} color={apiErrors > 0 ? '#ef4444' : undefined} />
        </div>
    )
}

function ColumnHeading({ children }: { children: ReactNode }) {
    return (
        <h4 className="mb-2 text-[11px] font-semibold" style={{ color: 'var(--text-faint)' }}>
            {children}
        </h4>
    )
}

function RecentList({ recent }: { recent: Resource<BotLogItem[]> }) {
    if (recent.status === 'loading') return <CardSkeleton lines={4} />
    if (recent.status === 'error') return <CardError message={recent.error ?? ''} onRetry={recent.reload} />
    const logs = recent.data ?? []
    if (logs.length === 0) return <CardEmpty text="명령어 기록이 없습니다" />
    return (
        <ul className="flex flex-col gap-2.5">
            {logs.map((log) => (
                <li key={log.id} className="flex min-w-0 items-start gap-2 text-xs">
                    <span
                        aria-hidden="true"
                        className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: log.success ? '#22c55e' : '#ef4444' }}
                    />
                    <span className="sr-only">{log.success ? '성공' : '실패'}</span>
                    <div className="min-w-0">
                        {/* detail(명령 인자·실패 시 서버 예외 문구)은 화면에 내지 않는다 — 개인정보·내부 정보가 섞일 수 있다 */}
                        <p className="truncate font-mono" style={{ color: 'var(--text-primary)' }}>
                            {log.command}
                        </p>
                        <p className="truncate" style={{ color: 'var(--text-faint)' }}>
                            {[log.room, log.createdAt?.slice(11, 16)].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                </li>
            ))}
        </ul>
    )
}

function RaidList({ raids }: { raids: Resource<RaidParty[]> }) {
    if (raids.status === 'loading') return <CardSkeleton lines={3} />
    if (raids.status === 'error') return <CardError message={raids.error ?? ''} onRetry={raids.reload} />
    const parties = raids.data ?? []
    if (parties.length === 0) return <CardEmpty text="오늘 등록된 레이드가 없습니다" />
    const shown = parties.slice(0, MAX_RAIDS_SHOWN)
    const hidden = parties.length - shown.length
    return (
        <ul className="flex flex-col gap-2.5">
            {shown.map((p, i) => (
                <li key={`${p.raidName}-${i}`} className="flex min-w-0 items-start gap-2 text-xs">
                    <Swords size={14} aria-hidden="true" className="mt-px shrink-0" style={{ color: 'var(--accent)' }} />
                    <div className="min-w-0">
                        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {p.raidName}
                            {p.time && (
                                <span className="ml-1 font-normal" style={{ color: 'var(--text-faint)' }}>
                                    {p.time}
                                </span>
                            )}
                        </p>
                        <p className="truncate" style={{ color: 'var(--text-muted)' }}>
                            {(p.members ?? []).join(' · ')}
                        </p>
                    </div>
                </li>
            ))}
            {hidden > 0 && (
                <li className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    외 {hidden}건
                </li>
            )}
        </ul>
    )
}

/* ───────── 카드 ───────── */

interface BotCardProps {
    /** 개발 전용 ?dashFail=bot — 요약·최근 명령을 실패로 */
    failBot: boolean
    /** 개발 전용 ?dashFail=schedule — 오늘의 레이드를 실패로 */
    failSchedule: boolean
}

/** 기빵봇 — 요약 3숫자·최근 명령·오늘의 레이드. 세 리소스가 각자 상태를 가진다(구글시트가 느려도 앞의 둘은 먼저 뜬다) */
export default function BotCard({ failBot, failSchedule }: BotCardProps) {
    const stats = useResource<DailyStats>('bot-stats', failBot ? devFailLoader : loadStats)
    const recent = useResource<BotLogItem[]>('bot-recent', failBot ? devFailLoader : loadRecent)
    const raids = useResource<RaidParty[]>('bot-raids', failSchedule ? devFailLoader : loadRaids)

    return (
        <DashboardCard
            id="card-bot"
            title="기빵봇 · 오늘"
            icon={Bot}
            links={[{ href: '/admin/bot-log', label: '봇 로그' }]}
        >
            <div className="mb-4">
                <SummaryRow stats={stats} />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="min-w-0">
                    <ColumnHeading>최근 명령 (발신자 숨김)</ColumnHeading>
                    <RecentList recent={recent} />
                </div>
                <div className="min-w-0">
                    <ColumnHeading>오늘의 레이드</ColumnHeading>
                    <RaidList raids={raids} />
                </div>
            </div>
        </DashboardCard>
    )
}
