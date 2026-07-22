# 프로토타입 활성 아키텍처

이 문서는 `팀원B_양정현_v4.md`의 시스템·AI·RAG 책임 경계를 정적 HTML 프로토타입에서 어떻게 모사하는지 설명합니다. 실제 서버 구조를 구현했다고 주장하지 않으며, 브라우저 안에서 화면·이벤트·데이터 계약을 검증하는 범위만 다룹니다.

## 활성 의존 방향

```text
core/app-config
  ↓
domain/model-policy ── domain/ai-rag-simulator
  ↓                         ↓
data/seed-data ─────────────┘
  ↓
infrastructure/browser-state-repository
  ↓
core/store
  ↓
ui/common
  ↓
roles/{gateway,customer,counselor,technician,operator}/app
```

역할 앱은 서로를 직접 불러오지 않습니다. 모든 역할은 같은 저장소 상태와 이벤트 계약을 통해서만 연계됩니다.

## 디렉터리 책임

| 경로 | 책임 | 금지 사항 |
| --- | --- | --- |
| `core/app-config.js` | 스키마, seed revision, 제품 레지스트리, 기본 담당자 | 화면 렌더링·상태 변경 |
| `domain/model-policy.js` | 제품 지원범위 검증과 AI·검색 허용 여부 | DOM·localStorage 접근 |
| `domain/ai-rag-simulator.js` | 합성 입력 구조화, 위험 규칙, 근거 필터, 종료 사유 생성 | 실제 RAG·LLM을 호출했다고 표시 |
| `data/seed-data.js` | 합성 고객·제품·시나리오·근거 DTO | 업무 이벤트 처리 |
| `infrastructure/browser-state-repository.js` | localStorage·메모리 fallback | 업무 상태 전이 판단 |
| `core/store.js` | 역할 권한, 상태 전이, 멱등성, 알림·타임라인·감사 로그 | DOM 렌더링 |
| `ui/common.js` | 포맷·라벨·근거 카드 공통 표현 | 업무 상태 직접 변경 |
| `roles/*/app.js` | 역할별 화면 합성·입력·이벤트 연결 | 다른 역할 앱 직접 호출 |

## 브라우저 전역 계약

빌드 도구 없이 `file://` 실행을 유지하기 위해 다음 전역만 로드 순서대로 공개합니다.

```text
WaterCareConfig
WaterCareModelPolicy
WaterCareAIRAGSimulator
WATERCARE_FIX_SEED
WaterCareStateRepository
WaterCareStore
WaterCareUI
```

HTML의 스크립트 순서를 바꾸면 런타임 계약이 깨질 수 있으므로 `tests/runtime-helper.mjs`도 동일 순서를 사용합니다.

## 실제 구조와 프로토타입의 경계

| 문서상 운영 구조 | 이 프로토타입의 대응 | 구현 수준 |
| --- | --- | --- |
| Backend API·인증·권한 | `core/store.js` 역할·소유권 가드 | 합성 로컬 구현 |
| State Machine 서비스 | `core/store.js` 이벤트 switch·stateVersion·idempotencyKey | 합성 로컬 구현 |
| 관계형 DB | `browser-state-repository.js` localStorage | 대체 구현 |
| 위험 규칙 | `ai-rag-simulator.js` 선행 안전 분기 | 결정적 시뮬레이션 |
| RAG 검색·재정렬 | 검증 근거 DTO의 모델·범위·상태 필터 | 결정적 시뮬레이션 |
| LLM 구조화·생성 | 시나리오 매칭·템플릿 요약 | 결정적 시뮬레이션 |
| 운영 로그 | inquiry timeline·auditLog·AI trace | 합성 로컬 구현 |
| 실제 알림 | 역할별 localStorage 알림 | 대체 구현 |

실제 백엔드로 전환할 때 역할 화면은 상태를 직접 계산하지 않고 API DTO를 받아야 합니다. 현재 저장소와 시뮬레이터는 그 API 계약을 확인하기 위한 교체 가능한 경계입니다.

## 리팩터링 안전 규칙

1. 활성 HTML에서만 참조하는 파일을 수정합니다.
2. 역할 화면 간 직접 링크·함수 호출을 추가하지 않습니다.
3. 운영 화면은 조회 전용으로 유지합니다.
4. `NO_EVIDENCE`를 `DANGER_DETECTED`로 대체하지 않습니다.
5. 위험도와 사용 제한 상태를 같은 값으로 취급하지 않습니다.
6. AI 원본, 사람 수정본, 기사 실제 원인을 덮어쓰지 않고 분리 저장합니다.
7. 테스트 통과를 실제 AI/RAG 품질 검증으로 표현하지 않습니다.
