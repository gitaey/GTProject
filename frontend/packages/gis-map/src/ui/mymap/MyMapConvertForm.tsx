'use client'

// 업로드 창의 "엑셀로만 받기"(주소 변환) 모드 조각 — `결과 엑셀에 붙일 열`·`좌표계`. 상태는 업로드 창(MyMapUploadModal)이 들고 있다. 스타일: gm-convert-opts
// (예전 `결과 받는 방법` 라디오 두 장은 없앴다 — 같은 미리보기를 쓰는 보조 길로 주소 방법 카드 아래에 [엑셀로만 받기]가 있다)
import type { MyMapExportSrid } from '../../core'
import type { ConvertFlags } from './convertModel'
import { EXPORT_SRID_OPTIONS, toExportSrid } from './sridOptions'

interface ConvertOptionsProps {
    flags: ConvertFlags
    onFlags: (next: ConvertFlags) => void
    srid: MyMapExportSrid
    onSrid: (next: MyMapExportSrid) => void
    /** 변환 요청이 도는 동안 잠금 */
    disabled?: boolean
}

const FLAG_ITEMS: readonly { key: keyof ConvertFlags; label: string; hint?: string }[] = Object.freeze([
    Object.freeze({ key: 'pnu' as const, label: 'PNU · 법정동코드' }),
    Object.freeze({ key: 'address' as const, label: '표준 도로명주소 · 지번주소' }),
    Object.freeze({ key: 'lonLat' as const, label: '경도 · 위도', hint: '(필지 안쪽 대표점)' }),
    Object.freeze({ key: 'area' as const, label: '필지 면적(㎡)' }),
])

export function ConvertOptions({ flags, onFlags, srid, onSrid, disabled }: ConvertOptionsProps) {
    return (
        <>
            <fieldset className="gm-convert-opts">
                <legend className="gm-modal__label">결과 엑셀에 붙일 열</legend>
                {FLAG_ITEMS.map(it => (
                    <label key={it.key} className="gm-convert-opts__chk">
                        <input type="checkbox" checked={flags[it.key]} disabled={disabled} onChange={e => onFlags({ ...flags, [it.key]: e.target.checked })} />
                        {it.label}
                        {it.hint && <span className="gm-convert-opts__hint">{it.hint}</span>}
                    </label>
                ))}
                <div className="gm-modal__note">원본 열은 그대로 두고 오른쪽에 붙입니다. 실패한 행도 사유와 함께 남습니다.</div>
            </fieldset>
            <label className="gm-wizard__field-row">
                <span className="gm-wizard__field-label">좌표계</span>
                <select value={srid} disabled={disabled} onChange={e => onSrid(toExportSrid(e.target.value))} className="gm-modal__field gm-wizard__field-select">
                    {EXPORT_SRID_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </label>
        </>
    )
}
