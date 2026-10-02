// 기능 ID. 호스트의 isFeatureAllowed()에 넘기는 값이다.
// 아래 목록은 현재 위젯이 쓰는 ID이고, 호스트 권한 체계에 맞는 임의 문자열도 받는다.

export type GisFeatureId =
    | 'map.panel.layer' | 'map.panel.image' | 'map.panel.mymap' | 'map.panel.etc'
    | 'map.tool.zoom' | 'map.tool.draw' | 'map.tool.measure-distance' | 'map.tool.measure-area'
    | 'map.tool.radius-search' | 'map.tool.wind' | 'map.tool.clear'
