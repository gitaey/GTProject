'use client'

// 샘플 엑셀 받기 링크 줄(PNU·주소·좌표) — 업로드 창(MyMapUploadModal)과 나만의지도 빈 화면(MyMapEmptyState)이 함께 쓴다.
// 소스에 downloadSample이 없으면 아무것도 그리지 않는다. 기본 모양은 업로드 창의 gm-wizard__samples(그대로), classes로 다른 모양을 줄 수 있다.
import { useState } from 'react'
import { Loader2, Download } from 'lucide-react'
import type { MyMapSampleKind } from '../../core'
import { useGisMap } from '../../react'
import { sampleFileName } from './format'
import { saveBlob } from './saveBlob'

/** 화면에서 받게 하는 샘플 */
const SAMPLE_BUTTONS: readonly { kind: MyMapSampleKind; label: string }[] = Object.freeze([
    Object.freeze({ kind: 'pnu' as MyMapSampleKind, label: 'PNU' }),
    Object.freeze({ kind: 'address' as MyMapSampleKind, label: '주소' }),
    Object.freeze({ kind: 'coord' as MyMapSampleKind, label: '좌표' }),
])

export interface SampleLinksClasses {
    root: string
    label: string
    button: string
}

const WIZARD_CLASSES: SampleLinksClasses = Object.freeze({
    root: 'gm-wizard__samples', label: 'gm-wizard__samples-label', button: 'gm-wizard__sample',
})

interface SampleLinksProps {
    onError: (message: string | null) => void
    /** 안 주면 업로드 창 모양. 모듈 상수로 넘긴다(렌더마다 새 객체 금지) */
    classes?: SampleLinksClasses
    /** 앞 글자(기본 '샘플 받기') */
    label?: string
}

export default function SampleLinks({ onError, classes = WIZARD_CLASSES, label = '샘플 받기' }: SampleLinksProps) {
    const myMap = useGisMap()?.sources.myMap
    const [busy, setBusy] = useState<MyMapSampleKind | null>(null)
    if (!myMap?.downloadSample) return null
    const download = myMap.downloadSample.bind(myMap)

    const handle = async (kind: MyMapSampleKind) => {
        setBusy(kind)
        onError(null)
        try {
            saveBlob(await download(kind), sampleFileName(kind))
        } catch (e) {
            onError(e instanceof Error ? e.message : '샘플을 받지 못했습니다')
        } finally {
            setBusy(null)
        }
    }

    return (
        <div className={classes.root} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
            <span className={classes.label}>{label}</span>
            {SAMPLE_BUTTONS.map(s => (
                <button key={s.kind} type="button" className={classes.button} disabled={busy !== null}
                    onClick={() => handle(s.kind)}>
                    {busy === s.kind ? <Loader2 size={11} className="gm-loader" /> : <Download size={11} />} {s.label}
                </button>
            ))}
        </div>
    )
}
