import assert from "node:assert/strict";
import { bootRuntime } from "./runtime-helper.mjs";

function boot() { return bootRuntime().WaterCareStore; }

function stateInquiry(store, id) {
  return store.getState().inquiries.find((item) => item.id === id);
}

function stateVisit(store, inquiryId) {
  return store.getState().visits.find((item) => item.inquiryId === inquiryId && item.status !== "CANCELLED");
}

function key(prefix) {
  return `${prefix}-${Date.now()}-${Math.random()}`;
}

const store = boot();
const customer1 = { role: "CUSTOMER", id: "DEMO-CUST-001", name: "합성 고객 001" };
const customer2 = { role: "CUSTOMER", id: "DEMO-CUST-002", name: "합성 고객 002" };
const customer4 = { role: "CUSTOMER", id: "DEMO-CUST-004", name: "합성 고객 004" };
const customer5 = { role: "CUSTOMER", id: "DEMO-CUST-005", name: "합성 고객 005" };
const customer6 = { role: "CUSTOMER", id: "DEMO-CUST-006", name: "합성 고객 006" };
const counselor = { role: "COUNSELOR", id: "STAFF-CONS-01", name: "한유진" };
const technician = { role: "TECHNICIAN", id: "STAFF-TECH-01", name: "오세훈" };

// 0. 케어 사전 문진은 문의 없이 저장되고, 고객이 선택할 때만 새 문의와 연결된다.
const precheckStore = boot();
const inquiryCountBeforePrecheck = precheckStore.getState().inquiries.length;
let precheckResult = precheckStore.dispatch("START_CARE_PRECHECK", {
  productId: "DEMO-PROD-001", idempotencyKey: key("precheck-start")
}, customer1);
let questionnaire = precheckStore.getState().questionnaireSessions.find((item) => item.id === precheckResult.result);
assert.equal(precheckStore.getState().inquiries.length, inquiryCountBeforePrecheck);
assert.equal(questionnaire.inquiryId, null);
assert.equal(questionnaire.entryMode, "CARE_PRECHECK");
assert.equal(questionnaire.questionnaireStatus, "IN_PROGRESS");
precheckStore.dispatch("SUBMIT_CARE_PRECHECK", {
  questionnaireSessionId: questionnaire.id,
  symptomCodes: ["LOW_FLOW"],
  description: "최근 저녁마다 출수량이 줄어듭니다.",
  conditions: "다른 수전은 사용하지 않았습니다.",
  answers: { flow: "LOW", leak: "NO" },
  stateVersion: questionnaire.stateVersion,
  idempotencyKey: key("precheck-submit")
}, customer1);
questionnaire = precheckStore.getState().questionnaireSessions.find((item) => item.id === questionnaire.id);
assert.equal(questionnaire.questionnaireStatus, "SUBMITTED");
precheckResult = precheckStore.dispatch("START_INQUIRY", {
  productId: "DEMO-PROD-001",
  questionnaireSessionId: questionnaire.id,
  idempotencyKey: key("precheck-link")
}, customer1);
const linkedPrecheckInquiry = stateInquiry(precheckStore, precheckResult.result);
questionnaire = precheckStore.getState().questionnaireSessions.find((item) => item.id === questionnaire.id);
assert.equal(linkedPrecheckInquiry.questionnaireSessionId, questionnaire.id);
assert.equal(linkedPrecheckInquiry.entryMode, "CARE_PRECHECK");
assert.equal(questionnaire.inquiryId, linkedPrecheckInquiry.id);

