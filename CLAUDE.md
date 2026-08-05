# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Next.js 프론트엔드 + Spring Boot 백엔드 모노레포.  
지도(OpenLayers + VWorld API), 대시보드, 카카오봇(Discord 연동), 블로그, GeoServer 레이어 관리 기능 제공.

---

## 명령어

### Frontend (`frontend/`)
```bash
npm run dev      # 개발 서버 (localhost:3000, Turbopack)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint 검사
```

### Backend (`backend/`)
```bash
./mvnw spring-boot:run          # 실행 (port 8080)
./mvnw clean package            # 빌드
./mvnw test                     # 전체 테스트
./mvnw test -Dtest=ClassName    # 단일 클래스 테스트
```

---

## 환경 변수

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_VWORLD_API_KEY=<VWorld API 키>
NEXT_PUBLIC_API_URL=http://localhost:8080   # 생략 시 기본값 동일
```

### Backend (`backend/src/main/resources/application.yml` + `application-local.yml`)
| 변수 | 용도 |
|---|---|
| `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` | PostgreSQL 연결 |
| `JWT_SECRET` | JWT 서명 (24h 만료) |
| `GOOGLE_CREDENTIALS_JSON` | Google Sheets API 인증 |
| `DISCORD_BOT_TOKEN` | Discord JDA 봇 |
| `LOSTARK_API_KEY` | 로스트아크 캐릭터 조회 |
| `GEOSERVER_URL` | GeoServer 주소 (기본: `https://geo.gitaey-dev.com/geoserver`) |
| `GEOSERVER_ADMIN_USER` / `GEOSERVER_ADMIN_PASSWORD` | GeoServer 관리자 |

---

## 기술 스택

| 영역 | 스택 |
|---|---|
| Frontend | Next.js 15.5 (App Router), React 19, TypeScript 5, Tailwind CSS v4 (PostCSS 방식 — `tailwind.config.*` 파일 없음) |
| 지도 | OpenLayers 9.x, VWorld WMTS/WMS/WFS/Data API, proj4 (EPSG:5186) |
| 상태관리 | Zustand 4.4.7 |
| Backend | Spring Boot 3.4.5, Java 17, JPA, Spring Security (Stateless JWT) |
| DB | PostgreSQL |
| 외부 연동 | Google Sheets API v4, Discord JDA 5.x, 로스트아크 API |

---

## 아키텍처

### Frontend 핵심 데이터 흐름

```
Zustand Stores
  ├── mapStore     → activeTool, flyTo, clearAll(Pub/Sub), parcel 콜백
  ├── layerStore   → 레이어 트리(LayerGroup > LayerItem), 가시성/투명도, basemap 모드
  ├── drawStore    → 그리기 스타일, textInput 오버레이, 선택 피처 수/삭제
  └── panelStore   → 열린 패널 타입 ('layer' | 'image' | 'etc' | null)
          ↓
hooks/map/          → Zustand 상태를 OL 인터랙션으로 변환
          ↓
OpenLayers Map 인스턴스 (MapView에서 생성, 각 훅에 전달)
          ↓
components/map/     → MapView → MapToolbar, PanelLeft, MapHeader 등
```

### hooks/map/ 역할

| 훅 | 역할 |
|---|---|
| `useMap` | OL Map 인스턴스 초기화 (EPSG:5186 프로젝션, WMTS 베이스맵) |
| `useLayerManager` | `layerStore` 트리 ↔ OL WMS/WMTS 레이어 동기화 |
| `useDrawing` | Draw / Select / Modify 인터랙션 관리. 우클릭 → 그리기 완료 + `activeTool: 'none'` |
| `useDistanceMeasure` | 거리 측정 (동적 툴팁 렌더링) |
| `useAreaMeasure` | 면적 측정 (동적 툴팁 렌더링) |
| `useRadiusSearch` | 반경 검색 원 그리기 |
| `useParcelHighlight` | VWorld Data API로 필지 폴리곤 조회 + 핀/라벨 오버레이. `registerParcelHighlighter`로 직접 콜백 등록 (Zustand 경유 없이 즉시 실행) |
| `useRegionName` | 지도 이동 시 행정구역명 조회 |

### mapStore 핵심 패턴

**Pub/Sub 초기화:** `clearAll()` 호출 시 `clearListeners` Set에 등록된 모든 훅의 초기화 함수를 호출.  
각 훅은 `onClear(fn)` 으로 구독 → 구독 해제 함수 반환.

**직접 콜백 패턴 (parcel):**
```ts
// 레이어 훅이 등록
registerParcelHighlighter((lon, lat, title?) => { ... })
// 검색 컴포넌트가 직접 호출 (React re-render 없이 즉시 실행)
highlightParcel(lon, lat, title)
```

**MapTool 토글:** `setActiveTool(tool)` 은 같은 도구를 다시 누르면 `'none'`으로 해제.

### 레이어 트리 구조

```
LayerGroup
  └─ LayerGroup (중첩 가능)
       └─ LayerItem (type: 'wmts-base' | 'wms')
```

`layerStore.flattenGroupLayers()` 로 트리에서 모든 LeafItem 추출.  
확장 상태는 `localStorage['layer-group-expanded']`에 유지.  
레이어 가시성/투명도는 `layerStore` 에서 per-user 서버 저장 (백엔드 `LayerService`).

