# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요
Next.js 프론트엔드 + Spring Boot 백엔드 + 카카오봇으로 구성된 모노레포.
지도(OpenLayers + VWorld API) 및 대시보드 기능 제공.

## 기술 스택
| 영역 | 스택 |
|------|------|
| Frontend | Next.js 15.4.4, React 19.1.0, TypeScript, Tailwind CSS 4 |
| Map | OpenLayers 10.x, VWorld WMTS/WMS API, proj4 (EPSG:5186) |
| State | Zustand 4.4.7 |
| Backend | Spring Boot 3.4.5, Java 17, JPA, Spring Security, JWT (jjwt 0.11.5) |
| DB | PostgreSQL |
| Bot | Node.js (kakaobot) |

## 명령어

### Frontend (`frontend/`)
```bash
npm run dev      # 개발 서버 (localhost:3000)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint 검사
```

### Backend (`backend/`)
```bash
./mvnw spring-boot:run          # 실행 (port 8080)
./mvnw clean package            # 빌드
./mvnw test                     # 전체 테스트
./mvnw test -Dtest=ClassName    # 단일 테스트 클래스 실행
```

### Kakaobot (`kakaobot/`)
```bash
npm start    # 실행
npm run dev  # nodemon으로 실행 (핫리로드)
```

## 환경 변수

### Frontend
`frontend/.env.local`에 설정:
```
NEXT_PUBLIC_VWORLD_API_KEY=<VWorld API 키>
```

### Kakaobot
`kakaobot/.env`에 설정:
```
SPRING_API_URL=http://localhost:8080
```

### Backend
`backend/src/main/resources/application.yml`에서 DB, LostArk API 키 관리.

## 아키텍처

### Frontend 데이터 흐름
```
Zustand Store (mapStore, layerStore)
    ↓
hooks/map/ (useMap, useLayerManager, useDrawing, useDistanceMeasure, useAreaMeasure)
    ↓
OpenLayers Map 인스턴스 (mapRef)
    ↓
components/map/ (MapView → MapToolbar, LayerPanel)
```

**핵심 패턴:**
- `MapView`가 `mapRef`를 생성하고 모든 훅에 전달
- 각 훅은 `mapRef.current` 변경을 감지해 OL 레이어/인터랙션을 등록/해제
- `mapStore.clearAll()`은 Pub/Sub 패턴(`onClear` 리스너 Set)으로 각 훅의 초기화 로직을 트리거
- `layerStore`의 트리 구조(`LayerGroup > LayerItem`)는 `useLayerManager`가 OL 레이어와 동기화

### 레이어 트리 구조
```
LayerGroup
  └─ LayerGroup (중첩 가능)
       └─ LayerItem (type: 'wmts-base' | 'wms')
```
`flattenItems()` 유틸로 트리에서 모든 LeafItem을 추출. WMS 레이어는 VWorld WMS, WMTS 레이어는 VWorld XYZ 타일.

### Backend 구조
```
com.gtp
├── global/
│   ├── config/         # CorsConfig, SecurityConfig
│   ├── exception/      # CustomException, ErrorCode(enum), GlobalExceptionHandler
│   └── response/       # ApiResponse<T> (success, message, data)
└── domain/
    └── lostark/        # Controller → Service → DTO 레이어
```
모든 API 응답은 `ApiResponse<T>` 래퍼 사용. 비즈니스 예외는 `CustomException(ErrorCode)` throw.
CORS는 `localhost:3000`만 허용 (개발 환경).

## 코딩 컨벤션

### 네이밍
- 컴포넌트 파일: PascalCase (`MapPopup.tsx`)
- 함수/변수: camelCase (`handleClick`)
- 상수: UPPER_SNAKE_CASE (`API_URL`)
- 타입/인터페이스: PascalCase, `interface ComponentNameProps` 형식

### TypeScript
- 모든 파라미터에 타입 명시 (implicit any 금지)
- `interface` 우선 사용 (`type`보다)

### React
- 함수형 컴포넌트, `'use client'` 명시
- hooks는 컴포넌트 최상단에 선언

### 스타일
- Tailwind CSS 클래스, 인라인 스타일 지양

## 주석 및 커밋
- 주석: 한글 가능, 복잡한 로직에만
- 커밋: 영어, `Add/Update/Fix/Remove + 설명` 형식

## 주요 기능 현황
- [x] 대시보드 레이아웃 (Sidebar + Header)
- [x] OpenLayers 지도 (VWorld WMTS/WMS 레이어)
- [x] 레이어 패널 (트리 구조, 토글/투명도)
- [x] 지도 도구 (포인트/선/폴리곤 그리기, 거리/면적 측정)
- [x] Spring Boot API (LostArk 캐릭터 조회)
- [ ] 인증/로그인 (JWT 구조는 준비됨)
- [ ] 지도 팝업
- [ ] 데이터 내보내기