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
  지도 패키지 `frontend/packages/gis-map/`은 frontend 안이라 같은 흐름으로 배포된다(앱이 소스를 직접 컴파일). UMD 빌드(`build:gis-umd`)는
  CI가 돌리지 않고 `dist/`는 커밋하지 않는다. vite는 6.x(서버 Node 18 호환 — Vite 7은 Node 20.19+)로 둔다.

**push가 곧 배포다.** 사용자가 요청할 때만 push한다.

## 서버 구성 (docker compose)

| 서비스 | 포트(호스트→컨테이너) | 비고 |
|---|---|---|
| nginx | host network | 설정은 서버 `/gtp/nginx` (저장소에 없음) |
| frontend | 49092→3000 | gitaey-dev.com |
| backend | 49090→8080 | api.gitaey-dev.com, `/gtp/geotiff` 마운트, GDAL 포함 이미지 |
| bot | 49093→8081 | 서버의 8081은 다른 Tomcat 서비스가 쓰므로 호스트 포트는 49093 |
| postgis 16-3.4 | 49091→5432 | DB `gtpdb`, external volume |
| geoserver 2.25.2 | 49094→8080 | geo.gitaey-dev.com |
| titiler | 49095→8000 | `/gtp/geotiff` 마운트 |

환경 변수는 서버 `/gtp/docker/.env`. 저장소 루트의 `docker-compose.yml`은 서버 구성을 옮겨 둔 사본이다.

## 주의

- **compose 파일과 Dockerfile에 비밀번호를 평문으로 쓰지 않는다.** `${VAR}`로 참조하고 값은 `.env`에 둔다.
  이 저장소는 public이라 한 번 커밋된 값은 기록에 남는다.
- CORS 허용 Origin(`backend/.../global/config/CorsConfig.java`, `bot/.../CorsConfig.java`)은 배포 도메인과 맞춘다.
- `.claude/launch.json`의 "Kakaobot (Node.js)"와 `GTProject.code-workspace`의 Kakaobot 폴더는 존재하지 않는
  경로를 가리킨다(옛 설정).
