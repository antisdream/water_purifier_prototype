(function () {
  "use strict";

  // 호환용 읽기 전용 설정. 실제 화면 상태·권한은 core/store.js의 v13 계약을 사용한다.
  window.WATERCARE_WORKFLOW_CONFIG = {
    version: "SCREEN-DESIGN-V13",
    prototypeMode: true,
    activeRuntime: false,
    roleScreens: {
      CUSTOMER: ["CUST-01", "CUST-02", "CUST-03", "CUST-04", "CUST-05", "CUST-06"],
      COUNSELOR: ["CONS-01", "CONS-02", "CONS-03"],
      TECHNICIAN: ["TECH-01", "TECH-02", "TECH-03"],
      OPERATOR: ["ADMIN-01"]
    },
    inquiryStates: [
      "DRAFT", "QUESTIONNAIRE_IN_PROGRESS", "AI_GUIDANCE", "CONSULTATION_REQUIRED",
      "CONSULTATION_IN_PROGRESS", "VISIT_REVIEW_PENDING", "VISIT_SCHEDULING",
      "VISIT_SCHEDULED", "COMPLETION_PENDING", "REOPENED", "REVISIT_REQUIRED",
      "RESOLVED", "CANCELLED"
    ],
    visitStates: ["ASSIGNING", "SCHEDULING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "FOLLOW_UP_REQUIRED"],
    automaticEvents: ["PRODUCT_VALIDATION_FAILED", "SAFE_GUIDANCE_READY", "DANGER_DETECTED", "NO_EVIDENCE"],
    contentCommands: [
      "UPDATE_CONSULTATION_SUMMARY", "CONFIRM_CONSULTATION_SUMMARY",
      "UPDATE_PREVISIT_REPORT", "CONFIRM_PREVISIT_REPORT"
    ],
    modelScope: {
      MVP_PRIMARY: { productCode: "WPUJAC104DWH", manualModel: "WPU-JAC104D", aiRagAllowed: true },
      EXPANSION_SECONDARY: { productCode: "WPUIAC425SNW", manualModel: "WPU-IAC425", aiRagAllowed: false, customerVisible: false }
    },
    performanceTargets: {
      aiP95Milliseconds: 10000,
      measurementNote: "운영 서버 연결 후 실제 p95를 측정해야 하는 목표 계약입니다."
    }
  };
}());
