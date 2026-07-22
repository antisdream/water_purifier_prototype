# 팀원 B v4 정합성 반영·검증 기록

기준 문서: `팀원B_양정현_v4.md`
검증 대상: 현재 워터케어 프로토타입 저장소

## 이번에 반영한 차이

| 계약 | 반영 위치 | 검증 |
| --- | --- | --- |
| 문의 없는 사전 문진 | `QuestionnaireSession`, `START_CARE_PRECHECK`, 고객 저장·연결 UI | 문의 수 불변·후속 문의 연결 상태 테스트 |
| 지원 모델·필수값 가드 | `model-policy.js`, 제품 등록·검증·상담 대체 | 상품 코드·설명서 모델 동시 일치, 미지원 Inquiry 미생성·AI/RAG 차단 테스트 |
| 제품 상담 업무 연계 | 중복 요청 방지, 상담원 시작·완료, 고객·운영 알림 | 동일 요청 ID·담당 권한·완료 결과 연계 테스트 |
| AI 종료 사유 분리 | `SAFE_GUIDANCE_READY`, `DANGER_DETECTED`, `NO_EVIDENCE` | 종료 이벤트·상태·근거 배열 테스트 |
| 사용 제한 세분화 | 누수 `TOTAL_STOP`, 온수 모듈 `PARTIAL_STOP`, 근거 없음 `PENDING_CONSULTATION` | 시나리오별 상태·판단 근거·다음 행동 테스트 |
| AI 원본과 사람 수정본 | 상담원 저장 UI, 기사 사전 리포트 | 원본 불변·수정자·수정 시각·권한 테스트 |
| 근거 메타데이터 정합성 | 내부 검증은 `verificationStatus`, `scopeRole`, `applicability`, `allowedUse=mvp_primary`; 화면은 v13 24필드 DTO만 노출 | 7개 근거 전체 필드·enum·화면 DTO 테스트 |
| 방문 완료 후 케어 반영 | `careHistory`, `lastCareAt`, `lastFilterChangedAt`, 날짜·근거·상태가 분리된 `careSchedule` | 제품·구독·케어 이력·방문 ID 연계 테스트 |
| 운영 상태 분리 | Inquiry·AI·Visit 필터와 예외·제품지원요청 패널 | 정적 계약·조회 전용 검사 |

## 그대로 유지한 시연 기능

- 역할 선택 게이트웨이와 역할별 독립 진입
- 고객 방문 일정 조회 전용(v13 권한 계약에 따라 변경 요청 제거)
- 방문기사 고객 서명
- 역할 알림 읽음·상세 이동
- 고객 전환용 합성 데이터
- 운영 조회 대시보드
- 스마트폰·태블릿·PC별 화면 레이아웃

## 검증 결과 해석

`tests/run-tests.ps1`은 정적 구조, JavaScript 문법, 합성 상태 전이, 역할 권한, 근거 DTO와 연결성을 검증합니다. 실제 API·DB·LLM·Vector DB·검색 품질·보안·성능·전자서명 효력은 검증하지 않습니다.
