# 워터케어 ONE — 화면설계서 v13 반영 프로토타입

PM FIX 문서 **「화면설계서_최종완성본_v13」**을 화면·상태·권한의 기준으로, **「팀원B_양정현_v4 — 시스템·AI·RAG 구조 설계」**를 시스템 경계의 보조 기준으로 구현한 역할 연계형 HTML 프로토타입입니다. 기획서는 아직 확정 전이므로 파일명과 버전을 `기획서 v0.1.docx`로 유지하며, 이 구현에서 기획서 버전을 임의로 올리지 않았습니다.

고객이 증상과 문진을 한 번 제출하면 같은 문의 ID를 상담원과 방문기사가 이어서 처리하고, 고객 피드백 후 담당자가 최종 완료합니다. 운영직원은 이 전체 흐름을 조회 전용 대시보드에서 확인합니다.

> 모든 고객·제품·문의·일정·담당자 정보는 시연용 합성 데이터입니다.

## 현재 구현 범위

| 구분 | 확정 범위 |
| --- | --- |
| 기본 모델 | `WPUJAC104DWH` |
| 모델 세대 | D 세대 |
| 관리 유형 | 방문관리 |
| 공식 문서 | WPU-JAC104D/JCC104D 사용설명서 `REV.00` |
| 합성 고객·제품 | 각 7건 |
| 고정 시연 문의 | 7종(정상·위험·상담·방문·완료·AI 실패 복구) |
| 공식 근거 DTO | 7건 |
| 독립 사전 문진 | 초기 2건 + 화면에서 생성 가능 |
| 모델 검증 범위 | `mvp_primary`·`expansion_secondary`·`unsupported`·`removed_legacy` |
| 역할 화면 | 고객·상담원·방문기사·운영직원 |

`WPUJAC104DWH / WPU-JAC104D`만 기본 MVP AI·RAG 시뮬레이션을 허용합니다. `WPUIAC425SNW / WPU-IAC425`는 **후속 확장**으로만 관리하며 고객 선택·등록·문진·AI/RAG 화면에서 숨기고 실행을 차단합니다. `WPUIAC506 / WPU-IAC506`은 v13의 `removed_legacy`이므로 운영 레지스트리·시나리오·근거·저장 데이터가 존재하지 않으며 입력 단계에서 `MODEL-LEGACY-01`로 차단합니다. S세대 입력은 `MODEL-GENERATION-01`로 차단합니다. IoT 케어, 앱 연결, 원격 관리, 얼음 기능과 AI 스마트 준비는 이 문서의 MVP 검색 계약에 포함하지 않았습니다.

실제 LLM·Vector DB가 없는 정적 프로토타입이므로 AI/RAG 영역은 `DETERMINISTIC_PROTOTYPE` 모드의 규칙 기반 시뮬레이터입니다. 이 모드는 화면·상태·근거 DTO 연계를 검증하기 위한 것이며 실제 검색 품질이나 AI 성능을 의미하지 않습니다.

## 일자별 패치노트

> 아래 내역은 폴더명이나 문서 작성일을 추정한 기록이 아니라 이 저장소의 실제 Git 커밋 날짜와 현재 변경 사항을 기준으로 정리했습니다. `mockup_260716` 폴더명은 최초 목업 기준일을 보존하지만, 저장소에서 확인되는 게시 이력은 2026년 7월 21일부터 시작합니다.

### 2026-07-21 — 초기 통합 프로토타입과 공개 저장소 구성

- 로컬 캐시·로그·비밀정보 제외 규칙과 텍스트·바이너리 추적 정책을 설정했습니다.
- 고객·제품·문의·방문·IoT·지식 분석 합성 데이터와 상담·방문 안전 상태 계약을 구성했습니다.
- 고객과 관계자가 동일한 문의 ID와 브라우저 공유 상태를 이어서 처리하도록 초기 워크플로 엔진을 구현했습니다.
- 고객 제품관리, 증상 문의, 사전 문진, 방문 일정 변경과 상담·방문·운영·지식 분석 통합 포털을 구현했습니다.
- 냉수·온수·제빙 사용량 그래프, AI 스마트 준비 구간과 드래그·터치·키보드 기반 360도 제품 뷰어를 추가했습니다.
- 메뉴 검색, 알림 센터, 팝업 닫기, 접근성·반응형 디자인과 역할 선택 게이트웨이를 구성했습니다.
- 상태 전이, 권한, 방문 완료, 요구사항 데이터 무결성, 실패 복구, HTML·HTTP 스모크 검증을 추가했습니다.
- 요구사항 교차검증·미반영 항목 보완 보고서와 실행·팀 공유 안내를 작성하고 공개 GitHub 저장소에 게시했습니다.

