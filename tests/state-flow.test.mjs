import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function boot() {
  const values = new Map();
  const window = {
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    },
    addEventListener() {},
    setTimeout,
    clearTimeout
  };
  const context = vm.createContext({ window, console, Date, Intl, Math, JSON, Error, setTimeout, clearTimeout });
  for (const file of ["assets/js/fix-data.js", "assets/js/fix-store.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  return window.WaterCareStore;
}

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
const counselor = { role: "COUNSELOR", id: "STAFF-CONS-01", name: "한유진" };
const technician = { role: "TECHNICIAN", id: "STAFF-TECH-01", name: "오세훈" };

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
assert.ok(inquiry.timeline.some((item) => item.event === "DANGER_DETECTED"));
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
