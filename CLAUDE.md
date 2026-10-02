# GTProject

14년차 OpenLayers 지도 개발자의 **포트폴리오 겸 실사용** 모노레포.
여기서 만든 지도 기능을 다른(공공기관) 프로젝트로 그대로 가져가 쓰는 것이 최우선 목표다.

| 폴더 | 내용 |
|---|---|
| `frontend/` | Next.js 15.5 · React 19 · TypeScript 5 · Tailwind v4 · OpenLayers 9 · Zustand 4. 지도는 이식용 패키지 `frontend/packages/gis-map/`(React 무관 엔진 + React 위젯 + UMD 번들) |
| `backend/` | Spring Boot 3.4.5 · Java 17 · Maven — 관리자/지도/블로그/나만의지도/바람길 API (8080) |
| `bot/` | Spring Boot 3.4.5 별도 서비스 "기빵봇" — 카카오봇·디스코드·로스트아크·구글시트 (8081). backend와 **같은 DB**를 쓴다 |

DB는 PostgreSQL 16 + PostGIS(Docker). 지오메트리는 hibernate-spatial 없이 GeoJSON TEXT로 저장한다.

상세 규칙은 `.claude/rules/`에 있고, 해당 경로의 파일을 다룰 때 자동으로 로드된다
(`frontend.md`, `map.md`, `backend.md`, `bot.md`, `deploy.md`, `explain-simply.md`).

---

## 절대 원칙

1. **지도 모듈 이식성** — 지도는 `frontend/packages/gis-map/` 폴더 하나다: `core`(React 무관 엔진) · `react` · `ui` · `adapters` · `styles`.
   안에서는 상대 경로로만 import하고(`ui → react → core`, `adapters → core`), 앱 코드·`process.env`·모듈 전역 상태·Tailwind·호스트 경로를 쓰지 않는다.
   인증·주소·키·권한은 `GisMapHost`로, 데이터는 `GisMapSources`(어댑터)로 주입받는다. GTProject 연결부는 `app/map/page.tsx`·`app/map/_gtp/`뿐이다.
   쓰는 법은 세 가지 — React `MapShell`, 비-React UMD `GisMap.create`, 기존 ol 지도에 `GisMap.attach`(attachGisMap).
   다른 원칙과 충돌하면 이것이 우선한다. 상세: `.claude/rules/map.md`
2. **도메인 독립** — 새 백엔드 도메인은 다른 도메인의 엔티티/리포지토리를 import하지 않는다.
   사용자·역할은 `userId`/`roleCode` 문자열로만 다룬다 (`domain/mymap`이 기준 예시).
3. **비밀값 금지** — 이 저장소는 **public**이다. 비밀번호·API 키·토큰을 코드, 문서, 커밋 메시지,
   yml 기본값에 쓰지 않는다. 환경 변수 이름만 적는다.
4. **커밋/푸시는 요청할 때만** — 사용자가 명시적으로 요청할 때만 `git commit`/`git push`한다.
   커밋 메시지는 한글, `추가|수정|삭제|리팩토링: 설명` 형식.
5. **검증 후 완료 선언** — 프론트는 `npx tsc --noEmit`, 백엔드는 `./mvnw compile`을 통과해야 하고,
   화면이 바뀌면 브라우저에서 직접 확인한다. 확인하지 못한 것은 못 했다고 말한다.

---

## 명령어

```bash
# frontend/
npm run dev          # 개발 서버 (3000, Turbopack)
npm run build
npx tsc --noEmit     # 타입 검사 — npm run lint는 eslint-plugin-next 설치 문제로 현재 동작하지 않음
npx tsc -p packages/gis-map --noEmit   # 지도 패키지 단독 타입 검사
npm run build:gis-umd       # 지도 UMD 번들 (a) 일반 + (b) attach → packages/gis-map/dist/ (gitignore, CI 안 돌림)
npm run dev:gis-standalone  # 지도 패키지 단독 개발 서버 5199 (Tailwind 없는 환경 확인)

# backend/  (bot/도 동일)
./mvnw spring-boot:run
./mvnw compile
./mvnw test          # 테스트 코드는 아직 없음
```

