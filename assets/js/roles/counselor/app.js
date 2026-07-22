(function () {
  "use strict";

  var Store = window.WaterCareStore;
  var UI = window.WaterCareUI || {};
  var ACTOR = { role: "COUNSELOR", id: "STAFF-CONS-01", name: "한유진" };
  var root = document.getElementById("counselor-app");
  var selectedInquiryId = null;
  var detailTab = "summary";
  var filters = { query: "", status: "ALL", risk: "ALL", consultation: "ALL" };
  var notificationOpen = false;
  var toastTimer = null;

  if (!root) return;
  if (!Store || typeof Store.getState !== "function" || typeof Store.dispatch !== "function") {
    root.setAttribute("aria-busy", "false");
    root.innerHTML = '<div class="v6-error"><strong>공유 업무 모듈을 불러오지 못했습니다.</strong><p>config → domain → data → repository → store → UI 순서를 확인해 주세요.</p></div>';
    return;
  }

  var state = Store.getState();

  function escape(value) {
    if (typeof UI.escape === "function") return UI.escape(String(value == null ? "" : value));
    return String(value == null ? "" : value).replace(/[&<>'"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character];
    });
  }

  function formatDateTime(value) {
    if (!value) return "기록 없음";
    if (typeof UI.formatDateTime === "function") return UI.formatDateTime(value);
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }

  function statusLabel(code) {
    return ({
      DRAFT: "작성 중", QUESTIONNAIRE_IN_PROGRESS: "문진 진행 중", AI_GUIDANCE: "안내 확인 중",
      CONSULTATION_REQUIRED: "상담 대기", CONSULTATION_IN_PROGRESS: "상담 진행 중", VISIT_REVIEW_PENDING: "방문 검토 중",
      VISIT_SCHEDULING: "방문 일정 조율 중", VISIT_SCHEDULED: "방문 예정", COMPLETION_PENDING: "최종 완료 대기",
      REVISIT_REQUIRED: "추가 방문 필요", REOPENED: "문의 재개", RESOLVED: "처리 완료", CANCELLED: "취소됨"
    })[code] || code || "상태 미확인";
  }

  function riskLabel(code) {
    return ({ GENERAL: "일반", CAUTION: "주의", DANGER: "위험" })[code] || code || "미분류";
  }

  function usageLabel(code) {
    return ({ NORMAL: "일반 사용 가능", PARTIAL_STOP: "일부 출수·기능 사용 중지", TOTAL_STOP: "제품 전체 사용 중지", PENDING_CONSULTATION: "판단 보류·상담 필요" })[code] || code || "확인 필요";
  }

  function aiOutcomeLabel(code) {
    return ({
      SAFE_GUIDANCE_READY: "안전 안내 준비 완료",
      DANGER_DETECTED: "위험 규칙 감지",
      NO_EVIDENCE: "공식 근거 없음"
    })[code] || code || "종료 사유 확인 중";
  }

  function aiOutcomeTone(code) {
    if (code === "DANGER_DETECTED") return "danger";
    if (code === "NO_EVIDENCE") return "warning";
    return code === "SAFE_GUIDANCE_READY" ? "success" : "outline";
  }

  function chip(label, tone) {
    return '<span class="v6-chip v6-chip--' + escape(tone || "outline") + '">' + escape(label) + "</span>";
  }

  function statusTone(code) {
    if (code === "RESOLVED") return "success";
    if (code === "COMPLETION_PENDING" || code === "CONSULTATION_REQUIRED" || code === "REVISIT_REQUIRED") return "warning";
    if (code === "VISIT_SCHEDULED" || code === "VISIT_SCHEDULING") return "purple";
    return "info";
  }

  function riskTone(code) { return code === "DANGER" ? "danger" : code === "CAUTION" ? "warning" : "success"; }
  function priorityScore(code) { return ({ URGENT: 3, HIGH: 2, NORMAL: 1 })[code] || 0; }

  function getCustomer(inquiry) {
    return (state.customers || []).find(function (item) { return item.id === inquiry.customerId; }) || { id: inquiry.customerId, name: "고객 정보 확인 필요", phone: "-" };
  }

  function getProduct(inquiry) {
    return (state.products || []).find(function (item) { return item.id === inquiry.productId; }) || state.model || { productCode: "WPUJAC104DWH", manualModel: "WPU-JAC104D" };
  }

  function getVisit(inquiry) {
    var activeStatuses = ["ASSIGNING", "SCHEDULING", "CONFIRMED", "IN_PROGRESS", "FOLLOW_UP_REQUIRED"];
    return (state.visits || []).filter(function (item) { return item.inquiryId === inquiry.id; }).slice().reverse().find(function (item) {
      return activeStatuses.indexOf(item.status) >= 0;
    }) || null;
  }

  function getEvidence(inquiry) {
    if (typeof Store.getInquiryView === "function") {
      try {
        var view = Store.getInquiryView(inquiry.id, ACTOR);
        if (view && Array.isArray(view.evidenceCards)) return view.evidenceCards;
      } catch (error) {
        return [];
      }
    }
    return [];
  }

  function getStaff(id) {
    return (state.staff || []).find(function (item) { return item.id === id; }) || null;
  }

  function allowedActions(inquiry) {
    if (!inquiry) return [];
    if (typeof Store.getAllowedActions === "function") {
      try {
        var actions = Store.getAllowedActions(inquiry.id, ACTOR);
        if (Array.isArray(actions)) return actions;
      } catch (error) {
        return [];
      }
    }
    return Array.isArray(inquiry.allowedActions) ? inquiry.allowedActions : Array.isArray(inquiry.allowed_actions) ? inquiry.allowed_actions : [];
  }

  function canDo(inquiry, action) {
    return allowedActions(inquiry).indexOf(action) >= 0;
  }

  function careSchedule(product) {
    return product && product.careSchedule || {};
  }

  function usageView(inquiry) {
    var legacy = inquiry && inquiry.usageGuidance || {};
    return {
      status: inquiry.usageGuidanceStatus || legacy.usageGuidanceStatus || legacy.usageStatus || "PENDING_CONSULTATION",
      message: inquiry.usageGuidanceMessage || legacy.usageGuidanceMessage || legacy.message || "현재 사용 안내를 확인해 주세요.",
      restrictedWaterTypes: inquiry.restrictedWaterTypes || legacy.restrictedWaterTypes || [],
      restrictedFunctions: inquiry.restrictedFunctions || legacy.restrictedFunctions || [],
      basis: inquiry.guidanceBasis || legacy.guidanceBasis || legacy.decisionBasis || "확인 필요",
      nextAction: inquiry.nextAction || legacy.nextAction || "상담 결과를 확인해 주세요.",
      updatedBy: legacy.updatedBy || inquiry.usageGuidanceUpdatedBy,
      updatedAt: legacy.updatedAt || inquiry.usageGuidanceUpdatedAt
    };
  }

  function inquiryTitle(inquiry) {
    return inquiry.symptomLabel || inquiry.description || inquiry.topicCode || inquiry.id;
  }

  function queueInquiries() {
    var query = filters.query.trim().toLocaleLowerCase("ko-KR");
    return (state.inquiries || []).filter(function (inquiry) {
      if (inquiry.assignedCounselorId && inquiry.assignedCounselorId !== ACTOR.id) return false;
      var customer = getCustomer(inquiry);
      var product = getProduct(inquiry);
      var searchable = [inquiry.id, inquiry.scenarioId, inquiryTitle(inquiry), inquiry.description, customer.name, product.productCode].join(" ").toLocaleLowerCase("ko-KR");
      if (query && searchable.indexOf(query) < 0) return false;
      if (filters.status !== "ALL" && inquiry.status !== filters.status) return false;
      if (filters.risk !== "ALL" && inquiry.riskLevel !== filters.risk) return false;
      if (filters.consultation === "REQUIRED" && !inquiry.requiresConsultation) return false;
      if (filters.consultation === "FINAL" && !(inquiry.status === "COMPLETION_PENDING" && inquiry.resolutionFeedback && inquiry.resolutionFeedback.resolved)) return false;
      return inquiry.status !== "CANCELLED";
    }).sort(function (a, b) {
      var consultation = Number(Boolean(b.requiresConsultation)) - Number(Boolean(a.requiresConsultation));
      if (consultation) return consultation;
      var danger = Number(b.riskLevel === "DANGER") - Number(a.riskLevel === "DANGER");
      if (danger) return danger;
      var priority = priorityScore(b.priority) - priorityScore(a.priority);
      if (priority) return priority;
      var finalWait = Number(Boolean(b.status === "COMPLETION_PENDING" && b.resolutionFeedback && b.resolutionFeedback.resolved)) - Number(Boolean(a.status === "COMPLETION_PENDING" && a.resolutionFeedback && a.resolutionFeedback.resolved));
      if (finalWait) return finalWait;
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
  }

  function productSupportRequests() {
    return (state.productSupportRequests || []).filter(function (request) {
      return !request.assignedCounselorId || request.assignedCounselorId === ACTOR.id;
    }).sort(function (a, b) {
      var active = Number(["CONSULTATION_REQUIRED", "IN_PROGRESS"].indexOf(b.status) >= 0) - Number(["CONSULTATION_REQUIRED", "IN_PROGRESS"].indexOf(a.status) >= 0);
      return active || new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
  }

  function productSupportPanel(requests) {
    if (!requests.length) return "";
    var statusNames = { CONSULTATION_REQUIRED: "상담 접수 대기", IN_PROGRESS: "상담 진행 중", COMPLETED: "상담 완료" };
    return '<section class="v6-panel" id="counselor-product-support" style="margin-bottom:16px"><div class="v6-panel-head"><div><h2>제품 지원 범위 상담</h2><p>AI·RAG를 차단한 미지원·후속 확장·정보 불완전 제품 요청을 별도 처리합니다.</p></div>' + chip(requests.filter(function (item) { return item.status !== "COMPLETED"; }).length + "건 진행", "warning") + '</div><div class="v6-queue-list">' + requests.map(function (request) {
      var customer = (state.customers || []).find(function (item) { return item.id === request.customerId; }) || { name: request.customerId };
      var product = (state.products || []).find(function (item) { return item.id === request.productId; }) || { productCode: request.productId, manualModel: "" };
      var action = request.status === "CONSULTATION_REQUIRED" ? '<button class="v6-button v6-button--primary" type="button" data-support-dispatch="START_PRODUCT_SUPPORT_CONSULTATION" data-support-id="' + escape(request.id) + '">제품 상담 시작</button>' : request.status === "IN_PROGRESS" && request.assignedCounselorId === ACTOR.id ? '<form class="v6-support-result-form" data-support-id="' + escape(request.id) + '"><label class="v6-form-field">상담 기록<textarea name="note" required placeholder="지원 범위 확인 내용을 기록하세요.">' + escape(request.counselNote || "") + '</textarea></label><label class="v6-form-field">고객 안내 결과<textarea name="result" required placeholder="고객에게 전달할 결과를 기록하세요.">' + escape(request.result || "") + '</textarea></label><button class="v6-button v6-button--primary" type="submit">제품 상담 완료</button></form>' : "";
      return '<article class="v6-readonly-card" id="support-' + escape(request.id) + '"><div class="v6-chip-row">' + chip(statusNames[request.status] || request.status, request.status === "COMPLETED" ? "success" : "warning") + chip(request.validationStatus || "확인 필요", "outline") + '</div><strong>' + escape(customer.name + " · " + product.productCode) + '</strong><p>' + escape(request.result || request.reason || "지원 범위 확인 필요") + '</p><small>' + escape(request.id + " · " + (product.manualModel || "설명서 모델 확인 필요") + " · " + formatDateTime(request.updatedAt || request.createdAt)) + '</small>' + action + '</article>';
    }).join("") + '</div></section>';
  }

  function syntheticChip(inquiry) {
    return inquiry.scenarioId ? chip("합성 시연", "info") : "";
  }

  function queueItem(inquiry) {
    var customer = getCustomer(inquiry);
    var product = getProduct(inquiry);
    var feedbackReady = inquiry.status === "COMPLETION_PENDING" && inquiry.resolutionFeedback && inquiry.resolutionFeedback.resolved;
    return '<button class="v6-queue-item' + (selectedInquiryId === inquiry.id ? " is-selected" : "") + '" type="button" data-select-inquiry="' + escape(inquiry.id) + '" aria-pressed="' + (selectedInquiryId === inquiry.id ? "true" : "false") + '">' +
      '<span class="v6-queue-item__top"><span class="v6-chip-row">' + syntheticChip(inquiry) + chip(riskLabel(inquiry.riskLevel), riskTone(inquiry.riskLevel)) + (inquiry.requiresConsultation ? chip("상담 필수", "danger") : "") + (feedbackReady ? chip("해결 피드백 도착", "success") : "") + '</span><time datetime="' + escape(inquiry.updatedAt || "") + '">' + escape(formatDateTime(inquiry.updatedAt)) + '</time></span>' +
      '<strong>' + escape(inquiryTitle(inquiry)) + '</strong>' +
      '<small>' + escape((inquiry.scenarioId || "시나리오 없음") + " · " + customer.name + " · " + product.productCode) + '</small>' +
      '<span class="v6-queue-item__bottom">' + chip(statusLabel(inquiry.status), statusTone(inquiry.status)) + '<b>' + escape(inquiry.id) + '</b></span>' +
    '</button>';
  }

  function answerRows(inquiry) {
    var values = Object.assign({}, inquiry.answers || {});
    if (inquiry.conditions && !values.conditions) values.conditions = inquiry.conditions;
    if (inquiry.displayCode && !values.displayCode) values.displayCode = inquiry.displayCode;
    var labels = {
      conditions: "발생 조건", displayCode: "표시 문구·오류", startedAt: "발생 시점", targetWater: "대상 출수",
      companion: "동반 증상", recentNonUse: "최근 미사용", performedActions: "기수행 조치", lastCareAt: "최근 관리일"
    };
    var keys = Object.keys(values);
    if (!keys.length) return '<div class="v6-empty"><span>…</span><strong>구조화 답변이 없습니다.</strong><p>고객 추가 답변이 제출되면 이 영역에 연결됩니다.</p></div>';
    return '<dl class="v6-answer-grid">' + keys.map(function (key) {
      var value = Array.isArray(values[key]) ? values[key].join(" · ") : values[key];
      return '<div><dt>' + escape(labels[key] || key) + '</dt><dd>' + escape(value == null || value === "" ? "미입력" : value) + '</dd></div>';
    }).join("") + '</dl>';
  }

  function evidenceCard(item) {
    var verified = item.verificationStatus === "OFFICIAL_VERIFIED" || item.verificationStatus === "text_and_visual_verified";
    var landing = item.sourceLandingUrl;
    var direct = verified ? item.sourceDirectDownloadUrl : null;
    var metadata = [
      ["evidence_id", item.evidenceId], ["chunk_id", item.chunkId], ["document_id", item.documentId],
      ["문서 버전", item.documentVersion], ["근거 페이지", (item.pageRefs || []).map(function (page) { return page + "쪽"; }).join(" · ")],
      ["근거 항목", item.sectionTitle], ["출처 유형", item.sourceType], ["제공기관", item.provider],
      ["위험도", item.riskLevel], ["상담 필수", item.requiresConsultation ? "예" : "아니오"],
      ["안전 조치", (item.safeActions || []).join(" · ")], ["상담·방문 조건", (item.escalationConditions || []).join(" · ")],
      ["금지 행동", (item.prohibitedActions || []).join(" · ")], ["검증 상태", item.verificationStatus],
      ["상품 코드", item.productCode], ["매뉴얼 모델", item.manualModel], ["제품 세대", item.productGeneration],
      ["모델 계열", item.modelFamily], ["적용 범위", item.scopeRole], ["데이터 분류", item.dataClassification]
    ].filter(function (entry) { return entry[1] !== null && entry[1] !== undefined && entry[1] !== ""; });
    return '<article class="v6-evidence-card">' +
      '<span class="v6-evidence-card__icon">공식<br>매뉴얼</span>' +
      '<div><div class="v6-chip-row">' + chip(verified ? "텍스트·시각 검증 완료" : "검증 대기", verified ? "success" : "warning") + (item.scopeRole ? chip(item.scopeRole, item.scopeRole === "mvp_primary" ? "info" : "warning") : "") + '</div><h4>' + escape(item.documentTitle || "공식 근거") + '</h4><p>' + escape(item.evidenceSummary || "구조화 근거 요약이 없습니다.") + '</p>' +
      '<div class="v6-evidence-meta">' + metadata.map(function (entry) { return '<span>' + escape(entry[0]) + ' · ' + escape(entry[1]) + '</span>'; }).join("") + '</div></div>' +
      '<div class="v6-evidence-actions">' + (landing ? '<a href="' + escape(landing) + '" target="_blank" rel="noopener noreferrer">공식 출처 보기 ↗</a>' : '<span class="v6-evidence-hold">공식 검색 화면에서 문서를 확인해주세요.</span>') + (direct ? '<a href="' + escape(direct) + '" target="_blank" rel="noopener noreferrer">설명서 PDF 열기 ↗</a>' : "") + '</div>' +
    '</article>';
  }

  function evidenceSection(inquiry) {
    var items = getEvidence(inquiry);
    return '<section class="v6-section"><div class="v6-section__head"><h3>EvidenceCardDTO · 공식 근거</h3><span>' + items.length + '건</span></div>' +
      (items.length ? '<div class="v6-evidence-list">' + items.map(evidenceCard).join("") + '</div>' : '<div class="v6-evidence-hold">연결된 공식 근거가 없습니다. 임의 안내를 생성하지 말고 상담 검토를 계속하세요.</div>') + '</section>';
  }

  function usageSection(inquiry) {
    var guidance = usageView(inquiry);
    var status = guidance.status;
    var isDanger = status === "TOTAL_STOP" || status === "PARTIAL_STOP";
    return '<section class="v6-section"><div class="v6-section__head"><h3>현재 사용 안내 상태</h3><div class="v6-chip-row">' + chip(usageLabel(status), isDanger ? "danger" : status === "PENDING_CONSULTATION" ? "warning" : "success") + chip(guidance.updatedBy || "업데이트 주체 미확인", "outline") + '</div></div>' +
      '<div class="v6-usage-card' + (isDanger ? " is-danger" : "") + '"><span>' + (isDanger ? "!" : "✓") + '</span><div><strong>' + escape(usageLabel(status)) + '</strong><p>' + escape(guidance.message) + '</p><dl><div><dt>제한 출수</dt><dd>' + escape((guidance.restrictedWaterTypes || []).join(" · ") || "없음") + '</dd></div><div><dt>제한 기능</dt><dd>' + escape((guidance.restrictedFunctions || []).join(" · ") || "없음") + '</dd></div><div><dt>판단 근거</dt><dd>' + escape(guidance.basis) + '</dd></div><div><dt>다음 행동</dt><dd>' + escape(guidance.nextAction) + '</dd></div><div><dt>갱신 시각</dt><dd>' + escape(formatDateTime(guidance.updatedAt)) + '</dd></div></dl></div></div></section>';
  }

  function originalSummary(inquiry) {
    return inquiry.aiSummaryOriginal || inquiry.aiSummary || ((inquiry.conditions || "고객 입력 조건") + "을 확인했으며 공식 근거와 안전 상태를 함께 검토해야 합니다.");
  }

  function summaryRevision(inquiry) {
    if (!inquiry.aiSummaryRevision) return null;
    if (typeof inquiry.aiSummaryRevision === "string") return { text: inquiry.aiSummaryRevision };
    return inquiry.aiSummaryRevision;
  }

  function confirmedSummary(inquiry) {
    var confirmed = inquiry.confirmedConsultationSummary || inquiry.confirmed_consultation_summary || inquiry.consultationSummaryConfirmed;
    if (!confirmed) return null;
    if (typeof confirmed === "string") return { text: confirmed, confirmedBy: inquiry.summaryConfirmedBy, confirmedAt: inquiry.summaryConfirmedAt };
    return {
      text: confirmed.text || confirmed.summary || confirmed.value || "",
      confirmedBy: confirmed.confirmedBy || confirmed.confirmed_by || inquiry.summaryConfirmedBy,
      confirmedAt: confirmed.confirmedAt || confirmed.confirmed_at || inquiry.summaryConfirmedAt
    };
  }

  function aiSummarySection(inquiry) {
    var revision = summaryRevision(inquiry);
    var confirmed = confirmedSummary(inquiry);
    var canUpdate = canDo(inquiry, "UPDATE_CONSULTATION_SUMMARY");
    var canConfirm = canDo(inquiry, "CONFIRM_CONSULTATION_SUMMARY");
    var editableText = revision && revision.text || confirmed && confirmed.text || "";
    return '<section class="v6-section"><div class="v6-section__head"><h3>AI 상담 요약·상담사 확정본</h3><div class="v6-chip-row">' + chip(inquiry.aiState || "IDLE", "info") + chip(aiOutcomeLabel(inquiry.aiOutcome), aiOutcomeTone(inquiry.aiOutcome)) + '</div></div>' +
      '<div class="v6-ai-summary"><span>AI</span><div><strong>AI 상담 요약 초안 · 수정 불가</strong><p>' + escape(originalSummary(inquiry)) + '</p></div></div>' +
      (revision ? '<div class="v6-ai-summary"><span>수정</span><div><strong>상담사 수정본 · 미확정</strong><p>' + escape(revision.text) + '</p><small>' + escape((revision.editedBy || "상담사") + " · " + formatDateTime(revision.editedAt)) + '</small></div></div>' : '<div class="v6-evidence-hold"><strong>상담사 수정본 없음</strong><p>AI 초안을 그대로 승인하거나 필요한 보완 내용을 별도 수정본으로 저장합니다.</p></div>') +
      (confirmed ? '<div class="v6-ai-summary"><span>확정</span><div><strong>상담사 확정본 · 기사 인계용</strong><p>' + escape(confirmed.text) + '</p><small>' + escape((confirmed.confirmedBy || "담당 상담사") + " · " + formatDateTime(confirmed.confirmedAt)) + '</small></div></div>' : '<div class="v6-evidence-hold"><strong>상담사 확정본 없음</strong><p>방문 인계 전 상담 요약을 확정해 주세요.</p></div>') +
      ((canUpdate || canConfirm) ? '<form id="ai-summary-revision-form" data-inquiry-id="' + escape(inquiry.id) + '"><label class="v6-form-field">상담사 검토 요약<textarea name="summaryRevision" maxlength="1000" placeholder="비워두고 확정하면 AI 초안을 그대로 승인합니다.">' + escape(editableText) + '</textarea></label><div class="v6-action-buttons">' + (canUpdate ? '<button class="v6-button v6-button--secondary v6-button--full" type="submit" value="UPDATE_CONSULTATION_SUMMARY">수정본 저장</button>' : "") + (canConfirm ? '<button class="v6-button v6-button--primary v6-button--full" type="submit" value="CONFIRM_CONSULTATION_SUMMARY">상담 요약 확정</button>' : "") + '</div><p class="v6-action-note">수정·확정 명령은 문의 상태를 바꾸지 않으며 AI 초안은 원본으로 보존됩니다.</p></form>' : '<p class="v6-action-note">현재 담당자와 상태에서 허용된 요약 작업이 없습니다.</p>') +
    '</section>';
  }

  function timelineSection(inquiry) {
    var items = (inquiry.timeline || []).slice().reverse();
    return '<section class="v6-section"><div class="v6-section__head"><h3>상태·처리 이력</h3><span>최신순 · ' + items.length + '건</span></div>' + (items.length ? '<ol class="v6-timeline">' + items.map(function (item) {
      return '<li><i></i><div><header><strong>' + escape(item.label || item.event || "상태 변경") + '</strong><time datetime="' + escape(item.at || "") + '">' + escape(formatDateTime(item.at)) + '</time></header><p>' + escape((item.actor || "시스템") + " · " + (item.event || "이벤트 기록")) + '</p></div></li>';
    }).join("") + '</ol>' : '<div class="v6-empty"><span>◷</span><strong>처리 이력이 없습니다.</strong></div>') + '</section>';
  }

  function summaryTab(inquiry) {
    var customer = getCustomer(inquiry);
    var product = getProduct(inquiry);
    var counselor = getStaff(inquiry.assignedCounselorId);
    var schedule = careSchedule(product);
    var actionResult = inquiry.actionResult && (inquiry.actionResult.result || inquiry.actionResult.note || inquiry.actionResult.status) || inquiry.selfActionResult || "수행 결과 미입력";
    var feedback = inquiry.resolutionFeedback;
    var feedbackSection = feedback ? '<section class="v6-section"><div class="v6-section__head"><h3>고객 해결 피드백</h3><span>' + escape(feedback.resolved ? "해결됨" : "미해결") + '</span></div><dl class="v6-summary-grid"><div><dt>고객 의견</dt><dd>' + escape(feedback.comment || "의견 없음") + '</dd></div><div><dt>제출 시각</dt><dd>' + escape(formatDateTime(feedback.submittedAt)) + '</dd></div></dl></section>' : "";
    return (inquiry.riskLevel === "DANGER" ? '<div class="v6-danger-alert"><b>!</b><div><strong>사용·음용 중지 우선 문의</strong><p>위험 신호와 안전조치 이행 여부를 먼저 확인하고, 일반 자가조치를 안내하지 마세요.</p></div></div>' : "") +
      usageSection(inquiry) +
      '<section class="v6-section"><div class="v6-section__head"><h3>고객·제품·관리 이력</h3><span>고객 재입력 없음</span></div><dl class="v6-summary-grid"><div><dt>고객·구독</dt><dd>' + escape(customer.id + " · " + (customer.subscriptionId || product.subscriptionId || "-")) + '</dd></div><div><dt>제품·매뉴얼</dt><dd>' + escape(product.productCode + " · " + product.manualModel) + '</dd></div><div><dt>문의·시나리오</dt><dd>' + escape(inquiry.id + " · " + (inquiry.scenarioId || "-")) + '</dd></div><div><dt>담당 상담원</dt><dd>' + escape(counselor ? counselor.name : "미배정") + '</dd></div><div><dt>관리 유형·사용 시작일</dt><dd>' + escape((product.managementLabel || product.managementType || "확인 필요") + " · " + formatDateTime(product.serviceStartDate || product.installedAt)) + '</dd></div><div><dt>최근 관리일</dt><dd>' + escape(formatDateTime(product.lastCareDate || product.lastCareAt)) + '</dd></div><div><dt>최근 필터·카트리지 교체일</dt><dd>' + escape(formatDateTime(product.lastFilterReplacementDate || product.lastFilterChangedAt)) + '</dd></div><div><dt>다음 케어 예정·기준</dt><dd>' + escape((schedule.nextCareDate || schedule.nextCareAt ? formatDateTime(schedule.nextCareDate || schedule.nextCareAt) : "확인 필요") + " · " + (schedule.nextCareBasis || schedule.sourceType || schedule.note || "기준 미확정")) + '</dd></div></dl></section>' +
      '<section class="v6-section"><div class="v6-section__head"><h3>고객 최초 입력</h3><span>원문 보존</span></div><blockquote class="v6-original">“' + escape(inquiry.description || "입력 원문 없음") + '”</blockquote></section>' +
      '<section class="v6-section"><div class="v6-section__head"><h3>구조화된 고객 답변</h3><span>반복 질문 방지</span></div>' + answerRows(inquiry) + '</section>' +
      '<section class="v6-section"><div class="v6-section__head"><h3>고객 수행 조치·결과</h3><span>상담·기사 인계</span></div><dl class="v6-summary-grid"><div><dt>수행한 조치</dt><dd>' + escape((inquiry.performedActions || []).join(" · ") || inquiry.conditions || "수행 조치 미입력") + '</dd></div><div><dt>조치 결과</dt><dd>' + escape(actionResult) + '</dd></div></dl></section>' +
      evidenceSection(inquiry) +
      aiSummarySection(inquiry) + feedbackSection;
  }

  function answersTab(inquiry) {
    return '<section class="v6-section"><div class="v6-section__head"><h3>고객 원문</h3><span>' + escape(inquiry.scenarioId || "합성 시연") + '</span></div><blockquote class="v6-original">“' + escape(inquiry.description || "입력 없음") + '”</blockquote></section>' +
      '<section class="v6-section"><div class="v6-section__head"><h3>문진·추가 답변</h3><span>누락 질문 ' + (inquiry.missingFields || []).length + '개</span></div>' + answerRows(inquiry) + ((inquiry.missingFields || []).length ? '<div class="v6-evidence-hold">추가 확인: ' + escape(inquiry.missingFields.join(" · ")) + '</div>' : "") + '</section>';
  }

  function evidenceTab(inquiry) { return evidenceSection(inquiry) + usageSection(inquiry); }
  function detailTabContent(inquiry) { if (detailTab === "answers") return answersTab(inquiry); if (detailTab === "evidence") return evidenceTab(inquiry); if (detailTab === "timeline") return timelineSection(inquiry); return summaryTab(inquiry); }

  function localDateTime(value) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    var pad = function (number) { return String(number).padStart(2, "0"); };
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function counselorAction(inquiry) {
    var head = '<div class="v6-action-panel__head"><small>COUNSEL DESK</small><h3>상담 처리</h3><p>' + escape(inquiry.id + " · stateVersion " + inquiry.stateVersion) + '</p></div>';
    if (inquiry.status === "CONSULTATION_REQUIRED" || inquiry.status === "REOPENED") {
      var startEvent = inquiry.status === "REOPENED" ? "RESUME_CONSULTATION" : "START_CONSULTATION";
      var startLabel = inquiry.status === "REOPENED" ? "재개 문의 재상담" : "상담 시작";
      return head + '<div class="v6-readonly-card"><strong>' + (canDo(inquiry, startEvent) ? "상담을 시작할 수 있습니다." : "현재 허용된 상담 시작 작업이 없습니다.") + '</strong>고객 원문, 구조화 답변, 위험 상태와 공식 근거를 먼저 확인하세요.</div>' + (canDo(inquiry, startEvent) ? '<div class="v6-action-buttons"><button class="v6-button v6-button--primary v6-button--full" type="button" data-dispatch="' + startEvent + '">' + startLabel + '</button></div>' : "");
    }
    if (inquiry.status === "CONSULTATION_IN_PROGRESS") {
      var guidance = usageView(inquiry);
      var currentUsage = guidance.status;
      var usageOptions = [
        ["PENDING_CONSULTATION", "판단 보류·상담 필요"],
        ["NORMAL", "일반 사용 가능"],
        ["PARTIAL_STOP", "일부 출수·기능 사용 중지"],
        ["TOTAL_STOP", "제품 전체 사용 중지"]
      ].map(function (option) { return '<option value="' + option[0] + '"' + (currentUsage === option[0] ? " selected" : "") + '>' + option[1] + '</option>'; }).join("");
      var canReview = canDo(inquiry, "VISIT_REVIEW_REQUIRED");
      var canComplete = canDo(inquiry, "CONSULTATION_COMPLETED");
      if (!canReview && !canComplete) return head + '<div class="v6-readonly-card"><strong>현재 허용된 상담 상태 작업이 없습니다.</strong>요약 수정·확정 등 콘텐츠 작업은 본문에서 확인하세요.</div>';
      return head + '<form id="counsel-result-form" data-inquiry-id="' + escape(inquiry.id) + '"><label class="v6-form-field">상담 기록<textarea name="note" required placeholder="고객에게 추가로 확인한 내용과 안내를 기록하세요.">' + escape(inquiry.counselRecord && inquiry.counselRecord.note || "") + '</textarea></label><label class="v6-form-field">상담 결과<textarea name="outcome" placeholder="상담 완료 시 처리 결과를 입력하세요.">' + escape(inquiry.counselRecord && inquiry.counselRecord.outcome || "") + '</textarea></label><label class="v6-form-field">처리 후 사용 안내<select name="usageGuidanceStatus" required>' + usageOptions + '</select><small>현재 저장값 · ' + escape(usageLabel(currentUsage)) + '</small></label><label class="v6-form-field">고객 표시용 안내<textarea name="usageGuidanceMessage" placeholder="현재 사용할 수 있는 기능과 제한을 고객이 이해하기 쉽게 입력하세요.">' + escape(guidance.message) + '</textarea></label><label class="v6-form-field">안내 판단 근거<textarea name="guidanceBasis" placeholder="공식 근거와 상담 확인 내용을 입력하세요.">' + escape(guidance.basis) + '</textarea></label><label class="v6-form-field">고객의 다음 행동<textarea name="nextAction" placeholder="경과 확인, 상담 응답, 방문 준비 등 다음 행동을 입력하세요.">' + escape(guidance.nextAction) + '</textarea></label><div class="v6-action-buttons">' + (canReview ? '<button class="v6-button v6-button--secondary v6-button--full" type="submit" value="VISIT_REVIEW_REQUIRED">방문 필요 검토</button>' : "") + (canComplete ? '<button class="v6-button v6-button--primary v6-button--full" type="submit" value="CONSULTATION_COMPLETED">방문 불필요 · 상담 완료</button>' : "") + '</div><p class="v6-action-note">방문 검토는 상담 기록만 필수이며, 상담 완료 시에는 상담 결과와 사용 안내를 저장하고 고객 해결 피드백을 기다립니다.</p></form>';
    }
    if (inquiry.status === "VISIT_REVIEW_PENDING" || inquiry.status === "VISIT_SCHEDULING" || inquiry.status === "REVISIT_REQUIRED") return head + visitTransitionForm(inquiry);
    if (inquiry.status === "COMPLETION_PENDING") {
      var feedback = inquiry.resolutionFeedback;
      var counselPath = inquiry.path === "COUNSEL";
      var assigned = inquiry.assignedCounselorId === ACTOR.id;
      var recordComplete = Boolean(inquiry.counselRecord && inquiry.counselRecord.note && inquiry.counselRecord.outcome);
      var canFinalize = Boolean(feedback && feedback.resolved && counselPath && assigned && recordComplete && canDo(inquiry, "FINALIZE_INQUIRY"));
      return head + '<div class="v6-readonly-card"><strong>' + (feedback && feedback.resolved ? "고객 해결 피드백이 도착했습니다." : "고객 해결 피드백을 기다리고 있습니다.") + '</strong>' + (feedback ? escape((feedback.comment || "의견 없음") + " · " + formatDateTime(feedback.submittedAt)) : "상담 결과를 확인한 고객이 해결 여부를 제출하면 최종 완료할 수 있습니다.") + '</div><ul class="v6-guard-list"><li class="' + (feedback && feedback.resolved ? "" : "is-failed") + '">해결됨 피드백 저장</li><li class="' + (counselPath ? "" : "is-failed") + '">상담 경로 문의</li><li class="' + (assigned ? "" : "is-failed") + '">현재 상담원 담당 건</li><li class="' + (recordComplete ? "" : "is-failed") + '">상담 결과 필수값 완료</li></ul><div class="v6-action-buttons"><button class="v6-button v6-button--primary v6-button--full" type="button" data-dispatch="FINALIZE_INQUIRY"' + (canFinalize ? "" : " disabled") + '>문의 최종 완료</button></div>';
    }
    if (inquiry.status === "VISIT_SCHEDULED") {
      var visit = getVisit(inquiry);
      return head + '<div class="v6-readonly-card"><strong>방문 일정이 확정되었습니다.</strong>' + escape(visit ? formatDateTime(visit.confirmedAt || visit.desiredAt) + " · " + (getStaff(visit.technicianId) || {}).name : "기사 업무 진행을 기다리고 있습니다.") + '</div>';
    }
    return head + '<div class="v6-readonly-card"><strong>' + escape(statusLabel(inquiry.status)) + '</strong>현재 단계에는 상담원이 실행할 상태 변경 작업이 없습니다.</div>';
  }

  function visitTransitionForm(inquiry) {
    var visit = getVisit(inquiry);
    var technicians = (state.staff || []).filter(function (staff) { return staff.role === "TECHNICIAN"; });
    var selectedTechnician = visit && visit.technicianId || inquiry.assignedTechnicianId || "";
    var visitStatus = visit && ({ ASSIGNING: "기사 배정 중", SCHEDULING: "일정 조율 중", CONFIRMED: "방문 확정", FOLLOW_UP_REQUIRED: "추가 방문 필요" })[visit.status] || "방문 요청 전";
    var actions = allowedActions(inquiry);
    var actionButtons = (canDo(inquiry, "VISIT_NEEDED") ? '<button class="v6-button v6-button--primary v6-button--full" type="submit" value="VISIT_NEEDED">방문 필요 확정</button>' : "") + (canDo(inquiry, "UPDATE_VISIT_SCHEDULE") ? '<button class="v6-button v6-button--secondary v6-button--full" type="submit" value="UPDATE_VISIT_SCHEDULE">일정 조율 저장</button>' : "") + (canDo(inquiry, "CONFIRM_VISIT") ? '<button class="v6-button v6-button--primary v6-button--full" type="submit" value="CONFIRM_VISIT">방문 확정</button>' : "");
    if (!actions.length || !actionButtons) return '<div class="v6-readonly-card"><strong>방문 일정 · ' + escape(visitStatus) + '</strong>현재 담당자와 상태에서 허용된 방문 전환 작업이 없습니다.</div>';
    return '<form id="visit-transition-form" data-inquiry-id="' + escape(inquiry.id) + '"><div class="v6-readonly-card"><strong>방문 일정 상태</strong>' + escape(visitStatus) + '</div><label class="v6-form-field">방문 사유<textarea name="visitReason" required placeholder="방문 전환이 필요한 이유를 기록하세요.">' + escape(visit && visit.visitReason || inquiry.counselRecord && inquiry.counselRecord.note || "") + '</textarea></label><label class="v6-form-field">고객 희망일<input type="datetime-local" name="desiredAt" value="' + escape(localDateTime(visit && visit.desiredAt)) + '" required></label><label class="v6-form-field">가상 방문기사<select name="technicianId" required><option value="">기사를 선택하세요</option>' + technicians.map(function (staff) { return '<option value="' + escape(staff.id) + '"' + (selectedTechnician === staff.id ? " selected" : "") + '>' + escape(staff.name + " · " + staff.team) + '</option>'; }).join("") + '</select></label><label class="v6-form-field">점검 우선순위<textarea name="inspectionPriority" required placeholder="위험도와 상담 결과를 기준으로 우선 점검 항목을 기록하세요.">' + escape(visit && visit.inspectionPriority || inquiry.symptomLabel || "") + '</textarea></label><label class="v6-form-field">기사 전달사항<textarea name="notes" required placeholder="고객 답변과 현장 인계 사항을 기록하세요.">' + escape(visit && visit.notes || "") + '</textarea></label><label class="v6-form-field">안전 유의사항<textarea name="safetyNotes" required placeholder="현장에서 재확인할 안전 항목을 기록하세요.">' + escape(visit && visit.safetyNotes || "") + '</textarea></label><label class="v6-form-field">가상 방문 확정일<input type="datetime-local" name="confirmedAt" value="' + escape(localDateTime(visit && visit.confirmedAt)) + '"></label><div class="v6-action-buttons">' + actionButtons + '</div><p class="v6-action-note">방문 확정은 기사와 확정일이 모두 있을 때만 가능합니다.</p></form>';
  }

  function renderDetail(inquiry) {
    if (!inquiry) return '<div class="v6-detail-empty"><span>◎</span><strong>확인할 문의를 선택해 주세요.</strong><p>왼쪽 상담 큐에서 문의를 선택하면 고객 원문부터 최종 완료 작업까지 확인할 수 있습니다.</p></div>';
    var customer = getCustomer(inquiry);
    var product = getProduct(inquiry);
    return '<article class="v6-detail"><header class="v6-detail-head"><div><div class="v6-chip-row">' + syntheticChip(inquiry) + chip(statusLabel(inquiry.status), statusTone(inquiry.status)) + chip(riskLabel(inquiry.riskLevel), riskTone(inquiry.riskLevel)) + (inquiry.requiresConsultation ? chip("상담 필수", "danger") : "") + '</div><h2>' + escape(inquiryTitle(inquiry)) + '</h2><p>' + escape(inquiry.id + " · " + (inquiry.scenarioId || "시나리오 없음") + " · 접수 " + formatDateTime(inquiry.createdAt)) + '</p></div><div class="v6-customer-card"><span>' + escape(customer.name.slice(-3)) + '</span><div><strong>' + escape(customer.name) + '</strong><small>' + escape(customer.id + " · " + product.productCode) + '</small></div></div></header>' +
      '<nav class="v6-tabs" aria-label="문의 상세 탭" role="tablist">' + [{ id: "summary", label: "통합 요약" }, { id: "answers", label: "고객 답변" }, { id: "evidence", label: "공식 근거·사용 상태" }, { id: "timeline", label: "처리 이력" }].map(function (tab) { return '<button class="' + (detailTab === tab.id ? "is-active" : "") + '" type="button" role="tab" aria-selected="' + (detailTab === tab.id ? "true" : "false") + '" data-detail-tab="' + tab.id + '">' + tab.label + '</button>'; }).join("") + '</nav><div class="v6-detail-body"><div class="v6-detail-content">' + detailTabContent(inquiry) + '</div><aside class="v6-action-panel" aria-label="상담 처리 작업">' + counselorAction(inquiry) + '</aside></div></article>';
  }

  function render() {
    state = Store.getState();
    var inquiries = queueInquiries();
    var supportRequests = productSupportRequests();
    if (!selectedInquiryId || !inquiries.some(function (item) { return item.id === selectedInquiryId; })) selectedInquiryId = inquiries[0] && inquiries[0].id || null;
    var selected = inquiries.find(function (item) { return item.id === selectedInquiryId; }) || null;
    var consultationCount = inquiries.filter(function (item) { return ["CONSULTATION_REQUIRED", "REOPENED"].indexOf(item.status) >= 0; }).length;
    var dangerCount = inquiries.filter(function (item) { return item.riskLevel === "DANGER" && item.status !== "RESOLVED"; }).length;
    var finalCount = inquiries.filter(function (item) { return item.status === "COMPLETION_PENDING" && item.resolutionFeedback && item.resolutionFeedback.resolved; }).length;
    document.getElementById("counselor-queue-count").textContent = String(consultationCount + dangerCount + finalCount + supportRequests.filter(function (item) { return item.status !== "COMPLETED"; }).length);
    root.setAttribute("aria-busy", "false");
    root.innerHTML = '<header class="v6-page-head"><div class="v6-page-head__copy"><small>CONS-01 · CONS-02 · CONS-03</small><h1>상담·문의 큐</h1><p>위험·상담 필수·최종 완료 대기 순으로 확인하고, 고객 원문과 공식 근거를 보존한 채 방문기사에게 인계합니다.</p></div><div class="v6-page-head__meta"><span>고정 상담원 · 한유진</span><span>공식 모델 · WPUJAC104DWH</span><span>담당·미배정 합성 문의 · ' + inquiries.length + '건</span></div></header>' +
      '<section class="v6-metric-grid" aria-label="상담 업무 요약"><article class="v6-metric-card is-warning"><div><span>상담 대기</span><i>◷</i></div><strong>' + consultationCount + '</strong><small>신규·재개 상담 시작 필요</small></article><article class="v6-metric-card is-danger"><div><span>위험 문의</span><i>!</i></div><strong>' + dangerCount + '</strong><small>사용·음용 중지 우선</small></article><article class="v6-metric-card"><div><span>방문 진행</span><i>□</i></div><strong>' + inquiries.filter(function (item) { return ["VISIT_REVIEW_PENDING", "VISIT_SCHEDULING", "VISIT_SCHEDULED", "REVISIT_REQUIRED"].indexOf(item.status) >= 0; }).length + '</strong><small>검토·조율·확정·재방문</small></article><article class="v6-metric-card is-safe"><div><span>최종 완료 가능</span><i>✓</i></div><strong>' + finalCount + '</strong><small>고객 해결 피드백 도착</small></article></section>' +
      productSupportPanel(supportRequests) +
      '<section class="v6-panel v6-filter-panel" aria-label="상담 큐 검색과 필터"><label class="v6-filter">문의 검색<input id="counselor-query" type="search" value="' + escape(filters.query) + '" placeholder="문의·시나리오·고객·모델 검색"></label><label class="v6-filter">상태<select id="counselor-status"><option value="ALL">전체 상태</option>' + Array.from(new Set(inquiries.map(function (item) { return item.status; }))).map(function (code) { return '<option value="' + escape(code) + '"' + (filters.status === code ? " selected" : "") + '>' + escape(statusLabel(code)) + '</option>'; }).join("") + '</select></label><label class="v6-filter">위험도<select id="counselor-risk"><option value="ALL">전체 위험도</option><option value="DANGER"' + (filters.risk === "DANGER" ? " selected" : "") + '>위험</option><option value="CAUTION"' + (filters.risk === "CAUTION" ? " selected" : "") + '>주의</option><option value="GENERAL"' + (filters.risk === "GENERAL" ? " selected" : "") + '>일반</option></select></label><label class="v6-filter">업무 우선 조건<select id="counselor-consultation"><option value="ALL">전체</option><option value="REQUIRED"' + (filters.consultation === "REQUIRED" ? " selected" : "") + '>상담 필수</option><option value="FINAL"' + (filters.consultation === "FINAL" ? " selected" : "") + '>최종 완료 대기</option></select></label><span class="v6-filter-summary"><b>' + inquiries.length + '</b>건</span></section>' +
      '<section class="v6-panel v6-queue-layout"><aside class="v6-queue-column" aria-label="상담 문의 목록"><div class="v6-queue-column__head"><strong>우선순위 큐</strong><span>위험·상담·피드백 기준</span></div><div class="v6-queue-list">' + (inquiries.length ? inquiries.map(queueItem).join("") : '<div class="v6-empty"><span>⌕</span><strong>조건에 맞는 문의가 없습니다.</strong><p>검색어나 필터를 변경해 주세요.</p></div>') + '</div></aside><section class="v6-detail" id="counselor-detail">' + renderDetail(selected) + '</section></section>';
    renderNotifications();
  }

  function idempotencyKey(eventName, inquiryId) {
    var random = window.crypto && typeof window.crypto.randomUUID === "function" ? window.crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2);
    return eventName + ":" + inquiryId + ":" + random;
  }

  function toIso(value) {
    if (!value) return null;
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function showToast(message, tone) {
    if (typeof UI.toast === "function" && document.getElementById("toast")) { UI.toast(message, tone); return; }
    var element = document.getElementById("v6-toast");
    if (!element) return;
    window.clearTimeout(toastTimer);
    element.textContent = message;
    element.className = "v6-toast is-visible" + (tone ? " is-" + tone : "");
    toastTimer = window.setTimeout(function () { element.className = "v6-toast"; }, 2800);
  }

  function dispatch(eventName, inquiry, payload) {
    payload = Object.assign({}, payload || {}, {
      inquiryId: inquiry.id,
      stateVersion: inquiry.stateVersion,
      idempotencyKey: idempotencyKey(eventName, inquiry.id)
    });
    try {
      var result = Store.dispatch(eventName, payload, ACTOR);
      if (result && typeof result.then === "function") {
        return result.then(function () { state = Store.getState(); render(); showToast("업무 상태를 반영했습니다.", "success"); }).catch(function (error) { showToast(error.message || "상태를 변경하지 못했습니다.", "danger"); });
      }
      state = Store.getState();
      render();
      showToast("업무 상태를 반영했습니다.", "success");
      return result;
    } catch (error) {
      showToast(error.message || "상태를 변경하지 못했습니다.", "danger");
      return null;
    }
  }

  function dispatchProductSupport(eventName, requestId, extra) {
    try {
      var payload = Object.assign({ productSupportRequestId: requestId, idempotencyKey: idempotencyKey(eventName, requestId) }, extra || {});
      Store.dispatch(eventName, payload, ACTOR);
      state = Store.getState();
      render();
      showToast("제품 상담 상태를 반영했습니다.", "success");
    } catch (error) {
      showToast(error.message || "제품 상담 상태를 변경하지 못했습니다.", "danger");
    }
  }

  function currentInquiry() {
    return (state.inquiries || []).find(function (item) { return item.id === selectedInquiryId; }) || null;
  }

  function submitCounselResult(form, eventName) {
    var inquiry = currentInquiry();
    if (!inquiry) return;
    if (!canDo(inquiry, eventName)) { showToast("현재 상태에서 허용되지 않은 상담 작업입니다.", "danger"); return; }
    var data = new FormData(form);
    var note = String(data.get("note") || "").trim();
    var outcome = String(data.get("outcome") || "").trim();
    if (!note) { showToast("상담 기록을 입력해 주세요.", "danger"); return; }
    if (eventName === "CONSULTATION_COMPLETED" && !outcome) { showToast("상담 완료 결과를 입력해 주세요.", "danger"); return; }
    if (eventName === "CONSULTATION_COMPLETED") dispatch(eventName, inquiry, {
      note: note,
      outcome: outcome,
      usageGuidanceStatus: data.get("usageGuidanceStatus"),
      usageGuidanceMessage: String(data.get("usageGuidanceMessage") || "").trim(),
      guidanceBasis: String(data.get("guidanceBasis") || "").trim(),
      nextAction: String(data.get("nextAction") || "").trim()
    });
    else dispatch(eventName, inquiry, { note: note });
  }

  function submitAISummaryRevision(form, eventName) {
    var inquiry = currentInquiry();
    if (!inquiry) return;
    var text = String(new FormData(form).get("summaryRevision") || "").trim();
    if (!canDo(inquiry, eventName)) { showToast("현재 상태에서 허용되지 않은 요약 작업입니다.", "danger"); return; }
    if (eventName === "UPDATE_CONSULTATION_SUMMARY" && !text) { showToast("상담사 수정 요약을 입력해 주세요.", "danger"); return; }
    dispatch(eventName, inquiry, { text: text || originalSummary(inquiry) });
  }

  function submitVisitTransition(form, eventName) {
    var inquiry = currentInquiry();
    if (!inquiry) return;
    var visit = getVisit(inquiry);
    var data = new FormData(form);
    var desiredAt = toIso(data.get("desiredAt"));
    var confirmedAt = toIso(data.get("confirmedAt"));
    var technicianId = String(data.get("technicianId") || "");
    var visitReason = String(data.get("visitReason") || "").trim();
    var inspectionPriority = String(data.get("inspectionPriority") || "").trim();
    var notes = String(data.get("notes") || "").trim();
    var safetyNotes = String(data.get("safetyNotes") || "").trim();
    if (!canDo(inquiry, eventName)) { showToast("현재 상태에서 허용되지 않은 방문 전환 작업입니다.", "danger"); return; }
    if (!visitReason || !desiredAt || !technicianId || !inspectionPriority || !notes || !safetyNotes) { showToast("방문 사유, 희망일, 기사, 점검 우선순위, 전달사항과 안전 유의사항을 모두 입력해 주세요.", "danger"); return; }
    if (eventName === "CONFIRM_VISIT" && !confirmedAt) { showToast("방문 확정일을 입력해 주세요.", "danger"); return; }
    var payload = { technicianId: technicianId, desiredAt: desiredAt, visitReason: visitReason, inspectionPriority: inspectionPriority, notes: notes, safetyNotes: safetyNotes };
    if (visit) payload.visitId = visit.id;
    if (eventName !== "VISIT_NEEDED") payload.confirmedAt = confirmedAt;
    dispatch(eventName, inquiry, payload);
  }

  function counselorNotifications() {
    return (state.notifications || []).filter(function (item) { return item.role === ACTOR.role && (!item.recipientId || item.recipientId === ACTOR.id); }).sort(function (a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
  }

  function renderNotifications() {
    var items = counselorNotifications();
    var unread = items.filter(function (item) { return !item.read; }).length;
    var badge = document.getElementById("counselor-notification-count");
    var toggle = document.getElementById("counselor-notification-toggle");
    if (badge) { badge.textContent = String(unread); badge.hidden = unread === 0; }
    if (toggle) toggle.setAttribute("aria-label", "상담원 알림, 읽지 않은 알림 " + (unread ? unread + "개" : "없음"));
    var list = document.getElementById("counselor-notification-list");
    if (!list) return;
    list.innerHTML = items.length ? items.map(function (item) {
      return '<button class="v6-notification-item' + (!item.read ? " is-unread" : "") + '" type="button" data-notification-id="' + escape(item.id || "") + '" data-notification-inquiry="' + escape(item.inquiryId || "") + '" data-notification-support="' + escape(item.productSupportRequestId || "") + '"><span>i</span><div><strong>' + escape(item.title) + '</strong><p>' + escape(item.message) + '</p><small>' + escape(formatDateTime(item.createdAt)) + '</small></div></button>';
    }).join("") : '<div class="v6-notification-empty">새 상담 알림이 없습니다.</div>';
  }

  function setNotificationPanel(open) {
    var panel = document.getElementById("counselor-notification-panel");
    var toggle = document.getElementById("counselor-notification-toggle");
    if (!panel || !toggle) return;
    notificationOpen = open;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      renderNotifications();
      var first = panel.querySelector("button");
      if (first) first.focus({ preventScroll: true });
    } else toggle.focus({ preventScroll: true });
  }

  root.addEventListener("click", function (event) {
    var supportAction = event.target.closest("[data-support-dispatch]");
    if (supportAction) { dispatchProductSupport(supportAction.dataset.supportDispatch, supportAction.dataset.supportId); return; }
    var select = event.target.closest("[data-select-inquiry]");
    if (select) { selectedInquiryId = select.dataset.selectInquiry; detailTab = "summary"; render(); return; }
    var tab = event.target.closest("[data-detail-tab]");
    if (tab) { detailTab = tab.dataset.detailTab; render(); return; }
    var action = event.target.closest("[data-dispatch]");
    if (action && !action.disabled) {
      var inquiry = currentInquiry();
      if (inquiry && canDo(inquiry, action.dataset.dispatch)) dispatch(action.dataset.dispatch, inquiry);
      else showToast("현재 상태에서 허용되지 않은 상담 작업입니다.", "danger");
      return;
    }
  });

  root.addEventListener("submit", function (event) {
    event.preventDefault();
    var eventName = event.submitter && event.submitter.value;
    if (event.target.classList.contains("v6-support-result-form")) {
      var supportData = new FormData(event.target);
      dispatchProductSupport("COMPLETE_PRODUCT_SUPPORT", event.target.dataset.supportId, { note: String(supportData.get("note") || "").trim(), result: String(supportData.get("result") || "").trim() });
      return;
    }
    if (event.target.id === "ai-summary-revision-form") submitAISummaryRevision(event.target, eventName);
    if (event.target.id === "counsel-result-form") submitCounselResult(event.target, eventName);
    if (event.target.id === "visit-transition-form") submitVisitTransition(event.target, eventName);
  });

  root.addEventListener("input", function (event) {
    if (event.target.id !== "counselor-query") return;
    filters.query = event.target.value;
    var cursor = filters.query.length;
    render();
    var next = document.getElementById("counselor-query");
    if (next) { next.focus(); next.setSelectionRange(cursor, cursor); }
  });

  root.addEventListener("change", function (event) {
    if (event.target.id === "counselor-status") filters.status = event.target.value;
    else if (event.target.id === "counselor-risk") filters.risk = event.target.value;
    else if (event.target.id === "counselor-consultation") filters.consultation = event.target.value;
    else return;
    render();
  });

  document.querySelectorAll("[data-counselor-section]").forEach(function (button) {
    button.addEventListener("click", function () {
      var target = button.dataset.counselorSection === "queue" ? document.getElementById("counselor-query") : document.getElementById("counselor-detail");
      if (target) { target.scrollIntoView({ block: "start", behavior: "smooth" }); target.focus({ preventScroll: true }); }
    });
  });

  document.getElementById("counselor-notification-toggle").addEventListener("click", function () { setNotificationPanel(!notificationOpen); });
  document.getElementById("counselor-notification-panel").addEventListener("click", function (event) {
    if (event.target.closest("[data-close-notifications]")) { setNotificationPanel(false); return; }
    var item = event.target.closest("[data-notification-id]");
    if (item) {
      if (item.dataset.notificationId) {
        try {
          Store.dispatch("MARK_NOTIFICATION_READ", {
            notificationId: item.dataset.notificationId,
            idempotencyKey: idempotencyKey("MARK_NOTIFICATION_READ", item.dataset.notificationId)
          }, ACTOR);
          state = Store.getState();
        } catch (error) {
          showToast(error.message || "알림을 읽음 처리하지 못했습니다.", "danger");
        }
      }
      setNotificationPanel(false);
      render();
      if (item.dataset.notificationInquiry) {
        selectedInquiryId = item.dataset.notificationInquiry;
        detailTab = "summary";
        render();
        document.getElementById("counselor-detail").scrollIntoView({ block: "start" });
      } else if (item.dataset.notificationSupport) {
        var supportTarget = document.getElementById("support-" + item.dataset.notificationSupport);
        if (supportTarget) supportTarget.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape" && notificationOpen) { event.preventDefault(); setNotificationPanel(false); } });
  document.addEventListener("click", function (event) {
    var panel = document.getElementById("counselor-notification-panel");
    var toggle = document.getElementById("counselor-notification-toggle");
    if (notificationOpen && panel && toggle && !panel.contains(event.target) && !toggle.contains(event.target)) setNotificationPanel(false);
  });

  document.querySelectorAll(".v6-topbar__context span").forEach(function (node) {
    if (/FIX\s*v6/i.test(node.textContent || "")) node.textContent = "화면설계 v13";
  });
  if (typeof Store.subscribe === "function") Store.subscribe(function (nextState) { state = nextState || Store.getState(); render(); });
  render();
}());
