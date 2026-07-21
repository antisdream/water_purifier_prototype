import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const sharedStorage = new Map();
const channelMessages = [];
const channelPeers = new Map();

class FakeStorage {
  getItem(key) { return sharedStorage.has(key) ? sharedStorage.get(key) : null; }
  setItem(key, value) { sharedStorage.set(key, String(value)); }
  removeItem(key) { sharedStorage.delete(key); }
}

class FakeBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    if (!channelPeers.has(name)) channelPeers.set(name, new Set());
    channelPeers.get(name).add(this);
  }
  postMessage(message) {
    channelMessages.push({ name: this.name, message });
    for (const peer of channelPeers.get(this.name) || []) {
      if (peer !== this && typeof peer.onmessage === "function") {
        peer.onmessage({ data: JSON.parse(JSON.stringify(message)) });
      }
    }
  }
  close() {
    const peers = channelPeers.get(this.name);
    if (peers) peers.delete(this);
  }
}

function loadContext() {
  const eventListeners = new Map();
  const window = {
    localStorage: new FakeStorage(),
    BroadcastChannel: FakeBroadcastChannel,
    addEventListener(type, listener) {
      if (!eventListeners.has(type)) eventListeners.set(type, []);
      eventListeners.get(type).push(listener);
    },
    dispatchEvent() {},
    __dispatchTestEvent(type, event) {
      for (const listener of eventListeners.get(type) || []) listener(event);
    }
  };
  const context = vm.createContext({ window, console, Date, JSON, CustomEvent: class CustomEvent {} });
  vm.runInContext(fs.readFileSync(path.join(root, "assets/js/mock-data.js"), "utf8"), context, { filename: "mock-data.js" });
  vm.runInContext(fs.readFileSync(path.join(root, "assets/js/workflow-config.js"), "utf8"), context, { filename: "workflow-config.js" });
  vm.runInContext(fs.readFileSync(path.join(root, "assets/js/store.js"), "utf8"), context, { filename: "store.js" });
  return context.window;
}

function loadProductViewerHelpers() {
  const window = {};
  const context = vm.createContext({ window, console, Number });
  vm.runInContext(fs.readFileSync(path.join(root, "assets/js/product-viewer.js"), "utf8"), context, { filename: "product-viewer.js" });
  return context.window.WaterCareProductViewer.helpers;
}