이 날짜의 일정 변경·IoT 사용량·스마트 준비·360도 뷰어 등은 초기 통합 목업 이력으로 보존됩니다. 현재 v13 활성 화면에서는 확정된 MVP 범위와 역할 권한을 우선하며, 활성 HTML이 불러오지 않는 레거시 자산은 실제 업무 화면 계약에 포함하지 않습니다.

### 2026-07-22 — 역할별 앱 분리, 구조 리팩터링과 화면설계서 v13 반영

- 고객·상담원·방문기사·운영직원 네 역할을 홈에서 독립 진입하도록 분리했습니다.
- 고객 `CUST-01~06`은 스마트폰 앱, 상담원 `CONS-01~03`과 운영직원 `ADMIN-01`은 PC 웹, 방문기사 `TECH-01~03`은 태블릿 앱 레이아웃으로 재구성했습니다.
- 공통 런타임을 `config → domain → data → repository → store → UI → role` 계층으로 리팩터링하고 역할별 앱 코드를 분리했습니다.
- `WPUJAC104DWH`를 MVP 기본 모델, `WPUIAC425SNW`를 후속 확장 모델로 정리하고 `WPUIAC506`과 S세대 입력은 저장 전에 차단했습니다.
- 독립 사전 문진, 미지원 제품 상담, AI 원본·상담사 수정·확정 요약, 기사 사전 리포트와 케어 이력 연계를 구현했습니다.
- 화면설계서 v13 기준 13개 화면 ID, 24필드 `EvidenceCardDTO`, 모델 정확 일치 근거 게이트와 `NO_EVIDENCE` 처리를 반영했습니다.
- 역할·담당자 권한, `stateVersion`, `idempotencyKey`, 교차 문의 방문 ID, 상담사 확정 요약, 기사 사전 리포트 확정 등 서버 역할의 Store 검증을 강화했습니다.
- AI 처리 실패 저장, 최대 2회 재시도, 상담 전환과 위험 문의의 근거 없음 차단을 구현했습니다.
- 방문기사의 현장 결과, 고객 사용 안내, 서명, 필터·카트리지와 다음 케어 일정 반영 여부를 분리 저장하도록 보완했습니다.
- 운영직원 화면을 조회 전용으로 유지하면서 문의·AI·방문·제품지원 상태와 운영 예외를 분리 조회하도록 정리했습니다.
- 화면설계 v13 계약, 상태 전이, 역할 권한, 우회 요청, 상담원 초기 렌더링과 정적 HTTP 구조를 자동 검증하도록 테스트를 확장했습니다.
- 아키텍처, 팀원B v4 정합성, 화면설계 v13 반영표와 현재 README를 실제 활성 소스 기준으로 현행화했습니다.

기획서는 아직 확정되지 않았으므로 `기획서 v0.1.docx`의 파일명과 버전은 변경하지 않았습니다.

## 역할별 진입 구조

모든 역할은 [index.html](./index.html)에서 독립적으로 진입합니다. 역할 화면끼리 직접 전환하지 않으며, 다른 역할을 사용하려면 역할 선택 홈으로 돌아갑니다.

| 역할 | 진입 파일 | 화면 환경 | 화면설계 ID |
| --- | --- | --- | --- |
| 고객 | [customer.html](./customer.html) | 스마트폰 앱형, 최대 430px 기기 프레임 | `CUST-01~06` |
| 상담원 | [counselor.html](./counselor.html) | PC 웹 업무 환경 | `CONS-01~03` |
| 방문기사 | [technician.html](./technician.html) | 태블릿 앱형, 768~1180px 최적화 | `TECH-01~03` |
| 운영직원 | [operator.html](./operator.html) | PC 웹 조회 환경 | `ADMIN-01` |

기존 통합 관계자 주소인 [stakeholder.html](./stakeholder.html)은 더 이상 역할 전환 화면을 제공하지 않고 역할 선택 홈으로 안내합니다.

## 화면별 주요 기능

### 고객 앱

