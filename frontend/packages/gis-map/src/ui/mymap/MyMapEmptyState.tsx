'use client'

// 나만의지도 패널의 빈 화면들 — 스타일: gm-mymap-panel__empty 계열.
//  · MyMapEmptyState: "내 레이어" 탭이 비었을 때(A: 올릴 수 있으면 종류 안내·첫 레이어 올리기·샘플 받기, B: 올릴 수 없는 소스면 안내 한 줄)
//  · MyMapSharedEmpty: "공유받은 레이어" 탭이 비었을 때(업로드 유도 없음)
//  · MyMapListError: 목록을 못 불러왔을 때(D) — 전체 화면형 / 이미 목록이 있으면 위 얇은 띠
// 샘플 받기는 업로드 창과 같은 SampleLinks를 쓴다(소스에 downloadSample이 없으면 줄이 빠진다).
import { useState } from 'react'
import { CloudOff, FileSpreadsheet, Layers, Map as MapIcon, Plus, RotateCw, Users } from 'lucide-react'
import SampleLinks from './SampleLinks'
import type { SampleLinksClasses } from './SampleLinks'

const SAMPLE_CLASSES: SampleLinksClasses = Object.freeze({
    root: 'gm-mymap-panel__samples', label: 'gm-mymap-panel__samples-label', button: 'gm-mymap-panel__sample',
})

const UPLOAD_KINDS: readonly { id: string; name: string; hint: string; sheet: boolean }[] = Object.freeze([
    Object.freeze({ id: 'shp', name: 'SHP 파일', hint: '도형 그대로', sheet: false }),
    Object.freeze({ id: 'pnu', name: '엑셀 PNU', hint: '필지 모양으로', sheet: true }),
    Object.freeze({ id: 'address', name: '엑셀 주소', hint: '도로명·지번 → 필지', sheet: true }),
    Object.freeze({ id: 'coord', name: '엑셀 좌표', hint: '위도·경도 → 점', sheet: true }),
])

interface MyMapEmptyStateProps {
    /** 소스에 업로드가 있는가(없으면 B) */
    uploadAvailable: boolean
    /** 업로드 창 열기(한도가 다 찬 경우는 빈 화면이 아니므로 여기선 항상 가능) */
    onUpload: () => void
}

export default function MyMapEmptyState({ uploadAvailable, onUpload }: MyMapEmptyStateProps) {
    const [sampleError, setSampleError] = useState<string | null>(null)

    if (!uploadAvailable) {
        return (
            <div className="gm-mymap-panel__empty">
                <div className="gm-mymap-panel__empty-icon"><MapIcon size={20} aria-hidden="true" /></div>
                <p className="gm-mymap-panel__empty-text">이 화면에서는 레이어를 올릴 수 없습니다. 다른 사람이 공유한 레이어는 &quot;공유받은 레이어&quot; 탭에서 볼 수 있습니다.</p>
            </div>
        )
    }
    return (
        <div className="gm-mymap-panel__empty">
            <div className="gm-mymap-panel__empty-icon"><MapIcon size={20} aria-hidden="true" /></div>
            <h4 className="gm-mymap-panel__empty-title">아직 올린 레이어가 없습니다</h4>
            <p className="gm-mymap-panel__empty-text">가진 자료를 지도 위에 띄워 보세요.</p>
            <ul className="gm-mymap-panel__kinds">
                {UPLOAD_KINDS.map(k => (
                    <li key={k.id}>
                        {k.sheet ? <FileSpreadsheet size={12} aria-hidden="true" /> : <Layers size={12} aria-hidden="true" />}
                        <b>{k.name}</b><span>{k.hint}</span>
                    </li>
                ))}
            </ul>
            <button type="button" className="gm-mymap-panel__primary gm-mymap-panel__primary--wide" onClick={onUpload}>
                <Plus size={13} aria-hidden="true" />첫 레이어 올리기
            </button>
            <SampleLinks onError={setSampleError} classes={SAMPLE_CLASSES} label="샘플 엑셀 받기" />
            {sampleError && <div className="gm-mymap-panel__empty-error" role="alert">{sampleError}</div>}
            <p className="gm-mymap-panel__empty-hint">다른 사람이 공유한 레이어는 &quot;공유받은 레이어&quot; 탭에 나타납니다.</p>
        </div>
    )
}

/** 공유받은 레이어 탭이 비었다 — 올리라고 권하지 않는다 */
export function MyMapSharedEmpty() {
    return (
        <div className="gm-mymap-panel__empty">
            <div className="gm-mymap-panel__empty-icon"><Users size={20} aria-hidden="true" /></div>
            <h4 className="gm-mymap-panel__empty-title">공유받은 레이어가 없습니다</h4>
            <p className="gm-mymap-panel__empty-text">다른 사람이 레이어를 공유하면 여기에 나타납니다.</p>
        </div>
    )
}

interface MyMapListErrorProps {
    /** 목록은 이미 있고 다시 받기만 실패했다 → 위 얇은 띠 */
    banner?: boolean
    onRetry: () => void
}

/** D. 목록 조회 실패 — "없음"과 구별되게 */
export function MyMapListError({ banner, onRetry }: MyMapListErrorProps) {
    if (banner) {
        return (
            <div className="gm-mymap-panel__list-banner" role="alert">
                <span>목록을 불러오지 못했습니다</span>
                <button type="button" className="gm-mymap-panel__sbtn" onClick={onRetry}><RotateCw size={11} aria-hidden="true" />다시 시도</button>
            </div>
        )
    }
    return (
        <div className="gm-mymap-panel__empty gm-mymap-panel__empty--error" role="alert">
            <div className="gm-mymap-panel__empty-icon gm-is-error"><CloudOff size={20} aria-hidden="true" /></div>
            <h4 className="gm-mymap-panel__empty-title">목록을 불러오지 못했습니다</h4>
            <p className="gm-mymap-panel__empty-text">잠시 뒤 다시 시도해 주세요.</p>
            <button type="button" className="gm-mymap-panel__sbtn gm-mymap-panel__sbtn--center" onClick={onRetry}><RotateCw size={11} aria-hidden="true" />다시 시도</button>
        </div>
    )
}