// 0-1. 미지원 제품은 Inquiry/AI/RAG를 만들지 않고 제품 상담 요청으로 대체한다.
const unsupportedStore = boot();
const unsupportedInquiryCount = unsupportedStore.getState().inquiries.length;
let unsupportedResult = unsupportedStore.dispatch("REGISTER_PRODUCT", {
  productCode: "WPU-UNKNOWN-900",
  manualModel: "WPU-UNKNOWN-900",
  modelName: "지원 범위 외 정수기",
  startedAt: "2026-07-20",
  installedArea: "사무실",
  idempotencyKey: key("unsupported-register")
}, customer6);
const unsupportedProductId = unsupportedResult.result;
unsupportedResult = unsupportedStore.dispatch("VALIDATE_PRODUCT", {
  productId: unsupportedProductId,
  idempotencyKey: key("unsupported-validate")
}, customer6);
assert.equal(unsupportedResult.result.status, "UNSUPPORTED");
assert.equal(unsupportedResult.result.supportScope, "unsupported");
assert.equal(unsupportedResult.result.aiAllowed, false);
assert.equal(unsupportedResult.result.ragAllowed, false);
assert.deepEqual(Array.from(unsupportedResult.result.evidenceIds), []);
assert.equal(unsupportedStore.getState().inquiries.length, unsupportedInquiryCount);
assert.throws(() => unsupportedStore.dispatch("START_INQUIRY", {
  productId: unsupportedProductId,
  idempotencyKey: key("unsupported-ai-block")
}, customer6), (error) => error.code === "MODEL-EXPANSION-01");
unsupportedResult = unsupportedStore.dispatch("REQUEST_PRODUCT_SUPPORT", {
  productId: unsupportedProductId,
  reason: "지원 범위 외 모델 확인",
  idempotencyKey: key("unsupported-support")
}, customer6);
assert.ok(unsupportedStore.getState().productSupportRequests.some((item) => item.id === unsupportedResult.result && item.validationStatus === "UNSUPPORTED"));
assert.ok(unsupportedStore.getState().notifications.some((item) => item.role === "COUNSELOR" && item.productSupportRequestId === unsupportedResult.result));
const productSupportRequestId = unsupportedResult.result;
const duplicateSupport = unsupportedStore.dispatch("REQUEST_PRODUCT_SUPPORT", {
  productId: unsupportedProductId,
  reason: "동일 제품 지원 범위 재확인",
  idempotencyKey: key("unsupported-support-repeat")
}, customer6);
assert.equal(duplicateSupport.result, productSupportRequestId);
assert.equal(unsupportedStore.getState().productSupportRequests.filter((item) => item.productId === unsupportedProductId && item.status !== "COMPLETED").length, 1);
assert.throws(() => unsupportedStore.dispatch("START_PRODUCT_SUPPORT_CONSULTATION", {
  productSupportRequestId,
  idempotencyKey: key("unsupported-support-wrong-role")
}, customer6), (error) => error.code === "FINALIZE-AUTH-01");
unsupportedStore.dispatch("START_PRODUCT_SUPPORT_CONSULTATION", {
  productSupportRequestId,
  idempotencyKey: key("unsupported-support-start")
}, counselor);
assert.equal(unsupportedStore.getState().productSupportRequests.find((item) => item.id === productSupportRequestId).status, "IN_PROGRESS");
unsupportedStore.dispatch("COMPLETE_PRODUCT_SUPPORT", {
  productSupportRequestId,
  note: "현재 기본 MVP 검색 범위 밖 모델임을 확인했습니다.",
  result: "전용 상담 절차와 공식 고객센터 연결을 안내했습니다.",
  idempotencyKey: key("unsupported-support-complete")
}, counselor);
const completedSupport = unsupportedStore.getState().productSupportRequests.find((item) => item.id === productSupportRequestId);
assert.equal(completedSupport.status, "COMPLETED");
assert.equal(completedSupport.assignedCounselorId, counselor.id);
assert.ok(unsupportedStore.getState().notifications.some((item) => item.role === "CUSTOMER" && item.recipientId === customer6.id && item.productSupportRequestId === productSupportRequestId));

// 같은 상품 코드라도 공식 적용 모델이 일치하지 않으면 검색 범위에 넣지 않는다.
const mismatchedModelStore = boot();
let mismatchedResult = mismatchedModelStore.dispatch("REGISTER_PRODUCT", {
  productCode: "WPUJAC104DWH",
  manualModel: "WPU-NOT-JAC104D",
  modelName: "설명서 불일치 제품",
  startedAt: "2026-07-20",
  installedArea: "회의실",
  idempotencyKey: key("mismatched-register")
}, customer6);
mismatchedResult = mismatchedModelStore.dispatch("VALIDATE_PRODUCT", {
  productId: mismatchedResult.result,
  idempotencyKey: key("mismatched-validate")
}, customer6);
assert.equal(mismatchedResult.result.status, "UNSUPPORTED");
assert.equal(mismatchedResult.result.aiAllowed, false);