- `CUST-01`: 제품 등록·수정, 지원범위 검증, 케어 일정 출처, 독립 문진 상태, 진행 문의와 다음 행동
- `CUST-02`: 3단계 진행 표시, 대표 증상과 기타, 복수 선택, 기존 답변 표시, 고객 원문, 발생 조건, 표시 문구, 임시 저장·취소
- `START_CARE_PRECHECK`: 문의 ID 없이 `QuestionnaireSession`만 생성·저장하고, 고객이 선택할 때 새 문의에 연결
- `CUST-03`: 이미 받은 답변을 제외한 누락 질문, AI 단계와 실패 안내
- `CUST-04`: `SAFE_GUIDANCE_READY`·`DANGER_DETECTED`·`NO_EVIDENCE`를 분리하고 실제 사용 제한 상태를 안내
- `CUST-05`: 일반 자가조치 결과 또는 위험 안전조치 확인·상담 요청
- `CUST-06`: 상담·방문 결과, 사용 안내 상태, 공식 근거, 타임라인, 해결·미해결·상담 재요청
- 제품 범위 예외: 확장 모델은 고객 입력 후보에서 숨기고, 삭제 레거시·S세대는 저장 전에 차단
- 방문 일정: 고객은 `CUST-06`에서 확정 일정을 조회만 하며 변경 권한은 제공하지 않음
- 고객 알림 선택 시 읽음 처리 후 연결된 `CUST-06` 문의 상세로 이동

### 상담원 PC 웹

- 위험 문의, 상담 필수 문의, 고객 해결 피드백 도착 최종 대기 문의 우선 큐
- 고객 원문·구조화 답변·AI 상태·EvidenceCardDTO·사용 안내·전체 타임라인 조회
- AI 원본 요약과 상담사 수정본을 분리하고 `UPDATE_CONSULTATION_SUMMARY`·`CONFIRM_CONSULTATION_SUMMARY`로 수정·기사 인계용 확정본 저장
- `scope_role`, `verification_status`, 문서·안전·제품 계보·분류 필드를 포함한 v13 EvidenceCardDTO 메타데이터 조회
- 제품 지원 범위 요청을 문의 큐와 분리해 `상담 대기 → 진행 → 완료` 처리하고 고객·운영 화면에 결과 전달
- 상담 시작과 결과 기록
- 방문 필요 검토, 기사 배정, 희망일·확정일·전달사항·안전 유의사항 등록
- 고객 미해결 `REOPENED` 문의를 `RESUME_CONSULTATION → CONSULTATION_REQUIRED → START_CONSULTATION` 순서로 재개하고 기사 `REVISIT_REQUIRED` 추가 방문 일정 재조율
- 상담 경로의 고객 해결 피드백 확인 후 담당 상담원 최종 완료

### 방문기사 태블릿 앱

- 본인에게 배정된 확정·진행 방문과 최종 완료 대기 업무
- 날짜·상태 필터, 위험 문의 우선 정렬
- 고객·구독·문의·제품 식별, 상담 인계와 공식 근거, 현장 재확인
- `START_VISIT` 후 방문 결과 등록
- 상담사 확정 요약을 우선 표시하고 `UPDATE_PREVISIT_REPORT`·`CONFIRM_PREVISIT_REPORT`로 기사 사전 리포트 수정·확정
- 실제 원인, 조치, 부품, 사용 안내, 제한 기능, 판단 근거, 다음 행동, 재방문·후속상담·특이사항
- 고객 서명 확인, 방문 완료 후 케어 이력·최근 관리일·필터 교체일·다음 일정 근거/확인 상태 반영, 방문 경로 담당 기사 최종 완료

### 운영직원 PC 웹

- 문의·AI·방문 상태를 분리한 조회 필터와 처리 현황
- 증상·상태·상담 전환·방문 전환·처리 완료 집계
- 케어 일정 미산정, 독립 문진 미응답, 처리 지연, `NO_EVIDENCE`, AI 처리 실패, 제품 검증 실패 등 예외
- 제품 검증 실패·삭제 레거시 차단과 AI/RAG 예외 확인
- 위험 감지·추가 방문 알림과 연결 상태 기준 즉시 필터
- 상태 변경 기능이 없는 P1 조회 전용 화면

## 연결된 상태·이벤트

### 문의 상태

```text
DRAFT
QUESTIONNAIRE_IN_PROGRESS
AI_GUIDANCE
CONSULTATION_REQUIRED
CONSULTATION_IN_PROGRESS
VISIT_REVIEW_PENDING
VISIT_SCHEDULING
VISIT_SCHEDULED
COMPLETION_PENDING
REVISIT_REQUIRED
REOPENED
RESOLVED
CANCELLED
```

### 방문 상태

