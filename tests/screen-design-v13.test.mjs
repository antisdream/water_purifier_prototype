import assert from "node:assert/strict";
import { bootRuntime, read } from "./runtime-helper.mjs";

const EVIDENCE_CARD_FIELDS = [
  "evidenceId", "chunkId", "documentId", "documentTitle", "documentVersion", "pageRefs",
  "sectionTitle", "evidenceSummary", "sourceType", "provider", "riskLevel",
  "requiresConsultation", "safeActions", "escalationConditions", "prohibitedActions",
  "verificationStatus", "sourceLandingUrl", "sourceDirectDownloadUrl", "productCode",
  "manualModel", "productGeneration", "modelFamily", "scopeRole", "dataClassification"
];

const actors = {
  customer1: { role: "CUSTOMER", id: "DEMO-CUST-001", name: "합성 고객 001" },
  customer4: { role: "CUSTOMER", id: "DEMO-CUST-004", name: "합성 고객 004" },
  customer5: { role: "CUSTOMER", id: "DEMO-CUST-005", name: "합성 고객 005" },
  customer6: { role: "CUSTOMER", id: "DEMO-CUST-006", name: "합성 고객 006" },
  customer7: { role: "CUSTOMER", id: "DEMO-CUST-007", name: "합성 고객 007" },
  counselor: { role: "COUNSELOR", id: "STAFF-CONS-01", name: "한유진" },
  otherCounselor: { role: "COUNSELOR", id: "STAFF-CONS-02", name: "김민서" },
  technician: { role: "TECHNICIAN", id: "STAFF-TECH-01", name: "오세훈" },
  otherTechnician: { role: "TECHNICIAN", id: "STAFF-TECH-02", name: "이도윤" },
  operator: { role: "OPERATOR", id: "STAFF-OPER-01", name: "장민서" }
};

let sequence = 0;
function requestMeta(prefix) {
  sequence += 1;
  return {
    idempotencyKey: `V13-${prefix}-${sequence}`,
    correlationId: `CORR-V13-${prefix}-${sequence}`
  };
}

function inquiry(store, inquiryId) {
  return store.getState().inquiries.find((item) => item.id === inquiryId);
}

function visit(store, inquiryId) {
  return store.getState().visits.find((item) => item.inquiryId === inquiryId && item.status !== "CANCELLED");
}

function eventPayload(inquiryValue, prefix, values = {}) {
  return {
    ...values,
    inquiryId: inquiryValue.id,
    stateVersion: inquiryValue.stateVersion,
    ...requestMeta(prefix)
  };
}

function expectCode(action, code) {
  assert.throws(action, (error) => error && error.code === code);
}

// 1. v13 스키마와 모델 정책: removed_legacy 모델은 레지스트리와 저장소에 남기지 않는다.
{
  const runtime = bootRuntime();
  assert.equal(runtime.WaterCareConfig.schemaVersion, "SCREEN-DESIGN-V13");
  assert.equal(runtime.WaterCareConfig.seedRevision, 6);
  assert.ok(
    runtime.WaterCareConfig.modelRegistry.every((item) => !/IAC506/.test(`${item.productCode} ${item.manualModel}`)),
    "IAC506 must not be retained as an active/archive registry record"
  );

  for (const productCode of ["WPUIAC506", "WPU-IAC506"]) {
    const store = bootRuntime().WaterCareStore;
    const before = store.getState().products.length;
    expectCode(() => store.dispatch("REGISTER_PRODUCT", {
      productCode,
      manualModel: "WPU-IAC506",
      modelName: "금지된 레거시 모델",
      ...requestMeta("legacy-model")
    }, actors.customer6), "MODEL-LEGACY-01");
    assert.equal(store.getState().products.length, before, "IAC506 rejection must not persist a product record");
  }
}

