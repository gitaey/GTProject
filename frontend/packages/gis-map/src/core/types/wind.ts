// 바람장 데이터 — ol-wind(WindLayer)가 받는 grib2json 형태

export type WindField = Array<{ header: Record<string, unknown>; data: number[] }>

/** 바람길 플러그인 상태(React 위젯이 ol-wind 없이 타입·빈 상태를 쓰도록 core에 둔다) */
export interface WindState {
    /** 표시하기로 했는지(토글 버튼·범례가 이 값을 본다) */
    visible: boolean
    /** 데이터를 받는 중 */
    loading: boolean
    /** 마지막 받기 실패 메시지. 옛 화면은 표시하지 않았다 */
    error: string | null
}

export const EMPTY_WIND_STATE: Readonly<WindState> = Object.freeze({ visible: false, loading: false, error: null })
