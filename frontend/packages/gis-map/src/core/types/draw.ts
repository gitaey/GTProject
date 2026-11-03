// 도구·그리기 타입

export type MapTool =
    | 'none' | 'select' | 'edit'
    | 'draw-point' | 'draw-line' | 'draw-polygon' | 'draw-circle' | 'draw-box' | 'draw-text'
    | 'measure-distance' | 'measure-area' | 'radius-search'
    /** 영역 분석 영역 그리기(core/areaAnalysis) */
    | 'analysis-polygon' | 'analysis-box' | 'analysis-circle'
    /** 필지 정보 카드: 켜진 동안 지도 클릭 = 필지 조회(core/parcelInfo) */
    | 'parcel-info'

export interface DrawStyle {
    /** hex */
    color: string
    /** 1~8 */
    strokeWidth: number
    /** 0~100 */
    fillOpacity: number
    /** 4~20 */
    pointSize: number
    /** 10~24 */
    fontSize: number
}
