// 바람 격자를 메모리에 오래 들고 있을 때의 작은 표현. React·ol·DOM 없음.
// 자료 없는 칸(null)이 섞인 숫자 배열은 V8이 숫자마다 박싱한 일반 배열로 만들어 한 장이 약 6MB(380x372)까지 커진다(null 없으면 2.2MB).
// 프레임 캐시(최대 한 발표분 = 9장)에는 Float32Array(NaN = 자료 없음)로 넣어 장당 약 1.1MB로 줄이고, 지도에 그릴 때만 원래 배열로 푼다.
// 값 오차: float32라 약 1e-7 상대 오차(풍속 0.01 m/s 단위 값에는 영향 없음). null 의미(자료 없음 → 입자 제거·"격자 밖" 표시·투명 칸)는 그대로 돌아온다.
import type { WindField } from '../types/wind'

/** 캐시에 두는 격자 한 장: 기록마다 header(작음)와 Float32Array(NaN = 자료 없음) */
export interface CompactWindField {
    records: Array<{ header: Record<string, unknown>; data: Float32Array }>
    /** 메모리 바이트 수(데이터 부분) */
    bytes: number
}

/** 격자를 작은 표현으로. 형식이 틀리면(기록이 배열이 아님 등) null — 그때는 캐시하지 않는다 */
export function compactWindField(field: WindField): CompactWindField | null {
    if (!Array.isArray(field)) return null
    const records: CompactWindField['records'] = []
    let bytes = 0
    for (const rec of field) {
        if (!rec || !Array.isArray(rec.data)) return null
        const out = new Float32Array(rec.data.length)
        for (let i = 0; i < out.length; i++) {
            const v = rec.data[i]
            out[i] = typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN
        }
        records.push({ header: rec.header, data: out })
        bytes += out.byteLength
    }
    return { records, bytes }
}

/** 작은 표현 → ol-wind·windAt가 읽는 grib2json 배열(NaN → null) */
export function expandWindField(c: CompactWindField): WindField {
    return c.records.map(rec => {
        const data: Array<number | null> = new Array(rec.data.length)
        for (let i = 0; i < data.length; i++) {
            const v = rec.data[i]
            data[i] = Number.isNaN(v) ? null : v
        }
        return { header: rec.header, data }
    })
}
