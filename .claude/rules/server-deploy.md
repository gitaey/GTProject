# 서버/배포 구조

## 기본 정보
- **OS**: CentOS Linux 7
- **SSH 포트**: 19922
- **프로젝트 경로**: `/gtp/GTProject/`

## 도메인 → 포트 매핑 (Nginx)
| 도메인 | 포트 | 서비스 |
|---|---|---|
| `gitaey-dev.com` | 49092 | 프론트엔드 (Next.js) |
| `api.gitaey-dev.com` | 49090 | 백엔드 (Spring Boot) |
| `geo.gitaey-dev.com` | 49094 | GeoServer |
| `sisnet.kr` | 8081 | SISNET_HOMPAGE Tomcat (별개 서비스) |
| bot (내부용) | 49093 | 기빵봇 (Spring Boot) |

## Docker 컨테이너 (`/gtp/docker/docker-compose.yml`)
| 컨테이너 | 이미지 | 포트 |
|---|---|---|
| gtp-nginx | nginx:alpine | host network |
| gtp-frontend | node:18 | 49092:3000 |
| gtp-backend | gtp-backend:latest | 49090:8080 |
| gtp-postgres | postgis/postgis:16-3.4 | 49091:5432 |
| gtp-bot | gtp-bot:latest | 49093:8081 |
| gtp-geoserver | kartoza/geoserver:2.24.0 | 49094:8080 |

- 환경변수: `/gtp/docker/.env`
- Nginx 설정: `/gtp/nginx/conf.d/gtp.conf`
- Google 인증: `/gtp/google-credentials.json`

## CI/CD
- GitHub Actions (`appleboy/ssh-action`) → SSH로 서버 접속 → git pull → docker build/run
- 워크플로우: `.github/workflows/deploy-backend.yml`, `deploy-frontend.yml`, `deploy-bot.yml`
- GitHub Secrets: `SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`

## 봇 서비스 배포 시 주의사항
- **포트 8081은 SISNET_HOMPAGE Tomcat이 점유 중** → 봇은 **49093** 포트 사용
- GeoServer는 **49094** 포트 사용
- `bot/src/main/resources/application.yml`의 서버 포트는 8081 유지 (컨테이너 내부 포트)

## 로컬 개발 시 주의사항
- 로컬 JDK가 여러 개 설치돼 있을 수 있음 — `mvnw`가 텍스트 블록(`"""`) 문법으로 컴파일
  에러가 나면 `JAVA_HOME`이 옛날 JDK(8 등)를 가리키고 있는지부터 확인할 것 (Java 17+ 필요)
- 로컬 빌드가 `.java` 파일의 한글이 깨져서 "unclosed string literal" 에러가 나면
  `pom.xml`에 `<project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>`와
  maven-compiler-plugin `<encoding>UTF-8</encoding>` 설정이 있는지 확인 (Windows 로컬
  환경에서 기본 플랫폼 인코딩이 UTF-8이 아니라 발생)
