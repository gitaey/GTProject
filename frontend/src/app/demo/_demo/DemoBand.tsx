'use client'

// 화면 맨 위 안내 띠 — "가상 데이터·저장 안 됨"을 항상 알리고, 배경지도(VWorld ↔ OSM)·가이드 열기/접기·데모 초기화·소개/로그인 링크를 둔다.
// 모바일(768px 미만)은 짧은 문구 + 초기화만 남긴다(나머지는 머리줄 사용자 메뉴·CSS로 숨김).
import { PanelLeft, RotateCcw } from 'lucide-react'
import type { DemoBasemap } from '@gtp/gis-map/adapters/memory'
import { useGisMap } from '@gtp/gis-map/react'
import { chooseDemoBasemap, useOsmOn } from './demoConfig'
import type { DemoBasemapKind } from './demoConfig'

export interface DemoBandProps {
    basemap: DemoBasemap
    tourOpen: boolean
    onToggleTour: () => void
    onReset: () => void
}

export default function DemoBand({ basemap, tourOpen, onToggleTour, onReset }: DemoBandProps) {
    const map = useGisMap()
    const osmOn = useOsmOn()
    const pick = (kind: DemoBasemapKind) => { if (map) chooseDemoBasemap(map, kind) }

    return (
        <div className="demo-band" role="region" aria-label="데모 안내">
            <b className="demo-band__tag">데모</b>
            <span className="demo-band__text">
                <span className="demo-band__long">샘플(가상) 데이터로 동작합니다 · 바꾼 내용은 저장되지 않습니다</span>
                <span className="demo-band__short">가상 데이터 · 저장 안 됨</span>
            </span>
            <span className="demo-band__right">
                {basemap === 'both' && (
                    <span className="demo-seg" role="group" aria-label="배경지도">
                        <button type="button" aria-pressed={!osmOn} onClick={() => pick('vworld')}>VWorld</button>
                        <button type="button" aria-pressed={osmOn} onClick={() => pick('osm')}>OSM</button>
                    </span>
                )}
                <button type="button" className="demo-band__btn demo-band__btn--tour" aria-pressed={tourOpen} onClick={onToggleTour}>
                    <PanelLeft size={12} aria-hidden="true" />가이드 {tourOpen ? '접기' : '열기'}
                </button>
                <button type="button" className="demo-band__btn" onClick={onReset}>
                    <RotateCcw size={12} aria-hidden="true" />데모 초기화
                </button>
                <a className="demo-band__link" href="/demo">소개로</a>
                <a className="demo-band__link" href="/login">로그인</a>
            </span>
        </div>
    )
}
