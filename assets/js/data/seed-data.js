(function () {
  "use strict";

  var Config = window.WaterCareConfig || {};

  var OFFICIAL_LANDING = "https://www.skintellixservice.com/web/easy/easyMain.do?inputBasicKeyword=WPUJAC104DWH&tabIndex=3";
  var OFFICIAL_PDF = "https://www.skintellixservice.com/common/fileDownloadS3.do?atchPath=cnts&atchNm=50f504a46a3843beb767baa6f9f94548&atchOrgNm=(rev00)%20WPU-JAC104%20(D)%2C%20JCC104%20(D)_User_KO_260428.pdf&atchExtNm=pdf";

  function evidence(id, chunkId, page, topicCode, summary, options) {
    options = options || {};
    return {
      evidenceId: id,
      chunkId: chunkId,
      documentId: "MAN-SKMAGIC-WPU-JAC104D-JCC104D-REV00",
      documentTitle: "SK매직 WPU-JAC104D/JCC104D 사용설명서",
      documentVersion: "REV.00",
      pageRefs: [page],
      sectionTitle: options.sectionTitle || "고장이라고 생각되면",
      topicCode: topicCode,
      evidenceSummary: summary,
      applicability: "model_exact",
      allowedUse: options.allowedUse == null ? "mvp_primary" : options.allowedUse,
      verificationStatus: Config.verifiedEvidenceStatus || "text_and_visual_verified",
      sourceType: "official_manual",
      provider: "SK매직",
      sourceLandingUrl: OFFICIAL_LANDING,
      sourceDirectDownloadUrl: OFFICIAL_PDF,
      productGeneration: "D",
      productCode: "WPUJAC104DWH",
      modelFamily: "WPU-JAC104",
      manualModel: "WPU-JAC104D",
      scopeRole: "mvp_primary",
      riskLevel: String(options.riskLevel || "GENERAL").toLowerCase(),
      requiresConsultation: Boolean(options.requiresConsultation),
      safeActions: (options.safeActions || []).slice(),
      escalationConditions: (options.escalationConditions || []).slice(),
      prohibitedActions: (options.prohibitedActions || []).slice(),
      dataClassification: "official"
    };
  }

  var evidenceRegistry = [
    evidence("EVD-JAC104D-MAN-P37-NO-WATER", "MAN-WPU-JAC104D-P37-NO-WATER", 37, "symptom_no_water", "필터 수명, 수도 단수와 연결 호스 꺾임을 확인합니다. 조치 후에도 출수되지 않으면 원수 밸브를 잠그고 전원을 분리한 뒤 상담합니다.", { riskLevel: "CAUTION" }),
    evidence("EVD-JAC104D-MAN-P37-COLD", "MAN-WPU-JAC104D-P37-COLD-WATER", 37, "symptom_cold_temperature", "전원, 연속 출수량, 냉수 잠금과 방열팬 먼지 필터를 확인합니다. 정상 전원 상태에서 2시간 뒤에도 차갑지 않으면 상담이 필요합니다.", { riskLevel: "CAUTION" }),
    evidence("EVD-JAC104D-MAN-P37-NOISE", "MAN-WPU-JAC104D-P37-NOISE", 37, "symptom_noise", "작동 중 발생하는 일부 팬·밸브·컴프레서 소리는 정상일 수 있습니다. 지나치게 큰 소음이 지속되면 상담합니다.", { riskLevel: "CAUTION" }),
    evidence("EVD-JAC104D-MAN-P38-LEAK", "MAN-WPU-JAC104D-P38-LEAK", 38, "symptom_leak", "제품 누수 시 원수 밸브를 잠그고 전원 플러그를 분리한 뒤 고객상담센터에 연락합니다.", { riskLevel: "DANGER", requiresConsultation: true, safeActions: ["원수 밸브 잠금", "안전하게 가능한 경우 전원 분리"], escalationConditions: ["누수가 계속되거나 전기부 주변에 물이 닿은 경우"] }),
    evidence("EVD-JAC104D-MAN-P38-TASTE-ODOR", "MAN-WPU-JAC104D-P38-TASTE-ODOR", 38, "symptom_taste_odor", "미사용 기간을 확인하고 공식 통수 절차를 수행합니다. 조치 후에도 맛·냄새 이상이 지속되면 점검 또는 필터 교체 상담이 필요합니다.", { riskLevel: "CAUTION" }),
    evidence("EVD-JAC104D-MAN-P38-LOW-FLOW", "MAN-WPU-JAC104D-P38-LOW-FLOW", 38, "symptom_low_flow", "다른 수전 동시 사용, 필터 수명, 순간온수 가동과 설치 수압을 확인합니다. 필터 교체 후에도 적으면 상담합니다."),
    evidence("EVD-JAC104D-MAN-P39-HOT-SAFETY", "MAN-WPU-JAC104D-P39-HOT-WATER-SAFETY", 39, "symptom_hot_water_safety", "순간온수 모듈 점검 문구가 표시되면 출수된 물을 음용하지 말고 전기 계통을 직접 수리하지 않은 채 상담합니다.", { riskLevel: "DANGER", requiresConsultation: true, safeActions: ["온수 사용 중지", "출수된 물 음용 중지"], escalationConditions: ["점검 문구가 계속 표시되는 경우"], prohibitedActions: ["전기 계통 직접 수리"] })
  ];

  var scenarios = [
    { id: "SYN-JAC104-001", topicCode: "symptom_no_water", label: "무출수", representative: "출수량 저하", riskLevel: "CAUTION", requiresConsultation: false, evidenceIds: ["EVD-JAC104D-MAN-P37-NO-WATER"], description: "오늘 아침부터 물 버튼을 눌러도 물이 나오지 않습니다.", symptomCodes: ["LOW_FLOW"], conditions: "필터 교체 시점이 가까우며 다른 수전은 정상입니다.", displayCode: "", missingFields: ["호스가 꺾였는지 확인했나요?"] },
    { id: "SYN-JAC104-002", topicCode: "symptom_low_flow", label: "출수량 저하", representative: "출수량 저하", riskLevel: "GENERAL", requiresConsultation: false, evidenceIds: ["EVD-JAC104D-MAN-P38-LOW-FLOW"], description: "평소보다 물줄기가 절반 정도로 약해졌습니다.", symptomCodes: ["LOW_FLOW"], conditions: "온수 사용 직후와 저녁 시간대에 더 약합니다.", displayCode: "", missingFields: [] },
    { id: "SYN-JAC104-003", topicCode: "symptom_cold_temperature", label: "냉수 온도 이상", representative: "냉·온수 온도 이상", riskLevel: "CAUTION", requiresConsultation: false, evidenceIds: ["EVD-JAC104D-MAN-P37-COLD"], description: "냉수를 받아도 미지근하고 두 시간 이상 기다려도 같아요.", symptomCodes: ["TEMPERATURE"], conditions: "연속 출수 후 충분히 기다렸고 전원은 정상입니다.", displayCode: "", missingFields: [] },
    { id: "SYN-JAC104-004", topicCode: "symptom_leak", label: "제품 누수", representative: "제품 누수", riskLevel: "DANGER", requiresConsultation: true, evidenceIds: ["EVD-JAC104D-MAN-P38-LEAK"], description: "정수기 아래와 연결부 주변에 물이 계속 고입니다.", symptomCodes: ["LEAK"], conditions: "원수 밸브를 잠그고 전원을 분리했습니다.", displayCode: "", missingFields: [] },
    { id: "SYN-JAC104-005", topicCode: "symptom_taste_odor", label: "물맛·냄새 이상", representative: "물맛·냄새 이상", riskLevel: "CAUTION", requiresConsultation: false, evidenceIds: ["EVD-JAC104D-MAN-P38-TASTE-ODOR"], description: "열흘 정도 사용하지 않은 뒤 물에서 낯선 냄새가 납니다.", symptomCodes: ["TASTE_ODOR"], conditions: "공식 통수 절차를 수행했지만 냄새가 남아 있습니다.", displayCode: "", missingFields: [] },
    { id: "SYN-JAC104-006", topicCode: "symptom_hot_water_safety", label: "온수 모듈 이상", representative: "냉·온수 온도 이상", riskLevel: "DANGER", requiresConsultation: true, evidenceIds: ["EVD-JAC104D-MAN-P39-HOT-SAFETY"], description: "LCD에 순간온수 모듈 점검 문구가 표시되고 버튼이 깜박입니다.", symptomCodes: ["TEMPERATURE"], conditions: "출수된 물은 마시지 않았고 전원을 분리했습니다.", displayCode: "순간온수 모듈 점검", missingFields: [] },
    { id: "SYN-JAC104-007", topicCode: "symptom_no_water", label: "무출수 분석 실패", representative: "AI 실패 복구", riskLevel: "CAUTION", requiresConsultation: false, evidenceIds: ["EVD-JAC104D-MAN-P37-NO-WATER"], description: "호스 상태를 입력했지만 공식 근거 재정렬 단계에서 처리가 중단됐습니다.", symptomCodes: ["LOW_FLOW"], conditions: "다른 수전은 정상이고 필터 교체 시점이 가깝습니다.", displayCode: "", missingFields: [] }
  ];

  function product(index) {
    var n = String(index).padStart(3, "0");
    return {
      id: "DEMO-PROD-" + n,
      customerId: "DEMO-CUST-" + n,
      subscriptionId: "DEMO-SUB-" + n,
      productCode: "WPUJAC104DWH",
      manualModel: "WPU-JAC104D",
      productGeneration: "D",
      modelName: "SK매직 초소형 플러스 직수 정수기",
      managementType: "VISIT",
      managementLabel: "방문관리",
      scopeRole: "mvp_primary",
      serial: "DEMO-JAC104D-" + n,
      installedAt: "2026-0" + ((index % 5) + 1) + "-15",
      lastCareAt: index % 2 ? "2026-06-18" : "2026-05-27",
      lastFilterChangedAt: index % 2 ? "2026-06-18" : "2026-05-27",
      careSchedule: {
        status: index === 2 || index === 5 ? "CHECK_REQUIRED" : "PLANNING",
        label: index === 2 || index === 5 ? "확인 필요" : "일정 협의 예정",
        sourceType: "team_designed",
        note: "공식 관리 주기 확정 전이므로 팀 운영 규칙으로만 표시합니다."
      },
      supportStatus: "SUPPORTED",
      supportScope: "mvp_primary",
      supportMessage: "기본 MVP 공식 문서 검색 범위에 포함된 제품입니다.",
      aiAllowed: true,
      searchAllowed: true
    };
  }

  function customer(index) {
    var n = String(index).padStart(3, "0");
    return {
      id: "DEMO-CUST-" + n,
      subscriptionId: "DEMO-SUB-" + n,
      name: "합성 고객 " + n,
      phone: "010-0000-" + String(1000 + index),
      productId: "DEMO-PROD-" + n,
      questionnaireStatus: index === 1 || index === 5 ? "UNANSWERED" : "SUBMITTED",
      synthetic: true
    };
  }

  function usageGuidance(scenario) {
    if (window.WaterCareAIRAGSimulator) {
      return window.WaterCareAIRAGSimulator.usageGuidance(scenario, "2026-07-22T09:00:00+09:00");
    }
    return {
      usageGuidanceStatus: "PENDING_CONSULTATION",
      usageGuidanceMessage: "상담 확인 전까지 안내된 제한을 유지해주세요.",
      restrictedWaterTypes: [],
      restrictedFunctions: [],
      guidanceBasis: "시연 데이터",
      nextAction: "상담이 필요합니다.",
      updatedAt: "2026-07-22T09:00:00+09:00",
      updatedBy: "시연 데이터"
    };
  }

  function inquiry(index, overrides) {
    var n = String(index).padStart(3, "0");
    var scenario = scenarios[index - 1];
    var base = {
      id: "DEMO-INQ-" + n,
      customerId: "DEMO-CUST-" + n,
      productId: "DEMO-PROD-" + n,
      scenarioId: scenario.id,
      topicCode: scenario.topicCode,
      symptomCodes: scenario.symptomCodes.slice(),
      symptomLabel: scenario.label,
      description: scenario.description,
      conditions: scenario.conditions,
      displayCode: scenario.displayCode,
      entryMode: "ADHOC_INQUIRY",
      status: "AI_GUIDANCE",
      currentState: "AI_GUIDANCE",
      riskLevel: scenario.riskLevel,
      priority: scenario.riskLevel === "DANGER" ? "URGENT" : scenario.riskLevel === "CAUTION" ? "HIGH" : "NORMAL",
      requiresConsultation: scenario.requiresConsultation,
      aiState: "COMPLETED",
      failedStage: null,
      retryCount: 0,
      missingFields: scenario.missingFields.slice(),
      answers: {},
      evidenceIds: scenario.evidenceIds.slice(),
      usageGuidance: usageGuidance(scenario),
      safeActions: scenario.riskLevel === "DANGER" ? { waterValveClosed: index === 4, powerDisconnected: true, drinkingStopped: true } : null,
      safetyActionCompleted: scenario.riskLevel === "DANGER" ? index === 4 : null,
      safetyActionRecordedAt: scenario.riskLevel === "DANGER" ? "2026-07-22T" + String(8 + index).padStart(2, "0") + ":04:00+09:00" : null,
      consultationRequestedAt: scenario.requiresConsultation ? "2026-07-22T" + String(8 + index).padStart(2, "0") + ":05:00+09:00" : null,
      actionResult: null,
      customerActionRequired: index === 1 ? "ACTION_RESULT" : null,
      currentAssigneeType: null,
      nextStep: "AI 안내 확인",
      lastStatusChangedAt: "2026-07-22T" + String(8 + index).padStart(2, "0") + ":20:00+09:00",
      allowedActions: [],
      resolutionFeedback: null,
      assignedCounselorId: null,
      assignedTechnicianId: null,
      path: null,
      counselRecord: null,
      stateVersion: 1,
      createdAt: "2026-07-2" + Math.min(index, 1) + "T" + String(8 + index).padStart(2, "0") + ":00:00+09:00",
      updatedAt: "2026-07-22T" + String(8 + index).padStart(2, "0") + ":20:00+09:00",
      outcome: null,
      officialSearchFailed: false,
      aiFailureCount: index === 3 ? 1 : 0,
      aiOutcome: scenario.riskLevel === "DANGER" ? "DANGER_DETECTED" : "SAFE_GUIDANCE_READY",
      aiSummaryOriginal: scenario.label + " 문의입니다. 고객 원문과 공식 근거 페이지를 상담 전에 확인해야 합니다.",
      aiSummaryRevision: null,
      consultationSummaryRevision: null,
      confirmedConsultationSummary: null,
      summaryMeta: {},
      aiProcess: {
        mode: "DETERMINISTIC_PROTOTYPE",
        trace: [{ stage: "COMPLETED", status: "COMPLETED", at: "2026-07-22T09:00:00+09:00" }],
        retrieval: { mode: "DETERMINISTIC_PROTOTYPE", resultCount: scenario.evidenceIds.length, verified: true }
      },
      timeline: [
        { at: "2026-07-22T" + String(8 + index).padStart(2, "0") + ":00:00+09:00", actor: "합성 고객 " + n, event: "SUBMIT_SYMPTOM", label: "증상과 문진 답변을 제출했습니다." },
        { at: "2026-07-22T" + String(8 + index).padStart(2, "0") + ":02:00+09:00", actor: "AI 안내", event: "AI_GUIDANCE_COMPLETED", label: "공식 근거 기반 안내를 생성했습니다." }
      ]
    };
    Object.keys(overrides || {}).forEach(function (key) { base[key] = overrides[key]; });
    return base;
  }

  var inquiries = [
    inquiry(1, {
      status: "QUESTIONNAIRE_IN_PROGRESS",
      aiState: "COMPLETED",
      aiOutcome: "ADDITIONAL_INFORMATION_REQUIRED",
      customerActionRequired: "ADDITIONAL_ANSWERS"
    }),
    inquiry(2, {
      status: "CONSULTATION_REQUIRED",
      requiresConsultation: true,
      assignedCounselorId: "STAFF-CONS-01",
      customerActionRequired: null,
      path: "COUNSEL",
      timeline: [
        { at: "2026-07-22T10:00:00+09:00", actor: "합성 고객 002", event: "REQUEST_CONSULTATION", label: "상담을 요청했습니다." }
      ]
    }),
    inquiry(3, {
      status: "CONSULTATION_IN_PROGRESS",
      requiresConsultation: true,
      assignedCounselorId: "STAFF-CONS-01",
      path: "COUNSEL",
      timeline: [
        { at: "2026-07-22T11:10:00+09:00", actor: "한유진", event: "START_CONSULTATION", label: "상담을 시작했습니다." }
      ]
    }),
    inquiry(4, {
      status: "VISIT_SCHEDULED",
      assignedCounselorId: "STAFF-CONS-01",
      assignedTechnicianId: "STAFF-TECH-01",
      path: "VISIT",
      confirmedConsultationSummary: "누수 안전조치를 확인했으며 연결부와 급수 계통을 현장에서 우선 점검합니다.",
      summaryConfirmedBy: "한유진",
      summaryConfirmedById: "STAFF-CONS-01",
      summaryConfirmedAt: "2026-07-22T09:18:00+09:00",
      customerActionRequired: null,
      timeline: [
        { at: "2026-07-22T09:15:00+09:00", actor: "한유진", event: "VISIT_NEEDED", label: "안전 점검 방문이 필요하다고 판단했습니다." },
        { at: "2026-07-22T09:22:00+09:00", actor: "한유진", event: "CONFIRM_VISIT", label: "방문 일정을 확정했습니다." }
      ]
    }),
    inquiry(5, {
      status: "COMPLETION_PENDING",
      requiresConsultation: true,
      assignedCounselorId: "STAFF-CONS-01",
      path: "COUNSEL",
      counselRecord: { note: "공식 통수 절차를 재안내했고 냄새 지속 여부를 확인했습니다.", outcome: "공식 조치 후 경과 관찰", completedAt: "2026-07-22T11:30:00+09:00", completedBy: "한유진" },
      customerActionRequired: "RESOLUTION_FEEDBACK",
      timeline: [
        { at: "2026-07-22T11:30:00+09:00", actor: "한유진", event: "CONSULTATION_COMPLETED", label: "상담을 완료하고 고객 확인을 요청했습니다." }
      ]
    }),
    inquiry(6, {
      status: "COMPLETION_PENDING",
      assignedCounselorId: "STAFF-CONS-01",
      assignedTechnicianId: "STAFF-TECH-01",
      path: "VISIT",
      customerActionRequired: "STAFF_FINALIZATION",
      resolutionFeedback: { resolved: true, submittedAt: "2026-07-22T13:10:00+09:00", comment: "점검 후 경고가 사라졌습니다." },
      usageGuidance: {
        usageGuidanceStatus: "NORMAL",
        usageGuidanceMessage: "현장 점검 후 일반 사용 가능으로 안내되었습니다.",
        restrictedWaterTypes: [], restrictedFunctions: [],
        guidanceBasis: "공식 매뉴얼 39쪽과 방문기사 현장 점검 결과",
        nextAction: "동일 경고 재발 시 사용을 중지하고 상담을 요청해주세요.",
        updatedAt: "2026-07-22T12:30:00+09:00", updatedBy: "오세훈"
      },
      timeline: [
        { at: "2026-07-22T12:30:00+09:00", actor: "오세훈", event: "VISIT_COMPLETED", label: "방문 점검 결과를 등록했습니다." },
        { at: "2026-07-22T13:10:00+09:00", actor: "합성 고객 006", event: "SUBMIT_RESOLUTION_FEEDBACK", label: "해결됨 피드백을 제출했습니다." }
      ]
    }),
    inquiry(7, {
      status: "QUESTIONNAIRE_IN_PROGRESS",
      aiState: "FAILED",
      failedStage: "RERANKING",
      errorCode: "AI-FAILED-01",
      retryCount: 0,
      simulationFailuresRemaining: 1,
      missingFields: [],
      evidenceIds: [],
      aiOutcome: null,
      officialSearchFailed: false,
      customerActionRequired: "AI_RETRY_OR_CONSULTATION",
      usageGuidance: {
        usageGuidanceStatus: "PENDING_CONSULTATION",
        usageGuidanceMessage: "분석을 완료하지 못했습니다. 입력은 보존되어 있습니다.",
        restrictedWaterTypes: [], restrictedFunctions: [],
        guidanceBasis: "RERANKING 단계 실패 · 공식 근거 미확정",
        nextAction: "실패 단계부터 다시 시도하거나 상담을 요청해주세요.",
        updatedAt: "2026-07-22T15:02:00+09:00", updatedBy: "AI 안내 시뮬레이터"
      },
      aiProcess: {
        mode: "DETERMINISTIC_PROTOTYPE",
        trace: [{ stage: "RERANKING", status: "FAILED", at: "2026-07-22T15:02:00+09:00" }],
        retrieval: { mode: "DETERMINISTIC_PROTOTYPE", resultCount: 0, verified: false }
      },
      timeline: [
        { at: "2026-07-22T15:00:00+09:00", actor: "합성 고객 007", event: "SUBMIT_SYMPTOM", label: "증상과 문진 답변을 제출했습니다." },
        { at: "2026-07-22T15:02:00+09:00", actor: "AI 안내", event: "AI_PROCESS_FAILED", label: "공식 근거 재정렬 단계에서 처리가 중단됐습니다." }
      ]
    })
  ];

  window.WATERCARE_FIX_SEED = {
    meta: {
      schemaVersion: Config.schemaVersion || "SCREEN-DESIGN-V13",
      seedRevision: Config.seedRevision || 6,
      seededAt: "2026-07-22T09:00:00+09:00",
      revision: 1,
      disclaimer: "모든 고객·제품·문의·일정 정보는 시연용 합성 데이터입니다.",
      sourceDocument: "화면설계서_최종완성본_v13.md"
    },
    model: {
      productCode: "WPUJAC104DWH",
      manualModel: "WPU-JAC104D",
      productGeneration: "D",
      modelName: "SK매직 초소형 플러스 직수 정수기",
      managementType: "VISIT",
      scopeRole: "mvp_primary"
    },
    staff: [
      { id: "STAFF-CONS-01", role: "COUNSELOR", name: "한유진", team: "고객케어 상담팀" },
      { id: "STAFF-CONS-02", role: "COUNSELOR", name: "김민서", team: "고객케어 상담팀" },
      { id: "STAFF-TECH-01", role: "TECHNICIAN", name: "오세훈", team: "서울 서부 방문팀" },
      { id: "STAFF-TECH-02", role: "TECHNICIAN", name: "이도윤", team: "서울 동부 방문팀" },
      { id: "STAFF-OPER-01", role: "OPERATOR", name: "장민서", team: "케어 운영팀" }
    ],
    customers: [1, 2, 3, 4, 5, 6, 7].map(customer),
    products: [1, 2, 3, 4, 5, 6, 7].map(product),
    questionnaireSessions: [
      { id: "DEMO-QNR-001", customerId: "DEMO-CUST-001", productId: "DEMO-PROD-001", inquiryId: null, entryMode: "CARE_PRECHECK", questionnaireStatus: "UNANSWERED", answers: {}, symptomCodes: [], description: "", conditions: "", displayCode: "", stateVersion: 1, createdAt: "2026-07-22T08:20:00+09:00", updatedAt: "2026-07-22T08:20:00+09:00" },
      { id: "DEMO-QNR-005", customerId: "DEMO-CUST-005", productId: "DEMO-PROD-005", inquiryId: null, entryMode: "CARE_PRECHECK", questionnaireStatus: "UNANSWERED", answers: {}, symptomCodes: [], description: "", conditions: "", displayCode: "", stateVersion: 1, createdAt: "2026-07-22T08:40:00+09:00", updatedAt: "2026-07-22T08:40:00+09:00" }
    ],
    careHistory: [
      { id: "DEMO-CARE-001", inquiryId: "DEMO-INQ-006", visitId: "DEMO-VISIT-006", productId: "DEMO-PROD-006", technicianId: "STAFF-TECH-01", actualCause: "전원 재연결 후 일시 경고 해제", actions: "전원·온수 잠금·모듈 연결 상태 점검", parts: "교체 부품 없음", usageGuidanceStatus: "NORMAL", usageStatus: "NORMAL", nextAction: "동일 경고 재발 시 사용 중지 후 상담", replacedFilterItems: [], careHistoryUpdatedAt: "2026-07-22T12:30:00+09:00", lastCareDate: "2026-07-22", lastFilterReplacementDate: "2026-05-27", nextCareDate: null, nextCareBasis: null, nextCareStatus: "CONFIRMATION_REQUIRED", subscriptionId: "DEMO-SUB-006", completedAt: "2026-07-22T12:30:00+09:00" }
    ],
    productSupportRequests: [],
    scenarios: scenarios,
    evidenceRegistry: evidenceRegistry,
    inquiries: inquiries,
    visits: [
      {
        id: "DEMO-VISIT-004",
        inquiryId: "DEMO-INQ-004",
        technicianId: "STAFF-TECH-01",
        status: "CONFIRMED",
        desiredAt: "2026-07-23T14:00:00+09:00",
        confirmedAt: "2026-07-23T14:00:00+09:00",
        notes: "연결부 누수 위치를 우선 확인해주세요.",
        safetyNotes: "원수 밸브 잠금·전원 분리 상태를 현장에서 재확인",
        reconfirmed: false,
        previsitReportRevision: { text: "AI 사전 리포트: 누수 위치와 안전조치 완료 여부를 현장에서 먼저 확인합니다.", editedAt: "2026-07-22T09:25:00+09:00", editedBy: "AI 사전 리포트", editorId: "AI-PREVISIT" },
        confirmedPrevisitReport: "누수 위치·원수 밸브·전원 분리 상태를 현장에서 재확인합니다.",
        previsitReportConfirmedBy: "오세훈",
        previsitReportConfirmedById: "STAFF-TECH-01",
        previsitReportConfirmedAt: "2026-07-22T09:30:00+09:00",
        meta: { previsitReportConfirmedBy: "오세훈", previsitReportConfirmedById: "STAFF-TECH-01", previsitReportConfirmedAt: "2026-07-22T09:30:00+09:00" },
        result: null,
        stateVersion: 1
      },
      {
        id: "DEMO-VISIT-006",
        inquiryId: "DEMO-INQ-006",
        technicianId: "STAFF-TECH-01",
        status: "COMPLETED",
        desiredAt: "2026-07-22T11:30:00+09:00",
        confirmedAt: "2026-07-22T11:30:00+09:00",
        startedAt: "2026-07-22T12:00:00+09:00",
        completedAt: "2026-07-22T12:30:00+09:00",
        notes: "온수 모듈 경고 재현 여부 점검",
        safetyNotes: "음용 중지 상태 유지 후 점검",
        reconfirmed: true,
        previsitReportRevision: { text: "온수 모듈 경고와 전원 연결 상태를 확인합니다.", editedAt: "2026-07-22T11:35:00+09:00", editedBy: "AI 사전 리포트", editorId: "AI-PREVISIT" },
        confirmedPrevisitReport: "온수 모듈 경고·전원·사용 중지 상태를 확인합니다.",
        previsitReportConfirmedBy: "오세훈",
        previsitReportConfirmedById: "STAFF-TECH-01",
        previsitReportConfirmedAt: "2026-07-22T11:40:00+09:00",
        meta: { previsitReportConfirmedBy: "오세훈", previsitReportConfirmedById: "STAFF-TECH-01", previsitReportConfirmedAt: "2026-07-22T11:40:00+09:00" },
        result: {
          actualCause: "전원 재연결 후 일시 경고가 해제되었으나 안전 점검 필요",
          actions: "전원·온수 잠금·모듈 연결 상태 점검",
          parts: "교체 부품 없음",
          usageGuidanceStatus: "NORMAL",
          usageGuidanceMessage: "현장 점검 후 일반 사용 가능으로 안내되었습니다.",
          usageStatus: "NORMAL",
          restrictedFunctions: [],
          guidanceBasis: "공식 매뉴얼 39쪽과 현장 점검 결과",
          decisionBasis: "공식 매뉴얼 39쪽과 현장 점검 결과",
          nextAction: "동일 경고 재발 시 즉시 사용 중지 후 상담",
          careHistoryApplied: true,
          visitCompletedCareDate: "2026-07-22",
          filterReplaced: false,
          replacedFilterItems: [],
          nextCareDate: null,
          nextCareBasis: null,
          nextCareStatus: "CONFIRMATION_REQUIRED",
          signature: "합성 고객 006",
          notes: "시연용 방문 결과"
        },
        careApplied: true,
        careUpdatedAt: "2026-07-22T12:30:00+09:00",
        stateVersion: 2
      }
    ],
    notifications: [
      { id: "NOTI-CUST-005", role: "CUSTOMER", recipientId: "DEMO-CUST-005", title: "상담 결과를 확인해주세요", message: "상담이 완료되었습니다. 해결 여부를 알려주세요.", inquiryId: "DEMO-INQ-005", createdAt: "2026-07-22T11:31:00+09:00", read: false },
      { id: "NOTI-CONS-002", role: "COUNSELOR", recipientId: "STAFF-CONS-01", title: "새 상담 요청", message: "출수량 저하 문의가 상담 큐에 들어왔습니다.", inquiryId: "DEMO-INQ-002", createdAt: "2026-07-22T10:01:00+09:00", read: false },
      { id: "NOTI-TECH-004", role: "TECHNICIAN", recipientId: "STAFF-TECH-01", title: "안전 점검 방문 확정", message: "누수 문의 방문이 7월 23일 14:00로 확정되었습니다.", inquiryId: "DEMO-INQ-004", visitId: "DEMO-VISIT-004", createdAt: "2026-07-22T09:23:00+09:00", read: false },
      { id: "NOTI-OPER-001", role: "OPERATOR", recipientId: "STAFF-OPER-01", title: "운영 예외 3건", message: "케어 일정·문진·AI 실패 예외를 확인하세요.", createdAt: "2026-07-22T13:00:00+09:00", read: false }
    ],
    auditLog: [],
    processedEvents: {}
  };
}());
