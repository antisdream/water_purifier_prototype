import assert from "node:assert/strict";
import { bootRuntime, read, runtimeFiles } from "./runtime-helper.mjs";

const runtime = bootRuntime();
const seed = runtime.WATERCARE_FIX_SEED;
assert.equal(seed.meta.schemaVersion, "SCREEN-FIX-V6");
assert.equal(seed.meta.seedRevision, 4);
assert.equal(seed.model.productCode, "WPUJAC104DWH");
assert.equal(seed.model.productGeneration, "D");
assert.equal(seed.model.scopeRole, "mvp_primary");
assert.equal(seed.scenarios.length, 6);
assert.deepEqual(Array.from(seed.scenarios, (item) => item.id), [
  "SYN-JAC104-001", "SYN-JAC104-002", "SYN-JAC104-003",
  "SYN-JAC104-004", "SYN-JAC104-005", "SYN-JAC104-006"
]);
assert.equal(seed.customers.length, 6);
assert.ok(seed.customers.every((item) => /^합성 고객 \d{3}$/.test(item.name) && item.id.startsWith("DEMO-CUST-") && item.synthetic));
assert.ok(seed.products.every((item) => item.productCode === "WPUJAC104DWH" && item.manualModel === "WPU-JAC104D" && item.productGeneration === "D"));
assert.equal(seed.inquiries.length, 6);
assert.equal(seed.questionnaireSessions.length, 2);
assert.ok(seed.questionnaireSessions.every((item) => item.inquiryId === null && item.questionnaireStatus === "UNANSWERED"));
assert.ok(Array.isArray(seed.careHistory));
assert.ok(Array.isArray(seed.productSupportRequests));
assert.ok(seed.inquiries.every((item) => item.id.startsWith("DEMO-INQ-") && item.stateVersion >= 1));
assert.ok(seed.inquiries.every((item) => !Number.isNaN(Date.parse(item.createdAt)) && !Number.isNaN(Date.parse(item.updatedAt))), "seed inquiry timestamps must be valid ISO dates");

const evidenceFields = [
  "evidenceId", "chunkId", "documentId", "documentTitle", "documentVersion", "pageRefs",
  "evidenceSummary", "applicability", "allowedUse", "verificationStatus", "sourceLandingUrl",
  "sourceDirectDownloadUrl", "productGeneration", "productCode", "modelFamily", "manualModel", "scopeRole"
];
assert.equal(seed.evidenceRegistry.length, 7);
for (const item of seed.evidenceRegistry) {
  for (const field of evidenceFields) assert.ok(Object.prototype.hasOwnProperty.call(item, field), `${item.evidenceId}: ${field}`);
  assert.equal(item.verificationStatus, "text_and_visual_verified");
  assert.equal(item.productCode, "WPUJAC104DWH");
  assert.equal(item.productGeneration, "D");
  assert.equal(item.scopeRole, "mvp_primary");
  assert.equal(item.applicability, "model_exact");
  assert.equal(item.allowedUse, null);
}

const storeSource = read("assets/js/core/store.js");
for (const eventName of [
  "START_CARE_PRECHECK", "START_INQUIRY", "REGISTER_PRODUCT", "VALIDATE_PRODUCT", "REQUEST_PRODUCT_SUPPORT", "START_PRODUCT_SUPPORT_CONSULTATION", "COMPLETE_PRODUCT_SUPPORT", "PRODUCT_UPDATED", "SAVE_QUESTIONNAIRE", "SUBMIT_CARE_PRECHECK", "CANCEL_CARE_PRECHECK", "SAVE_DRAFT", "SUBMIT_SYMPTOM",
  "SUBMIT_ANSWERS", "CANCEL_INQUIRY", "CUSTOMER_REPORTED_SELF_RESOLVED", "REQUEST_CONSULTATION",
  "SUBMIT_RESOLUTION_FEEDBACK", "CUSTOMER_REPORTED_UNRESOLVED", "START_CONSULTATION",
  "RETRY_AI_PROCESS", "SAVE_AI_SUMMARY_REVISION", "CONSULTATION_COMPLETED", "VISIT_REVIEW_REQUIRED", "VISIT_NEEDED", "UPDATE_VISIT_SCHEDULE",
  "CONFIRM_VISIT", "START_VISIT", "VISIT_COMPLETED", "REVISIT_NEEDED", "FINALIZE_INQUIRY"
]) assert.ok(storeSource.includes(`case "${eventName}"`), eventName);
for (const token of ["STATE-CONFLICT-01", "DUPLICATE-EVENT-01", "FINALIZE-AUTH-01", "ALREADY-RESOLVED-01", "idempotencyKey", "stateVersion"])
  assert.ok(storeSource.includes(token), token);
for (const token of ["SAFE_GUIDANCE_READY", "DANGER_DETECTED", "NO_EVIDENCE", "safetyActionCompleted", "safetyActionRecordedAt", "consultationRequestedAt"])
  assert.ok(storeSource.includes(token), token);