function futureIso(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function getInquiry(state, inquiryId) {
  return state.inquiries.find((item) => item.id === inquiryId);
}

function getProduct(state, productId) {
  return state.products.find((item) => item.id === productId);
}

function notificationsFor(state, role, recipientId, eventType, inquiryId) {
  return (state.notifications || []).filter((item) =>
    item.recipientRole === role &&
    item.recipientId === recipientId &&
    (!eventType || item.eventType === eventType) &&
    (!inquiryId || item.inquiryId === inquiryId)
  );
}

function oneNotification(state, role, recipientId, eventType, inquiryId) {
  const matches = notificationsFor(state, role, recipientId, eventType, inquiryId);
  assert.equal(matches.length, 1, `${role}/${recipientId}의 ${eventType} 알림은 문의별 1건이어야 합니다.`);
  return matches[0];
}

function timelinePosition(inquiry, type) {
  return inquiry.timeline.findIndex((item) => item.type === type);
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

function completeOptions(overrides = {}) {
  return {
    serviceType: "REPAIR",
    result: "RESOLVED",
    cause: "출수 성능과 필터 상태를 현장에서 확인함",
    actions: ["출수·온도 성능 확인", "필터·카트리지 교체"],
    replacement: "복합 필터",
    engineerId: "STF-002",
    engineerName: "오세훈",
    signerName: "김하늘",
    signerRelationship: "SELF",
    signerPosition: "본인",
    signatureConsent: true,
    signatureData: validSignature(),
    ...overrides
  };
}

sharedStorage.clear();
channelMessages.length = 0;

const firstWindow = loadContext();
const Store = firstWindow.WaterCareStore;
const initial = Store.getState();

// Seed volume and relational integrity, including business accounts and multi-product ownership.
assert.equal(initial.meta.schemaVersion, 11, "제품 문진·방문 일정 상태·운영 로그를 포함한 스키마는 v11이어야 합니다.");
assert.equal(initial.customers.length, 5, "고객 가상 데이터는 5건이어야 합니다.");
assert.equal(initial.products.length, 6, "기업 복수제품을 포함해 제품 가상 데이터는 6건이어야 합니다.");
assert.equal(initial.inquiries.length, 5, "문의 가상 데이터는 5건이어야 합니다.");
assert.equal(new Set(initial.inquiries.map((item) => item.id)).size, initial.inquiries.length, "문의 ID는 고유해야 합니다.");

const customerIds = new Set(initial.customers.map((item) => item.id));
const productIds = new Set(initial.products.map((item) => item.id));
const productModelIds = new Set(initial.productModels.map((item) => item.id));
const organizationIds = new Set(initial.organizations.map((item) => item.id));
const siteIds = new Set(initial.sites.map((item) => item.id));

// Seed notifications are role-scoped, traceable to a case and already useful in each bell menu.
assert.equal(initial.notifications.length, 10, "고객·상담사·방문기사·운영자용 가상 알림 10건이 필요합니다.");
assert.equal(new Set(initial.notifications.map((item) => item.id)).size, initial.notifications.length, "알림 ID는 고유해야 합니다.");
const allowedNotificationRoles = new Set(["CUSTOMER", "COUNSELOR", "ENGINEER", "OPERATOR"]);
const allowedNotificationTones = new Set(["neutral", "info", "warning", "danger", "success"]);
for (const notification of initial.notifications) {
  assert(allowedNotificationRoles.has(notification.recipientRole), `${notification.id} 수신자 역할이 유효해야 합니다.`);
  assert(allowedNotificationTones.has(notification.tone), `${notification.id} 알림 톤이 유효해야 합니다.`);
  assert(String(notification.eventType || "").length > 0, `${notification.id} 이벤트 유형이 필요합니다.`);
  assert(String(notification.title || "").length > 0 && String(notification.message || "").length > 0, `${notification.id} 제목과 메시지가 필요합니다.`);
  assert(initial.inquiries.some((item) => item.id === notification.inquiryId), `${notification.id} 연결 문의가 유효해야 합니다.`);
  if (notification.recipientRole === "CUSTOMER") {
    assert(customerIds.has(notification.recipientId), `${notification.id} 고객 수신자가 유효해야 합니다.`);
  } else {
    const recipient = initial.staff.find((item) => item.id === notification.recipientId);
    assert(recipient && recipient.role === notification.recipientRole, `${notification.id} 관계자 수신자와 역할이 일치해야 합니다.`);
  }
  assert(!Number.isNaN(Date.parse(notification.createdAt)), `${notification.id} 생성 시각이 ISO 날짜여야 합니다.`);
  assert(notification.readAt === null || !Number.isNaN(Date.parse(notification.readAt)), `${notification.id} 읽음 시각이 null 또는 ISO 날짜여야 합니다.`);
}
const seedUnread = (role, recipientId) => initial.notifications.filter((item) => item.recipientRole === role && item.recipientId === recipientId && !item.readAt).length;
assert.equal(seedUnread("CUSTOMER", "CUS-001"), 2, "김하늘 고객의 초기 미확인 알림은 2건이어야 합니다.");
assert.equal(seedUnread("COUNSELOR", "STF-001"), 3, "한유진 상담사의 초기 미확인 알림은 3건이어야 합니다.");
assert.equal(seedUnread("ENGINEER", "STF-002"), 1, "오세훈 기사의 초기 미확인 알림은 1건이어야 합니다.");

for (const organization of initial.organizations) {
  assert(customerIds.has(organization.customerId), `${organization.id} 기업 고객 FK가 유효해야 합니다.`);
}
for (const site of initial.sites) {
  assert(organizationIds.has(site.organizationId), `${site.id} 조직 FK가 유효해야 합니다.`);
}
for (const product of initial.products) {
  assert(customerIds.has(product.customerId), `${product.id} 고객 FK가 유효해야 합니다.`);
  assert(productModelIds.has(product.modelId), `${product.id} 실제 제품 모델 FK가 유효해야 합니다.`);
  const model = initial.productModels.find((item) => item.id === product.modelId);
  assert.equal(product.model, model.modelCode, `${product.id} 모델 코드와 카탈로그 코드가 같아야 합니다.`);
  assert.equal(product.modelLabel, model.name, `${product.id} 표시명과 카탈로그 제품명이 같아야 합니다.`);
  assert.match(product.serial, /^DEMO-/, `${product.id} 시리얼은 시연 데이터임을 명확히 표시해야 합니다.`);
}
for (const inquiry of initial.inquiries) {
  assert(customerIds.has(inquiry.customerId), `${inquiry.id} 고객 FK가 유효해야 합니다.`);
  assert(productIds.has(inquiry.productId), `${inquiry.id} 제품 FK가 유효해야 합니다.`);
  assert.equal(getProduct(initial, inquiry.productId).customerId, inquiry.customerId, `${inquiry.id} 제품은 같은 고객 소유여야 합니다.`);
}

// Knowledge metadata and keyword analysis must trace back to the five synthetic inquiries.
assert.equal(initial.knowledgeDocuments.length, 3, "제품 문서 2건과 공통 안전 규칙 1건이 필요합니다.");
assert.equal(initial.knowledgeKeywordInsights.length, 7, "애로·요구·안전·분석 대기 키워드 7건이 필요합니다.");
assert.equal(initial.knowledgeAnalysisMeta.source, "DEMO_KEYWORD_ANALYSIS", "키워드 분석은 시연 데이터임을 명시해야 합니다.");
const inquiryIds = new Set(initial.inquiries.map((item) => item.id));
const modelCodes = new Set(initial.productModels.map((item) => item.modelCode));
const knowledgeDocumentIds = new Set(initial.knowledgeDocuments.map((doc) => doc.id));
const knowledgeSectionIds = new Set();
assert.equal(knowledgeDocumentIds.size, initial.knowledgeDocuments.length, "지식 문서 ID는 고유해야 합니다.");
for (const doc of initial.knowledgeDocuments) {
  assert.equal(doc.demoOnly, true, `${doc.id}는 가상 메타데이터임을 명시해야 합니다.`);
  assert.equal(doc.sourceType, "DEMO_METADATA", `${doc.id}의 시연 출처 유형이 필요합니다.`);
  assert(doc.modelCode === "COMMON" || modelCodes.has(doc.modelCode), `${doc.id} 제품 모델 코드가 유효해야 합니다.`);
  assert(doc.sections.length > 0, `${doc.id}에 연결 구간이 필요합니다.`);
  for (const section of doc.sections) {
    assert(!knowledgeSectionIds.has(section.id), `${section.id} 문서 구간 ID는 고유해야 합니다.`);
    knowledgeSectionIds.add(section.id);
    for (const inquiryId of section.matchedInquiryIds) assert(inquiryIds.has(inquiryId), `${section.id} 연결 문의 ${inquiryId}가 유효해야 합니다.`);
  }
}
for (const insight of initial.knowledgeKeywordInsights) {
  assert(insight.linkedInquiryIds.length > 0, `${insight.id}에 연결 문의가 필요합니다.`);
  for (const inquiryId of insight.linkedInquiryIds) assert(inquiryIds.has(inquiryId), `${insight.id} 연결 문의 ${inquiryId}가 유효해야 합니다.`);
  for (const relation of insight.relatedSections) {
    assert(knowledgeDocumentIds.has(relation.documentId), `${insight.id} 연결 문서 ${relation.documentId}가 유효해야 합니다.`);
    assert(knowledgeSectionIds.has(relation.sectionId), `${insight.id} 연결 구간 ${relation.sectionId}가 유효해야 합니다.`);
    const relationDoc = initial.knowledgeDocuments.find((doc) => doc.id === relation.documentId);
    assert(relationDoc.sections.some((section) => section.id === relation.sectionId), `${insight.id} 구간은 지정 문서에 속해야 합니다.`);
  }
}
const lowFlowInsight = initial.knowledgeKeywordInsights.find((item) => item.keyword === "출수량 저하");
assert.deepEqual([...lowFlowInsight.linkedInquiryIds].sort(), ["INQ-260716-001", "INQ-260716-005"].sort(), "출수량 저하는 관련 문의 2건과 연결되어야 합니다.");
const leakInsight = initial.knowledgeKeywordInsights.find((item) => item.keyword === "누수·전원부 물기");
assert.equal(leakInsight.severity, "DANGER", "누수·전원부 물기는 위험 키워드여야 합니다.");
assert(leakInsight.relatedSections.some((item) => item.sectionId === "SEC-SAFE-LEAK"), "누수 키워드는 SAFE-LEAK-02 구간과 연결되어야 합니다.");
const pendingInsight = initial.knowledgeKeywordInsights.find((item) => item.category === "PENDING");
assert.deepEqual([...pendingInsight.linkedInquiryIds], ["INQ-260716-005"], "추가 질문 사례는 근거 실패가 아니라 분석 대기로 구분해야 합니다.");
assert(!pendingInsight.relatedSections.some((item) => item.sectionId === "SEC-SAFE-EVIDENCE"), "분석 대기를 공식 근거 실패로 오분류하면 안 됩니다.");

const businessCustomers = initial.customers.filter((item) => item.customerType === "BUSINESS");
assert.equal(businessCustomers.length, 2, "기업 고객 가상 데이터가 2건 있어야 합니다.");
for (const customer of businessCustomers) {
  const organization = initial.organizations.find((item) => item.customerId === customer.id);
  assert(organization, `${customer.id} 기업 고객의 조직 FK가 필요합니다.`);
  const sites = initial.sites.filter((item) => item.organizationId === organization.id);
  const contacts = initial.contacts.filter((item) => item.organizationId === organization.id);
  assert(sites.length > 0, `${organization.id} 조직에 사업장이 필요합니다.`);
  assert(contacts.length > 0, `${organization.id} 조직에 담당자가 필요합니다.`);
  for (const contact of contacts) {
    assert(organizationIds.has(contact.organizationId), `${contact.id} 조직 FK가 유효해야 합니다.`);
    assert(siteIds.has(contact.siteId), `${contact.id} 사업장 FK가 유효해야 합니다.`);
    assert.equal(initial.sites.find((site) => site.id === contact.siteId).organizationId, contact.organizationId, `${contact.id} 담당자 사업장은 같은 조직 소속이어야 합니다.`);
    assert.equal(contact.signatureAuthority, true, `${contact.id} 대표 담당자는 작업 확인 서명 권한이 있어야 합니다.`);
  }
}
assert(
  businessCustomers.some((customer) => initial.products.filter((product) => product.customerId === customer.id).length > 1),
  "적어도 한 기업 고객은 여러 설치 제품을 관리해야 합니다."
);

// Customer schedule UI fixtures must cover empty, retryable and completed states.
const noScheduleCases = initial.inquiries.filter((item) => item.customerId === "CUS-001");
assert(noScheduleCases.length > 0 && noScheduleCases.every((item) => !item.visit), "CUS-001은 일정 없음 화면을 검증할 수 있어야 합니다.");
const retryableScheduleCase = initial.inquiries.find((item) => item.customerId === "CUS-002" && item.visit && item.visit.status === "SCHEDULED");
assert(retryableScheduleCase, "CUS-002에 방문 예정 일정이 있어야 합니다.");
assert.equal(retryableScheduleCase.visit.rescheduleRequest.status, "REJECTED", "CUS-002는 반려 후 일정 재변경 버튼을 바로 체험할 수 있어야 합니다.");
assert.equal(retryableScheduleCase.visit.rescheduleHistory.length, 1, "기존 일정 변경 검토 이력이 보존되어야 합니다.");
const completedScheduleCase = initial.inquiries.find((item) => item.customerId === "CUS-003" && item.visit && item.visit.status === "COMPLETED");
assert(completedScheduleCase, "CUS-003은 완료 방문 이력 화면을 검증할 수 있어야 합니다.");

for (const customer of initial.customers) {
  assert.match(customer.phone, /\*{4}/, "전화번호는 마스킹되어야 합니다.");
  assert(productIds.has(customer.productId), `${customer.id} 대표 제품 FK가 유효해야 합니다.`);
}
assert.equal(initial.productModels.length, 2, "실제 SK매직 모델 카탈로그는 2종이어야 합니다.");
for (const model of initial.productModels) {
  assert.equal(model.manufacturer, "SK매직", `${model.id} 제조사 표기가 필요합니다.`);
  assert.match(model.modelCode, /^WPU/, `${model.id} 공식 모델 코드가 필요합니다.`);
  assert.equal(model.capabilities.waterDispense, true, `${model.id} 출수량 수집 기능 표기가 필요합니다.`);
  assert.equal(typeof model.capabilities.ice, "boolean", `${model.id} 제빙 지원 여부가 명시되어야 합니다.`);
  assert(fs.existsSync(path.join(root, model.imagePath)), `${model.id} 로컬 제품 이미지가 필요합니다.`);
  assert.equal(model.manuals.length, 2, `${model.id} 기능 설정과 필터·청소 매뉴얼이 각각 필요합니다.`);
  assert(model.manuals.some((item) => item.kind === "기능 설정"), `${model.id} 기능 설정 영상이 필요합니다.`);
  assert(model.manuals.some((item) => item.kind === "필터·청소"), `${model.id} 필터·청소 영상이 필요합니다.`);
  for (const manual of model.manuals) {
    assert.equal(manual.source, "SK매직 매직매뉴얼", `${manual.id} 공식 채널 출처가 필요합니다.`);
    assert.equal(manual.watchUrl, `https://www.youtube.com/watch?v=${manual.videoId}`, `${manual.id} YouTube 영상 ID와 URL이 일치해야 합니다.`);
    assert(fs.existsSync(path.join(root, manual.thumbnailPath)), `${manual.id} 로컬 영상 썸네일이 필요합니다.`);
  }
}

// Product usage telemetry is deterministic, aligned across all ranges and capability-aware.
const expectedRangeLengths = { hourly: 24, weekly: 7, monthly: 6 };
for (const [range, count] of Object.entries(expectedRangeLengths)) {
  assert(initial.usagePeriods[range], `${range} 조회 기간 메타데이터가 필요합니다.`);
  assert.equal(initial.usagePeriods[range].labels.length, count, `${range} 축 라벨은 ${count}개여야 합니다.`);
}
assert.equal(initial.usageTelemetry.length, initial.products.length, "모든 제품에 사용량 데이터가 하나씩 필요합니다.");
assert.equal(new Set(initial.usageTelemetry.map((item) => item.productId)).size, initial.usageTelemetry.length, "제품별 사용량 데이터는 중복되면 안 됩니다.");
assert.deepEqual(
  [...new Set(initial.usageTelemetry.map((item) => item.productId))].sort(),
  [...productIds].sort(),
  "사용량 제품 집합과 등록 제품 집합이 같아야 합니다."
);
for (const telemetry of initial.usageTelemetry) {
  const telemetryProduct = initial.products.find((item) => item.id === telemetry.productId);
  const telemetryModel = initial.productModels.find((item) => item.id === telemetryProduct.modelId);
  assert.equal(telemetry.source, "DEMO_IOT", `${telemetry.productId} 데이터가 시연 센서 데이터임을 표시해야 합니다.`);
  assert(telemetry.completeness >= 0 && telemetry.completeness <= 100, `${telemetry.productId} 수집률 범위가 유효해야 합니다.`);
  for (const [range, count] of Object.entries(expectedRangeLengths)) {
    const rangeSeries = telemetry.series[range];
    assert(rangeSeries, `${telemetry.productId} ${range} 시계열이 필요합니다.`);
    assert.equal(rangeSeries.water.length, count, `${telemetry.productId} ${range} 출수량 길이가 축과 일치해야 합니다.`);
    assert(rangeSeries.water.every((value) => Number.isFinite(value) && value >= 0), `${telemetry.productId} ${range} 출수량은 비음수 유한값이어야 합니다.`);
    assert.equal(rangeSeries.coldWater.length, count, `${telemetry.productId} ${range} 냉수 길이가 축과 일치해야 합니다.`);
    assert.equal(rangeSeries.hotWater.length, count, `${telemetry.productId} ${range} 온수 길이가 축과 일치해야 합니다.`);
    assert(rangeSeries.coldWater.every((value) => Number.isFinite(value) && value >= 0), `${telemetry.productId} ${range} 냉수는 비음수 유한값이어야 합니다.`);
    assert(rangeSeries.hotWater.every((value) => Number.isFinite(value) && value >= 0), `${telemetry.productId} ${range} 온수는 비음수 유한값이어야 합니다.`);
    rangeSeries.water.forEach((total, index) => {
      assert(Math.abs(total - rangeSeries.coldWater[index] - rangeSeries.hotWater[index]) < 0.001, `${telemetry.productId} ${range} ${index} 냉수+온수는 총 출수량과 일치해야 합니다.`);
    });
    if (telemetryModel.capabilities.ice) {
      assert(Array.isArray(rangeSeries.ice), `${telemetry.productId} 제빙 모델에는 ${range} 제빙량 배열이 필요합니다.`);
      assert.equal(rangeSeries.ice.length, count, `${telemetry.productId} ${range} 제빙량 길이가 축과 일치해야 합니다.`);
      assert(rangeSeries.ice.every((value) => Number.isFinite(value) && value >= 0), `${telemetry.productId} ${range} 제빙량은 비음수 유한값이어야 합니다.`);
    } else {
      assert.equal(rangeSeries.ice, null, `${telemetry.productId} 비제빙 모델은 0 배열이 아니라 미지원 null이어야 합니다.`);
    }
  }
  const hourlyWaterTotal = telemetry.series.hourly.water.reduce((sum, value) => sum + value, 0);
  const hourlyColdTotal = telemetry.series.hourly.coldWater.reduce((sum, value) => sum + value, 0);
  const hourlyHotTotal = telemetry.series.hourly.hotWater.reduce((sum, value) => sum + value, 0);
  assert(Math.abs(hourlyWaterTotal - telemetry.series.weekly.water.at(-1)) < 0.011, `${telemetry.productId} 오늘 시간별 출수 합계와 주간 마지막 날이 일치해야 합니다.`);
  assert(Math.abs(hourlyColdTotal - telemetry.series.weekly.coldWater.at(-1)) < 0.011, `${telemetry.productId} 오늘 시간별 냉수 합계와 주간 마지막 날이 일치해야 합니다.`);
  assert(Math.abs(hourlyHotTotal - telemetry.series.weekly.hotWater.at(-1)) < 0.011, `${telemetry.productId} 오늘 시간별 온수 합계와 주간 마지막 날이 일치해야 합니다.`);
  if (telemetryModel.capabilities.ice) {
    const hourlyIceTotal = telemetry.series.hourly.ice.reduce((sum, value) => sum + value, 0);
    assert(Math.abs(hourlyIceTotal - telemetry.series.weekly.ice.at(-1)) < 0.011, `${telemetry.productId} 오늘 시간별 제빙 합계와 주간 마지막 날이 일치해야 합니다.`);
  }
}
assert(!fs.readFileSync(path.join(root, "assets/js/mock-data.js"), "utf8").includes("Math.random"), "시연 사용량은 매번 바뀌는 랜덤 데이터면 안 됩니다.");

// Smart preparation profiles keep learned patterns and user-created schedules separate from raw telemetry.
assert.equal(initial.smartPreparationMeta.source, "DEMO_PATTERN_ENGINE", "AI 패턴 엔진은 시연 데이터임을 명시해야 합니다.");
assert.equal(initial.smartPreparationProfiles.length, initial.products.length, "모든 제품에 스마트 준비 프로필이 하나씩 필요합니다.");
assert.deepEqual(
  initial.smartPreparationProfiles.map((item) => item.productId).sort(),
  [...productIds].sort(),
  "스마트 준비 프로필 제품 집합과 등록 제품 집합이 같아야 합니다."
);
assert.equal(new Set(initial.smartPreparationProfiles.map((item) => item.productId)).size, initial.smartPreparationProfiles.length, "제품별 스마트 준비 프로필은 중복되면 안 됩니다.");
const allowedSmartDays = new Set(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
const allowedConsentStates = new Set(["GRANTED", "DECLINED", "NOT_ASKED"]);
for (const profile of initial.smartPreparationProfiles) {
  const smartProduct = getProduct(initial, profile.productId);
  const smartModel = initial.productModels.find((item) => item.id === smartProduct.modelId);
  assert(["AUTO", "MANUAL"].includes(profile.mode), `${profile.productId} 준비 모드가 유효해야 합니다.`);
  assert(allowedConsentStates.has(profile.consent.usageAnalysis), `${profile.productId} 패턴 분석 동의 상태가 유효해야 합니다.`);
  assert(allowedConsentStates.has(profile.consent.autoPreparation), `${profile.productId} 자동 준비 동의 상태가 유효해야 합니다.`);
  if (profile.mode === "AUTO") {
    assert.equal(profile.consent.usageAnalysis, "GRANTED", `${profile.productId} AI 자동 모드는 패턴 분석 동의가 필요합니다.`);
    assert.equal(profile.consent.autoPreparation, "GRANTED", `${profile.productId} AI 자동 모드는 자동 준비 동의가 필요합니다.`);
  }
  const patterns = profile.learning.patterns || [];
  if (profile.learning.status === "READY") {
    assert(profile.learning.sampleDays > 0 && patterns.length > 0, `${profile.productId} READY 학습에는 관찰 기간과 패턴이 필요합니다.`);
  }
  for (const pattern of patterns) {
    const resource = initial.smartPreparationMeta.resources[pattern.resource];
    assert(resource, `${pattern.id} 준비 리소스가 유효해야 합니다.`);
    assert.equal(smartModel.capabilities[resource.capability], true, `${pattern.id} 모델이 ${resource.label} 기능을 지원해야 합니다.`);
    assert(pattern.days.length > 0 && pattern.days.every((day) => allowedSmartDays.has(day)), `${pattern.id} 반복 요일이 유효해야 합니다.`);
    assert(pattern.startHour >= 0 && pattern.startHour < pattern.endHour && pattern.endHour <= 23, `${pattern.id} 반복 시간 범위가 유효해야 합니다.`);
    assert(pattern.observedDays > 0 && pattern.observedDays <= pattern.eligibleDays && pattern.eligibleDays <= profile.learning.sampleDays, `${pattern.id} 관찰 횟수가 분석 기간 안에 있어야 합니다.`);
    assert(pattern.confidence >= 0 && pattern.confidence <= 1, `${pattern.id} 신뢰도 범위가 유효해야 합니다.`);
    assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(pattern.readyAt), `${pattern.id} 준비 완료 시간이 유효해야 합니다.`);
    assert(pattern.expectedAmount > 0 && pattern.unit === resource.unit, `${pattern.id} 예상 사용량 단위가 리소스와 일치해야 합니다.`);
    if (pattern.resource === "HOT_WATER") {
      const telemetry = initial.usageTelemetry.find((item) => item.productId === profile.productId);
      const patternAmount = telemetry.series.hourly.hotWater.slice(pattern.startHour, pattern.endHour + 1).reduce((sum, value) => sum + value, 0);
      assert(Math.abs(patternAmount - pattern.expectedAmount) < 0.011, `${pattern.id} 온수 반복 구간 합계가 AI 예상량과 일치해야 합니다.`);
    }
  }
  for (const schedule of profile.manualSchedules || []) {
    const resource = initial.smartPreparationMeta.resources[schedule.resource];
    assert(resource && smartModel.capabilities[resource.capability], `${schedule.id} 직접 설정 기능이 모델에서 지원되어야 합니다.`);
    assert(schedule.days.length > 0 && schedule.days.every((day) => allowedSmartDays.has(day)), `${schedule.id} 직접 설정 요일이 유효해야 합니다.`);
    assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.readyAt), `${schedule.id} 직접 설정 시간이 유효해야 합니다.`);
    assert(schedule.leadMinutes >= 5 && schedule.leadMinutes <= 60, `${schedule.id} 준비 시작 간격이 유효해야 합니다.`);
  }
}
assert.equal(Store.getEffectiveSmartPreparation("PROD-002").status, "BLOCKED_SAFETY", "안전 점검 제품은 자동 준비가 차단되어야 합니다.");
assert.equal(Store.getEffectiveSmartPreparation("PROD-001").status, "AUTO", "동의된 활성 제품은 AI 자동 준비 상태여야 합니다.");

