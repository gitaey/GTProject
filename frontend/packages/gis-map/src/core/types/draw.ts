// 도구·그리기 타입

export type MapTool =
    | 'none' | 'select' | 'edit'
    | 'draw-point' | 'draw-line' | 'draw-polygon' | 'draw-circle' | 'draw-box' | 'draw-text'
    | 'measure-distance' | 'measure-area' | 'radius-search'

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
