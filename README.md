# 워터케어 ONE — JAC104D 고객케어 프로토타입

PM FIX 화면설계서인 **「화면설계서 통합본 — JAC104D 팀원 B 시스템 정합성 반영 v6」**를 기준으로 구현한 역할 연계형 HTML 프로토타입입니다.

고객이 증상과 문진을 한 번 제출하면 같은 문의 ID를 상담원과 방문기사가 이어서 처리하고, 고객 피드백 후 담당자가 최종 완료합니다. 운영직원은 이 전체 흐름을 조회 전용 대시보드에서 확인합니다.

> 모든 고객·제품·문의·일정·담당자 정보는 시연용 합성 데이터입니다.

## 현재 구현 범위

| 구분 | 확정 범위 |
| --- | --- |
| 기본 모델 | `WPUJAC104DWH` |
| 모델 세대 | D 세대 |
| 관리 유형 | 방문관리 |
| 공식 문서 | WPU-JAC104D/JCC104D 사용설명서 `REV.00` |
| 합성 고객·제품 | 각 6건 |
| 고정 시연 문의 | 6종 |
| 공식 근거 DTO | 7건 |
| 역할 화면 | 고객·상담원·방문기사·운영직원 |

`WPUIAC425SNW`는 후속 확장 모델이므로 현재 활성 화면의 제품 선택·증상 메뉴·검색 범위에서 숨겼습니다. D 세대에서 공식 지원 범위로 확정되지 않은 IoT 케어, 앱 연결, 원격 관리, 얼음 기능과 AI 스마트 준비도 활성 화면에서 제외했습니다.

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

- `CUST-01`: 지원 제품, 케어 일정 출처, 문진 상태, 진행 문의와 다음 행동
- `CUST-02`: 대표 증상 4개와 기타, 복수 선택, 고객 원문, 발생 조건, 표시 문구, 임시 저장·취소
- `CUST-03`: 이미 받은 답변을 제외한 누락 질문, AI 단계와 실패 안내
- `CUST-04`: 행동 → 위험·사용 제한 → 안전조치 → 상담 조건 → 공식 근거 → 요약 → 금지행동 순서
- `CUST-05`: 일반 자가조치 결과 또는 위험 안전조치 확인·상담 요청
- `CUST-06`: 상담·방문 결과, 사용 안내 상태, 공식 근거, 타임라인, 해결·미해결·상담 재요청
- 확정 방문 일정 변경 요청: 승인 전까지 기존 확정 상태를 유지하고 상담원에게 알림
- 고객 알림 선택 시 읽음 처리 후 연결된 `CUST-06` 문의 상세로 이동

### 상담원 PC 웹

- 위험 문의, 상담 필수 문의, 고객 해결 피드백 도착 최종 대기 문의 우선 큐
- 고객 원문·구조화 답변·AI 상태·EvidenceCardDTO·사용 안내·전체 타임라인 조회
- 상담 시작과 결과 기록
- 방문 필요 검토, 기사 배정, 희망일·확정일·전달사항·안전 유의사항 등록
- 고객 미해결 `REOPENED` 상담 재시작과 기사 `REVISIT_REQUIRED` 추가 방문 일정 재조율
- 상담 경로의 고객 해결 피드백 확인 후 담당 상담원 최종 완료

### 방문기사 태블릿 앱

- 본인에게 배정된 확정·진행 방문과 최종 완료 대기 업무
- 날짜·상태 필터, 위험 문의 우선 정렬
- 고객·구독·문의·제품 식별, 상담 인계와 공식 근거, 현장 재확인
- `START_VISIT` 후 방문 결과 등록
- 실제 원인, 조치, 부품, 사용 안내, 제한 기능, 판단 근거, 다음 행동, 재방문·후속상담·특이사항
- 고객 서명 확인과 방문 경로 담당 기사 최종 완료

### 운영직원 PC 웹