const smartBeforeDeclinedAuto = Store.getState();
assert.throws(
  () => Store.setSmartPreparationMode("PROD-003", "AUTO", "이서준"),
  /동의 후/,
  "동의하지 않은 고객은 AI 자동 모드를 켤 수 없어야 합니다."
);
assert.equal(Store.getState().meta.revision, smartBeforeDeclinedAuto.meta.revision, "거절된 AI 자동 변경은 상태를 수정하면 안 됩니다.");
Store.enableSmartPreparation("PROD-003", "이서준");
assert.equal(Store.getEffectiveSmartPreparation("PROD-003").status, "LEARNING", "동의 직후 패턴이 없으면 학습 중이어야 합니다.");
Store.setSmartPreparationMode("PROD-003", "MANUAL", "이서준");

const smartBeforeUnsupportedIce = Store.getState();
assert.throws(
  () => Store.saveManualPreparation("PROD-003", { resource: "ICE", readyAt: "08:00", leadMinutes: 10, days: ["MON"] }, "이서준"),
  /지원하지 않는 제품/,
  "비제빙 모델에는 얼음 준비 시간을 저장할 수 없어야 합니다."
);
assert.equal(Store.getState().meta.revision, smartBeforeUnsupportedIce.meta.revision, "미지원 기능 저장 실패 시 상태를 변경하면 안 됩니다.");

Store.setSmartPreparationMode("PROD-001", "MANUAL", "김하늘");
Store.saveManualPreparation("PROD-001", { resource: "HOT_WATER", readyAt: "06:40", leadMinutes: 10, days: ["MON", "TUE", "WED", "THU", "FRI"] }, "김하늘");
let smartProfile = Store.getState().smartPreparationProfiles.find((item) => item.productId === "PROD-001");
const savedManualSchedule = smartProfile.manualSchedules.find((item) => item.readyAt === "06:40");
assert(savedManualSchedule && savedManualSchedule.daysLabel === "평일", "사용자의 직접 준비 시간이 저장되어야 합니다.");
Store.removeManualPreparation("PROD-001", savedManualSchedule.id, "김하늘");
smartProfile = Store.getState().smartPreparationProfiles.find((item) => item.productId === "PROD-001");
assert(!smartProfile.manualSchedules.some((item) => item.id === savedManualSchedule.id), "직접 준비 시간을 삭제할 수 있어야 합니다.");
Store.setSmartPreparationMode("PROD-001", "AUTO", "김하늘");