// 동일 상품 코드의 공식 관련 모델(JCC104D)은 기본 MVP 범위로 인정한다.
const relatedManualStore = boot();
let relatedManualResult = relatedManualStore.dispatch("REGISTER_PRODUCT", {
  productCode: "WPUJAC104DWH",
  manualModel: "WPU-JCC104D",
  modelName: "JCC104D 적용 정수기",
  startedAt: "2026-07-20",
  installedArea: "라운지",
  idempotencyKey: key("related-manual-register")
}, customer6);
relatedManualResult = relatedManualStore.dispatch("VALIDATE_PRODUCT", {
  productId: relatedManualResult.result,
  idempotencyKey: key("related-manual-validate")
}, customer6);
assert.equal(relatedManualResult.result.status, "SUPPORTED");
assert.equal(relatedManualResult.result.supportScope, "mvp_primary");

// 제품 모델이 바뀌면 이전 문의의 공식 근거를 재사용하지 않는다.
const modelChangeStore = boot();
let modelChangeResult = modelChangeStore.dispatch("START_INQUIRY", {
  productId: "DEMO-PROD-001", idempotencyKey: key("model-change-start")
}, customer1);
let modelChangeInquiry = stateInquiry(modelChangeStore, modelChangeResult.result);
modelChangeStore.dispatch("SUBMIT_SYMPTOM", {
  inquiryId: modelChangeInquiry.id,
  symptomCodes: ["LOW_FLOW"],
  description: "평소보다 출수량이 줄었습니다.",
  conditions: "다른 수전을 끄고 확인했습니다.",
  stateVersion: modelChangeInquiry.stateVersion,
  idempotencyKey: key("model-change-symptom")
}, customer1);
modelChangeInquiry = stateInquiry(modelChangeStore, modelChangeInquiry.id);
assert.ok(modelChangeInquiry.evidenceIds.length > 0);
modelChangeStore.dispatch("PRODUCT_UPDATED", {
  productId: "DEMO-PROD-001",
  productCode: "WPUIAC425SNW",
  manualModel: "WPU-IAC425",
  idempotencyKey: key("model-change-update")
}, customer1);
modelChangeInquiry = stateInquiry(modelChangeStore, modelChangeInquiry.id);
assert.equal(modelChangeInquiry.reanalysisRequired, true);
assert.equal(modelChangeInquiry.aiState, "IDLE");
assert.deepEqual(Array.from(modelChangeInquiry.evidenceIds), []);
assert.equal(modelChangeStore.getState().products.find((item) => item.id === "DEMO-PROD-001").supportScope, "expansion_secondary");

// 1. 고객 일반 문의 → 공식 안내 → 자가조치 즉시 완료
let result = store.dispatch("START_INQUIRY", { productId: "DEMO-PROD-001", idempotencyKey: key("start") }, customer1);
const selfInquiryId = result.result;
let inquiry = stateInquiry(store, selfInquiryId);
assert.equal(inquiry.status, "DRAFT");

store.dispatch("SUBMIT_SYMPTOM", {
  inquiryId: selfInquiryId,
  symptomCodes: ["LOW_FLOW"],
  description: "평소보다 출수량이 줄었습니다.",
  conditions: "다른 수전을 끄고 확인했습니다.",
  stateVersion: inquiry.stateVersion,
  idempotencyKey: key("symptom")
}, customer1);
inquiry = stateInquiry(store, selfInquiryId);
assert.equal(inquiry.status, "AI_GUIDANCE");
assert.equal(inquiry.aiState, "COMPLETED");
assert.equal(inquiry.aiOutcome, "SAFE_GUIDANCE_READY");
assert.ok(inquiry.timeline.some((item) => item.event === "SAFE_GUIDANCE_READY"));
assert.equal(inquiry.topicCode, "symptom_low_flow");
assert.deepEqual(Array.from(inquiry.evidenceIds), ["EVD-JAC104D-MAN-P38-LOW-FLOW"]);

store.dispatch("CUSTOMER_REPORTED_SELF_RESOLVED", {
  inquiryId: selfInquiryId,
  actionResult: "RESOLVED",
  stateVersion: inquiry.stateVersion,
  idempotencyKey: key("self-resolve")
}, customer1);
assert.equal(stateInquiry(store, selfInquiryId).status, "RESOLVED");

