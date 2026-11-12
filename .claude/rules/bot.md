---
paths:
  - "bot/**"
  - "backend/src/main/java/com/gtp/domain/bot/**"
  - "backend/src/main/java/com/gtp/domain/lostark/**"
  - "frontend/src/app/admin/bot/**"
  - "frontend/src/app/admin/bot-log/**"
---

# 봇 규칙

## 두 곳에 있는 봇 코드

- `bot/`은 별도 Spring Boot 서비스("기빵봇", 포트 8081)다. 카카오봇 명령 처리, 디스코드(JDA 5),
  로스트아크 API, lopec 크롤링(jsoup), 구글시트 연동, 스케줄 발송을 한다.
- `backend/`의 `domain/bot/{command,room,schedule,log}`와 `domain/lostark`에도 **같은 경로의 컨트롤러가
  중복으로 있다.** 두 서비스는 같은 DB 테이블(`bot_command`, `bot_room`, `bot_schedule`, `bot_log`)을 쓴다.
  `/api/bot/message`와 디스코드는 `bot/`에만 있다.
- 어느 쪽이 실제로 요청을 받는지는 서버의 nginx 라우팅이 정한다(저장소에 없음). 확실하지 않으면 사용자에게 묻는다.
- `bot/`은 `ddl-auto: validate`다. 봇 엔티티를 바꾸면 **양쪽 모두** 맞춰야 하고, 스키마가 다르면 `bot/`이
  시작하지 못한다.

## 기빵봇 작업 프로세스

기빵봇(bot/) 관련 기능을 추가하거나 수정할 때 반드시 아래 순서를 따른다.

1. **설계 작성** — 명령어 이름, 호출 API, 응답 형식, DTO 구조 등을 정리해 보여준다.
2. **디자인 목업** — 실제 봇 응답 메시지가 어떻게 보일지 텍스트 목업을 만들어 보여준다.
3. **진행 여부 확인** — 사용자가 OK하기 전에는 구현하지 않는다.
4. **구현 후 직접 테스트** — 로컬에서 bot을 실행하고 API를 직접 호출해 응답 결과를 사용자에게 보여준다. 테스트 없이 완료 선언 금지.
5. **커밋/푸시 여부 확인** — 테스트 성공 후 커밋·푸시할지 사용자에게 묻는다.

## 연동

- 구글시트: 시트 이름 `레이드일정`, `캐릭터`. 인증은 `GOOGLE_CREDENTIALS_JSON` 또는 classpath의
  `google-credentials.json`(gitignore).
- 로스트아크: `developer-lostark.game.onstove.com` API(`LOSTARK_API_KEY`).
- 스케줄 발송: `bot/.../schedule/scheduler/BotScheduleRunner`가 매분(`0 * * * * *`, Asia/Seoul) DB의
  스케줄을 확인해 보낸다.
- 봇 메시지를 받으면 `BotMessageService`가 방(room)을 `upsert`로 자동 등록/갱신한다.