const chartContext = vm.createContext({ window: {}, Intl, console });
vm.runInContext(fs.readFileSync(path.join(root, "assets/js/usage-chart.js"), "utf8"), chartContext, { filename: "usage-chart.js" });
const UsageChart = chartContext.window.WaterCareUsageChart;
assert.equal(UsageChart.niceScale([0, 0], 4).max, 1, "0 데이터도 유효한 차트 축을 가져야 합니다.");
const usageSvg = UsageChart.buildSvg({ id: "test-usage", title: "출수량", description: "테스트 설명", labels: ["1", "2", "3"], values: [0, 1, 2], unit: "L", kind: "line", range: "weekly" });
assert(usageSvg.includes("<title") && usageSvg.includes("<desc"), "사용량 SVG에 접근 가능한 제목과 설명이 필요합니다.");
assert(usageSvg.includes("data-usage-point") && usageSvg.includes('role="img"'), "사용량 차트에 선택 지점과 이미지 역할이 필요합니다.");
assert(!usageSvg.includes("NaN") && !usageSvg.includes("Infinity"), "사용량 차트 좌표는 유효해야 합니다.");
const dualWaterSvg = UsageChart.buildSvg({ id: "test-dual-water", title: "냉수와 온수", description: "두 계열", labels: ["1", "2", "3"], series: [{ id: "cold", label: "냉수", values: [1, 2, 3] }, { id: "hot", label: "온수", values: [0.5, 1.5, 1] }], unit: "L", kind: "line", range: "weekly", selectedIndex: 2 });
assert(dualWaterSvg.includes("usage-chart-line--cold") && dualWaterSvg.includes("usage-chart-line--hot"), "냉수와 온수 선이 각각 렌더되어야 합니다.");
assert(dualWaterSvg.includes('data-usage-series="cold"') && dualWaterSvg.includes('data-usage-series="hot"'), "냉수와 온수 지점의 계열 식별자가 필요합니다.");
assert(dualWaterSvg.includes('<rect class="usage-chart-point usage-chart-point--hot'), "온수 지점은 마름모로 구분되어야 합니다.");
assert(!dualWaterSvg.includes("usage-chart-area"), "냉수·온수 다중 선 그래프에는 겹치는 면적 채움을 사용하면 안 됩니다.");
assert(!dualWaterSvg.includes("NaN") && !dualWaterSvg.includes("Infinity"), "냉수·온수 차트 좌표는 유효해야 합니다.");
const annotation = UsageChart.annotationGeometry({ startIndex: 6, endIndex: 8, preparationIndex: 5.75 }, 24, "line", 720, { top: 20, right: 18, bottom: 42, left: 50 });
assert(annotation && Number.isFinite(annotation.x) && Number.isFinite(annotation.preparationX), "반복 패턴 annotation 좌표가 유효해야 합니다.");
const annotatedSvg = UsageChart.buildSvg({ id: "test-pattern", title: "온수 사용", description: "반복 패턴", labels: Array.from({ length: 24 }, (_, index) => `${index}시`), values: Array(24).fill(1), unit: "L", kind: "line", range: "hourly", annotations: [{ resource: "HOT_WATER", startIndex: 6, endIndex: 8, preparationIndex: 5.75, label: "온수 반복", preparationLabel: "준비 05:45" }] });
assert(annotatedSvg.includes("usage-routine-band") && annotatedSvg.includes("usage-prep-line"), "시간별 차트에 반복 구간과 준비 시작선을 표시해야 합니다.");
assert(!annotatedSvg.includes("NaN") && !annotatedSvg.includes("Infinity"), "반복 패턴 차트 좌표는 유효해야 합니다.");

assert(initial.inquiries.filter((item) => item.evidence.length).every((item) => item.evidence.every((doc) => doc.document.includes("시연 메타데이터"))), "근거 문서 페이지는 시연 메타데이터임을 표시해야 합니다.");

const danger = initial.inquiries.find((item) => item.risk === "DANGER");
assert(danger, "위험 시나리오가 있어야 합니다.");
assert(danger.selfActions.some((text) => /사용을.*중지|접촉.*금지/.test(text)), "위험 문의에는 사용 중지 또는 접촉 금지 문구가 있어야 합니다.");

// A newly created general case keeps every customer answer and proceeds through grounded guidance.
Store.reset();
const generalRequestId = "TEST-GENERAL-FLOW-001";
const generalDescription = "오늘 아침부터 정수 물줄기가 평소보다 약해졌어요.";
const generalInquiryId = Store.createInquiry({
  customerId: "CUS-001",
  productId: "PROD-001",
  symptomTypes: ["LOW_FLOW"],
  description: generalDescription,
  requestId: generalRequestId
}, { role: "CUSTOMER", id: "CUS-001" });
let workflowState = Store.getState();
let generalInquiry = getInquiry(workflowState, generalInquiryId);
assert.equal(generalInquiry.status, "ADDITIONAL_QUESTIONS", "일반 신규 문의는 필요한 정보를 추가 확인해야 합니다.");
assert.equal(generalInquiry.risk, "GENERAL", "일반 출수 문의를 위험 문의로 오분류하면 안 됩니다.");
assert.equal(generalInquiry.workflow.currentOwnerRole, "CUSTOMER", "추가 질문 단계의 현재 담당은 고객이어야 합니다.");
assert.equal(generalInquiry.workflow.customerActionRequired, true, "추가 질문 단계는 고객 행동 필요 상태여야 합니다.");
oneNotification(workflowState, "CUSTOMER", "CUS-001", "ADDITIONAL_QUESTIONS", generalInquiryId);

const beforeDuplicateCreate = Store.getState();
assert.equal(Store.createInquiry({ customerId: "CUS-001", productId: "PROD-001", symptomTypes: ["LOW_FLOW"], description: generalDescription, requestId: generalRequestId }, { role: "CUSTOMER", id: "CUS-001" }), generalInquiryId, "같은 요청 ID와 같은 내용은 최초 문의 ID를 반환해야 합니다.");
workflowState = Store.getState();
assert.equal(workflowState.meta.revision, beforeDuplicateCreate.meta.revision, "중복 문의 제출은 리비전을 올리면 안 됩니다.");
assert.equal(workflowState.notifications.length, beforeDuplicateCreate.notifications.length, "중복 문의 제출은 알림을 다시 만들면 안 됩니다.");

const generalAnswers = {
  started: "오늘 아침",
  targetWater: "정수",
  condition: "모든 시간대에 계속 발생",
  errorCode: "표시 없음",
  companion: "특이사항 없음",
  recentNonUse: "해당 없음",
  performedActions: "아직 수행한 조치 없음"
};
Store.answerAdditionalQuestions(generalInquiryId, generalAnswers, "김하늘", "CUS-001");
workflowState = Store.getState();
generalInquiry = getInquiry(workflowState, generalInquiryId);
assert.equal(generalInquiry.status, "SELF_ACTION", "안전하고 공식 근거가 있는 일반 문의는 자동 안내 단계여야 합니다.");
assert.equal(generalInquiry.description, generalDescription, "최초 고객 원문이 자동 안내 후에도 보존되어야 합니다.");
assert.equal(generalInquiry.questionAnswers.length, 1, "추가 답변 원문 묶음이 문의에 저장되어야 합니다.");
assert.equal(generalInquiry.questionAnswers[0].answers.condition, generalAnswers.condition, "고객이 입력한 발생 조건을 그대로 인계해야 합니다.");
assert(generalInquiry.evidence.length > 0, "자동 안내에는 제품 모델에 맞는 공식 근거가 필요합니다.");
assert(generalInquiry.selfActions.length > 0, "자동 안내에는 실행 가능한 안전 확인 절차가 필요합니다.");
assert.equal(generalInquiry.usageGuidance.status, "NORMAL_USE", "위험 신호가 없는 일반 문의는 일반 사용 가능 상태여야 합니다.");
assert.equal(generalInquiry.workflow.routingDecision, "SELF_SERVICE", "근거 검증 통과 문의는 자가 확인 경로여야 합니다.");
assert.equal(generalInquiry.workflow.verificationStatus, "PASSED", "자동 안내 전 검증 통과 상태가 필요합니다.");
assert.equal(generalInquiry.workflow.evidenceStatus, "FOUND", "자동 안내에 사용한 근거 상태가 필요합니다.");
assert(timelinePosition(generalInquiry, "RECEIVED") < timelinePosition(generalInquiry, "ANSWERS_SAVED"), "최초 접수 다음에 고객 답변이 기록되어야 합니다.");
assert(timelinePosition(generalInquiry, "ANSWERS_SAVED") < timelinePosition(generalInquiry, "SELF_ACTION"), "고객 답변 다음에 검증된 자동 안내가 기록되어야 합니다.");
oneNotification(workflowState, "CUSTOMER", "CUS-001", "SELF_ACTION_READY", generalInquiryId);
assert.equal(notificationsFor(workflowState, "COUNSELOR", "STF-001", null, generalInquiryId).length, 0, "자동 안내 중인 일반 문의를 상담 큐에 잘못 알리면 안 됩니다.");

// SAME is a real hand-off, not a disconnected intermediate screen.
Store.setActionResult(generalInquiryId, "SAME", "김하늘", "CUS-001");
workflowState = Store.getState();
generalInquiry = getInquiry(workflowState, generalInquiryId);
assert.equal(generalInquiry.status, "WAITING_COUNSEL", "자가조치 후 증상이 같으면 자동으로 상담 대기로 전환해야 합니다.");
assert.equal(generalInquiry.actionResult, "SAME", "자가조치 결과를 상담 인계 후에도 보존해야 합니다.");
assert.equal(generalInquiry.workflow.currentOwnerRole, "COUNSELOR", "미해결 자동 이관 후 현재 담당은 상담사여야 합니다.");
assert.equal(generalInquiry.workflow.currentOwnerId, "STF-001", "자동 이관 시 실제 시연 상담사가 지정되어야 합니다.");
oneNotification(workflowState, "CUSTOMER", "CUS-001", "COUNSEL_REQUESTED", generalInquiryId);
oneNotification(workflowState, "COUNSELOR", "STF-001", "COUNSEL_QUEUE", generalInquiryId);

Store.startCounsel(generalInquiryId, "STF-001", "한유진");
workflowState = Store.getState();
generalInquiry = getInquiry(workflowState, generalInquiryId);
assert.equal(generalInquiry.status, "IN_COUNSEL", "상담사가 수락하면 상담 중 상태여야 합니다.");
assert.equal(generalInquiry.counselor.id, "STF-001", "담당 상담사 ID가 같은 문의에 저장되어야 합니다.");
assert.equal(generalInquiry.workflow.currentOwnerName, "한유진", "워크플로 현재 담당자명이 실제 상담사와 일치해야 합니다.");
oneNotification(workflowState, "CUSTOMER", "CUS-001", "COUNSEL_STARTED", generalInquiryId);

const remoteResolution = "원수 공급 상태를 함께 확인했고 정상 출수로 회복되는 것을 확인함";
Store.resolveCounsel(generalInquiryId, remoteResolution, "STF-001", "한유진");
workflowState = Store.getState();
generalInquiry = getInquiry(workflowState, generalInquiryId);
assert.equal(generalInquiry.status, "RESOLUTION_PENDING", "상담 해결 안내 후 고객 확인 단계가 필요합니다.");
assert.equal(generalInquiry.counselor.note, remoteResolution, "상담 결과가 고객 확인 단계에도 보존되어야 합니다.");
assert.equal(generalInquiry.workflow.currentOwnerRole, "CUSTOMER", "상담 완료 후 해결 여부 확인 담당은 고객이어야 합니다.");
assert.equal(generalInquiry.workflow.customerActionRequired, true, "상담 완료 후 고객 해결 확인이 필요해야 합니다.");
oneNotification(workflowState, "CUSTOMER", "CUS-001", "RESOLUTION_CONFIRMATION", generalInquiryId);

