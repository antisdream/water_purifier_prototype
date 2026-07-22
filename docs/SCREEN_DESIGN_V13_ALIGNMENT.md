# 화면설계서 v13 반영 추적표

- 기준 문서: `C:\python-src\Final_PROJECT\20260722\화면설계서_최종완성본_v13.md`
- 적용 대상: `C:\python-src\Final_PROJECT\mockup_260716` 활성 런타임
- 기획서 버전: `기획서 v0.1.docx` 유지

## 반영 범위

| v13 계약 | 반영 위치 | 구현 확인 기준 |
| --- | --- | --- |
| 역할 선택 홈 유지, 역할 간 직접 전환 금지 | `index.html`, 4개 역할 HTML | 각 역할에서 홈으로만 복귀 |
| 고객 스마트폰·기사 태블릿·직원 PC 레이아웃 | 역할 HTML·역할별 CSS | 역할별 독립 반응형 레이아웃 |
| 12개 P0 화면 + `ADMIN-01` P1 | 역할별 `app.js` | `CUST-01~06`, `CONS-01~03`, `TECH-01~03`, `ADMIN-01` 표시 |
| Backend 반환 버튼 권한 | `core/store.js#getAllowedActions`, 역할 앱 | 상태·역할·담당자별 버튼 표시 후 Store 재검증 |
| 공통 상태 응답 | `core/store.js#getInquiryView` | 현재 상태·담당 주체·다음 단계·고객 행동·변경 시각·허용 행동 제공 |
| 조회·명령 권한 경계 | Store 인증·담당자·문의-방문 연결 Guard | 무인증, 타 담당자, 미배정 기사, 교차 `visitId` 요청 차단 |
| 고객 방문 일정 조회 전용 | 고객 HTML·앱 | 일정 변경 폼·이벤트 제거, 확정 일정만 표시 |
| 상담 요약 수정·확정 | `UPDATE_CONSULTATION_SUMMARY`, `CONFIRM_CONSULTATION_SUMMARY` | 상태 유지, 원본 보존, 담당 상담사·버전 검증 |
| 기사 사전 리포트 수정·확정 | `UPDATE_PREVISIT_REPORT`, `CONFIRM_PREVISIT_REPORT` | Visit 상태 유지, 담당 기사·버전 검증 |
| 재개 문의 순차 전이 | `RESUME_CONSULTATION`, `START_CONSULTATION` | `REOPENED → CONSULTATION_REQUIRED → CONSULTATION_IN_PROGRESS` |
| 상담·방문 완료 정책 | 고객 피드백·`FINALIZE_INQUIRY` | 항상 `COMPLETION_PENDING`, 경로별 담당자만 최종 완료 |
| 완료 처리자 메타데이터 | Inquiry `finalizedByType/Id/At` | `customer_self`, `counselor`, `engineer` 구분 |
| v13 사용 안내 필드 | Simulator·Store·역할 앱 | `usageGuidanceStatus`, `usageGuidanceMessage`, `restrictedFunctions`, `guidanceBasis`, `nextAction` |
| 24필드 EvidenceCardDTO | Seed·`getInquiryView` | 공식 화면 DTO에서 내부 원문·경로·정책 필드 제외 |
| AI 6단계 trace와 자동 전이 경계 | `ai-rag-simulator.js`, `core/store.js` | AI는 종료 사유 반환, Store만 상태 변경 |
| AI 실패 복구 | 합성 문의 `DEMO-INQ-007`, `RETRY_AI_PROCESS` | 실패 단계·오류·재시도 횟수 보존, 최대 2회 후 상담 전환 |
| 추적·동시성·멱등성 | `stateVersion`, `idempotencyKey`, `correlationId` | AI trace·알림·타임라인·감사 로그 연결 |
| MVP 제품 범위 | Config·Model Policy·고객 UI | JAC104D만 고객 MVP 제공, IAC425 숨김·AI/RAG 차단 |
| 삭제 레거시 정책 | Model Policy·Store | IAC506 레지스트리/seed 부재, 입력 시 `MODEL-LEGACY-01`, 무저장 |
| 방문 결과·케어 이력 | Store·기사 `TECH-03` | 반영 선택 시에만 최근 관리일·필터·다음 일정 갱신, 미반영 선택은 결과만 보존 |
| 운영 조회 전용 예외 | 운영 앱 | 위험·지연·미처리·AI/RAG 실패·일정 기준 없음 조회 |

## 검증 명령

```powershell
cd C:\python-src\Final_PROJECT\mockup_260716
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\run-tests.ps1
```

`screen-design-v13.test.mjs`는 v13 신규 계약과 무인증 조회, 교차 방문 ID, 미확정 재방문, 케어 미반영, 위험 근거 없음, 제품 변경 후 근거 무효화, AI 재시도 초과 같은 우회 요청을 동적으로 검증합니다. `counselor-render.test.mjs`는 상담원 화면의 초기 DOM 렌더링과 로딩 상태 해제를 검증하고, 이전 회귀 테스트와 정적 smoke 검사는 기존 기능·HTML/CSS/JS 구조가 함께 깨지지 않았는지 확인합니다.

## 프로토타입 경계

- 실제 Backend API, 인증 서버, 관계형 DB, LLM, Vector DB와 RAG 검색은 연결하지 않았습니다.
- 알림·업무 연계는 동일 브라우저의 `localStorage` 트랜잭션으로 모사합니다.
- 기사 배정·일정은 합성 데이터이며 실제 예약·경로 최적화 API를 호출하지 않습니다.
- 전자서명은 UX 확인용 문자열이며 법적 효력·위변조 검증을 구현하지 않았습니다.
- 정적·합성 상태 테스트 통과는 실제 AI 정확도, 운영 성능, 보안, 장애 복구를 보증하지 않습니다.
