// 레이어 타입 정의 파일
// 실제 동작 코드 없이 "이런 모양의 데이터를 씁니다" 라는 설계도 역할

// 유니온 타입: | 는 "또는" 의미. 나열된 값 중 하나만 허용 (오타/잘못된 값 방지)
// 'wmts-base' → VWorld 기본지도 (XYZ 타일)
// 'wms'       → VWorld WMS 레이어 (행정경계, 지적도 등)
export type LayerType = 'wmts-base' | 'wms'

// interface: 객체가 어떤 속성을 가져야 하는지 정의 (JS에는 없는 개념)
// ? 가 붙은 속성은 선택적 (없어도 에러 안 남)
export interface LayerItem {
    id: string
    name: string
    type: LayerType      // 위에서 정의한 유니온 타입만 허용
    visible: boolean
    opacity: number
    legend?: string      // ? = 선택적 속성
    wmsLayers?: string
    wmsStyles?: string
}

// children 배열 안에 LayerGroup이 또 들어갈 수 있어 트리 구조 가능 (재귀 구조)
// (LayerItem | LayerGroup)[] = LayerItem 또는 LayerGroup의 배열
export interface LayerGroup {
    id: string
    name: string
    children: (LayerItem | LayerGroup)[]
}

// 타입 가드: LayerItem인지 LayerGroup인지 구분하는 함수
// 'children' 속성이 있으면 LayerGroup
// node is LayerGroup → true 반환 시 TypeScript가 자동으로 타입을 LayerGroup으로 좁혀줌
export function isLayerGroup(node: LayerItem | LayerGroup): node is LayerGroup {
    return 'children' in node
}

// 트리 구조를 납작하게 펼쳐서 LeafItem(LayerItem)만 추출하는 유틸
// flatMap = map + flat (ES6). 그룹이면 재귀, 아이템이면 배열에 담아 반환
export function flattenItems(nodes: (LayerItem | LayerGroup)[]): LayerItem[] {
    return nodes.flatMap((n) => (isLayerGroup(n) ? flattenItems(n.children) : [n]))
}