Store.confirmResolution(generalInquiryId, true, "김하늘", "CUS-001");
workflowState = Store.getState();
generalInquiry = getInquiry(workflowState, generalInquiryId);
assert.equal(generalInquiry.status, "COMPLETION_PENDING", "고객 해결 확인은 관계자 최종 완료 대기로 전환되어야 합니다.");
assert.equal(generalInquiry.workflow.routingDecision, "FINAL_REVIEW", "고객 확인 후 담당자의 최종 검토가 필요해야 합니다.");
oneNotification(workflowState, "COUNSELOR", "STF-001", "FINALIZATION_REQUIRED", generalInquiryId);
assert.throws(() => Store.completeInquiry(generalInquiryId, { role: "OPERATOR", id: "STF-004" }), /권한/, "운영 담당자는 상담 건을 최종 완료할 수 없습니다.");
Store.completeInquiry(generalInquiryId, { role: "COUNSELOR", id: "STF-001" });
workflowState = Store.getState();
generalInquiry = getInquiry(workflowState, generalInquiryId);
assert.equal(generalInquiry.status, "COMPLETED", "담당 상담사가 기록을 검토한 뒤 최종 완료해야 합니다.");
assert.equal(generalInquiry.workflow.routingDecision, "COMPLETED", "관계자 최종 완료 후 워크플로도 완료 상태여야 합니다.");
oneNotification(workflowState, "CUSTOMER", "CUS-001", "CASE_COMPLETED", generalInquiryId);

// A second, separate case proves customer -> counselor -> engineer -> customer continuity.
const visitDescription = "정수를 충분히 흘려도 냄새가 계속 나고 점검이 필요해요.";
const visitFlowInquiryId = Store.createInquiry({ customerId: "CUS-001", productId: "PROD-001", symptomTypes: ["TASTE_ODOR"], description: visitDescription, requestId: "TEST-VISIT-FLOW-001" }, { role: "CUSTOMER", id: "CUS-001" });
assert.notEqual(visitFlowInquiryId, generalInquiryId, "원격 해결 문의와 방문 문의는 서로 다른 ID여야 합니다.");
Store.answerAdditionalQuestions(visitFlowInquiryId, { started: "어제", targetWater: "정수", condition: "충분히 출수해도 반복", errorCode: "표시 없음", companion: "특이사항 없음", recentNonUse: "해당 없음", performedActions: "충분히 출수한 뒤 상태 재확인" }, "김하늘", "CUS-001");
Store.setActionResult(visitFlowInquiryId, "SAME", "김하늘", "CUS-001");
Store.startCounsel(visitFlowInquiryId, "STF-001", "한유진");
Store.saveCounselNote(visitFlowInquiryId, "고객 자가조치와 공식 근거를 확인했고 현장 수질·필터 점검이 필요함", "STF-001", "한유진");
const linkedVisitAt = futureIso(12);
Store.scheduleVisit(visitFlowInquiryId, { actorId: "STF-001", serviceType: "REPAIR", engineerId: "STF-002", customerPreferredAt: linkedVisitAt, scheduleStatus: "CONFIRMED", confirmedAt: linkedVisitAt, area: "서울 서부권 (가상)" });
workflowState = Store.getState();
let visitFlowInquiry = getInquiry(workflowState, visitFlowInquiryId);
assert.equal(visitFlowInquiry.status, "VISIT_SCHEDULED", "상담사가 방문을 배정하면 방문 예정 상태여야 합니다.");
assert.equal(visitFlowInquiry.workflow.currentOwnerRole, "ENGINEER", "방문 배정 후 현재 담당은 방문기사여야 합니다.");
assert.equal(visitFlowInquiry.workflow.currentOwnerId, "STF-002", "워크플로 담당 기사와 실제 배정 기사가 같아야 합니다.");
assert.equal(visitFlowInquiry.counselor.note.includes("현장"), true, "기사 배정 후에도 상담 인계 메모가 유지되어야 합니다.");
oneNotification(workflowState, "CUSTOMER", "CUS-001", "VISIT_CONFIRMED", visitFlowInquiryId);
oneNotification(workflowState, "ENGINEER", "STF-002", "VISIT_CONFIRMED", visitFlowInquiryId);
assert.equal(notificationsFor(workflowState, "ENGINEER", "STF-003", "VISIT_CONFIRMED", visitFlowInquiryId).length, 0, "배정되지 않은 기사에게 작업 알림을 보내면 안 됩니다.");

const linkedCompletionAt = futureIso(13);
Store.completeVisit(visitFlowInquiryId, completeOptions({ completedAt: linkedCompletionAt }));
workflowState = Store.getState();
visitFlowInquiry = getInquiry(workflowState, visitFlowInquiryId);
assert.equal(visitFlowInquiry.status, "VISIT_COMPLETE", "기사 작업 완료 후 고객 해결 확인 단계여야 합니다.");
assert.equal(visitFlowInquiry.workflow.currentOwnerRole, "CUSTOMER", "방문 완료 후 현재 담당은 고객이어야 합니다.");
assert.equal(visitFlowInquiry.description, visitDescription, "방문 완료 후에도 최초 고객 원문이 유지되어야 합니다.");
assert.equal(visitFlowInquiry.actionResult, "SAME", "방문 완료 후에도 자가조치 실패 결과가 유지되어야 합니다.");
assert.equal(visitFlowInquiry.counselor.id, "STF-001", "방문 완료 후에도 담당 상담사 연결이 유지되어야 합니다.");
assert.equal(visitFlowInquiry.visit.engineerId, "STF-002", "방문 완료 데이터에 실제 배정 기사가 유지되어야 합니다.");
assert.equal(visitFlowInquiry.visit.signature.consentVersion, "VISIT_COMPLETION_V1", "완료 알림과 결합된 서명 동의 버전이 필요합니다.");
oneNotification(workflowState, "CUSTOMER", "CUS-001", "RESOLUTION_CONFIRMATION", visitFlowInquiryId);
oneNotification(workflowState, "COUNSELOR", "STF-001", "VISIT_COMPLETE", visitFlowInquiryId);
oneNotification(workflowState, "OPERATOR", "STF-004", "VISIT_COMPLETE", visitFlowInquiryId);

Store.confirmResolution(visitFlowInquiryId, true, "김하늘", "CUS-001");
workflowState = Store.getState();
visitFlowInquiry = getInquiry(workflowState, visitFlowInquiryId);
assert.equal(visitFlowInquiry.status, "COMPLETION_PENDING", "방문 후 고객 해결 확인은 배정기사 최종 완료 대기여야 합니다.");
oneNotification(workflowState, "ENGINEER", "STF-002", "FINALIZATION_REQUIRED", visitFlowInquiryId);
assert.throws(() => Store.completeInquiry(visitFlowInquiryId, { role: "ENGINEER", id: "STF-003" }), /배정된 방문기사/, "미배정 기사는 최종 완료할 수 없습니다.");
Store.completeInquiry(visitFlowInquiryId, { role: "ENGINEER", id: "STF-002" });
workflowState = Store.getState();
visitFlowInquiry = getInquiry(workflowState, visitFlowInquiryId);
assert.equal(visitFlowInquiry.status, "COMPLETED", "배정기사가 방문 결과와 서명을 검토한 뒤 최종 완료해야 합니다.");
oneNotification(workflowState, "CUSTOMER", "CUS-001", "CASE_COMPLETED", visitFlowInquiryId);

// A dangerous issue is escalated immediately and blocks product preparation.
Store.reset();
const dangerRequestId = "TEST-DANGER-FLOW-001";
const dangerDescription = "제품 아래 물이 고이고 전원선 주변에도 물기가 보여요.";
const dangerInquiryId = Store.createInquiry({ customerId: "CUS-001", productId: "PROD-001", symptomTypes: ["LEAK"], description: dangerDescription, requestId: dangerRequestId }, { role: "CUSTOMER", id: "CUS-001" });
workflowState = Store.getState();
let dangerInquiry = getInquiry(workflowState, dangerInquiryId);
assert.equal(dangerInquiry.status, "WAITING_COUNSEL", "누수 신규 문의는 추가 질문 없이 즉시 상담 대기여야 합니다.");
assert.equal(dangerInquiry.risk, "DANGER", "누수 신규 문의는 위험 등급이어야 합니다.");
assert.equal(dangerInquiry.priority, "URGENT", "누수 신규 문의는 긴급 우선순위여야 합니다.");
assert.equal(dangerInquiry.usageGuidance.status, "FULL_STOP", "누수·전원부 물기는 제품 전체 사용 중지여야 합니다.");
assert.equal(dangerInquiry.workflow.routingDecision, "COUNSEL", "위험 문의는 즉시 상담 경로여야 합니다.");
assert.equal(dangerInquiry.workflow.verificationStatus, "BLOCKED", "위험 문의의 일반 자동 안내를 차단해야 합니다.");
assert(dangerInquiry.evidence.some((item) => item.page === "SAFE-LEAK-02"), "위험 문의에는 적용된 안전 규칙 근거가 필요합니다.");
assert(dangerInquiry.selfActions.some((text) => /사용.*중지|만지지|분해하지/.test(text)), "위험 문의는 중지·접촉 금지 안내만 제공해야 합니다.");
assert.equal(getProduct(workflowState, "PROD-001").status, "SAFETY_HOLD", "위험 문의가 생긴 제품은 안전 점검 보류 상태여야 합니다.");
assert.equal(Store.getEffectiveSmartPreparation("PROD-001").status, "BLOCKED_SAFETY", "위험 문의 제품의 스마트 준비를 차단해야 합니다.");
oneNotification(workflowState, "CUSTOMER", "CUS-001", "SAFETY_ESCALATION", dangerInquiryId);
oneNotification(workflowState, "COUNSELOR", "STF-001", "URGENT_COUNSEL", dangerInquiryId);

const beforeDuplicateDanger = Store.getState();
assert.equal(Store.createInquiry({ customerId: "CUS-001", productId: "PROD-001", symptomTypes: ["LEAK"], description: dangerDescription, requestId: dangerRequestId }, { role: "CUSTOMER", id: "CUS-001" }), dangerInquiryId, "같은 위험 문의 요청을 중복 생성하면 안 됩니다.");
workflowState = Store.getState();
assert.equal(workflowState.meta.revision, beforeDuplicateDanger.meta.revision, "중복 위험 요청은 리비전을 올리면 안 됩니다.");
assert.equal(workflowState.notifications.length, beforeDuplicateDanger.notifications.length, "중복 위험 요청은 긴급 알림을 다시 만들면 안 됩니다.");

