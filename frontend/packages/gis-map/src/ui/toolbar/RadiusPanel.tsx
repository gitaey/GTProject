'use client'

// 반경검색 패널(반경 직접 입력) — 반경 도구가 켜지면 툴바 옆에 뜬다 (스타일: gm-tool-panel, gm-radius-panel)
// FE-5b-2: 옛 MapToolbar.tsx 안의 RadiusPanel을 떼어 냈다(본문 그대로)
import { useState, useCallback } from 'react'
import { useGisMap, useStoreValue } from '../../react'
import type { ToolState } from '../../core'

const selectRadiusMeters = (s: ToolState): number | null => s.radiusMeters

export default function RadiusPanel() {
    // 반경 입력값 = 엔진 map.tools.radiusMeters(반경 도구가 바로 읽는다)
    const gis = useGisMap()
    const radiusSearchMeters = useStoreValue(gis?.tools.store, selectRadiusMeters, null)
    const setRadiusSearchMeters = useCallback((m: number | null) => {
        gis?.tools.setRadiusMeters(m)
    }, [gis])
    const [input, setInput] = useState(radiusSearchMeters != null ? String(radiusSearchMeters) : '')

    const apply = () => {
        const n = Number(input)
        setRadiusSearchMeters(Number.isFinite(n) && n > 0 ? n : null)
    }
    const reset = () => {
        setInput('')
        setRadiusSearchMeters(null)
    }

    return (
        <div className="gm-tool-panel gm-radius-panel">
            <p className="gm-tool-panel__label gm-tool-panel__label--head">반경 직접 입력</p>
            <div className="gm-radius-panel__row">
                <input type="number" min={1} value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && apply()}
                    placeholder="예: 500"
                    className="gm-radius-panel__input" />
                <span className="gm-radius-panel__unit">m</span>
            </div>
            <div className="gm-radius-panel__actions">
                <button onClick={apply}
                    className="gm-radius-panel__apply">
                    적용
                </button>
                {radiusSearchMeters != null && (
                    <button onClick={reset}
                        className="gm-radius-panel__reset">
                        해제
                    </button>
                )}
            </div>
            <p className="gm-radius-panel__hint">
                {radiusSearchMeters != null
                    ? '지도를 클릭하면 입력한 반경으로 원이 생성됩니다.'
                    : '미입력 시 드래그로 반경을 지정합니다.'}
            </p>
        </div>
    )
}
