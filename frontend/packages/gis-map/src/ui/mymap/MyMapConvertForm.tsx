'use client'

// 업로드 마법사 2단계의 주소 변환 조각 — `결과 받는 방법` 라디오(지도에 올리기 / 엑셀로만 받기)와
// "엑셀로만 받기"일 때 보이는 `결과 엑셀에 붙일 열`·`좌표계`. 상태는 마법사(MyMapUploadModal)가 들고 있다. 스타일: gm-delivery, gm-convert-opts
import { cx } from '../cx'
import type { MyMapExportSrid } from '../../core'
import type { ConvertFlags, Delivery } from './convertModel'
import { EXPORT_SRID_OPTIONS, toExportSrid } from './sridOptions'

interface DeliveryChoiceProps {
    value: Delivery
    onChange: (next: Delivery) => void
    /** 변환 요청이 도는 동안 잠금 */
    disabled?: boolean
}

const DELIVERY_ITEMS: readonly { value: Delivery; title: string; desc: string }[] = Object.freeze([
    Object.freeze({ value: 'map' as Delivery, title: '지도에 올리기', desc: '레이어로 저장해 지도에서 보고 스타일·공유를 합니다.' }),
    Object.freeze({ value: 'excel' as Delivery, title: '엑셀로만 받기', desc: '지도에 올리지 않고 변환 결과 엑셀만 받습니다. 서버에 남지 않습니다.' }),
])

export function DeliveryChoice({ value, onChange, disabled }: DeliveryChoiceProps) {
    return (
        <div className="gm-delivery">
            <span className="gm-modal__label">결과 받는 방법</span>
            <div className="gm-delivery__options" role="radiogroup" aria-label="결과 받는 방법">
                {DELIVERY_ITEMS.map(it => (
                    <label key={it.value} className={cx('gm-delivery__option', value === it.value && 'gm-is-active')}>
                        <span className="gm-delivery__head">
                            <input type="radio" name="gm-mymap-delivery" value={it.value} checked={value === it.value}
                                disabled={disabled} onChange={() => onChange(it.value)} />
                            <span className="gm-delivery__title">{it.title}</span>
                        </span>
                        <span className="gm-delivery__desc">{it.desc}</span>
                    </label>
                ))}
            </div>
        </div>
    )
}

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