로컬에서 GeoTIFF 기능을 쓰려면 백엔드 실행 전에 `./titiler-local.sh`로 titiler 컨테이너를 띄운다.

지도 이식성 감사(저장소 루트, 지도 파일을 고치면 매번): `bash .claude/skills/map-module-export/scripts/audit-portability.sh` (15항목, `--report`면 백엔드 이식 비용 추가)

---

## 환경 변수 (이름만)

- frontend `.env.local`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_VWORLD_API_KEY`, `NEXT_PUBLIC_GEOSERVER_URL`,
  서버 전용 `GEOSERVER_URL`, `GEOSERVER_ADMIN_USER`, `GEOSERVER_ADMIN_PASSWORD`, `GEOSERVER_LEGEND_LAYER`
- backend: `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `JWT_SECRET`, `GEOSERVER_URL`, `GEOSERVER_ADMIN_USER`,
  `GEOSERVER_ADMIN_PASSWORD`, `GEOSERVER_LEGEND_LAYER`, `KMA_API_KEY`, `LOSTARK_API_KEY`,
  `GOOGLE_CREDENTIALS_JSON`, `GEOTIFF_UPLOAD_DIR`, `MYMAP_UPLOAD_DIR`, `TITILER_URL`, `TITILER_CONTAINER_NAME`
- bot: `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `GOOGLE_CREDENTIALS_JSON`, `DISCORD_BOT_TOKEN`, `LOSTARK_API_KEY`

로컬 값은 gitignore된 `application-local.yml` / `.env.local`에 둔다.

---

## 하네스

**목표:** 설계 → 백엔드/프론트/지도 구현 → QA를 에이전트 팀으로 끝까지 진행하고,
아키텍처·보안·성능·스타일을 병렬 감사해 하나의 리포트로 만든다.

**트리거:**
- 여러 계층(API+화면)에 걸친 새 기능 개발 → `fullstack-pipeline` 스킬
- 종합 코드 리뷰/감사 요청 → `code-review-team` 스킬
- 지도 모듈을 다른 프로젝트로 옮기거나 이식성을 점검 → `map-module-export` 스킬
- 단순 질문, 한두 파일 수정, 버그 하나 고치기는 스킬 없이 직접 처리한다

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-09-23 | 전면 재구축 — 기존 CLAUDE.md/rules/에이전트 14개/스킬 3개 삭제 후 코드 분석 기반으로 재작성. 에이전트 10개(역할별), 스킬 3개, 경로별 rules 6개 | 전체 | 기존 문서가 실제 코드와 불일치(버전·도메인 구성·보안 설정), 기존 오케스트레이터가 이 환경에 없는 TeamCreate에 의존 |
| 2026-09-23 | 지도 모듈 외부 의존 전부 제거 — authStore/menuStore, API/VWorld/GeoServer 주소·키, `/proxy` 경로를 `MapHostContext`·`mapAuthBridge` 주입으로 교체, `types/layer.ts`·`lib/windColorScale.ts`를 지도 모듈 안으로 이동 | frontend 지도 모듈, `app/map/page.tsx` | 지도 기능 재사용성(절대 원칙 1) |
| 2026-10-02 | 지도 모듈 전면 재개편 — 옛 세 폴더를 `frontend/packages/gis-map`(core/react/ui/adapters/styles)으로 재구성, `GisMapHost`·`GisMapSources` 주입, 지도 인스턴스별 상태(한 화면 지도 2개), Tailwind 제거(gm- CSS), UMD (a)·attach (b) 번들과 ol 7.1~10.x 호환 표, 백엔드 `map` User FK 제거·`global/gis`(GisErrorCode·GisUserContext)·이식 문서(references), 감사 스크립트 최종판(15항목) | frontend 지도 모듈 전면, `app/map`, 지도 백엔드 도메인, rules/skills/agents | 지도 재사용성 — JSP·전자정부·기존 ol 지도 부착 지원 |
