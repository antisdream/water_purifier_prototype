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
    root.innerHTML = '<div class="v6-error"><strong>공유 업무 모듈을 불러오지 못했습니다.</strong><p>fix-data.js, fix-store.js, fix-common.js의 로드 순서를 확인해 주세요.</p></div>';
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
    var ids = inquiry.evidenceIds || [];
    return (state.evidenceRegistry || []).filter(function (item) { return ids.indexOf(item.evidenceId) >= 0; });
  }

  function getStaff(id) {
    return (state.staff || []).find(function (item) { return item.id === id; }) || null;
  }

  function inquiryTitle(inquiry) {
    return inquiry.symptomLabel || inquiry.description || inquiry.topicCode || inquiry.id;
  }

  function queueInquiries() {
    var query = filters.query.trim().toLocaleLowerCase("ko-KR");
    return (state.inquiries || []).filter(function (inquiry) {
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
      var danger = Number(b.riskLevel === "DANGER") - Number(a.riskLevel === "DANGER");
      if (danger) return danger;
      var consultation = Number(Boolean(b.requiresConsultation)) - Number(Boolean(a.requiresConsultation));
      if (consultation) return consultation;
      var finalWait = Number(Boolean(b.status === "COMPLETION_PENDING" && b.resolutionFeedback && b.resolutionFeedback.resolved)) - Number(Boolean(a.status === "COMPLETION_PENDING" && a.resolutionFeedback && a.resolutionFeedback.resolved));
      if (finalWait) return finalWait;
      var priority = priorityScore(b.priority) - priorityScore(a.priority);
      if (priority) return priority;
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
  }

  function syntheticChip(inquiry) {
    return inquiry.scenarioId ? chip("합성 시연", "info") : "";
  }

  function queueItem(inquiry) {
    var customer = getCustomer(inquiry);
    var product = getProduct(inquiry);
    return '<button class="v6-queue-item' + (selectedInquiryId === inquiry.id ? " is-selected" : "") + '" type="button" data-select-inquiry="' + escape(inquiry.id) + '" aria-pressed="' + (selectedInquiryId === inquiry.id ? "true" : "false") + '">' +
      '<span class="v6-queue-item__top"><span class="v6-chip-row">' + syntheticChip(inquiry) + chip(riskLabel(inquiry.riskLevel), riskTone(inquiry.riskLevel)) + (inquiry.requiresConsultation ? chip("상담 필수", "danger") : "") + '</span><time datetime="' + escape(inquiry.updatedAt || "") + '">' + escape(formatDateTime(inquiry.updatedAt)) + '</time></span>' +
      '<strong>' + escape(inquiryTitle(inquiry)) + '</strong>' +
      '<small>' + escape(customer.name + " · " + product.productCode) + '</small>' +
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
    return '<article class="v6-evidence-card">' +
      '<span class="v6-evidence-card__icon">공식<br>매뉴얼</span>' +
      '<div><h4>' + escape(item.documentTitle || "공식 근거") + '</h4><p>' + escape(item.evidenceSummary || "구조화 근거 요약이 없습니다.") + '</p>' +
      '<div class="v6-evidence-meta"><span>' + escape(item.evidenceId) + '</span><span>' + escape(item.chunkId) + '</span><span>' + escape(item.documentVersion || "버전 미확인") + '</span><span>' + escape((item.pageRefs || []).map(function (page) { return page + "쪽"; }).join(" · ") || "페이지 정보 없음") + '</span><span>' + escape(item.productCode || "제품 코드 미확인") + '</span><span>' + escape(item.verificationStatus || "검증 대기") + '</span></div></div>' +
      '<div class="v6-evidence-actions">' + (landing ? '<a href="' + escape(landing) + '" target="_blank" rel="noopener noreferrer">공식 출처 보기 ↗</a>' : '<span class="v6-evidence-hold">공식 검색 화면에서 문서를 확인해주세요.</span>') + (direct ? '<a href="' + escape(direct) + '" target="_blank" rel="noopener noreferrer">설명서 PDF 열기 ↗</a>' : "") + '</div>' +
    '</article>';
  }

  function evidenceSection(inquiry) {
    var items = getEvidence(inquiry);
    return '<section class="v6-section"><div class="v6-section__head"><h3>EvidenceCardDTO · 공식 근거</h3><span>' + items.length + '건</span></div>' +
      (items.length ? '<div class="v6-evidence-list">' + items.map(evidenceCard).join("") + '</div>' : '<div class="v6-evidence-hold">연결된 공식 근거가 없습니다. 임의 안내를 생성하지 말고 상담 검토를 계속하세요.</div>') + '</section>';
  }

  function usageSection(inquiry) {
    var guidance = inquiry.usageGuidance || {};
    var status = guidance.usageStatus || "PENDING_CONSULTATION";
    var isDanger = status === "TOTAL_STOP" || status === "PARTIAL_STOP";
    return '<section class="v6-section"><div class="v6-section__head"><h3>현재 사용 안내 상태</h3><span>' + escape(guidance.updatedBy || "업데이트 주체 미확인") + '</span></div>' +
      '<div class="v6-usage-card' + (isDanger ? " is-danger" : "") + '"><span>' + (isDanger ? "!" : "✓") + '</span><div><strong>' + escape(usageLabel(status)) + '</strong><p>' + escape(guidance.nextAction || "상담 결과를 확인해 주세요.") + '</p><dl><div><dt>제한 출수</dt><dd>' + escape((guidance.restrictedWaterTypes || []).join(" · ") || "없음") + '</dd></div><div><dt>제한 기능</dt><dd>' + escape((guidance.restrictedFunctions || []).join(" · ") || "없음") + '</dd></div><div><dt>판단 근거</dt><dd>' + escape(guidance.decisionBasis || "확인 필요") + '</dd></div><div><dt>갱신 시각</dt><dd>' + escape(formatDateTime(guidance.updatedAt)) + '</dd></div></dl></div></div></section>';
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
    return (inquiry.riskLevel === "DANGER" ? '<div class="v6-danger-alert"><b>!</b><div><strong>사용·음용 중지 우선 문의</strong><p>위험 신호와 안전조치 이행 여부를 먼저 확인하고, 일반 자가조치를 안내하지 마세요.</p></div></div>' : "") +
      '<section class="v6-section"><div class="v6-section__head"><h3>고객 최초 입력</h3><span>원문 보존</span></div><blockquote class="v6-original">“' + escape(inquiry.description || "입력 원문 없음") + '”</blockquote></section>' +
      '<section class="v6-section"><div class="v6-section__head"><h3>고객·제품 식별 정보</h3><span>합성 시연 데이터</span></div><dl class="v6-summary-grid"><div><dt>고객·구독</dt><dd>' + escape(customer.id + " · " + (customer.subscriptionId || product.subscriptionId || "-")) + '</dd></div><div><dt>제품·매뉴얼</dt><dd>' + escape(product.productCode + " · " + product.manualModel) + '</dd></div><div><dt>문의·시나리오</dt><dd>' + escape(inquiry.id + " · " + (inquiry.scenarioId || "-")) + '</dd></div><div><dt>담당 상담원</dt><dd>' + escape(counselor ? counselor.name : "미배정") + '</dd></div></dl></section>' +
      '<section class="v6-section"><div class="v6-section__head"><h3>구조화된 고객 답변</h3><span>반복 질문 방지</span></div>' + answerRows(inquiry) + '</section>' +
      '<section class="v6-section"><div class="v6-section__head"><h3>AI 상담 요약</h3><span>' + escape(inquiry.aiState || "IDLE") + '</span></div><div class="v6-ai-summary"><span>AI</span><div><strong>확정 진단이 아닌 상담 보조 요약</strong><p>' + escape(inquiry.aiSummary || ((inquiry.conditions || "고객 입력 조건") + "을 확인했으며 공식 근거와 안전 상태를 함께 검토해야 합니다.")) + '</p></div></div></section>' +
      usageSection(inquiry) + evidenceSection(inquiry);
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
      return head + '<div class="v6-readonly-card"><strong>상담을 시작할 수 있습니다.</strong>고객 원문, 구조화 답변, 위험 상태와 공식 근거를 먼저 확인하세요.</div><div class="v6-action-buttons"><button class="v6-button v6-button--primary v6-button--full" type="button" data-dispatch="START_CONSULTATION">상담 시작</button></div>';
    }
    if (inquiry.status === "CONSULTATION_IN_PROGRESS") {
      return head + '<form id="counsel-result-form" data-inquiry-id="' + escape(inquiry.id) + '"><label class="v6-form-field">상담 기록<textarea name="note" required placeholder="고객에게 추가로 확인한 내용과 안내를 기록하세요.">' + escape(inquiry.counselRecord && inquiry.counselRecord.note || "") + '</textarea></label><label class="v6-form-field">상담 결과<textarea name="outcome" placeholder="상담 완료 시 처리 결과를 입력하세요.">' + escape(inquiry.counselRecord && inquiry.counselRecord.outcome || "") + '</textarea></label><label class="v6-form-field">처리 후 사용 안내<select name="usageStatus" required><option value="PENDING_CONSULTATION">판단 보류·상담 필요</option><option value="NORMAL">일반 사용 가능</option><option value="PARTIAL_STOP">일부 출수·기능 사용 중지</option><option value="TOTAL_STOP"' + (inquiry.riskLevel === "DANGER" ? " selected" : "") + '>제품 전체 사용 중지</option></select></label><div class="v6-action-buttons"><button class="v6-button v6-button--secondary v6-button--full" type="submit" value="VISIT_REVIEW_REQUIRED">방문 필요 검토</button><button class="v6-button v6-button--primary v6-button--full" type="submit" value="CONSULTATION_COMPLETED">방문 불필요 · 상담 완료</button></div><p class="v6-action-note">방문 검토는 상담 기록만 필수이며, 상담 완료 시에는 상담 결과까지 저장하고 고객 해결 피드백을 기다립니다.</p></form>';
    }
    if (inquiry.status === "VISIT_REVIEW_PENDING" || inquiry.status === "VISIT_SCHEDULING" || inquiry.status === "REVISIT_REQUIRED") return head + visitTransitionForm(inquiry);
    if (inquiry.status === "COMPLETION_PENDING") {
      var feedback = inquiry.resolutionFeedback;
      var counselPath = inquiry.path === "COUNSEL";
      var assigned = inquiry.assignedCounselorId === ACTOR.id;
      var recordComplete = Boolean(inquiry.counselRecord && inquiry.counselRecord.note && inquiry.counselRecord.outcome);
      var canFinalize = Boolean(feedback && feedback.resolved && counselPath && assigned && recordComplete);
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
    return '<form id="visit-transition-form" data-inquiry-id="' + escape(inquiry.id) + '"><label class="v6-form-field">고객 희망일<input type="datetime-local" name="desiredAt" value="' + escape(localDateTime(visit && visit.desiredAt)) + '" required></label><label class="v6-form-field">방문기사<select name="technicianId" required><option value="">기사를 선택하세요</option>' + technicians.map(function (staff) { return '<option value="' + escape(staff.id) + '"' + (selectedTechnician === staff.id ? " selected" : "") + '>' + escape(staff.name + " · " + staff.team) + '</option>'; }).join("") + '</select></label><label class="v6-form-field">기사 전달사항<textarea name="notes" required placeholder="고객 답변과 점검 우선순위를 기록하세요.">' + escape(visit && visit.notes || "") + '</textarea></label><label class="v6-form-field">안전 유의사항<textarea name="safetyNotes" required placeholder="현장에서 재확인할 안전 항목을 기록하세요.">' + escape(visit && visit.safetyNotes || "") + '</textarea></label><label class="v6-form-field">가상 확정일<input type="datetime-local" name="confirmedAt" value="' + escape(localDateTime(visit && visit.confirmedAt)) + '"></label><div class="v6-action-buttons">' + (visit ? '<button class="v6-button v6-button--secondary v6-button--full" type="submit" value="UPDATE_VISIT_SCHEDULE">일정 조율 저장</button><button class="v6-button v6-button--primary v6-button--full" type="submit" value="CONFIRM_VISIT">방문 확정</button>' : '<button class="v6-button v6-button--primary v6-button--full" type="submit" value="VISIT_NEEDED">방문 필요 확정</button>') + '</div><p class="v6-action-note">방문 확정은 기사와 확정일이 모두 있을 때만 가능합니다.</p></form>';
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
    if (!selectedInquiryId || !(state.inquiries || []).some(function (item) { return item.id === selectedInquiryId; })) selectedInquiryId = inquiries[0] && inquiries[0].id || null;
    var selected = (state.inquiries || []).find(function (item) { return item.id === selectedInquiryId; }) || null;
    var consultationCount = (state.inquiries || []).filter(function (item) { return ["CONSULTATION_REQUIRED", "REOPENED"].indexOf(item.status) >= 0; }).length;
    var dangerCount = (state.inquiries || []).filter(function (item) { return item.riskLevel === "DANGER" && item.status !== "RESOLVED"; }).length;
    var finalCount = (state.inquiries || []).filter(function (item) { return item.status === "COMPLETION_PENDING" && item.resolutionFeedback && item.resolutionFeedback.resolved; }).length;
    document.getElementById("counselor-queue-count").textContent = String(consultationCount + dangerCount + finalCount);
    root.setAttribute("aria-busy", "false");
    root.innerHTML = '<header class="v6-page-head"><div class="v6-page-head__copy"><small>CONS-01 · CONS-02 · CONS-03</small><h1>상담·문의 큐</h1><p>위험·상담 필수·최종 완료 대기 순으로 확인하고, 고객 원문과 공식 근거를 보존한 채 방문기사에게 인계합니다.</p></div><div class="v6-page-head__meta"><span>고정 상담원 · 한유진</span><span>공식 모델 · WPUJAC104DWH</span><span>합성 문의 · ' + (state.inquiries || []).length + '건</span></div></header>' +
      '<section class="v6-metric-grid" aria-label="상담 업무 요약"><article class="v6-metric-card is-warning"><div><span>상담 대기</span><i>◷</i></div><strong>' + consultationCount + '</strong><small>신규·재개 상담 시작 필요</small></article><article class="v6-metric-card is-danger"><div><span>위험 문의</span><i>!</i></div><strong>' + dangerCount + '</strong><small>사용·음용 중지 우선</small></article><article class="v6-metric-card"><div><span>방문 진행</span><i>□</i></div><strong>' + (state.inquiries || []).filter(function (item) { return ["VISIT_REVIEW_PENDING", "VISIT_SCHEDULING", "VISIT_SCHEDULED", "REVISIT_REQUIRED"].indexOf(item.status) >= 0; }).length + '</strong><small>검토·조율·확정·재방문</small></article><article class="v6-metric-card is-safe"><div><span>최종 완료 가능</span><i>✓</i></div><strong>' + finalCount + '</strong><small>고객 해결 피드백 도착</small></article></section>' +
      '<section class="v6-panel v6-filter-panel" aria-label="상담 큐 검색과 필터"><label class="v6-filter">문의 검색<input id="counselor-query" type="search" value="' + escape(filters.query) + '" placeholder="문의·시나리오·고객·모델 검색"></label><label class="v6-filter">상태<select id="counselor-status"><option value="ALL">전체 상태</option>' + Array.from(new Set((state.inquiries || []).map(function (item) { return item.status; }))).map(function (code) { return '<option value="' + escape(code) + '"' + (filters.status === code ? " selected" : "") + '>' + escape(statusLabel(code)) + '</option>'; }).join("") + '</select></label><label class="v6-filter">위험도<select id="counselor-risk"><option value="ALL">전체 위험도</option><option value="DANGER"' + (filters.risk === "DANGER" ? " selected" : "") + '>위험</option><option value="CAUTION"' + (filters.risk === "CAUTION" ? " selected" : "") + '>주의</option><option value="GENERAL"' + (filters.risk === "GENERAL" ? " selected" : "") + '>일반</option></select></label><label class="v6-filter">업무 우선 조건<select id="counselor-consultation"><option value="ALL">전체</option><option value="REQUIRED"' + (filters.consultation === "REQUIRED" ? " selected" : "") + '>상담 필수</option><option value="FINAL"' + (filters.consultation === "FINAL" ? " selected" : "") + '>최종 완료 대기</option></select></label><span class="v6-filter-summary"><b>' + inquiries.length + '</b>건</span></section>' +
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

  function currentInquiry() {
    return (state.inquiries || []).find(function (item) { return item.id === selectedInquiryId; }) || null;
  }

  function submitCounselResult(form, eventName) {
    var inquiry = currentInquiry();
    if (!inquiry) return;
    var data = new FormData(form);
    var note = String(data.get("note") || "").trim();
    var outcome = String(data.get("outcome") || "").trim();
    if (!note) { showToast("상담 기록을 입력해 주세요.", "danger"); return; }
    if (eventName === "CONSULTATION_COMPLETED" && !outcome) { showToast("상담 완료 결과를 입력해 주세요.", "danger"); return; }
    if (eventName === "CONSULTATION_COMPLETED") dispatch(eventName, inquiry, { note: note, outcome: outcome, usageStatus: data.get("usageStatus") });
    else dispatch(eventName, inquiry, { note: note });
  }

  function submitVisitTransition(form, eventName) {
    var inquiry = currentInquiry();
    if (!inquiry) return;
    var visit = getVisit(inquiry);
    var data = new FormData(form);
    var desiredAt = toIso(data.get("desiredAt"));
    var confirmedAt = toIso(data.get("confirmedAt"));
    var technicianId = String(data.get("technicianId") || "");
    var notes = String(data.get("notes") || "").trim();
    var safetyNotes = String(data.get("safetyNotes") || "").trim();
    if (!desiredAt || !technicianId || !notes || !safetyNotes) { showToast("희망일, 기사, 전달사항과 안전 유의사항을 모두 입력해 주세요.", "danger"); return; }
    if (eventName === "CONFIRM_VISIT" && !confirmedAt) { showToast("방문 확정일을 입력해 주세요.", "danger"); return; }
    var payload = { technicianId: technicianId, desiredAt: desiredAt, notes: notes, safetyNotes: safetyNotes };
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
      return '<button class="v6-notification-item' + (!item.read ? " is-unread" : "") + '" type="button" data-notification-id="' + escape(item.id || "") + '" data-notification-inquiry="' + escape(item.inquiryId || "") + '"><span>i</span><div><strong>' + escape(item.title) + '</strong><p>' + escape(item.message) + '</p><small>' + escape(formatDateTime(item.createdAt)) + '</small></div></button>';
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
    var select = event.target.closest("[data-select-inquiry]");
    if (select) { selectedInquiryId = select.dataset.selectInquiry; detailTab = "summary"; render(); return; }
    var tab = event.target.closest("[data-detail-tab]");
    if (tab) { detailTab = tab.dataset.detailTab; render(); return; }
    var action = event.target.closest("[data-dispatch]");
    if (action && !action.disabled) { var inquiry = currentInquiry(); if (inquiry) dispatch(action.dataset.dispatch, inquiry); return; }
  });

  root.addEventListener("submit", function (event) {
    event.preventDefault();
    var eventName = event.submitter && event.submitter.value;
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
    var item = event.target.closest("[data-notification-inquiry]");
    if (item && item.dataset.notificationInquiry) {
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
      selectedInquiryId = item.dataset.notificationInquiry;
      detailTab = "summary";
      setNotificationPanel(false);
      render();
      document.getElementById("counselor-detail").scrollIntoView({ block: "start" });
    }
  });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape" && notificationOpen) { event.preventDefault(); setNotificationPanel(false); } });
  document.addEventListener("click", function (event) {
    var panel = document.getElementById("counselor-notification-panel");
    var toggle = document.getElementById("counselor-notification-toggle");
    if (notificationOpen && panel && toggle && !panel.contains(event.target) && !toggle.contains(event.target)) setNotificationPanel(false);
  });

  if (typeof Store.subscribe === "function") Store.subscribe(function (nextState) { state = nextState || Store.getState(); render(); });
  render();
}());
