(function () {
  "use strict";

  var STORAGE_KEY = "watercare-one.prototype.v1";
  var CHANNEL_NAME = "watercare-one-sync-v1";
  var CONFIG = window.WATERCARE_WORKFLOW_CONFIG || {};
  var memoryFallback = null;
  var listeners = [];
  var channel = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function now() {
    return new Date().toISOString();
  }

  function staffName(state, staffId, fallback) {
    var staff = (state.staff || []).find(function (item) { return item.id === staffId; });
    return staff ? staff.name : (fallback || "배정 중");
  }

  function defaultUsageGuidance(inquiry) {
    if (inquiry.risk === "DANGER") {
      return { status: "FULL_STOP", label: "제품 전체 사용 중지", scope: "제품 전체", reason: "누수·전기·화상 위험 신호가 확인되었습니다.", nextAction: "제품을 만지거나 분해하지 말고 상담·방문 안내를 기다려 주세요.", ruleId: "SAFE-LEAK-02", updatedAt: inquiry.updatedAt || now() };
    }
    if (inquiry.status === "ADDITIONAL_QUESTIONS" || !inquiry.evidence || !inquiry.evidence.length) {
      return { status: "PENDING_REVIEW", label: "판단 보류·상담 필요", scope: "확인 중", reason: "필수 답변과 공식 근거 확인이 완료되지 않았습니다.", nextAction: "추가 질문에 답변해 주세요.", ruleId: null, updatedAt: inquiry.updatedAt || now() };
    }
    if (inquiry.symptomTypes && inquiry.symptomTypes.indexOf("TEMPERATURE") >= 0) {
      return { status: "PARTIAL_STOP", label: "일부 출수·기능 사용 중지", scope: "온도 이상이 확인된 출수 기능", reason: "온도 상태를 확인하기 전까지 해당 기능의 사용을 제한합니다.", nextAction: "안내된 외부 상태만 확인하고 이상이 계속되면 상담을 요청해 주세요.", ruleId: "SAFE-HEAT-01", updatedAt: inquiry.updatedAt || now() };
    }
    return { status: "NORMAL_USE", label: "일반 사용 가능", scope: "안내된 확인 범위", reason: "현재 확인된 위험 신호가 없고 시연용 공식 근거가 연결되었습니다.", nextAction: "안내된 범위에서만 상태를 확인한 뒤 결과를 알려주세요.", ruleId: null, updatedAt: inquiry.updatedAt || now() };
  }

  function defaultWorkflow(state, inquiry) {
    var customer = (state.customers || []).find(function (item) { return item.id === inquiry.customerId; });
    var workflow = {
      currentOwnerRole: "SYSTEM", currentOwnerId: null, currentOwnerName: "AI 케어",
      nextActorRole: "CUSTOMER", nextAction: "문의 상태를 확인해 주세요.", customerActionRequired: false,
      routingDecision: "COLLECT_MORE", routingReason: "필수 정보 확인 중",
      verificationStatus: inquiry.evidence && inquiry.evidence.length ? "PASSED" : "PENDING",
      evidenceStatus: inquiry.evidence && inquiry.evidence.length ? "FOUND" : "PENDING",
      updatedAt: inquiry.updatedAt || now()
    };
    if (inquiry.status === "ADDITIONAL_QUESTIONS") {
      workflow.currentOwnerRole = "CUSTOMER"; workflow.currentOwnerId = inquiry.customerId; workflow.currentOwnerName = customer ? customer.name : "고객";
      workflow.nextAction = "추가 질문에 답변해 주세요."; workflow.customerActionRequired = true;
    } else if (inquiry.status === "SELF_ACTION" || inquiry.status === "ACTION_RESULT") {
      workflow.currentOwnerRole = "CUSTOMER"; workflow.currentOwnerId = inquiry.customerId; workflow.currentOwnerName = customer ? customer.name : "고객";
      workflow.routingDecision = "SELF_SERVICE"; workflow.routingReason = "공식 근거와 안전 규칙 검증 통과";
      workflow.nextAction = inquiry.status === "SELF_ACTION" ? "안내된 확인을 수행하고 결과를 알려주세요." : "필요하면 상담 연결을 요청해 주세요."; workflow.customerActionRequired = true;
    } else if (inquiry.status === "WAITING_COUNSEL" || inquiry.status === "IN_COUNSEL") {
      workflow.currentOwnerRole = "COUNSELOR"; workflow.currentOwnerId = inquiry.counselor && inquiry.counselor.id;
      workflow.currentOwnerName = staffName(state, workflow.currentOwnerId, inquiry.status === "IN_COUNSEL" ? "상담사" : "상담사 배정 중");
      workflow.nextActorRole = "COUNSELOR"; workflow.nextAction = inquiry.status === "IN_COUNSEL" ? "상담 결과를 기록하거나 방문점검으로 전환합니다." : "상담사가 기존 답변과 근거를 확인합니다.";
      workflow.routingDecision = "COUNSEL"; workflow.routingReason = inquiry.risk === "DANGER" ? "위험 규칙 우선 적용" : "자가조치 미해결 또는 고객 상담 요청";
      workflow.verificationStatus = inquiry.risk === "DANGER" ? "BLOCKED" : workflow.verificationStatus;
    } else if (inquiry.status === "VISIT_SCHEDULED") {
      workflow.currentOwnerRole = "ENGINEER"; workflow.currentOwnerId = inquiry.visit && inquiry.visit.engineerId;
      workflow.currentOwnerName = staffName(state, workflow.currentOwnerId, "방문기사 배정 중"); workflow.nextActorRole = "ENGINEER";
      workflow.nextAction = "방문 전 인계 내용을 확인하고 현장 작업 결과를 등록합니다."; workflow.routingDecision = "VISIT"; workflow.routingReason = "현장 확인 필요";
    } else if (inquiry.status === "VISIT_COMPLETE" || inquiry.status === "RESOLUTION_PENDING") {
      workflow.currentOwnerRole = "CUSTOMER"; workflow.currentOwnerId = inquiry.customerId; workflow.currentOwnerName = customer ? customer.name : "고객";
      workflow.nextActorRole = "CUSTOMER"; workflow.nextAction = "처리 후 증상 해결 여부를 확인해 주세요."; workflow.customerActionRequired = true;
      workflow.routingDecision = "FOLLOW_UP"; workflow.routingReason = "상담 또는 방문 처리 완료 후 고객 확인 대기";
    } else if (inquiry.status === "COMPLETION_PENDING") {
      var finalizerId = inquiry.visit && inquiry.visit.engineerId ? inquiry.visit.engineerId : (inquiry.counselor && inquiry.counselor.id);
      var finalizerRole = inquiry.visit && inquiry.visit.engineerId ? "ENGINEER" : "COUNSELOR";
      workflow.currentOwnerRole = finalizerRole; workflow.currentOwnerId = finalizerId;
      workflow.currentOwnerName = staffName(state, finalizerId, finalizerRole === "ENGINEER" ? "방문기사 확인 중" : "상담사 확인 중");
      workflow.nextActorRole = finalizerRole; workflow.nextAction = "고객의 해결 확인을 검토하고 최종 처리 완료로 전환합니다.";
      workflow.customerActionRequired = false; workflow.routingDecision = "FINAL_REVIEW"; workflow.routingReason = "고객 해결 확인 후 관계자 최종 완료 대기";
    } else if (inquiry.status === "COMPLETED") {
      workflow.currentOwnerRole = "SYSTEM"; workflow.currentOwnerName = "처리 완료"; workflow.nextActorRole = null;
      workflow.nextAction = "같은 증상이 다시 발생하면 이 문의를 다시 열 수 있습니다."; workflow.routingDecision = "COMPLETED"; workflow.routingReason = "고객 해결 확인";
    }
    return workflow;
  }

  function normalizeEvidenceMetadata(state, inquiry, item) {
    item = item || {};
    var product = (state.products || []).find(function (candidate) { return candidate.id === inquiry.productId; });
    var model = product && (state.productModels || []).find(function (candidate) { return candidate.id === product.modelId; });
    var documents = state.knowledgeDocuments || [];
    var document = documents.find(function (candidate) {
      if (!product || candidate.modelCode !== product.model) return false;
      return (candidate.sections || []).some(function (section) {
        return section.page === item.page || section.title === item.section || (section.ruleIds || []).indexOf(item.page) >= 0;
      });
    });
    if (!document && /^SAFE-|^EVIDENCE-/.test(String(item.page || ""))) {
      document = documents.find(function (candidate) {
        return candidate.modelCode === "COMMON" && (candidate.sections || []).some(function (section) { return (section.ruleIds || []).indexOf(item.page) >= 0; });
      });
    }
    var section = document && (document.sections || []).find(function (candidate) {
      return candidate.page === item.page || candidate.title === item.section || (candidate.ruleIds || []).indexOf(item.page) >= 0;
    });
    return Object.assign({
      documentId: document ? document.id : "WORKFLOW-CONFIG",
      sectionId: section ? section.id : String(item.page || "UNRESOLVED"),
      modelCode: product ? product.model : "COMMON",
      version: document ? document.version : (CONFIG.version || "WORKFLOW-1.0"),
      sourceType: document ? document.sourceType : "DEMO_RULE_CONFIG",
      sourceUrl: model && model.officialProductUrl ? model.officialProductUrl : null,
      registeredAt: document ? document.effectiveAt : (state.meta && state.meta.seededAt || null),
      retrievedAt: item.retrievedAt || inquiry.updatedAt || (state.meta && state.meta.seededAt) || now(),
      approvalStatus: document ? document.approvalStatus : "DEMO_RULE_APPROVED"
    }, item);
  }

  function ensureStateShape(state) {
    state.notifications = Array.isArray(state.notifications) ? state.notifications : clone(window.WATERCARE_SEED.notifications || []);
    state.operationLog = Array.isArray(state.operationLog) ? state.operationLog : clone(window.WATERCARE_SEED.operationLog || []);
    state.meta.productRequestIds = state.meta.productRequestIds || {};
    (state.products || []).forEach(function (product) {
      product.subscriptionId = product.subscriptionId || "SUB-" + String(product.id || "UNKNOWN").replace(/^PROD-/, "");
      product.lastReplacementAt = product.lastReplacementAt || product.lastCareAt || product.startedAt;
    });
    state.questionnaires = Array.isArray(state.questionnaires) ? state.questionnaires : [];
    (state.products || []).forEach(function (product) {
      if (state.questionnaires.some(function (item) { return item.productId === product.id; })) return;
      var owner = (state.customers || []).find(function (item) { return item.id === product.customerId; });
      var legacy = owner && owner.productId === product.id ? (owner.questionnaire || {}) : {};
      state.questionnaires.push({
        id: "QNR-" + product.id,
        customerId: product.customerId,
        productId: product.id,
        status: legacy.status || "NOT_DUE",
        dueAt: legacy.dueAt || product.nextCareAt,
        generatedAt: legacy.status && legacy.status !== "NOT_DUE" ? (legacy.generatedAt || state.meta.seededAt || now()) : null,
        submittedAt: legacy.submittedAt || null,
        version: (CONFIG.questionnaire && CONFIG.questionnaire.version) || "PRE_VISIT_V2",
        answers: clone(legacy.answers || {})
      });
    });
    (state.products || []).forEach(function (product) { ensureQuestionnaireCycle(state, product); });
    (state.customers || []).forEach(function (customer) {
      customer.role = customer.role || "CUSTOMER";
      if (typeof customer.active !== "boolean") customer.active = true;
      var representative = questionnaireForProduct(state, customer.productId);
      if (representative) customer.questionnaire = clone(representative);
    });
    (state.inquiries || []).forEach(function (inquiry) {
      inquiry.structured = inquiry.structured || {};
      inquiry.structured.performedActions = inquiry.structured.performedActions || (inquiry.actionResult ? "자가조치 결과 등록 · " + inquiry.actionResult : "아직 수행한 조치 없음 또는 확인 필요");
      inquiry.pendingFields = Array.isArray(inquiry.pendingFields) ? inquiry.pendingFields : missingQuestionFields(inquiry.structured).map(function (item) { return item.key; });
      inquiry.questionAnswers = Array.isArray(inquiry.questionAnswers) ? inquiry.questionAnswers : [];
      inquiry.evidence = (inquiry.evidence || []).map(function (item) { return normalizeEvidenceMetadata(state, inquiry, item); });
      inquiry.counselor = inquiry.counselor || { id: null, note: "", decision: null };
      if (inquiry.counselor.id && !inquiry.counselor.sessionId) inquiry.counselor.sessionId = "CS-" + inquiry.id + "-SEED";
      if (inquiry.counselor.note && !inquiry.counselor.record) inquiry.counselor.record = { additionalChecks: "기존 고객 답변·제품·관리 이력 확인", guidance: inquiry.counselor.note, result: inquiry.counselor.note, visitRequired: inquiry.counselor.decision === "VISIT", confirmedFields: [], recordedAt: inquiry.counselor.resolvedAt || inquiry.updatedAt };
      if (inquiry.visit) {
        inquiry.visit.customerPreferredAt = inquiry.visit.customerPreferredAt || inquiry.visit.scheduledAt || null;
        inquiry.visit.confirmedAt = inquiry.visit.confirmedAt || inquiry.visit.scheduledAt || null;
        inquiry.visit.scheduleStatus = inquiry.visit.scheduleStatus || (inquiry.visit.confirmedAt ? "CONFIRMED" : (inquiry.visit.engineerId ? "COORDINATING" : "ASSIGNING"));
        inquiry.visit.scheduledAt = inquiry.visit.confirmedAt || null;
      }
      normalizeTimeline(inquiry);
      if (!inquiry.latestResolution && inquiry.followUp && inquiry.followUp.source) {
        inquiry.latestResolution = { source: inquiry.followUp.source, at: inquiry.followUp.confirmedAt || inquiry.updatedAt, actorId: inquiry.followUp.source === "VISIT" && inquiry.visit ? inquiry.visit.engineerId : inquiry.counselor.id };
      } else if (!inquiry.latestResolution && (inquiry.status === "VISIT_COMPLETE" || inquiry.visit && inquiry.visit.status === "COMPLETED")) {
        inquiry.latestResolution = { source: "VISIT", at: inquiry.visit && inquiry.visit.completedAt || inquiry.updatedAt, actorId: inquiry.visit && inquiry.visit.engineerId || null, referenceId: inquiry.visit && inquiry.visit.id || null };
      } else if (!inquiry.latestResolution && inquiry.status === "RESOLUTION_PENDING") {
        inquiry.latestResolution = { source: "COUNSEL", at: inquiry.counselor.resolvedAt || inquiry.updatedAt, actorId: inquiry.counselor.id || null, referenceId: inquiry.counselor.sessionId || null };
      }
      inquiry.workflow = inquiry.workflow || defaultWorkflow(state, inquiry);
      inquiry.usageGuidance = inquiry.usageGuidance || defaultUsageGuidance(inquiry);
      inquiry.structuredSchemaVersion = inquiry.structuredSchemaVersion || ((CONFIG.structuredInquirySchema && CONFIG.structuredInquirySchema.version) || "INQUIRY-STRUCTURED-V1");
      inquiry.generatedBy = inquiry.generatedBy || { mode: "DEMO_SEED", version: CONFIG.version || "WORKFLOW-1.0", generatedAt: inquiry.updatedAt || (state.meta && state.meta.seededAt) || now() };
      inquiry.structuredValidation = validateStructuredInquiry(inquiry);
    });
    return state;
  }

  function seedState() {
    var state = clone(window.WATERCARE_SEED);
    state.meta.revision = 1;
    state.meta.updatedAt = now();
    state.meta.requestIds = {};
    return ensureStateShape(state);
  }

  function normalize(state) {
    if (state && state.meta && state.meta.schemaVersion === 8 && window.WATERCARE_SEED.meta.schemaVersion >= 9) {
      state.knowledgeAnalysisMeta = clone(window.WATERCARE_SEED.knowledgeAnalysisMeta);
      state.knowledgeDocuments = clone(window.WATERCARE_SEED.knowledgeDocuments);
      state.knowledgeKeywordInsights = clone(window.WATERCARE_SEED.knowledgeKeywordInsights);
      state.meta.schemaVersion = 9;
    }
    if (state && state.meta && state.meta.schemaVersion === 9 && window.WATERCARE_SEED.meta.schemaVersion >= 10) {
      state.notifications = clone(window.WATERCARE_SEED.notifications || []);
      state.meta.schemaVersion = 10;
    }
    if (state && state.meta && state.meta.schemaVersion === 10 && window.WATERCARE_SEED.meta.schemaVersion === 11) {
      state.operationLog = clone(window.WATERCARE_SEED.operationLog || []);
      state.meta.productRequestIds = state.meta.productRequestIds || {};
      state.meta.schemaVersion = 11;
    }
    if (!state || !state.meta || state.meta.schemaVersion !== window.WATERCARE_SEED.meta.schemaVersion) {
      return seedState();
    }
    state.meta.revision = Number(state.meta.revision || 1);
    state.meta.requestIds = state.meta.requestIds || {};
    state.auditLog = state.auditLog || [];
    state.operationLog = state.operationLog || [];
    state.knowledgeDocuments = state.knowledgeDocuments || clone(window.WATERCARE_SEED.knowledgeDocuments || []);
    state.knowledgeKeywordInsights = state.knowledgeKeywordInsights || clone(window.WATERCARE_SEED.knowledgeKeywordInsights || []);
    state.knowledgeAnalysisMeta = state.knowledgeAnalysisMeta || clone(window.WATERCARE_SEED.knowledgeAnalysisMeta || {});
    return ensureStateShape(state);
  }

  function storageGet() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch (error) {
      return memoryFallback ? clone(memoryFallback) : null;
    }
  }

  function storageSet(state) {
    memoryFallback = clone(state);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // The in-memory fallback keeps the prototype usable when browser storage is blocked.
    }
  }

  function read() {
    var state = storageGet();
    if (!state) {
      state = seedState();
      storageSet(state);
    }
    return clone(state);
  }

  function emit(reason, state) {
    var snapshot = clone(state);
    listeners.forEach(function (listener) {
      try { listener(snapshot, reason); } catch (error) { /* keep remaining listeners alive */ }
    });
    if (channel) {
      try { channel.postMessage({ type: "STATE_CHANGED", reason: reason, revision: state.meta.revision }); } catch (error) { /* no-op */ }
    }
    try {
      window.dispatchEvent(new CustomEvent("watercare:state", { detail: { reason: reason, revision: state.meta.revision } }));
    } catch (error) { /* CustomEvent may be unavailable in a test context */ }
  }

  function commit(state, reason) {
    state.meta.revision += 1;
    state.meta.updatedAt = now();
    storageSet(state);
    emit(reason || "UPDATE", state);
    return clone(state);
  }

  function transaction(reason, mutator) {
    var state = read();
    var result = mutator(state);
    if (result === false) return clone(state);
    return commit(state, reason);
  }

  function findInquiry(state, inquiryId) {
    var inquiry = state.inquiries.find(function (item) { return item.id === inquiryId; });
    if (!inquiry) throw new Error("문의 정보를 찾을 수 없습니다.");
    return inquiry;
  }

  function findProduct(state, productId) {
    var product = state.products.find(function (item) { return item.id === productId; });
    if (!product) throw new Error("제품 정보를 찾을 수 없습니다.");
    return product;
  }

  function findSmartPreparationProfile(state, productId) {
    var profile = (state.smartPreparationProfiles || []).find(function (item) { return item.productId === productId; });
    if (!profile) throw new Error("스마트 준비 설정을 찾을 수 없습니다.");
    return profile;
  }

  function smartResourceMeta(state, resource) {
    var meta = state.smartPreparationMeta && state.smartPreparationMeta.resources && state.smartPreparationMeta.resources[resource];
    if (!meta) throw new Error("지원하지 않는 준비 기능입니다.");
    return meta;
  }

  function requireSmartResourceSupport(state, productId, resource) {
    var product = findProduct(state, productId);
    var model = state.productModels.find(function (item) { return item.id === product.modelId; });
    var meta = smartResourceMeta(state, resource);
    if (!model || !model.capabilities || !model.capabilities[meta.capability]) {
      throw new Error(meta.label + " 준비를 지원하지 않는 제품입니다.");
    }
    return { product: product, model: model, meta: meta };
  }

  function smartDaysLabel(days) {
    var ordered = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    if (ordered.every(function (day) { return days.indexOf(day) >= 0; })) return "매일";
    if (ordered.slice(0, 5).every(function (day) { return days.indexOf(day) >= 0; }) && days.indexOf("SAT") < 0 && days.indexOf("SUN") < 0) return "평일";
    if (days.length === 2 && days.indexOf("SAT") >= 0 && days.indexOf("SUN") >= 0) return "주말";
    var labels = { MON: "월", TUE: "화", WED: "수", THU: "목", FRI: "금", SAT: "토", SUN: "일" };
    return days.map(function (day) { return labels[day]; }).join("·");
  }

  function timelineStateForType(type) {
    var direct = {
      RECEIVED: "RECEIVED", ADDITIONAL_QUESTIONS: "ADDITIONAL_QUESTIONS", SELF_ACTION: "SELF_ACTION",
      ACTION_RESULT: "ACTION_RESULT", WAITING_COUNSEL: "WAITING_COUNSEL", IN_COUNSEL: "IN_COUNSEL",
      RESOLUTION_PENDING: "RESOLUTION_PENDING", VISIT_SCHEDULED: "VISIT_SCHEDULED", VISIT_COMPLETE: "VISIT_COMPLETE",
      COMPLETION_PENDING: "COMPLETION_PENDING", COMPLETED: "COMPLETED"
    };
    if (direct[type]) return direct[type];
    if (/^VISIT_(ASSIGNING|COORDINATING|CONFIRMED)$/.test(type || "")) return type;
    return null;
  }

  function normalizeTimeline(inquiry) {
    inquiry.timeline = Array.isArray(inquiry.timeline) ? inquiry.timeline : [];
    var previous = null;
    inquiry.timeline.forEach(function (item) {
      var next = item.toStatus || timelineStateForType(item.type) || previous;
      if (typeof item.fromStatus === "undefined") item.fromStatus = previous;
      item.toStatus = next || inquiry.status || null;
      item.reason = item.reason || item.detail || "상태 처리 결과 기록";
      previous = item.toStatus;
    });
  }

  function timeline(inquiry, actor, type, label, detail, at) {
    inquiry.timeline = inquiry.timeline || [];
    var timestamp = at || now();
    var last = inquiry.timeline[inquiry.timeline.length - 1];
    var fromStatus = last && (last.toStatus || timelineStateForType(last.type)) || null;
    var toStatus = timelineStateForType(type) || inquiry.status || fromStatus;
    inquiry.timeline.push({ at: timestamp, actor: actor, type: type, fromStatus: fromStatus, toStatus: toStatus, label: label, detail: detail || "", reason: detail || "상태 처리 결과 기록" });
    inquiry.updatedAt = timestamp;
  }

  function audit(state, actor, role, action, inquiryId, detail) {
    state.auditLog.unshift({
      id: "AUD-" + String(Date.now()) + "-" + String(state.auditLog.length + 1),
      at: now(), actor: actor, role: role, action: action, target: inquiryId, detail: detail
    });
  }

  function operation(state, category, outcome, target, detail, durationMs, extra) {
    state.operationLog = state.operationLog || [];
    state.operationLog.unshift(Object.assign({
      id: "OP-" + String(Date.now()) + "-" + String(state.operationLog.length + 1),
      at: now(), category: category, outcome: outcome, target: target || null,
      detail: String(detail || ""), durationMs: Number(durationMs || 0)
    }, extra || {}));
  }

  function requireStaff(state, staffId, allowedRoles) {
    var staff = (state.staff || []).find(function (item) { return item.id === staffId && item.active; });
    if (!staff || allowedRoles.indexOf(staff.role) < 0) throw new Error("이 작업을 수행할 관계자 권한이 없습니다.");
    return staff;
  }

  function requireCustomerInquiry(inquiry, customerId) {
    if (!customerId || inquiry.customerId !== customerId) throw new Error("본인 문의만 처리할 수 있습니다.");
  }

  function requireCustomerProduct(product, customerId) {
    if (!customerId || product.customerId !== customerId) throw new Error("본인 제품만 등록하거나 수정할 수 있습니다.");
  }

  function addMonths(dateValue, months) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ""));
    if (!match) return null;
    var year = Number(match[1]);
    var monthIndex = Number(match[2]) - 1 + Number(months || 4);
    var day = Number(match[3]);
    var targetYear = year + Math.floor(monthIndex / 12);
    var targetMonth = ((monthIndex % 12) + 12) % 12;
    var lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    return [targetYear, String(targetMonth + 1).padStart(2, "0"), String(Math.min(day, lastDay)).padStart(2, "0")].join("-");
  }

  function dateKeyInSeoul(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    var parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    var keyed = {};
    parts.forEach(function (part) { if (part.type !== "literal") keyed[part.type] = part.value; });
    return keyed.year + "-" + keyed.month + "-" + keyed.day;
  }

  function questionnaireCycleId(productId, dueAt) {
    return "QNR-" + productId + "-" + String(dueAt || "UNSCHEDULED").replace(/\D/g, "");
  }

  function questionnaireForProduct(state, productId) {
    return (state.questionnaires || []).filter(function (item) { return item.productId === productId && item.status !== "SUPERSEDED"; }).sort(function (a, b) {
      var dueOrder = String(b.dueAt || "").localeCompare(String(a.dueAt || ""));
      if (dueOrder) return dueOrder;
      return String(b.generatedAt || b.submittedAt || b.id || "").localeCompare(String(a.generatedAt || a.submittedAt || a.id || ""));
    })[0] || null;
  }

  function ensureQuestionnaireCycle(state, product) {
    if (!product || !product.nextCareAt) return questionnaireForProduct(state, product && product.id);
    var exact = (state.questionnaires || []).find(function (item) { return item.productId === product.id && item.dueAt === product.nextCareAt && item.status !== "SUPERSEDED"; });
    if (exact) return exact;
    var latest = questionnaireForProduct(state, product.id);
    if (latest && latest.status !== "SUBMITTED") latest.status = "SUPERSEDED";
    var questionnaire = {
      id: questionnaireCycleId(product.id, product.nextCareAt), customerId: product.customerId, productId: product.id,
      status: "NOT_DUE", dueAt: product.nextCareAt, generatedAt: null, submittedAt: null, inquiryId: null,
      version: (CONFIG.questionnaire && CONFIG.questionnaire.version) || "PRE_VISIT_V2", answers: {}
    };
    state.questionnaires.push(questionnaire);
    return questionnaire;
  }

  function syncLegacyQuestionnaire(state, questionnaire) {
    var customer = (state.customers || []).find(function (item) { return item.id === questionnaire.customerId; });
    if (customer && customer.productId === questionnaire.productId) customer.questionnaire = clone(questionnaire);
  }

  function validateStructuredInquiry(inquiry) {
    var schema = CONFIG.structuredInquirySchema || { version: "INQUIRY-STRUCTURED-V1", requiredFields: ["started", "targetWater", "condition", "errorCode", "companion", "recentNonUse", "performedActions", "lastCare"] };
    var missing = (schema.requiredFields || []).filter(function (field) {
      return !inquiry.structured || typeof inquiry.structured[field] !== "string" || !inquiry.structured[field].trim();
    }).map(function (field) { return "structured." + field; });
    ["id", "customerId", "productId", "description"].forEach(function (field) {
      if (typeof inquiry[field] !== "string" || !inquiry[field].trim()) missing.push(field);
    });
    if (!Array.isArray(inquiry.symptomTypes) || !inquiry.symptomTypes.length) missing.push("symptomTypes");
    if (["GENERAL", "CAUTION", "DANGER"].indexOf(inquiry.risk) < 0) missing.push("risk");
    if (["NORMAL", "HIGH", "URGENT"].indexOf(inquiry.priority) < 0) missing.push("priority");
    if (!inquiry.usageGuidance || !inquiry.usageGuidance.status || !inquiry.usageGuidance.scope || !inquiry.usageGuidance.reason || !inquiry.usageGuidance.nextAction) missing.push("usageGuidance");
    if (!inquiry.workflow || !inquiry.workflow.routingDecision || !inquiry.workflow.verificationStatus || !inquiry.workflow.evidenceStatus) missing.push("workflow");
    if (!Array.isArray(inquiry.questionAnswers)) missing.push("questionAnswers");
    if (!inquiry.generatedBy || !inquiry.generatedBy.mode || !inquiry.generatedBy.version || !inquiry.generatedBy.generatedAt) missing.push("generatedBy");
    return { valid: missing.length === 0, schemaVersion: schema.version, missingFields: missing };
  }

  function setWorkflow(inquiry, patch) {
    inquiry.workflow = Object.assign({}, inquiry.workflow || {}, patch || {}, { updatedAt: now() });
  }

  function setUsageGuidance(inquiry, patch) {
    inquiry.usageGuidance = Object.assign({}, inquiry.usageGuidance || {}, patch || {}, { updatedAt: now() });
  }

  function notify(state, recipients, payload) {
    recipients = Array.isArray(recipients) ? recipients : [recipients];
    payload = payload || {};
    state.notifications = state.notifications || [];
    recipients.filter(Boolean).forEach(function (recipient, index) {
      var dedupeKey = payload.dedupeKey ? payload.dedupeKey + ":" + recipient.role + ":" + (recipient.id || "ROLE") : null;
      if (dedupeKey && state.notifications.some(function (item) { return item.dedupeKey === dedupeKey; })) return;
      state.notifications.unshift({
        id: "NOT-" + String(Date.now()) + "-" + String(state.notifications.length + index + 1),
        recipientRole: recipient.role,
        recipientId: recipient.id || null,
        eventType: payload.eventType || "WORKFLOW_UPDATED",
        tone: payload.tone || "info",
        title: String(payload.title || "업무 상태가 변경됐습니다"),
        message: String(payload.message || "처리 내용을 확인해 주세요."),
        inquiryId: payload.inquiryId || null,
        view: recipient.view || payload.view || (recipient.role === "CUSTOMER" ? "inquiries" : "queue"),
        createdAt: payload.createdAt || now(),
        readAt: null,
        actor: String(payload.actor || "시스템"),
        dedupeKey: dedupeKey
      });
    });
  }

  function notificationAudienceMatches(notification, role, recipientId) {
    return notification && notification.recipientRole === role && (!notification.recipientId || notification.recipientId === recipientId);
  }

  function markNotificationRead(notificationId, role, recipientId) {
    return transaction("READ_NOTIFICATION", function (state) {
      var notification = (state.notifications || []).find(function (item) { return item.id === notificationId; });
      if (!notification) throw new Error("알림을 찾을 수 없습니다.");
      if (!notificationAudienceMatches(notification, role, recipientId)) throw new Error("이 알림을 확인할 권한이 없습니다.");
      if (notification.readAt) return false;
      notification.readAt = now();
    });
  }

  function markAllNotificationsRead(role, recipientId) {
    return transaction("READ_ALL_NOTIFICATIONS", function (state) {
      var changed = false;
      (state.notifications || []).forEach(function (notification) {
        if (notificationAudienceMatches(notification, role, recipientId) && !notification.readAt) {
          notification.readAt = now();
          changed = true;
        }
      });
      if (!changed) return false;
    });
  }

  function requireStatus(inquiry, allowed, message) {
    if (allowed.indexOf(inquiry.status) === -1) {
      throw new Error(message || "현재 단계에서는 이 작업을 수행할 수 없습니다.");
    }
  }

  function validateSignatureData(signatureData) {
    if (!signatureData || signatureData.format !== "POINTS_V1" || !Array.isArray(signatureData.strokes) || !signatureData.strokes.length) {
      throw new Error("고객 서명을 전자 서명란에 입력해 주세요.");
    }
    var totalPoints = 0;
    var hasMovement = false;
    signatureData.strokes.forEach(function (stroke) {
      if (!Array.isArray(stroke) || stroke.length < 2) throw new Error("서명을 한 번 이상 이어서 작성해 주세요.");
      totalPoints += stroke.length;
      for (var index = 0; index < stroke.length; index += 1) {
        var point = stroke[index];
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
          throw new Error("서명 데이터 형식이 올바르지 않습니다.");
        }
        if (index > 0 && Math.abs(point.x - stroke[index - 1].x) + Math.abs(point.y - stroke[index - 1].y) > 0.01) hasMovement = true;
      }
    });
    if (!hasMovement) throw new Error("서명을 한 번 이상 이어서 작성해 주세요.");
    if (totalPoints > 5000 || signatureData.strokes.length > 80) throw new Error("서명 데이터가 허용 크기를 초과했습니다.");
    return totalPoints;
  }

  function hasDangerSignal(symptoms, description, answers) {
    symptoms = symptoms || [];
    answers = answers || {};
    var text = [description, answers.companion, answers.errorCode].join(" ");
    var safety = CONFIG.safetyRules || {};
    var riskText = text;
    (safety.negativeLeakPatterns || ["누수[^,.;!?\\n]{0,18}(?:없|아니)", "물기(?:가|는)?\\s*(?:없|아니)[^,.;!?\\n]*"]).forEach(function (pattern) {
      riskText = riskText.replace(new RegExp(pattern, "g"), " ");
    });
    var dangerPattern = new RegExp((safety.dangerPatterns || ["누수", "물이\\s*고", "물기", "전원.*(젖|물)", "스파크", "연기", "타는\\s*냄새", "화상"]).join("|"));
    return symptoms.indexOf("LEAK") >= 0 || dangerPattern.test(riskText);
  }

  function holdProductForSafety(state, productId) {
    var product = findProduct(state, productId);
    if (product.status !== "SAFETY_HOLD") product.statusBeforeSafetyHold = product.status || "ACTIVE";
    product.status = "SAFETY_HOLD";
  }

  function releaseProductSafetyHoldIfClear(state, productId) {
    var hasOpenDanger = (state.inquiries || []).some(function (item) {
      return item.productId === productId && item.risk === "DANGER" && item.status !== "COMPLETED";
    });
    if (hasOpenDanger) return;
    var product = findProduct(state, productId);
    if (product.status === "SAFETY_HOLD") {
      product.status = product.statusBeforeSafetyHold || "ACTIVE";
      delete product.statusBeforeSafetyHold;
    }
  }

  function evidenceForInquiry(state, inquiry) {
    var product = findProduct(state, inquiry.productId);
    var modelEvidence = (CONFIG.evidenceCatalog || {})[product.model] || {};
    var knowledgeDocument = (state.knowledgeDocuments || []).find(function (doc) {
      return doc.modelCode === product.model && doc.approvalStatus === "DEMO_APPROVED" && doc.status === "CONNECTED";
    });
    var symptoms = (inquiry.symptomTypes || []).filter(function (code, index, list) { return list.indexOf(code) === index; });
    if (!knowledgeDocument || !symptoms.length || symptoms.some(function (code) { return !modelEvidence[code]; })) return [];
    return symptoms.map(function (symptom) {
      var details = modelEvidence[symptom];
      var section = (knowledgeDocument.sections || []).find(function (item) { return item.page === details.page || item.title === details.section; });
      var model = (state.productModels || []).find(function (item) { return item.id === product.modelId; });
      return {
        documentId: knowledgeDocument.id,
        sectionId: section ? section.id : null,
        document: knowledgeDocument.modelName + " 사용설명서 (시연 메타데이터)",
        modelCode: product.model,
        version: knowledgeDocument.version,
        sourceType: knowledgeDocument.sourceType,
        sourceUrl: model && model.officialProductUrl ? model.officialProductUrl : null,
        registeredAt: knowledgeDocument.effectiveAt,
        retrievedAt: now(),
        page: details.page, section: details.section, confidence: details.confidence
      };
    });
  }

  function actionsForInquiry(inquiry) {
    var actions = [];
    var templates = CONFIG.selfActionTemplates || {};
    if ((inquiry.symptomTypes || []).indexOf("LOW_FLOW") >= 0) actions.push(templates.LOW_FLOW || "제품 뒤쪽 원수 공급 밸브가 완전히 열려 있는지 눈으로 확인해 주세요.");
    if ((inquiry.symptomTypes || []).indexOf("TASTE_ODOR") >= 0) actions.push(templates.TASTE_ODOR || "정수를 충분히 흘려보낸 뒤 물맛과 냄새가 계속되는지 확인해 주세요.");
    if ((inquiry.symptomTypes || []).indexOf("TEMPERATURE") >= 0) actions.push(templates.TEMPERATURE || "제품 주변 통풍 공간을 확인해 주세요.");
    actions.push(templates.SAFETY_FOOTER || "제품을 분해하거나 전기·급수 부품을 직접 만지지 마세요.");
    return actions;
  }

  function inspectionCandidatesForInquiry(state, inquiry) {
    var product = findProduct(state, inquiry.productId);
    var candidates = [];
    if ((inquiry.symptomTypes || []).indexOf("LOW_FLOW") >= 0) candidates.push("원수 공급 상태와 출수 유량을 우선 확인");
    if ((inquiry.symptomTypes || []).indexOf("TASTE_ODOR") >= 0) candidates.push("최근 미사용 조건과 필터·카트리지 상태를 함께 확인");
    if ((inquiry.symptomTypes || []).indexOf("TEMPERATURE") >= 0) candidates.push("설치 공간 통풍과 냉·온수 성능을 순서대로 확인");
    if (Number(product.filterLife) <= 20) candidates.push("필터 잔여율 " + product.filterLife + "% · 교체 주기 도래 여부 우선 확인");
    if (product.lastCareAt) candidates.push("최근 케어 " + product.lastCareAt + " 이후 변경 사항과 작업 결과 비교");
    var latestCare = (product.careHistory || [])[0];
    if (latestCare) candidates.push("최근 이력 ‘" + latestCare.result + "’ 재발·연관 여부 확인");
    if (inquiry.evidence && inquiry.evidence.length) candidates.push("연결 근거 " + inquiry.evidence[0].page + " ‘" + inquiry.evidence[0].section + "’ 범위 확인");
    return candidates.filter(function (item, index, list) { return list.indexOf(item) === index; }).slice(0, 6);
  }

  function customerName(state, customerId) {
    var customer = (state.customers || []).find(function (item) { return item.id === customerId; });
    return customer ? customer.name : "고객";
  }

  var ADDITIONAL_QUESTION_DEFINITIONS = [
    { key: "started", question: "증상은 언제부터 시작되었나요?" },
    { key: "targetWater", question: "어느 출수에서 주로 발생하나요?" },
    { key: "condition", question: "어떤 조건에서 발생하나요?" },
    { key: "errorCode", question: "오류 표시가 있나요?" },
    { key: "companion", question: "누수·이상 소음 등 동반 증상이 있나요?" },
    { key: "recentNonUse", question: "최근 장기간 사용하지 않은 기간이 있나요?" },
    { key: "performedActions", question: "고객이 이미 수행한 조치가 있나요?" }
  ];

  function extractInitialStructured(description, product, danger) {
    var text = String(description || "");
    var startedMatch = text.match(/(오늘(?:\s*(?:아침|오전|오후|저녁))?|어제|그제|\d+\s*일\s*전|일주일\s*(?:전|이상)?|최근부터)/);
    var waters = ["정수", "냉수", "온수", "얼음"].filter(function (label) { return text.indexOf(label) >= 0; });
    var conditionMatch = text.match(/(계속(?:해서)?|지속(?:적으로)?|반복(?:해서|적으로)?|간헐(?:적으로)?|처음\s*출수할\s*때|연속\s*사용\s*후)/);
    var errorValue = /오류[^.!?\n]{0,12}(?:없|안\s*보)/.test(text) ? "표시 없음" : ((text.match(/(?:오류|에러)(?:\s*(?:코드|표시))?\s*([A-Z0-9-]{2,10})/i) || [])[1] || "확인 필요");
    var companionValue = danger ? "누수·전기 위험 신호" : (/이상\s*소음|소리가/.test(text) ? "이상 소음" : (/온도|미지근|뜨겁|차갑/.test(text) ? "온도 이상" : "확인 필요"));
    var nonUseMatch = text.match(/((?:\d+\s*일|일주일|장기간)\s*(?:동안\s*)?(?:사용하지|미사용))/);
    var actionMatch = text.match(/((?:원수\s*)?밸브[^.!?\n]{0,18}(?:확인|열)|(?:충분히|\d+분)\s*출수[^.!?\n]{0,18}(?:확인|해봤|했)|아직\s*(?:아무\s*)?조치[^.!?\n]{0,10}(?:없|안))/);
    return {
      started: startedMatch ? startedMatch[1] : "확인 필요",
      targetWater: waters.length ? waters.join("·") : "확인 필요",
      condition: conditionMatch ? conditionMatch[1] : "확인 필요",
      errorCode: errorValue,
      companion: companionValue,
      recentNonUse: nonUseMatch ? nonUseMatch[1] : "확인 필요",
      performedActions: actionMatch ? actionMatch[1] : "확인 필요",
      lastCare: product.lastCareAt
    };
  }

  function missingQuestionFields(structured) {
    return ADDITIONAL_QUESTION_DEFINITIONS.filter(function (item) {
      return !structured[item.key] || String(structured[item.key]).indexOf("확인 필요") >= 0;
    });
  }

  function createInquiry(payload, actor) {
    if (!payload || !payload.customerId || !payload.productId || !String(payload.description || "").trim()) {
      throw new Error("문의 제품과 증상 내용을 입력해 주세요.");
    }
    actor = actor || {};
    if (actor.role !== "CUSTOMER" || actor.id !== payload.customerId) throw new Error("본인 계정의 문의만 등록할 수 있습니다.");
    var requestId = payload.requestId || "REQ-" + Date.now();
    var requestKey = payload.customerId + ":" + requestId;
    var requestFingerprint = JSON.stringify({ customerId: payload.customerId, productId: payload.productId, symptomTypes: (payload.symptomTypes || []).slice().sort(), description: String(payload.description).trim() });
    var createdId = null;
    transaction("CREATE_INQUIRY", function (state) {
      var priorRequest = state.meta.requestIds[requestKey];
      if (priorRequest) {
        if (priorRequest.fingerprint && priorRequest.fingerprint !== requestFingerprint) throw new Error("같은 요청 식별값에 다른 문의 내용을 재사용할 수 없습니다.");
        createdId = priorRequest.inquiryId || priorRequest;
        return false;
      }
      var datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");
      var suffix = String(state.inquiries.length + 1).padStart(3, "0");
      createdId = "INQ-" + datePart + "-" + suffix;
      while (state.inquiries.some(function (item) { return item.id === createdId; })) {
        suffix = String(Number(suffix) + 1).padStart(3, "0");
        createdId = "INQ-" + datePart + "-" + suffix;
      }
      var symptoms = payload.symptomTypes && payload.symptomTypes.length ? payload.symptomTypes : ["OTHER"];
      var timestamp = now();
      var account = (state.customers || []).find(function (item) { return item.id === payload.customerId && item.role === "CUSTOMER" && item.active; });
      if (!account) throw new Error("활성 상태인 고객 계정을 확인할 수 없습니다.");
      var product = findProduct(state, payload.productId);
      if (product.customerId !== payload.customerId) throw new Error("선택한 제품은 현재 고객에게 등록된 제품이 아닙니다.");
      var danger = hasDangerSignal(symptoms, payload.description, {});
      var initialRisk = danger ? "DANGER" : (symptoms.indexOf("TEMPERATURE") >= 0 ? "CAUTION" : "GENERAL");
      var initialStructured = extractInitialStructured(payload.description, product, danger);
      var missingDefinitions = danger ? [] : missingQuestionFields(initialStructured);
      var inquiry = {
        id: createdId,
        customerId: payload.customerId,
        productId: payload.productId,
        createdAt: timestamp,
        updatedAt: timestamp,
        status: danger ? "WAITING_COUNSEL" : "ADDITIONAL_QUESTIONS",
        risk: initialRisk,
        priority: danger ? "URGENT" : (initialRisk === "CAUTION" ? "HIGH" : "NORMAL"),
        symptomTypes: symptoms,
        title: String(payload.description).trim().slice(0, 34) + (String(payload.description).trim().length > 34 ? "…" : ""),
        description: String(payload.description).trim(),
        structured: initialStructured,
        structuredSchemaVersion: (CONFIG.structuredInquirySchema && CONFIG.structuredInquirySchema.version) || "INQUIRY-STRUCTURED-V1",
        generatedBy: { mode: "DEMO_RULE_ENGINE", version: CONFIG.version || "WORKFLOW-1.0", generatedAt: timestamp },
        aiSummary: danger ? "누수·전기 위험 신호가 감지되어 일반 자가조치를 중단하고 제품 사용 중지 안내와 우선 상담을 연결했습니다." : "고객의 최초 증상을 저장했습니다. 안전한 안내를 위해 발생 조건과 동반 증상을 추가로 확인하고 있습니다.",
        candidates: danger ? ["제품 하부 누수 위치 현장 확인", "전원부 주변 수분 안전 점검"] : ["추가 답변 확인 후 점검 후보 생성 예정"],
        evidence: danger ? [{ document: "위험 신호·안전 규칙 (시연 규칙)", page: "SAFE-LEAK-02", section: "누수·전원부 인접 물기", confidence: 1 }] : [],
        selfActions: danger ? ["제품 사용을 즉시 중지하고 젖은 손으로 전원부를 만지지 마세요.", "제품을 이동하거나 분해하지 말고 상담 안내를 기다려 주세요."] : [], actionResult: null,
        counselor: { id: null, sessionId: null, note: "", decision: null }, visit: null,
        pendingFields: missingDefinitions.map(function (item) { return item.key; }),
        pendingQuestions: missingDefinitions.map(function (item) { return item.question; }),
        questionAnswers: [],
        aiTrace: danger ? ["최초 증상 저장", "위험 규칙 SAFE-LEAK-02 적용", "일반 자가조치 차단", "우선 상담 이관"] : ["최초 증상 저장", "필수 정보 누락 확인", "추가 질문 생성"],
        timeline: [{ at: timestamp, actor: "고객", type: "RECEIVED", fromStatus: null, toStatus: danger ? "WAITING_COUNSEL" : "ADDITIONAL_QUESTIONS", label: "증상 문의를 접수했습니다.", detail: "문의 원문과 대표 증상을 저장", reason: "고객 증상 문의 접수" }]
      };
      inquiry.evidence = inquiry.evidence.map(function (item) { return normalizeEvidenceMetadata(state, inquiry, item); });
      if (danger) inquiry.timeline.push({ at: timestamp, actor: "안전 규칙", type: "SAFETY", fromStatus: "WAITING_COUNSEL", toStatus: "WAITING_COUNSEL", label: "제품 사용 중지와 우선 상담을 안내했습니다.", detail: "SAFE-LEAK-02 · 일반 자가조치 차단", reason: "위험 신호 우선 규칙 적용" });
      if (danger) holdProductForSafety(state, payload.productId);
      inquiry.workflow = defaultWorkflow(state, inquiry);
      inquiry.usageGuidance = defaultUsageGuidance(inquiry);
      inquiry.structuredValidation = validateStructuredInquiry(inquiry);
      if (!inquiry.structuredValidation.valid) throw new Error("문의 전달 필수 구조화 필드가 누락되었습니다.");
      state.inquiries.unshift(inquiry);
      var linkedQuestionnaire = questionnaireForProduct(state, inquiry.productId);
      if (linkedQuestionnaire && (linkedQuestionnaire.customerId !== inquiry.customerId || linkedQuestionnaire.status !== "SUBMITTED" || linkedQuestionnaire.inquiryId)) linkedQuestionnaire = null;
      if (linkedQuestionnaire) linkedQuestionnaire.inquiryId = inquiry.id;
      state.meta.requestIds[requestKey] = { inquiryId: createdId, customerId: payload.customerId, fingerprint: requestFingerprint, createdAt: timestamp };
      notify(state, { role: "CUSTOMER", id: payload.customerId }, {
        eventType: danger ? "SAFETY_ESCALATION" : "ADDITIONAL_QUESTIONS", tone: danger ? "danger" : "info",
        title: danger ? "제품 사용을 중지하고 상담을 기다려 주세요" : "추가 확인 질문이 도착했어요",
        message: danger ? "위험 신호가 감지되어 상담사에게 우선 전달했습니다." : "정확한 안내를 위해 필요한 질문에 답변해 주세요.",
        inquiryId: createdId, view: "inquiries", actor: "AI 케어", dedupeKey: "CREATE:" + createdId
      });
      if (danger) {
        var firstCounselor = (state.staff || []).find(function (item) { return item.role === "COUNSELOR" && item.active; });
        setWorkflow(inquiry, { currentOwnerId: firstCounselor && firstCounselor.id, currentOwnerName: firstCounselor ? firstCounselor.name + " 상담 큐" : "상담사 배정 중" });
        notify(state, { role: "COUNSELOR", id: firstCounselor && firstCounselor.id }, {
          eventType: "URGENT_COUNSEL", tone: "danger", title: "위험 문의 우선 확인",
          message: customerName(state, payload.customerId) + " 고객의 누수·전기 위험 신호가 감지되었습니다.",
          inquiryId: createdId, view: "queue", actor: "안전 규칙", dedupeKey: "DANGER:" + createdId
        });
      }
      audit(state, customerName(state, payload.customerId), "고객", "신규 문의 접수", createdId, danger ? "위험 신호로 우선 상담 이관" : "추가 질문 단계 생성");
      operation(state, "USER_ACTION", "SUCCESS", createdId, "고객 문의 접수 · 원문은 문의 데이터에만 보존", 0, { requestId: requestId, actorRole: "CUSTOMER" });
      operation(state, "AI_CALL", danger ? "BLOCKED_BY_SAFETY" : "SUCCESS", createdId, danger ? "안전 규칙 우선 적용" : "추가 질문 생성", danger ? 12 : 420, { ruleVersion: CONFIG.version || "WORKFLOW-1.0" });
    });
    return createdId;
  }

  function answerAdditionalQuestions(inquiryId, answers, actorName, actorCustomerId) {
    answers = answers || {};
    return transaction("ANSWER_QUESTIONS", function (state) {
      var inquiry = findInquiry(state, inquiryId);
      requireCustomerInquiry(inquiry, actorCustomerId);
      requireStatus(inquiry, ["ADDITIONAL_QUESTIONS"], "추가 질문 단계의 문의만 답변할 수 있습니다.");
      var requiredFields = inquiry.pendingFields && inquiry.pendingFields.length ? inquiry.pendingFields : missingQuestionFields(inquiry.structured).map(function (item) { return item.key; });
      requiredFields.forEach(function (field) { if (!String(answers[field] || "").trim()) throw new Error("추가 질문의 모든 필수 항목에 답변해 주세요."); });
      inquiry.structured.started = answers.started || inquiry.structured.started;
      inquiry.structured.targetWater = answers.targetWater || inquiry.structured.targetWater;
      inquiry.structured.condition = answers.condition || inquiry.structured.condition;
      inquiry.structured.errorCode = answers.errorCode || inquiry.structured.errorCode;
      inquiry.structured.companion = answers.companion || inquiry.structured.companion;
      inquiry.structured.recentNonUse = answers.recentNonUse || inquiry.structured.recentNonUse;
      inquiry.structured.performedActions = answers.performedActions || inquiry.structured.performedActions;
      inquiry.questionAnswers = inquiry.questionAnswers || [];
      inquiry.questionAnswers.push({ at: now(), actor: actorName || customerName(state, inquiry.customerId), answers: clone(answers) });
      inquiry.pendingQuestions = [];
      inquiry.pendingFields = [];
      timeline(inquiry, "고객 · " + (actorName || customerName(state, inquiry.customerId)), "ANSWERS_SAVED", "추가 답변을 제출했습니다.", "원문 답변과 구조화 결과를 같은 문의에 저장");
      var danger = hasDangerSignal(inquiry.symptomTypes, inquiry.description, answers);
      if (!danger) {
        var cautionSignal = (inquiry.symptomTypes || []).indexOf("TEMPERATURE") >= 0 || /온도\s*이상|이상\s*소음|계속|지속|반복|악화/.test([inquiry.structured.condition, inquiry.structured.companion].join(" "));
        inquiry.risk = cautionSignal ? "CAUTION" : "GENERAL";
        inquiry.priority = cautionSignal ? "HIGH" : "NORMAL";
        inquiry.aiTrace.push("구조화 증상 기반 위험도 " + inquiry.risk + "·우선순위 " + inquiry.priority + " 재평가");
      }
      if (danger) {
        inquiry.risk = "DANGER";
        inquiry.priority = "URGENT";
        inquiry.status = "WAITING_COUNSEL";
        inquiry.aiSummary = "추가 답변에서 누수·전기 위험 신호가 확인되어 일반 자가조치를 중단하고 우선 상담으로 전환했습니다.";
        inquiry.evidence = [{ document: "위험 신호·안전 규칙 (시연 규칙)", page: "SAFE-LEAK-02", section: "누수·전원부 인접 물기", confidence: 1 }].map(function (item) { return normalizeEvidenceMetadata(state, inquiry, item); });
        inquiry.selfActions = ["제품 사용을 즉시 중지하고 젖은 손으로 전원부를 만지지 마세요.", "제품을 이동하거나 분해하지 말고 상담 안내를 기다려 주세요."];
        inquiry.candidates = ["누수 위치 현장 확인", "전원부 주변 수분 안전 점검"];
        inquiry.aiTrace.push("추가 답변 구조화", "위험 규칙 SAFE-LEAK-02 우선 적용", "자가조치 차단", "상담 이관");
        holdProductForSafety(state, inquiry.productId);
        setUsageGuidance(inquiry, { status: "FULL_STOP", label: "제품 전체 사용 중지", scope: "제품 전체", reason: "추가 답변에서 누수·전기 위험 신호가 확인되었습니다.", nextAction: "제품을 만지지 말고 상담사의 안내를 기다려 주세요.", ruleId: "SAFE-LEAK-02" });
        setWorkflow(inquiry, { currentOwnerRole: "COUNSELOR", currentOwnerId: null, currentOwnerName: "상담사 배정 중", nextActorRole: "COUNSELOR", nextAction: "상담사가 안전 안내 이행 여부와 우선 방문 필요성을 확인합니다.", customerActionRequired: false, routingDecision: "COUNSEL", routingReason: "위험 규칙 우선 적용", verificationStatus: "BLOCKED", evidenceStatus: "FOUND" });
        timeline(inquiry, "안전 규칙", "WAITING_COUNSEL", "위험 신호를 확인해 우선 상담으로 전환했습니다.", "SAFE-LEAK-02 · 제품 전체 사용 중지");
        var counselor = (state.staff || []).find(function (item) { return item.role === "COUNSELOR" && item.active; });
        setWorkflow(inquiry, { currentOwnerId: counselor && counselor.id, currentOwnerName: counselor ? counselor.name + " 상담 큐" : "상담사 배정 중" });
        notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "inquiries" }, { eventType: "SAFETY_ESCALATION", tone: "danger", title: "위험 신호가 확인됐습니다", message: "제품 사용 중지 안내 후 우선 상담으로 연결했습니다.", inquiryId: inquiry.id, actor: "안전 규칙", dedupeKey: "ANSWER-DANGER-CUSTOMER:" + inquiry.id });
        notify(state, { role: "COUNSELOR", id: counselor && counselor.id, view: "queue" }, { eventType: "URGENT_COUNSEL", tone: "danger", title: "위험 문의 우선 확인", message: customerName(state, inquiry.customerId) + " 고객의 추가 답변에서 위험 신호가 확인되었습니다.", inquiryId: inquiry.id, actor: "안전 규칙", dedupeKey: "ANSWER-DANGER-COUNSELOR:" + inquiry.id });
      } else {
        inquiry.evidence = evidenceForInquiry(state, inquiry);
        operation(state, "EVIDENCE_SEARCH", inquiry.evidence.length ? "SUCCESS" : "NOT_FOUND", inquiry.id, inquiry.evidence.length ? "승인된 시연 메타데이터 " + inquiry.evidence.length + "건 연결" : "모델·증상에 맞는 승인 근거 없음", inquiry.evidence.length ? 84 : 61, { ruleVersion: CONFIG.version || "WORKFLOW-1.0" });
        if (!inquiry.evidence.length) {
          inquiry.status = "WAITING_COUNSEL";
          inquiry.aiSummary = "추가 답변은 구조화했지만 연결 가능한 공식 근거를 찾지 못해 자동 안내를 중단하고 상담으로 전환했습니다.";
          inquiry.selfActions = [];
          inquiry.candidates = ["상담사가 제품 모델과 증상 범위를 다시 확인"];
          inquiry.aiTrace.push("추가 답변 구조화", "공식 근거 검색 실패", "자동 안내 차단", "상담 이관");
          setUsageGuidance(inquiry, { status: "PENDING_REVIEW", label: "판단 보류·상담 필요", scope: "확인 중", reason: "연결 가능한 공식 근거를 찾지 못했습니다.", nextAction: "임의로 조치하지 말고 상담사의 확인을 기다려 주세요.", ruleId: null });
          setWorkflow(inquiry, { currentOwnerRole: "COUNSELOR", currentOwnerId: null, currentOwnerName: "상담사 배정 중", nextActorRole: "COUNSELOR", nextAction: "상담사가 제품·증상과 공식 근거를 다시 확인합니다.", customerActionRequired: false, routingDecision: "COUNSEL", routingReason: "공식 근거 부족", verificationStatus: "BLOCKED", evidenceStatus: "NOT_FOUND" });
          timeline(inquiry, "결과 검증", "WAITING_COUNSEL", "공식 근거 부족으로 자동 안내를 차단했습니다.", "추측 답변 없이 상담 큐로 전달");
          var fallbackCounselor = (state.staff || []).find(function (item) { return item.role === "COUNSELOR" && item.active; });
          setWorkflow(inquiry, { currentOwnerId: fallbackCounselor && fallbackCounselor.id, currentOwnerName: fallbackCounselor ? fallbackCounselor.name + " 상담 큐" : "상담사 배정 중" });
          notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "inquiries" }, { eventType: "EVIDENCE_NOT_FOUND", tone: "warning", title: "공식 근거 확인이 필요합니다", message: "자동 안내를 중단하고 상담사에게 기존 답변을 전달했습니다.", inquiryId: inquiry.id, actor: "결과 검증", dedupeKey: "NO-EVIDENCE-CUSTOMER:" + inquiry.id });
          notify(state, { role: "COUNSELOR", id: fallbackCounselor && fallbackCounselor.id, view: "queue" }, { eventType: "EVIDENCE_REVIEW", tone: "warning", title: "공식 근거 검토가 필요합니다", message: customerName(state, inquiry.customerId) + " 고객의 답변과 모델 정보를 확인해 주세요.", inquiryId: inquiry.id, actor: "결과 검증", dedupeKey: "NO-EVIDENCE-COUNSELOR:" + inquiry.id });
        } else {
          inquiry.status = "SELF_ACTION";
          inquiry.aiSummary = "추가 답변을 구조화하고 제품 모델에 연결된 시연용 공식 문서 구간과 안전 규칙을 확인했습니다. 안내된 범위에서만 상태를 확인해 주세요.";
          inquiry.selfActions = actionsForInquiry(inquiry);
          inquiry.candidates = inspectionCandidatesForInquiry(state, inquiry);
          inquiry.aiTrace.push("추가 답변 구조화", "제품별 근거 연결", "안전 규칙 검사 통과", "고객 자동 안내");
          inquiry.usageGuidance = defaultUsageGuidance(inquiry);
          setWorkflow(inquiry, { currentOwnerRole: "CUSTOMER", currentOwnerId: inquiry.customerId, currentOwnerName: customerName(state, inquiry.customerId), nextActorRole: "CUSTOMER", nextAction: "안내된 확인을 수행하고 결과를 알려주세요.", customerActionRequired: true, routingDecision: "SELF_SERVICE", routingReason: "시연용 공식 근거 연결 및 안전 규칙 검증 통과", verificationStatus: "PASSED", evidenceStatus: "FOUND" });
          timeline(inquiry, "결과 검증", "SELF_ACTION", "공식 근거와 안전 규칙 검증을 통과했습니다.", "고객 자동 안내 제공");
          notify(state, { role: "CUSTOMER", id: inquiry.customerId }, { eventType: "SELF_ACTION_READY", tone: "success", title: "안전한 확인 방법이 준비됐어요", message: "제품 모델에 맞는 확인 방법을 보고 결과를 알려주세요.", inquiryId: inquiry.id, view: "inquiries", actor: "AI 케어", dedupeKey: "SELF-ACTION:" + inquiry.id });
        }
      }
      inquiry.structuredValidation = validateStructuredInquiry(inquiry);
      if (!inquiry.structuredValidation.valid) {
        var schemaFailureAt = now();
        var schemaFailureReason = "누락 필드: " + inquiry.structuredValidation.missingFields.join(",");
        var schemaFallbackCounselor = (state.staff || []).find(function (item) { return item.role === "COUNSELOR" && item.active; });
        inquiry.processingFailure = {
          id: "FAIL-SCHEMA-" + String(Date.now()), type: "SCHEMA_INVALID", reason: schemaFailureReason,
          failedAt: schemaFailureAt, status: "FAILED", retryCount: 0, recoveredAt: null
        };
        inquiry.status = "WAITING_COUNSEL";
        inquiry.selfActions = [];
        setWorkflow(inquiry, {
          currentOwnerRole: "COUNSELOR",
          currentOwnerId: schemaFallbackCounselor && schemaFallbackCounselor.id,
          currentOwnerName: schemaFallbackCounselor ? schemaFallbackCounselor.name + " 상담사" : "상담사 배정 중",
          nextActorRole: "COUNSELOR",
          nextAction: "구조화되지 않은 원문과 기존 답변을 직접 확인합니다.",
          customerActionRequired: false,
          routingDecision: "COUNSEL",
          routingReason: "구조화 결과 검증 실패",
          verificationStatus: "BLOCKED"
        });
        timeline(inquiry, "처리 모니터", "PROCESSING_FAILED", "구조화 결과 검증 오류를 기록하고 상담사에게 전달했습니다.", schemaFailureReason, schemaFailureAt);
        operation(state, "ERROR", "SCHEMA_INVALID", inquiry.id, schemaFailureReason, 0, { schemaVersion: inquiry.structuredValidation.schemaVersion, retryable: true, nextActions: ["RETRY", "COUNSEL"] });
        notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "inquiries" }, { eventType: "PROCESSING_FAILED", tone: "warning", title: "자동 분석 대신 상담사가 확인합니다", message: "입력한 내용은 그대로 보존되어 상담사에게 전달되었습니다.", inquiryId: inquiry.id, actor: "처리 모니터", dedupeKey: inquiry.processingFailure.id + ":CUSTOMER" });
        notify(state, { role: "COUNSELOR", id: schemaFallbackCounselor && schemaFallbackCounselor.id, view: "queue" }, { eventType: "SCHEMA_REVIEW_REQUIRED", tone: "warning", title: "구조화 결과 직접 확인이 필요합니다", message: customerName(state, inquiry.customerId) + " 고객의 원문과 답변을 확인해 주세요.", inquiryId: inquiry.id, actor: "처리 모니터", dedupeKey: inquiry.processingFailure.id + ":COUNSELOR" });
        audit(state, "처리 모니터", "시스템", "구조화 검증 실패", inquiry.id, schemaFailureReason + " · 상담 전환");
        return;
      }
      operation(state, "AI_CALL", danger ? "BLOCKED_BY_SAFETY" : "SUCCESS", inquiry.id, danger ? "위험 규칙 적용 및 자동 안내 차단" : "답변 구조화·라우팅 완료", danger ? 18 : 530, { schemaVersion: inquiry.structuredValidation.schemaVersion, ruleVersion: CONFIG.version || "WORKFLOW-1.0" });
      audit(state, actorName || customerName(state, inquiry.customerId), "고객", "추가 문진 제출", inquiry.id, danger ? "위험 신호로 우선 상담 전환" : (inquiry.evidence.length ? "공식 근거 기반 자동 안내" : "근거 부족 상담 이관"));
    });
  }

  function recordProcessingFailure(inquiryId, options, actorCustomerId) {
    options = options || {};
    var failureType = options.type || "AI_ERROR";
    if (["AI_TIMEOUT", "AI_ERROR", "SEARCH_ERROR", "SCHEMA_INVALID"].indexOf(failureType) < 0) throw new Error("지원하지 않는 처리 오류 유형입니다.");
    return transaction("RECORD_PROCESSING_FAILURE", function (state) {
      var inquiry = findInquiry(state, inquiryId);
      requireCustomerInquiry(inquiry, actorCustomerId);
      requireStatus(inquiry, ["ADDITIONAL_QUESTIONS", "SELF_ACTION", "WAITING_COUNSEL"], "현재 단계에서는 처리 오류를 등록할 수 없습니다.");
      var failedAt = now();
      inquiry.processingFailure = {
        id: "FAIL-" + String(Date.now()), type: failureType, reason: String(options.reason || "시연 AI·검색 처리 중 응답 오류"),
        failedAt: failedAt, status: "FAILED", retryCount: inquiry.processingFailure && inquiry.processingFailure.retryCount || 0, recoveredAt: null
      };
      setWorkflow(inquiry, { currentOwnerRole: "CUSTOMER", currentOwnerId: inquiry.customerId, currentOwnerName: customerName(state, inquiry.customerId), nextActorRole: "CUSTOMER", nextAction: "처리를 다시 시도하거나 상담사에게 기존 입력을 전달하세요.", customerActionRequired: true, routingDecision: "RETRY_OR_COUNSEL", routingReason: failureType + " 기술 오류", verificationStatus: "BLOCKED" });
      timeline(inquiry, "처리 모니터", "PROCESSING_FAILED", "AI·검색 처리 오류를 기록했습니다.", failureType + " · " + inquiry.processingFailure.reason, failedAt);
      operation(state, "ERROR", failureType, inquiry.id, inquiry.processingFailure.reason, Number(options.durationMs || 10000), { actorRole: "SYSTEM", retryable: true, nextActions: ["RETRY", "COUNSEL"] });
      notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "inquiries" }, { eventType: "PROCESSING_FAILED", tone: "warning", title: "분석을 완료하지 못했어요", message: "다시 시도하거나 상담사에게 지금까지 입력한 내용을 전달할 수 있습니다.", inquiryId: inquiry.id, actor: "처리 모니터", dedupeKey: inquiry.processingFailure.id });
      audit(state, "처리 모니터", "시스템", "AI·검색 처리 오류", inquiry.id, failureType + " · 재시도 또는 상담 전환 제공");
    });
  }

  function retryProcessing(inquiryId, actorCustomerId) {
    return transaction("RETRY_PROCESSING", function (state) {
      var inquiry = findInquiry(state, inquiryId);
      requireCustomerInquiry(inquiry, actorCustomerId);
      if (!inquiry.processingFailure || inquiry.processingFailure.status !== "FAILED") throw new Error("현재 다시 시도할 처리 오류가 없습니다.");
      inquiry.processingFailure.status = "RECOVERED";
      inquiry.processingFailure.retryCount = Number(inquiry.processingFailure.retryCount || 0) + 1;
      inquiry.processingFailure.recoveredAt = now();
      setWorkflow(inquiry, { currentOwnerRole: inquiry.status === "WAITING_COUNSEL" ? "COUNSELOR" : "CUSTOMER", currentOwnerId: inquiry.status === "WAITING_COUNSEL" ? null : inquiry.customerId, currentOwnerName: inquiry.status === "WAITING_COUNSEL" ? "상담사 배정 중" : customerName(state, inquiry.customerId), nextActorRole: inquiry.status === "WAITING_COUNSEL" ? "COUNSELOR" : "CUSTOMER", nextAction: inquiry.status === "ADDITIONAL_QUESTIONS" ? "누락된 질문에 답변해 주세요." : "현재 문의 단계를 계속 진행해 주세요.", customerActionRequired: inquiry.status !== "WAITING_COUNSEL", routingDecision: inquiry.status === "WAITING_COUNSEL" ? "COUNSEL" : "RETRY_SUCCEEDED", routingReason: "기술 오류 재시도 성공", verificationStatus: "PENDING" });
      timeline(inquiry, "처리 모니터", "PROCESSING_RETRIED", "AI·검색 처리를 다시 시작했습니다.", "시연 재시도 성공 · 기존 입력 보존");
      operation(state, "AI_CALL", "RETRY_SUCCESS", inquiry.id, "기술 오류 재시도 후 입력 복구", 320, { actorRole: "CUSTOMER", actorId: inquiry.customerId, retryCount: inquiry.processingFailure.retryCount });
      notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "inquiries" }, { eventType: "PROCESSING_RETRY_SUCCESS", tone: "success", title: "다시 시도할 준비가 됐어요", message: "기존 입력은 유지되었습니다. 현재 단계부터 계속해 주세요.", inquiryId: inquiry.id, actor: "처리 모니터", dedupeKey: "RETRY:" + inquiry.processingFailure.id + ":" + inquiry.processingFailure.retryCount });
    });
  }

  function setActionResult(inquiryId, result, actorName, actorCustomerId) {
    var allowedResults = ["RESOLVED", "IMPROVED", "SAME", "WORSE", "NOT_PERFORMED"];
    if (allowedResults.indexOf(result) < 0) throw new Error("올바른 조치 결과를 선택해 주세요.");
    return transaction("ACTION_RESULT", function (state) {
      var inquiry = findInquiry(state, inquiryId);
      requireCustomerInquiry(inquiry, actorCustomerId);
      requireStatus(inquiry, ["SELF_ACTION", "ACTION_RESULT"], "현재 문의에서는 조치 결과를 변경할 수 없습니다.");
      inquiry.actionResult = result;
      var labels = { RESOLVED: "해결", IMPROVED: "일부 개선", SAME: "동일", WORSE: "악화", NOT_PERFORMED: "미수행" };
      if (result === "RESOLVED") {
        var finalCounselor = (state.staff || []).find(function (item) { return item.role === "COUNSELOR" && item.active; });
        inquiry.status = "COMPLETION_PENDING";
        inquiry.followUp = { resolved: true, confirmedAt: now(), confirmedBy: inquiry.customerId, source: "SELF_ACTION" };
        inquiry.completion = { status: "PENDING", requestedAt: now(), primaryRole: "COUNSELOR", primaryId: finalCounselor && finalCounselor.id, finalizedAt: null, finalizedBy: null, finalizedByRole: null };
        setWorkflow(inquiry, { currentOwnerRole: "COUNSELOR", currentOwnerId: finalCounselor && finalCounselor.id, currentOwnerName: finalCounselor ? finalCounselor.name : "상담사 확인 중", nextActorRole: "COUNSELOR", nextAction: "고객의 해결 확인을 검토하고 최종 완료로 전환합니다.", customerActionRequired: false, routingDecision: "FINAL_REVIEW", routingReason: "자가조치 해결 확인 후 관계자 완료 대기", verificationStatus: "PASSED", evidenceStatus: inquiry.evidence && inquiry.evidence.length ? "FOUND" : "PENDING" });
        setUsageGuidance(inquiry, { status: "PENDING_REVIEW", label: "최종 완료 확인 중", scope: "제품 전체", reason: "고객의 해결 확인이 접수되어 담당자가 기록을 최종 확인하고 있습니다.", nextAction: "담당자의 완료 처리를 기다려 주세요.", ruleId: null });
        notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "inquiries" }, { eventType: "COMPLETION_PENDING", tone: "success", title: "해결 확인이 접수됐어요", message: "담당자가 기록을 확인한 뒤 최종 완료 처리합니다.", inquiryId: inquiry.id, actor: "AI 케어", dedupeKey: "SELF-PENDING:" + inquiry.id });
        notify(state, { role: "COUNSELOR", id: finalCounselor && finalCounselor.id, view: "queue" }, { eventType: "FINALIZATION_REQUIRED", tone: "warning", title: "고객 해결 확인 · 완료 처리 필요", message: customerName(state, inquiry.customerId) + " 고객의 자가조치 해결 기록을 최종 확인해 주세요.", inquiryId: inquiry.id, actor: actorName || customerName(state, inquiry.customerId), dedupeKey: "SELF-FINALIZE:" + inquiry.id });
      } else if (result === "IMPROVED") {
        inquiry.status = "ACTION_RESULT";
        setWorkflow(inquiry, { currentOwnerRole: "CUSTOMER", currentOwnerId: inquiry.customerId, currentOwnerName: customerName(state, inquiry.customerId), nextActorRole: "CUSTOMER", nextAction: "개선 상태를 지켜보거나 상담 연결을 요청해 주세요.", customerActionRequired: true, routingDecision: "FOLLOW_UP", routingReason: "일부 개선 후 고객 선택 대기", verificationStatus: "PASSED", evidenceStatus: inquiry.evidence && inquiry.evidence.length ? "FOUND" : "PENDING" });
        notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "inquiries" }, { eventType: "ACTION_FOLLOW_UP", tone: "info", title: "일부 개선 상태를 저장했어요", message: "계속 불편하면 같은 문의에서 상담을 연결할 수 있습니다.", inquiryId: inquiry.id, actor: "AI 케어", dedupeKey: "IMPROVED:" + inquiry.id });
      } else {
        inquiry.status = "WAITING_COUNSEL";
        if (result === "WORSE") inquiry.priority = "HIGH";
        var counselor = (state.staff || []).find(function (item) { return item.role === "COUNSELOR" && item.active; });
        setWorkflow(inquiry, { currentOwnerRole: "COUNSELOR", currentOwnerId: counselor && counselor.id, currentOwnerName: counselor ? counselor.name : "상담사 배정 중", nextActorRole: "COUNSELOR", nextAction: "상담사가 기존 답변·자가조치 결과와 근거를 확인합니다.", customerActionRequired: false, routingDecision: "COUNSEL", routingReason: "자가조치 " + labels[result] + " 결과로 자동 이관", verificationStatus: inquiry.risk === "DANGER" ? "BLOCKED" : "PASSED", evidenceStatus: inquiry.evidence && inquiry.evidence.length ? "FOUND" : "PENDING" });
        notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "inquiries" }, { eventType: "COUNSEL_REQUESTED", tone: "info", title: "상담사에게 바로 연결했어요", message: "자가조치 결과와 기존 답변을 다시 입력하지 않아도 됩니다.", inquiryId: inquiry.id, actor: "AI 케어", dedupeKey: "ACTION-COUNSEL-CUSTOMER:" + inquiry.id });
        notify(state, { role: "COUNSELOR", id: counselor && counselor.id, view: "queue" }, { eventType: "COUNSEL_QUEUE", tone: result === "WORSE" ? "warning" : "info", title: "자가조치 미해결 문의가 도착했습니다", message: customerName(state, inquiry.customerId) + " 고객 · 결과: " + labels[result], inquiryId: inquiry.id, actor: "AI 케어", dedupeKey: "ACTION-COUNSEL-STAFF:" + inquiry.id });
      }
      timeline(inquiry, "고객 · " + (actorName || "시연 고객"), inquiry.status, "자가조치 결과를 등록했습니다.", "조치 결과: " + labels[result]);
      audit(state, actorName || "시연 고객", "고객", "자가조치 결과 등록", inquiry.id, labels[result]);
      operation(state, "USER_ACTION", "SUCCESS", inquiry.id, "자가조치 결과: " + result, 0, { actorRole: "CUSTOMER", previousStatus: "SELF_ACTION", nextStatus: inquiry.status });
    });
  }

  function requestCounsel(inquiryId, actorName, actorCustomerId) {
    return transaction("REQUEST_COUNSEL", function (state) {
      var inquiry = findInquiry(state, inquiryId);
      requireCustomerInquiry(inquiry, actorCustomerId);
      if (inquiry.status === "WAITING_COUNSEL" || inquiry.status === "IN_COUNSEL" || inquiry.status === "VISIT_SCHEDULED") return false;
      requireStatus(inquiry, ["RECEIVED", "ADDITIONAL_QUESTIONS", "SELF_ACTION", "ACTION_RESULT", "VISIT_COMPLETE", "RESOLUTION_PENDING", "COMPLETION_PENDING", "COMPLETED"], "현재 문의에서는 상담을 요청할 수 없습니다.");
      inquiry.status = "WAITING_COUNSEL";
      if (inquiry.processingFailure && inquiry.processingFailure.status === "FAILED") {
        inquiry.processingFailure.status = "ROUTED_TO_COUNSEL";
        inquiry.processingFailure.routedAt = now();
      }
      inquiry.priority = inquiry.risk === "DANGER" ? "URGENT" : (inquiry.actionResult === "WORSE" ? "HIGH" : inquiry.priority);
      var counselor = (state.staff || []).find(function (item) { return item.role === "COUNSELOR" && item.active; });
      setWorkflow(inquiry, { currentOwnerRole: "COUNSELOR", currentOwnerId: counselor && counselor.id, currentOwnerName: counselor ? counselor.name : "상담사 배정 중", nextActorRole: "COUNSELOR", nextAction: "상담사가 기존 문의 이력과 고객 요청을 확인합니다.", customerActionRequired: false, routingDecision: "COUNSEL", routingReason: "고객 상담 요청", verificationStatus: inquiry.risk === "DANGER" ? "BLOCKED" : (inquiry.workflow && inquiry.workflow.verificationStatus) || "PENDING" });
      timeline(inquiry, "고객 · " + (actorName || "시연 고객"), "WAITING_COUNSEL", "상담 연결을 요청했습니다.", "기존 문의 정보와 조치 결과를 상담 큐로 전달");
      notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "inquiries" }, { eventType: "COUNSEL_REQUESTED", tone: "info", title: "상담 요청이 접수됐어요", message: "기존 문의 이력과 답변을 상담사에게 전달했습니다.", inquiryId: inquiry.id, actor: actorName || customerName(state, inquiry.customerId), dedupeKey: "COUNSEL-REQUEST-CUSTOMER:" + inquiry.id + ":" + inquiry.updatedAt });
      notify(state, { role: "COUNSELOR", id: counselor && counselor.id, view: "queue" }, { eventType: "COUNSEL_QUEUE", tone: inquiry.risk === "DANGER" ? "danger" : "info", title: inquiry.risk === "DANGER" ? "위험 문의 상담 요청" : "새 상담 요청이 도착했습니다", message: customerName(state, inquiry.customerId) + " 고객의 기존 문의 이력을 확인해 주세요.", inquiryId: inquiry.id, actor: actorName || customerName(state, inquiry.customerId), dedupeKey: "COUNSEL-REQUEST-STAFF:" + inquiry.id + ":" + inquiry.updatedAt });
      audit(state, actorName || "시연 고객", "고객", "상담 요청", inquiry.id, "상담 대기 상태로 전환");
    });
  }

  function startCounsel(inquiryId, counselorId, counselorName) {
    return transaction("START_COUNSEL", function (state) {
      var counselorStaff = requireStaff(state, counselorId, ["COUNSELOR"]);
      var inquiry = findInquiry(state, inquiryId);
      requireStatus(inquiry, ["WAITING_COUNSEL"], "상담 대기 문의만 상담을 시작할 수 있습니다.");
      var startedAt = now();
      inquiry.status = "IN_COUNSEL";
      inquiry.counselor = inquiry.counselor || {};
      if (inquiry.counselor.sessionId && inquiry.counselor.startedAt) {
        inquiry.counselHistory = inquiry.counselHistory || [];
        inquiry.counselHistory.push(clone(inquiry.counselor));
      }
      inquiry.counselor.id = counselorId;
      inquiry.counselor.sessionId = "CS-" + inquiry.id + "-" + startedAt.replace(/\D/g, "");
      inquiry.counselor.startedAt = startedAt;
      inquiry.counselor.resolvedAt = null;
      inquiry.counselor.note = "";
      inquiry.counselor.record = null;
      inquiry.counselor.decision = null;
      if (inquiry.processingFailure && inquiry.processingFailure.status === "FAILED") {
        inquiry.processingFailure.status = "ROUTED_TO_COUNSEL";
        inquiry.processingFailure.routedAt = startedAt;
      }
      setWorkflow(inquiry, { currentOwnerRole: "COUNSELOR", currentOwnerId: counselorId, currentOwnerName: counselorStaff.name, nextActorRole: "COUNSELOR", nextAction: "상담 결과를 기록하고 고객 확인 또는 방문점검으로 연결합니다.", customerActionRequired: false, routingDecision: "COUNSEL", routingReason: inquiry.workflow && inquiry.workflow.routingReason || "상담 요청", verificationStatus: inquiry.risk === "DANGER" ? "BLOCKED" : (inquiry.workflow && inquiry.workflow.verificationStatus) || "PENDING" });
      timeline(inquiry, "상담사 · " + counselorStaff.name, "IN_COUNSEL", "상담을 시작했습니다.", "고객이 제공한 기존 정보 확인 완료");
      notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "inquiries" }, { eventType: "COUNSEL_STARTED", tone: "success", title: counselorStaff.name + " 상담사가 확인 중이에요", message: "기존 답변과 처리 이력을 바탕으로 상담을 시작했습니다.", inquiryId: inquiry.id, actor: counselorStaff.name, dedupeKey: "COUNSEL-STARTED:" + inquiry.id });
      audit(state, counselorStaff.name, "상담사", "상담 시작", inquiry.id, "담당 상담사 지정");
    });
  }

  function normalizeCounselRecord(value, visitRequired) {
    var allowedFields = ["started", "targetWater", "condition", "errorCode", "companion", "recentNonUse", "performedActions", "lastCare"];
    if (typeof value === "string") {
      var legacy = String(value).trim();
      if (!legacy) throw new Error("상담 기록을 입력해 주세요.");
      return { additionalChecks: "기존 고객 답변·제품·관리 이력 확인", guidance: legacy, result: legacy, visitRequired: typeof visitRequired === "boolean" ? visitRequired : null, confirmedFields: [], recordedAt: now() };
    }
    value = value || {};
    ["additionalChecks", "guidance", "result"].forEach(function (field) { if (!String(value[field] || "").trim()) throw new Error("추가 확인사항, 안내 내용과 상담 결과를 모두 입력해 주세요."); });
    return {
      additionalChecks: String(value.additionalChecks).trim(), guidance: String(value.guidance).trim(), result: String(value.result).trim(),
      visitRequired: typeof visitRequired === "boolean" ? visitRequired : (typeof value.visitRequired === "boolean" ? value.visitRequired : null),
      confirmedFields: (value.confirmedFields || []).filter(function (field, index, list) { return allowedFields.indexOf(field) >= 0 && list.indexOf(field) === index; }),
      recordedAt: now()
    };
  }

  function saveCounselNote(inquiryId, note, counselorId, counselorName) {
    var record = normalizeCounselRecord(note);
    return transaction("SAVE_COUNSEL_NOTE", function (state) {
      var inquiry = findInquiry(state, inquiryId);
      var counselorStaff = requireStaff(state, counselorId, ["COUNSELOR"]);
      requireStatus(inquiry, ["IN_COUNSEL", "WAITING_COUNSEL"], "상담 단계의 문의만 기록할 수 있습니다.");
      if (inquiry.counselor && inquiry.counselor.id && inquiry.counselor.id !== counselorStaff.id) throw new Error("담당 상담사만 상담 기록을 저장할 수 있습니다.");
      inquiry.counselor = inquiry.counselor || {};
      inquiry.counselor.record = record;
      inquiry.counselor.note = record.result;
      inquiry.counselor.id = counselorStaff.id;
      inquiry.counselor.sessionId = inquiry.counselor.sessionId || "CS-" + inquiry.id + "-" + now().replace(/\D/g, "");
      setWorkflow(inquiry, { currentOwnerRole: "COUNSELOR", currentOwnerName: counselorStaff.name, nextActorRole: "COUNSELOR", nextAction: "상담 해결 또는 방문점검 중 다음 처리를 선택합니다." });
      timeline(inquiry, "상담사 · " + counselorStaff.name, "IN_COUNSEL", "상담 기록을 저장했습니다.", "추가 확인사항·안내 내용·상담 결과·방문 필요 여부 분리 저장");
      audit(state, counselorStaff.name, "상담사", "상담 기록 저장", inquiry.id, "구조화 상담 기록 갱신");
    });
  }

  function resolveCounsel(inquiryId, note, counselorId, counselorName) {
    var record = normalizeCounselRecord(note, false);
    return transaction("RESOLVE_COUNSEL", function (state) {
      var inquiry = findInquiry(state, inquiryId);
      var counselorStaff = requireStaff(state, counselorId, ["COUNSELOR"]);
      requireStatus(inquiry, ["IN_COUNSEL"], "진행 중인 상담만 고객 확인 단계로 전환할 수 있습니다.");
      if (inquiry.counselor && inquiry.counselor.id && counselorId && inquiry.counselor.id !== counselorId) throw new Error("담당 상담사만 상담을 완료할 수 있습니다.");
      inquiry.counselor = inquiry.counselor || {};
      inquiry.counselor.id = counselorStaff.id;
      inquiry.counselor.record = record;
      inquiry.counselor.note = record.result;
      inquiry.counselor.decision = "RESOLVED";
      inquiry.counselor.resolvedAt = now();
      inquiry.resolutionSummary = record.result;
      inquiry.status = "RESOLUTION_PENDING";
      inquiry.latestResolution = { source: "COUNSEL", at: inquiry.counselor.resolvedAt, actorId: counselorStaff.id, referenceId: inquiry.counselor.sessionId };
      setWorkflow(inquiry, { currentOwnerRole: "CUSTOMER", currentOwnerId: inquiry.customerId, currentOwnerName: customerName(state, inquiry.customerId), nextActorRole: "CUSTOMER", nextAction: "상담 안내 후 증상이 해결되었는지 알려주세요.", customerActionRequired: true, routingDecision: "FOLLOW_UP", routingReason: "상담 안내 완료 후 고객 확인 대기", verificationStatus: "PASSED", evidenceStatus: inquiry.evidence && inquiry.evidence.length ? "FOUND" : "COUNSEL_VERIFIED" });
      setUsageGuidance(inquiry, { status: inquiry.risk === "DANGER" ? "FULL_STOP" : "PENDING_REVIEW", label: inquiry.risk === "DANGER" ? "제품 전체 사용 중지 유지" : "상담 결과 확인 중", scope: inquiry.risk === "DANGER" ? "제품 전체" : "상담 안내 범위", reason: "상담 안내 후 고객의 해결 확인을 기다리고 있습니다.", nextAction: "상담 안내를 확인하고 해결 여부를 알려주세요.", ruleId: inquiry.risk === "DANGER" ? "SAFE-LEAK-02" : null });
      timeline(inquiry, "상담사 · " + counselorStaff.name, "RESOLUTION_PENDING", "상담 안내를 완료하고 고객 확인을 요청했습니다.", "내부 상담 기록은 보존하고 고객에게 해결 여부 확인 요청");
      notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "inquiries" }, { eventType: "RESOLUTION_CONFIRMATION", tone: "success", title: "상담 처리가 완료됐어요", message: "안내 후 불편이 해결되었는지 확인해 주세요.", inquiryId: inquiry.id, actor: counselorStaff.name, dedupeKey: "COUNSEL-RESOLVED:" + inquiry.id });
      audit(state, counselorStaff.name, "상담사", "상담 해결 안내 완료", inquiry.id, "고객 해결 확인 대기");
    });
  }

  function scheduleVisit(inquiryId, options) {
    options = options || {};
    var customerPreferredAt = String(options.customerPreferredAt || options.desiredAt || "");
    var scheduleStatus = options.scheduleStatus || "ASSIGNING";
    if (!customerPreferredAt || Number.isNaN(new Date(customerPreferredAt).getTime())) throw new Error("고객 희망 방문일을 입력해 주세요.");
    if (["ASSIGNING", "COORDINATING", "CONFIRMED"].indexOf(scheduleStatus) < 0) throw new Error("올바른 방문 일정 상태를 선택해 주세요.");
    if (scheduleStatus !== "ASSIGNING" && !options.engineerId) throw new Error("일정 조율부터는 가상 방문기사를 지정해 주세요.");
    if (scheduleStatus === "CONFIRMED" && (!options.confirmedAt || Number.isNaN(new Date(options.confirmedAt).getTime()))) throw new Error("방문 확정 상태에는 가상 확정일이 필요합니다.");
    return transaction("SCHEDULE_VISIT", function (state) {
      var inquiry = findInquiry(state, inquiryId);
      var counselor = requireStaff(state, options.actorId, ["COUNSELOR"]);
      requireStatus(inquiry, ["IN_COUNSEL"], "상담을 시작하고 결과를 기록한 문의만 방문으로 전환할 수 있습니다.");
      if (inquiry.counselor && inquiry.counselor.id && inquiry.counselor.id !== counselor.id) throw new Error("담당 상담사만 방문 일정을 등록할 수 있습니다.");
      if (!inquiry.counselor || !String(inquiry.counselor.note || "").trim() || !inquiry.counselor.sessionId) throw new Error("상담 결과를 저장한 뒤 방문 일정을 등록해 주세요.");
      var previousStatus = inquiry.status;
      var engineer = options.engineerId ? requireStaff(state, options.engineerId, ["ENGINEER"]) : null;
      inquiry.status = "VISIT_SCHEDULED";
      inquiry.counselor = inquiry.counselor || {};
      inquiry.counselor.id = counselor.id;
      inquiry.counselor.record = Object.assign({}, inquiry.counselor.record || normalizeCounselRecord(inquiry.counselor.note, true), { visitRequired: true, recordedAt: now() });
      inquiry.counselor.decision = "VISIT";
      if (inquiry.visit && inquiry.visit.status === "COMPLETED") {
        inquiry.visitHistory = inquiry.visitHistory || [];
        inquiry.visitHistory.push(clone(inquiry.visit));
      }
      inquiry.visit = {
        id: "VIS-" + String(Date.now()), workOrderId: "WO-" + String(Date.now()), serviceType: options.serviceType || "AS",
        engineerId: engineer ? engineer.id : null,
        customerPreferredAt: customerPreferredAt,
        confirmedAt: scheduleStatus === "CONFIRMED" ? options.confirmedAt : null,
        scheduledAt: scheduleStatus === "CONFIRMED" ? options.confirmedAt : null,
        scheduleStatus: scheduleStatus,
        area: options.area || "방문 지역 확인 예정 (가상)",
        status: "SCHEDULED", result: null, cause: null, actions: [], replacement: null, signature: null,
        rescheduleRequest: null, rescheduleHistory: []
      };
      var submittedQuestionnaire = questionnaireForProduct(state, inquiry.productId);
      if (submittedQuestionnaire && submittedQuestionnaire.status === "SUBMITTED" && !submittedQuestionnaire.inquiryId) {
        submittedQuestionnaire.inquiryId = inquiry.id;
        syncLegacyQuestionnaire(state, submittedQuestionnaire);
      }
      var confirmed = scheduleStatus === "CONFIRMED";
      setWorkflow(inquiry, { currentOwnerRole: confirmed ? "ENGINEER" : "COUNSELOR", currentOwnerId: confirmed ? engineer.id : counselor.id, currentOwnerName: confirmed ? engineer.name : counselor.name, nextActorRole: confirmed ? "ENGINEER" : "COUNSELOR", nextAction: confirmed ? "방문 전 인계 내용을 확인하고 현장 작업 결과와 고객 서명을 등록합니다." : (scheduleStatus === "ASSIGNING" ? "고객 희망일을 기준으로 가상 방문기사를 배정합니다." : "가상 기사와 확정 방문일을 조율합니다."), customerActionRequired: false, routingDecision: "VISIT", routingReason: inquiry.risk === "DANGER" ? "위험 신호 현장 확인 필요" : "상담 결과 현장 확인 필요", verificationStatus: inquiry.risk === "DANGER" ? "BLOCKED" : (inquiry.workflow && inquiry.workflow.verificationStatus) || "PENDING" });
      timeline(inquiry, "상담사 · " + counselor.name, "VISIT_" + scheduleStatus, "방문 일정 상태를 등록했습니다.", (CONFIG.scheduleStatuses && CONFIG.scheduleStatuses[scheduleStatus] ? CONFIG.scheduleStatuses[scheduleStatus].label : scheduleStatus) + " · 고객 희망 " + customerPreferredAt);
      notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "schedule" }, { eventType: "VISIT_" + scheduleStatus, tone: confirmed ? "success" : "info", title: confirmed ? "방문 일정이 확정됐어요" : (scheduleStatus === "ASSIGNING" ? "방문기사를 배정하고 있어요" : "방문 일정을 조율하고 있어요"), message: confirmed ? engineer.name + " 기사가 " + options.confirmedAt + "에 방문할 예정입니다." : "고객 희망일 " + customerPreferredAt + "을 기준으로 확인 중입니다.", inquiryId: inquiry.id, actor: counselor.name, dedupeKey: "VISIT-CUSTOMER:" + inquiry.id + ":" + scheduleStatus });
      if (engineer) notify(state, { role: "ENGINEER", id: engineer.id, view: "visits" }, { eventType: confirmed ? "VISIT_CONFIRMED" : "VISIT_ASSIGNED", tone: inquiry.risk === "DANGER" ? "danger" : "info", title: confirmed ? "방문 일정이 확정됐습니다" : "조율 중인 방문 건이 배정됐습니다", message: customerName(state, inquiry.customerId) + " 고객 · 기존 문진·상담 이력을 확인해 주세요.", inquiryId: inquiry.id, actor: counselor.name, dedupeKey: "VISIT-ENGINEER:" + inquiry.id + ":" + scheduleStatus });
      audit(state, counselor.name, "상담사", "방문 일정 등록", inquiry.id, (engineer ? engineer.name + " 기사 · " : "기사 배정 전 · ") + scheduleStatus);
      operation(state, "USER_ACTION", "SUCCESS", inquiry.id, "방문 일정 " + scheduleStatus, 0, { actorRole: "COUNSELOR", actorId: counselor.id, previousStatus: previousStatus, nextStatus: "VISIT_" + scheduleStatus });
    });
  }

  function updateVisitSchedule(inquiryId, options) {
    options = options || {};
    var targetStatus = options.scheduleStatus;
    var order = { ASSIGNING: 0, COORDINATING: 1, CONFIRMED: 2 };
    if (order[targetStatus] == null) throw new Error("올바른 방문 일정 상태를 선택해 주세요.");
    return transaction("UPDATE_VISIT_SCHEDULE", function (state) {
      var inquiry = findInquiry(state, inquiryId);
      var counselor = requireStaff(state, options.actorId, ["COUNSELOR"]);
      requireStatus(inquiry, ["VISIT_SCHEDULED"], "방문 예정 문의만 일정을 조율할 수 있습니다.");
      if (!inquiry.visit || inquiry.visit.status !== "SCHEDULED") throw new Error("조율할 방문 일정이 없습니다.");
      if (inquiry.counselor && inquiry.counselor.id && inquiry.counselor.id !== counselor.id) throw new Error("담당 상담사만 방문 일정을 조율할 수 있습니다.");
      var currentStatus = inquiry.visit.scheduleStatus || "ASSIGNING";
      if (order[targetStatus] < order[currentStatus]) throw new Error("방문 일정 상태를 이전 단계로 되돌릴 수 없습니다.");
      if (targetStatus === currentStatus && targetStatus === "CONFIRMED") return false;
      if (targetStatus === currentStatus && targetStatus !== "CONFIRMED" && (!options.engineerId || options.engineerId === inquiry.visit.engineerId) && (!options.customerPreferredAt || options.customerPreferredAt === inquiry.visit.customerPreferredAt)) return false;
      var engineer = options.engineerId ? requireStaff(state, options.engineerId, ["ENGINEER"]) : (inquiry.visit.engineerId ? requireStaff(state, inquiry.visit.engineerId, ["ENGINEER"]) : null);
      if (targetStatus !== "ASSIGNING" && !engineer) throw new Error("일정 조율부터는 가상 방문기사를 지정해 주세요.");
      if (targetStatus === "CONFIRMED" && (!options.confirmedAt || Number.isNaN(new Date(options.confirmedAt).getTime()))) throw new Error("방문 확정일을 입력해 주세요.");
      inquiry.visit.engineerId = engineer ? engineer.id : null;
      inquiry.visit.confirmedAt = targetStatus === "CONFIRMED" ? options.confirmedAt : null;
      inquiry.visit.scheduledAt = inquiry.visit.confirmedAt;
      inquiry.visit.scheduleStatus = targetStatus;
      if (options.customerPreferredAt) inquiry.visit.customerPreferredAt = options.customerPreferredAt;
      var confirmed = targetStatus === "CONFIRMED";
      setWorkflow(inquiry, { currentOwnerRole: confirmed ? "ENGINEER" : "COUNSELOR", currentOwnerId: confirmed ? engineer.id : counselor.id, currentOwnerName: confirmed ? engineer.name : counselor.name, nextActorRole: confirmed ? "ENGINEER" : "COUNSELOR", nextAction: confirmed ? "방문 전 인계 내용을 확인하고 현장 작업 결과를 등록합니다." : "고객 희망일과 기사 가능 시간을 확인해 확정일을 등록합니다." });
      timeline(inquiry, "상담사 · " + counselor.name, "VISIT_" + targetStatus, confirmed ? "가상 방문 일정을 확정했습니다." : "방문기사와 일정을 조율하고 있습니다.", confirmed ? options.confirmedAt : engineer.name + " 기사 배정");
      notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "schedule" }, { eventType: "VISIT_" + targetStatus, tone: confirmed ? "success" : "info", title: confirmed ? "방문 일정이 확정됐어요" : "방문 일정을 조율하고 있어요", message: confirmed ? engineer.name + " 기사 · " + options.confirmedAt : engineer.name + " 기사와 가능한 시간을 확인 중입니다.", inquiryId: inquiry.id, actor: counselor.name, dedupeKey: "VISIT-UPDATE-CUSTOMER:" + inquiry.id + ":" + targetStatus });
      notify(state, { role: "ENGINEER", id: engineer.id, view: "visits" }, { eventType: confirmed ? "VISIT_CONFIRMED" : "VISIT_ASSIGNED", tone: inquiry.risk === "DANGER" ? "danger" : "info", title: confirmed ? "방문 일정이 확정됐습니다" : "조율 중인 방문 건이 배정됐습니다", message: customerName(state, inquiry.customerId) + " 고객 · " + (confirmed ? options.confirmedAt : inquiry.visit.customerPreferredAt), inquiryId: inquiry.id, actor: counselor.name, dedupeKey: "VISIT-UPDATE-ENGINEER:" + inquiry.id + ":" + targetStatus });
      audit(state, counselor.name, "상담사", "방문 일정 상태 변경", inquiry.id, currentStatus + " → " + targetStatus);
      operation(state, "USER_ACTION", "SUCCESS", inquiry.id, "방문 일정 상태 변경", 0, { actorRole: "COUNSELOR", actorId: counselor.id, previousStatus: "VISIT_" + currentStatus, nextStatus: "VISIT_" + targetStatus });
    });
  }

  function requestVisitReschedule(inquiryId, options) {
    options = options || {};
    var desiredAt = String(options.desiredAt || "");
    var reason = String(options.reason || "").trim();
    if (!desiredAt || Number.isNaN(new Date(desiredAt).getTime())) throw new Error("변경을 희망하는 방문 일시를 선택해 주세요.");
    if (reason.length < 5) throw new Error("일정 변경 사유를 5자 이상 입력해 주세요.");
    if (new Date(desiredAt).getTime() <= Date.now()) throw new Error("현재 시각 이후의 방문 일시를 선택해 주세요.");
    return transaction("REQUEST_VISIT_RESCHEDULE", function (state) {
      var inquiry = findInquiry(state, inquiryId);
      requireCustomerInquiry(inquiry, options.customerId);
      requireStatus(inquiry, ["VISIT_SCHEDULED"], "방문 예정 문의만 일정을 변경할 수 있습니다.");
      if (!inquiry.visit || inquiry.visit.status !== "SCHEDULED") throw new Error("변경할 방문 일정이 없습니다.");
      if (inquiry.visit.rescheduleRequest && inquiry.visit.rescheduleRequest.status === "REQUESTED") {
        throw new Error("이미 처리 중인 일정 변경 요청이 있습니다.");
      }
      if (inquiry.visit.scheduleStatus !== "CONFIRMED") throw new Error("방문 확정 후에만 일정 변경을 요청할 수 있습니다.");
      if (new Date(desiredAt).getTime() === new Date(inquiry.visit.scheduledAt).getTime()) throw new Error("현재 확정 일정과 다른 방문 일시를 선택해 주세요.");
      inquiry.visit.rescheduleHistory = inquiry.visit.rescheduleHistory || [];
      inquiry.visit.rescheduleRequest = {
        id: "RSC-" + String(Date.now()), requestedAt: now(), desiredAt: desiredAt, reason: reason,
        status: "REQUESTED", resolvedAt: null, resolvedBy: null, resolutionNote: null
      };
      inquiry.visit.scheduleStatus = "COORDINATING";
      setWorkflow(inquiry, { currentOwnerRole: "OPERATOR", currentOwnerId: null, currentOwnerName: "일정 조정 담당", nextActorRole: "OPERATOR", nextAction: "희망 일정과 기사 가능 시간을 확인해 승인 또는 반려합니다.", customerActionRequired: false, routingDecision: "RESCHEDULE_REVIEW", routingReason: "고객 방문 일정 변경 요청" });
      timeline(inquiry, (options.customerType === "BUSINESS" ? "기업 고객 · " : "고객 · ") + (options.actorName || "시연 고객"), "RESCHEDULE_REQUESTED", "방문 일정 변경을 요청했습니다.", "희망 일시와 변경 사유를 관계자에게 전달");
      var scheduleCounselor = (state.staff || []).find(function (item) { return item.role === "COUNSELOR" && item.active; });
      var operator = (state.staff || []).find(function (item) { return item.role === "OPERATOR" && item.active; });
      notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "schedule" }, { eventType: "RESCHEDULE_REQUESTED", tone: "info", title: "일정 변경 요청을 전달했어요", message: "희망 일시를 담당자와 방문기사가 함께 확인 중입니다.", inquiryId: inquiry.id, actor: options.actorName || customerName(state, inquiry.customerId), dedupeKey: "RESCHEDULE-ACK:" + inquiry.visit.rescheduleRequest.id });
      notify(state, [
        { role: "COUNSELOR", id: scheduleCounselor && scheduleCounselor.id, view: "visits" },
        { role: "OPERATOR", id: operator && operator.id, view: "visits" },
        { role: "ENGINEER", id: inquiry.visit.engineerId, view: "visits" }
      ], { eventType: "RESCHEDULE_REVIEW", tone: "warning", title: "방문 일정 변경 요청", message: customerName(state, inquiry.customerId) + " 고객이 " + desiredAt + " 방문을 요청했습니다.", inquiryId: inquiry.id, actor: options.actorName || customerName(state, inquiry.customerId), dedupeKey: "RESCHEDULE-REVIEW:" + inquiry.visit.rescheduleRequest.id });
      audit(state, options.actorName || "시연 고객", options.customerType === "BUSINESS" ? "기업 고객" : "고객", "방문 일정 변경 요청", inquiry.id, "관계자 승인 대기");
    });
  }

  function resolveVisitReschedule(inquiryId, options) {
    options = options || {};
    var decision = options.decision;
    if (["APPROVE", "REJECT"].indexOf(decision) < 0) throw new Error("일정 변경 승인 또는 반려를 선택해 주세요.");
    return transaction("RESOLVE_VISIT_RESCHEDULE", function (state) {
      var inquiry = findInquiry(state, inquiryId);
      var reviewer = requireStaff(state, options.actorId, ["COUNSELOR", "OPERATOR"]);
      requireStatus(inquiry, ["VISIT_SCHEDULED"], "방문 예정 문의만 일정 변경을 처리할 수 있습니다.");
      var visit = inquiry.visit;
      if (!visit || !visit.rescheduleRequest || visit.rescheduleRequest.status !== "REQUESTED") {
        throw new Error("처리할 일정 변경 요청이 없습니다.");
      }
      var request = visit.rescheduleRequest;
      var previousAt = visit.scheduledAt;
      request.status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
      request.resolvedAt = now();
      request.resolvedBy = reviewer.name;
      request.resolutionNote = String(options.resolutionNote || (decision === "APPROVE" ? "희망 일정 승인" : "기존 일정 유지"));
      if (decision === "APPROVE") {
        visit.confirmedAt = request.desiredAt;
        visit.scheduledAt = request.desiredAt;
      }
      visit.scheduleStatus = "CONFIRMED";
      visit.rescheduleHistory = visit.rescheduleHistory || [];
      visit.rescheduleHistory.push(clone(request));
      setWorkflow(inquiry, { currentOwnerRole: "ENGINEER", currentOwnerId: visit.engineerId, currentOwnerName: staffName(state, visit.engineerId, "방문기사"), nextActorRole: "ENGINEER", nextAction: "확정된 방문 일정과 인계 내용을 확인하고 현장 작업을 진행합니다.", customerActionRequired: false, routingDecision: "VISIT", routingReason: decision === "APPROVE" ? "고객 희망 일정 승인" : "기존 방문 일정 유지" });
      timeline(inquiry, (reviewer.role === "OPERATOR" ? "운영 담당자" : "상담사") + " · " + reviewer.name, "RESCHEDULE_" + request.status, decision === "APPROVE" ? "방문 일정 변경을 확정했습니다." : "방문 일정 변경 요청을 반려했습니다.", decision === "APPROVE" ? previousAt + " → " + visit.scheduledAt : "기존 일정 유지 · " + request.resolutionNote);
      notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "schedule" }, { eventType: decision === "APPROVE" ? "RESCHEDULE_APPROVED" : "RESCHEDULE_REJECTED", tone: decision === "APPROVE" ? "success" : "warning", title: decision === "APPROVE" ? "변경된 방문 일정이 확정됐어요" : "기존 방문 일정이 유지됩니다", message: decision === "APPROVE" ? visit.scheduledAt + " 방문으로 변경되었습니다." : request.resolutionNote, inquiryId: inquiry.id, actor: reviewer.name, dedupeKey: "RESCHEDULE-RESULT-CUSTOMER:" + request.id });
      notify(state, { role: "ENGINEER", id: visit.engineerId, view: "visits" }, { eventType: "VISIT_SCHEDULE_UPDATED", tone: "info", title: decision === "APPROVE" ? "방문 일정이 변경됐습니다" : "기존 방문 일정이 유지됩니다", message: customerName(state, inquiry.customerId) + " 고객 · " + visit.scheduledAt, inquiryId: inquiry.id, actor: reviewer.name, dedupeKey: "RESCHEDULE-RESULT-ENGINEER:" + request.id });
      audit(state, reviewer.name, reviewer.role === "OPERATOR" ? "운영 담당자" : "상담사", decision === "APPROVE" ? "방문 일정 변경 승인" : "방문 일정 변경 반려", inquiry.id, decision === "APPROVE" ? "변경 일정 확정" : "기존 일정 유지");
    });
  }

  function completeVisit(inquiryId, options) {
    options = options || {};
    if (!String(options.result || "").trim() || !String(options.cause || "").trim() || !Array.isArray(options.actions) || !options.actions.length) {
      throw new Error("점검 결과, 확인 원인과 수행 조치는 필수입니다.");
    }
    if (["AS", "INSTALL", "REPAIR", "REGULAR_CARE"].indexOf(options.serviceType) < 0) throw new Error("작업 유형을 선택해 주세요.");
    if (!options.signatureConsent || !String(options.signerName || "").trim()) throw new Error("고객 확인 동의와 서명자 이름은 필수입니다.");
    if (["SELF", "FAMILY", "BUSINESS_REP", "OTHER"].indexOf(options.signerRelationship) < 0) throw new Error("서명자 관계를 선택해 주세요.");
    var signaturePointCount = validateSignatureData(options.signatureData);
    return transaction("COMPLETE_VISIT", function (state) {
      var inquiry = findInquiry(state, inquiryId);
      var previousStatus = inquiry.status;
      if (inquiry.status === "VISIT_COMPLETE" || (inquiry.visit && inquiry.visit.status === "COMPLETED")) return false;
      requireStatus(inquiry, ["VISIT_SCHEDULED"], "방문 예정 문의만 완료 처리할 수 있습니다.");
      if (!inquiry.visit) throw new Error("등록된 방문 일정이 없습니다.");
      if (inquiry.visit.scheduleStatus !== "CONFIRMED") throw new Error("방문 일정이 확정된 후에만 작업 완료를 등록할 수 있습니다.");
      if (inquiry.visit.rescheduleRequest && inquiry.visit.rescheduleRequest.status === "REQUESTED") throw new Error("일정 변경 요청을 먼저 승인 또는 반려해 주세요.");
      var completingEngineer = requireStaff(state, options.engineerId, ["ENGINEER"]);
      if (inquiry.visit.engineerId !== completingEngineer.id) throw new Error("배정된 방문기사만 작업 완료를 등록할 수 있습니다.");
      var signingCustomer = state.customers.find(function (item) { return item.id === inquiry.customerId; });
      if (signingCustomer && signingCustomer.customerType === "BUSINESS" && (options.signerRelationship !== "BUSINESS_REP" || !String(options.signerPosition || "").trim())) {
        throw new Error("기업 고객은 서명 권한이 있는 담당자의 직책을 입력해 주세요.");
      }
      var completedAt = options.completedAt || now();
      inquiry.visit.serviceType = options.serviceType;
      inquiry.visit.status = "COMPLETED";
      inquiry.visit.completedAt = completedAt;
      inquiry.visit.result = String(options.result).trim();
      inquiry.visit.cause = String(options.cause).trim();
      inquiry.visit.actions = options.actions.slice();
      inquiry.visit.replacement = String(options.replacement || "교체 없음");
      inquiry.visit.signature = {
        signedBy: String(options.signerName).trim(), relationship: options.signerRelationship, position: String(options.signerPosition || "").trim(),
        signedAt: completedAt, consent: true, consentVersion: "VISIT_COMPLETION_V1", method: "DIGITAL_PAD",
        signatureData: clone(options.signatureData), integrityId: "SIG-" + String(Date.now()) + "-" + String(signaturePointCount)
      };
      inquiry.status = "VISIT_COMPLETE";
      inquiry.latestResolution = { source: "VISIT", at: completedAt, actorId: completingEngineer.id, referenceId: inquiry.visit.id };
      setWorkflow(inquiry, { currentOwnerRole: "CUSTOMER", currentOwnerId: inquiry.customerId, currentOwnerName: customerName(state, inquiry.customerId), nextActorRole: "CUSTOMER", nextAction: "작업 확인서와 서명을 확인하고 증상 해결 여부를 알려주세요.", customerActionRequired: true, routingDecision: "FOLLOW_UP", routingReason: "방문 작업 완료 후 고객 확인 대기", verificationStatus: "PASSED", evidenceStatus: inquiry.evidence && inquiry.evidence.length ? "FOUND" : "FIELD_VERIFIED" });
      setUsageGuidance(inquiry, { status: inquiry.risk === "DANGER" ? "FULL_STOP" : "PENDING_REVIEW", label: inquiry.risk === "DANGER" ? "고객 해결 확인 전 사용 중지" : "방문 결과 확인 중", scope: inquiry.risk === "DANGER" ? "제품 전체" : "방문 점검 범위", reason: "방문 작업은 완료됐으며 고객의 해결 확인을 기다리고 있습니다.", nextAction: "작업 확인서를 확인하고 해결 여부를 알려주세요.", ruleId: inquiry.risk === "DANGER" ? "SAFE-LEAK-02" : null });
      var product = findProduct(state, inquiry.productId);
      var oldNextCareAt = product.nextCareAt;
      var completedDate = dateKeyInSeoul(completedAt);
      if (!completedDate) throw new Error("방문 완료일 형식이 올바르지 않습니다.");
      product.lastCareAt = completedDate;
      product.nextCareAt = addMonths(completedDate, Number(product.cycleMonths || 4));
      product.careState = "UPDATED";
      product.filterLife = options.replacement && options.replacement !== "교체 없음" ? 100 : product.filterLife;
      var careId = "CARE-" + inquiry.id;
      if (!product.careHistory.some(function (item) { return item.id === careId; })) {
        var serviceLabels = { AS: "A/S 점검", INSTALL: "신규 설치", REPAIR: "수리", REGULAR_CARE: "정기 케어" };
        product.careHistory.unshift({ id: careId, date: completedDate, type: serviceLabels[options.serviceType] + " 완료", performer: "가상 기사 · " + (options.engineerName || "시연 기사"), result: options.actions.join(" · ") + " · 고객 확인 서명" });
      }
      var nextQuestionnaire = ensureQuestionnaireCycle(state, product);
      syncLegacyQuestionnaire(state, nextQuestionnaire);
      inquiry.nextCareChange = { before: oldNextCareAt, after: product.nextCareAt, changedAt: completedAt };
      timeline(inquiry, "방문기사 · " + (options.engineerName || "시연 기사"), "VISIT_COMPLETE", "방문 점검과 케어를 완료했습니다.", options.actions.join(" · "), completedAt);
      var completionCounselor = (state.staff || []).find(function (item) { return item.id === inquiry.counselor.id; }) || (state.staff || []).find(function (item) { return item.role === "COUNSELOR" && item.active; });
      var completionOperator = (state.staff || []).find(function (item) { return item.role === "OPERATOR" && item.active; });
      notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "inquiries" }, { eventType: "RESOLUTION_CONFIRMATION", tone: "success", title: "방문 작업이 완료됐어요", message: "작업 확인서와 서명을 확인하고 증상 해결 여부를 알려주세요.", inquiryId: inquiry.id, actor: options.engineerName || "방문기사", dedupeKey: "VISIT-COMPLETE-CUSTOMER:" + inquiry.id + ":" + completedAt });
      notify(state, { role: "COUNSELOR", id: completionCounselor && completionCounselor.id, view: "queue" }, { eventType: "VISIT_COMPLETE", tone: "success", title: "방문 작업 완료 · 고객 확인 대기", message: customerName(state, inquiry.customerId) + " 고객의 작업 결과와 서명이 저장되었습니다.", inquiryId: inquiry.id, actor: options.engineerName || "방문기사", dedupeKey: "VISIT-COMPLETE-COUNSELOR:" + inquiry.id + ":" + completedAt });
      notify(state, { role: "OPERATOR", id: completionOperator && completionOperator.id, view: "queue" }, { eventType: "VISIT_COMPLETE", tone: "info", title: "방문 완료 · 고객 후속 확인 대기", message: customerName(state, inquiry.customerId) + " 고객의 해결 여부 확인이 남아 있습니다.", inquiryId: inquiry.id, actor: options.engineerName || "방문기사", dedupeKey: "VISIT-COMPLETE-OPERATOR:" + inquiry.id + ":" + completedAt });
      notify(state, { role: "ENGINEER", id: inquiry.visit.engineerId, view: "visits" }, { eventType: "VISIT_SAVED", tone: "success", title: "작업 결과가 저장됐습니다", message: "케어 이력과 다음 관리 일정에 현장 결과가 반영되었습니다.", inquiryId: inquiry.id, actor: "시스템", dedupeKey: "VISIT-SAVED:" + inquiry.id + ":" + completedAt });
      audit(state, options.engineerName || "시연 기사", "방문기사", "방문 결과·고객 서명 등록", inquiry.id, "작업 유형: " + options.serviceType + " · 케어 이력 및 다음 일정 갱신");
      operation(state, "USER_ACTION", "SUCCESS", inquiry.id, "방문 결과·서명 등록", 0, { actorRole: "ENGINEER", actorId: completingEngineer.id, previousStatus: inquiry.visit.scheduleStatus === "CONFIRMED" ? "VISIT_CONFIRMED" : previousStatus, nextStatus: "VISIT_COMPLETE" });
    });
  }

  function confirmResolution(inquiryId, resolved, actorName, actorCustomerId) {
    return transaction("CONFIRM_RESOLUTION", function (state) {
      var inquiry = findInquiry(state, inquiryId);
      requireCustomerInquiry(inquiry, actorCustomerId);
      requireStatus(inquiry, ["VISIT_COMPLETE", "RESOLUTION_PENDING"], "처리 결과 확인 단계가 아닙니다.");
      if (resolved) {
        var previousStatus = inquiry.status;
        var latestResolution = inquiry.latestResolution || { source: inquiry.status === "VISIT_COMPLETE" ? "VISIT" : "COUNSEL" };
        var source = latestResolution.source;
        var primaryRole = source === "VISIT" ? "ENGINEER" : "COUNSELOR";
        var primaryId = primaryRole === "ENGINEER" ? inquiry.visit.engineerId : (inquiry.counselor && inquiry.counselor.id);
        inquiry.status = "COMPLETION_PENDING";
        inquiry.followUp = { resolved: true, confirmedAt: now(), confirmedBy: inquiry.customerId, source: source };
        inquiry.completion = { status: "PENDING", requestedAt: now(), primaryRole: primaryRole, primaryId: primaryId, finalizedAt: null, finalizedBy: null, finalizedByRole: null };
        setWorkflow(inquiry, { currentOwnerRole: primaryRole, currentOwnerId: primaryId, currentOwnerName: staffName(state, primaryId, primaryRole === "ENGINEER" ? "방문기사 확인 중" : "상담사 확인 중"), nextActorRole: primaryRole, nextAction: "고객의 해결 확인을 검토하고 최종 완료로 전환합니다.", customerActionRequired: false, routingDecision: "FINAL_REVIEW", routingReason: "고객 해결 확인 후 관계자 완료 대기", verificationStatus: "PASSED" });
        setUsageGuidance(inquiry, { status: "PENDING_REVIEW", label: "최종 완료 확인 중", scope: inquiry.risk === "DANGER" ? "제품 전체" : "처리 범위", reason: "고객의 해결 확인이 접수되어 담당자가 작업 기록을 최종 확인하고 있습니다.", nextAction: "담당자의 완료 처리를 기다려 주세요.", ruleId: inquiry.risk === "DANGER" ? "SAFE-LEAK-02" : null });
        timeline(inquiry, "고객 · " + (actorName || "시연 고객"), "COMPLETION_PENDING", "증상 해결을 확인했습니다.", "관계자 최종 완료 처리 대기");
        notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "inquiries" }, { eventType: "COMPLETION_PENDING", tone: "success", title: "해결 확인이 접수됐어요", message: "담당자가 기록을 확인한 뒤 최종 완료 처리합니다.", inquiryId: inquiry.id, actor: actorName || customerName(state, inquiry.customerId), dedupeKey: "COMPLETION-PENDING-CUSTOMER:" + inquiry.id });
        notify(state, { role: primaryRole, id: primaryId, view: primaryRole === "ENGINEER" ? "visits" : "queue" }, { eventType: "FINALIZATION_REQUIRED", tone: "warning", title: "고객 해결 확인 · 완료 처리 필요", message: customerName(state, inquiry.customerId) + " 고객의 처리 결과를 최종 확인해 주세요.", inquiryId: inquiry.id, actor: actorName || customerName(state, inquiry.customerId), dedupeKey: "FINALIZATION-REQUIRED:" + inquiry.id });
        audit(state, actorName || "시연 고객", "고객", "해결 확인", inquiry.id, "관계자 최종 완료 대기");
        operation(state, "USER_ACTION", "SUCCESS", inquiry.id, "고객 해결 확인", 0, { actorRole: "CUSTOMER", actorId: inquiry.customerId, resolutionSource: source, previousStatus: previousStatus, nextStatus: "COMPLETION_PENDING" });
      } else {
        inquiry.status = "WAITING_COUNSEL";
        inquiry.priority = "HIGH";
        var reopenCounselor = (state.staff || []).find(function (item) { return item.id === inquiry.counselor.id; }) || (state.staff || []).find(function (item) { return item.role === "COUNSELOR" && item.active; });
        setWorkflow(inquiry, { currentOwnerRole: "COUNSELOR", currentOwnerId: reopenCounselor && reopenCounselor.id, currentOwnerName: reopenCounselor ? reopenCounselor.name : "상담사 배정 중", nextActorRole: "COUNSELOR", nextAction: "이전 상담·방문 결과와 고객 미해결 답변을 확인해 후속 조치를 결정합니다.", customerActionRequired: false, routingDecision: "COUNSEL", routingReason: "처리 후 고객 미해결 확인", verificationStatus: inquiry.risk === "DANGER" ? "BLOCKED" : "PENDING" });
        setUsageGuidance(inquiry, { status: inquiry.risk === "DANGER" ? "FULL_STOP" : "PENDING_REVIEW", label: inquiry.risk === "DANGER" ? "제품 전체 사용 중지 유지" : "후속 상담 확인 중", scope: inquiry.risk === "DANGER" ? "제품 전체" : "확인 중", reason: "고객이 증상 미해결을 알려 후속 상담으로 다시 연결했습니다.", nextAction: "이전 안내를 임의로 반복하지 말고 상담사의 확인을 기다려 주세요.", ruleId: inquiry.risk === "DANGER" ? "SAFE-LEAK-02" : null });
        timeline(inquiry, "고객 · " + (actorName || "시연 고객"), "WAITING_COUNSEL", "증상이 해결되지 않아 문의를 다시 열었습니다.", "후속 상담 요청");
        notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "inquiries" }, { eventType: "CASE_REOPENED", tone: "info", title: "문의가 다시 상담사에게 연결됐어요", message: "이전 상담·방문·서명 이력을 그대로 유지해 전달했습니다.", inquiryId: inquiry.id, actor: actorName || customerName(state, inquiry.customerId), dedupeKey: "CASE-REOPENED-CUSTOMER:" + inquiry.id + ":" + inquiry.updatedAt });
        notify(state, { role: "COUNSELOR", id: reopenCounselor && reopenCounselor.id, view: "queue" }, { eventType: "CASE_REOPENED", tone: "warning", title: "처리 후 미해결 문의가 다시 열렸습니다", message: customerName(state, inquiry.customerId) + " 고객의 이전 작업 결과와 서명을 확인해 주세요.", inquiryId: inquiry.id, actor: actorName || customerName(state, inquiry.customerId), dedupeKey: "CASE-REOPENED-COUNSELOR:" + inquiry.id + ":" + inquiry.updatedAt });
        audit(state, actorName || "시연 고객", "고객", "문의 재개", inquiry.id, "미해결로 상담 재요청");
      }
    });
  }

  function completeInquiry(inquiryId, actor) {
    actor = actor || {};
    return transaction("COMPLETE_INQUIRY", function (state) {
      var inquiry = findInquiry(state, inquiryId);
      requireStatus(inquiry, ["COMPLETION_PENDING"], "고객 해결 확인 후 완료 대기 상태에서만 최종 완료할 수 있습니다.");
      var staff = requireStaff(state, actor.id, ["COUNSELOR", "ENGINEER"]);
      var assignedCounselor = inquiry.counselor && inquiry.counselor.id;
      var assignedEngineer = inquiry.visit && inquiry.visit.engineerId;
      if (staff.role === "COUNSELOR" && assignedCounselor && assignedCounselor !== staff.id) throw new Error("담당 상담사만 최종 완료할 수 있습니다.");
      if (staff.role === "ENGINEER" && assignedEngineer !== staff.id) throw new Error("배정된 방문기사만 최종 완료할 수 있습니다.");
      if (!inquiry.followUp || inquiry.followUp.resolved !== true) throw new Error("고객의 해결 확인이 필요합니다.");
      if (inquiry.completion && inquiry.completion.primaryRole === "ENGINEER" && (!inquiry.visit || !inquiry.visit.signature || inquiry.visit.status !== "COMPLETED")) throw new Error("방문 결과와 고객 서명이 먼저 저장되어야 합니다.");
      inquiry.status = "COMPLETED";
      inquiry.completion = Object.assign({}, inquiry.completion || {}, { status: "COMPLETED", finalizedAt: now(), finalizedBy: staff.id, finalizedByRole: staff.role });
      setWorkflow(inquiry, { currentOwnerRole: "SYSTEM", currentOwnerId: null, currentOwnerName: "처리 완료", nextActorRole: null, nextAction: "같은 증상이 다시 발생하면 이전 기록을 보존한 채 상담을 다시 요청할 수 있습니다.", customerActionRequired: false, routingDecision: "COMPLETED", routingReason: "고객 해결 확인 및 관계자 최종 완료", verificationStatus: "PASSED" });
      setUsageGuidance(inquiry, { status: "NORMAL_USE", label: "일반 사용 가능", scope: "제품 전체", reason: "고객 해결 확인과 담당자 최종 검토가 완료되었습니다.", nextAction: "같은 증상이 다시 나타나면 이전 문의에서 상담을 다시 요청해 주세요.", ruleId: null });
      timeline(inquiry, (staff.role === "ENGINEER" ? "방문기사 · " : "상담사 · ") + staff.name, "COMPLETED", "문의 처리를 최종 완료했습니다.", "고객 해결 확인과 처리 기록 검토 완료");
      releaseProductSafetyHoldIfClear(state, inquiry.productId);
      notify(state, { role: "CUSTOMER", id: inquiry.customerId, view: "inquiries" }, { eventType: "CASE_COMPLETED", tone: "success", title: "문의 처리가 완료됐어요", message: staff.name + " 담당자가 처리 기록을 최종 확인했습니다.", inquiryId: inquiry.id, actor: staff.name, dedupeKey: "CASE-COMPLETED-CUSTOMER:" + inquiry.id });
      var operator = (state.staff || []).find(function (item) { return item.role === "OPERATOR" && item.active; });
      if (operator) notify(state, { role: "OPERATOR", id: operator.id, view: "audit" }, { eventType: "CASE_COMPLETED", tone: "success", title: "문의 최종 완료", message: inquiry.id + " · " + staff.name + " 최종 처리", inquiryId: inquiry.id, actor: staff.name, dedupeKey: "CASE-COMPLETED-OPERATOR:" + inquiry.id });
      audit(state, staff.name, staff.role === "ENGINEER" ? "방문기사" : "상담사", "문의 최종 완료", inquiry.id, "고객 해결 확인 후 최종 상태 전환");
      operation(state, "USER_ACTION", "SUCCESS", inquiry.id, "관계자 최종 완료", 0, { actorRole: staff.role, actorId: staff.id, previousStatus: "COMPLETION_PENDING", nextStatus: "COMPLETED" });
    });
  }

  function refreshDueQuestionnaires(referenceTime) {
    var reference = referenceTime ? new Date(referenceTime) : new Date();
    if (Number.isNaN(reference.getTime())) throw new Error("문진 생성 기준일이 올바르지 않습니다.");
    return transaction("REFRESH_QUESTIONNAIRES", function (state) {
      var changed = false;
      var leadDays = Number(CONFIG.questionnaire && CONFIG.questionnaire.generationLeadDays || 7);
      (state.products || []).forEach(function (product) {
        var questionnaire = ensureQuestionnaireCycle(state, product);
        if (!questionnaire || questionnaire.status !== "NOT_DUE" || !product.nextCareAt) return;
        var threshold = new Date(product.nextCareAt + "T00:00:00+09:00");
        threshold.setDate(threshold.getDate() - leadDays);
        if (reference.getTime() < threshold.getTime()) return;
        questionnaire.status = "READY";
        questionnaire.generatedAt = reference.toISOString();
        questionnaire.dueAt = product.nextCareAt;
        questionnaire.version = (CONFIG.questionnaire && CONFIG.questionnaire.version) || "PRE_VISIT_V2";
        questionnaire.answers = {};
        syncLegacyQuestionnaire(state, questionnaire);
        notify(state, { role: "CUSTOMER", id: product.customerId, view: "care" }, { eventType: "QUESTIONNAIRE_READY", tone: "info", title: "방문 전 사전 문진이 도착했어요", message: product.modelLabel + " · " + product.nextCareAt + " 케어 전 상태를 알려주세요.", actor: "케어 일정", dedupeKey: "QUESTIONNAIRE-READY:" + questionnaire.id });
        operation(state, "USER_ACTION", "SUCCESS", questionnaire.id, "케어 기준일 도달로 문진 자동 생성", 0, { actorRole: "SYSTEM", productId: product.id });
        changed = true;
      });
      if (!changed) return false;
    });
  }

  function saveProduct(payload, actor) {
    payload = payload || {};
    actor = actor || {};
    var required = ["customerId", "modelId", "startedAt", "managementType", "lastReplacementAt", "installedArea"];
    required.forEach(function (field) { if (!String(payload[field] || "").trim()) throw new Error("제품 등록 필수 정보를 모두 입력해 주세요."); });
    if (["방문관리형", "셀프관리형"].indexOf(payload.managementType) < 0) throw new Error("올바른 관리 유형을 선택해 주세요.");
    if (Number.isNaN(new Date(payload.startedAt + "T00:00:00").getTime()) || Number.isNaN(new Date(payload.lastReplacementAt + "T00:00:00").getTime())) throw new Error("제품 날짜 형식이 올바르지 않습니다.");
    if (new Date(payload.lastReplacementAt) < new Date(payload.startedAt)) throw new Error("최근 필터·카트리지 교체일은 사용 시작일 이후여야 합니다.");
    var savedId = payload.id || null;
    var requestId = payload.requestId || null;
    var requestKey = requestId ? payload.customerId + ":" + requestId : null;
    var requestFingerprint = JSON.stringify({ id: payload.id || null, customerId: payload.customerId, modelId: payload.modelId, startedAt: payload.startedAt, managementType: payload.managementType, lastReplacementAt: payload.lastReplacementAt, installedArea: String(payload.installedArea).trim(), siteId: payload.siteId || null, assetTag: payload.assetTag || null });
    transaction(payload.id ? "UPDATE_PRODUCT" : "CREATE_PRODUCT", function (state) {
      if (actor.role !== "CUSTOMER" || actor.id !== payload.customerId) throw new Error("본인 계정의 제품만 등록하거나 수정할 수 있습니다.");
      var priorRequest = requestKey && state.meta.productRequestIds[requestKey];
      if (priorRequest) {
        if (priorRequest.fingerprint && priorRequest.fingerprint !== requestFingerprint) throw new Error("같은 요청 식별값에 다른 제품 정보를 재사용할 수 없습니다.");
        savedId = priorRequest.productId || priorRequest;
        return false;
      }
      var customer = (state.customers || []).find(function (item) { return item.id === payload.customerId; });
      if (!customer) throw new Error("고객 정보를 찾을 수 없습니다.");
      var model = (state.productModels || []).find(function (item) { return item.id === payload.modelId; });
      if (!model) throw new Error("등록 가능한 제품 모델을 선택해 주세요.");
      if (payload.siteId) {
        var organization = (state.organizations || []).find(function (item) { return item.customerId === customer.id; });
        var site = (state.sites || []).find(function (item) { return item.id === payload.siteId && organization && item.organizationId === organization.id; });
        if (!site) throw new Error("현재 기업 고객에게 연결된 사업장만 선택할 수 있습니다.");
      }
      var existing = payload.id ? findProduct(state, payload.id) : null;
      if (existing) requireCustomerProduct(existing, actor.id);
      if (!existing) {
        var numericIds = (state.products || []).map(function (item) { return Number(String(item.id).replace(/\D/g, "")) || 0; });
        savedId = "PROD-" + String(Math.max.apply(null, numericIds.concat([0])) + 1).padStart(3, "0");
        existing = { id: savedId, subscriptionId: "SUB-" + savedId.replace(/^PROD-/, ""), customerId: customer.id, status: "ACTIVE", serial: "DEMO-NEW-" + String(Date.now()), careHistory: [], filterLife: 100, careState: "NORMAL" };
        state.products.push(existing);
      }
      var before = { modelId: existing.modelId || null, startedAt: existing.startedAt || null, managementType: existing.managementType || null, lastReplacementAt: existing.lastReplacementAt || null, nextCareAt: existing.nextCareAt || null };
      existing.modelId = model.id;
      existing.model = model.modelCode;
      existing.modelLabel = model.name;
      existing.startedAt = payload.startedAt;
      existing.managementType = payload.managementType;
      existing.lastReplacementAt = payload.lastReplacementAt;
      existing.lastCareAt = payload.lastReplacementAt;
      existing.nextCareAt = addMonths(payload.lastReplacementAt, 4);
      existing.cycleMonths = 4;
      existing.installedArea = String(payload.installedArea).trim();
      existing.siteId = payload.siteId || null;
      existing.assetTag = String(payload.assetTag || existing.assetTag || "").trim() || null;
      existing.filterLabel = model.capabilities && model.capabilities.ice ? "복합 필터" : "카트리지 세트";
      existing.careHistory = existing.careHistory || [];
      existing.subscriptionId = existing.subscriptionId || "SUB-" + existing.id.replace(/^PROD-/, "");
      var questionnaire = ensureQuestionnaireCycle(state, existing);
      if (!customer.productId) customer.productId = existing.id;
      if (requestKey) state.meta.productRequestIds[requestKey] = { productId: existing.id, customerId: customer.id, fingerprint: requestFingerprint, createdAt: now() };
      syncLegacyQuestionnaire(state, questionnaire);
      var action = payload.id ? "제품 정보 수정" : "제품 등록";
      audit(state, customer.name, "고객", action, existing.id, JSON.stringify({ before: before, after: { modelId: existing.modelId, startedAt: existing.startedAt, managementType: existing.managementType, lastReplacementAt: existing.lastReplacementAt, nextCareAt: existing.nextCareAt } }));
      operation(state, "USER_ACTION", "SUCCESS", existing.id, action, 0, { actorRole: "CUSTOMER", actorId: customer.id, requestId: requestId });
    });
    return savedId;
  }

  function submitQuestionnaire(customerId, productId, answers, actor) {
    answers = answers || {};
    actor = actor || {};
    var requiredFields = (CONFIG.questionnaire && CONFIG.questionnaire.requiredFields) || ["flow", "leak", "taste", "temperature", "performedActions"];
    requiredFields.forEach(function (field) { if (!String(answers[field] || "").trim()) throw new Error("사전 문진의 모든 필수 항목에 답변해 주세요."); });
    return transaction("SUBMIT_QUESTIONNAIRE", function (state) {
      var customer = state.customers.find(function (item) { return item.id === customerId; });
      if (!customer) throw new Error("고객 정보를 찾을 수 없습니다.");
      if (actor.role !== "CUSTOMER" || actor.id !== customerId) throw new Error("본인 제품의 사전 문진만 제출할 수 있습니다.");
      var product = findProduct(state, productId);
      requireCustomerProduct(product, customerId);
      var questionnaire = questionnaireForProduct(state, productId);
      if (!questionnaire || questionnaire.status !== "READY") {
        if (questionnaire && questionnaire.status === "SUBMITTED") return false;
        throw new Error("현재 제출 가능한 사전 문진이 없습니다.");
      }
      questionnaire.status = "SUBMITTED";
      questionnaire.submittedAt = now();
      questionnaire.answers = clone(answers);
      var questionnaireVisit = (state.inquiries || []).find(function (item) { return item.customerId === customerId && item.productId === productId && item.status === "VISIT_SCHEDULED" && item.visit; });
      if (questionnaireVisit) questionnaire.inquiryId = questionnaireVisit.id;
      syncLegacyQuestionnaire(state, questionnaire);
      var questionnaireRecipient = questionnaireVisit && (state.staff || []).find(function (item) { return item.id === questionnaireVisit.visit.engineerId; });
      if (questionnaireRecipient) {
        notify(state, { role: "ENGINEER", id: questionnaireRecipient.id, view: "visits" }, { eventType: "QUESTIONNAIRE_SUBMITTED", tone: "info", title: "방문 전 문진이 제출됐습니다", message: customer.name + " 고객의 출수·누수·물맛·온도·기수행 조치를 확인해 주세요.", inquiryId: questionnaireVisit.id, actor: customer.name, dedupeKey: "QUESTIONNAIRE:" + questionnaire.id + ":" + questionnaire.submittedAt });
      } else {
        var questionnaireCounselor = (state.staff || []).find(function (item) { return item.role === "COUNSELOR" && item.active; });
        notify(state, { role: "COUNSELOR", id: questionnaireCounselor && questionnaireCounselor.id, view: "queue" }, { eventType: "QUESTIONNAIRE_SUBMITTED", tone: "info", title: "고객 사전 문진이 제출됐습니다", message: customer.name + " 고객의 " + product.model + " 문진 답변이 제품 정보에 반영되었습니다.", actor: customer.name, dedupeKey: "QUESTIONNAIRE:" + questionnaire.id + ":" + questionnaire.submittedAt });
      }
      audit(state, customer.name, "고객", "사전 문진 제출", product.id, "출수·누수·물맛·냉온수·기수행 조치 저장");
      operation(state, "USER_ACTION", "SUCCESS", questionnaire.id, "사전 문진 5개 필수 항목 제출", 0, { actorRole: "CUSTOMER", actorId: customer.id, productId: product.id });
    });
  }

  function enableSmartPreparation(productId, actorName) {
    return transaction("ENABLE_SMART_PREPARATION", function (state) {
      findProduct(state, productId);
      var profile = findSmartPreparationProfile(state, productId);
      var timestamp = now();
      profile.consent = profile.consent || {};
      profile.consent.usageAnalysis = "GRANTED";
      profile.consent.autoPreparation = "GRANTED";
      profile.consent.decidedAt = timestamp;
      profile.consent.actor = actorName || "시연 고객";
      profile.mode = "AUTO";
      profile.learning = profile.learning || { sampleDays: 0, patterns: [] };
      if (!profile.learning.patterns || !profile.learning.patterns.length) profile.learning.status = "LEARNING";
      audit(state, actorName || "시연 고객", "고객", "AI 사용 패턴 분석·자동 준비 동의", productId, "스마트 준비 모드 활성화");
    });
  }

  function setSmartPreparationMode(productId, mode, actorName) {
    if (["AUTO", "MANUAL"].indexOf(mode) < 0) throw new Error("자동 또는 직접 설정 모드를 선택해 주세요.");
    return transaction("SET_SMART_PREPARATION_MODE", function (state) {
      findProduct(state, productId);
      var profile = findSmartPreparationProfile(state, productId);
      if (mode === "AUTO" && (!profile.consent || profile.consent.usageAnalysis !== "GRANTED" || profile.consent.autoPreparation !== "GRANTED")) {
        throw new Error("사용 패턴 분석과 자동 준비 동의 후 AI 자동 모드를 사용할 수 있습니다.");
      }
      if (profile.mode === mode) return false;
      profile.mode = mode;
      audit(state, actorName || "시연 고객", "고객", "스마트 준비 모드 변경", productId, mode === "AUTO" ? "AI 자동 준비" : "직접 설정");
    });
  }

  function saveManualPreparation(productId, payload, actorName) {
    payload = payload || {};
    var readyAt = String(payload.readyAt || "");
    var leadMinutes = Number(payload.leadMinutes || 10);
    var allowedDays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    var days = Array.isArray(payload.days) ? payload.days.filter(function (day, index, array) { return allowedDays.indexOf(day) >= 0 && array.indexOf(day) === index; }) : [];
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(readyAt)) throw new Error("준비 완료 시간을 선택해 주세요.");
    if (!days.length) throw new Error("반복 요일을 한 개 이상 선택해 주세요.");
    if (!Number.isInteger(leadMinutes) || leadMinutes < 5 || leadMinutes > 60) throw new Error("준비 시작 간격은 5분에서 60분 사이여야 합니다.");
    return transaction("SAVE_MANUAL_PREPARATION", function (state) {
      var support = requireSmartResourceSupport(state, productId, payload.resource);
      if (support.product.status === "SAFETY_HOLD") throw new Error("안전 점검 중인 제품은 준비 설정을 변경할 수 없습니다.");
      var profile = findSmartPreparationProfile(state, productId);
      profile.manualSchedules = profile.manualSchedules || [];
      var schedule = payload.scheduleId ? profile.manualSchedules.find(function (item) { return item.id === payload.scheduleId; }) : null;
      if (!schedule) {
        schedule = { id: "SCH-" + String(Date.now()) + "-" + String(profile.manualSchedules.length + 1), createdAt: now() };
        profile.manualSchedules.push(schedule);
      }
      schedule.resource = payload.resource;
      schedule.days = days;
      schedule.daysLabel = smartDaysLabel(days);
      schedule.readyAt = readyAt;
      schedule.leadMinutes = leadMinutes;
      schedule.enabled = true;
      schedule.updatedAt = now();
      profile.mode = "MANUAL";
      audit(state, actorName || "시연 고객", "고객", "직접 준비 시간 저장", productId, support.meta.label + " · " + schedule.daysLabel + " " + readyAt);
    });
  }

  function removeManualPreparation(productId, scheduleId, actorName) {
    return transaction("REMOVE_MANUAL_PREPARATION", function (state) {
      findProduct(state, productId);
      var profile = findSmartPreparationProfile(state, productId);
      var schedules = profile.manualSchedules || [];
      var schedule = schedules.find(function (item) { return item.id === scheduleId; });
      if (!schedule) throw new Error("삭제할 직접 설정을 찾을 수 없습니다.");
      profile.manualSchedules = schedules.filter(function (item) { return item.id !== scheduleId; });
      audit(state, actorName || "시연 고객", "고객", "직접 준비 시간 삭제", productId, schedule.daysLabel + " " + schedule.readyAt);
    });
  }

  function getEffectiveSmartPreparation(productId) {
    var state = read();
    var product = findProduct(state, productId);
    var profile = findSmartPreparationProfile(state, productId);
    if (product.status === "SAFETY_HOLD") return { status: "BLOCKED_SAFETY", mode: profile.mode };
    if (profile.mode === "AUTO" && profile.consent && profile.consent.usageAnalysis === "GRANTED" && profile.consent.autoPreparation === "GRANTED") {
      return { status: profile.learning && profile.learning.status === "LEARNING" ? "LEARNING" : "AUTO", mode: profile.mode };
    }
    return { status: "MANUAL", mode: profile.mode };
  }

  function canAccessInquiry(inquiryId, actor) {
    actor = actor || {};
    var state = read();
    var inquiry = (state.inquiries || []).find(function (item) { return item.id === inquiryId; });
    if (!inquiry) return false;
    if (actor.role === "CUSTOMER") return inquiry.customerId === actor.id;
    if (actor.role === "ENGINEER") return Boolean(inquiry.visit && inquiry.visit.engineerId === actor.id);
    if (actor.role === "COUNSELOR" || actor.role === "OPERATOR") return Boolean((state.staff || []).some(function (item) { return item.id === actor.id && item.role === actor.role && item.active; }));
    return false;
  }

  function detectOperationalExceptions(referenceTime) {
    var state = read();
    var reference = referenceTime ? new Date(referenceTime) : new Date();
    var detectedAt = reference.toISOString();
    var rows = [];
    (state.products || []).forEach(function (product) {
      if (!product.nextCareAt) rows.push({ type: "CARE_DATE_UNCALCULATED", targetId: product.id, reason: "다음 케어 일정이 산정되지 않았습니다.", lastStage: "PRODUCT", detectedAt: detectedAt, ownerRole: "OPERATOR" });
    });
    (state.questionnaires || []).forEach(function (item) {
      if (item.status === "READY" && item.dueAt && new Date(item.dueAt + "T23:59:59").getTime() < reference.getTime()) rows.push({ type: "QUESTIONNAIRE_OVERDUE", targetId: item.id, reason: "문진 마감일까지 제출되지 않았습니다.", lastStage: "QUESTIONNAIRE_READY", detectedAt: detectedAt, ownerRole: "CUSTOMER" });
    });
    (state.inquiries || []).forEach(function (inquiry) {
      var ageHours = (reference.getTime() - new Date(inquiry.updatedAt).getTime()) / 3600000;
      if (inquiry.status !== "COMPLETED" && ageHours >= 48) rows.push({ type: "PROCESSING_DELAY", targetId: inquiry.id, inquiryId: inquiry.id, reason: "마지막 변경 후 48시간 이상 경과했습니다.", lastStage: inquiry.status, detectedAt: detectedAt, ownerRole: inquiry.workflow && inquiry.workflow.currentOwnerRole || "OPERATOR" });
      if (inquiry.workflow && inquiry.workflow.evidenceStatus === "NOT_FOUND") rows.push({ type: "EVIDENCE_NOT_FOUND", targetId: inquiry.id, inquiryId: inquiry.id, reason: "모델·증상에 맞는 승인 근거가 없습니다.", lastStage: inquiry.status, detectedAt: detectedAt, ownerRole: "COUNSELOR" });
      if (inquiry.processingFailure && inquiry.processingFailure.status === "FAILED") rows.push({ type: "PROCESSING_FAILURE", targetId: inquiry.id, inquiryId: inquiry.id, reason: inquiry.processingFailure.type + " · " + inquiry.processingFailure.reason, lastStage: inquiry.status, detectedAt: detectedAt, ownerRole: inquiry.workflow && inquiry.workflow.currentOwnerRole || "OPERATOR" });
    });
    return rows;
  }

  function reset() {
    var state = seedState();
    storageSet(state);
    emit("RESET", state);
    return clone(state);
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return function () {};
    listeners.push(listener);
    return function () { listeners = listeners.filter(function (item) { return item !== listener; }); };
  }

  if (typeof window.BroadcastChannel === "function") {
    try {
      channel = new window.BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = function (event) {
        if (event && event.data && event.data.type === "STATE_CHANGED") {
          var state = read();
          listeners.forEach(function (listener) { listener(clone(state), "REMOTE_UPDATE"); });
        }
      };
    } catch (error) { channel = null; }
  }

  if (window.addEventListener) {
    window.addEventListener("storage", function (event) {
      if (event.key === STORAGE_KEY) {
        var state = read();
        listeners.forEach(function (listener) { listener(clone(state), "STORAGE_UPDATE"); });
      }
    });
  }

  window.WaterCareStore = {
    STORAGE_KEY: STORAGE_KEY,
    CHANNEL_NAME: CHANNEL_NAME,
    getState: read,
    reset: reset,
    subscribe: subscribe,
    createInquiry: createInquiry,
    answerAdditionalQuestions: answerAdditionalQuestions,
    recordProcessingFailure: recordProcessingFailure,
    retryProcessing: retryProcessing,
    setActionResult: setActionResult,
    requestCounsel: requestCounsel,
    startCounsel: startCounsel,
    saveCounselNote: saveCounselNote,
    resolveCounsel: resolveCounsel,
    scheduleVisit: scheduleVisit,
    updateVisitSchedule: updateVisitSchedule,
    requestVisitReschedule: requestVisitReschedule,
    resolveVisitReschedule: resolveVisitReschedule,
    completeVisit: completeVisit,
    confirmResolution: confirmResolution,
    completeInquiry: completeInquiry,
    saveProduct: saveProduct,
    refreshDueQuestionnaires: refreshDueQuestionnaires,
    submitQuestionnaire: submitQuestionnaire,
    markNotificationRead: markNotificationRead,
    markAllNotificationsRead: markAllNotificationsRead,
    enableSmartPreparation: enableSmartPreparation,
    setSmartPreparationMode: setSmartPreparationMode,
    saveManualPreparation: saveManualPreparation,
    removeManualPreparation: removeManualPreparation,
    getEffectiveSmartPreparation: getEffectiveSmartPreparation,
    canAccessInquiry: canAccessInquiry,
    validateInquirySchema: function (inquiryId) { var state = read(); return validateStructuredInquiry(findInquiry(state, inquiryId)); },
    detectOperationalExceptions: detectOperationalExceptions
  };
})();