// 2. State Machine 응답 계약: 역할·담당자에 따라 allowedActions를 반환한다.
{
  const store = bootRuntime().WaterCareStore;
  assert.equal(typeof store.getAllowedActions, "function");
  assert.equal(typeof store.getInquiryView, "function");

  const counselorActions = Array.from(store.getAllowedActions("DEMO-INQ-003", actors.counselor));
  for (const action of [
    "UPDATE_CONSULTATION_SUMMARY", "CONFIRM_CONSULTATION_SUMMARY",
    "CONSULTATION_COMPLETED", "VISIT_REVIEW_REQUIRED"
  ]) assert.ok(counselorActions.includes(action), `assigned counselor action: ${action}`);
  assert.deepEqual(Array.from(store.getAllowedActions("DEMO-INQ-003", actors.otherCounselor)), []);

  const technicianActions = Array.from(store.getAllowedActions("DEMO-INQ-004", actors.technician));
  for (const action of ["UPDATE_PREVISIT_REPORT", "CONFIRM_PREVISIT_REPORT", "START_VISIT"])
    assert.ok(technicianActions.includes(action), `assigned technician action: ${action}`);
  assert.deepEqual(Array.from(store.getAllowedActions("DEMO-INQ-004", actors.otherTechnician)), []);
  assert.deepEqual(Array.from(store.getAllowedActions("DEMO-INQ-004", actors.operator)), []);

  const customerActions = Array.from(store.getAllowedActions("DEMO-INQ-004", actors.customer4));
  assert.ok(!customerActions.includes("REQUEST_VISIT_RESCHEDULE"), "v13 excludes customer visit reschedule action");
  assert.throws(() => store.dispatch("REQUEST_VISIT_RESCHEDULE", eventPayload(
    inquiry(store, "DEMO-INQ-004"),
    "removed-reschedule",
    { visitId: "DEMO-VISIT-004", reason: "일정 변경", preferredAt: "2026-07-30T14:00:00+09:00" }
  ), actors.customer4));
}

// 3. InquiryView는 currentState/nextStep/allowedActions와 24필드 EvidenceCardDTO를 제공한다.
{
  const store = bootRuntime().WaterCareStore;
  const view = store.getInquiryView("DEMO-INQ-004", actors.customer4);
  assert.equal(view.inquiry.id, "DEMO-INQ-004");
  assert.equal(view.currentState, inquiry(store, "DEMO-INQ-004").status);
  assert.equal(view.currentAssigneeType, "TECHNICIAN");
  assert.equal(typeof view.nextStep, "string");
  assert.ok(Object.prototype.hasOwnProperty.call(view, "customerActionRequired"));
  assert.ok(!Number.isNaN(Date.parse(view.lastStatusChangedAt)));
  assert.ok(Array.isArray(view.allowedActions));
  assert.deepEqual(Array.from(view.allowedActions), Array.from(store.getAllowedActions("DEMO-INQ-004", actors.customer4)));
  assert.ok(Array.isArray(view.evidenceCards) && view.evidenceCards.length > 0);

  for (const card of view.evidenceCards) {
    assert.deepEqual(Object.keys(card).sort(), EVIDENCE_CARD_FIELDS.slice().sort());
    for (const field of EVIDENCE_CARD_FIELDS) assert.ok(Object.prototype.hasOwnProperty.call(card, field), field);
    assert.ok(!Object.prototype.hasOwnProperty.call(card, "sourcePath"));
    assert.ok(!Object.prototype.hasOwnProperty.call(card, "text"));
    assert.ok(!Object.prototype.hasOwnProperty.call(card, "applicability"));
    assert.ok(!Object.prototype.hasOwnProperty.call(card, "allowedUse"));
  }
}

// 4. 재개 문의는 RESUME_CONSULTATION으로 대기 상태를 거친 뒤 상담을 시작한다.
{
  const store = bootRuntime().WaterCareStore;
  let target = inquiry(store, "DEMO-INQ-005");
  store.dispatch("CUSTOMER_REPORTED_UNRESOLVED", eventPayload(target, "unresolved", {
    resolved: false,
    comment: "냄새가 다시 느껴집니다."
  }), actors.customer5);
  target = inquiry(store, target.id);
  assert.equal(target.status, "REOPENED");
  assert.ok(Array.from(store.getAllowedActions(target.id, actors.counselor)).includes("RESUME_CONSULTATION"));
  assert.ok(!Array.from(store.getAllowedActions(target.id, actors.counselor)).includes("START_CONSULTATION"));

  store.dispatch("RESUME_CONSULTATION", eventPayload(target, "resume"), actors.counselor);
  target = inquiry(store, target.id);
  assert.equal(target.status, "CONSULTATION_REQUIRED");
  assert.ok(Array.from(store.getAllowedActions(target.id, actors.counselor)).includes("START_CONSULTATION"));
}