// 2. 위험 문의는 자가 종료 차단 후 안전 확인과 상담 연결
result = store.dispatch("START_INQUIRY", { productId: "DEMO-PROD-001", idempotencyKey: key("danger-start") }, customer1);
const dangerInquiryId = result.result;
inquiry = stateInquiry(store, dangerInquiryId);
store.dispatch("SUBMIT_SYMPTOM", {
  inquiryId: dangerInquiryId,
  symptomCodes: ["LEAK"],
  description: "제품 연결부에서 물이 새고 바닥에 고입니다.",
  conditions: "원수 밸브 위치를 확인했습니다.",
  stateVersion: inquiry.stateVersion,
  idempotencyKey: key("danger-submit")
}, customer1);
inquiry = stateInquiry(store, dangerInquiryId);
assert.equal(inquiry.riskLevel, "DANGER");
assert.equal(inquiry.usageGuidance.usageStatus, "TOTAL_STOP");
assert.equal(inquiry.status, "CONSULTATION_REQUIRED");
assert.equal(inquiry.customerActionRequired, "SAFETY_CONFIRMATION");
assert.ok(inquiry.timeline.some((item) => item.event === "DANGER_DETECTED"));
assert.ok(inquiry.timeline.findIndex((item) => item.event === "SUBMIT_SYMPTOM") < inquiry.timeline.findIndex((item) => item.event === "DANGER_DETECTED"));
assert.ok(store.getState().notifications.some((item) => item.role === "OPERATOR" && item.recipientId === "STAFF-OPER-01" && item.inquiryId === dangerInquiryId));
assert.throws(() => store.dispatch("CUSTOMER_REPORTED_SELF_RESOLVED", {
  inquiryId: dangerInquiryId, stateVersion: inquiry.stateVersion, idempotencyKey: key("blocked")
}, customer1), (error) => error.code === "FINALIZE-AUTH-01");
store.dispatch("REQUEST_CONSULTATION", {
  inquiryId: dangerInquiryId,
  safeActions: {},
  stateVersion: inquiry.stateVersion,
  idempotencyKey: key("safety-recorded-counsel")
}, customer1);
inquiry = stateInquiry(store, dangerInquiryId);
assert.equal(inquiry.status, "CONSULTATION_REQUIRED");
assert.deepEqual(inquiry.safeActions, { waterValveClosed: false, powerDisconnected: false, drinkingStopped: false });
assert.ok(store.getState().notifications.some((item) => item.role === "COUNSELOR" && item.recipientId === counselor.id && item.inquiryId === dangerInquiryId));
store.dispatch("START_CONSULTATION", {
  inquiryId: dangerInquiryId,
  stateVersion: inquiry.stateVersion,
  idempotencyKey: key("danger-counsel-start")
}, counselor);
inquiry = stateInquiry(store, dangerInquiryId);
store.dispatch("REQUEST_CONSULTATION", {
  inquiryId: dangerInquiryId,
  safeActions: { waterValveClosed: true },
  stateVersion: inquiry.stateVersion,
  idempotencyKey: key("late-safety-record")
}, customer1);
inquiry = stateInquiry(store, dangerInquiryId);
assert.equal(inquiry.status, "CONSULTATION_IN_PROGRESS");
assert.equal(inquiry.safeActions.waterValveClosed, true);

// 2-0. 온수 모듈 위험은 제품 전체가 아니라 근거가 있는 기능만 제한한다.
const hotStore = boot();
let hotResult = hotStore.dispatch("START_INQUIRY", { productId: "DEMO-PROD-006", idempotencyKey: key("hot-start") }, customer6);
let hotInquiry = stateInquiry(hotStore, hotResult.result);
hotStore.dispatch("SUBMIT_SYMPTOM", {
  inquiryId: hotInquiry.id,
  symptomCodes: ["TEMPERATURE"],
  description: "LCD에 순간온수 모듈 점검 문구가 표시됩니다.",
  conditions: "출수된 물은 마시지 않았고 전원을 분리했습니다.",
  displayCode: "순간온수 모듈 점검",
  stateVersion: hotInquiry.stateVersion,
  idempotencyKey: key("hot-submit")
}, customer6);
hotInquiry = stateInquiry(hotStore, hotInquiry.id);
assert.equal(hotInquiry.aiOutcome, "DANGER_DETECTED");
assert.equal(hotInquiry.usageGuidance.usageStatus, "PARTIAL_STOP");
assert.ok(hotInquiry.usageGuidance.restrictedFunctions.some((item) => item.includes("온수")));
assert.ok(hotInquiry.usageGuidance.decisionBasis);
assert.ok(hotInquiry.usageGuidance.nextAction);

