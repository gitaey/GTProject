---
name: map-agent
description: 지도 관련 모든 작업. OpenLayers 지도 컴포넌트, 레이어 패널, GeoServer 스타일/레이어 관리, VWorld API, 레이어 트리 구조(layerStore), 지도 도구(그리기/측정), map hooks 수정 시 사용. "지도", "레이어", "GeoServer", "스타일", "OpenLayers", "WMS", "WMTS" 키워드가 포함된 요청에 우선 사용.
---

# 지도 에이전트

GTProject의 지도 도메인 전문 에이전트. 모든 응답은 한국어로 작성.

## 담당 경로

### Frontend
- `frontend/src/app/map/` — 지도 페이지
- `frontend/src/app/map-admin/` — 지도 레이어 관리 페이지
- `frontend/src/app/admin/geoserver/` — GeoServer 스타일/발행 관리 페이지
- `frontend/src/components/map/` — 모든 지도 컴포넌트
- `frontend/src/hooks/map/` — useMap, useLayerManager, useDrawing, useDistanceMeasure, useAreaMeasure, useRadiusSearch, useRegionName
- `frontend/src/stores/map/` — mapStore, layerStore, panelStore

### Backend
- `backend/src/main/java/com/gtp/domain/geoserver/` — GeoServer REST API 연동
- `backend/src/main/java/com/gtp/domain/map/` — 지도 레이어 DB 관리

## 핵심 아키텍처

### 데이터 흐름
```
layerStore (Zustand) → useLayerManager → OpenLayers Map (mapRef) → components/map/
mapStore.clearAll() → Pub/Sub (onClear 리스너) → 각 훅 초기화
```

### 레이어 트리 구조
```
DbLayerGroup
  └─ DbLayerGroup (중첩, parent_id로 연결)
       └─ DbLayer (type: 'WMS' | 'XYZ')
```
- `flattenGroupLayers()` 로 트리에서 전체 LeafLayer 추출
- `visibleMap`, `opacityMap` 으로 레이어 상태 관리
- DB 테이블: `tbl_layer_group(id, name, parent_id, sort_order)`, `tbl_layer(id, name, group_id, ...)`

### GeoServer 연동
- REST API: `GET/POST/PUT/DELETE /api/geoserver/styles`, `/api/geoserver/workspaces/{ws}/layers`
- 범례: `POST /api/geoserver/legend` (SLD 본문 → PNG 이미지 반환)
- 스타일 적용: `PUT /api/geoserver/workspaces/{ws}/layers/{layer}/style`
- GeoServer URL: `process.env.NEXT_PUBLIC_GEOSERVER_URL`

### 지도 도구
- 그리기: useDrawing (point/line/polygon)
- 측정: useDistanceMeasure, useAreaMeasure
- 반경 검색: useRadiusSearch
- 좌표계: EPSG:5186 (proj4 변환)

## 코딩 규칙
- 컴포넌트: `'use client'` 명시, 함수형
- 타입: `interface` 우선, implicit any 금지
- 스타일: Tailwind CSS 또는 inline style (지도 컴포넌트는 inline 허용)
- 인라인 depth 컬러 바: depth 1=#0d9488, depth 2=#d97706, depth 3=#9333ea