// 5. 상담 요약 수정·확정 명령은 원본과 상태를 보존하고 담당자 메타데이터를 기록한다.
{
  const store = bootRuntime().WaterCareStore;
  let target = inquiry(store, "DEMO-INQ-003");
  const original = target.aiSummaryOriginal;
  const initialStatus = target.status;
  const revisionText = "고객 원문과 공식 근거를 확인한 상담사 수정 요약입니다.";

  store.dispatch("UPDATE_CONSULTATION_SUMMARY", eventPayload(target, "summary-update", {
    text: revisionText
  }), actors.counselor);
  target = inquiry(store, target.id);
  assert.equal(target.status, initialStatus);
  assert.equal(target.aiSummaryOriginal, original);
  assert.equal(target.consultationSummaryRevision.text, revisionText);
  assert.equal(target.consultationSummaryRevision.editorId, actors.counselor.id);

  const beforeConfirmVersion = target.stateVersion;
  store.dispatch("CONFIRM_CONSULTATION_SUMMARY", eventPayload(target, "summary-confirm"), actors.counselor);
  target = inquiry(store, target.id);
  assert.equal(target.status, initialStatus);
  assert.ok(target.stateVersion > beforeConfirmVersion);
  assert.equal(target.confirmedConsultationSummary, revisionText);
  assert.equal(target.summaryConfirmedById, actors.counselor.id);
  assert.equal(target.summaryConfirmedBy, actors.counselor.name);
  assert.ok(!Number.isNaN(Date.parse(target.summaryConfirmedAt)));

  assert.throws(() => store.dispatch("UPDATE_CONSULTATION_SUMMARY", eventPayload(target, "summary-wrong-assignee", {
    text: "다른 상담사 수정"
  }), actors.otherCounselor));
}

// 6. 기사 사전 리포트 수정·확정 명령은 방문 상태를 바꾸지 않고 담당 기사만 수행한다.
{
  const store = bootRuntime().WaterCareStore;
  let targetInquiry = inquiry(store, "DEMO-INQ-004");
  let targetVisit = visit(store, targetInquiry.id);
  const inquiryStatus = targetInquiry.status;
  const visitStatus = targetVisit.status;
  const revisionText = "누수 위치, 원수 밸브, 전원 분리 상태를 현장에서 우선 확인합니다.";

  store.dispatch("UPDATE_PREVISIT_REPORT", eventPayload(targetInquiry, "previsit-update", {
    visitId: targetVisit.id,
    text: revisionText
  }), actors.technician);
  targetInquiry = inquiry(store, targetInquiry.id);
  targetVisit = visit(store, targetInquiry.id);
  assert.equal(targetInquiry.status, inquiryStatus);
  assert.equal(targetVisit.status, visitStatus);
  assert.equal(targetVisit.previsitReportRevision.text, revisionText);
  assert.equal(targetVisit.previsitReportRevision.editorId, actors.technician.id);

  store.dispatch("CONFIRM_PREVISIT_REPORT", eventPayload(targetInquiry, "previsit-confirm", {
    visitId: targetVisit.id
  }), actors.technician);
  targetInquiry = inquiry(store, targetInquiry.id);
  targetVisit = visit(store, targetInquiry.id);
  assert.equal(targetInquiry.status, inquiryStatus);
  assert.equal(targetVisit.status, visitStatus);
  assert.equal(targetVisit.confirmedPrevisitReport, revisionText);
  assert.equal(targetVisit.previsitReportConfirmedById, actors.technician.id);
  assert.equal(targetVisit.previsitReportConfirmedBy, actors.technician.name);
  assert.ok(!Number.isNaN(Date.parse(targetVisit.previsitReportConfirmedAt)));

  assert.throws(() => store.dispatch("UPDATE_PREVISIT_REPORT", eventPayload(targetInquiry, "previsit-wrong-assignee", {
    visitId: targetVisit.id,
    text: "다른 기사 수정"
  }), actors.otherTechnician));
}

