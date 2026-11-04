---
paths:
  - "frontend/**"
---

# Frontend 규칙

지도 관련 파일(`packages/gis-map/**`, `app/map`, `app/map-admin`, `app/map-dev`, `app/proxy`)은 `map.md` 규칙이 추가로 적용된다.
지도 패키지(`frontend/packages/gis-map/`)는 이식 단위라 이 파일의 앱 규칙(`@/` 별칭, 공용 스토어, `process.env`, Tailwind)을 **쓰지 않는다**.

## 구조

- 라우트: `app/` 아래 각 `page.tsx`. **공통 레이아웃(route group)이 없다** — 관리자 페이지는 각자
  `Header`와 `Sidebar`를 직접 렌더링한다. `/map`, `/login`, `/blog`는 이 둘을 쓰지 않는다.
- `src/middleware.ts`: `token`/`role` 쿠키로 판단. 토큰 없으면 `/login`으로 보낸다(`/blog`도 보호됨).
  `MAP_USER`는 `/` 대신 `/map`으로 보낸다. `api`, `proxy`, `_next` 경로는 제외.
  **`/demo`와 `/demo/**`(공개 데모)는 토큰과 무관하게 통과**하도록 기존 규칙보다 먼저 검사한다(`/demox` 같은 이웃 경로는 계속 막힘).
  익명 `/`는 그대로 `/login`(데모로 보내지 않음). `robots.txt`·`sitemap.xml`은 없고 `/demo` 레이아웃 metadata가 `noindex`.
- `app/demo/`: 공개 소개·데모(GTProject 연결부 — 이식 대상 아님). `layout.tsx`(noindex 메타)·`page.tsx`(소개, 서버 컴포넌트).
  정적 예제 폴더는 `public/demo/umd/`(gitignore, `prebuild`가 만든다)에서 `/demo/umd/index.html`처럼 **파일 이름까지** 적어 연다
  (Next는 `public/` 폴더 주소만으로 `index.html`을 열어 주지 않는다).
- `app/proxy/**/route.ts`: VWorld·GeoServer API 키를 브라우저에 노출하지 않기 위한 서버 프록시.
  `region`, `wfs`, `vworld/{data,search,legend-style}`가 실제로 쓰인다.
  **전부 `app/proxy/_auth.ts`의 `requireLogin(req)`로 시작한다** — 미들웨어는 proxy를 건너뛰므로 라우트가 직접 검사한다.
  `token` 쿠키를 백엔드 `GET /api/auth/me`(Bearer)에 보내 200이면 통과, 아니면 401(`{ response: { status: 'ERROR', error: { code } } }` 모양 —
  지도 어댑터가 `status !== 'OK'`로 조용히 처리). 결과는 토큰별 60초 메모리 캐시, 백엔드 오류·시간 초과(3초)는 거부(fail closed).
  새 프록시 라우트를 만들면 같은 두 줄을 맨 앞에 넣는다. 공개 데모(`/demo/map`)는 이 프록시를 쓰지 않는다.
  **서버 전용 환경 변수 2개**(`NEXT_PUBLIC_`이 아니라 브라우저 번들에 안 들어가고, 호출 때마다 읽으므로 서버 재시작만 하면 된다 — 서버의 `/gtp/GTProject/frontend/.env.local` 등):
  `API_INTERNAL_URL`(검증 호출 주소 — 있으면 이것, 없으면 `NEXT_PUBLIC_API_URL`, 그것도 없으면 `http://localhost:8080`),
  `PROXY_AUTH_DISABLED=1`(검사를 끄는 비상 스위치 — 기본은 켜짐, 켜져 있으면 프로세스당 한 번 `[proxy-auth] PROXY_AUTH_DISABLED …` 경고).
  백엔드를 못 부르면 서버 로그에 5초에 한 번 이하로 `[proxy-auth] 백엔드 검증 호출 실패: <호스트> (<이유>)`가 남는다(토큰·쿠키·경로는 안 적는다).
  `app/proxy/_auth.ts`는 `route.ts`에서만 import한다(클라이언트 컴포넌트에서 import하면 서버 전용 값이 번들에 들어갈 수 있다).
