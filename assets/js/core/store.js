(function () {
  "use strict";

  var Config = window.WaterCareConfig || {};
  var ModelPolicy = window.WaterCareModelPolicy;
  var AIRAGSimulator = window.WaterCareAIRAGSimulator;
  var RepositoryFactory = window.WaterCareBrowserRepository;
  var STORAGE_KEY = Config.storageKey || "watercare.prototype.screen-fix-v6";
  var listeners = [];
  var repository = RepositoryFactory && RepositoryFactory.create({
    storageKey: STORAGE_KEY,
    schemaVersion: Config.schemaVersion || "SCREEN-FIX-V6",
    seedRevision: Config.seedRevision || 4,
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
    else if (!state || !state.meta || state.meta.schemaVersion !== (Config.schemaVersion || "SCREEN-FIX-V6") || Number(state.meta.seedRevision) !== Number(Config.seedRevision || 4)) { state = seed(); writeRaw(state); }
    state.processedEvents = state.processedEvents || {};
    state.auditLog = state.auditLog || [];
    state.notifications = state.notifications || [];
    state.questionnaireSessions = state.questionnaireSessions || [];
    state.careHistory = state.careHistory || [];
    state.productSupportRequests = state.productSupportRequests || [];
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
    if (!actor || roles.indexOf(actor.role) < 0) fail("FINALIZE-AUTH-01", "이 작업을 수행할 권한이 없습니다.");
  }

  function inquiryForActor(state, inquiryId, actor, allowedRoles) {
    var inquiry = find(state.inquiries, inquiryId, "NO-DATA-01", "문의");
    if (allowedRoles) requireRole(actor, allowedRoles);
    if (actor && actor.role === "CUSTOMER" && inquiry.customerId !== actor.id) fail("FINALIZE-AUTH-01", "본인의 문의만 처리할 수 있습니다.");
    if (actor && actor.role === "COUNSELOR" && inquiry.assignedCounselorId && inquiry.assignedCounselorId !== actor.id) fail("FINALIZE-AUTH-01", "담당 상담사의 문의가 아닙니다.");
    if (actor && actor.role === "TECHNICIAN" && inquiry.assignedTechnicianId && inquiry.assignedTechnicianId !== actor.id) fail("FINALIZE-AUTH-01", "담당 방문기사의 문의가 아닙니다.");
    return inquiry;
  }

  function checkVersion(inquiry, payload) {
    if (payload && payload.stateVersion != null && Number(payload.stateVersion) !== Number(inquiry.stateVersion)) {
      fail("STATE-CONFLICT-01", "다른 사용자가 문의 상태를 먼저 변경했습니다. 최신 내용을 다시 확인해주세요.");
    }
  }

  function touch(inquiry) {
    inquiry.stateVersion = Number(inquiry.stateVersion || 0) + 1;
    inquiry.updatedAt = now();
  }

  function timeline(inquiry, actor, eventName, label) {
    inquiry.timeline = inquiry.timeline || [];
    inquiry.timeline.push({
      at: now(),
      actor: actor && actor.name ? actor.name : "시스템",
      event: eventName,
      label: label
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
      detail: detail || ""
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
    return { usageStatus: "NORMAL", restrictedWaterTypes: [], restrictedFunctions: [], decisionBasis: "분석 전", nextAction: "증상과 문진을 제출해주세요.", updatedAt: now(), updatedBy: "시스템" };
  }

  function questionnaireForActor(state, id, actor) {
    var session = find(state.questionnaireSessions, id, "NO-DATA-01", "사전 문진");
    requireRole(actor, ["CUSTOMER"]);
    if (session.customerId !== actor.id) fail("FINALIZE-AUTH-01", "본인의 사전 문진만 처리할 수 있습니다.");
    return session;
  }

  function applyAIOutcome(state, inquiry, product, actor) {
    if (!AIRAGSimulator) fail("AI-SIMULATOR-MISSING-01", "AI·RAG 시뮬레이터를 찾을 수 없습니다.");
    var result = AIRAGSimulator.run(state, inquiry, product, { now: now() });
    var scenario = result.scenario;
    inquiry.scenarioId = scenario ? scenario.id : null;
    inquiry.topicCode = scenario ? scenario.topicCode : "unsupported_symptom";
    inquiry.symptomLabel = scenario ? scenario.label : "기타·근거 확인 필요";
    inquiry.riskLevel = scenario ? scenario.riskLevel : "CAUTION";
    inquiry.priority = inquiry.riskLevel === "DANGER" ? "URGENT" : inquiry.riskLevel === "CAUTION" ? "HIGH" : "NORMAL";
    inquiry.requiresConsultation = result.outcomeEvent === "DANGER_DETECTED" || result.outcomeEvent === "NO_EVIDENCE" || Boolean(scenario && scenario.requiresConsultation);
    inquiry.evidenceIds = result.evidenceIds.slice();
    inquiry.usageGuidance = result.usageGuidance;
    inquiry.missingFields = result.missingFields.slice();
    inquiry.aiProcess = { mode: AIRAGSimulator.mode, trace: result.trace, retrieval: result.retrieval };
    inquiry.aiSummaryOriginal = result.aiSummaryOriginal;
    inquiry.aiOutcome = result.outcomeEvent === "ADDITIONAL_INFORMATION_REQUIRED" ? null : result.outcomeEvent;
    inquiry.officialSearchFailed = result.outcomeEvent === "NO_EVIDENCE";

    if (result.outcomeEvent === "ADDITIONAL_INFORMATION_REQUIRED") {
      inquiry.aiState = "CHECKING_MISSING_FIELDS";
      inquiry.status = "QUESTIONNAIRE_IN_PROGRESS";
      inquiry.customerActionRequired = "ADDITIONAL_ANSWERS";
      return result;
    }

    inquiry.aiState = "COMPLETED";
    if (result.outcomeEvent === "SAFE_GUIDANCE_READY") {
      inquiry.status = "AI_GUIDANCE";
      inquiry.customerActionRequired = "ACTION_RESULT";
      timeline(inquiry, { role: "SYSTEM", id: "AI-ORCHESTRATOR", name: "AI 안내 시뮬레이터" }, "SAFE_GUIDANCE_READY", "검증된 공식 근거 범위의 안내가 준비되었습니다.");
      return result;
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
    } else {
      inquiry.customerActionRequired = null;
      timeline(inquiry, { role: "SYSTEM", id: "EVIDENCE-GATE", name: "근거 충분성 규칙" }, "NO_EVIDENCE", "현재 제품·증상 범위의 검증된 공식 근거가 없어 상담으로 전환했습니다.");
      notify(state, "COUNSELOR", inquiry.assignedCounselorId, "공식 근거 부족 문의", inquiry.symptomLabel + " 문의는 임의 안내 없이 상담이 필요합니다.", inquiry.id);
      notify(state, "OPERATOR", "STAFF-OPER-01", "공식 근거 검색 보류", inquiry.id + " 문의가 NO_EVIDENCE 상태로 전환되었습니다.", inquiry.id);
    }
    audit(state, { role: "SYSTEM", id: "AI-ORCHESTRATOR", name: "AI 안내 시뮬레이터" }, result.outcomeEvent, inquiry.id, result.retrieval.mode);
    return result;
  }

  function createQuestionnaire(state, payload, actor) {
    var customer = customerForActor(state, actor);
    var product = find(state.products, payload.productId || customer.productId, "NO-DATA-01", "제품");
    if (product.customerId !== customer.id) fail("FINALIZE-AUTH-01", "본인의 제품만 선택할 수 있습니다.");
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
    if (!support.aiAllowed) fail("MODEL-EXPANSION-01", support.message);
    var session = payload.questionnaireSessionId ? questionnaireForActor(state, payload.questionnaireSessionId, actor) : null;
    var effectiveEntryMode = session ? "CARE_PRECHECK" : (entryMode || "ADHOC_INQUIRY");
    var inquiry = {
      id: nextInquiryId(state), customerId: customer.id, productId: product.id, questionnaireSessionId: session ? session.id : null,
      scenarioId: null, topicCode: null, symptomCodes: session ? session.symptomCodes.slice() : [], symptomLabel: "작성 중",
      description: session ? session.description : "", conditions: session ? session.conditions : "", displayCode: session ? session.displayCode : "", entryMode: effectiveEntryMode,
      status: "DRAFT", riskLevel: "GENERAL", priority: "NORMAL", requiresConsultation: false,
      aiState: "IDLE", aiOutcome: null, failedStage: null, errorCode: null, retryCount: 0, missingFields: [], answers: session ? Object.assign({}, session.answers) : {},
      evidenceIds: [], usageGuidance: normalGuidance(), safeActions: null,
      safetyActionCompleted: null, safetyActionRecordedAt: null, consultationRequestedAt: null,
      actionResult: null, customerActionRequired: null, resolutionFeedback: null,
      assignedCounselorId: null, assignedTechnicianId: null, path: null, counselRecord: null,
      aiSummaryOriginal: null, aiSummaryRevision: null, aiProcess: { mode: "DETERMINISTIC_PROTOTYPE", trace: [], retrieval: null },
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
    return visit;
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
        audit(state, actor, eventName, product.id, validation.status);
        return { productId: product.id, status: validation.status, supportScope: validation.supportScope, aiAllowed: validation.aiAllowed, ragAllowed: validation.searchAllowed, consultationRequired: validation.consultationRequired, message: validation.message, evidenceIds: [] };

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
        if (payload.productCode != null) product.productCode = String(payload.productCode).trim();
        if (payload.manualModel != null) product.manualModel = String(payload.manualModel).trim();
        if (payload.startedAt) product.installedAt = payload.startedAt;
        if (payload.managementType) product.managementType = payload.managementType;
        if (payload.installedArea != null) product.installedArea = String(payload.installedArea).trim();
        if (ModelPolicy) ModelPolicy.applyRegistry(product);
        if (previousProductCode !== product.productCode || previousManualModel !== product.manualModel) {
          product.reanalysisRequired = true;
          (state.inquiries || []).filter(function (item) { return item.productId === product.id && ["RESOLVED", "CANCELLED"].indexOf(item.status) < 0; }).forEach(function (item) {
            item.evidenceIds = [];
            item.aiState = "IDLE";
            item.aiOutcome = null;
            item.reanalysisRequired = true;
            item.officialSearchFailed = false;
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
        questionnaire.symptomCodes = Array.isArray(payload.symptomCodes) ? payload.symptomCodes.slice() : questionnaire.symptomCodes;
        questionnaire.description = payload.description != null ? String(payload.description).trim() : questionnaire.description;
        questionnaire.conditions = payload.conditions != null ? String(payload.conditions).trim() : questionnaire.conditions;
        questionnaire.displayCode = payload.displayCode != null ? String(payload.displayCode).trim() : questionnaire.displayCode;
        questionnaire.answers = Object.assign({}, questionnaire.answers || {}, payload.answers || {});
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
        inquiry.symptomCodes = Array.isArray(payload.symptomCodes) ? payload.symptomCodes.slice() : inquiry.symptomCodes;
        inquiry.description = payload.description != null ? String(payload.description).trim() : inquiry.description;
        inquiry.conditions = payload.conditions != null ? String(payload.conditions).trim() : inquiry.conditions;
        inquiry.displayCode = payload.displayCode != null ? String(payload.displayCode).trim() : inquiry.displayCode;
        inquiry.answers = Object.assign({}, inquiry.answers || {}, payload.answers || {});
        touch(inquiry);
        timeline(inquiry, actor, eventName, "작성 내용을 임시 저장했습니다.");
        audit(state, actor, eventName, inquiry.id, "임시 저장");
        return inquiry.id;

      case "SUBMIT_SYMPTOM":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["CUSTOMER"]);
        checkVersion(inquiry, payload);
        if (["DRAFT", "QUESTIONNAIRE_IN_PROGRESS"].indexOf(inquiry.status) < 0) fail("STATE-CONFLICT-01", "현재 문의 단계에서는 증상을 제출할 수 없습니다.");
        inquiry.symptomCodes = Array.isArray(payload.symptomCodes) ? payload.symptomCodes.slice() : [];
        inquiry.description = String(payload.description || "").trim();
        inquiry.conditions = String(payload.conditions || "").trim();
        inquiry.displayCode = String(payload.displayCode || "").trim();
        inquiry.answers = Object.assign({}, inquiry.answers || {}, payload.answers || {});
        if (!inquiry.symptomCodes.length && !inquiry.description) fail("SAVE-FAILED-01", "대표 증상을 선택하지 않았다면 고객 원문을 입력해주세요.");
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
        inquiry.answers = Object.assign({}, inquiry.answers || {}, payload.answers || {});
        Object.keys(payload.answers || {}).forEach(function (key) {
          if (/발생.*조건/.test(key) && payload.answers[key]) inquiry.conditions = String(payload.answers[key]).trim();
          if (/호스/.test(key) && payload.answers[key]) inquiry.answers.hoseChecked = payload.answers[key];
        });
        inquiry.conditions = payload.conditions || inquiry.conditions;
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
        inquiry.actionResult = payload.actionResult || "RESOLVED";
        inquiry.status = "RESOLVED";
        inquiry.outcome = "SELF_RESOLVED";
        inquiry.customerActionRequired = null;
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
          inquiry.safetyActionCompleted = Boolean(inquiry.safeActions.waterValveClosed && inquiry.safeActions.powerDisconnected && inquiry.safeActions.drinkingStopped);
          inquiry.safetyActionRecordedAt = now();
        }
        if (payload.actionResult) inquiry.actionResult = payload.actionResult;
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
        inquiry.resolutionFeedback = { resolved: Boolean(payload.resolved), comment: String(payload.comment || "").trim(), submittedAt: now() };
        if (payload.resolved) {
          inquiry.customerActionRequired = "STAFF_FINALIZATION";
          timeline(inquiry, actor, eventName, "해결됨 피드백을 제출했습니다. 담당자 최종 확인을 기다립니다.");
          if (inquiry.path === "VISIT") notify(state, "TECHNICIAN", inquiry.assignedTechnicianId, "고객 해결 피드백", "고객이 해결됨을 확인했습니다. 문의를 최종 확인해주세요.", inquiry.id);
          else notify(state, "COUNSELOR", inquiry.assignedCounselorId, "고객 해결 피드백", "고객이 해결됨을 확인했습니다. 문의를 최종 확인해주세요.", inquiry.id);
        } else {
          inquiry.status = "REOPENED";
          inquiry.assignedCounselorId = inquiry.assignedCounselorId || "STAFF-CONS-01";
          inquiry.customerActionRequired = null;
          timeline(inquiry, actor, "CUSTOMER_REPORTED_UNRESOLVED", "미해결 피드백으로 문의를 다시 열었습니다.");
          notify(state, "COUNSELOR", inquiry.assignedCounselorId, "문의 재개", "고객이 미해결을 선택했습니다.", inquiry.id);
        }
        touch(inquiry);
        audit(state, actor, eventName, inquiry.id, payload.resolved ? "해결 피드백" : "미해결 재개");
        return inquiry.id;

      case "CUSTOMER_REPORTED_UNRESOLVED":
        payload.resolved = false;
        return processEvent(state, "SUBMIT_RESOLUTION_FEEDBACK", payload, actor);

      case "REQUEST_VISIT_RESCHEDULE":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["CUSTOMER"]);
        checkVersion(inquiry, payload);
        if (inquiry.status !== "VISIT_SCHEDULED") fail("STATE-CONFLICT-01", "확정된 방문 일정만 변경 요청할 수 있습니다.");
        visit = visitForInquiry(state, inquiry, payload);
        if (visit.status !== "CONFIRMED") fail("STATE-CONFLICT-01", "방문 확정 상태에서만 일정 변경을 요청할 수 있습니다.");
        visit.rescheduleRequest = {
          status: "PENDING",
          reason: String(payload.reason || "고객 일정 변경 요청").trim(),
          preferredAt: payload.preferredAt || null,
          requestedAt: now(),
          requestedBy: actor.id
        };
        visit.stateVersion = Number(visit.stateVersion || 0) + 1;
        touch(inquiry);
        timeline(inquiry, actor, eventName, "방문 일정 변경을 요청했습니다. 기존 확정 일정은 승인 전까지 유지됩니다.");
        notify(state, "COUNSELOR", inquiry.assignedCounselorId || "STAFF-CONS-01", "방문 일정 변경 요청", "고객이 확정 방문 일정 변경을 요청했습니다.", inquiry.id, visit.id);
        notify(state, "OPERATOR", "STAFF-OPER-01", "방문 일정 변경 검토", inquiry.id + " 문의의 확정 일정 변경 요청이 접수되었습니다.", inquiry.id, visit.id);
        audit(state, actor, eventName, inquiry.id, visit.id);
        return visit.id;

      case "START_CONSULTATION":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["COUNSELOR"]);
        checkVersion(inquiry, payload);
        if (["CONSULTATION_REQUIRED", "REOPENED"].indexOf(inquiry.status) < 0) fail("STATE-CONFLICT-01", "상담을 시작할 수 있는 상태가 아닙니다.");
        inquiry.assignedCounselorId = actor.id;
        inquiry.status = "CONSULTATION_IN_PROGRESS";
        inquiry.path = "COUNSEL";
        touch(inquiry);
        timeline(inquiry, actor, eventName, "상담을 시작했습니다.");
        audit(state, actor, eventName, inquiry.id, "상담 시작");
        return inquiry.id;

      case "SAVE_AI_SUMMARY_REVISION":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["COUNSELOR"]);
        checkVersion(inquiry, payload);
        if (!String(payload.text || "").trim()) fail("SAVE-FAILED-01", "상담사 수정 요약을 입력해주세요.");
        inquiry.aiSummaryRevision = {
          text: String(payload.text).trim(),
          editedAt: now(),
          editedBy: actor.name,
          editorId: actor.id
        };
        touch(inquiry);
        timeline(inquiry, actor, eventName, "AI 원본을 유지한 채 상담사 수정 요약을 별도 저장했습니다.");
        audit(state, actor, eventName, inquiry.id, "상담사 수정본 저장");
        return inquiry.id;

      case "CONSULTATION_COMPLETED":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["COUNSELOR"]);
        checkVersion(inquiry, payload);
        if (inquiry.status !== "CONSULTATION_IN_PROGRESS") fail("STATE-CONFLICT-01", "상담 진행 중인 문의만 완료할 수 있습니다.");
        if (!String(payload.note || "").trim()) fail("SAVE-FAILED-01", "상담 기록을 입력해주세요.");
        inquiry.counselRecord = { note: String(payload.note).trim(), outcome: String(payload.outcome || "상담 안내 완료").trim(), completedAt: now(), completedBy: actor.name };
        inquiry.status = "COMPLETION_PENDING";
        inquiry.path = "COUNSEL";
        inquiry.customerActionRequired = "RESOLUTION_FEEDBACK";
        if (payload.usageStatus) {
          inquiry.usageGuidance.usageStatus = payload.usageStatus;
          inquiry.usageGuidance.updatedAt = now();
          inquiry.usageGuidance.updatedBy = actor.name;
        }
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
        if (["VISIT_REVIEW_PENDING", "CONSULTATION_IN_PROGRESS", "REOPENED"].indexOf(inquiry.status) < 0) fail("STATE-CONFLICT-01", "방문을 생성할 수 없는 상태입니다.");
        if (!payload.technicianId) fail("SAVE-FAILED-01", "방문기사를 선택해주세요.");
        visit = {
          id: nextVisitId(state), inquiryId: inquiry.id, technicianId: payload.technicianId,
          status: "ASSIGNING", desiredAt: payload.desiredAt || null, confirmedAt: null,
          notes: String(payload.notes || "").trim(), safetyNotes: String(payload.safetyNotes || "").trim(),
          reconfirmed: false, result: null, stateVersion: 1
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
        if (payload.technicianId) { visit.technicianId = payload.technicianId; inquiry.assignedTechnicianId = payload.technicianId; }
        if (payload.desiredAt) visit.desiredAt = payload.desiredAt;
        if (payload.confirmedAt) visit.confirmedAt = payload.confirmedAt;
        if (payload.notes != null) visit.notes = String(payload.notes).trim();
        if (payload.safetyNotes != null) visit.safetyNotes = String(payload.safetyNotes).trim();
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
        if (payload.technicianId) { visit.technicianId = payload.technicianId; inquiry.assignedTechnicianId = payload.technicianId; }
        visit.confirmedAt = payload.confirmedAt || visit.confirmedAt || payload.desiredAt || visit.desiredAt;
        if (!visit.technicianId || !visit.confirmedAt) fail("SAVE-FAILED-01", "방문기사와 확정일을 입력해주세요.");
        visit.desiredAt = payload.desiredAt || visit.desiredAt || visit.confirmedAt;
        visit.notes = payload.notes != null ? String(payload.notes).trim() : visit.notes;
        visit.safetyNotes = payload.safetyNotes != null ? String(payload.safetyNotes).trim() : visit.safetyNotes;
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

      case "START_VISIT":
        inquiry = inquiryForActor(state, payload.inquiryId, actor, ["TECHNICIAN"]);
        checkVersion(inquiry, payload);
        visit = visitForInquiry(state, inquiry, payload);
        if (visit.technicianId !== actor.id) fail("FINALIZE-AUTH-01", "담당 방문기사만 점검을 시작할 수 있습니다.");
        if (["CONFIRMED", "FOLLOW_UP_REQUIRED"].indexOf(visit.status) < 0) fail("STATE-CONFLICT-01", "확정된 방문만 시작할 수 있습니다.");
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
        ["actualCause", "actions", "decisionBasis", "nextAction"].forEach(function (field) {
          if (!String(payload[field] || "").trim()) fail("SAVE-FAILED-01", "방문 결과 필수 항목을 모두 입력해주세요.");
        });
        visit.result = {
          actualCause: String(payload.actualCause).trim(), actions: String(payload.actions).trim(),
          parts: String(payload.parts || "교체 부품 없음").trim(), usageStatus: payload.usageStatus || "PENDING_CONSULTATION",
          restrictedFunctions: Array.isArray(payload.restrictedFunctions) ? payload.restrictedFunctions.slice() : String(payload.restrictedFunctions || "").split(",").map(function (item) { return item.trim(); }).filter(Boolean),
          decisionBasis: String(payload.decisionBasis).trim(), nextAction: String(payload.nextAction).trim(),
          followUpCounsel: Boolean(payload.followUpCounsel), notes: String(payload.notes || "").trim(), signature: String(payload.signature || "").trim()
        };
        visit.status = "COMPLETED";
        visit.completedAt = now();
        visit.stateVersion = Number(visit.stateVersion || 0) + 1;
        product = find(state.products, inquiry.productId, "NO-DATA-01", "제품");
        product.lastCareAt = visit.completedAt;
        if (/필터|카트리지/.test(visit.result.parts)) product.lastFilterChangedAt = visit.completedAt;
        product.careSchedule = Object.assign({}, product.careSchedule || {}, {
          status: "PLANNING",
          label: "다음 케어 일정 협의 예정",
          sourceType: "team_designed",
          nextCareAt: null,
          lastVisitId: visit.id,
          updatedAt: visit.completedAt,
          note: "공식 관리 주기 확정 전이므로 방문 결과를 반영해 다음 일정을 별도 협의합니다."
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
          usageStatus: visit.result.usageStatus,
          nextAction: visit.result.nextAction,
          completedAt: visit.completedAt
        });
        visit.careApplied = true;
        visit.careUpdatedAt = visit.completedAt;
        inquiry.status = "COMPLETION_PENDING";
        inquiry.path = "VISIT";
        inquiry.customerActionRequired = "RESOLUTION_FEEDBACK";
        inquiry.usageGuidance = {
          usageStatus: visit.result.usageStatus,
          restrictedWaterTypes: inquiry.usageGuidance.restrictedWaterTypes || [],
          restrictedFunctions: visit.result.restrictedFunctions,
          decisionBasis: visit.result.decisionBasis,
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
        visit.status = "FOLLOW_UP_REQUIRED";
        visit.result = Object.assign({}, visit.result || {}, {
          actualCause: String(payload.actualCause || "추가 확인 필요").trim(), actions: String(payload.actions || "현장 1차 점검").trim(),
          parts: String(payload.parts || "").trim(), usageStatus: payload.usageStatus || "PENDING_CONSULTATION",
          restrictedFunctions: payload.restrictedFunctions || [], decisionBasis: String(payload.decisionBasis || "현장 점검 결과").trim(),
          nextAction: String(payload.nextAction || "추가 방문 일정 협의").trim(), followUpCounsel: Boolean(payload.followUpCounsel),
          notes: String(payload.notes || "").trim(), revisitReason: String(payload.revisitReason || payload.notes).trim(), signature: String(payload.signature || "").trim()
        });
        visit.stateVersion = Number(visit.stateVersion || 0) + 1;
        inquiry.status = "REVISIT_REQUIRED";
        inquiry.path = "VISIT";
        inquiry.customerActionRequired = null;
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
        inquiry.status = "RESOLVED";
        inquiry.outcome = inquiry.path === "VISIT" ? "VISIT_RESOLVED" : "COUNSEL_RESOLVED";
        inquiry.customerActionRequired = null;
        inquiry.finalizedAt = now();
        inquiry.finalizedBy = actor.name;
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
    if (key && state.processedEvents[key]) {
      return { duplicate: true, code: "DUPLICATE-EVENT-01", result: clone(state.processedEvents[key]), state: clone(state) };
    }
    var working = clone(state);
    var result = processEvent(working, eventName, clone(payload || {}), clone(actor || {}));
    working.meta.revision = Number(working.meta.revision || 0) + 1;
    working.meta.updatedAt = now();
    if (key) working.processedEvents[key] = { event: eventName, result: result, processedAt: now() };
    writeRaw(working);
    emit(eventName, working);
    return { duplicate: false, result: result, state: clone(working) };
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
    dispatch: dispatch,
    reset: reset,
    subscribe: subscribe,
    StoreError: StoreError
  };
}());
