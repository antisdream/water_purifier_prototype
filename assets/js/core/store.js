(function () {
  "use strict";

  var Config = window.WaterCareConfig || {};
  var ModelPolicy = window.WaterCareModelPolicy;
  var AIRAGSimulator = window.WaterCareAIRAGSimulator;
  var RepositoryFactory = window.WaterCareBrowserRepository;
  var STORAGE_KEY = Config.storageKey || "watercare.prototype.screen-design-v13";
  var listeners = [];
  var activeCorrelationId = null;
  var repository = RepositoryFactory && RepositoryFactory.create({
    storageKey: STORAGE_KEY,
    schemaVersion: Config.schemaVersion || "SCREEN-DESIGN-V13",
    seedRevision: Config.seedRevision || 5,
    seedProvider: function () { return window.WATERCARE_FIX_SEED; }
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function now() {
    return new Date().toISOString();
  }

  function StoreError(code, message) {
    this.name = "WaterCareStoreError";
    this.code = code;
    this.message = message;
    if (Error.captureStackTrace) Error.captureStackTrace(this, StoreError);
  }
  StoreError.prototype = Object.create(Error.prototype);
  StoreError.prototype.constructor = StoreError;

  function fail(code, message) {
    throw new StoreError(code, message);
  }

  function seed() {
    if (!window.WATERCARE_FIX_SEED) fail("SEED-MISSING-01", "FIX 시연 데이터가 로드되지 않았습니다.");
    return clone(window.WATERCARE_FIX_SEED);
  }

  function readRaw() {
    return repository ? repository.read() : null;
  }

  function writeRaw(state) {
    if (!repository) fail("REPOSITORY-MISSING-01", "브라우저 상태 저장소를 찾을 수 없습니다.");
    repository.write(state);
  }

  function ensureState() {
    var state = readRaw();
    if (repository) state = repository.ensure();
    else if (!state || !state.meta || state.meta.schemaVersion !== (Config.schemaVersion || "SCREEN-DESIGN-V13") || Number(state.meta.seedRevision) !== Number(Config.seedRevision || 5)) { state = seed(); writeRaw(state); }
    state.processedEvents = state.processedEvents || {};
    state.auditLog = state.auditLog || [];
    state.notifications = state.notifications || [];
    state.questionnaireSessions = state.questionnaireSessions || [];
    state.careHistory = state.careHistory || [];
    state.productSupportRequests = state.productSupportRequests || [];
    (state.inquiries || []).forEach(function (inquiry) {
      inquiry.currentState = inquiry.status;
      inquiry.lastStatusChangedAt = inquiry.lastStatusChangedAt || inquiry.updatedAt || inquiry.createdAt || now();
      inquiry.summaryMeta = inquiry.summaryMeta || {};
      inquiry.usageGuidance = inquiry.usageGuidance || normalGuidance();
      if (!inquiry.usageGuidance.usageGuidanceStatus) inquiry.usageGuidance.usageGuidanceStatus = inquiry.usageGuidance.usageStatus || "PENDING_CONSULTATION";
      if (!inquiry.usageGuidance.usageGuidanceMessage) inquiry.usageGuidance.usageGuidanceMessage = inquiry.usageGuidance.nextAction || "상태를 확인해주세요.";
      if (!inquiry.usageGuidance.guidanceBasis) inquiry.usageGuidance.guidanceBasis = inquiry.usageGuidance.decisionBasis || "공식 근거 확인 필요";
    });
    (state.visits || []).forEach(function (visit) { visit.meta = visit.meta || {}; });
    state.meta.revision = Number(state.meta.revision || 1);
    return state;
  }

  function getState() {
    return clone(ensureState());
  }

  function emit(eventName, state) {
    listeners.slice().forEach(function (listener) {
      try { listener(clone(state), eventName); } catch (error) { window.setTimeout(function () { throw error; }, 0); }
    });
  }

  function find(array, id, code, label) {
    var value = (array || []).find(function (item) { return item.id === id; });
    if (!value) fail(code || "NO-DATA-01", (label || "대상") + "을 찾을 수 없습니다.");
    return value;
  }

  function customerForActor(state, actor) {
    if (!actor || actor.role !== "CUSTOMER") fail("FINALIZE-AUTH-01", "고객 권한이 필요합니다.");
    return find(state.customers, actor.id, "FINALIZE-AUTH-01", "고객");
  }

  function requireRole(actor, roles) {
    if (!actor || !actor.id || !actor.role) fail("AUTH-REQUIRED-01", "로그인 정보가 필요합니다.");
    if (roles.indexOf(actor.role) < 0) fail("ACCESS-DENIED-01", "이 작업을 수행할 권한이 없습니다.");
  }

  function inquiryForActor(state, inquiryId, actor, allowedRoles) {
    var inquiry = find(state.inquiries, inquiryId, "NO-DATA-01", "문의");
    if (allowedRoles) requireRole(actor, allowedRoles);
    if (actor && actor.role === "CUSTOMER" && inquiry.customerId !== actor.id) fail("FINALIZE-AUTH-01", "본인의 문의만 처리할 수 있습니다.");
    if (actor && actor.role === "COUNSELOR" && inquiry.assignedCounselorId && inquiry.assignedCounselorId !== actor.id) fail("FINALIZE-AUTH-01", "담당 상담사의 문의가 아닙니다.");
    if (actor && actor.role === "TECHNICIAN" && inquiry.assignedTechnicianId !== actor.id) fail("ACCESS-DENIED-01", "담당 방문기사의 문의가 아닙니다.");
    return inquiry;
  }

  function checkVersion(inquiry, payload) {
    if (!payload || payload.stateVersion == null || Number.isNaN(Number(payload.stateVersion))) {
      fail("STATE-CONFLICT-01", "최신 상태 버전이 필요합니다.");
    }
    if (Number(payload.stateVersion) !== Number(inquiry.stateVersion)) {
      fail("STATE-CONFLICT-01", "다른 사용자가 문의 상태를 먼저 변경했습니다. 최신 내용을 다시 확인해주세요.");
    }
  }

  function touch(inquiry) {
    if (inquiry.currentState !== inquiry.status) {
      inquiry.currentState = inquiry.status;
      inquiry.lastStatusChangedAt = now();
    }
    inquiry.stateVersion = Number(inquiry.stateVersion || 0) + 1;
    inquiry.updatedAt = now();
  }

  function timeline(inquiry, actor, eventName, label) {
    inquiry.timeline = inquiry.timeline || [];
    inquiry.timeline.push({
      at: now(),
      actor: actor && actor.name ? actor.name : "시스템",
      event: eventName,
      label: label,
      correlationId: activeCorrelationId
    });
  }

  function audit(state, actor, eventName, targetId, detail) {
    state.auditLog.unshift({
      id: "AUD-" + String(state.auditLog.length + 1).padStart(4, "0"),
      at: now(),
      actorId: actor && actor.id || "SYSTEM",
      actorName: actor && actor.name || "시스템",
      role: actor && actor.role || "SYSTEM",
      event: eventName,
      targetId: targetId || null,
      detail: detail || "",
      correlationId: activeCorrelationId
    });
    state.auditLog = state.auditLog.slice(0, 200);
  }

  function notify(state, role, recipientId, title, message, inquiryId, visitId) {
    state.notifications.unshift({
      id: "NOTI-" + Date.now() + "-" + Math.random().toString(16).slice(2, 7),
      role: role,
      recipientId: recipientId,
      title: title,
      message: message,
      inquiryId: inquiryId || null,
      visitId: visitId || null,
      createdAt: now(),
      correlationId: activeCorrelationId,
      read: false
    });
  }

  function nextId(items, prefix) {
    var highest = (items || []).reduce(function (max, item) {
      var match = String(item.id || "").match(/(\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return prefix + String(highest + 1).padStart(3, "0");
  }

  function nextInquiryId(state) { return nextId(state.inquiries, "DEMO-INQ-"); }
  function nextVisitId(state) { return nextId(state.visits, "DEMO-VISIT-"); }
  function nextQuestionnaireId(state) { return nextId(state.questionnaireSessions, "DEMO-QNR-"); }
  function nextProductId(state) { return nextId(state.products, "DEMO-PROD-"); }
  function nextSupportRequestId(state) { return nextId(state.productSupportRequests, "DEMO-SUPPORT-"); }

  function normalGuidance() {
    return { usageGuidanceStatus: "NORMAL", usageGuidanceMessage: "증상과 문진을 제출하면 사용 가능 범위를 안내합니다.", restrictedWaterTypes: [], restrictedFunctions: [], guidanceBasis: "분석 전", nextAction: "증상과 문진을 제출해주세요.", updatedAt: now(), updatedBy: "시스템" };
  }

  function inputSnapshot(record) {
    var snapshot = {
      symptomCodes: clone(record.symptomCodes || []),
      description: record.description || "",
      conditions: record.conditions || "",
      displayCode: record.displayCode || ""
    };
    Object.keys(record.answers || {}).forEach(function (key) { snapshot["answers." + key] = record.answers[key]; });
    return snapshot;
  }

  function recordInputChanges(record, before, actor, eventName, sourceQuestionnaireId) {
    var after = inputSnapshot(record);
    var keys = Array.from(new Set(Object.keys(before || {}).concat(Object.keys(after))));
    var changes = keys.filter(function (key) { return JSON.stringify(before[key]) !== JSON.stringify(after[key]); }).map(function (key) {
      return { field: key, before: clone(before[key] == null ? null : before[key]), after: clone(after[key] == null ? null : after[key]) };
    });
    if (!changes.length) return;
    record.answerChangeHistory = record.answerChangeHistory || [];
    record.answerChangeHistory.push({
      event: eventName,
      sourceQuestionnaireId: sourceQuestionnaireId || record.questionnaireSessionId || null,
      changedAt: now(),
      changedBy: actor && actor.name || "시스템",
      changedById: actor && actor.id || "SYSTEM",
      changes: changes
    });
  }

  function questionnaireForActor(state, id, actor) {
    var session = find(state.questionnaireSessions, id, "NO-DATA-01", "사전 문진");
    requireRole(actor, ["CUSTOMER"]);
    if (session.customerId !== actor.id) fail("FINALIZE-AUTH-01", "본인의 사전 문진만 처리할 수 있습니다.");
    return session;
  }

  function applyAutomaticTransition(state, inquiry, result) {
    var systemActor = { role: "SYSTEM", id: "AI-ORCHESTRATOR", name: "AI 안내 시뮬레이터" };
    if (result.outcomeEvent === "ADDITIONAL_INFORMATION_REQUIRED") {
      inquiry.aiState = "COMPLETED";
      inquiry.aiOutcome = "ADDITIONAL_INFORMATION_REQUIRED";
      inquiry.status = "QUESTIONNAIRE_IN_PROGRESS";
      inquiry.customerActionRequired = "ADDITIONAL_ANSWERS";
      return;
    }
    inquiry.aiState = "COMPLETED";
    if (result.outcomeEvent === "SAFE_GUIDANCE_READY") {
      inquiry.status = "AI_GUIDANCE";
      inquiry.customerActionRequired = "ACTION_RESULT";
      timeline(inquiry, systemActor, "SAFE_GUIDANCE_READY", "검증된 공식 근거 범위의 안내가 준비되었습니다.");
      return;
    }
    inquiry.status = "CONSULTATION_REQUIRED";
    inquiry.assignedCounselorId = inquiry.assignedCounselorId || "STAFF-CONS-01";
    inquiry.path = "COUNSEL";
    if (result.outcomeEvent === "DANGER_DETECTED") {
      inquiry.customerActionRequired = "SAFETY_CONFIRMATION";
      inquiry.safeActions = Object.assign({ waterValveClosed: false, powerDisconnected: false, drinkingStopped: false }, inquiry.safeActions || {});
      inquiry.safetyActionCompleted = false;
      timeline(inquiry, { role: "SYSTEM", id: "RISK-ENGINE", name: "위험 감지 규칙" }, "DANGER_DETECTED", "위험 신호를 감지해 일반 자가조치를 차단하고 상담 대기로 전환했습니다.");
      notify(state, "COUNSELOR", inquiry.assignedCounselorId, "위험 문의 감지", inquiry.symptomLabel + " 문의를 우선 확인해주세요.", inquiry.id);
      notify(state, "OPERATOR", "STAFF-OPER-01", "위험 문의 운영 확인", inquiry.id + " 문의가 위험 분기로 전환되었습니다.", inquiry.id);
      return;
    }
    if (inquiry.riskLevel === "DANGER") {
      inquiry.customerActionRequired = "SAFETY_CONFIRMATION";
      inquiry.safeActions = Object.assign({ waterValveClosed: false, powerDisconnected: false, drinkingStopped: false }, inquiry.safeActions || {});
      inquiry.safetyActionCompleted = false;
      notify(state, "COUNSELOR", inquiry.assignedCounselorId, "위험 문의·공식 근거 부족", inquiry.symptomLabel + " 문의의 안전 상태와 근거를 직접 확인해주세요.", inquiry.id);
    } else {
      inquiry.customerActionRequired = null;
    }
    timeline(inquiry, { role: "SYSTEM", id: "EVIDENCE-GATE", name: "근거 충분성 규칙" }, "NO_EVIDENCE", "현재 제품·증상 범위의 검증된 공식 근거가 없어 상담으로 전환했습니다.");
    notify(state, "COUNSELOR", inquiry.assignedCounselorId, "공식 근거 부족 문의", inquiry.symptomLabel + " 문의는 임의 안내 없이 상담이 필요합니다.", inquiry.id);
    notify(state, "OPERATOR", "STAFF-OPER-01", "공식 근거 검색 보류", inquiry.id + " 문의가 NO_EVIDENCE 상태로 전환되었습니다.", inquiry.id);
  }

  function applyAIOutcome(state, inquiry, product, actor) {
    if (!AIRAGSimulator) fail("AI-SIMULATOR-MISSING-01", "AI·RAG 시뮬레이터를 찾을 수 없습니다.");
    var result;
    try {
      result = AIRAGSimulator.run(state, inquiry, product, { now: now(), correlationId: activeCorrelationId });
    } catch (error) {
      inquiry.aiState = "FAILED";
      inquiry.status = "QUESTIONNAIRE_IN_PROGRESS";
      inquiry.failedStage = error && error.failedStage || "RERANKING";
      inquiry.errorCode = error && error.code || "AI-FAILED-01";
      inquiry.customerActionRequired = "AI_RETRY_OR_CONSULTATION";
      inquiry.evidenceIds = [];
      inquiry.aiProcess = {
        mode: AIRAGSimulator.mode,
        trace: [{ stage: inquiry.failedStage, status: "FAILED", at: now(), correlationId: activeCorrelationId }],
        retrieval: { mode: "DETERMINISTIC_PROTOTYPE", resultCount: 0, verified: false },
        correlationId: activeCorrelationId
      };
      inquiry.usageGuidance = {
        usageGuidanceStatus: "PENDING_CONSULTATION",
        usageGuidanceMessage: "분석을 완료하지 못했습니다. 입력은 보존되며 재시도 또는 상담이 필요합니다.",
        restrictedWaterTypes: [], restrictedFunctions: [],
        guidanceBasis: "AI 처리 실패 · 공식 근거 미확정",
        nextAction: "실패 단계부터 다시 시도하거나 상담을 요청해주세요.",
        updatedAt: now(), updatedBy: "AI 안내 시뮬레이터"
      };
      audit(state, { role: "SYSTEM", id: "AI-ORCHESTRATOR", name: "AI 안내 시뮬레이터" }, "AI_PROCESS_FAILED", inquiry.id, inquiry.errorCode);
      notify(state, "OPERATOR", "STAFF-OPER-01", "AI 처리 실패", inquiry.id + " 문의가 " + inquiry.failedStage + " 단계에서 실패했습니다.", inquiry.id);
      return { aiState: "FAILED", outcomeEvent: "AI_PROCESS_FAILED", failedStage: inquiry.failedStage, errorCode: inquiry.errorCode };
    }
    var scenario = result.scenario;
    inquiry.failedStage = null;
    inquiry.errorCode = null;
    inquiry.reanalysisRequired = false;
    product.reanalysisRequired = false;
    inquiry.scenarioId = scenario ? scenario.id : null;
    inquiry.topicCode = scenario ? scenario.topicCode : "unsupported_symptom";
    inquiry.symptomLabel = scenario ? scenario.label : "기타·근거 확인 필요";
    inquiry.riskLevel = scenario ? scenario.riskLevel : "CAUTION";
    inquiry.priority = inquiry.riskLevel === "DANGER" ? "URGENT" : inquiry.riskLevel === "CAUTION" ? "HIGH" : "NORMAL";
    inquiry.requiresConsultation = result.outcomeEvent === "DANGER_DETECTED" || result.outcomeEvent === "NO_EVIDENCE" || Boolean(scenario && scenario.requiresConsultation);
    inquiry.evidenceIds = result.evidenceIds.slice();
    inquiry.usageGuidance = result.usageGuidance;
    inquiry.missingFields = result.missingFields.slice();
    inquiry.aiProcess = { mode: AIRAGSimulator.mode, trace: result.trace, retrieval: result.retrieval, correlationId: activeCorrelationId };
    inquiry.aiSummaryOriginal = result.aiSummaryOriginal;
    inquiry.aiOutcome = result.outcomeEvent === "ADDITIONAL_INFORMATION_REQUIRED" ? null : result.outcomeEvent;
    inquiry.officialSearchFailed = result.outcomeEvent === "NO_EVIDENCE";

    applyAutomaticTransition(state, inquiry, result);
    audit(state, { role: "SYSTEM", id: "AI-ORCHESTRATOR", name: "AI 안내 시뮬레이터" }, result.outcomeEvent, inquiry.id, result.retrieval.mode);
    return result;
  }

  function createQuestionnaire(state, payload, actor) {
    var customer = customerForActor(state, actor);
    var product = find(state.products, payload.productId || customer.productId, "NO-DATA-01", "제품");
    if (product.customerId !== customer.id) fail("FINALIZE-AUTH-01", "본인의 제품만 선택할 수 있습니다.");
    var questionnaireSupport = ModelPolicy ? ModelPolicy.evaluate(product) : { status: "SUPPORTED", aiAllowed: true };
    if (!questionnaireSupport.aiAllowed) fail(questionnaireSupport.errorCode || "PRODUCT-VALIDATION-01", questionnaireSupport.message);
    var session = {
      id: nextQuestionnaireId(state), customerId: customer.id, productId: product.id, inquiryId: null,
      entryMode: "CARE_PRECHECK", questionnaireStatus: "IN_PROGRESS", symptomCodes: [], description: "",
      conditions: "", displayCode: "", answers: {}, stateVersion: 1, createdAt: now(), updatedAt: now()
    };
    state.questionnaireSessions.unshift(session);
    customer.questionnaireStatus = "IN_PROGRESS";
    return session;
  }

  function createInquiry(state, payload, actor, entryMode) {
    var customer = customerForActor(state, actor);
    var product = find(state.products, payload.productId || customer.productId, "NO-DATA-01", "제품");
    if (product.customerId !== customer.id) fail("FINALIZE-AUTH-01", "본인의 제품만 선택할 수 있습니다.");
    var support = ModelPolicy ? ModelPolicy.applyRegistry(product) : { status: "SUPPORTED", aiAllowed: true };
    if (!support.aiAllowed) fail(support.errorCode || "MODEL-EXPANSION-01", support.message);
    var session = payload.questionnaireSessionId ? questionnaireForActor(state, payload.questionnaireSessionId, actor) : null;
    var effectiveEntryMode = session ? "CARE_PRECHECK" : (entryMode || "ADHOC_INQUIRY");
    var inquiry = {
      id: nextInquiryId(state), customerId: customer.id, productId: product.id, questionnaireSessionId: session ? session.id : null,
      scenarioId: null, topicCode: null, symptomCodes: session ? session.symptomCodes.slice() : [], symptomLabel: "작성 중",
      description: session ? session.description : "", conditions: session ? session.conditions : "", displayCode: session ? session.displayCode : "", entryMode: effectiveEntryMode,
      status: "DRAFT", riskLevel: "GENERAL", priority: "NORMAL", requiresConsultation: false,
      currentState: "DRAFT", currentAssigneeType: "CUSTOMER", nextStep: "증상 입력", lastStatusChangedAt: now(), allowedActions: [],
      aiState: "IDLE", aiOutcome: null, failedStage: null, errorCode: null, retryCount: 0, missingFields: [], answers: session ? Object.assign({}, session.answers) : {},
      evidenceIds: [], usageGuidance: normalGuidance(), safeActions: null,
      safetyActionCompleted: null, safetyActionRecordedAt: null, consultationRequestedAt: null,
      actionResult: null, customerActionRequired: null, resolutionFeedback: null,
      assignedCounselorId: null, assignedTechnicianId: null, path: null, counselRecord: null,
      aiSummaryOriginal: null, aiSummaryRevision: null, aiProcess: { mode: "DETERMINISTIC_PROTOTYPE", trace: [], retrieval: null },
      consultationSummaryRevision: null, confirmedConsultationSummary: null, summaryMeta: {},
      answerSource: session ? { questionnaireSessionId: session.id, linkedAt: now(), reused: true } : null,
      answerChangeHistory: session ? clone(session.answerChangeHistory || []) : [],
      stateVersion: 1, createdAt: now(), updatedAt: now(), outcome: null,
      officialSearchFailed: false, aiFailureCount: 0, timeline: []
    };
    timeline(inquiry, actor, "START_INQUIRY", session ? "제출한 사전 문진을 연결해 증상 상담 작성을 시작했습니다." : "증상 상담 작성을 시작했습니다.");
    state.inquiries.unshift(inquiry);
    if (session) { session.inquiryId = inquiry.id; session.updatedAt = now(); session.stateVersion = Number(session.stateVersion || 0) + 1; }
    return inquiry;
  }

  function visitForInquiry(state, inquiry, payload) {
    var visit = payload && payload.visitId ? find(state.visits, payload.visitId, "NO-DATA-01", "방문") : (state.visits || []).find(function (item) { return item.inquiryId === inquiry.id && item.status !== "CANCELLED"; });
    if (!visit) fail("NO-DATA-01", "연결된 방문 일정을 찾을 수 없습니다.");
    if (visit.inquiryId !== inquiry.id) fail("STATE-CONFLICT-01", "문의와 방문 일정의 연결 정보가 일치하지 않습니다.");
    return visit;
  }

  function requireTechnician(state, technicianId) {
    var technician = (state.staff || []).find(function (item) { return item.id === technicianId && item.role === "TECHNICIAN"; });
    if (!technician) fail("SAVE-FAILED-01", "등록된 방문기사를 선택해주세요.");
    return technician;
  }

  function visitForInquiryOrNull(state, inquiry) {
    return (state.visits || []).find(function (item) { return item.inquiryId === inquiry.id && item.status !== "CANCELLED"; }) || null;
  }

  function actorOwnsInquiry(inquiry, actor) {
    if (!actor || !inquiry) return false;
    if (actor.role === "CUSTOMER") return inquiry.customerId === actor.id;
    if (actor.role === "COUNSELOR") return !inquiry.assignedCounselorId || inquiry.assignedCounselorId === actor.id;
    if (actor.role === "TECHNICIAN") return inquiry.assignedTechnicianId === actor.id;
    return actor.role === "OPERATOR";
  }

  function allowedActionsFor(state, inquiry, actor) {
    if (!actor) return [];
    if (!inquiry) {
      if (actor.role !== "CUSTOMER") return [];
      var homeActions = ["REGISTER_PRODUCT", "PRODUCT_UPDATED"];
      var homeCustomer = (state.customers || []).find(function (item) { return item.id === actor.id; });
      var homeProduct = homeCustomer && (state.products || []).find(function (item) { return item.id === homeCustomer.productId; });
      var homeSupport = homeProduct && ModelPolicy ? ModelPolicy.evaluate(homeProduct) : null;
      if (homeProduct && (!homeSupport || homeSupport.aiAllowed)) homeActions.push("START_CARE_PRECHECK", "START_INQUIRY");
      return homeActions;
    }
    if (!actorOwnsInquiry(inquiry, actor)) return [];
    var actions = [];
    var status = inquiry.status;
    var visit = visitForInquiryOrNull(state, inquiry);

    if (actor.role === "CUSTOMER") {
      if (["DRAFT", "QUESTIONNAIRE_IN_PROGRESS"].indexOf(status) >= 0) actions.push("SAVE_DRAFT", "CANCEL_INQUIRY");
      if (status === "DRAFT") actions.push("SUBMIT_SYMPTOM");
      if (status === "QUESTIONNAIRE_IN_PROGRESS") actions.push("SUBMIT_ANSWERS", "SUBMIT_SYMPTOM");
      if (inquiry.aiState === "FAILED") {
        if (Number(inquiry.retryCount || 0) < Number(Config.aiMaxRetries || 2)) actions.push("RETRY_AI_PROCESS");
        actions.push("REQUEST_CONSULTATION");
      }
      if (status === "AI_GUIDANCE") {
        if (inquiry.riskLevel !== "DANGER" && !inquiry.requiresConsultation) actions.push("CUSTOMER_REPORTED_SELF_RESOLVED");
        actions.push("REQUEST_CONSULTATION");
      }
      if (status === "CONSULTATION_REQUIRED" && inquiry.customerActionRequired === "SAFETY_CONFIRMATION") actions.push("REQUEST_CONSULTATION");
      if (status === "COMPLETION_PENDING" && !inquiry.resolutionFeedback) actions.push("SUBMIT_RESOLUTION_FEEDBACK", "CUSTOMER_REPORTED_UNRESOLVED", "REQUEST_CONSULTATION");
      return actions;
    }

    if (actor.role === "COUNSELOR") {
      if (status === "REOPENED") actions.push("RESUME_CONSULTATION");
      if (status === "CONSULTATION_REQUIRED") actions.push("START_CONSULTATION");
      if (["CONSULTATION_IN_PROGRESS", "VISIT_REVIEW_PENDING"].indexOf(status) >= 0) {
        actions.push("UPDATE_CONSULTATION_SUMMARY", "CONFIRM_CONSULTATION_SUMMARY");
      }
      if (status === "CONSULTATION_IN_PROGRESS") actions.push("CONSULTATION_COMPLETED", "VISIT_REVIEW_REQUIRED");
      if (status === "VISIT_REVIEW_PENDING" && String(typeof inquiry.confirmedConsultationSummary === "string" ? inquiry.confirmedConsultationSummary : inquiry.confirmedConsultationSummary && inquiry.confirmedConsultationSummary.text || "").trim()) actions.push("VISIT_NEEDED");
      if (["VISIT_SCHEDULING", "VISIT_SCHEDULED", "REVISIT_REQUIRED"].indexOf(status) >= 0) actions.push("UPDATE_VISIT_SCHEDULE", "CONFIRM_VISIT");
      if (status === "COMPLETION_PENDING" && inquiry.path === "COUNSEL" && inquiry.resolutionFeedback && inquiry.resolutionFeedback.resolved) actions.push("FINALIZE_INQUIRY");
      return actions;
    }

    if (actor.role === "TECHNICIAN" && visit) {
      if (visit.status === "CONFIRMED") actions.push("UPDATE_PREVISIT_REPORT", "CONFIRM_PREVISIT_REPORT");
      if (visit.status === "CONFIRMED" && String(typeof visit.confirmedPrevisitReport === "string" ? visit.confirmedPrevisitReport : visit.confirmedPrevisitReport && visit.confirmedPrevisitReport.text || "").trim()) actions.push("START_VISIT");
      if (visit.status === "IN_PROGRESS") actions.push("VISIT_COMPLETED", "REVISIT_NEEDED");
      if (status === "COMPLETION_PENDING" && inquiry.path === "VISIT" && inquiry.resolutionFeedback && inquiry.resolutionFeedback.resolved) actions.push("FINALIZE_INQUIRY");
    }
    return actions;
  }

  var GOVERNED_INQUIRY_ACTIONS = [
    "SAVE_DRAFT", "SUBMIT_SYMPTOM", "SUBMIT_ANSWERS", "RETRY_AI_PROCESS", "CANCEL_INQUIRY",
    "CUSTOMER_REPORTED_SELF_RESOLVED", "REQUEST_CONSULTATION", "SUBMIT_RESOLUTION_FEEDBACK", "CUSTOMER_REPORTED_UNRESOLVED",
    "RESUME_CONSULTATION", "START_CONSULTATION", "UPDATE_CONSULTATION_SUMMARY", "CONFIRM_CONSULTATION_SUMMARY",
    "CONSULTATION_COMPLETED", "VISIT_REVIEW_REQUIRED", "VISIT_NEEDED", "UPDATE_VISIT_SCHEDULE", "CONFIRM_VISIT",
    "UPDATE_PREVISIT_REPORT", "CONFIRM_PREVISIT_REPORT", "START_VISIT", "VISIT_COMPLETED", "REVISIT_NEEDED", "FINALIZE_INQUIRY"
  ];

  function assertAllowedAction(state, eventName, payload, actor) {
    if (GOVERNED_INQUIRY_ACTIONS.indexOf(eventName) < 0 || !payload || !payload.inquiryId) return;
    var inquiry = find(state.inquiries, payload.inquiryId, "NO-DATA-01", "문의");
    if (actor && actor.role === "CUSTOMER" && inquiry.customerId !== actor.id) fail("FINALIZE-AUTH-01", "본인의 문의만 처리할 수 있습니다.");
    if (actor && actor.role === "COUNSELOR" && inquiry.assignedCounselorId && inquiry.assignedCounselorId !== actor.id) fail("FINALIZE-AUTH-01", "담당 상담사의 문의가 아닙니다.");
    if (actor && actor.role === "TECHNICIAN" && inquiry.assignedTechnicianId !== actor.id) fail("FINALIZE-AUTH-01", "담당 방문기사의 문의가 아닙니다.");
    if (allowedActionsFor(state, inquiry, actor).indexOf(eventName) < 0) {
      fail("ALLOWED-ACTION-01", "현재 상태와 역할에서는 " + eventName + " 작업을 수행할 수 없습니다.");
    }
  }

  function currentAssigneeType(inquiry) {
    if (inquiry.customerActionRequired && inquiry.customerActionRequired !== "STAFF_FINALIZATION") return "CUSTOMER";
    if (inquiry.customerActionRequired === "STAFF_FINALIZATION") return inquiry.path === "VISIT" ? "TECHNICIAN" : "COUNSELOR";
    if (["VISIT_SCHEDULED"].indexOf(inquiry.status) >= 0) return "TECHNICIAN";
    if (["CONSULTATION_REQUIRED", "CONSULTATION_IN_PROGRESS", "VISIT_REVIEW_PENDING", "VISIT_SCHEDULING", "REVISIT_REQUIRED", "REOPENED"].indexOf(inquiry.status) >= 0) return "COUNSELOR";
    return null;
  }

  function nextStepFor(inquiry) {
    var steps = {
      DRAFT: "증상 입력",
      QUESTIONNAIRE_IN_PROGRESS: "추가 질문 답변",
      AI_GUIDANCE: "안내 확인 및 결과 선택",
      CONSULTATION_REQUIRED: "상담원 확인 대기",
      CONSULTATION_IN_PROGRESS: "상담 진행",
      VISIT_REVIEW_PENDING: "방문 필요 여부 검토",
      VISIT_SCHEDULING: "방문 일정 조율",
      VISIT_SCHEDULED: "확정 방문 대기",
      REVISIT_REQUIRED: "추가 방문 일정 조율",
      COMPLETION_PENDING: inquiry.customerActionRequired === "STAFF_FINALIZATION" ? "담당자 최종 확정" : "고객 해결 여부 확인",
      REOPENED: "상담 재개",
      RESOLVED: "처리 완료",
      CANCELLED: "문의 취소"
    };
    return steps[inquiry.status] || "상태 확인";
  }

  function evidenceCardDTO(item) {
    return {
      evidenceId: item.evidenceId,
      chunkId: item.chunkId,
      documentId: item.documentId,
      documentTitle: item.documentTitle,
      documentVersion: item.documentVersion,
      pageRefs: clone(item.pageRefs || []),
      sectionTitle: item.sectionTitle || null,
      evidenceSummary: item.evidenceSummary,
      sourceType: item.sourceType,
      provider: item.provider || null,
      riskLevel: String(item.riskLevel || "general").toLowerCase(),
      requiresConsultation: Boolean(item.requiresConsultation),
      safeActions: clone(item.safeActions || []),
      escalationConditions: clone(item.escalationConditions || []),
      prohibitedActions: clone(item.prohibitedActions || []),
      verificationStatus: item.verificationStatus,
      sourceLandingUrl: item.sourceLandingUrl,
      sourceDirectDownloadUrl: item.sourceDirectDownloadUrl || null,
      productCode: item.productCode,
      manualModel: item.manualModel,
      productGeneration: item.productGeneration,
      modelFamily: item.modelFamily,
      scopeRole: item.scopeRole,
      dataClassification: item.dataClassification || "official"
    };
  }

  function getAllowedActions(inquiryId, actor) {
    var state = ensureState();
    var inquiry = inquiryId ? find(state.inquiries, inquiryId, "NO-DATA-01", "문의") : null;
    return clone(allowedActionsFor(state, inquiry, actor));
  }

  function getInquiryView(inquiryId, actor) {
    var state = ensureState();
    var allowedRoles = ["CUSTOMER", "COUNSELOR", "TECHNICIAN", "OPERATOR"];
    requireRole(actor, allowedRoles);
    var inquiry = inquiryForActor(state, inquiryId, actor, allowedRoles);
    var evidenceIds = inquiry.evidenceIds || [];
    var product = find(state.products, inquiry.productId, "NO-DATA-01", "제품");
    var evidenceCards = (state.evidenceRegistry || []).filter(function (item) {
      return evidenceIds.indexOf(item.evidenceId) >= 0 &&
        item.productCode === product.productCode &&
        item.manualModel === product.manualModel &&
        item.productGeneration === product.productGeneration &&
        item.modelFamily === "WPU-JAC104" &&
        item.scopeRole === "mvp_primary" &&
        item.applicability === "model_exact" &&
        ["mvp_primary", "mvp_primary_safety"].indexOf(item.allowedUse) >= 0 &&
        item.verificationStatus === (Config.verifiedEvidenceStatus || "text_and_visual_verified") &&
        item.dataClassification === "official";
    }).map(evidenceCardDTO);
    var assigneeType = currentAssigneeType(inquiry);
    var guidance = inquiry.usageGuidance || normalGuidance();
    return {
      inquiry: clone(inquiry),
      usageGuidanceStatus: guidance.usageGuidanceStatus || null,
      usageGuidanceMessage: guidance.usageGuidanceMessage || null,
      restrictedFunctions: clone(guidance.restrictedFunctions || []),
      guidanceBasis: guidance.guidanceBasis || null,
      nextAction: guidance.nextAction || null,
      currentState: inquiry.status,
      currentAssigneeType: assigneeType,
      nextStep: nextStepFor(inquiry),
      customerActionRequired: inquiry.customerActionRequired || null,
      lastStatusChangedAt: inquiry.lastStatusChangedAt || inquiry.updatedAt || inquiry.createdAt,
      allowedActions: clone(allowedActionsFor(state, inquiry, actor)),
      evidenceCards: evidenceCards
    };
  }

  function processEvent(state, eventName, payload, actor) {
    var inquiry;
    var visit;
    var customer;
    var product;
    payload = payload || {};

    switch (eventName) {
      case "START_INQUIRY":
        inquiry = createInquiry(state, payload, actor, payload.entryMode || "ADHOC_INQUIRY");
        audit(state, actor, eventName, inquiry.id, "증상 상담 시작");
        return inquiry.id;

      case "START_CARE_PRECHECK":
        var questionnaire = createQuestionnaire(state, payload, actor);
        audit(state, actor, eventName, questionnaire.id, "문의와 분리된 사전 문진 시작");
        return questionnaire.id;

      case "REGISTER_PRODUCT":
        customer = customerForActor(state, actor);
        product = {
          id: nextProductId(state), customerId: customer.id, subscriptionId: customer.subscriptionId,
          productCode: String(payload.productCode || "").trim(), manualModel: String(payload.manualModel || "").trim(),
          productGeneration: String(payload.productGeneration || "").trim(), modelName: String(payload.modelName || "등록 제품").trim(),
          managementType: payload.managementType || "VISIT", managementLabel: "방문관리", scopeRole: payload.scopeRole || "unsupported",
          serial: String(payload.serial || "DEMO-REGISTERED").trim(), installedAt: payload.startedAt || null, installedArea: String(payload.installedArea || "").trim(),
          lastCareAt: null, lastFilterChangedAt: null,
          careSchedule: { status: "CHECK_REQUIRED", label: "확인 필요", sourceType: "team_designed", nextCareAt: null, note: "제품 지원 범위와 관리 일정을 확인해주세요." }
        };
        var registrationValidation = ModelPolicy ? ModelPolicy.evaluate(product) : { status: "SUPPORTED" };
        if (["REMOVED_LEGACY", "UNSUPPORTED_GENERATION", "EXPANSION"].indexOf(registrationValidation.status) >= 0) fail(registrationValidation.errorCode, registrationValidation.message);
        if (ModelPolicy) ModelPolicy.applyRegistry(product);
        state.products.push(product);
        customer.productId = product.id;
        audit(state, actor, eventName, product.id, product.supportStatus);
        return product.id;

      case "VALIDATE_PRODUCT":
        customerForActor(state, actor);
        product = find(state.products, payload.productId, "NO-DATA-01", "제품");
        if (product.customerId !== actor.id) fail("FINALIZE-AUTH-01", "본인의 제품만 확인할 수 있습니다.");
        var validation = ModelPolicy ? ModelPolicy.applyRegistry(product) : { status: "SUPPORTED", aiAllowed: true, searchAllowed: true, consultationRequired: false, message: "지원 제품" };
        var validationEvent = validation.aiAllowed ? "PRODUCT_VALIDATED" : "PRODUCT_VALIDATION_FAILED";
        audit(state, actor, validationEvent, product.id, validation.status + (validation.errorCode ? " · " + validation.errorCode : ""));
        return { productId: product.id, status: validation.status, errorCode: validation.errorCode || null, outcomeEvent: validationEvent, supportScope: validation.supportScope, aiAllowed: validation.aiAllowed, ragAllowed: validation.searchAllowed, consultationRequired: validation.consultationRequired, message: validation.message, evidenceIds: [] };

      case "REQUEST_PRODUCT_SUPPORT":
        customer = customerForActor(state, actor);
        product = find(state.products, payload.productId || customer.productId, "NO-DATA-01", "제품");
        if (product.customerId !== actor.id) fail("FINALIZE-AUTH-01", "본인의 제품만 상담 요청할 수 있습니다.");
        var supportValidation = ModelPolicy ? ModelPolicy.applyRegistry(product) : { status: "UNSUPPORTED", message: "제품 확인 상담이 필요합니다." };
        var existingSupportRequest = state.productSupportRequests.find(function (item) {
          return item.customerId === customer.id && item.productId === product.id && ["CONSULTATION_REQUIRED", "IN_PROGRESS"].indexOf(item.status) >= 0;
        });
        if (existingSupportRequest) {
          existingSupportRequest.reason = String(payload.reason || existingSupportRequest.reason || supportValidation.message).trim();
          existingSupportRequest.updatedAt = now();
          audit(state, actor, eventName, existingSupportRequest.id, "기존 제품 상담 요청 유지");
          return existingSupportRequest.id;
        }
        var supportRequest = {
          id: nextSupportRequestId(state), customerId: customer.id, productId: product.id,
          validationStatus: supportValidation.status, reason: String(payload.reason || supportValidation.message).trim(),
          status: "CONSULTATION_REQUIRED", assignedCounselorId: null, counselNote: null, result: null,
          createdAt: now(), updatedAt: now()
        };
        state.productSupportRequests.unshift(supportRequest);
        notify(state, "COUNSELOR", "STAFF-CONS-01", "제품 지원 범위 상담 요청", product.productCode + " 제품의 지원 범위를 확인해주세요.", null, null);
        state.notifications[0].productSupportRequestId = supportRequest.id;
        notify(state, "OPERATOR", "STAFF-OPER-01", "제품 검증 예외", supportValidation.status + " 제품 상담 요청이 접수되었습니다.", null, null);
        state.notifications[0].productSupportRequestId = supportRequest.id;
        audit(state, actor, eventName, supportRequest.id, supportValidation.status);
        return supportRequest.id;

      case "START_PRODUCT_SUPPORT_CONSULTATION":
        requireRole(actor, ["COUNSELOR"]);
        var supportToStart = find(state.productSupportRequests, payload.productSupportRequestId, "NO-DATA-01", "제품 상담 요청");
        if (supportToStart.status !== "CONSULTATION_REQUIRED") fail("STATE-CONFLICT-01", "상담 대기 중인 제품 요청만 시작할 수 있습니다.");
        supportToStart.status = "IN_PROGRESS";
        supportToStart.assignedCounselorId = actor.id;
        supportToStart.startedAt = now();
        supportToStart.updatedAt = now();
        notify(state, "CUSTOMER", supportToStart.customerId, "제품 상담이 시작되었습니다", "담당 상담원이 제품 지원 범위를 확인하고 있습니다.", null, null);
        state.notifications[0].productSupportRequestId = supportToStart.id;
        audit(state, actor, eventName, supportToStart.id, "제품 지원 범위 상담 시작");
        return supportToStart.id;

      case "COMPLETE_PRODUCT_SUPPORT":
        requireRole(actor, ["COUNSELOR"]);
        var supportToComplete = find(state.productSupportRequests, payload.productSupportRequestId, "NO-DATA-01", "제품 상담 요청");
        if (supportToComplete.status !== "IN_PROGRESS" || supportToComplete.assignedCounselorId !== actor.id) fail("FINALIZE-AUTH-01", "담당 상담원만 진행 중인 제품 상담을 완료할 수 있습니다.");
        if (!String(payload.note || "").trim() || !String(payload.result || "").trim()) fail("REQUIRED_INPUT", "상담 기록과 결과를 모두 입력해주세요.");
        supportToComplete.status = "COMPLETED";
        supportToComplete.counselNote = String(payload.note).trim();
        supportToComplete.result = String(payload.result).trim();
        supportToComplete.completedAt = now();
        supportToComplete.updatedAt = now();
        notify(state, "CUSTOMER", supportToComplete.customerId, "제품 상담 결과가 등록되었습니다", supportToComplete.result, null, null);
        state.notifications[0].productSupportRequestId = supportToComplete.id;
        notify(state, "OPERATOR", "STAFF-OPER-01", "제품 상담 완료", supportToComplete.id + " 지원범위 상담이 완료되었습니다.", null, null);
        state.notifications[0].productSupportRequestId = supportToComplete.id;
        audit(state, actor, eventName, supportToComplete.id, supportToComplete.result);
        return supportToComplete.id;

      case "PRODUCT_UPDATED":
        customerForActor(state, actor);
        product = find(state.products, payload.productId, "NO-DATA-01", "제품");
        if (product.customerId !== actor.id) fail("FINALIZE-AUTH-01", "본인의 제품만 수정할 수 있습니다.");
        var previousProductCode = product.productCode;
        var previousManualModel = product.manualModel;
        var candidateProduct = Object.assign({}, product);
        if (payload.productCode != null) candidateProduct.productCode = String(payload.productCode).trim();
        if (payload.manualModel != null) candidateProduct.manualModel = String(payload.manualModel).trim();
        if (payload.productGeneration != null) candidateProduct.productGeneration = String(payload.productGeneration).trim();
        var candidateValidation = ModelPolicy ? ModelPolicy.evaluate(candidateProduct) : { status: "SUPPORTED" };
        if (["REMOVED_LEGACY", "UNSUPPORTED_GENERATION", "EXPANSION"].indexOf(candidateValidation.status) >= 0) fail(candidateValidation.errorCode, candidateValidation.message);
        product.productCode = candidateProduct.productCode;
        product.manualModel = candidateProduct.manualModel;
        product.productGeneration = candidateProduct.productGeneration;
        if (payload.startedAt) product.installedAt = payload.startedAt;
        if (payload.managementType) product.managementType = payload.managementType;
        if (payload.installedArea != null) product.installedArea = String(payload.installedArea).trim();
        if (ModelPolicy) ModelPolicy.applyRegistry(product);
        if (previousProductCode !== product.productCode || previousManualModel !== product.manualModel) {
          product.reanalysisRequired = true;
          product.modelChangeHistory = product.modelChangeHistory || [];
          product.modelChangeHistory.unshift({
            previousProductCode: previousProductCode,
            previousManualModel: previousManualModel,
            productCode: product.productCode,
            manualModel: product.manualModel,
            changedAt: now(),
            changedBy: actor.name,
            changedById: actor.id
          });
          (state.inquiries || []).filter(function (item) { return item.productId === product.id && ["RESOLVED", "CANCELLED"].indexOf(item.status) < 0; }).forEach(function (item) {
            item.evidenceIds = [];
            item.aiState = "IDLE";
            item.aiOutcome = null;
            item.reanalysisRequired = true;
            item.officialSearchFailed = false;
            item.status = "DRAFT";
            item.customerActionRequired = "REANALYSIS_REQUIRED";
            item.requiresConsultation = false;
            touch(item);
            timeline(item, actor, "PRODUCT_MODEL_CHANGED", "제품 모델이 변경되어 기존 근거를 무효화하고 재분석 대기로 전환했습니다.");
          });
        }
        product.updatedAt = now();
        audit(state, actor, eventName, product.id, "제품 정보 수정 · " + product.supportStatus);
        return product.id;

      case "SAVE_QUESTIONNAIRE":
      case "SUBMIT_CARE_PRECHECK":
        questionnaire = questionnaireForActor(state, payload.questionnaireSessionId, actor);
        if (payload.stateVersion != null && Number(payload.stateVersion) !== Number(questionnaire.stateVersion)) fail("STATE-CONFLICT-01", "다른 화면에서 사전 문진이 변경되었습니다.");
        var questionnaireBefore = inputSnapshot(questionnaire);
        questionnaire.symptomCodes = Array.isArray(payload.symptomCodes) ? payload.symptomCodes.slice() : questionnaire.symptomCodes;
        questionnaire.description = payload.description != null ? String(payload.description).trim() : questionnaire.description;
        questionnaire.conditions = payload.conditions != null ? String(payload.conditions).trim() : questionnaire.conditions;
        questionnaire.displayCode = payload.displayCode != null ? String(payload.displayCode).trim() : questionnaire.displayCode;
        questionnaire.answers = Object.assign({}, questionnaire.answers || {}, payload.answers || {});
        recordInputChanges(questionnaire, questionnaireBefore, actor, eventName, questionnaire.id);
        questionnaire.questionnaireStatus = eventName === "SUBMIT_CARE_PRECHECK" ? "SUBMITTED" : "IN_PROGRESS";
        questionnaire.updatedAt = now();
        questionnaire.stateVersion = Number(questionnaire.stateVersion || 0) + 1;
        customer = find(state.customers, questionnaire.customerId);
        customer.questionnaireStatus = questionnaire.questionnaireStatus;
        audit(state, actor, eventName, questionnaire.id, questionnaire.questionnaireStatus);
        return questionnaire.id;

      case "CANCEL_CARE_PRECHECK":
        questionnaire = questionnaireForActor(state, payload.questionnaireSessionId, actor);
        if (questionnaire.inquiryId) fail("STATE-CONFLICT-01", "문의에 연결된 사전 문진은 취소할 수 없습니다.");
        questionnaire.questionnaireStatus = "CANCELLED";
        questionnaire.updatedAt = now();
        questionnaire.stateVersion = Number(questionnaire.stateVersion || 0) + 1;
        customer = find(state.customers, questionnaire.customerId);
        customer.questionnaireStatus = "UNANSWERED";
        audit(state, actor, eventName, questionnaire.id, "사전 문진 취소");
        return questionnaire.id;

      case "SAVE_DRAFT":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["CUSTOMER"]);
        checkVersion(inquiry, payload);
        if (["DRAFT", "QUESTIONNAIRE_IN_PROGRESS"].indexOf(inquiry.status) < 0) fail("STATE-CONFLICT-01", "현재 단계에서는 임시 저장할 수 없습니다.");
        var draftBefore = inputSnapshot(inquiry);
        inquiry.symptomCodes = Array.isArray(payload.symptomCodes) ? payload.symptomCodes.slice() : inquiry.symptomCodes;
        inquiry.description = payload.description != null ? String(payload.description).trim() : inquiry.description;
        inquiry.conditions = payload.conditions != null ? String(payload.conditions).trim() : inquiry.conditions;
        inquiry.displayCode = payload.displayCode != null ? String(payload.displayCode).trim() : inquiry.displayCode;
        inquiry.answers = Object.assign({}, inquiry.answers || {}, payload.answers || {});
        recordInputChanges(inquiry, draftBefore, actor, eventName, inquiry.questionnaireSessionId);
        touch(inquiry);
        timeline(inquiry, actor, eventName, "작성 내용을 임시 저장했습니다.");
        audit(state, actor, eventName, inquiry.id, "임시 저장");
        return inquiry.id;

      case "SUBMIT_SYMPTOM":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["CUSTOMER"]);
        checkVersion(inquiry, payload);
        if (["DRAFT", "QUESTIONNAIRE_IN_PROGRESS"].indexOf(inquiry.status) < 0) fail("STATE-CONFLICT-01", "현재 문의 단계에서는 증상을 제출할 수 없습니다.");
        var symptomBefore = inputSnapshot(inquiry);
        inquiry.symptomCodes = Array.isArray(payload.symptomCodes) ? payload.symptomCodes.slice() : [];
        inquiry.description = String(payload.description || "").trim();
        inquiry.conditions = String(payload.conditions || "").trim();
        inquiry.displayCode = String(payload.displayCode || "").trim();
        inquiry.answers = Object.assign({}, inquiry.answers || {}, payload.answers || {});
        recordInputChanges(inquiry, symptomBefore, actor, eventName, inquiry.questionnaireSessionId);
        if (!inquiry.symptomCodes.length && !inquiry.description) fail("SAVE-FAILED-01", "대표 증상을 선택하지 않았다면 고객 원문을 입력해주세요.");
        if (inquiry.symptomCodes.indexOf("LOW_FLOW") >= 0 && !inquiry.answers.flow) fail("SAVE-FAILED-01", "출수 상태를 선택해주세요.");
        if (inquiry.symptomCodes.indexOf("LEAK") >= 0 && !inquiry.answers.leak) fail("SAVE-FAILED-01", "누수 안전 확인 결과를 선택해주세요.");
        if (inquiry.symptomCodes.indexOf("TEMPERATURE") >= 0 && !inquiry.conditions) fail("SAVE-FAILED-01", "온도 이상이 발생한 조건을 입력해주세요.");
        timeline(inquiry, actor, eventName, "증상과 문진 입력을 저장했습니다.");
        product = find(state.products, inquiry.productId, "NO-DATA-01", "제품");
        applyAIOutcome(state, inquiry, product, actor);
        if (inquiry.questionnaireSessionId) {
          var linkedQuestionnaire = find(state.questionnaireSessions, inquiry.questionnaireSessionId, "NO-DATA-01", "연결 사전 문진");
          linkedQuestionnaire.inquiryId = inquiry.id;
          linkedQuestionnaire.questionnaireStatus = "SUBMITTED";
          linkedQuestionnaire.updatedAt = now();
          customer = find(state.customers, inquiry.customerId);
          customer.questionnaireStatus = "SUBMITTED";
        }
        touch(inquiry);
        audit(state, actor, eventName, inquiry.id, inquiry.aiOutcome || "ADDITIONAL_INFORMATION_REQUIRED");
        return inquiry.id;

      case "SUBMIT_ANSWERS":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["CUSTOMER"]);
        checkVersion(inquiry, payload);
        if (inquiry.status !== "QUESTIONNAIRE_IN_PROGRESS") fail("STATE-CONFLICT-01", "추가 질문 단계가 아닙니다.");
        var answersBefore = inputSnapshot(inquiry);
        inquiry.answers = Object.assign({}, inquiry.answers || {}, payload.answers || {});
        Object.keys(payload.answers || {}).forEach(function (key) {
          if (/발생.*조건/.test(key) && payload.answers[key]) inquiry.conditions = String(payload.answers[key]).trim();
          if (/호스/.test(key) && payload.answers[key]) inquiry.answers.hoseChecked = payload.answers[key];
        });
        inquiry.conditions = payload.conditions || inquiry.conditions;
        recordInputChanges(inquiry, answersBefore, actor, eventName, inquiry.questionnaireSessionId);
        timeline(inquiry, actor, eventName, "추가 답변을 저장했습니다.");
        product = find(state.products, inquiry.productId, "NO-DATA-01", "제품");
        applyAIOutcome(state, inquiry, product, actor);
        touch(inquiry);
        audit(state, actor, eventName, inquiry.id, inquiry.aiOutcome || "추가 답변 대기");
        return inquiry.id;

      case "RETRY_AI_PROCESS":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["CUSTOMER"]);
        checkVersion(inquiry, payload);
        if (inquiry.aiState !== "FAILED") fail("STATE-CONFLICT-01", "실패한 AI 처리만 다시 시도할 수 있습니다.");
        inquiry.retryCount = Number(inquiry.retryCount || 0) + 1;
        if (inquiry.retryCount >= Number(Config.aiMaxRetries || 2)) {
          inquiry.errorCode = "AI-RETRY-EXCEEDED-01";
          inquiry.status = "CONSULTATION_REQUIRED";
          inquiry.requiresConsultation = true;
          inquiry.assignedCounselorId = inquiry.assignedCounselorId || "STAFF-CONS-01";
          inquiry.path = "COUNSEL";
          inquiry.customerActionRequired = null;
          touch(inquiry);
          timeline(inquiry, { role: "SYSTEM", id: "AI-ORCHESTRATOR", name: "AI 안내 시뮬레이터" }, "AI_RETRY_EXCEEDED", "최대 재시도 횟수를 초과해 상담 대기로 전환했습니다.");
          notify(state, "COUNSELOR", inquiry.assignedCounselorId, "AI 재시도 초과 문의", inquiry.symptomLabel + " 문의를 직접 확인해주세요.", inquiry.id);
          audit(state, { role: "SYSTEM", id: "AI-ORCHESTRATOR", name: "AI 안내 시뮬레이터" }, "AI_RETRY_EXCEEDED", inquiry.id, inquiry.errorCode);
          return inquiry.id;
        }
        inquiry.errorCode = null;
        product = find(state.products, inquiry.productId, "NO-DATA-01", "제품");
        applyAIOutcome(state, inquiry, product, actor);
        touch(inquiry);
        timeline(inquiry, actor, eventName, "보존된 입력으로 실패 단계부터 AI 시뮬레이션을 다시 실행했습니다.");
        audit(state, actor, eventName, inquiry.id, "재시도 " + inquiry.retryCount + "회");
        return inquiry.id;

      case "CANCEL_INQUIRY":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["CUSTOMER"]);
        checkVersion(inquiry, payload);
        if (["DRAFT", "QUESTIONNAIRE_IN_PROGRESS"].indexOf(inquiry.status) < 0) fail("STATE-CONFLICT-01", "진행된 문의는 취소할 수 없습니다.");
        inquiry.status = "CANCELLED";
        inquiry.aiState = "CANCELLED";
        inquiry.customerActionRequired = null;
        touch(inquiry);
        timeline(inquiry, actor, eventName, "문의를 취소했습니다.");
        audit(state, actor, eventName, inquiry.id, "문의 취소");
        return inquiry.id;

      case "CUSTOMER_REPORTED_SELF_RESOLVED":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["CUSTOMER"]);
        checkVersion(inquiry, payload);
        if (inquiry.riskLevel === "DANGER" || inquiry.requiresConsultation) fail("FINALIZE-AUTH-01", "안전 또는 상담 필수 문의는 고객이 직접 종료할 수 없습니다.");
        if (inquiry.status !== "AI_GUIDANCE") fail("STATE-CONFLICT-01", "현재 단계에서는 자가조치 해결로 종료할 수 없습니다.");
        if (inquiry.aiState !== "COMPLETED" || inquiry.aiOutcome !== "SAFE_GUIDANCE_READY" || inquiry.reanalysisRequired || !(inquiry.evidenceIds || []).length) fail("EMPTY_EVIDENCE", "검증된 공식 근거와 재분석 완료 전에는 자가 해결로 종료할 수 없습니다.");
        if (typeof payload.actionPerformed !== "boolean") fail("SAVE-FAILED-01", "조치 수행 여부를 선택해주세요.");
        if (payload.actionPerformed && !String(payload.performedAction || "").trim()) fail("SAVE-FAILED-01", "수행한 조치를 입력해주세요.");
        inquiry.actionPerformed = payload.actionPerformed;
        inquiry.performedAction = String(payload.performedAction || "").trim();
        inquiry.actionResult = payload.actionResult || "RESOLVED";
        inquiry.status = "RESOLVED";
        inquiry.outcome = "SELF_RESOLVED";
        inquiry.customerActionRequired = null;
        inquiry.finalizedByType = "customer_self";
        inquiry.finalizedById = actor.id;
        inquiry.finalizedBy = actor.name;
        inquiry.finalizedAt = now();
        touch(inquiry);
        timeline(inquiry, actor, eventName, "자가조치로 해결되어 문의를 완료했습니다.");
        audit(state, actor, eventName, inquiry.id, "즉시 RESOLVED");
        return inquiry.id;

      case "REQUEST_CONSULTATION":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["CUSTOMER"]);
        checkVersion(inquiry, payload);
        if (["RESOLVED", "CANCELLED"].indexOf(inquiry.status) >= 0) fail("ALREADY-RESOLVED-01", "이미 종료된 문의입니다.");
        var submittedSafeActions = payload.safeActions || payload.safetyActions;
        if (inquiry.riskLevel === "DANGER" || inquiry.requiresConsultation || submittedSafeActions) {
          inquiry.safeActions = Object.assign({ waterValveClosed: false, powerDisconnected: false, drinkingStopped: false }, inquiry.safeActions || {}, submittedSafeActions || {});
          if (inquiry.scenarioId === "SYN-JAC104-004") inquiry.safetyActionCompleted = Boolean(inquiry.safeActions.waterValveClosed && inquiry.safeActions.powerDisconnected);
          else if (inquiry.scenarioId === "SYN-JAC104-006") inquiry.safetyActionCompleted = Boolean(inquiry.safeActions.drinkingStopped);
          else inquiry.safetyActionCompleted = Object.keys(submittedSafeActions || {}).some(function (key) { return Boolean(inquiry.safeActions[key]); });
          inquiry.safetyActionRecordedAt = now();
        }
        if (payload.actionResult) inquiry.actionResult = payload.actionResult;
        if (typeof payload.actionPerformed === "boolean") inquiry.actionPerformed = payload.actionPerformed;
        if (payload.performedAction) inquiry.performedAction = String(payload.performedAction).trim();
        if (payload.note) inquiry.consultationNote = String(payload.note).trim();
        inquiry.consultationRequestedAt = now();
        var preserveActiveWork = ["CONSULTATION_IN_PROGRESS", "VISIT_REVIEW_PENDING", "VISIT_SCHEDULING", "VISIT_SCHEDULED", "REVISIT_REQUIRED"].indexOf(inquiry.status) >= 0;
        if (!preserveActiveWork) inquiry.status = "CONSULTATION_REQUIRED";
        inquiry.requiresConsultation = true;
        inquiry.assignedCounselorId = inquiry.assignedCounselorId || "STAFF-CONS-01";
        if (!preserveActiveWork) inquiry.path = "COUNSEL";
        inquiry.customerActionRequired = null;
        touch(inquiry);
        timeline(inquiry, actor, eventName, "상담을 요청했습니다.");
        notify(state, "COUNSELOR", inquiry.assignedCounselorId, "새 상담 요청", inquiry.symptomLabel + " 문의가 접수되었습니다.", inquiry.id);
        audit(state, actor, eventName, inquiry.id, "상담 요청");
        return inquiry.id;

      case "SUBMIT_RESOLUTION_FEEDBACK":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["CUSTOMER"]);
        checkVersion(inquiry, payload);
        if (inquiry.status !== "COMPLETION_PENDING") fail("STATE-CONFLICT-01", "처리 결과 확인 단계가 아닙니다.");
        if (payload.resolved === false) fail("EVENT-CONTRACT-01", "미해결은 CUSTOMER_REPORTED_UNRESOLVED 이벤트로 제출해주세요.");
        inquiry.resolutionFeedback = { resolved: true, comment: String(payload.comment || "").trim(), submittedAt: now() };
        inquiry.customerActionRequired = "STAFF_FINALIZATION";
        timeline(inquiry, actor, eventName, "해결됨 피드백을 제출했습니다. 담당자 최종 확인을 기다립니다.");
        if (inquiry.path === "VISIT") notify(state, "TECHNICIAN", inquiry.assignedTechnicianId, "고객 해결 피드백", "고객이 해결됨을 확인했습니다. 문의를 최종 확인해주세요.", inquiry.id);
        else notify(state, "COUNSELOR", inquiry.assignedCounselorId, "고객 해결 피드백", "고객이 해결됨을 확인했습니다. 문의를 최종 확인해주세요.", inquiry.id);
        touch(inquiry);
        audit(state, actor, eventName, inquiry.id, "해결 피드백");
        return inquiry.id;

      case "CUSTOMER_REPORTED_UNRESOLVED":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["CUSTOMER"]);
        checkVersion(inquiry, payload);
        if (inquiry.status !== "COMPLETION_PENDING") fail("STATE-CONFLICT-01", "처리 결과 확인 단계가 아닙니다.");
        inquiry.resolutionFeedback = { resolved: false, comment: String(payload.comment || "").trim(), submittedAt: now() };
        inquiry.status = "REOPENED";
        inquiry.assignedCounselorId = inquiry.assignedCounselorId || "STAFF-CONS-01";
        inquiry.customerActionRequired = null;
        touch(inquiry);
        timeline(inquiry, actor, eventName, "미해결 피드백으로 문의를 다시 열었습니다.");
        notify(state, "COUNSELOR", inquiry.assignedCounselorId, "문의 재개", "고객이 미해결을 선택했습니다.", inquiry.id);
        audit(state, actor, eventName, inquiry.id, "미해결 재개");
        return inquiry.id;

      case "RESUME_CONSULTATION":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["COUNSELOR"]);
        checkVersion(inquiry, payload);
        if (inquiry.status !== "REOPENED") fail("STATE-CONFLICT-01", "재개된 문의만 상담 대기로 복귀할 수 있습니다.");
        inquiry.status = "CONSULTATION_REQUIRED";
        inquiry.assignedCounselorId = actor.id;
        inquiry.path = "COUNSEL";
        touch(inquiry);
        timeline(inquiry, actor, eventName, "재개된 문의를 상담 대기로 복귀했습니다.");
        audit(state, actor, eventName, inquiry.id, "REOPENED → CONSULTATION_REQUIRED");
        return inquiry.id;

      case "START_CONSULTATION":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["COUNSELOR"]);
        checkVersion(inquiry, payload);
        if (inquiry.status !== "CONSULTATION_REQUIRED") fail("STATE-CONFLICT-01", "상담 대기 상태에서만 상담을 시작할 수 있습니다.");
        inquiry.assignedCounselorId = actor.id;
        inquiry.status = "CONSULTATION_IN_PROGRESS";
        inquiry.path = "COUNSEL";
        touch(inquiry);
        timeline(inquiry, actor, eventName, "상담을 시작했습니다.");
        audit(state, actor, eventName, inquiry.id, "상담 시작");
        return inquiry.id;

      case "UPDATE_CONSULTATION_SUMMARY":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["COUNSELOR"]);
        checkVersion(inquiry, payload);
        if (!String(payload.text || "").trim()) fail("SAVE-FAILED-01", "상담사 수정 요약을 입력해주세요.");
        inquiry.consultationSummaryRevision = {
          text: String(payload.text).trim(),
          editedAt: now(),
          editedBy: actor.name,
          editorId: actor.id
        };
        inquiry.aiSummaryRevision = clone(inquiry.consultationSummaryRevision);
        touch(inquiry);
        timeline(inquiry, actor, "UPDATE_CONSULTATION_SUMMARY", "AI 원본을 유지한 채 상담사 수정 요약을 별도 저장했습니다.");
        audit(state, actor, eventName, inquiry.id, "상담사 수정본 저장");
        return inquiry.id;

      case "CONFIRM_CONSULTATION_SUMMARY":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["COUNSELOR"]);
        checkVersion(inquiry, payload);
        var summaryText = String(payload.text || (inquiry.consultationSummaryRevision && inquiry.consultationSummaryRevision.text) || "").trim();
        if (!summaryText) fail("SAVE-FAILED-01", "확정할 상담 요약이 없습니다.");
        inquiry.confirmedConsultationSummary = summaryText;
        inquiry.summaryConfirmedBy = actor.name;
        inquiry.summaryConfirmedById = actor.id;
        inquiry.summaryConfirmedAt = now();
        inquiry.meta = inquiry.meta || {};
        inquiry.meta.summaryConfirmedBy = inquiry.summaryConfirmedBy;
        inquiry.meta.summaryConfirmedById = inquiry.summaryConfirmedById;
        inquiry.meta.summaryConfirmedAt = inquiry.summaryConfirmedAt;
        inquiry.summaryMeta = clone(inquiry.meta);
        touch(inquiry);
        timeline(inquiry, actor, eventName, "방문기사에게 전달할 상담 요약을 확정했습니다.");
        audit(state, actor, eventName, inquiry.id, "상담 요약 확정");
        return inquiry.id;

      case "CONSULTATION_COMPLETED":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["COUNSELOR"]);
        checkVersion(inquiry, payload);
        if (inquiry.status !== "CONSULTATION_IN_PROGRESS") fail("STATE-CONFLICT-01", "상담 진행 중인 문의만 완료할 수 있습니다.");
        if (!String(payload.note || "").trim() || !String(payload.outcome || "").trim()) fail("SAVE-FAILED-01", "상담 기록과 상담 결과를 모두 입력해주세요.");
        inquiry.counselRecord = { note: String(payload.note).trim(), outcome: String(payload.outcome).trim(), completedAt: now(), completedBy: actor.name };
        inquiry.status = "COMPLETION_PENDING";
        inquiry.path = "COUNSEL";
        inquiry.customerActionRequired = "RESOLUTION_FEEDBACK";
        inquiry.usageGuidance = inquiry.usageGuidance || normalGuidance();
        if (payload.usageGuidanceStatus || payload.usageStatus) {
          inquiry.usageGuidance.usageGuidanceStatus = payload.usageGuidanceStatus || payload.usageStatus;
          inquiry.usageGuidance.updatedAt = now();
          inquiry.usageGuidance.updatedBy = actor.name;
        }
        if (payload.usageGuidanceMessage != null) inquiry.usageGuidance.usageGuidanceMessage = String(payload.usageGuidanceMessage).trim();
        if (payload.restrictedFunctions != null) inquiry.usageGuidance.restrictedFunctions = Array.isArray(payload.restrictedFunctions) ? payload.restrictedFunctions.slice() : String(payload.restrictedFunctions).split(",").map(function (item) { return item.trim(); }).filter(Boolean);
        if (payload.guidanceBasis != null || payload.decisionBasis != null) inquiry.usageGuidance.guidanceBasis = String(payload.guidanceBasis || payload.decisionBasis).trim();
        if (payload.nextAction != null) inquiry.usageGuidance.nextAction = String(payload.nextAction).trim();
        touch(inquiry);
        timeline(inquiry, actor, eventName, "상담을 완료하고 고객 피드백을 요청했습니다.");
        notify(state, "CUSTOMER", inquiry.customerId, "상담 결과 확인", "상담이 완료되었습니다. 해결 여부를 알려주세요.", inquiry.id);
        audit(state, actor, eventName, inquiry.id, "항상 COMPLETION_PENDING");
        return inquiry.id;

      case "VISIT_REVIEW_REQUIRED":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["COUNSELOR"]);
        checkVersion(inquiry, payload);
        if (["CONSULTATION_REQUIRED", "CONSULTATION_IN_PROGRESS", "REOPENED"].indexOf(inquiry.status) < 0) fail("STATE-CONFLICT-01", "방문 검토로 전환할 수 없는 상태입니다.");
        inquiry.status = "VISIT_REVIEW_PENDING";
        inquiry.path = "VISIT";
        inquiry.counselRecord = Object.assign({}, inquiry.counselRecord || {}, { note: String(payload.note || "방문 검토 필요").trim(), updatedAt: now(), updatedBy: actor.name });
        touch(inquiry);
        timeline(inquiry, actor, eventName, "방문 필요 여부 검토 단계로 전환했습니다.");
        audit(state, actor, eventName, inquiry.id, "방문 검토");
        return inquiry.id;

      case "VISIT_NEEDED":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["COUNSELOR"]);
        checkVersion(inquiry, payload);
        if (inquiry.status !== "VISIT_REVIEW_PENDING") fail("STATE-CONFLICT-01", "방문 검토가 완료된 문의만 방문을 생성할 수 있습니다.");
        requireTechnician(state, payload.technicianId);
        if (!String(payload.visitReason || "").trim() || !String(payload.inspectionPriority || "").trim()) fail("SAVE-FAILED-01", "방문 사유와 점검 우선순위를 입력해주세요.");
        var confirmedSummaryText = typeof inquiry.confirmedConsultationSummary === "string" ? inquiry.confirmedConsultationSummary : inquiry.confirmedConsultationSummary && inquiry.confirmedConsultationSummary.text;
        if (!String(confirmedSummaryText || "").trim()) fail("SAVE-FAILED-01", "상담 요약을 확정한 뒤 방문 업무를 생성해주세요.");
        var previsitSource = confirmedSummaryText;
        visit = {
          id: nextVisitId(state), inquiryId: inquiry.id, technicianId: payload.technicianId,
          status: "ASSIGNING", desiredAt: payload.desiredAt || null, confirmedAt: null,
          visitReason: String(payload.visitReason || "").trim(), inspectionPriority: String(payload.inspectionPriority || "").trim(),
          notes: String(payload.notes || "").trim(), safetyNotes: String(payload.safetyNotes || "").trim(),
          reconfirmed: false,
          previsitReportRevision: { text: "사전 확인: " + previsitSource, editedAt: now(), editedBy: "AI 사전 리포트", editorId: "AI-PREVISIT" },
          confirmedPrevisitReport: null,
          meta: {},
          result: null, stateVersion: 1
        };
        state.visits.push(visit);
        inquiry.status = "VISIT_SCHEDULING";
        inquiry.assignedTechnicianId = payload.technicianId;
        inquiry.path = "VISIT";
        touch(inquiry);
        timeline(inquiry, actor, eventName, "방문기사 배정을 시작했습니다.");
        audit(state, actor, eventName, inquiry.id, visit.id);
        return visit.id;

      case "UPDATE_VISIT_SCHEDULE":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["COUNSELOR"]);
        checkVersion(inquiry, payload);
        visit = visitForInquiry(state, inquiry, payload);
        if (payload.technicianId) { requireTechnician(state, payload.technicianId); visit.technicianId = payload.technicianId; inquiry.assignedTechnicianId = payload.technicianId; }
        if (payload.desiredAt) visit.desiredAt = payload.desiredAt;
        if (payload.confirmedAt) visit.confirmedAt = payload.confirmedAt;
        if (payload.notes != null) visit.notes = String(payload.notes).trim();
        if (payload.safetyNotes != null) visit.safetyNotes = String(payload.safetyNotes).trim();
        if (payload.visitReason != null) visit.visitReason = String(payload.visitReason).trim();
        if (payload.inspectionPriority != null) visit.inspectionPriority = String(payload.inspectionPriority).trim();
        visit.status = "SCHEDULING";
        visit.stateVersion = Number(visit.stateVersion || 0) + 1;
        inquiry.status = "VISIT_SCHEDULING";
        touch(inquiry);
        timeline(inquiry, actor, eventName, "방문 일정 조율 정보를 저장했습니다.");
        audit(state, actor, eventName, inquiry.id, visit.id);
        return visit.id;

      case "CONFIRM_VISIT":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["COUNSELOR"]);
        checkVersion(inquiry, payload);
        visit = visitForInquiry(state, inquiry, payload);
        if (payload.technicianId) { requireTechnician(state, payload.technicianId); visit.technicianId = payload.technicianId; inquiry.assignedTechnicianId = payload.technicianId; }
        visit.confirmedAt = payload.confirmedAt || visit.confirmedAt || payload.desiredAt || visit.desiredAt;
        requireTechnician(state, visit.technicianId);
        if (!visit.confirmedAt) fail("SAVE-FAILED-01", "방문 확정일을 입력해주세요.");
        visit.desiredAt = payload.desiredAt || visit.desiredAt || visit.confirmedAt;
        visit.notes = payload.notes != null ? String(payload.notes).trim() : visit.notes;
        visit.safetyNotes = payload.safetyNotes != null ? String(payload.safetyNotes).trim() : visit.safetyNotes;
        visit.visitReason = payload.visitReason != null ? String(payload.visitReason).trim() : visit.visitReason;
        visit.inspectionPriority = payload.inspectionPriority != null ? String(payload.inspectionPriority).trim() : visit.inspectionPriority;
        if (!String(visit.visitReason || "").trim() || !String(visit.inspectionPriority || "").trim()) fail("SAVE-FAILED-01", "방문 사유와 점검 우선순위를 입력해주세요.");
        visit.status = "CONFIRMED";
        visit.stateVersion = Number(visit.stateVersion || 0) + 1;
        inquiry.status = "VISIT_SCHEDULED";
        inquiry.customerActionRequired = null;
        touch(inquiry);
        timeline(inquiry, actor, eventName, "방문 일정을 확정했습니다.");
        notify(state, "TECHNICIAN", visit.technicianId, "방문 일정 확정", inquiry.symptomLabel + " 방문 일정이 확정되었습니다.", inquiry.id, visit.id);
        notify(state, "CUSTOMER", inquiry.customerId, "방문 일정 확정", "방문 일정이 확정되었습니다.", inquiry.id, visit.id);
        audit(state, actor, eventName, inquiry.id, visit.id);
        return visit.id;

      case "UPDATE_PREVISIT_REPORT":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["TECHNICIAN"]);
        checkVersion(inquiry, payload);
        visit = visitForInquiry(state, inquiry, payload);
        if (!String(payload.text || "").trim()) fail("SAVE-FAILED-01", "수정할 사전 방문 리포트를 입력해주세요.");
        visit.previsitReportRevision = { text: String(payload.text).trim(), editedAt: now(), editedBy: actor.name, editorId: actor.id };
        visit.stateVersion = Number(visit.stateVersion || 0) + 1;
        touch(inquiry);
        timeline(inquiry, actor, eventName, "현장 확인용 사전 방문 리포트를 수정했습니다.");
        audit(state, actor, eventName, inquiry.id, visit.id);
        return visit.id;

      case "CONFIRM_PREVISIT_REPORT":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["TECHNICIAN"]);
        checkVersion(inquiry, payload);
        visit = visitForInquiry(state, inquiry, payload);
        var reportText = String(payload.text || (visit.previsitReportRevision && visit.previsitReportRevision.text) || visit.previsitReportRevision || "").trim();
        if (!reportText) fail("SAVE-FAILED-01", "확정할 사전 방문 리포트가 없습니다.");
        visit.confirmedPrevisitReport = reportText;
        visit.previsitReportConfirmedBy = actor.name;
        visit.previsitReportConfirmedById = actor.id;
        visit.previsitReportConfirmedAt = now();
        visit.meta = visit.meta || {};
        visit.meta.previsitReportConfirmedBy = visit.previsitReportConfirmedBy;
        visit.meta.previsitReportConfirmedById = visit.previsitReportConfirmedById;
        visit.meta.previsitReportConfirmedAt = visit.previsitReportConfirmedAt;
        visit.stateVersion = Number(visit.stateVersion || 0) + 1;
        touch(inquiry);
        timeline(inquiry, actor, eventName, "현장 점검 전에 사전 방문 리포트를 확정했습니다.");
        audit(state, actor, eventName, inquiry.id, visit.id);
        return visit.id;

      case "START_VISIT":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["TECHNICIAN"]);
        checkVersion(inquiry, payload);
        visit = visitForInquiry(state, inquiry, payload);
        if (visit.technicianId !== actor.id) fail("FINALIZE-AUTH-01", "담당 방문기사만 점검을 시작할 수 있습니다.");
        if (visit.status !== "CONFIRMED") fail("STATE-CONFLICT-01", "확정된 방문만 시작할 수 있습니다.");
        if (!String(typeof visit.confirmedPrevisitReport === "string" ? visit.confirmedPrevisitReport : visit.confirmedPrevisitReport && visit.confirmedPrevisitReport.text || "").trim()) fail("SAVE-FAILED-01", "사전 방문 리포트를 확정한 뒤 점검을 시작해주세요.");
        if (!(payload.reconfirmed === true || (Array.isArray(payload.reconfirmed) && payload.reconfirmed.length))) fail("SAVE-FAILED-01", "현장 재확인 항목을 완료해주세요.");
        visit.status = "IN_PROGRESS";
        visit.startedAt = now();
        visit.reconfirmed = Boolean(payload.reconfirmed);
        visit.stateVersion = Number(visit.stateVersion || 0) + 1;
        inquiry.status = "VISIT_SCHEDULED";
        touch(inquiry);
        timeline(inquiry, actor, eventName, "현장 점검을 시작했습니다.");
        notify(state, "CUSTOMER", inquiry.customerId, "방문 점검 시작", "방문기사가 현장 점검을 시작했습니다.", inquiry.id, visit.id);
        audit(state, actor, eventName, inquiry.id, visit.id);
        return visit.id;

      case "VISIT_COMPLETED":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["TECHNICIAN"]);
        checkVersion(inquiry, payload);
        visit = visitForInquiry(state, inquiry, payload);
        if (visit.technicianId !== actor.id) fail("FINALIZE-AUTH-01", "담당 방문기사만 결과를 등록할 수 있습니다.");
        if (visit.status !== "IN_PROGRESS") fail("STATE-CONFLICT-01", "방문 진행 중에만 완료할 수 있습니다.");
        if (!String(payload.actualCause || "").trim() || !String(payload.actions || "").trim() || !String(payload.usageGuidanceMessage || "").trim() || !String(payload.guidanceBasis || payload.decisionBasis || "").trim() || !String(payload.nextAction || "").trim() || !String(payload.signature || "").trim()) fail("SAVE-FAILED-01", "방문 결과 필수 항목을 모두 입력해주세요.");
        if (typeof payload.careHistoryApplied !== "boolean") fail("SAVE-FAILED-01", "케어 이력 반영 여부를 선택해주세요.");
        var careHistoryApplied = payload.careHistoryApplied === true;
        var visitCompletedCareDate = String(payload.visitCompletedCareDate || "").trim() || null;
        var filterReplaced = payload.filterReplaced === true;
        var replacedFilterItems = Array.isArray(payload.replacedFilterItems) ? payload.replacedFilterItems.slice() : String(payload.replacedFilterItems || "").split(",").map(function (item) { return item.trim(); }).filter(Boolean);
        var nextCareDate = payload.nextCareDate || null;
        var nextCareBasis = nextCareDate ? String(payload.nextCareBasis || "").trim() : null;
        var nextCareStatus = nextCareDate ? (payload.nextCareStatus || "CONFIRMED") : "CONFIRMATION_REQUIRED";
        if (careHistoryApplied && !visitCompletedCareDate) fail("SAVE-FAILED-01", "방문 완료 관리일을 입력해주세요.");
        if (filterReplaced && !replacedFilterItems.length) fail("SAVE-FAILED-01", "교체한 필터·카트리지 항목을 입력해주세요.");
        if (nextCareDate && ["OFFICIAL", "TEAM_RULE"].indexOf(nextCareBasis) < 0) fail("SAVE-FAILED-01", "다음 케어 일정의 공식 또는 팀 승인 산정 근거가 필요합니다.");
        visit.result = {
          actualCause: String(payload.actualCause).trim(), actions: String(payload.actions).trim(),
          parts: String(payload.parts || "교체 부품 없음").trim(), usageGuidanceStatus: payload.usageGuidanceStatus || payload.usageStatus || "PENDING_CONSULTATION",
          usageGuidanceMessage: String(payload.usageGuidanceMessage || payload.nextAction || "").trim(),
          restrictedFunctions: Array.isArray(payload.restrictedFunctions) ? payload.restrictedFunctions.slice() : String(payload.restrictedFunctions || "").split(",").map(function (item) { return item.trim(); }).filter(Boolean),
          guidanceBasis: String(payload.guidanceBasis || payload.decisionBasis).trim(), nextAction: String(payload.nextAction).trim(),
          drinkingStopMaintained: payload.drinkingStopMaintained === true,
          careHistoryApplied: careHistoryApplied, visitCompletedCareDate: visitCompletedCareDate,
          filterReplaced: filterReplaced, replacedFilterItems: replacedFilterItems,
          nextCareDate: nextCareDate, nextCareBasis: nextCareBasis, nextCareStatus: nextCareStatus,
          followUpCounsel: Boolean(payload.followUpCounsel), notes: String(payload.notes || "").trim(), signature: String(payload.signature || "").trim()
        };
        visit.result.usageStatus = visit.result.usageGuidanceStatus;
        visit.result.decisionBasis = visit.result.guidanceBasis;
        visit.status = "COMPLETED";
        visit.completedAt = now();
        visit.stateVersion = Number(visit.stateVersion || 0) + 1;
        product = find(state.products, inquiry.productId, "NO-DATA-01", "제품");
        if (careHistoryApplied) {
          product.lastCareAt = visitCompletedCareDate;
          if (filterReplaced) product.lastFilterChangedAt = payload.lastFilterReplacementDate || product.lastCareAt;
          product.careSchedule = Object.assign({}, product.careSchedule || {}, {
            status: nextCareStatus,
            label: nextCareStatus === "CONFIRMATION_REQUIRED" ? "확인 필요" : "다음 케어 예정",
            sourceType: nextCareBasis || "unconfirmed",
            nextCareAt: nextCareDate,
            nextCareBasis: nextCareBasis,
            lastVisitId: visit.id,
            updatedAt: visit.completedAt,
            note: nextCareBasis ? "확정 기준에 따라 다음 케어 일정을 기록했습니다." : "산정 기준이 없어 다음 케어 일정 확인이 필요합니다."
          });
          state.careHistory.unshift({
            id: nextId(state.careHistory, "DEMO-CARE-"),
            inquiryId: inquiry.id,
            visitId: visit.id,
            productId: product.id,
            technicianId: actor.id,
            actualCause: visit.result.actualCause,
            actions: visit.result.actions,
            parts: visit.result.parts,
            usageGuidanceStatus: visit.result.usageGuidanceStatus,
            usageStatus: visit.result.usageGuidanceStatus,
            nextAction: visit.result.nextAction,
            replacedFilterItems: replacedFilterItems,
            careHistoryUpdatedAt: now(),
            lastCareDate: product.lastCareAt,
            lastFilterReplacementDate: product.lastFilterChangedAt || null,
            nextCareDate: product.careSchedule.nextCareAt,
            nextCareBasis: product.careSchedule.nextCareBasis,
            nextCareStatus: product.careSchedule.status,
            subscriptionId: product.subscriptionId,
            completedAt: visit.completedAt
          });
        }
        visit.careApplied = careHistoryApplied;
        visit.careUpdatedAt = careHistoryApplied ? visit.completedAt : null;
        inquiry.status = "COMPLETION_PENDING";
        inquiry.path = "VISIT";
        inquiry.customerActionRequired = "RESOLUTION_FEEDBACK";
        inquiry.usageGuidance = {
          usageGuidanceStatus: visit.result.usageGuidanceStatus,
          usageGuidanceMessage: visit.result.usageGuidanceMessage || visit.result.nextAction,
          restrictedWaterTypes: inquiry.usageGuidance && inquiry.usageGuidance.restrictedWaterTypes || [],
          restrictedFunctions: visit.result.restrictedFunctions,
          guidanceBasis: visit.result.guidanceBasis,
          nextAction: visit.result.nextAction,
          updatedAt: now(), updatedBy: actor.name
        };
        touch(inquiry);
        timeline(inquiry, actor, eventName, "방문 결과를 저장하고 고객 확인을 요청했습니다.");
        notify(state, "CUSTOMER", inquiry.customerId, "방문 결과 확인", "방문 처리가 완료되었습니다. 해결 여부를 알려주세요.", inquiry.id, visit.id);
        audit(state, actor, eventName, inquiry.id, "항상 COMPLETION_PENDING");
        return visit.id;

      case "REVISIT_NEEDED":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["TECHNICIAN"]);
        checkVersion(inquiry, payload);
        visit = visitForInquiry(state, inquiry, payload);
        if (visit.technicianId !== actor.id) fail("FINALIZE-AUTH-01", "담당 방문기사만 추가 방문을 요청할 수 있습니다.");
        if (!String(payload.revisitReason || payload.notes || "").trim()) fail("SAVE-FAILED-01", "추가 방문 사유를 입력해주세요.");
        var revisitUsageStatus = payload.usageGuidanceStatus || payload.usageStatus || "PENDING_CONSULTATION";
        var revisitUsageMessage = String(payload.usageGuidanceMessage || payload.nextAction || "추가 방문 일정 협의").trim();
        var revisitRestrictedFunctions = Array.isArray(payload.restrictedFunctions) ? payload.restrictedFunctions.slice() : String(payload.restrictedFunctions || "").split(",").map(function (item) { return item.trim(); }).filter(Boolean);
        var revisitGuidanceBasis = String(payload.guidanceBasis || payload.decisionBasis || "현장 점검 결과").trim();
        visit.status = "FOLLOW_UP_REQUIRED";
        visit.result = Object.assign({}, visit.result || {}, {
          actualCause: String(payload.actualCause || "추가 확인 필요").trim(), actions: String(payload.actions || "현장 1차 점검").trim(),
          parts: String(payload.parts || "").trim(), usageGuidanceStatus: revisitUsageStatus, usageGuidanceMessage: revisitUsageMessage,
          usageStatus: revisitUsageStatus, restrictedFunctions: revisitRestrictedFunctions,
          guidanceBasis: revisitGuidanceBasis, decisionBasis: revisitGuidanceBasis,
          nextAction: String(payload.nextAction || "추가 방문 일정 협의").trim(), followUpCounsel: Boolean(payload.followUpCounsel),
          careHistoryApplied: false, visitCompletedCareDate: payload.visitCompletedCareDate || null,
          filterReplaced: payload.filterReplaced === true,
          replacedFilterItems: Array.isArray(payload.replacedFilterItems) ? payload.replacedFilterItems.slice() : [],
          nextCareDate: payload.nextCareDate || null, nextCareBasis: payload.nextCareBasis || null,
          nextCareStatus: "CONFIRMATION_REQUIRED",
          notes: String(payload.notes || "").trim(), revisitReason: String(payload.revisitReason || payload.notes).trim(), signature: String(payload.signature || "").trim()
        });
        if (visit.confirmedPrevisitReport) {
          visit.previsitReportHistory = visit.previsitReportHistory || [];
          visit.previsitReportHistory.push({ text: visit.confirmedPrevisitReport, confirmedAt: visit.previsitReportConfirmedAt || null, confirmedById: visit.previsitReportConfirmedById || null });
        }
        visit.confirmedPrevisitReport = null;
        visit.previsitReportConfirmedBy = null;
        visit.previsitReportConfirmedById = null;
        visit.previsitReportConfirmedAt = null;
        visit.stateVersion = Number(visit.stateVersion || 0) + 1;
        inquiry.status = "REVISIT_REQUIRED";
        inquiry.path = "VISIT";
        inquiry.customerActionRequired = null;
        inquiry.usageGuidance = {
          usageGuidanceStatus: revisitUsageStatus,
          usageGuidanceMessage: revisitUsageMessage,
          restrictedWaterTypes: inquiry.usageGuidance && inquiry.usageGuidance.restrictedWaterTypes || [],
          restrictedFunctions: revisitRestrictedFunctions,
          guidanceBasis: revisitGuidanceBasis,
          nextAction: visit.result.nextAction,
          updatedAt: now(), updatedBy: actor.name
        };
        touch(inquiry);
        timeline(inquiry, actor, eventName, "추가 방문이 필요하다고 등록했습니다.");
        notify(state, "CUSTOMER", inquiry.customerId, "추가 방문 필요", "추가 점검 방문이 필요해 일정을 다시 안내드릴 예정입니다.", inquiry.id, visit.id);
        notify(state, "COUNSELOR", inquiry.assignedCounselorId || "STAFF-CONS-01", "추가 방문 일정 필요", inquiry.symptomLabel + " 문의의 추가 방문을 조율해주세요.", inquiry.id, visit.id);
        notify(state, "OPERATOR", "STAFF-OPER-01", "추가 방문 조율 필요", inquiry.id + " 문의가 추가 방문 필요 상태로 전환되었습니다.", inquiry.id, visit.id);
        audit(state, actor, eventName, inquiry.id, "FOLLOW_UP_REQUIRED");
        return visit.id;

      case "FINALIZE_INQUIRY":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["COUNSELOR", "TECHNICIAN"]);
        checkVersion(inquiry, payload);
        if (inquiry.status === "RESOLVED") fail("ALREADY-RESOLVED-01", "이미 최종 완료된 문의입니다.");
        if (inquiry.status !== "COMPLETION_PENDING") fail("STATE-CONFLICT-01", "최종 완료 대기 상태가 아닙니다.");
        if (!inquiry.resolutionFeedback || !inquiry.resolutionFeedback.resolved) fail("FINALIZE-FAILED-01", "고객의 해결됨 피드백이 필요합니다.");
        if (inquiry.path === "COUNSEL" && (actor.role !== "COUNSELOR" || inquiry.assignedCounselorId !== actor.id)) fail("FINALIZE-AUTH-01", "처리를 담당한 상담사만 완료할 수 있습니다.");
        if (inquiry.path === "VISIT" && (actor.role !== "TECHNICIAN" || inquiry.assignedTechnicianId !== actor.id)) fail("FINALIZE-AUTH-01", "처리를 담당한 방문기사만 완료할 수 있습니다.");
        if (inquiry.path === "COUNSEL" && (!inquiry.counselRecord || !String(inquiry.counselRecord.note || "").trim() || !String(inquiry.counselRecord.outcome || "").trim())) fail("FINALIZE-FAILED-01", "상담 결과 필수값을 먼저 저장해주세요.");
        if (inquiry.path === "VISIT") {
          visit = visitForInquiry(state, inquiry, payload);
          if (visit.status !== "COMPLETED" || !visit.result || !String(visit.result.actualCause || "").trim() || !String(visit.result.actions || "").trim() || !String(visit.result.guidanceBasis || visit.result.decisionBasis || "").trim() || !String(visit.result.nextAction || "").trim() || !String(visit.result.signature || "").trim()) fail("FINALIZE-FAILED-01", "방문 결과와 고객 서명을 먼저 저장해주세요.");
        }
        inquiry.status = "RESOLVED";
        inquiry.outcome = inquiry.path === "VISIT" ? "VISIT_RESOLVED" : "COUNSEL_RESOLVED";
        inquiry.customerActionRequired = null;
        inquiry.finalizedAt = now();
        inquiry.finalizedBy = actor.name;
        inquiry.finalizedByType = actor.role === "TECHNICIAN" ? "engineer" : "counselor";
        inquiry.finalizedById = actor.id;
        touch(inquiry);
        timeline(inquiry, actor, eventName, "고객 피드백과 처리 결과를 확인하고 문의를 최종 완료했습니다.");
        notify(state, "CUSTOMER", inquiry.customerId, "문의 처리 완료", "문의가 최종 완료되었습니다.", inquiry.id);
        audit(state, actor, eventName, inquiry.id, "RESOLVED");
        return inquiry.id;

      case "MARK_NOTIFICATION_READ":
        var notification = find(state.notifications, payload.notificationId, "NO-DATA-01", "알림");
        if (!actor || notification.role !== actor.role || notification.recipientId !== actor.id) fail("FINALIZE-AUTH-01", "본인의 알림만 변경할 수 있습니다.");
        notification.read = true;
        return notification.id;

      default:
        fail("EVENT-UNKNOWN-01", "지원하지 않는 화면 이벤트입니다: " + eventName);
    }
  }

  function dispatch(eventName, payload, actor) {
    if (!eventName) fail("EVENT-UNKNOWN-01", "이벤트 이름이 필요합니다.");
    var state = ensureState();
    var key = payload && payload.idempotencyKey;
    if (!key) fail("IDEMPOTENCY-REQUIRED-01", "중복 처리를 막기 위한 idempotency_key가 필요합니다.");
    if (key && state.processedEvents[key]) {
      var processed = state.processedEvents[key];
      if (!actor || !actor.id || !actor.role) fail("AUTH-REQUIRED-01", "로그인 정보가 필요합니다.");
      if (processed.event !== eventName || processed.actorId !== actor.id || processed.actorRole !== actor.role) fail("ACCESS-DENIED-01", "이 멱등 처리 결과에 접근할 권한이 없습니다.");
      return { duplicate: true, code: "DUPLICATE-EVENT-01", result: clone(state.processedEvents[key]), state: clone(state) };
    }
    var working = clone(state);
    var eventPayload = clone(payload || {});
    var eventActor = clone(actor || {});
    activeCorrelationId = eventPayload.correlationId || ("CORR-" + Date.now() + "-" + Math.random().toString(16).slice(2, 8));
    eventPayload.correlationId = activeCorrelationId;
    try {
      assertAllowedAction(working, eventName, eventPayload, eventActor);
      var result = processEvent(working, eventName, eventPayload, eventActor);
      working.meta.revision = Number(working.meta.revision || 0) + 1;
      working.meta.updatedAt = now();
      working.meta.lastCorrelationId = activeCorrelationId;
      if (key) working.processedEvents[key] = { event: eventName, result: result, processedAt: now(), correlationId: activeCorrelationId, actorId: eventActor.id, actorRole: eventActor.role };
      writeRaw(working);
      emit(eventName, working);
      return { duplicate: false, result: result, correlationId: activeCorrelationId, state: clone(working) };
    } finally {
      activeCorrelationId = null;
    }
  }

  function reset() {
    var state = seed();
    writeRaw(state);
    emit("RESET", state);
    return clone(state);
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return function () {};
    listeners.push(listener);
    return function () { listeners = listeners.filter(function (item) { return item !== listener; }); };
  }

  if (window.addEventListener) {
    window.addEventListener("storage", function (event) {
      if (event.key === STORAGE_KEY) emit("STORAGE_SYNC", ensureState());
    });
  }

  window.WaterCareStore = {
    storageKey: STORAGE_KEY,
    getState: getState,
    getAllowedActions: getAllowedActions,
    getInquiryView: getInquiryView,
    dispatch: dispatch,
    reset: reset,
    subscribe: subscribe,
    StoreError: StoreError
  };
}());