// 2-1. 위험도와 별개로 상담 필수로 판정된 문의도 즉시 전환하고 안전조치를 별도 기록
result = store.dispatch("START_INQUIRY", { productId: "DEMO-PROD-002", idempotencyKey: key("required-start") }, customer2);
const requiredInquiryId = result.result;
inquiry = stateInquiry(store, requiredInquiryId);
store.dispatch("SUBMIT_SYMPTOM", {
  inquiryId: requiredInquiryId,
  symptomCodes: ["LOW_FLOW"],
  description: "출수량이 줄고 확인되지 않은 표시가 보입니다.",
  conditions: "다른 수전은 정상입니다.",
  displayCode: "E-99",
  stateVersion: inquiry.stateVersion,
  idempotencyKey: key("required-submit")
}, customer2);
inquiry = stateInquiry(store, requiredInquiryId);
assert.equal(inquiry.requiresConsultation, true);
assert.equal(inquiry.status, "CONSULTATION_REQUIRED");
assert.equal(inquiry.aiOutcome, "NO_EVIDENCE");
assert.equal(inquiry.usageGuidance.usageStatus, "PENDING_CONSULTATION");
assert.deepEqual(Array.from(inquiry.evidenceIds), []);
assert.ok(inquiry.timeline.some((item) => item.event === "NO_EVIDENCE"));
assert.ok(!inquiry.timeline.some((item) => item.event === "DANGER_DETECTED"));
store.dispatch("REQUEST_CONSULTATION", {
  inquiryId: requiredInquiryId,
  safeActions: { drinkingStopped: true },
  stateVersion: inquiry.stateVersion,
  idempotencyKey: key("required-counsel")
}, customer2);
inquiry = stateInquiry(store, requiredInquiryId);
assert.equal(inquiry.safeActions.drinkingStopped, true);
assert.equal(inquiry.safetyActionCompleted, false);
assert.ok(inquiry.safetyActionRecordedAt);
assert.ok(inquiry.consultationRequestedAt);

// 3. 상담 경로는 고객 피드백 뒤 담당 상담사만 최종 완료
inquiry = stateInquiry(store, "DEMO-INQ-002");
const counselKey = key("counsel-start");
store.dispatch("START_CONSULTATION", {
  inquiryId: inquiry.id, stateVersion: inquiry.stateVersion, idempotencyKey: counselKey
}, counselor);
const duplicate = store.dispatch("START_CONSULTATION", {
  inquiryId: inquiry.id, stateVersion: inquiry.stateVersion, idempotencyKey: counselKey
}, counselor);
assert.equal(duplicate.duplicate, true);
inquiry = stateInquiry(store, "DEMO-INQ-002");
assert.equal(inquiry.status, "CONSULTATION_IN_PROGRESS");

const originalSummary = inquiry.aiSummaryOriginal;
store.dispatch("SAVE_AI_SUMMARY_REVISION", {
  inquiryId: inquiry.id,
  text: "고객의 반복 증상과 설치 환경을 함께 확인해야 합니다.",
  stateVersion: inquiry.stateVersion,
  idempotencyKey: key("summary-revision")
}, counselor);
inquiry = stateInquiry(store, inquiry.id);
assert.equal(inquiry.aiSummaryOriginal, originalSummary);
assert.equal(inquiry.aiSummaryRevision.text, "고객의 반복 증상과 설치 환경을 함께 확인해야 합니다.");
assert.equal(inquiry.aiSummaryRevision.editorId, counselor.id);
assert.ok(inquiry.timeline.some((item) => item.event === "SAVE_AI_SUMMARY_REVISION"));
assert.throws(() => store.dispatch("SAVE_AI_SUMMARY_REVISION", {
  inquiryId: inquiry.id,
  text: "고객이 임의로 변경하면 안 되는 요약",
  stateVersion: inquiry.stateVersion,
  idempotencyKey: key("summary-revision-wrong-role")
}, customer2), (error) => error.code === "FINALIZE-AUTH-01");

store.dispatch("CONSULTATION_COMPLETED", {
  inquiryId: inquiry.id,
  note: "필터 수명과 다른 수전 사용 여부를 확인했습니다.",
  outcome: "공식 조치 안내 후 확인 요청",
  usageStatus: "NORMAL",
  stateVersion: inquiry.stateVersion,
  idempotencyKey: key("counsel-complete")
}, counselor);
inquiry = stateInquiry(store, "DEMO-INQ-002");
assert.equal(inquiry.status, "COMPLETION_PENDING");
assert.equal(inquiry.customerActionRequired, "RESOLUTION_FEEDBACK");
assert.ok(store.getState().notifications.some((item) => item.role === "CUSTOMER" && item.recipientId === customer2.id && item.inquiryId === inquiry.id));

