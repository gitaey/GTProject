---
paths:
  - ".github/**"
  - "docker-compose.yml"
  - "**/Dockerfile"
  - "titiler-local.sh"
  - "frontend/next.config.ts"
---

# 배포 규칙

## 흐름

GitHub Actions(`.github/workflows/deploy-{backend,frontend,bot}.yml`)가 `master` push 중 해당 폴더가 바뀌면
SSH(포트 19922, `appleboy/ssh-action`)로 서버에 접속해 `/gtp/GTProject`에서 `git pull` 후 재배포한다.
Secrets: `SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`.

- backend/bot: CI에서 `./mvnw compile` → 서버 `/gtp/docker`에서 `docker compose build <svc>` + `up -d --no-deps <svc>`
- frontend: CI에서 `npm ci` → `tsc --noEmit` → `npm run build` → 서버에서 `node:18` 컨테이너로 빌드 후
  `gtp-frontend`(49092→3000) 재생성. frontend에는 Dockerfile이 없다.
  지도 패키지 `frontend/packages/gis-map/`은 frontend 안이라 같은 흐름으로 배포된다(앱이 소스를 직접 컴파일). `dist/`는 커밋하지 않는다.
  vite는 6.x(서버 Node 18 호환 — Vite 7은 Node 20.19+)로 둔다.
- **`npm run build`는 `prebuild`(`npm run build:gis-demo -- --copy-to public/demo/umd`)를 먼저 실행한다**(공개 데모 `/demo/umd/` 정적 예제 사본, `public/demo/umd/`는 gitignore).
  그래서 CI(`npm run build`)와 서버(`npm install && npm run build`) 둘 다 **빌드 시간이 늘고(vite 빌드 2회 + 복사) vite·조립 스크립트가 실패하면 빌드가 멈춰 배포도 실패한다.**
  서버 컨테이너(`node:18`)에서 vite 6이 도는지, 이식성 검사에 걸리지 않는지는 배포 로그로 확인한다. 로컬 `npm run dev`에는 prebuild가 안 돈다.
- **프록시(`/proxy/**`) 로그인 검사 — 환경 변수 2개(서버 전용, `/gtp/GTProject/frontend/.env.local` 등에 두고 `gtp-frontend` 재시작).**
  프론트 컨테이너(`node:18`, host network 아님)가 백엔드 `GET /api/auth/me`를 불러 로그인을 확인한다. 컨테이너 안의 `localhost:8080`은 백엔드가 아니다.
  - `API_INTERNAL_URL` — 검증 호출 주소. 없으면 `NEXT_PUBLIC_API_URL`, 그것도 없으면 `http://localhost:8080`. 컨테이너에서 닿는 주소(공개 도메인 `https://api.gitaey-dev.com` 또는 compose 네트워크 이름 등)를 넣는다. 실제로 닿는지는 아직 확인하지 못했다.
  - `PROXY_AUTH_DISABLED=1` — 검사를 끄는 비상 스위치(기본은 켜짐). 켜면 익명이 VWorld 키 한도를 쓸 수 있으니 **임시로만** 쓴다.
  - **배포 직후 확인:** 로그인한 `/map`에서 필지 클릭·주소 검색이 되는지 본다. 안 되면 `docker logs gtp-frontend`에서 `[proxy-auth]` 줄을 찾는다
    (`백엔드 검증 호출 실패: <호스트> (…)` → 주소가 틀렸거나 닿지 않음). → `API_INTERNAL_URL`을 설정하고 재시작, 급하면 임시로 `PROXY_AUTH_DISABLED=1`.
    로그에 아무것도 없는데 전부 401이면 백엔드가 `/api/auth/me`에 4xx를 주는 것(주소가 다른 서비스를 가리킴 등)이라 로그가 없다 — 주소부터 의심한다.

**push가 곧 배포다.** 사용자가 요청할 때만 push한다.

## 서버 구성 (docker compose)

| 서비스 | 컨테이너 이름 | 포트(호스트→컨테이너) | 비고 |
|---|---|---|---|
| nginx | `gtp-nginx` | host network | 설정은 서버 `/gtp/nginx` (저장소에 없음). 인증서 갱신은 `docker stop gtp-nginx` → certbot → `docker start gtp-nginx` |
| frontend | `gtp-frontend` (`node:18`) | 49092→3000 | gitaey-dev.com |
| backend | `gtp-backend` | 49090→8080 | api.gitaey-dev.com, `/gtp/geotiff` 마운트, GDAL 포함 이미지 |
| bot | `gtp-bot` | 49093→8081 | 서버의 8081은 다른 Tomcat 서비스가 쓰므로 호스트 포트는 49093 |
| postgis 16-3.4 | `gtp-postgres` (`postgis/postgis:16-3.4`) | 49091→5432 | DB `gtpdb`, external volume. psql은 `docker exec -it gtp-postgres psql -U <계정> -d <DB>` |
| geoserver 2.25.2 | `gtp-geoserver` (`kartoza/geoserver:2.25.2`) | 49094→8080 | geo.gitaey-dev.com |
| titiler | `gtp-titiler` | 49095→8000 | `/gtp/geotiff` 마운트 |

환경 변수는 서버 `/gtp/docker/.env`. 저장소 루트의 `docker-compose.yml`은 서버 구성을 옮겨 둔 사본이다.

## 서버 디스크 배치 (2026-10-19 `df -h` 기준)

- 루트 `/` 50GB(여유 약 34GB). 서버의 `/gtp`(compose `/gtp/docker`, 저장소 `/gtp/GTProject`, nginx `/gtp/nginx`, `/gtp/geotiff` 업로드)가 **루트 디스크에 있다.**
- `/data` 7.3TB(여유 약 4.7TB) — docker 저장소(`/data/docker`)가 여기 있어 이름 있는 볼륨의 데이터는 `/data` 쪽에 들어간다. `/project` 3.1TB(여유 2.4TB), `/home` 500GB.
- DB(`gtp-postgres`) 데이터는 이름 있는 볼륨이라 `/data/docker/volumes/...`(= `/data` 디스크)에 있다(2026-10-19 확인). 큰 데이터(연속지적도 등)는 루트가 아니라 `/data`나 `/project`에 두어야 한다. GeoTIFF 업로드(`/gtp/geotiff`)는 루트를 쓰니 용량을 늘릴 일이 있으면 옮길 것.

## 주의

- **compose 파일과 Dockerfile에 비밀번호를 평문으로 쓰지 않는다.** `${VAR}`로 참조하고 값은 `.env`에 둔다.
  이 저장소는 public이라 한 번 커밋된 값은 기록에 남는다.
- CORS 허용 Origin(`backend/.../global/config/CorsConfig.java`, `bot/.../CorsConfig.java`)은 배포 도메인과 맞춘다.
- `.claude/launch.json`의 "Kakaobot (Node.js)"와 `GTProject.code-workspace`의 Kakaobot 폴더는 존재하지 않는
  경로를 가리킨다(옛 설정).
