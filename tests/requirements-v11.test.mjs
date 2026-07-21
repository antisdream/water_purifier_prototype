import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storage = new Map();

class FakeStorage {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; }
  setItem(key, value) { storage.set(key, String(value)); }
  removeItem(key) { storage.delete(key); }
}

function loadStore() {
  const window = { localStorage: new FakeStorage(), addEventListener() {} };
  const context = vm.createContext({ window, console, Date, JSON, CustomEvent: class CustomEvent {} });
  for (const file of ["mock-data.js", "workflow-config.js", "store.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, "assets/js", file), "utf8"), context, { filename: file });
  }
  return window.WaterCareStore;
}

function productPayload(overrides = {}) {
  return {
    customerId: "CUS-001",
    modelId: "MODEL-SKM-IAC425SNW",
    startedAt: "2026-06-01",
    managementType: "방문관리형",
    lastReplacementAt: "2026-07-01",
    installedArea: "거실 홈카페",
    assetTag: "HOME-NEW-01",
    requestId: "REQ-PRODUCT-V11-001",
    ...overrides
  };
}

function completeAnswers(overrides = {}) {
  return {
    started: "오늘 아침",
    targetWater: "정수",
    condition: "모든 시간대에 반복",
    errorCode: "표시 없음",
    companion: "특이사항 없음",
    recentNonUse: "해당 없음",
    performedActions: "아직 수행한 조치 없음",
    ...overrides
  };
}

function validSignature() {
  return {
    format: "POINTS_V1",
    strokes: [
      [{ x: 0.1, y: 0.62 }, { x: 0.23, y: 0.28 }, { x: 0.38, y: 0.66 }],
      [{ x: 0.45, y: 0.57 }, { x: 0.61, y: 0.31 }, { x: 0.78, y: 0.59 }]
    ]
  };
}

function visitCompletionOptions(overrides = {}) {
  return {
    serviceType: "AS",
    result: "RESOLVED",
    cause: "현장에서 연결부와 출수 상태를 확인함",
    actions: ["연결부 상태 점검", "출수·온도 성능 확인"],
    replacement: "복합 필터",
    engineerId: "STF-002",
    engineerName: "오세훈",
    signerName: "박지민",
    signerRelationship: "BUSINESS_REP",
    signerPosition: "총무 담당",
    signatureConsent: true,
    signatureData: validSignature(),
    ...overrides
  };
}

function latestQuestionnaire(state, productId) {
  return state.questionnaires.filter((item) => item.productId === productId && item.status !== "SUPERSEDED").sort((a, b) => String(b.dueAt || "").localeCompare(String(a.dueAt || "")) || String(b.submittedAt || b.generatedAt || b.id || "").localeCompare(String(a.submittedAt || a.generatedAt || a.id || "")))[0];
}

storage.clear();
const Store = loadStore();
let state = Store.getState();
assert.equal(state.meta.schemaVersion, 11, "v11 상태 저장 스키마를 사용해야 합니다.");
assert(state.products.every((product) => state.questionnaires.some((item) => item.productId === product.id && item.status !== "SUPERSEDED")), "기존 제품도 현재 케어 주기별 문진 레코드를 가져야 합니다.");
assert(state.questionnaires.every((item) => item.customerId && item.productId && item.id), "문진은 고객·제품 FK와 고유 ID가 필요합니다.");
assert(state.customers.every((customer) => customer.role === "CUSTOMER" && typeof customer.active === "boolean"), "고객 계정에는 CUSTOMER 역할과 활성 상태가 명시되어야 합니다.");
assert(state.customers.every((customer) => customer.active), "시연 기본 고객 계정은 모두 활성 상태여야 합니다.");
const initialSubscriptionIds = state.products.map((product) => product.subscriptionId);
assert(initialSubscriptionIds.every(Boolean), "모든 제품에 구독 식별자가 필요합니다.");
assert.equal(new Set(initialSubscriptionIds).size, initialSubscriptionIds.length, "제품별 구독 식별자는 고유해야 합니다.");

// Product registration, idempotency, ownership and auditable updates.
const productCountBefore = state.products.length;
const newProductId = Store.saveProduct(productPayload(), { role: "CUSTOMER", id: "CUS-001" });
state = Store.getState();
let newProduct = state.products.find((item) => item.id === newProductId);
assert.equal(state.products.length, productCountBefore + 1, "고객이 본인 계정에 제품을 등록할 수 있어야 합니다.");
assert.equal(newProduct.model, "WPUIAC425SNW", "표시 모델 코드는 카탈로그에서 파생해야 합니다.");
assert.equal(newProduct.modelLabel, "원코크 플러스 얼음물 정수기", "표시 모델명은 카탈로그에서 파생해야 합니다.");
assert.match(newProduct.subscriptionId, /^SUB-/, "제품에는 구독 식별자가 필요합니다.");
assert.equal(newProduct.nextCareAt, "2026-11-01", "최근 교체일 기준으로 다음 케어일을 계산해야 합니다.");
assert(state.questionnaires.some((item) => item.productId === newProductId && item.status === "NOT_DUE"), "신규 제품에 제품별 문진 레코드를 만들어야 합니다.");
assert(state.operationLog.some((item) => item.target === newProductId && item.actorId === "CUS-001"), "제품 등록 행위자를 운영 로그에 남겨야 합니다.");

const afterFirstProductSave = Store.getState();
assert.equal(Store.saveProduct(productPayload(), { role: "CUSTOMER", id: "CUS-001" }), newProductId, "같은 요청 ID는 최초 제품 ID를 반환해야 합니다.");
assert.equal(Store.getState().meta.revision, afterFirstProductSave.meta.revision, "중복 제품 등록은 상태를 변경하지 않아야 합니다.");
assert.throws(
  () => Store.saveProduct(productPayload({ installedArea: "침실 홈카페" }), { role: "CUSTOMER", id: "CUS-001" }),
  /같은 요청 식별값/,
  "같은 고객의 제품 요청 ID를 다른 내용에 재사용하면 차단해야 합니다."
);
assert.equal(Store.getState().meta.revision, afterFirstProductSave.meta.revision, "제품 요청 fingerprint 충돌은 상태를 변경하지 않아야 합니다.");

const namespacedProductId = Store.saveProduct(
  productPayload({ customerId: "CUS-002", siteId: "SITE-001", installedArea: "회의실", assetTag: "GW-MAPO-03" }),
  { role: "CUSTOMER", id: "CUS-002" }
);
assert.notEqual(namespacedProductId, newProductId, "같은 요청 ID라도 고객이 다르면 별도 제품 요청으로 처리해야 합니다.");
assert.equal(Store.getState().products.find((item) => item.id === namespacedProductId).customerId, "CUS-002", "고객별 요청 네임스페이스가 제품 소유자를 혼합하면 안 됩니다.");

const monthEndProductId = Store.saveProduct(
  productPayload({ customerId: "CUS-003", startedAt: "2026-10-01", lastReplacementAt: "2026-10-31", installedArea: "서재", assetTag: null, requestId: "REQ-PRODUCT-MONTH-END" }),
  { role: "CUSTOMER", id: "CUS-003" }
);
assert.equal(Store.getState().products.find((item) => item.id === monthEndProductId).nextCareAt, "2027-02-28", "월말 교체일의 다음 케어일은 대상 월의 마지막 날짜로 보정해야 합니다.");

const beforeUnauthorizedProduct = Store.getState();
assert.throws(
  () => Store.saveProduct(productPayload({ id: newProductId, requestId: "REQ-UNAUTHORIZED" }), { role: "CUSTOMER", id: "CUS-002" }),
  /본인 계정/,
  "다른 고객은 제품을 수정할 수 없어야 합니다."
);
assert.equal(Store.getState().meta.revision, beforeUnauthorizedProduct.meta.revision, "제품 수정 권한 실패는 리비전을 변경하지 않아야 합니다.");

Store.saveProduct(productPayload({ id: newProductId, managementType: "셀프관리형", installedArea: "주방", lastReplacementAt: "2026-07-10", requestId: "REQ-PRODUCT-V11-UPDATE" }), { role: "CUSTOMER", id: "CUS-001" });
state = Store.getState();
newProduct = state.products.find((item) => item.id === newProductId);
assert.equal(newProduct.managementType, "셀프관리형", "본인 제품의 관리 유형을 수정할 수 있어야 합니다.");
assert.equal(newProduct.nextCareAt, "2026-11-10", "교체일 수정 시 다음 케어일을 다시 계산해야 합니다.");
assert(state.auditLog.some((item) => item.target === newProductId && item.action === "제품 정보 수정" && item.detail.includes("before")), "제품 수정 전후값을 감사 이력에 남겨야 합니다.");
const currentSubscriptionIds = state.products.map((product) => product.subscriptionId);
assert.equal(new Set(currentSubscriptionIds).size, currentSubscriptionIds.length, "신규 등록 후에도 subscriptionId가 중복되면 안 됩니다.");

// Deterministic questionnaire generation, five required answers and inquiry linkage.
Store.refreshDueQuestionnaires("2026-10-20T00:00:00+09:00");
assert.equal(latestQuestionnaire(Store.getState(), newProductId).status, "NOT_DUE", "해당 제품의 기준일 전에는 문진을 생성하지 않아야 합니다.");
Store.refreshDueQuestionnaires("2026-11-04T00:00:00+09:00");
state = Store.getState();
let questionnaire = latestQuestionnaire(state, newProductId);
assert.equal(questionnaire.status, "READY", "케어 7일 전 기준을 지나면 제품 문진을 활성화해야 합니다.");
assert(questionnaire.generatedAt && questionnaire.dueAt === "2026-11-10", "문진 생성일과 대상 케어일을 보존해야 합니다.");
const questionnaireRevision = state.meta.revision;
Store.refreshDueQuestionnaires("2026-11-05T00:00:00+09:00");
assert.equal(Store.getState().meta.revision, questionnaireRevision, "중복 자동 생성은 리비전을 올리지 않아야 합니다.");

const fiveAnswers = { flow: "정상", leak: "없음", taste: "이상 없음", temperature: "냉수·온수 정상", performedActions: "출수 후 상태 확인" };
const beforeIncompleteQuestionnaire = Store.getState();
assert.throws(
  () => Store.submitQuestionnaire("CUS-001", newProductId, { flow: "정상", leak: "없음", taste: "정상", temperature: "정상" }, { role: "CUSTOMER", id: "CUS-001" }),
  /모든 필수 항목/,
  "다섯 문항 중 하나라도 빠지면 제출을 차단해야 합니다."
);
assert.equal(Store.getState().meta.revision, beforeIncompleteQuestionnaire.meta.revision, "문진 필수값 실패는 상태를 변경하지 않아야 합니다.");
assert.throws(
  () => Store.submitQuestionnaire("CUS-001", newProductId, fiveAnswers, { role: "CUSTOMER", id: "CUS-002" }),
  /본인 제품/,
  "다른 고객은 제품 문진을 제출할 수 없어야 합니다."
);
Store.submitQuestionnaire("CUS-001", newProductId, fiveAnswers, { role: "CUSTOMER", id: "CUS-001" });
state = Store.getState();
questionnaire = latestQuestionnaire(state, newProductId);
assert.equal(questionnaire.status, "SUBMITTED", "다섯 필수 문항이 모두 있으면 문진을 제출해야 합니다.");
assert.deepEqual(Object.keys(questionnaire.answers).sort(), ["flow", "leak", "performedActions", "taste", "temperature"].sort(), "문진 다섯 항목을 제품 레코드에 보존해야 합니다.");

const inquiryId = Store.createInquiry({ customerId: "CUS-001", productId: newProductId, symptomTypes: ["LOW_FLOW"], description: "새 제품에서 출수가 평소보다 약해졌어요.", requestId: "REQ-INQUIRY-V11-001" }, { role: "CUSTOMER", id: "CUS-001" });
state = Store.getState();
questionnaire = latestQuestionnaire(state, newProductId);
assert.equal(questionnaire.inquiryId, inquiryId, "제품의 제출 문진을 같은 제품 문의에 연결해야 합니다.");

Store.answerAdditionalQuestions(inquiryId, completeAnswers(), "김하늘", "CUS-001");
state = Store.getState();
const inquiry = state.inquiries.find((item) => item.id === inquiryId);
const validation = Store.validateInquirySchema(inquiryId);
assert.equal(validation.valid, true, "상담·방문 공통 인계 스키마 필수값 검증을 통과해야 합니다.");
assert.equal(inquiry.structured.performedActions, "아직 수행한 조치 없음", "고객이 이미 수행한 조치를 상담·방문 공통 구조에 보존해야 합니다.");
assert(inquiry.timeline.every((item) => Object.prototype.hasOwnProperty.call(item, "fromStatus") && item.toStatus && item.reason), "처리 이력은 이전 상태·변경 상태·사유를 보존해야 합니다.");
assert(inquiry.evidence.length > 0, "승인된 모델 근거가 있을 때만 자가 안내를 만들어야 합니다.");
for (const key of ["documentId", "sectionId", "modelCode", "version", "sourceType", "sourceUrl", "registeredAt", "retrievedAt", "page", "section", "confidence"]) {
  assert.notEqual(inquiry.evidence[0][key], undefined, `근거 메타데이터에 ${key} 필드가 필요합니다.`);
}
assert(state.operationLog.some((item) => item.target === inquiryId && item.category === "AI_CALL"), "문의 구조화 AI 호출 이력을 남겨야 합니다.");
assert(state.operationLog.some((item) => item.target === inquiryId && item.category === "EVIDENCE_SEARCH"), "근거 검색 성공·실패 이력을 남겨야 합니다.");

// Customer ownership and request-id namespaces must be enforced before inquiry mutation.
const beforeInquiryOwnershipFailure = Store.getState();
assert.throws(
  () => Store.createInquiry({ customerId: "CUS-001", productId: "PROD-002", symptomTypes: ["LOW_FLOW"], description: "다른 고객 제품으로 문의를 등록하려고 합니다.", requestId: "REQ-OWNERSHIP-FAIL" }, { role: "CUSTOMER", id: "CUS-001" }),
  /현재 고객에게 등록된 제품/,
  "다른 고객 소유 제품으로 문의를 만들 수 없어야 합니다."
);
assert.throws(
  () => Store.createInquiry({ customerId: "CUS-001", productId: "PROD-001", symptomTypes: ["LOW_FLOW"], description: "다른 계정이 문의를 대신 등록하려고 합니다.", requestId: "REQ-ACTOR-FAIL" }, { role: "CUSTOMER", id: "CUS-002" }),
  /본인 계정/,
  "고객 행위자와 문의 고객이 다르면 등록을 차단해야 합니다."
);
assert.equal(Store.getState().meta.revision, beforeInquiryOwnershipFailure.meta.revision, "문의 소유권 검증 실패는 상태를 변경하지 않아야 합니다.");

const dedupeInquiryPayload = { customerId: "CUS-001", productId: "PROD-001", symptomTypes: ["LOW_FLOW"], description: "정수 출수량이 평소보다 약해졌어요.", requestId: "REQ-INQUIRY-NAMESPACE" };
const dedupeInquiryId = Store.createInquiry(dedupeInquiryPayload, { role: "CUSTOMER", id: "CUS-001" });
const afterFirstInquiryRequest = Store.getState();
assert.equal(Store.createInquiry(dedupeInquiryPayload, { role: "CUSTOMER", id: "CUS-001" }), dedupeInquiryId, "같은 문의 요청은 최초 문의 ID를 반환해야 합니다.");
assert.equal(Store.getState().meta.revision, afterFirstInquiryRequest.meta.revision, "동일 문의 재전송은 상태를 변경하지 않아야 합니다.");
assert.throws(
  () => Store.createInquiry({ ...dedupeInquiryPayload, description: "같은 요청 ID지만 증상이 달라졌어요." }, { role: "CUSTOMER", id: "CUS-001" }),
  /같은 요청 식별값/,
  "같은 고객의 문의 requestId와 다른 fingerprint 조합은 차단해야 합니다."
);
const otherCustomerInquiryId = Store.createInquiry(
  { customerId: "CUS-005", productId: "PROD-005", symptomTypes: ["LOW_FLOW"], description: "사무실 정수 출수량이 약해졌어요.", requestId: "REQ-INQUIRY-NAMESPACE" },
  { role: "CUSTOMER", id: "CUS-005" }
);
assert.notEqual(otherCustomerInquiryId, dedupeInquiryId, "같은 requestId라도 고객이 다르면 별도 문의를 생성해야 합니다.");

// Only fields not extracted from the original text may be asked again; non-danger signals are reclassified.
const partialInquiryId = Store.createInquiry(
  {
    customerId: "CUS-001",
    productId: "PROD-001",
    symptomTypes: ["LOW_FLOW"],
    description: "오늘 아침 냉수에서 계속 약하게 나오고 오류 표시 없음. 원수 밸브를 확인했어요.",
    requestId: "REQ-MISSING-ONLY"
  },
  { role: "CUSTOMER", id: "CUS-001" }
);
state = Store.getState();
let partialInquiry = state.inquiries.find((item) => item.id === partialInquiryId);
assert.deepEqual(Array.from(partialInquiry.pendingFields).sort(), ["companion", "recentNonUse"], "최초 원문에서 확인하지 못한 필드만 추가 질문해야 합니다.");
assert.equal(partialInquiry.pendingQuestions.length, 2, "확인된 내용을 중복 질문하면 안 됩니다.");
assert(!partialInquiry.pendingFields.includes("started") && !partialInquiry.pendingFields.includes("targetWater") && !partialInquiry.pendingFields.includes("performedActions"), "원문에서 추출한 필드는 질문 대상에서 제외해야 합니다.");
assert.throws(
  () => Store.answerAdditionalQuestions(partialInquiryId, { companion: "특이사항 없음", recentNonUse: "해당 없음" }, "다른 고객", "CUS-002"),
  /본인 문의/,
  "다른 고객은 추가 질문에 답변할 수 없어야 합니다."
);
Store.answerAdditionalQuestions(partialInquiryId, { companion: "특이사항 없음", recentNonUse: "해당 없음" }, "김하늘", "CUS-001");
state = Store.getState();
partialInquiry = state.inquiries.find((item) => item.id === partialInquiryId);
assert.equal(partialInquiry.status, "SELF_ACTION", "누락 필드만 보완한 뒤 근거 기반 안내로 전환해야 합니다.");
assert.equal(partialInquiry.risk, "CAUTION", "반복되는 비위험 증상은 CAUTION으로 재분류해야 합니다.");
assert.equal(partialInquiry.priority, "HIGH", "비위험 CAUTION 문의는 HIGH 우선순위로 재분류해야 합니다.");
assert(partialInquiry.candidates.some((item) => item.includes("필터 잔여율 18%")), "점검 후보에 현재 필터 잔여율을 반영해야 합니다.");
assert(partialInquiry.candidates.some((item) => item.includes("최근 케어 2026-03-18")), "점검 후보에 최근 관리일을 반영해야 합니다.");
assert(partialInquiry.candidates.some((item) => item.includes("필터 교체·유로 살균 완료")), "점검 후보에 최근 관리 결과를 반영해야 합니다.");

Store.setActionResult(partialInquiryId, "SAME", "김하늘", "CUS-001");
Store.startCounsel(partialInquiryId, "STF-001", "한유진");
Store.saveCounselNote(partialInquiryId, {
  additionalChecks: "고객 원문과 최근 필터 관리 이력을 재확인",
  guidance: "원수 공급 상태와 출수량을 함께 확인하도록 안내",
  result: "현장 유량 점검이 필요하여 방문 검토",
  visitRequired: true,
  confirmedFields: ["started", "targetWater", "started", "unsupportedField"]
}, "STF-001", "한유진");
state = Store.getState();
partialInquiry = state.inquiries.find((item) => item.id === partialInquiryId);
assert.equal(partialInquiry.counselor.record.additionalChecks, "고객 원문과 최근 필터 관리 이력을 재확인", "상담 추가 확인사항을 별도 필드로 저장해야 합니다.");
assert.equal(partialInquiry.counselor.record.guidance, "원수 공급 상태와 출수량을 함께 확인하도록 안내", "고객 안내 내용을 구조화해 저장해야 합니다.");
assert.equal(partialInquiry.counselor.record.result, "현장 유량 점검이 필요하여 방문 검토", "상담 결과를 구조화해 저장해야 합니다.");
assert.equal(partialInquiry.counselor.record.visitRequired, true, "방문 필요 여부를 상담 기록에 저장해야 합니다.");
assert.deepEqual(Array.from(partialInquiry.counselor.record.confirmedFields), ["started", "targetWater"], "상담 확인 필드는 허용 목록으로 중복 없이 저장해야 합니다.");
assert.equal(partialInquiry.counselor.note, partialInquiry.counselor.record.result, "기존 상담 메모에는 구조화 상담 결과를 동기화해야 합니다.");

// Processing failures expose retry and counsel paths without dropping the original input or logs.
const failureInquiryId = Store.createInquiry(
  { customerId: "CUS-004", productId: "PROD-004", symptomTypes: ["LOW_FLOW"], description: "정수 출수 상태를 확인하고 싶어요.", requestId: "REQ-PROCESSING-FAILURE" },
  { role: "CUSTOMER", id: "CUS-004" }
);
let failureInquiry = Store.getState().inquiries.find((item) => item.id === failureInquiryId);
const preservedFailureInput = { description: failureInquiry.description, structured: JSON.stringify(failureInquiry.structured), pendingFields: JSON.stringify(failureInquiry.pendingFields) };
assert.throws(
  () => Store.recordProcessingFailure(failureInquiryId, { type: "AI_TIMEOUT", reason: "응답 제한 시간 초과", durationMs: 10000 }, "CUS-001"),
  /본인 문의/,
  "다른 고객은 처리 오류를 등록할 수 없어야 합니다."
);
Store.recordProcessingFailure(failureInquiryId, { type: "AI_TIMEOUT", reason: "응답 제한 시간 초과", durationMs: 10000 }, "CUS-004");
state = Store.getState();
failureInquiry = state.inquiries.find((item) => item.id === failureInquiryId);
assert.equal(failureInquiry.processingFailure.status, "FAILED", "처리 실패 상태를 문의에 기록해야 합니다.");
assert.equal(failureInquiry.workflow.routingDecision, "RETRY_OR_COUNSEL", "실패 후 재시도와 상담 전환 선택을 제공해야 합니다.");
assert(state.operationLog.some((item) => item.target === failureInquiryId && item.category === "ERROR" && item.outcome === "AI_TIMEOUT"), "AI timeout 오류 로그를 보존해야 합니다.");

Store.retryProcessing(failureInquiryId, "CUS-004");
state = Store.getState();
failureInquiry = state.inquiries.find((item) => item.id === failureInquiryId);
assert.equal(failureInquiry.processingFailure.status, "RECOVERED", "재시도 성공 상태를 기록해야 합니다.");
assert.equal(failureInquiry.processingFailure.retryCount, 1, "재시도 횟수를 누적해야 합니다.");
assert.equal(failureInquiry.description, preservedFailureInput.description, "재시도 후 고객 원문을 보존해야 합니다.");
assert.equal(JSON.stringify(failureInquiry.structured), preservedFailureInput.structured, "재시도 후 구조화 입력을 보존해야 합니다.");
assert.equal(JSON.stringify(failureInquiry.pendingFields), preservedFailureInput.pendingFields, "재시도 후 미응답 필드를 보존해야 합니다.");
assert(state.operationLog.some((item) => item.target === failureInquiryId && item.outcome === "RETRY_SUCCESS"), "재시도 성공 로그를 추가해야 합니다.");
assert(state.operationLog.some((item) => item.target === failureInquiryId && item.category === "ERROR"), "재시도 성공 후에도 최초 오류 로그를 유지해야 합니다.");

Store.requestCounsel(failureInquiryId, "최유나", "CUS-004");
state = Store.getState();
failureInquiry = state.inquiries.find((item) => item.id === failureInquiryId);
assert.equal(failureInquiry.status, "WAITING_COUNSEL", "복구 후에도 고객이 상담 전환을 선택할 수 있어야 합니다.");
assert.equal(failureInquiry.processingFailure.status, "RECOVERED", "상담 전환 후에도 처리 실패·복구 이력을 보존해야 합니다.");
assert(["PROCESSING_FAILED", "PROCESSING_RETRIED", "WAITING_COUNSEL"].every((type) => failureInquiry.timeline.some((item) => item.type === type)), "처리 실패·재시도·상담 전환 이력을 모두 보존해야 합니다.");

// No-evidence routing and operational exception records must be explainable.
const noEvidenceId = Store.createInquiry({ customerId: "CUS-004", productId: "PROD-004", symptomTypes: ["OTHER"], description: "설명서에서 찾지 못한 새로운 표시가 반복됩니다.", requestId: "REQ-NO-EVIDENCE-V11" }, { role: "CUSTOMER", id: "CUS-004" });
Store.answerAdditionalQuestions(noEvidenceId, completeAnswers({ targetWater: "전체", errorCode: "미확인 표시" }), "최유나", "CUS-004");
Store.refreshDueQuestionnaires("2026-07-21T12:00:00+09:00");
const exceptions = Store.detectOperationalExceptions("2026-07-21T12:00:00+09:00");
assert(exceptions.some((item) => item.type === "EVIDENCE_NOT_FOUND" && item.inquiryId === noEvidenceId), "근거 검색 실패를 운영 예외로 감지해야 합니다.");
assert(exceptions.every((item) => item.type && item.targetId && item.reason && item.lastStage && item.detectedAt && item.ownerRole), "운영 예외에 유형·대상·사유·마지막 단계·감지시각·담당이 필요합니다.");

// A UTC completion timestamp must use the Seoul calendar date and open a new questionnaire cycle.
state = Store.getState();
const visitProductBefore = state.products.find((item) => item.id === "PROD-002");
const questionnaireBeforeVisit = latestQuestionnaire(state, "PROD-002");
const submittedCycleIdsBeforeVisit = state.questionnaires.filter((item) => item.productId === "PROD-002" && item.status === "SUBMITTED").map((item) => item.id);
assert.equal(questionnaireBeforeVisit.dueAt, visitProductBefore.nextCareAt, "방문 완료 전 현재 문진 주기가 제품의 기존 케어일과 일치해야 합니다.");

Store.completeVisit("INQ-260715-014", visitCompletionOptions({ completedAt: "2026-07-21T15:30:00.000Z" }));
state = Store.getState();
const visitProductAfter = state.products.find((item) => item.id === "PROD-002");
const questionnaireAfterVisit = latestQuestionnaire(state, "PROD-002");
assert.equal(visitProductAfter.lastCareAt, "2026-07-22", "UTC 방문 완료 시각은 Asia/Seoul 달력 날짜로 저장해야 합니다.");
assert.equal(visitProductAfter.nextCareAt, "2026-11-22", "KST 방문 완료일 기준으로 다음 케어일을 계산해야 합니다.");
assert.equal(visitProductAfter.careHistory.find((item) => item.id === "CARE-INQ-260715-014").date, "2026-07-22", "케어 이력 날짜도 KST 완료일과 같아야 합니다.");
assert.notEqual(questionnaireAfterVisit.id, questionnaireBeforeVisit.id, "방문 완료 후에는 다음 케어용 신규 문진 주기를 생성해야 합니다.");
assert.equal(questionnaireAfterVisit.dueAt, "2026-11-22", "신규 문진 주기는 갱신된 다음 케어일을 사용해야 합니다.");
assert.equal(questionnaireAfterVisit.status, "NOT_DUE", "방문 직후 신규 문진은 아직 미도래 상태여야 합니다.");
assert.equal(state.questionnaires.find((item) => item.id === questionnaireBeforeVisit.id).status, "SUPERSEDED", "미제출 이전 문진 주기는 대체 상태로 보존해야 합니다.");
assert(submittedCycleIdsBeforeVisit.every((id) => state.questionnaires.some((item) => item.id === id && item.status === "SUBMITTED")), "이전 제출 문진 이력은 신규 주기 생성 후에도 보존해야 합니다.");

const operationJson = JSON.stringify(Store.getState().operationLog);
assert(!operationJson.includes("010-"), "운영 로그에 고객 전화번호를 남기면 안 됩니다.");
assert(!operationJson.includes('"strokes"'), "운영 로그에 전자서명 좌표를 남기면 안 됩니다.");

// CUSTOMER role and active flags are enforced for inquiry creation, not only displayed in the UI.
const activeStateSnapshot = storage.get(Store.STORAGE_KEY);
const inactiveState = JSON.parse(activeStateSnapshot);
inactiveState.customers.find((item) => item.id === "CUS-004").active = false;
storage.set(Store.STORAGE_KEY, JSON.stringify(inactiveState));
const inactiveCustomerStore = loadStore();
assert.throws(
  () => inactiveCustomerStore.createInquiry({ customerId: "CUS-004", productId: "PROD-004", symptomTypes: ["LOW_FLOW"], description: "비활성 계정 문의", requestId: "REQ-INACTIVE-CUSTOMER" }, { role: "CUSTOMER", id: "CUS-004" }),
  /활성 상태인 고객 계정/,
  "비활성 고객 계정은 신규 문의를 만들 수 없어야 합니다."
);

const invalidRoleState = JSON.parse(activeStateSnapshot);
invalidRoleState.customers.find((item) => item.id === "CUS-005").role = "PARTNER";
storage.set(Store.STORAGE_KEY, JSON.stringify(invalidRoleState));
const invalidRoleStore = loadStore();
assert.throws(
  () => invalidRoleStore.createInquiry({ customerId: "CUS-005", productId: "PROD-005", symptomTypes: ["LOW_FLOW"], description: "고객 역할이 아닌 계정 문의", requestId: "REQ-INVALID-CUSTOMER-ROLE" }, { role: "CUSTOMER", id: "CUS-005" }),
  /활성 상태인 고객 계정/,
  "CUSTOMER 역할이 아닌 계정은 신규 문의를 만들 수 없어야 합니다."
);
storage.set(Store.STORAGE_KEY, activeStateSnapshot);

console.log("requirements-v11: PASS");