store.dispatch("SUBMIT_RESOLUTION_FEEDBACK", {
  inquiryId: inquiry.id, resolved: true, comment: "정상으로 돌아왔습니다.", stateVersion: inquiry.stateVersion, idempotencyKey: key("feedback")
}, customer2);
inquiry = stateInquiry(store, "DEMO-INQ-002");
assert.equal(inquiry.status, "COMPLETION_PENDING");
assert.equal(inquiry.customerActionRequired, "STAFF_FINALIZATION");

assert.throws(() => store.dispatch("FINALIZE_INQUIRY", {
  inquiryId: inquiry.id, stateVersion: inquiry.stateVersion, idempotencyKey: key("wrong-role")
}, technician), (error) => error.code === "FINALIZE-AUTH-01");
store.dispatch("FINALIZE_INQUIRY", {
  inquiryId: inquiry.id, stateVersion: inquiry.stateVersion, idempotencyKey: key("counsel-final")
}, counselor);
assert.equal(stateInquiry(store, "DEMO-INQ-002").status, "RESOLVED");

// 4. 확정 방문 일정 변경 요청은 상태를 되돌리지 않는다.
inquiry = stateInquiry(store, "DEMO-INQ-004");
store.dispatch("REQUEST_VISIT_RESCHEDULE", {
  inquiryId: inquiry.id,
  visitId: "DEMO-VISIT-004",
  reason: "근무 일정 변경",
  preferredAt: "2026-07-24T15:00:00+09:00",
  stateVersion: inquiry.stateVersion,
  idempotencyKey: key("reschedule")
}, customer4);
inquiry = stateInquiry(store, "DEMO-INQ-004");
assert.equal(inquiry.status, "VISIT_SCHEDULED");
assert.equal(stateVisit(store, inquiry.id).status, "CONFIRMED");
assert.equal(stateVisit(store, inquiry.id).rescheduleRequest.status, "PENDING");
assert.ok(store.getState().notifications.some((item) => item.role === "OPERATOR" && item.inquiryId === inquiry.id && item.visitId === "DEMO-VISIT-004"));

// 5. 방문 경로는 START_VISIT → COMPLETED → 고객 피드백 → 기사 최종 완료
store.dispatch("START_VISIT", {
  inquiryId: inquiry.id,
  visitId: "DEMO-VISIT-004",
  reconfirmed: true,
  stateVersion: inquiry.stateVersion,
  idempotencyKey: key("visit-start")
}, technician);
inquiry = stateInquiry(store, inquiry.id);
assert.equal(inquiry.status, "VISIT_SCHEDULED");
assert.equal(stateVisit(store, inquiry.id).status, "IN_PROGRESS");

store.dispatch("VISIT_COMPLETED", {
  inquiryId: inquiry.id,
  visitId: "DEMO-VISIT-004",
  actualCause: "연결 피팅 체결 불량",
  actions: "연결 피팅 재체결 및 누수 확인",
  parts: "연결 피팅",
  usageStatus: "NORMAL",
  restrictedFunctions: [],
  decisionBasis: "공식 매뉴얼 38쪽 및 현장 점검",
  nextAction: "24시간 누수 재발 여부 확인",
  notes: "점검 후 누수 없음",
  signature: "합성 고객 004",
  stateVersion: inquiry.stateVersion,
  idempotencyKey: key("visit-complete")
}, technician);
inquiry = stateInquiry(store, inquiry.id);
assert.equal(inquiry.status, "COMPLETION_PENDING");
assert.equal(stateVisit(store, inquiry.id).status, "COMPLETED");
let completedState = store.getState();
let completedProduct = completedState.products.find((item) => item.id === inquiry.productId);
let completedCare = completedState.careHistory.find((item) => item.visitId === "DEMO-VISIT-004");
assert.equal(completedProduct.lastCareAt, stateVisit(store, inquiry.id).completedAt);
assert.equal(completedProduct.careSchedule.status, "PLANNING");
assert.equal(completedProduct.careSchedule.nextCareAt, null);
assert.equal(completedProduct.careSchedule.lastVisitId, "DEMO-VISIT-004");
assert.equal(completedCare.actualCause, "연결 피팅 체결 불량");
assert.equal(completedCare.technicianId, technician.id);