// Danger discovered in an answer upgrades the original case instead of creating a disconnected case.
const additionalDangerId = "INQ-260716-005";
Store.answerAdditionalQuestions(additionalDangerId, { started: "오늘 아침", targetWater: "정수", condition: "계속 발생", errorCode: "표시 없음", companion: "제품 아래 누수와 전원선 주변 물기가 있음", recentNonUse: "해당 없음", performedActions: "제품 사용 중지 후 안전거리 확보" }, "정민호", "CUS-005");
workflowState = Store.getState();
let additionalDanger = getInquiry(workflowState, additionalDangerId);
assert.equal(additionalDanger.status, "WAITING_COUNSEL", "추가 답변에서 누수를 발견하면 즉시 상담 대기로 승격해야 합니다.");
assert.equal(additionalDanger.risk, "DANGER", "추가 답변의 누수 신호가 위험 등급에 반영되어야 합니다.");
assert.equal(additionalDanger.priority, "URGENT", "추가 답변 위험 승격도 긴급 우선순위여야 합니다.");
assert.equal(additionalDanger.questionAnswers[0].answers.companion, "제품 아래 누수와 전원선 주변 물기가 있음", "위험 판단에 사용한 고객 원문을 보존해야 합니다.");
assert(timelinePosition(additionalDanger, "ANSWERS_SAVED") < timelinePosition(additionalDanger, "WAITING_COUNSEL"), "고객 위험 답변 다음에 안전 이관 결과가 기록되어야 합니다.");
assert.equal(getProduct(workflowState, "PROD-005").status, "SAFETY_HOLD", "추가 답변에서 위험이 확인된 제품도 안전 보류해야 합니다.");
assert.equal(Store.getEffectiveSmartPreparation("PROD-005").status, "BLOCKED_SAFETY", "추가 답변 위험 제품의 스마트 준비를 차단해야 합니다.");
oneNotification(workflowState, "CUSTOMER", "CUS-005", "SAFETY_ESCALATION", additionalDangerId);
oneNotification(workflowState, "COUNSELOR", "STF-001", "URGENT_COUNSEL", additionalDangerId);
const beforeRepeatedAnswer = Store.getState();
assert.throws(() => Store.answerAdditionalQuestions(additionalDangerId, { started: "다시", targetWater: "정수", condition: "계속", errorCode: "표시 없음", companion: "다시 누수", recentNonUse: "해당 없음", performedActions: "제품 사용 중지" }, "정민호", "CUS-005"), /추가 질문 단계/, "위험 승격을 마친 답변을 중복 제출하면 안 됩니다.");
assert.equal(Store.getState().meta.revision, beforeRepeatedAnswer.meta.revision, "중복 추가 답변 실패는 상태를 변경하면 안 됩니다.");
assert.equal(Store.getState().notifications.length, beforeRepeatedAnswer.notifications.length, "중복 추가 답변 실패는 알림을 추가하면 안 됩니다.");

// No matching evidence means explicit review, never a fabricated self-action.
const noEvidenceInquiryId = Store.createInquiry({ customerId: "CUS-004", productId: "PROD-004", symptomTypes: ["OTHER"], description: "표시창에 설명서에서 찾지 못한 낯선 패턴이 반복돼요.", requestId: "TEST-NO-EVIDENCE-001" }, { role: "CUSTOMER", id: "CUS-004" });
Store.answerAdditionalQuestions(noEvidenceInquiryId, { started: "오늘", targetWater: "전체", condition: "간헐적", errorCode: "알 수 없는 표시", companion: "특이사항 없음", recentNonUse: "해당 없음", performedActions: "아직 수행한 조치 없음" }, "최유나", "CUS-004");
workflowState = Store.getState();
const noEvidenceInquiry = getInquiry(workflowState, noEvidenceInquiryId);
assert.equal(noEvidenceInquiry.status, "WAITING_COUNSEL", "공식 근거가 없으면 상담 검토로 전환해야 합니다.");
assert.equal(noEvidenceInquiry.evidence.length, 0, "근거 검색 실패를 가짜 근거로 채우면 안 됩니다.");
assert.equal(noEvidenceInquiry.selfActions.length, 0, "공식 근거가 없으면 임의 자가조치를 생성하면 안 됩니다.");
assert.equal(noEvidenceInquiry.usageGuidance.status, "PENDING_REVIEW", "근거 부족 시 사용 안내는 판단 보류여야 합니다.");
assert.equal(noEvidenceInquiry.workflow.routingDecision, "COUNSEL", "근거 부족 문의는 상담 경로여야 합니다.");
assert.equal(noEvidenceInquiry.workflow.verificationStatus, "BLOCKED", "근거 부족 자동 안내를 차단해야 합니다.");
assert.equal(noEvidenceInquiry.workflow.evidenceStatus, "NOT_FOUND", "공식 근거 검색 실패 상태를 명시해야 합니다.");
assert(timelinePosition(noEvidenceInquiry, "ANSWERS_SAVED") < timelinePosition(noEvidenceInquiry, "WAITING_COUNSEL"), "고객 답변 다음에 근거 부족 이관 결과가 기록되어야 합니다.");
oneNotification(workflowState, "CUSTOMER", "CUS-004", "EVIDENCE_NOT_FOUND", noEvidenceInquiryId);
oneNotification(workflowState, "COUNSELOR", "STF-001", "EVIDENCE_REVIEW", noEvidenceInquiryId);

// A customer can reopen a completed visit without losing the counselor, engineer, work result or signature.
Store.reset();
const reopenInquiryId = "INQ-260712-009";
const beforeReopen = getInquiry(Store.getState(), reopenInquiryId);
const preservedSignatureId = beforeReopen.visit.signature.integrityId;
const preservedVisitResult = beforeReopen.visit.result;
Store.confirmResolution(reopenInquiryId, false, "이서준", "CUS-003");
workflowState = Store.getState();
const reopenedInquiry = getInquiry(workflowState, reopenInquiryId);
assert.equal(reopenedInquiry.status, "WAITING_COUNSEL", "방문 후 미해결 답변은 같은 문의를 상담 대기로 다시 열어야 합니다.");
assert.equal(reopenedInquiry.priority, "HIGH", "처리 후 미해결 문의는 높은 우선순위여야 합니다.");
assert.equal(reopenedInquiry.workflow.currentOwnerRole, "COUNSELOR", "재개 문의의 현재 담당은 상담사여야 합니다.");
assert.equal(reopenedInquiry.workflow.currentOwnerId, "STF-001", "재개 문의가 기존 담당 상담사에게 돌아가야 합니다.");
assert.equal(reopenedInquiry.visit.engineerId, "STF-002", "재개해도 기존 방문기사 연결을 보존해야 합니다.");
assert.equal(reopenedInquiry.visit.result, preservedVisitResult, "재개해도 기존 방문 결과를 보존해야 합니다.");
assert.equal(reopenedInquiry.visit.signature.integrityId, preservedSignatureId, "재개해도 고객 서명을 보존해야 합니다.");
oneNotification(workflowState, "CUSTOMER", "CUS-003", "CASE_REOPENED", reopenInquiryId);
oneNotification(workflowState, "COUNSELOR", "STF-001", "CASE_REOPENED", reopenInquiryId);
const beforeDuplicateReopen = Store.getState();
assert.throws(() => Store.confirmResolution(reopenInquiryId, false, "이서준", "CUS-003"), /처리 결과 확인 단계/, "이미 재개된 문의를 중복 재개하면 안 됩니다.");
assert.equal(Store.getState().meta.revision, beforeDuplicateReopen.meta.revision, "중복 재개 실패는 상태를 변경하면 안 됩니다.");
assert.equal(Store.getState().notifications.length, beforeDuplicateReopen.notifications.length, "중복 재개 실패는 알림을 추가하면 안 됩니다.");

// Read state belongs to the intended audience and every read operation is idempotent.
Store.reset();
workflowState = Store.getState();
const customerSeedNotification = oneNotification(workflowState, "CUSTOMER", "CUS-001", "COUNSEL_REQUESTED", "INQ-260716-001");
const counselorUnreadBefore = notificationsFor(workflowState, "COUNSELOR", "STF-001").filter((item) => !item.readAt).length;
const beforeWrongAudienceRead = Store.getState();
assert.throws(() => Store.markNotificationRead(customerSeedNotification.id, "CUSTOMER", "CUS-002"), /권한/, "다른 고객의 알림을 읽음 처리하면 안 됩니다.");
assert.equal(Store.getState().meta.revision, beforeWrongAudienceRead.meta.revision, "권한 없는 읽음 요청은 상태를 변경하면 안 됩니다.");

const beforeSingleRead = Store.getState();
Store.markNotificationRead(customerSeedNotification.id, "CUSTOMER", "CUS-001");
workflowState = Store.getState();
const readNotification = workflowState.notifications.find((item) => item.id === customerSeedNotification.id);
assert(!Number.isNaN(Date.parse(readNotification.readAt)), "알림을 읽으면 읽음 시각을 저장해야 합니다.");
assert.equal(workflowState.meta.revision, beforeSingleRead.meta.revision + 1, "최초 읽음 처리만 리비전을 한 번 올려야 합니다.");
assert.equal(notificationsFor(workflowState, "COUNSELOR", "STF-001").filter((item) => !item.readAt).length, counselorUnreadBefore, "고객 읽음 처리가 상담사 알림에 영향을 주면 안 됩니다.");
const firstReadAt = readNotification.readAt;
const beforeRepeatedRead = Store.getState();
Store.markNotificationRead(customerSeedNotification.id, "CUSTOMER", "CUS-001");
workflowState = Store.getState();
assert.equal(workflowState.meta.revision, beforeRepeatedRead.meta.revision, "이미 읽은 알림을 다시 읽어도 리비전을 올리면 안 됩니다.");
assert.equal(workflowState.notifications.find((item) => item.id === customerSeedNotification.id).readAt, firstReadAt, "중복 읽음이 최초 읽음 시각을 덮어쓰면 안 됩니다.");

const otherCustomerUnreadBefore = notificationsFor(workflowState, "CUSTOMER", "CUS-002").filter((item) => !item.readAt).length;
Store.markAllNotificationsRead("CUSTOMER", "CUS-001");
workflowState = Store.getState();
assert(notificationsFor(workflowState, "CUSTOMER", "CUS-001").every((item) => item.readAt), "전체 읽음은 현재 고객의 알림을 모두 읽음 처리해야 합니다.");
assert.equal(notificationsFor(workflowState, "CUSTOMER", "CUS-002").filter((item) => !item.readAt).length, otherCustomerUnreadBefore, "전체 읽음이 다른 고객의 알림을 변경하면 안 됩니다.");
const beforeRepeatedReadAll = Store.getState();
Store.markAllNotificationsRead("CUSTOMER", "CUS-001");
assert.equal(Store.getState().meta.revision, beforeRepeatedReadAll.meta.revision, "모두 읽은 뒤 전체 읽음을 다시 눌러도 리비전을 올리면 안 됩니다.");

// Restore the seeded cases before running the legacy scheduling and signature regression suite below.
Store.reset();

const inquiryId = "INQ-260716-001";
const beforeProduct = getProduct(initial, "PROD-001");
const beforeHistoryCount = beforeProduct.careHistory.length;

const beforeNoScheduleRequest = Store.getState();
assert.throws(
  () => Store.requestVisitReschedule(inquiryId, { customerId: "CUS-001", desiredAt: futureIso(5), reason: "아직 배정되지 않은 방문 일정 변경", actorName: "김하늘" }),
  /방문 예정 문의만/,
  "방문 일정이 없는 문의에는 일정 변경 요청을 만들 수 없어야 합니다."
);
assert.equal(Store.getState().meta.revision, beforeNoScheduleRequest.meta.revision, "일정 없음 요청 차단 시 상태를 변경하면 안 됩니다.");

