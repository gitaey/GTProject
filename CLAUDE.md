# GT Project 작업 지침서

## 프로젝트 개요
Next.js + React + OpenLayers + Zustand 기반의 지도 대시보드 프로젝트

## 기술 스택
- **Frontend**: Next.js 15.4.4, React 19.1.0
- **State Management**: Zustand 4.4.7
- **Map**: OpenLayers 10.4.0
- **Styling**: Tailwind CSS 4
- **Language**: TypeScript (strict mode)

## 폴더 구조
```
frontend/src/
├── app/                    # Next.js App Router 페이지
├── components/
│   ├── layout/            # 레이아웃 (Sidebar, Header)
│   ├── dashboard/         # 대시보드 위젯
│   └── map/               # 지도 관련 컴포넌트
└── stores/                # Zustand 스토어
```

## 코딩 컨벤션

### 네이밍
- 컴포넌트 파일: PascalCase (`MapPopup.tsx`)
- 함수/변수: camelCase (`handleClick`)
- 상수: UPPER_SNAKE_CASE (`API_URL`)
- 타입/인터페이스: PascalCase (`interface UserProps`)

### TypeScript
- 모든 파라미터에 타입 명시 (implicit any 금지)
- interface 우선 사용 (type보다)
- 컴포넌트 props는 `interface ComponentNameProps` 형식

### React
- 함수형 컴포넌트 사용
- 클라이언트 컴포넌트는 `'use client'` 명시
- hooks는 컴포넌트 최상단에 선언

### 스타일
- Tailwind CSS 클래스 사용
- 인라인 스타일 지양
- 반응형: `sm:`, `md:`, `lg:`, `xl:` 사용

## 주석
- 한글 주석 사용 가능
- 복잡한 로직에만 주석 추가
- TODO 주석 형식: `// TODO: 설명`

## 커밋 메시지
- 영어로 작성
- 형식: `Add/Update/Fix/Remove + 설명`
- 예: `Add map popup component`

## 주요 기능 (예정)
- [x] 대시보드 레이아웃
- [ ] 지도 팝업 (OpenLayers)
- [ ] Zustand 상태 관리
- [ ] 마커/레이어 관리
- [ ] 데이터 내보내기