store.dispatch("SUBMIT_RESOLUTION_FEEDBACK", {
  inquiryId: inquiry.id, resolved: true, comment: "누수가 멈췄습니다.", stateVersion: inquiry.stateVersion, idempotencyKey: key("visit-feedback")
}, customer4);
inquiry = stateInquiry(store, inquiry.id);
store.dispatch("FINALIZE_INQUIRY", {
  inquiryId: inquiry.id, stateVersion: inquiry.stateVersion, idempotencyKey: key("visit-final")
}, technician);
assert.equal(stateInquiry(store, inquiry.id).status, "RESOLVED");

// 6. state_version 충돌은 최신 상태를 덮어쓰지 않는다.
inquiry = stateInquiry(store, dangerInquiryId);
assert.throws(() => store.dispatch("START_CONSULTATION", {
  inquiryId: dangerInquiryId,
  stateVersion: inquiry.stateVersion - 1,
  idempotencyKey: key("stale")
}, counselor), (error) => error.code === "STATE-CONFLICT-01");

// 6-1. 고객 미해결 피드백은 재개되고 상담원이 다시 시작할 수 있다.
const reopenedStore = boot();
let reopenedInquiry = stateInquiry(reopenedStore, "DEMO-INQ-005");
reopenedStore.dispatch("CUSTOMER_REPORTED_UNRESOLVED", {
  inquiryId: reopenedInquiry.id,
  resolved: false,
  comment: "냄새가 다시 느껴집니다.",
  stateVersion: reopenedInquiry.stateVersion,
  idempotencyKey: key("reopened-feedback")
}, customer5);
reopenedInquiry = stateInquiry(reopenedStore, reopenedInquiry.id);
assert.equal(reopenedInquiry.status, "REOPENED");
reopenedStore.dispatch("START_CONSULTATION", {
  inquiryId: reopenedInquiry.id,
  stateVersion: reopenedInquiry.stateVersion,
  idempotencyKey: key("reopened-consultation")
}, counselor);
assert.equal(stateInquiry(reopenedStore, reopenedInquiry.id).status, "CONSULTATION_IN_PROGRESS");

// 7. 상담사의 방문 전환·일정 확정과 기사의 재방문 전이가 고정 계약을 따른다.
const visitStore = boot();
let visitInquiry = stateInquiry(visitStore, "DEMO-INQ-002");
visitStore.dispatch("START_CONSULTATION", {
  inquiryId: visitInquiry.id, stateVersion: visitInquiry.stateVersion, idempotencyKey: key("visit-counsel-start")
}, counselor);
visitInquiry = stateInquiry(visitStore, visitInquiry.id);
visitStore.dispatch("VISIT_REVIEW_REQUIRED", {
  inquiryId: visitInquiry.id, note: "현장 수압과 연결부 점검 필요", stateVersion: visitInquiry.stateVersion, idempotencyKey: key("visit-review")
}, counselor);
visitInquiry = stateInquiry(visitStore, visitInquiry.id);
assert.equal(visitInquiry.status, "VISIT_REVIEW_PENDING");
const createdVisit = visitStore.dispatch("VISIT_NEEDED", {
  inquiryId: visitInquiry.id,
  technicianId: "STAFF-TECH-01",
  desiredAt: "2026-07-25T10:00:00+09:00",
  notes: "출수량 저하 현장 점검",
  safetyNotes: "점검 전 고객 입력 재확인",
  stateVersion: visitInquiry.stateVersion,
  idempotencyKey: key("visit-needed")
}, counselor).result;
visitInquiry = stateInquiry(visitStore, visitInquiry.id);
assert.equal(visitInquiry.status, "VISIT_SCHEDULING");
assert.equal(stateVisit(visitStore, visitInquiry.id).status, "ASSIGNING");

visitStore.dispatch("UPDATE_VISIT_SCHEDULE", {
  inquiryId: visitInquiry.id,
  visitId: createdVisit,
  technicianId: "STAFF-TECH-01",
  desiredAt: "2026-07-25T10:00:00+09:00",
  confirmedAt: "2026-07-25T11:00:00+09:00",
  notes: "고객과 오전 방문 협의",
  safetyNotes: "점검 전 고객 입력 재확인",
  stateVersion: visitInquiry.stateVersion,
  idempotencyKey: key("visit-update")
}, counselor);
visitInquiry = stateInquiry(visitStore, visitInquiry.id);
assert.equal(stateVisit(visitStore, visitInquiry.id).status, "SCHEDULING");