Store.startCounsel(inquiryId, "STF-001", "한유진");
assert.equal(getInquiry(Store.getState(), inquiryId).status, "IN_COUNSEL", "상담 시작 후 상담 중 상태여야 합니다.");
Store.saveCounselNote(inquiryId, "고객 답변과 자가조치 결과를 확인했고 현장 출수·필터 점검이 필요함", "STF-001", "한유진");

const revisionBeforeInvalidAssignment = Store.getState().meta.revision;
assert.throws(
  () => Store.scheduleVisit(inquiryId, { actorId: "STF-001", engineerId: "STF-001", customerPreferredAt: futureIso(7), scheduleStatus: "COORDINATING" }),
  /권한/,
  "상담사를 방문기사로 배정하면 안 됩니다."
);
assert.equal(Store.getState().meta.revision, revisionBeforeInvalidAssignment, "잘못된 기사 배정은 상태를 변경하면 안 됩니다.");

const scheduledAt = futureIso(7);
Store.scheduleVisit(inquiryId, {
  actorId: "STF-001",
  serviceType: "REPAIR",
  customerPreferredAt: scheduledAt,
  scheduleStatus: "ASSIGNING",
  area: "서울 서부권 (가상)"
});
let state = Store.getState();
let inquiry = getInquiry(state, inquiryId);
assert.equal(inquiry.status, "VISIT_SCHEDULED", "고객 희망일 등록 후 방문 예정 상태여야 합니다.");
assert.equal(inquiry.visit.scheduleStatus, "ASSIGNING", "최초 방문 요청은 기사 배정 중 상태여야 합니다.");
assert.equal(inquiry.visit.engineerId, null, "기사 배정 중에는 방문기사가 없어야 합니다.");
assert.equal(inquiry.visit.confirmedAt, null, "기사 배정 중에는 확정일이 없어야 합니다.");
assert.equal(Store.canAccessInquiry(inquiryId, { role: "ENGINEER", id: "STF-002" }), false, "미배정 기사는 문의에 접근할 수 없어야 합니다.");

Store.updateVisitSchedule(inquiryId, { actorId: "STF-001", scheduleStatus: "COORDINATING", engineerId: "STF-002" });
state = Store.getState();
inquiry = getInquiry(state, inquiryId);
assert.equal(inquiry.visit.scheduleStatus, "COORDINATING", "기사 배정 후 일정 조율 중 상태여야 합니다.");
assert.equal(inquiry.visit.engineerId, "STF-002", "배정 기사 ID가 저장되어야 합니다.");
assert.equal(inquiry.visit.confirmedAt, null, "일정 조율 중에는 확정일이 없어야 합니다.");
assert.equal(Store.canAccessInquiry(inquiryId, { role: "ENGINEER", id: "STF-002" }), true, "배정 기사는 조율 중 문의를 조회할 수 있어야 합니다.");
assert.throws(() => Store.completeVisit(inquiryId, completeOptions()), /방문 일정이 확정된 후/, "일정 조율 중에는 현장 완료를 등록할 수 없어야 합니다.");

Store.updateVisitSchedule(inquiryId, { actorId: "STF-001", scheduleStatus: "CONFIRMED", engineerId: "STF-002", confirmedAt: scheduledAt });
state = Store.getState();
inquiry = getInquiry(state, inquiryId);
assert.equal(inquiry.visit.scheduleStatus, "CONFIRMED", "가상 확정일 저장 후 방문 확정 상태여야 합니다.");
assert.equal(inquiry.visit.confirmedAt, scheduledAt, "고객 희망일과 별도로 가상 확정일을 저장해야 합니다.");
assert.equal(inquiry.visit.serviceType, "REPAIR", "작업 유형이 방문 지시에 저장되어야 합니다.");

// A completion must be rejected before any mutation when consent/signature is missing or malformed.
const beforeMissingSignature = Store.getState();
assert.throws(
  () => Store.completeVisit(inquiryId, completeOptions({ signatureData: null })),
  /고객 서명/,
  "서명 없는 방문 완료를 차단해야 합니다."
);
assert.throws(
  () => Store.completeVisit(inquiryId, completeOptions({ signatureConsent: false })),
  /고객 확인 동의/,
  "서명정보 수집 동의 없는 방문 완료를 차단해야 합니다."
);
assert.throws(
  () => Store.completeVisit(inquiryId, completeOptions({ signatureData: { format: "POINTS_V1", strokes: [[{ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }]] } })),
  /이어/,
  "움직임 없는 점 입력은 유효한 서명으로 처리하면 안 됩니다."
);
state = Store.getState();
assert.equal(state.meta.revision, beforeMissingSignature.meta.revision, "서명 검증 실패는 리비전을 올리면 안 됩니다.");
assert.equal(state.auditLog.length, beforeMissingSignature.auditLog.length, "서명 검증 실패는 감사로그를 남기면 안 됩니다.");
assert.equal(getProduct(state, "PROD-001").careHistory.length, beforeHistoryCount, "서명 검증 실패는 케어 이력을 만들면 안 됩니다.");

assert.throws(
  () => Store.completeVisit(inquiryId, completeOptions({ engineerId: "STF-003", engineerName: "이도윤" })),
  /배정된 방문기사만/,
  "배정되지 않은 기사는 완료 처리할 수 없어야 합니다."
);
assert.equal(getInquiry(Store.getState(), inquiryId).status, "VISIT_SCHEDULED", "기사 권한 검증 실패 후 방문 예정 상태가 유지되어야 합니다.");

// Customer reschedule request: pending, duplicate blocking, approval, re-request and rejection.
const firstDesiredAt = futureIso(30);
const originalScheduledAt = getInquiry(Store.getState(), inquiryId).visit.scheduledAt;
assert.throws(
  () => Store.requestVisitReschedule(inquiryId, { customerId: "CUS-001", desiredAt: originalScheduledAt, reason: "현재 일정과 동일한 시간 요청", actorName: "김하늘" }),
  /현재 확정 일정과 다른/,
  "현재 확정 일정과 같은 시간으로 변경 요청할 수 없어야 합니다."
);
Store.requestVisitReschedule(inquiryId, {
  customerId: "CUS-001",
  desiredAt: firstDesiredAt,
  reason: "고객 출장 일정으로 방문 시간 변경 요청",
  actorName: "김하늘",
  customerType: "INDIVIDUAL"
});
state = Store.getState();
inquiry = getInquiry(state, inquiryId);
assert.equal(inquiry.visit.rescheduleRequest.status, "REQUESTED", "일정 변경 요청은 승인 대기 상태여야 합니다.");
assert.equal(inquiry.visit.scheduledAt, originalScheduledAt, "승인 전에는 기존 방문 일정이 유지되어야 합니다.");

const beforeDuplicateRequest = Store.getState();
assert.throws(
  () => Store.requestVisitReschedule(inquiryId, { customerId: "CUS-001", desiredAt: futureIso(40), reason: "다른 일정으로 다시 변경 요청", actorName: "김하늘" }),
  /이미 처리 중/,
  "승인 대기 중 중복 일정 변경 요청을 차단해야 합니다."
);
assert.equal(Store.getState().meta.revision, beforeDuplicateRequest.meta.revision, "중복 요청 차단 시 상태를 변경하면 안 됩니다.");
assert.throws(
  () => Store.completeVisit(inquiryId, completeOptions()),
  /방문 일정이 확정된 후/,
  "승인 대기 일정이 있으면 기사가 완료 처리할 수 없어야 합니다."
);

Store.resolveVisitReschedule(inquiryId, {
  decision: "APPROVE",
  actorId: "STF-001",
  resolutionNote: "고객 희망 시간과 기사 일정을 확인함"
});
state = Store.getState();
inquiry = getInquiry(state, inquiryId);
assert.equal(inquiry.visit.rescheduleRequest.status, "APPROVED", "승인 결과가 저장되어야 합니다.");
assert.equal(inquiry.visit.scheduledAt, firstDesiredAt, "승인 시 고객 희망 일시가 확정 일정이 되어야 합니다.");
assert.equal(inquiry.visit.rescheduleHistory.length, 1, "승인 요청이 변경 이력에 보존되어야 합니다.");

const beforeDuplicateResolution = Store.getState();
assert.throws(
  () => Store.resolveVisitReschedule(inquiryId, { decision: "APPROVE", actorId: "STF-001" }),
  /처리할 일정 변경 요청/,
  "처리 완료된 일정 요청을 중복 승인하면 안 됩니다."
);
assert.equal(Store.getState().meta.revision, beforeDuplicateResolution.meta.revision, "중복 승인 차단 시 상태를 변경하면 안 됩니다.");

const secondDesiredAt = futureIso(45);
Store.requestVisitReschedule(inquiryId, {
  customerId: "CUS-001",
  desiredAt: secondDesiredAt,
  reason: "내부 행사로 두 번째 일정 조정 요청",
  actorName: "김하늘",
  customerType: "INDIVIDUAL"
});
Store.resolveVisitReschedule(inquiryId, {
  decision: "REJECT",
  actorId: "STF-004",
  resolutionNote: "해당 시간 기사 배정 불가로 기존 일정 유지"
});
state = Store.getState();
inquiry = getInquiry(state, inquiryId);
assert.equal(inquiry.visit.rescheduleRequest.status, "REJECTED", "반려 결과가 저장되어야 합니다.");
assert.equal(inquiry.visit.scheduledAt, firstDesiredAt, "반려 시 승인된 기존 일정이 유지되어야 합니다.");
assert.equal(inquiry.visit.rescheduleHistory.length, 2, "승인·반려 요청이 모두 변경 이력에 보존되어야 합니다.");

// A valid, assigned-engineer completion stores a cloned signature and remains idempotent.
const submittedSignature = validSignature();
const completedAt = futureIso(31);
Store.completeVisit(inquiryId, completeOptions({ signatureData: submittedSignature, completedAt }));
submittedSignature.strokes[0][0].x = 0.99;

let after = Store.getState();
inquiry = getInquiry(after, inquiryId);
let product = getProduct(after, "PROD-001");
assert.equal(inquiry.status, "VISIT_COMPLETE", "방문 완료 후 고객 확인 단계여야 합니다.");
assert.equal(inquiry.visit.status, "COMPLETED", "방문 작업 자체는 완료 상태여야 합니다.");
assert.equal(inquiry.visit.signature.signatureData.format, "POINTS_V1", "정규화된 서명 포맷이 저장되어야 합니다.");
assert.equal(inquiry.visit.signature.signatureData.strokes[0][0].x, 0.1, "호출자가 원본 서명을 바꿔도 저장 데이터는 변하지 않아야 합니다.");
assert.equal(inquiry.visit.signature.consentVersion, "VISIT_COMPLETION_V1", "동의문 버전이 서명에 결합되어야 합니다.");
assert.equal(inquiry.visit.signature.signedAt, completedAt, "서명 시각과 완료 시각이 함께 저장되어야 합니다.");
assert.match(inquiry.visit.signature.integrityId, /^SIG-/, "서명 무결성 식별자가 생성되어야 합니다.");
assert.equal(product.careHistory.length, beforeHistoryCount + 1, "방문 결과가 케어 이력에 한 번 반영되어야 합니다.");
assert.equal(product.careHistory[0].type, "수리 완료", "작업 유형에 맞는 케어 이력 제목이 필요합니다.");
assert.notEqual(product.nextCareAt, beforeProduct.nextCareAt, "다음 케어 일정이 갱신되어야 합니다.");