// 7. 완료 정책은 경로별 최종 처리자 유형·ID·시각을 기록한다.
{
  const selfStore = bootRuntime().WaterCareStore;
  let result = selfStore.dispatch("START_INQUIRY", {
    productId: "DEMO-PROD-001",
    ...requestMeta("self-start")
  }, actors.customer1);
  let selfInquiry = inquiry(selfStore, result.result);
  selfStore.dispatch("SUBMIT_SYMPTOM", eventPayload(selfInquiry, "self-symptom", {
    symptomCodes: ["LOW_FLOW"],
    description: "평소보다 출수량이 줄었습니다.",
    conditions: "다른 수전을 끄고 확인했습니다.",
    answers: { flow: "LOW" }
  }), actors.customer1);
  selfInquiry = inquiry(selfStore, selfInquiry.id);
  selfStore.dispatch("CUSTOMER_REPORTED_SELF_RESOLVED", eventPayload(selfInquiry, "self-final", {
    actionResult: "RESOLVED",
    actionPerformed: true,
    performedAction: "다른 수전을 끄고 출수 상태를 다시 확인했습니다."
  }), actors.customer1);
  selfInquiry = inquiry(selfStore, selfInquiry.id);
  assert.equal(selfInquiry.status, "RESOLVED");
  assert.equal(selfInquiry.finalizedByType, "customer_self");
  assert.equal(selfInquiry.finalizedById, actors.customer1.id);
  assert.ok(!Number.isNaN(Date.parse(selfInquiry.finalizedAt)));

  const counselStore = bootRuntime().WaterCareStore;
  let counselInquiry = inquiry(counselStore, "DEMO-INQ-005");
  counselStore.dispatch("SUBMIT_RESOLUTION_FEEDBACK", eventPayload(counselInquiry, "counsel-feedback", {
    resolved: true,
    comment: "문제가 해결되었습니다."
  }), actors.customer5);
  counselInquiry = inquiry(counselStore, counselInquiry.id);
  assert.equal(counselInquiry.status, "COMPLETION_PENDING");
  counselStore.dispatch("FINALIZE_INQUIRY", eventPayload(counselInquiry, "counsel-final"), actors.counselor);
  counselInquiry = inquiry(counselStore, counselInquiry.id);
  assert.equal(counselInquiry.finalizedByType, "counselor");
  assert.equal(counselInquiry.finalizedById, actors.counselor.id);
  assert.ok(!Number.isNaN(Date.parse(counselInquiry.finalizedAt)));

  const visitStore = bootRuntime().WaterCareStore;
  let visitInquiry = inquiry(visitStore, "DEMO-INQ-006");
  visitStore.dispatch("FINALIZE_INQUIRY", eventPayload(visitInquiry, "visit-final"), actors.technician);
  visitInquiry = inquiry(visitStore, visitInquiry.id);
  assert.equal(visitInquiry.finalizedByType, "engineer");
  assert.equal(visitInquiry.finalizedById, actors.technician.id);
  assert.ok(!Number.isNaN(Date.parse(visitInquiry.finalizedAt)));
}

// 8. correlationId는 처리 결과, 상태 이력, 감사 로그와 AI 처리에 같은 값으로 연결된다.
{
  const store = bootRuntime().WaterCareStore;
  const startMeta = requestMeta("correlation-start");
  const result = store.dispatch("START_INQUIRY", {
    productId: "DEMO-PROD-001",
    ...startMeta
  }, actors.customer1);
  let target = inquiry(store, result.result);
  assert.equal(result.correlationId, startMeta.correlationId);
  assert.ok(target.timeline.some((item) => item.event === "START_INQUIRY" && item.correlationId === startMeta.correlationId));
  assert.ok(store.getState().auditLog.some((item) => item.event === "START_INQUIRY" && item.targetId === target.id && item.correlationId === startMeta.correlationId));
  assert.equal(store.getState().processedEvents[startMeta.idempotencyKey].correlationId, startMeta.correlationId);

  const aiMeta = requestMeta("correlation-ai");
  store.dispatch("SUBMIT_SYMPTOM", {
    inquiryId: target.id,
    symptomCodes: ["LOW_FLOW"],
    description: "평소보다 출수량이 줄었습니다.",
    conditions: "다른 수전을 끄고 확인했습니다.",
    answers: { flow: "LOW" },
    stateVersion: target.stateVersion,
    ...aiMeta
  }, actors.customer1);
  target = inquiry(store, target.id);
  assert.equal(target.aiProcess.correlationId, aiMeta.correlationId);
  assert.ok(target.timeline.some((item) => item.event === "SAFE_GUIDANCE_READY" && item.correlationId === aiMeta.correlationId));
  assert.ok(store.getState().auditLog.some((item) => item.targetId === target.id && item.correlationId === aiMeta.correlationId));
}

