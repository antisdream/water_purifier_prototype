(function () {
  "use strict";

  window.WATERCARE_WORKFLOW_CONFIG = {
    version: "WORKFLOW-1.0",
    prototypeMode: true,
    roleViews: {
      COUNSELOR: ["dashboard", "queue", "visits", "customers", "knowledge"],
      ENGINEER: ["visits", "knowledge"],
      OPERATOR: ["dashboard", "queue", "visits", "customers", "analytics", "knowledge", "audit"]
    },
    scheduleStatuses: {
      ASSIGNING: { label: "기사 배정 중", customerLabel: "방문기사를 배정하고 있어요" },
      COORDINATING: { label: "일정 조율 중", customerLabel: "희망 일정을 기사와 조율하고 있어요" },
      CONFIRMED: { label: "방문 확정", customerLabel: "방문 일정이 확정되었어요" }
    },
    questionnaire: {
      generationLeadDays: 7,
      requiredFields: ["flow", "leak", "taste", "temperature", "performedActions"],
      version: "PRE_VISIT_V2"
    },
    structuredInquirySchema: {
      version: "INQUIRY-STRUCTURED-V1",
      requiredFields: ["started", "targetWater", "condition", "errorCode", "companion", "recentNonUse", "performedActions", "lastCare"],
      requiredHandoffFields: ["id", "customerId", "productId", "description", "symptomTypes", "risk", "priority", "usageGuidance", "workflow", "questionAnswers", "generatedBy"]
    },
    safetyRules: {
      dangerPatterns: ["누수", "물이 고", "물기", "전원.*(젖|물)", "스파크", "연기", "타는\\s*냄새", "화상"],
      negativeLeakPatterns: ["누수[^,.;!?\\n]{0,18}(?:없|아니)", "물기(?:가|는)?\\s*(?:없|아니)[^,.;!?\\n]*"]
    },
    evidenceCatalog: {
      WPUIAC425SNW: {
        LOW_FLOW: { page: "24쪽", section: "출수량이 적을 때 확인사항", confidence: 0.93 },
        TASTE_ODOR: { page: "28쪽", section: "물맛·냄새가 평소와 다를 때", confidence: 0.91 }
      },
      WPUJAC115DNW: {
        LOW_FLOW: { page: "22쪽", section: "출수량이 적을 때 확인사항", confidence: 0.92 },
        TASTE_ODOR: { page: "18쪽", section: "장기간 사용하지 않은 경우", confidence: 0.91 },
        TEMPERATURE: { page: "32쪽", section: "냉·온수 온도가 이상할 때", confidence: 0.90 }
      }
    },
    selfActionTemplates: {
      LOW_FLOW: "제품 뒤쪽 원수 공급 밸브가 완전히 열려 있는지 눈으로 확인해 주세요.",
      TASTE_ODOR: "정수를 충분히 흘려보낸 뒤 물맛과 냄새가 계속되는지 확인해 주세요.",
      TEMPERATURE: "제품 뒤쪽 통풍 공간을 막는 물건이 없는지 확인하고, 이상이 있는 출수 기능은 사용을 멈춰 주세요.",
      SAFETY_FOOTER: "제품을 분해하거나 전기·급수 부품을 직접 만지지 마세요."
    },
    performanceTargets: {
      aiP95Milliseconds: 10000,
      screenP95Milliseconds: 3000,
      measurementNote: "운영 서버 연결 후 실제 p95를 측정해야 하며, 정적 프로토타입 수치는 목표 계약입니다."
    }
  };
})();