```text
ASSIGNING → SCHEDULING → CONFIRMED → IN_PROGRESS → COMPLETED
                                             └→ FOLLOW_UP_REQUIRED
```

### 완료 정책

1. 일반 자가조치 단독 해결은 `CUSTOMER_REPORTED_SELF_RESOLVED` 후 즉시 `RESOLVED`됩니다.
2. `DANGER`는 `DANGER_DETECTED`와 함께 상담으로 전환하지만, 누수는 `TOTAL_STOP`, 온수 모듈 경고는 `PARTIAL_STOP`처럼 공식 근거에 따라 제한 범위를 나눕니다.
3. 공식 근거가 없으면 위험으로 추정하지 않고 `NO_EVIDENCE`·`PENDING_CONSULTATION`으로 전환합니다.
4. 안전조치 완료 여부와 상담 요청 시각은 별도 값으로 저장되며, 안전조치 미완료도 상담 요청을 막지 않습니다.
5. 상담 완료와 방문 완료는 항상 `COMPLETION_PENDING`으로 전환됩니다.
6. 고객이 `CUST-06`에서 해결됨을 제출해도 상태는 `COMPLETION_PENDING`으로 유지됩니다.
7. 상담 경로는 담당 상담원, 방문 경로는 담당 방문기사만 `FINALIZE_INQUIRY`를 수행할 수 있습니다.
8. 고객이 미해결을 제출하면 `REOPENED`, 기사가 추가 방문을 선택하면 `REVISIT_REQUIRED`가 되고 상담원이 다음 업무를 이어갑니다.

모든 업무 버튼은 `WaterCareStore.getAllowedActions()`가 현재 상태·역할·담당자를 기준으로 반환한 `allowed_actions`에 따라 노출됩니다. 클릭 후에도 Store가 권한과 상태를 다시 검사합니다. 모든 변경 이벤트는 `stateVersion`을 검사하고 `idempotencyKey`로 중복 처리를 방지하며, 같은 `correlationId`가 AI trace·타임라인·알림·감사 로그에 전파됩니다.

## 공식 근거 표시

활성 화면은 `assets/js/core/store.js`가 내부 근거 레지스트리를 검증해 조립한 `EvidenceCardDTO`만 사용합니다.

- 공식 매뉴얼·팀 설계·합성 시연·사용 보류를 시각적으로 구분
- 고객 화면은 내부 식별자를 숨긴 요약 카드 제공
- 상담원·방문기사 화면은 `evidenceId`, 문서·청크·버전·페이지·검증 상태를 업무용으로 표시
- 매뉴얼 근거의 `verificationStatus`는 `text_and_visual_verified`, `scopeRole`은 `mvp_primary`로 고정
- 화면 DTO에는 v13의 24개 확정 필드만 제공하고 내부 `applicability`, `allowedUse`, 원문·내부 경로는 노출하지 않음
- 내부 근거 게이트는 `allowedUse=mvp_primary`, `dataClassification=official`, 정확 모델·세대·계열·검증 상태를 모두 확인
- `공식 출처 보기`는 `sourceLandingUrl` 사용
- 검증 완료이면서 URL이 있는 경우에만 `설명서 PDF 열기` 제공
- 공식 근거가 없으면 임의 안전 안내를 생성하지 않고 상담 연결

## 실행 방법

### 개인 PC에서 바로 열기

```powershell
cd C:\python-src\Final_PROJECT\mockup_260716
start index.html
```

또는 파일 탐색기에서 `index.html`을 더블클릭합니다.

### 로컬 서버로 실행

```powershell
cd C:\python-src\Final_PROJECT\mockup_260716
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`으로 접속합니다.

### 같은 네트워크의 팀원이 접속

```powershell
cd C:\python-src\Final_PROJECT\mockup_260716
python -m http.server 8000 --bind 0.0.0.0
ipconfig
```

팀원은 같은 네트워크에서 `http://<실행-PC의 IPv4 주소>:8000`으로 접속합니다. Windows 방화벽에서 Python의 개인 네트워크 접근 허용이 필요할 수 있습니다.

서버 종료는 실행한 터미널에서 `Ctrl+C`입니다.

## 시연 데이터와 업무 연계

상태는 브라우저 `localStorage`의 `watercare.prototype.screen-design-v13` 키로 저장됩니다.

- 같은 브라우저에서 고객·상담원·방문기사·운영 화면을 순서대로 열면 작업 상태가 이어집니다.
- 메인 홈의 **시연 데이터 초기화** 버튼으로 최초 7개 시나리오 상태로 되돌릴 수 있습니다.
- 스키마 또는 seed revision이 달라지면 자동으로 새 v13 seed 데이터가 적용됩니다.
- 서버·DB·인증·실제 알림 API는 연결되지 않은 프런트엔드 프로토타입입니다.

