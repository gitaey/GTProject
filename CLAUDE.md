# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
상세 아키텍처/기능별 내용은 `.claude/rules/`에 주제별로 나눠뒀습니다 (백엔드/프론트/지도 기능/배포).

## 프로젝트 개요

Next.js 프론트엔드 + Spring Boot 백엔드 모노레포.
지도(OpenLayers + VWorld API), 대시보드, 카카오봇(Discord 연동), 블로그, GeoServer 레이어 관리,
나만의지도(shp/엑셀 업로드), 바람길(기상청 LDAPS) 기능 제공.

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
| `KMA_API_KEY` | 기상청 API허브 (바람길 LDAPS 데이터) |

---

## 기술 스택

| 영역 | 스택 |
|---|---|
| Frontend | Next.js 15.5, React 19, TypeScript 5, Tailwind CSS v4 (PostCSS 방식) |
| 지도 | OpenLayers 9.x, ol-wind, VWorld WMTS/WMS/WFS/Data API, proj4 (EPSG:5186) |
| 상태관리 | Zustand 4.4.7 |
| Backend | Spring Boot 3.4.5, Java 17, JPA, Spring Security (Stateless JWT) |
| DB | PostgreSQL + PostGIS |
| 외부 연동 | Google Sheets API v4, Discord JDA 5.x, 로스트아크 API, 기상청 API허브, GeoTools 32.1, Apache POI |

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
- **프론트엔드 파일 수정 후 반드시 `npx tsc --noEmit`으로 타입 에러 확인 후 완료 선언**

### Backend
- 모든 비즈니스 예외는 `throw new CustomException(ErrorCode.XXX)` 형식
- 새 도메인은 다른 도메인 클래스를 참조하지 않는 독립 모듈로 설계하는 걸 기본으로 함
  (예: `domain/mymap`은 `userId`/`roleCode`를 문자열로만 다루고 `User`/`Role` 엔티티를 참조하지 않음)

### 커밋 메시지
한글로 작성. `추가/수정/삭제/리팩토링 + 설명` 형식.

### Git 커밋 & 푸시
- **사용자가 명시적으로 요청할 때만 `git commit` 및 `git push` 실행**
- 코드 수정 후 자동 커밋/푸시 금지

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
| `/admin/permission` | 역할/권한 관리 |
| `/admin/menu` | 메뉴 가시성 관리 |
| `/admin/access-log` | 접속 로그 |
| `/admin/mymap` | 나만의지도 관리 (전체 오버사이트) |

---

## 도메인 목록 (backend)

`blog`, `bot`, `geoserver`, `geotiff`, `log`(접속 로그), `map`(레이어 트리),
`member/{auth,role,user}`(로그인·동적 역할/권한·회원), `menu`(메뉴 가시성),
`mymap`(나만의지도), `wind`(바람길). 상세는 `.claude/rules/backend.md` 참고.