// 9. 인증·배정·문의-방문 연결·동시성·멱등성 우회 호출을 Store가 차단한다.
{
  const store = bootRuntime().WaterCareStore;
  expectCode(() => store.getInquiryView("DEMO-INQ-001", null), "AUTH-REQUIRED-01");
  expectCode(() => store.getInquiryView("DEMO-INQ-001", actors.technician), "ACCESS-DENIED-01");
  expectCode(() => store.dispatch("UPDATE_PREVISIT_REPORT", {
    inquiryId: "DEMO-INQ-004", visitId: "DEMO-VISIT-006", text: "교차 변조 시도",
    stateVersion: inquiry(store, "DEMO-INQ-004").stateVersion, ...requestMeta("cross-visit")
  }, actors.technician), "STATE-CONFLICT-01");

  const started = store.dispatch("START_INQUIRY", { productId: "DEMO-PROD-001", ...requestMeta("contract-start") }, actors.customer1);
  const startedInquiry = inquiry(store, started.result);
  expectCode(() => store.dispatch("CANCEL_INQUIRY", {
    inquiryId: startedInquiry.id, ...requestMeta("missing-version")
  }, actors.customer1), "STATE-CONFLICT-01");
  expectCode(() => store.dispatch("SAVE_DRAFT", {
    inquiryId: startedInquiry.id, stateVersion: startedInquiry.stateVersion
  }, actors.customer1), "IDEMPOTENCY-REQUIRED-01");

  const replayMeta = requestMeta("principal-bound-replay");
  store.dispatch("SAVE_DRAFT", {
    inquiryId: startedInquiry.id, stateVersion: startedInquiry.stateVersion, description: "멱등 주체 검증", ...replayMeta
  }, actors.customer1);
  expectCode(() => store.dispatch("SAVE_DRAFT", {
    inquiryId: startedInquiry.id, stateVersion: startedInquiry.stateVersion, ...replayMeta
  }, actors.customer4), "ACCESS-DENIED-01");
}

// 10. 재방문은 재확정 전 시작할 수 없고, 케어 미반영 선택은 제품·이력을 변경하지 않는다.
{
  const followStore = bootRuntime().WaterCareStore;
  let target = inquiry(followStore, "DEMO-INQ-004");
  followStore.dispatch("START_VISIT", eventPayload(target, "follow-start", { visitId: "DEMO-VISIT-004", reconfirmed: true }), actors.technician);
  target = inquiry(followStore, target.id);
  followStore.dispatch("REVISIT_NEEDED", eventPayload(target, "follow-required", {
    visitId: "DEMO-VISIT-004", actualCause: "추가 수압 측정 필요", actions: "1차 연결부 점검",
    usageGuidanceStatus: "PENDING_CONSULTATION", usageGuidanceMessage: "추가 방문 전까지 사용 안내를 유지합니다.",
    guidanceBasis: "현장 1차 측정값 변동", nextAction: "추가 방문 일정 확인", revisitReason: "정밀 측정 장비 필요"
  }), actors.technician);
  target = inquiry(followStore, target.id);
  assert.equal(visit(followStore, target.id).status, "FOLLOW_UP_REQUIRED");
  assert.equal(visit(followStore, target.id).confirmedPrevisitReport, null);
  assert.ok(!Array.from(followStore.getAllowedActions(target.id, actors.technician)).includes("START_VISIT"));
  expectCode(() => followStore.dispatch("START_VISIT", eventPayload(target, "follow-bypass", {
    visitId: "DEMO-VISIT-004", reconfirmed: true
  }), actors.technician), "ALLOWED-ACTION-01");

  const careStore = bootRuntime().WaterCareStore;
  let careInquiry = inquiry(careStore, "DEMO-INQ-004");
  const careProductBefore = careStore.getState().products.find((item) => item.id === careInquiry.productId);
  const lastCareBefore = careProductBefore.lastCareAt;
  const historyCountBefore = careStore.getState().careHistory.length;
  careStore.dispatch("START_VISIT", eventPayload(careInquiry, "care-start", { visitId: "DEMO-VISIT-004", reconfirmed: true }), actors.technician);
  careInquiry = inquiry(careStore, careInquiry.id);
  careStore.dispatch("VISIT_COMPLETED", eventPayload(careInquiry, "care-no-apply", {
    visitId: "DEMO-VISIT-004", actualCause: "연결부 일시 결로", actions: "외관 점검과 주변 물기 제거",
    parts: "교체 부품 없음", usageGuidanceStatus: "NORMAL", usageGuidanceMessage: "일반 사용 가능",
    restrictedFunctions: [], guidanceBasis: "현장 점검 결과", nextAction: "재발 여부 관찰",
    careHistoryApplied: false, visitCompletedCareDate: "2026-07-22", filterReplaced: false,
    replacedFilterItems: [], nextCareDate: null, nextCareBasis: null, nextCareStatus: "CONFIRMATION_REQUIRED",
    signature: "합성 고객 004"
  }), actors.technician);
  const careVisit = visit(careStore, careInquiry.id);
  assert.equal(careVisit.result.careHistoryApplied, false);
  assert.equal(careVisit.careApplied, false);
  assert.equal(careStore.getState().products.find((item) => item.id === careInquiry.productId).lastCareAt, lastCareBefore);
  assert.equal(careStore.getState().careHistory.length, historyCountBefore);
}