## 검증

전체 검증:

```powershell
cd C:\python-src\Final_PROJECT\mockup_260716
powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1
```

검증 항목:

- `screen-design-v13.test.mjs`: v13 스키마, 24필드 EvidenceCardDTO, `allowed_actions`, 삭제 레거시 무저장, 콘텐츠 수정·확정 명령, 경로별 완료 확정자, `correlationId`
- `counselor-render.test.mjs`: 상담원 초기 렌더링이 로딩 상태를 벗어나 실제 상담 큐를 생성하는지 검증
- `requirements-v11.test.mjs`: 기존 계약의 v13 호환 회귀(모델 범위·7개 시나리오·모듈 로드·역할 화면·반응형)
- `state-flow.test.mjs`: 독립 사전 문진, 제품 검증 차단, 일반·위험·`NO_EVIDENCE`, 상담·방문 연계, 케어 이력, 알림, 최종 완료, 재방문, 중복 이벤트, 상태 충돌
- `smoke_test.py`: HTML 링크·중복 ID·스크립트 로드·UTF-8·JS 문법·CSS 구조·제외 기능 노출·운영 조회 전용

## 활성 소스 구조

```text
mockup_260716/
├─ index.html
├─ customer.html
├─ counselor.html
├─ technician.html
├─ operator.html
├─ stakeholder.html
├─ assets/
│  ├─ css/
│  │  ├─ fix-base.css
│  │  ├─ gateway-v6.css
│  │  ├─ customer-mobile.css
│  │  ├─ staff-desktop-v6.css
│  │  └─ technician-tablet.css
│  └─ js/
│     ├─ core/
│     │  ├─ app-config.js
│     │  └─ store.js
│     ├─ data/
│     │  └─ seed-data.js
│     ├─ domain/
│     │  ├─ model-policy.js
│     │  └─ ai-rag-simulator.js
│     ├─ infrastructure/
│     │  └─ browser-state-repository.js
│     ├─ ui/
│     │  └─ common.js
│     └─ roles/
│        ├─ gateway/app.js
│        ├─ customer/app.js
│        ├─ counselor/app.js
│        ├─ technician/app.js
│        └─ operator/app.js
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ SCREEN_DESIGN_V13_ALIGNMENT.md
│  └─ TEAM_B_V4_ALIGNMENT.md
└─ tests/
   ├─ run-tests.ps1
   ├─ counselor-render.test.mjs
   ├─ runtime-helper.mjs
   ├─ screen-design-v13.test.mjs
   ├─ requirements-v11.test.mjs
   ├─ state-flow.test.mjs
   └─ smoke_test.py
```

브라우저는 빌드 없이 `file://`에서도 동작하도록 ES module 대신 명시적인 순서의 IIFE 전역을 사용합니다. 의존 방향은 `config → domain → data → repository → store → UI → role`입니다. 자세한 경계와 전역 계약은 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)를 참고하세요.

기존 `mock-data.js`, `store.js`, `customer.js`, `stakeholder.js` 등은 이전 프로토타입 이력 보존용이며 **현재 5개 활성 HTML에서는 로드하지 않습니다.** `workflow-config.js`는 v13 용어로 정리한 비활성 호환 설정이며 실제 상태·권한은 `assets/js/core/store.js`가 담당합니다. 신규 기능 수정은 위 활성 구조만 대상으로 합니다.

## 현재 한계

- 프런트엔드 프로토타입이므로 실제 고객 인증, 서버 데이터베이스, LLM·Vector DB·RAG API, 알림 발송, 기사 위치, 전자서명 법적 검증은 구현하지 않았습니다.
- 정적·상태 테스트 통과는 실제 검색 정확도, AI 품질, 보안·성능·장애 복구를 보증하지 않습니다.
- 공식 URL은 새 탭으로 연결하지만 외부 사이트 가용성은 해당 서비스 상태에 영향을 받습니다.
- 운영 대시보드는 화면설계서의 P1 개략 범위로, 조회·집계·예외 확인까지만 제공합니다.
- 화면설계서에서 별도 이미지로 관리하도록 명시한 상세 픽셀 와이어프레임은 현재 제공된 정보 구조와 상태 계약을 기준으로 앱·웹 레이아웃으로 구체화했습니다.