visitStore.dispatch("CONFIRM_VISIT", {
  inquiryId: visitInquiry.id,
  visitId: createdVisit,
  technicianId: "STAFF-TECH-01",
  confirmedAt: "2026-07-25T11:00:00+09:00",
  notes: "확정 방문",
  safetyNotes: "점검 전 고객 입력 재확인",
  stateVersion: visitInquiry.stateVersion,
  idempotencyKey: key("visit-confirm")
}, counselor);
visitInquiry = stateInquiry(visitStore, visitInquiry.id);
assert.equal(visitInquiry.status, "VISIT_SCHEDULED");
assert.equal(stateVisit(visitStore, visitInquiry.id).status, "CONFIRMED");
let linkedState = visitStore.getState();
const technicianNotification = linkedState.notifications.find((item) => item.role === "TECHNICIAN" && item.recipientId === technician.id && item.inquiryId === visitInquiry.id && item.visitId === createdVisit);
const customerVisitNotification = linkedState.notifications.find((item) => item.role === "CUSTOMER" && item.recipientId === visitInquiry.customerId && item.inquiryId === visitInquiry.id && item.visitId === createdVisit);
assert.ok(technicianNotification, "방문 확정 시 담당 기사 알림이 생성되어야 한다.");
assert.ok(customerVisitNotification, "방문 확정 시 고객 알림이 생성되어야 한다.");
visitStore.dispatch("MARK_NOTIFICATION_READ", {
  notificationId: technicianNotification.id,
  idempotencyKey: key("notification-read")
}, technician);
linkedState = visitStore.getState();
assert.equal(linkedState.notifications.find((item) => item.id === technicianNotification.id).read, true);

visitStore.dispatch("START_VISIT", {
  inquiryId: visitInquiry.id, visitId: createdVisit, reconfirmed: true,
  stateVersion: visitInquiry.stateVersion, idempotencyKey: key("revisit-start")
}, technician);
visitInquiry = stateInquiry(visitStore, visitInquiry.id);
visitStore.dispatch("REVISIT_NEEDED", {
  inquiryId: visitInquiry.id,
  visitId: createdVisit,
  actualCause: "설치 수압 추가 측정 필요",
  actions: "1차 연결부 점검",
  usageStatus: "PENDING_CONSULTATION",
  decisionBasis: "현장 수압 측정값 변동",
  nextAction: "장비 지참 후 추가 방문",
  revisitReason: "정밀 수압 측정 장비 필요",
  stateVersion: visitInquiry.stateVersion,
  idempotencyKey: key("revisit-needed")
}, technician);
assert.equal(stateInquiry(visitStore, visitInquiry.id).status, "REVISIT_REQUIRED");
assert.equal(stateVisit(visitStore, visitInquiry.id).status, "FOLLOW_UP_REQUIRED");
assert.ok(visitStore.getState().notifications.some((item) => item.role === "OPERATOR" && item.inquiryId === visitInquiry.id && item.visitId === createdVisit));

visitInquiry = stateInquiry(visitStore, visitInquiry.id);
visitStore.dispatch("UPDATE_VISIT_SCHEDULE", {
  inquiryId: visitInquiry.id,
  visitId: createdVisit,
  technicianId: "STAFF-TECH-01",
  desiredAt: "2026-07-28T10:00:00+09:00",
  confirmedAt: "2026-07-28T11:00:00+09:00",
  notes: "정밀 측정 장비 지참",
  safetyNotes: "사용 제한 상태 재확인",
  stateVersion: visitInquiry.stateVersion,
  idempotencyKey: key("revisit-update")
}, counselor);
visitInquiry = stateInquiry(visitStore, visitInquiry.id);
assert.equal(visitInquiry.status, "VISIT_SCHEDULING");
assert.equal(stateVisit(visitStore, visitInquiry.id).status, "SCHEDULING");
visitStore.dispatch("CONFIRM_VISIT", {
  inquiryId: visitInquiry.id,
  visitId: createdVisit,
  technicianId: "STAFF-TECH-01",
  confirmedAt: "2026-07-28T11:00:00+09:00",
  notes: "추가 방문 확정",
  safetyNotes: "사용 제한 상태 재확인",
  stateVersion: visitInquiry.stateVersion,
  idempotencyKey: key("revisit-confirm")
}, counselor);
assert.equal(stateInquiry(visitStore, visitInquiry.id).status, "VISIT_SCHEDULED");
assert.equal(stateVisit(visitStore, visitInquiry.id).status, "CONFIRMED");

console.log("state-flow-fix-v6: PASS");