// 11. 위험 근거 게이트, 제품 변경 재분석, AI 실패 재시도 한도를 실제 상태로 검증한다.
{
  const runtime = bootRuntime();
  const dangerState = runtime.WaterCareStore.getState();
  dangerState.evidenceRegistry = [];
  const dangerResult = runtime.WaterCareAIRAGSimulator.run(
    dangerState,
    dangerState.inquiries.find((item) => item.id === "DEMO-INQ-004"),
    dangerState.products.find((item) => item.id === "DEMO-PROD-004"),
    { now: "2026-07-22T16:00:00+09:00", correlationId: "CORR-NO-EVIDENCE-DANGER" }
  );
  assert.equal(dangerResult.outcomeEvent, "NO_EVIDENCE");
  assert.equal(dangerResult.retrieval.verified, false);
  assert.ok(!dangerResult.trace.some((item) => item.stage === "GENERATING"));

  const modelStore = bootRuntime().WaterCareStore;
  const started = modelStore.dispatch("START_INQUIRY", { productId: "DEMO-PROD-001", ...requestMeta("model-reset-start") }, actors.customer1);
  let modelInquiry = inquiry(modelStore, started.result);
  modelStore.dispatch("SUBMIT_SYMPTOM", eventPayload(modelInquiry, "model-reset-guidance", {
    symptomCodes: ["LOW_FLOW"], description: "출수량이 줄었습니다.", conditions: "다른 수전은 정상입니다.", answers: { flow: "LOW" }
  }), actors.customer1);
  modelInquiry = inquiry(modelStore, modelInquiry.id);
  assert.equal(modelInquiry.status, "AI_GUIDANCE");
  modelStore.dispatch("PRODUCT_UPDATED", {
    productId: "DEMO-PROD-001", productCode: "WPUJAC104DWH", manualModel: "WPU-JCC104D", productGeneration: "D", ...requestMeta("model-reset-update")
  }, actors.customer1);
  modelInquiry = inquiry(modelStore, modelInquiry.id);
  assert.equal(modelInquiry.status, "DRAFT");
  assert.equal(modelInquiry.aiState, "IDLE");
  assert.deepEqual(Array.from(modelInquiry.evidenceIds), []);
  assert.ok(!Array.from(modelStore.getAllowedActions(modelInquiry.id, actors.customer1)).includes("CUSTOMER_REPORTED_SELF_RESOLVED"));

  const failureStore = bootRuntime().WaterCareStore;
  let failed = inquiry(failureStore, "DEMO-INQ-007");
  assert.ok(Array.from(failureStore.getAllowedActions(failed.id, actors.customer7)).includes("RETRY_AI_PROCESS"));
  failureStore.dispatch("RETRY_AI_PROCESS", eventPayload(failed, "failed-retry-one"), actors.customer7);
  failed = inquiry(failureStore, failed.id);
  assert.equal(failed.aiState, "FAILED");
  assert.equal(failed.retryCount, 1);
  assert.equal(failed.simulationFailuresRemaining, 0);
  failureStore.dispatch("RETRY_AI_PROCESS", eventPayload(failed, "failed-retry-max"), actors.customer7);
  failed = inquiry(failureStore, failed.id);
  assert.equal(failed.status, "CONSULTATION_REQUIRED");
  assert.equal(failed.errorCode, "AI-RETRY-EXCEEDED-01");
  assert.ok(!Array.from(failureStore.getAllowedActions(failed.id, actors.customer7)).includes("RETRY_AI_PROCESS"));
}

// 12. 역할 앱은 v13 고객 실패·원문·이력 화면 계약을 정적 경계로 유지한다.
{
  const customerSource = read("assets/js/roles/customer/app.js");
  assert.ok(customerSource.includes("if (inquiry.aiState === 'FAILED') return 'questions'"));
  assert.ok(customerSource.includes("고객 원문·이전 답변 펼쳐보기"));
  assert.ok(customerSource.includes("고객 원문·문진 답변 펼쳐보기"));
  assert.ok(customerSource.includes("actionPerformed"));
  assert.ok(customerSource.includes("사전 문진 이어쓰기"));
}

console.log("screen-design-v13: PASS");