### Backend 구조

```
com.gtp/
├── global/
│   ├── config/     CorsConfig (localhost:3000 허용), SecurityConfig, BotDataInitializer
│   ├── jwt/        JwtUtil, JwtFilter
│   ├── exception/  CustomException, ErrorCode(enum), GlobalExceptionHandler
│   └── response/   ApiResponse<T>  ← 모든 API 응답 래퍼
└── domain/
    ├── blog/       게시글, 카테고리, slug 기반 조회
    ├── bot/        command / room / schedule / log / message / discord
    ├── geoserver/  GeoServer REST API 연동 (SLD 스타일, 레이어 publish)
    ├── lostark/    캐릭터 조회 API, 레이드 일정
    ├── map/        레이어 트리 CRUD (LayerGroup, LayerItem 엔티티)
    └── member/     auth (JWT 로그인), user
```

모든 비즈니스 예외는 `throw new CustomException(ErrorCode.XXX)` 형식.

### Security 규칙 (SecurityConfig)

- `GET /api/posts`, `/api/categories`, `/api/layers/**`, `/api/layer-groups`, `/api/geoserver/sld/**` → 인증 불필요
- `POST /api/auth/login` → 인증 불필요
- 나머지 `/api/categories/**`, `/api/users/**`, `/api/auth/me`, `/api/posts/**`, `/api/geoserver/**`, `/api/layers/**`, `/api/layer-groups/**` → 인증 필요
- `anyRequest` → `permitAll()` (폴백)

---

## Proxy 구조

### Next.js Rewrite (next.config.ts)
`/api/*` → `http://localhost:8080/api/*` (개발 환경 CORS 우회)

### App Router API 핸들러 (`frontend/src/app/proxy/`)
서버 사이드에서 API 키를 숨기기 위한 프록시 라우트:

| 경로 | 용도 |
|---|---|
| `/proxy/vworld/search` | VWorld 통합검색 (주소/POI) |
| `/proxy/vworld/wfs` | VWorld WFS 피처 조회 |
| `/proxy/vworld/data` | VWorld Data API (필지 폴리곤 등) |
| `/proxy/vworld/legend-style` | VWorld 범례 스타일 |
| `/proxy/geoserver/legend/[name]` | GeoServer 범례 이미지 |
| `/proxy/geoserver/styles/[name]` | GeoServer SLD 스타일 |
| `/proxy/region` | 행정구역명 조회 |
| `/proxy/wfs` | 범용 WFS 프록시 |

**VWorld domain 파라미터:** VWorld API는 등록된 도메인 일치 필수.  
proxy route에서 `NODE_ENV`에 따라 자동 주입:
```ts
const DOMAIN = NODE_ENV === 'production' ? 'https://gitaey-dev.com' : 'http://localhost:3000'
```

---

## 코딩 컨벤션

### 네이밍
- 컴포넌트/타입/인터페이스: PascalCase
- 함수/변수: camelCase
- 상수: UPPER_SNAKE_CASE
- 인터페이스명: `interface ComponentNameProps` 형식

### TypeScript
- 모든 파라미터에 타입 명시 (implicit any 금지)
- `interface` 우선 (`type`보다)

### 커밋 메시지
한글로 작성. `추가/수정/삭제/리팩토링 + 설명` 형식.

---

## 페이지(라우트) 목록

| 경로 | 설명 |
|---|---|
| `/` | 대시보드 홈 |
| `/login` | 로그인 |
| `/map` | 지도 메인 |
| `/map-admin/layer` | 레이어 관리 (어드민) |
| `/blog` | 블로그 목록 |
| `/blog/[slug]` | 블로그 포스트 |
| `/admin/blog` | 블로그 관리 |
| `/admin/blog/category` | 카테고리 관리 |
| `/admin/bot/command` | 봇 명령어 관리 |
| `/admin/bot/room` | 봇 방 관리 |
| `/admin/bot/schedule` | 봇 스케줄 관리 |
| `/admin/bot-log` | 봇 로그 |
| `/admin/geoserver/publish` | GeoServer 레이어 배포 |
| `/admin/geoserver/styles` | GeoServer SLD 스타일 관리 |
| `/admin/user` | 회원 관리 |

---

## 구현 현황

- [x] 지도 (VWorld WMTS/WMS, EPSG:5186)
- [x] 레이어 패널 (트리 구조, 토글/투명도, per-user 서버 저장)
- [x] 그리기 도구 (포인트/선/폴리곤/원/직사각형/텍스트, 선택·편집·삭제)
- [x] 거리/면적 측정
- [x] 반경 검색
- [x] 통합검색 (VWorld) + 필지 폴리곤 하이라이트
- [x] 블로그 (CRUD, 카테고리, slug)
- [x] 카카오봇 (명령어, 방, 스케줄, 로그, Discord 연동)
- [x] Google Sheets 레이드 일정 연동
- [x] 로스트아크 캐릭터 조회
- [x] GeoServer 레이어/스타일 관리
- [ ] 인증/로그인 (JWT 구조 완성, UI 미완)
- [ ] 지도 팝업
- [ ] 데이터 내보내기
