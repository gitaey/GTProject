'use client'

// 대시보드 라이브 지도 미리보기(읽기 전용). MapHero가 next/dynamic(ssr:false)으로만 불러온다 —
// 이 파일이 OpenLayers 엔진(@gtp/gis-map/core·react·adapters/memory)을 끌어오므로 일반 import 금지(대시보드 첫 번들에 딸려 온다).
//
// 서버를 부르지 않는다: 대시보드가 이미 받은 레이어 트리에서 배경지도 하나만 골라(buildPreviewTree) memorySources로 엔진에 넣는다.
// → /api/layers/*·/proxy/* 요청 0, VWorld 타일만 받는다. 주소 검색·필지·지역명·WFS 소스는 일부러 안 넣어 그 기능은 조용히 꺼져 있다.
// 위젯(셸·도구 모음·줌 단추)도 안 넣는다. 지도 위는 MapHero의 덮개 링크가 모든 포인터를 받는다.
import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { memorySources } from '@gtp/gis-map/adapters/memory'
import type { GisMap, GisMapConfig, LayerTree } from '@gtp/gis-map/core'
import { GisMapProvider, GisMapView, useGisMap } from '@gtp/gis-map/react'
import { GTP_BRAND_PRIMARY, GTP_VIEW_CENTER, GTP_VIEW_MAX_ZOOM, GTP_VIEW_MIN_ZOOM, GTP_VIEW_ZOOM } from '../map/_gtp/gtpView'
import { useGtpMapHost } from '../map/_gtp/useGtpMapHost'
import { centerForScreenPoint, freeAreaCenter } from './previewLayout'
import type { PreviewTheme } from './previewTree'

/** loading = 타일을 받는 중, ready = 그려짐(지도를 보여 줌), failed = 못 그림(정적 그림 유지 — 늦게라도 그려지면 ready로 돌아온다) */
export type PreviewStatus = 'loading' | 'ready' | 'failed'

/** 이 시간 안에 첫 그림이 안 끝나면 failed로 알린다(창이 가려져 OL이 멈춘 경우도 포함 — 보이게 되어 그려지면 ready로 복귀) */
const RENDER_TIMEOUT_MS = 8000

export interface MapPreviewProps {
    /** buildPreviewTree 결과(배경지도 하나). 이 값은 엔진을 만들 때 한 번만 읽힌다 */
    previewTree: LayerTree
    /** 바뀌면 엔진을 새로 만든다(배경지도 교체) */
    theme: PreviewTheme
    /** 상태 알림(React state setter처럼 참조가 안정적인 함수) */
    onStatus: (status: PreviewStatus) => void
    /** 지도 위에 얹히는 글자 판(lg 이상). 판이 안 덮는 곳 가운데에 세종이 오게 시점을 옮긴다. 없으면 보정 없음 */
    coverRef?: RefObject<HTMLElement | null>
}

/** 엔진 설정 — /map과 같은 중심·줌·브랜드 색(gtpView). 데이터는 메모리 소스(서버 호출 없음) */
function buildConfig(previewTree: LayerTree): Omit<GisMapConfig, 'target' | 'host'> {
    return {
        view: {
            center: [GTP_VIEW_CENTER[0], GTP_VIEW_CENTER[1]],
            zoom: GTP_VIEW_ZOOM,
            minZoom: GTP_VIEW_MIN_ZOOM,
            maxZoom: GTP_VIEW_MAX_ZOOM,
        },
        theme: { primary: GTP_BRAND_PRIMARY },
        sources: [memorySources({ tree: previewTree })],
    }
}

/** 타일 소스가 가진 이벤트 구독 메서드(ol 타입을 앱에서 따로 import하지 않으려고 필요한 모양만 적는다) */
interface TileSourceLike {
    on(type: string, listener: () => void): unknown
    un(type: string, listener: () => void): unknown
}

function asTileSource(layer: unknown): TileSourceLike | null {
    const getSource = (layer as { getSource?: () => unknown } | null)?.getSource
    if (typeof getSource !== 'function') return null
    const source = getSource.call(layer) as Partial<TileSourceLike> | null
    return source && typeof source.on === 'function' && typeof source.un === 'function' ? (source as TileSourceLike) : null
}

/**
 * 엔진이 만들어진 뒤: (1) 읽기 전용으로 만들고(드래그·휠·키보드·더블클릭 확대 interaction 전부 끔)
 * (2) 첫 그림이 끝났는지 지켜본다. 엔진을 만드는 쪽(Provider)이 effect 정리를 못 주므로(setup은 반환값 없음) 자식 effect로 둔다 —
 * 엔진이 destroy되거나 화면을 떠나면 타이머·리스너가 같이 풀린다.
 * 타일을 한 장이라도 받고 그림이 끝나야 ready다(레이어가 생기기 전에 오는 빈 rendercomplete는 무시).
 * 받은 타일이 전부 오류면 failed(VWorld 키·도메인 문제 등).
 */