- 전역 스토어(`stores/`): `authStore`(user+token, localStorage `gtp-auth`, 쿠키도 기록, `getToken()` 제공),
  `menuStore`(역할별 허용 메뉴 ID), `sidebarStore`(모바일 사이드바). 지도 상태는 전역 스토어가 아니라 지도 패키지의 엔진 인스턴스에 있다
  (앱은 `app/map/_gtp/useGtpMapHost.ts`에서 authStore·menuStore를 읽어 `GisMapHost`로 넘긴다).
- 공용 API 클라이언트가 **없다**. 각 페이지가 `const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'`와
  `getToken()`을 쓰는 로컬 `apiFetch`를 둔다. 새 관리자 페이지도 이 패턴을 따르되, 지도 모듈 안에서는 금지(map.md).
- 백엔드 응답은 `{ success, message, data }` 형태다. `success`가 false면 `message`를 에러로 보여준다.
- `next.config.ts`는 `/api/:path*` → `http://localhost:8080`으로 리라이트한다. 상대 경로 `/api/...` 호출은
  이 리라이트에 의존한다.

## 컨벤션

- TypeScript strict. 모든 파라미터에 타입, `any` 금지, `type`보다 `interface` 우선, props는 `interface XxxProps`.
- 컴포넌트/타입 PascalCase, 함수/변수 camelCase, 상수 UPPER_SNAKE_CASE.
- 클라이언트 컴포넌트는 `'use client'` 명시, 함수형만.
- 아이콘은 `lucide-react`만 쓴다 (이모지·OS 기본 아이콘 금지).
- Tailwind v4는 CSS-first 설정(`app/globals.css`) — `tailwind.config`가 없다.
- Prettier: 세미콜론 없음, 작은따옴표, 들여쓰기 4칸, 줄 폭 120.
- 경로 별칭: 앱 코드는 `@/*` → `src/*`, 지도 패키지는 `@gtp/gis-map/*`(진입점 6개, `frontend/tsconfig.json`의 paths). 패키지 **안**에서는 어느 별칭도 쓰지 않고 상대 경로만 쓴다(map.md).

## 함정

- **새 관리자 페이지를 만들면 `components/layout/Sidebar.tsx`의 메뉴 트리에도 반드시 추가한다.**
  `/admin/menu`에서 메뉴를 켜도 이 배열에 없으면 화면에 안 나온다(과거 권한관리/메뉴관리 링크가
  통째로 사라진 적 있음).
- `npm run lint`는 `eslint-plugin-next@0.0.0`(빈 패키지) 때문에 실패한다. 검증은 `npx tsc --noEmit`으로 한다.
- 테스트 도구(jest/vitest/playwright)가 없다. 화면 동작은 개발 서버를 띄워 브라우저로 확인한다.
- `vite`(devDependency)는 지도 패키지 UMD 빌드(`npm run build:gis-umd`)와 standalone 개발 서버(`npm run dev:gis-standalone`, 5199)에 쓴다. 산출물 `packages/gis-map/dist/`는 gitignore.
  **단, `npm run build`는 `prebuild`(`npm run build:gis-demo -- --copy-to public/demo/umd`)를 먼저 돌려 정적 예제 폴더를 `public/demo/umd/`(gitignore)로 만든다 —
  그래서 Next 빌드·CI·서버 빌드가 vite와 `scripts/build-gis-demo.mjs`에 의존한다.** `npm run dev`에는 prebuild가 안 돈다 — 로컬에서 `/demo/umd`를 보려면
  `npm run build:gis-demo -- --copy-to public/demo/umd`를 한 번 실행한다.
- `app/globals.css`를 패키지 CSS와 동시에 고치면 Tailwind 4.1.11 캐시 경합으로 개발 서버가 옛 CSS를 줄 수 있다(map.md 함정).