const beforeDuplicateCompletion = Store.getState();
Store.completeVisit(inquiryId, completeOptions({ signerName: "다른 서명자", signatureData: validSignature() }));
after = Store.getState();
inquiry = getInquiry(after, inquiryId);
product = getProduct(after, "PROD-001");
assert.equal(after.meta.revision, beforeDuplicateCompletion.meta.revision, "중복 완료는 리비전을 올리면 안 됩니다.");
assert.equal(after.auditLog.length, beforeDuplicateCompletion.auditLog.length, "중복 완료는 감사로그를 추가하면 안 됩니다.");
assert.equal(product.careHistory.length, beforeHistoryCount + 1, "같은 방문 결과를 중복 저장하면 안 됩니다.");
assert.equal(inquiry.visit.signature.signedBy, "김하늘", "중복 완료가 최초 고객 서명을 덮어쓰면 안 됩니다.");

// Corporate completion requires a business representative and position.
const businessInquiryId = "INQ-260715-014";
Store.requestVisitReschedule(businessInquiryId, {
  customerId: "CUS-002",
  desiredAt: futureIso(50),
  reason: "반려 이후 기업 담당자가 다시 일정 변경 요청",
  actorName: "그린웨이브 스튜디오 / 박지민",
  customerType: "BUSINESS"
});
assert.equal(getInquiry(Store.getState(), businessInquiryId).visit.rescheduleRequest.status, "REQUESTED", "반려된 일정은 고객이 다시 변경 요청할 수 있어야 합니다.");
Store.resolveVisitReschedule(businessInquiryId, {
  decision: "REJECT",
  actorId: "STF-001",
  resolutionNote: "기존 방문 시간 유지"
});
assert.throws(
  () => Store.completeVisit(businessInquiryId, completeOptions({ serviceType: "AS", signerName: "박지민", signerRelationship: "SELF", signerPosition: "" })),
  /기업 고객/,
  "기업 고객은 개인 본인 서명 관계로 완료할 수 없어야 합니다."
);
assert.throws(
  () => Store.completeVisit(businessInquiryId, completeOptions({ serviceType: "AS", signerName: "박지민", signerRelationship: "BUSINESS_REP", signerPosition: "" })),
  /기업 고객/,
  "기업 담당자의 직책이 없으면 완료할 수 없어야 합니다."
);
Store.completeVisit(businessInquiryId, completeOptions({
  serviceType: "AS",
  signerName: "박지민",
  signerRelationship: "BUSINESS_REP",
  signerPosition: "총무 담당"
}));
const businessInquiry = getInquiry(Store.getState(), businessInquiryId);
assert.equal(businessInquiry.visit.signature.relationship, "BUSINESS_REP", "기업 담당자 서명 관계가 저장되어야 합니다.");
assert.equal(businessInquiry.visit.signature.position, "총무 담당", "기업 담당자 직책이 저장되어야 합니다.");

// Audit metadata may state that signing happened, but must never contain the raw strokes.
after = Store.getState();
const auditJson = JSON.stringify(after.auditLog);
assert.match(auditJson, /고객 서명/, "고객 서명 등록 사실은 감사로그에서 확인할 수 있어야 합니다.");
assert(!auditJson.includes("POINTS_V1"), "감사로그에 서명 원본 포맷을 저장하면 안 됩니다.");
assert(!auditJson.includes('"strokes"'), "감사로그에 서명 좌표를 저장하면 안 됩니다.");

assert.throws(() => Store.startCounsel("INQ-260710-006", "STF-001", "한유진"), /상담 대기 문의/, "허용되지 않은 상태 전환은 거부해야 합니다.");

const viewerHelpers = loadProductViewerHelpers();
assert.equal(viewerHelpers.wrapAngle(-1), 359, "3D 제품 각도는 왼쪽 경계에서 359도로 순환해야 합니다.");
assert.equal(viewerHelpers.wrapAngle(360), 0, "3D 제품 각도는 한 바퀴 뒤 0도로 순환해야 합니다.");
assert.equal(viewerHelpers.angleFromDrag(350, 100, 120), 10, "오른쪽 드래그는 360도 경계를 넘어 연속 회전해야 합니다.");
assert.equal(viewerHelpers.angleFromDrag(10, 100, 80), 350, "왼쪽 드래그도 0도 경계를 넘어 연속 회전해야 합니다.");
assert.equal(viewerHelpers.wrapAngle(Number.NaN), 0, "잘못된 각도 입력은 정면으로 안전하게 정규화해야 합니다.");

const secondWindow = loadContext();
const secondStore = secondWindow.WaterCareStore;
const secondState = secondStore.getState();
assert.equal(getInquiry(secondState, inquiryId).status, "VISIT_COMPLETE", "두 번째 화면이 같은 완료 상태를 읽어야 합니다.");
assert.equal(getInquiry(secondState, inquiryId).visit.signature.signedBy, "김하늘", "두 번째 화면이 같은 고객 서명을 읽어야 합니다.");
assert(channelMessages.length > 0, "상태 변경이 동기화 채널에 게시되어야 합니다.");

// BroadcastChannel must notify an already-open second role screen, not merely persist for a later reload.
const remoteUpdates = [];
secondStore.subscribe((snapshot, reason) => remoteUpdates.push({ snapshot, reason }));
const syncNotification = oneNotification(Store.getState(), "CUSTOMER", "CUS-001", "COUNSEL_STARTED", inquiryId);
Store.markNotificationRead(syncNotification.id, "CUSTOMER", "CUS-001");
assert(remoteUpdates.some((event) => event.reason === "REMOTE_UPDATE"), "열려 있는 두 번째 화면이 BroadcastChannel 원격 갱신을 받아야 합니다.");
const remoteSnapshot = remoteUpdates.findLast((event) => event.reason === "REMOTE_UPDATE").snapshot;
assert(remoteSnapshot.notifications.find((item) => item.id === syncNotification.id).readAt, "원격 화면이 같은 알림 읽음 상태를 받아야 합니다.");
assert.equal(getInquiry(remoteSnapshot, inquiryId).status, "VISIT_COMPLETE", "원격 알림 동기화가 문의 상태를 훼손하면 안 됩니다.");

// Native storage events are the fallback when BroadcastChannel is unavailable or a browser uses another tab.
const storageUpdatesBefore = remoteUpdates.length;
const storageProbe = JSON.parse(sharedStorage.get(Store.STORAGE_KEY));
storageProbe.meta.revision += 1;
storageProbe.meta.syncProbe = "storage-event-received";
sharedStorage.set(Store.STORAGE_KEY, JSON.stringify(storageProbe));
secondWindow.__dispatchTestEvent("storage", { key: Store.STORAGE_KEY });
assert.equal(remoteUpdates.length, storageUpdatesBefore + 1, "storage 이벤트가 구독자에게 한 번 전달되어야 합니다.");
assert.equal(remoteUpdates.at(-1).reason, "STORAGE_UPDATE", "storage 대체 동기화 이유를 구분해야 합니다.");
assert.equal(remoteUpdates.at(-1).snapshot.meta.syncProbe, "storage-event-received", "storage 이벤트 화면이 최신 localStorage 상태를 읽어야 합니다.");
secondWindow.__dispatchTestEvent("storage", { key: "unrelated-key" });
assert.equal(remoteUpdates.length, storageUpdatesBefore + 1, "다른 localStorage 키 변경은 워터케어 상태 갱신을 유발하면 안 됩니다.");

// Existing v8 browser state must keep user changes through the v9, v10 and v11 migrations.
const legacyState = JSON.parse(JSON.stringify(secondStore.getState()));
legacyState.meta.schemaVersion = 8;
legacyState.inquiries[0].title = "v8에서 저장한 사용자 변경 유지";
delete legacyState.knowledgeAnalysisMeta;
delete legacyState.knowledgeDocuments;
delete legacyState.knowledgeKeywordInsights;
delete legacyState.notifications;
sharedStorage.set(Store.STORAGE_KEY, JSON.stringify(legacyState));
const migratedWindow = loadContext();
const migratedState = migratedWindow.WaterCareStore.getState();
assert.equal(migratedState.meta.schemaVersion, 11, "v8 브라우저 상태를 현재 v11로 순차 마이그레이션해야 합니다.");
assert.equal(migratedState.inquiries[0].title, "v8에서 저장한 사용자 변경 유지", "지식 데이터 보충이 기존 사용자 변경을 초기화하면 안 됩니다.");
assert.equal(migratedState.knowledgeDocuments.length, 3, "마이그레이션 후 지식 문서 더미 데이터가 추가되어야 합니다.");
assert.equal(migratedState.knowledgeKeywordInsights.length, 7, "마이그레이션 후 키워드 분석 더미 데이터가 추가되어야 합니다.");
assert.equal(migratedState.notifications.length, 10, "마이그레이션 후 역할별 알림 더미 데이터가 추가되어야 합니다.");
assert(Array.isArray(migratedState.operationLog), "마이그레이션 후 운영 로그 컬렉션이 필요합니다.");
assert(migratedState.products.every((product) => migratedState.questionnaires.some((item) => item.productId === product.id && item.status !== "SUPERSEDED")), "마이그레이션 후 모든 제품에 현재 케어 주기의 사전 문진 레코드가 생성되어야 합니다.");

// The immediately previous v9 state is the primary upgrade path for existing prototype users.
const versionNineState = JSON.parse(JSON.stringify(secondStore.getState()));
versionNineState.meta.schemaVersion = 9;
versionNineState.inquiries[0].title = "v9에서 저장한 사용자 변경 유지";
delete versionNineState.notifications;
sharedStorage.set(Store.STORAGE_KEY, JSON.stringify(versionNineState));
const migratedV9State = loadContext().WaterCareStore.getState();
assert.equal(migratedV9State.meta.schemaVersion, 11, "v9 브라우저 상태를 v11로 순차 마이그레이션해야 합니다.");
assert.equal(migratedV9State.inquiries[0].title, "v9에서 저장한 사용자 변경 유지", "알림 추가가 v9 사용자 문의 변경을 초기화하면 안 됩니다.");
assert.equal(migratedV9State.notifications.length, 10, "v9 마이그레이션 후 역할별 알림이 추가되어야 합니다.");

console.log("state-flow: PASS");
