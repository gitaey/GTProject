---
paths:
  - "frontend/**"
---

# Frontend 아키텍처

## 핵심 데이터 흐름
```
Zustand Stores
  ├── mapStore     → activeTool, flyTo, clearAll(Pub/Sub), parcel 콜백
  ├── layerStore   → 레이어 트리(LayerGroup > LayerItem), 가시성/투명도, basemap 모드
  ├── drawStore    → 그리기 스타일, textInput 오버레이, 선택 피처 수/삭제
  ├── panelStore   → 열린 패널 타입 ('layer' | 'image' | 'mymap' | 'etc' | null)
  └── menuStore    → 로그인한 role(+permission)로 GET /api/menu-visibility 조회,
                      allowedMenus(Set) 기반 isAllowed(menuId)로 메뉴/패널 노출 제어
          ↓
hooks/map/          → Zustand 상태를 OL 인터랙션으로 변환
          ↓
OpenLayers Map 인스턴스 (MapView에서 생성, 각 훅에 전달)
          ↓
components/map/     → MapView → MapToolbar, PanelLeft, MapHeader 등
```

## hooks/map/ 역할

| 훅 | 역할 |
|---|---|
| `useMap` | OL Map 인스턴스 초기화 (EPSG:5186 프로젝션, WMTS 베이스맵) |
| `useLayerManager` | `layerStore` 트리 ↔ OL WMS/WMTS 레이어 동기화 |
| `useDrawing` | Draw / Select / Modify 인터랙션 관리. 우클릭 → 그리기 완료 + `activeTool: 'none'` |
| `useDistanceMeasure` / `useAreaMeasure` | 거리/면적 측정 (동적 툴팁 렌더링) |
| `useRadiusSearch` | 반경 검색 원 그리기 |
| `useParcelHighlight` | VWorld Data API 필지 폴리곤 조회 + 핀/라벨. `registerParcelHighlighter`로 직접 콜백 등록 (Zustand 안 거치고 즉시 실행) |
| `useRegionName` | 지도 이동 시 행정구역명 조회 |
| `useGeoTiffLayer` | GeoTIFF 타일 레이어 (`/admin` 업로드 → titiler 타일 표시) |
| `useWindLayer` | 바람길 레이어 (ol-wind, 줌 레벨에 따라 velocityScale/paths 동적 조정) |
| `useMyMapLayers` | 나만의지도 GeoJSON 레이어 (`addLayer`/`removeLayer`/`zoomTo`) |

## mapStore 핵심 패턴

**Pub/Sub 초기화:** `clearAll()` 호출 시 `clearListeners` Set에 등록된 모든 훅의 초기화 함수를 호출.
각 훅은 `onClear(fn)`으로 구독 → 구독 해제 함수 반환.

**직접 콜백 패턴 (parcel):**
```ts
registerParcelHighlighter((lon, lat, title?) => { ... })  // 레이어 훅이 등록
highlightParcel(lon, lat, title)                          // 검색 컴포넌트가 직접 호출
```

**MapTool 토글:** `setActiveTool(tool)`은 같은 도구를 다시 누르면 `'none'`으로 해제.

## 레이어 트리 구조 (공용 레이어)

```
LayerGroup
  └─ LayerGroup (중첩 가능)
       └─ LayerItem (type: 'wmts-base' | 'wms')
```

`layerStore.flattenGroupLayers()`로 트리에서 모든 LeafItem 추출.
확장 상태는 `localStorage['layer-group-expanded']`에 유지.
레이어 가시성/투명도는 per-user 서버 저장 (백엔드 `LayerService`).

※ 나만의지도(mymap)는 이 트리에 얹지 않고 완전히 별도 스토어/API로 관리한다
(`hooks/map/useMyMapLayers.ts`, `components/map/panel/MyMapPanel.tsx`).

## 사이드바/메뉴 노출 (관리자 페이지)

`components/layout/Sidebar.tsx`의 `menuItems`가 실제 표시되는 사이드바 항목의 원본이며,
`isAllowed('sidebar.' + id)`로 필터링된다. **`/admin/menu` 관리 페이지에서 메뉴를 켜도
`Sidebar.tsx`의 `menuItems` 배열에 해당 항목이 없으면 절대 안 보이니**, 새 관리자 페이지를
추가하면 반드시 여기에도 링크를 추가할 것 (과거 한 번 이걸 빼먹어서 권한관리/메뉴관리
링크가 통째로 사라졌던 적 있음).

Proxy: `next.config.ts`의 `/api/*` → `http://localhost:8080/api/*` 리라이트(개발 CORS 우회),
`frontend/src/app/proxy/`에 VWorld/GeoServer API 키를 숨기는 서버사이드 프록시 라우트 있음.
