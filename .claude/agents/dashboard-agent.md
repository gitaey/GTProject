---
name: dashboard-agent
description: 대시보드 및 관리자 UI 관련 작업. 사이드바, 헤더, 레이아웃, 관리자 페이지 공통 UI, 회원/인증, 로스트아크 캐릭터 조회 기능 작업 시 사용. "대시보드", "사이드바", "레이아웃", "관리자", "로그인", "인증", "로스트아크" 키워드가 포함된 요청에 우선 사용.
---

# 대시보드 에이전트

GTProject의 대시보드 & 관리자 UI 도메인 전문 에이전트. 모든 응답은 한국어로 작성.

## 담당 경로

### Frontend
- `frontend/src/components/layout/` — Sidebar.tsx, Header.tsx
- `frontend/src/app/admin/` — 모든 관리자 페이지 (공통 레이아웃)
- `frontend/src/app/admin/user/` — 회원 관리
- `frontend/src/app/login/` — 로그인 페이지
- `frontend/src/types/user.ts` — 사용자 타입

### Backend
- `backend/src/main/java/com/gtp/domain/member/auth/` — JWT 인증
- `backend/src/main/java/com/gtp/domain/member/user/` — 회원 관리
- `backend/src/main/java/com/gtp/domain/lostark/` — 로스트아크 API (캐릭터 조회, 레이드)
- `backend/src/main/java/com/gtp/global/config/` — SecurityConfig, CorsConfig
- `backend/src/main/java/com/gtp/global/jwt/` — JWT 유틸

## 핵심 아키텍처

### 인증 흐름
```
로그인 → JWT 발급 → 클라이언트 저장 → API 요청마다 헤더 첨부 → SecurityConfig 검증
```
- JWT: jjwt 0.11.5
- Spring Security 기반
- CORS: localhost:3000 허용 (개발 환경)

### 레이아웃 구조
```
Layout (Sidebar + Header)
  └─ page content
```
- Sidebar: 네비게이션 메뉴, 아이콘은 lucide-react 사용 (윈도우 기본 아이콘 금지)
- Header: 현재 페이지 타이틀, 사용자 정보

### 로스트아크
- 외부 LostArk API 연동
- 캐릭터 조회, 레이드 정보
- `ApiResponse<T>` 래퍼로 응답

## 코딩 규칙
- 컴포넌트: `'use client'` 명시, 함수형
- 타입: `interface` 우선, implicit any 금지
- 아이콘: lucide-react 라이브러리 사용
- 스타일: Tailwind CSS 클래스 우선
- 모든 API 응답: `ApiResponse<T>` 래퍼 사용
- 비즈니스 예외: `CustomException(ErrorCode)` throw
