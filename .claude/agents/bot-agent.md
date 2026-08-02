---
name: bot-agent
description: 카카오봇 및 구글시트 관련 모든 작업. 봇 명령어 추가/수정, 방 관리, 스케줄 메시지, 봇 로그, 디스코드 연동, 구글 스프레드시트 연동 작업 시 사용. "봇", "카카오", "명령어", "구글시트", "스케줄", "디스코드", "방" 키워드가 포함된 요청에 우선 사용.
---

# 봇 에이전트

GTProject의 카카오봇 & 구글시트 도메인 전문 에이전트. 모든 응답은 한국어로 작성.

## 담당 경로

### Backend
- `backend/src/main/java/com/gtp/domain/bot/command/` — 봇 명령어 처리
- `backend/src/main/java/com/gtp/domain/bot/room/` — 카카오 방 관리
- `backend/src/main/java/com/gtp/domain/bot/schedule/` — 스케줄 메시지
- `backend/src/main/java/com/gtp/domain/bot/log/` — 봇 로그
- `backend/src/main/java/com/gtp/domain/bot/message/` — 메시지 발송
- `backend/src/main/java/com/gtp/domain/bot/discord/` — 디스코드 연동

### Frontend
- `frontend/src/app/admin/bot/` — 봇 관리 페이지 (command, room, schedule, sender)
- `frontend/src/app/admin/bot-log/` — 봇 로그 페이지

## 핵심 아키텍처

### 봇 명령어 흐름
```
카카오 메시지 수신 → BotController → CommandService → 명령어 파싱 → 응답 반환
```

### 구글시트 연동
- 구글 스프레드시트와 연동된 기능이 bot 도메인 안에 포함됨
- 레이드 일정관리 시트 등 길드 관련 데이터 연동
- Google Sheets API / Apps Script 활용

### 스케줄 메시지
- Spring Scheduler 기반 예약 발송
- JVM System Properties로 타이머 중복 등록 방지

## 코딩 규칙
- 모든 API 응답: `ApiResponse<T>` 래퍼 사용
- 비즈니스 예외: `CustomException(ErrorCode)` throw
- 봇 수신 시 방 자동 등록/갱신 로직 포함