- 기간, 모델, 관리 유형, 담당자, 증상, 위험도, 우선순위, 문의 상태, 처리 결과의 9개 조회 필터
- 증상·상태·상담 전환·방문 전환·처리 완료 집계
- 케어 일정 미산정, 문진 미응답, 처리 지연, 공식 근거 검색 실패, AI 처리 실패 예외
- 위험 감지·일정 변경·추가 방문 알림과 연결 상태 기준 즉시 필터
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
2. `DANGER` 또는 상담 필수 조건은 `DANGER_DETECTED` 이력과 함께 즉시 `CONSULTATION_REQUIRED`로 전환됩니다.
3. 안전조치 완료 여부와 상담 요청 시각은 별도 값으로 저장되며, 안전조치 미완료도 상담 요청을 막지 않습니다.
4. 상담 완료와 방문 완료는 항상 `COMPLETION_PENDING`으로 전환됩니다.
5. 고객이 `CUST-06`에서 해결됨을 제출해도 상태는 `COMPLETION_PENDING`으로 유지됩니다.
6. 상담 경로는 담당 상담원, 방문 경로는 담당 방문기사만 `FINALIZE_INQUIRY`를 수행할 수 있습니다.
7. 고객이 미해결을 제출하면 `REOPENED`, 기사가 추가 방문을 선택하면 `REVISIT_REQUIRED`가 되고 상담원이 다음 업무를 이어갑니다.

모든 변경 이벤트는 `stateVersion`을 검사하고 `idempotencyKey`로 중복 처리를 방지합니다. 알림·타임라인·감사 로그도 같은 트랜잭션에서 생성됩니다.

## 공식 근거 표시

활성 화면은 `assets/js/fix-data.js`의 `EvidenceCardDTO`만 사용합니다.

- 공식 매뉴얼·팀 설계·합성 시연·사용 보류를 시각적으로 구분
- 고객 화면은 내부 식별자를 숨긴 요약 카드 제공
- 상담원·방문기사 화면은 `evidenceId`, 문서·청크·버전·페이지·검증 상태를 업무용으로 표시
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

상태는 브라우저 `localStorage`의 `watercare.prototype.screen-fix-v6` 키로 저장됩니다.

- 같은 브라우저에서 고객·상담원·방문기사·운영 화면을 순서대로 열면 작업 상태가 이어집니다.
- 메인 홈의 **시연 데이터 초기화** 버튼으로 최초 6개 시나리오 상태로 되돌릴 수 있습니다.
- 스키마 또는 seed revision이 달라지면 자동으로 새 FIX 데이터가 적용됩니다.
- 서버·DB·인증·실제 알림 API는 연결되지 않은 프런트엔드 프로토타입입니다.

## 검증

전체 검증:

```powershell
cd C:\python-src\Final_PROJECT\mockup_260716
powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1
```

검증 항목:

- `requirements-v11.test.mjs`: FIX 모델·6개 시나리오·EvidenceCardDTO·화면·이벤트·역할 분리·반응형 계약
- `state-flow.test.mjs`: 고객 자가 해결, 위험·상담 필수 즉시 전환, 안전조치·상담 요청 분리 기록, 재개 상담, 상담 완료, 방문 시작·완료, 역할별 알림 생성·읽음 처리, 고객 피드백, 담당자 최종 완료, 재방문 재조율, 일정 변경, 중복 이벤트, 상태 충돌
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
│     ├─ fix-data.js
│     ├─ fix-store.js
│     ├─ fix-common.js
│     ├─ gateway-v6.js
│     ├─ customer-app-v6.js
│     ├─ counselor-app-v6.js
│     ├─ technician-app-v6.js
│     └─ operator-app-v6.js
└─ tests/
   ├─ run-tests.ps1
   ├─ requirements-v11.test.mjs
   ├─ state-flow.test.mjs
   └─ smoke_test.py
```

기존 `mock-data.js`, `store.js`, `customer.js`, `stakeholder.js`, `styles.css` 등은 이전 프로토타입 이력 보존용이며 **현재 역할 화면에서는 로드하지 않습니다.** 신규 수정은 `fix-*`와 역할별 `*-v6` 파일을 기준으로 진행합니다.

## 현재 한계

- 프런트엔드 프로토타입이므로 실제 고객 인증, 서버 데이터베이스, RAG API, 알림 발송, 기사 위치, 전자서명 법적 검증은 구현하지 않았습니다.
- 공식 URL은 새 탭으로 연결하지만 외부 사이트 가용성은 해당 서비스 상태에 영향을 받습니다.
- 운영 대시보드는 화면설계서의 P1 개략 범위로, 조회·집계·예외 확인까지만 제공합니다.
- 화면설계서에서 별도 이미지로 관리하도록 명시한 상세 픽셀 와이어프레임은 현재 제공된 정보 구조와 상태 계약을 기준으로 앱·웹 레이아웃으로 구체화했습니다.