const commonSource = read("assets/js/ui/common.js");
for (const code of [
  "DRAFT", "QUESTIONNAIRE_IN_PROGRESS", "AI_GUIDANCE", "CONSULTATION_REQUIRED", "CONSULTATION_IN_PROGRESS",
  "VISIT_REVIEW_PENDING", "VISIT_SCHEDULING", "VISIT_SCHEDULED", "COMPLETION_PENDING", "REVISIT_REQUIRED",
  "REOPENED", "RESOLVED", "CANCELLED", "ASSIGNING", "SCHEDULING", "CONFIRMED", "IN_PROGRESS",
  "COMPLETED", "FOLLOW_UP_REQUIRED", "NORMAL", "PARTIAL_STOP", "TOTAL_STOP", "PENDING_CONSULTATION"
]) assert.ok(commonSource.includes(code), code);

const index = read("index.html");
for (const route of ["customer.html", "counselor.html", "technician.html", "operator.html"])
  assert.ok(index.includes(`href="${route}"`), route);
assert.equal((index.match(/gateway-role-card/g) || []).filter((_, indexValue) => indexValue % 2 === 0).length >= 4, true);

const activePages = {
  "customer.html": ["customer-mobile.css", "assets/js/roles/customer/app.js"],
  "counselor.html": ["staff-desktop-v6.css", "assets/js/roles/counselor/app.js"],
  "technician.html": ["technician-tablet.css", "assets/js/roles/technician/app.js"],
  "operator.html": ["staff-desktop-v6.css", "assets/js/roles/operator/app.js"]
};
for (const [file, assets] of Object.entries(activePages)) {
  const html = read(file);
  assert.ok(html.includes('href="index.html"'), `${file}: home`);
  for (const runtimeFile of runtimeFiles) assert.ok(html.includes(runtimeFile), `${file}: ${runtimeFile}`);
  assert.ok(html.includes("assets/js/ui/common.js"), `${file}: common UI`);
  for (const asset of assets) assert.ok(html.includes(asset), `${file}: ${asset}`);
  for (const other of Object.keys(activePages).filter((item) => item !== file)) {
    assert.ok(!html.includes(`href="${other}"`), `${file}: direct role switch ${other}`);
  }
}

const customerSource = read("assets/js/roles/customer/app.js");
for (const id of ["CUST-01", "CUST-02", "CUST-03", "CUST-04", "CUST-05", "CUST-06"])
  assert.ok(customerSource.includes(id), id);
for (const forbidden of ["WPUJAC115", "DEMO_IOT", "smartPreparation", "usageTelemetry"])
  assert.ok(!customerSource.includes(forbidden), `customer forbidden: ${forbidden}`);
assert.ok(customerSource.includes("data-notification-inquiry"), "customer notification detail linkage");
assert.ok(customerSource.includes("data-notification-support"), "customer product support notification linkage");
for (const token of ["questionnaireSessionId", "start-linked-inquiry", "request-product-support", "NO_EVIDENCE", "RETRY_AI_PROCESS"])
  assert.ok(customerSource.includes(token), `customer contract: ${token}`);

const counselorSource = read("assets/js/roles/counselor/app.js");
for (const id of ["CONS-01", "CONS-02", "CONS-03"]) assert.ok(counselorSource.includes(id), id);
for (const eventName of ["START_CONSULTATION", "CONSULTATION_COMPLETED", "VISIT_REVIEW_REQUIRED", "VISIT_NEEDED", "UPDATE_VISIT_SCHEDULE", "CONFIRM_VISIT", "FINALIZE_INQUIRY"])
  assert.ok(counselorSource.includes(eventName), eventName);
for (const status of ["REOPENED", "REVISIT_REQUIRED"]) assert.ok(counselorSource.includes(status), `counselor follow-up: ${status}`);
for (const token of ["AI 원본", "상담사 수정본", "SAVE_AI_SUMMARY_REVISION", "START_PRODUCT_SUPPORT_CONSULTATION", "COMPLETE_PRODUCT_SUPPORT"])
  assert.ok(counselorSource.includes(token), `counselor summary contract: ${token}`);

const technicianSource = read("assets/js/roles/technician/app.js");
for (const id of ["TECH-01", "TECH-02", "TECH-03"]) assert.ok(technicianSource.includes(id), id);
for (const eventName of ["START_VISIT", "VISIT_COMPLETED", "REVISIT_NEEDED", "FINALIZE_INQUIRY"])
  assert.ok(technicianSource.includes(eventName), eventName);
for (const [role, source] of [["customer", customerSource], ["counselor", counselorSource], ["technician", technicianSource]])
  assert.ok(source.includes("MARK_NOTIFICATION_READ"), `${role}: notification read linkage`);

const operatorSource = read("assets/js/roles/operator/app.js");
assert.ok(operatorSource.includes("ADMIN-01"));
assert.ok(operatorSource.includes("조회 전용"));
assert.ok(operatorSource.includes("data-operator-notification-inquiry"), "operator notification filter linkage");
assert.ok(!operatorSource.includes("Store.dispatch("), "ADMIN-01 must be read-only");

const customerCss = read("assets/css/customer-mobile.css");
const technicianCss = read("assets/css/technician-tablet.css");
const staffCss = read("assets/css/staff-desktop-v6.css");
assert.match(customerCss, /(max-width\s*:\s*(430|440|460)px|width\s*:\s*min\(100%,\s*(430|440|460)px\))/);
assert.match(customerCss, /@media\s*\(max-width/);
assert.match(technicianCss, /@media\s*\(max-width/);
assert.match(staffCss, /@media\s*\(max-width/);

console.log("requirements-screen-fix-v6: PASS");