function PreviewWatcher({
    onStatus,
    coverRef,
}: {
    onStatus: (status: PreviewStatus) => void
    coverRef?: RefObject<HTMLElement | null>
}) {
    const map = useGisMap()
    /** 엔진이 처음 만든 중심(세종, 뷰 좌표) — 보정은 늘 이 값에서 계산한다(같은 엔진에서 effect가 다시 돌아도 누적되지 않게) */
    const baseRef = useRef<{ map: GisMap; center: [number, number] } | null>(null)

    useEffect(() => {
        if (!map) return
        const olMap = map.olMap
        onStatus('loading')

        // 글자 판이 안 덮는 곳 가운데에 세종이 오게 중심을 옮긴다(lg 이상에서만 — lg 미만은 판이 지도 위에 안 얹힌다).
        // 칸 크기·판 크기·lg 경계가 바뀔 때마다 다시 계산한다(창 크기·사이드바 열고 닫기). 같은 기준: Tailwind lg = min-width 1024px
        const view = olMap.getView()
        if (baseRef.current?.map !== map) {
            const c = view.getCenter()
            baseRef.current = c ? { map, center: [c[0], c[1]] } : null
        }
        const lgQuery = window.matchMedia('(min-width: 1024px)')
        const applyCenter = (): void => {
            const base = baseRef.current
            const target = olMap.getTargetElement()
            const resolution = view.getResolution()
            if (!base || base.map !== map || !target || resolution === undefined) return
            olMap.updateSize()
            const rect = target.getBoundingClientRect()
            const size = { width: rect.width, height: rect.height }
            const coverEl = lgQuery.matches ? coverRef?.current : null
            const cr = coverEl ? coverEl.getBoundingClientRect() : null
            const cover = cr
                ? { left: cr.left - rect.left, top: cr.top - rect.top, right: cr.right - rect.left, bottom: cr.bottom - rect.top }
                : null
            view.setCenter(centerForScreenPoint(base.center, resolution, size, freeAreaCenter(size, cover)))
        }
        applyCenter()
        lgQuery.addEventListener('change', applyCenter)
        let resizeObserver: ResizeObserver | null = null
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(applyCenter)
            const target = olMap.getTargetElement()
            if (target) resizeObserver.observe(target)
            if (coverRef?.current) resizeObserver.observe(coverRef.current)
        }

        olMap.getInteractions().forEach(i => i.setActive(false))
        const interactions = olMap.getInteractions()
        const onInteractionAdd = (e: { element: { setActive(active: boolean): void } }): void => e.element.setActive(false)
        interactions.on('add', onInteractionAdd)

        let status: PreviewStatus = 'loading'
        let loaded = 0
        let errored = 0
        let timer: number | undefined
        const report = (next: PreviewStatus): void => {
            if (status === 'ready' || status === next) return
            status = next
            onStatus(next)
        }

        const onTileEnd = (): void => { loaded += 1 }
        const onTileError = (): void => { errored += 1 }
        const watched: TileSourceLike[] = []
        const watch = (layer: unknown): void => {
            const source = asTileSource(layer)
            if (!source || watched.includes(source)) return
            watched.push(source)
            source.on('tileloadend', onTileEnd)
            source.on('tileloaderror', onTileError)
        }
        olMap.getLayers().forEach(watch)
        const layers = olMap.getLayers()
        const onLayerAdd = (e: { element: unknown }): void => watch(e.element)
        layers.on('add', onLayerAdd)

        const onRenderComplete = (): void => {
            if (loaded > 0) report('ready')
            else if (errored > 0) report('failed')
        }
        olMap.on('rendercomplete', onRenderComplete)

        // 8초(보이는 동안만) 안에 그려지지 않으면 failed. 숨겨진 탭이면 보이게 될 때 다시 잰다
        const arm = (): void => {
            window.clearTimeout(timer)
            if (status === 'ready' || document.visibilityState === 'hidden') return
            timer = window.setTimeout(() => report('failed'), RENDER_TIMEOUT_MS)
        }
        document.addEventListener('visibilitychange', arm)
        arm()

        return () => {
            resizeObserver?.disconnect()
            lgQuery.removeEventListener('change', applyCenter)
            window.clearTimeout(timer)
            document.removeEventListener('visibilitychange', arm)
            olMap.un('rendercomplete', onRenderComplete)
            layers.un('add', onLayerAdd)
            interactions.un('add', onInteractionAdd)
            for (const source of watched) {
                source.un('tileloadend', onTileEnd)
                source.un('tileloaderror', onTileError)
            }
        }
    }, [map, onStatus, coverRef])

    return null
}

export default function MapPreview({ previewTree, theme, onStatus, coverRef }: MapPreviewProps) {
    const host = useGtpMapHost()
    const config = useMemo(() => buildConfig(previewTree), [previewTree])

    // key={theme}: 엔진 config는 처음 한 번만 읽히므로 테마(=배경지도)가 바뀌면 엔진을 새로 만든다
    return (
        <GisMapProvider key={theme} host={host} config={config}>
            <GisMapView className="gm-root absolute inset-0" />
            <PreviewWatcher onStatus={onStatus} coverRef={coverRef} />
        </GisMapProvider>
    )
}
