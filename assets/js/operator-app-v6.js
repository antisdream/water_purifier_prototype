(function () {
  "use strict";

  var Store = window.WaterCareStore;
  var UI = window.WaterCareUI || {};
  var ACTOR = { role: "OPERATOR", id: "STAFF-OPER-01", name: "장민서" };
  var root = document.getElementById("operator-app");
  var filters = { period: "ALL", model: "ALL", management: "ALL", handler: "ALL", symptom: "ALL", risk: "ALL", priority: "ALL", status: "ALL", outcome: "ALL" };
  var notificationOpen = false;
  var seenNotificationIds = {};
  var state;

  if (!root) return;
  if (!Store || typeof Store.getState !== "function") {
    root.setAttribute("aria-busy", "false");
    root.innerHTML = '<div class="v6-error"><strong>공유 운영 모듈을 불러오지 못했습니다.</strong><p>fix-data.js, fix-store.js, fix-common.js의 로드 순서를 확인해 주세요.</p></div>';
    return;
  }

  state = Store.getState();

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
    return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }

  function statusLabel(code) {
    return ({
      DRAFT: "작성 중", QUESTIONNAIRE_IN_PROGRESS: "문진 진행 중", AI_GUIDANCE: "안내 확인 중", CONSULTATION_REQUIRED: "상담 대기",
      CONSULTATION_IN_PROGRESS: "상담 진행 중", VISIT_REVIEW_PENDING: "방문 검토 중", VISIT_SCHEDULING: "방문 일정 조율 중",
      VISIT_SCHEDULED: "방문 예정", COMPLETION_PENDING: "최종 완료 대기", REVISIT_REQUIRED: "추가 방문 필요", REOPENED: "문의 재개",
      RESOLVED: "처리 완료", CANCELLED: "취소됨"
    })[code] || code || "상태 미확인";
  }

  function riskLabel(code) {
    return ({ GENERAL: "일반", CAUTION: "주의", DANGER: "위험" })[code] || code || "미분류";
  }

  function chip(label, tone) { return '<span class="v6-chip v6-chip--' + escape(tone || "outline") + '">' + escape(label) + '</span>'; }
  function riskTone(code) { return code === "DANGER" ? "danger" : code === "CAUTION" ? "warning" : "success"; }
  function statusTone(code) { if (code === "RESOLVED") return "success"; if (code === "COMPLETION_PENDING" || code === "CONSULTATION_REQUIRED" || code === "REVISIT_REQUIRED") return "warning"; if (code.indexOf("VISIT_") === 0) return "purple"; return "info"; }
  function percentage(value, total) { return total ? Math.round(value / total * 100) : 0; }

  function productFor(inquiry) { return (state.products || []).find(function (item) { return item.id === inquiry.productId; }) || state.model || {}; }
  function customerFor(inquiry) { return (state.customers || []).find(function (item) { return item.id === inquiry.customerId; }) || {}; }
  function visitFor(inquiry) { return (state.visits || []).find(function (item) { return item.inquiryId === inquiry.id; }) || null; }
  function staffFor(id) { return (state.staff || []).find(function (item) { return item.id === id; }) || null; }

  function symptomLabel(inquiry) {
    if (inquiry.symptomLabel) return inquiry.symptomLabel;
    var labels = { LOW_FLOW: "출수량 저하", TASTE_ODOR: "물맛·냄새 이상", LEAK: "제품 누수", TEMPERATURE: "냉·온수 온도 이상" };
    return (inquiry.symptomCodes || []).map(function (code) { return labels[code] || code; }).join(" · ") || inquiry.topicCode || "미분류";
  }

  function outcomeCode(inquiry) {
    if (inquiry.outcome) return String(inquiry.outcome);
    if (inquiry.counselRecord && inquiry.counselRecord.outcome) return "COUNSEL_COMPLETED";
    var visit = visitFor(inquiry);
    if (visit && visit.result) return "VISIT_COMPLETED";
    if (inquiry.status === "RESOLVED") return "RESOLVED";
    return "PENDING";
  }

  function outcomeLabel(code) {
    return ({ PENDING: "처리 중", COUNSEL_COMPLETED: "상담 처리", VISIT_COMPLETED: "방문 처리", RESOLVED: "최종 완료" })[code] || code;
  }

  function referenceTime() {
    var values = (state.inquiries || []).map(function (item) { return new Date(item.updatedAt || item.createdAt || 0).getTime(); }).filter(Number.isFinite);
    return new Date(values.length ? Math.max.apply(null, values) : Date.now());
  }

  function filteredInquiries() {
    var reference = referenceTime();
    var periodDays = filters.period === "ALL" ? null : Number(filters.period);
    var cutoff = periodDays == null ? null : reference.getTime() - periodDays * 86400000;
    return (state.inquiries || []).filter(function (inquiry) {
      var product = productFor(inquiry);
      var handlers = [inquiry.assignedCounselorId, inquiry.assignedTechnicianId].filter(Boolean);
      var updated = new Date(inquiry.updatedAt || inquiry.createdAt || 0).getTime();
      if (cutoff != null && updated < cutoff) return false;
      if (filters.model !== "ALL" && product.productCode !== filters.model) return false;
      if (filters.management !== "ALL" && product.managementType !== filters.management) return false;
      if (filters.handler !== "ALL" && handlers.indexOf(filters.handler) < 0) return false;
      if (filters.symptom !== "ALL" && (inquiry.symptomCodes || []).indexOf(filters.symptom) < 0 && inquiry.topicCode !== filters.symptom) return false;
      if (filters.risk !== "ALL" && inquiry.riskLevel !== filters.risk) return false;
      if (filters.priority !== "ALL" && inquiry.priority !== filters.priority) return false;
      if (filters.status !== "ALL" && inquiry.status !== filters.status) return false;
      if (filters.outcome !== "ALL" && outcomeCode(inquiry) !== filters.outcome) return false;
      return true;
    });
  }

  function uniqueOptions(values, labeler) {
    return Array.from(new Set(values.filter(Boolean))).sort().map(function (value) {
      return '<option value="' + escape(value) + '">' + escape(labeler ? labeler(value) : value) + '</option>';
    }).join("");
  }

  function metricCard(label, value, meta, tone, icon) {
    return '<article class="v6-metric-card ' + (tone ? "is-" + tone : "") + '"><div><span>' + escape(label) + '</span><i>' + escape(icon) + '</i></div><strong>' + escape(value) + '</strong><small>' + escape(meta) + '</small></article>';
  }

  function operationalExceptions(inquiries) {
    var inquiryIds = inquiries.map(function (item) { return item.id; });
    var productIds = inquiries.map(function (item) { return item.productId; });
    var rows = [];
    var reference = referenceTime();

    (state.products || []).forEach(function (product) {
      if (productIds.indexOf(product.id) < 0) return;
      if (!product.careSchedule || product.careSchedule.status === "CHECK_REQUIRED" || product.careSchedule.status === "UNCALCULATED") {
        rows.push({ type: "CARE_DATE_UNCALCULATED", target: product.id, reason: product.careSchedule && product.careSchedule.note || "다음 케어 일정이 산정되지 않았습니다.", lastStage: "CARE_SCHEDULE", owner: "운영 담당자", changedAt: product.lastCareAt });
      }
    });

    (state.customers || []).forEach(function (customer) {
      if (productIds.indexOf(customer.productId) < 0) return;
      if (["UNANSWERED", "READY", "IN_PROGRESS"].indexOf(customer.questionnaireStatus) >= 0) {
        rows.push({ type: "QUESTIONNAIRE_UNANSWERED", target: customer.id, reason: "사전 문진이 제출되지 않았습니다.", lastStage: customer.questionnaireStatus, owner: "고객", changedAt: null });
      }
    });

    (state.questionnaires || []).forEach(function (item) {
      if (item.productId && productIds.indexOf(item.productId) < 0) return;
      if (["UNANSWERED", "READY", "IN_PROGRESS"].indexOf(item.status) >= 0) rows.push({ type: "QUESTIONNAIRE_UNANSWERED", target: item.id, reason: "사전 문진이 제출되지 않았습니다.", lastStage: item.status, owner: "고객", changedAt: item.updatedAt || item.dueAt });
    });

    inquiries.forEach(function (inquiry) {
      var ageHours = (reference.getTime() - new Date(inquiry.updatedAt || inquiry.createdAt || reference).getTime()) / 3600000;
      if (["RESOLVED", "CANCELLED"].indexOf(inquiry.status) < 0 && ageHours >= 48) rows.push({ type: "PROCESSING_DELAY", target: inquiry.id, inquiryId: inquiry.id, reason: "마지막 상태 변경 후 48시간 이상 경과했습니다.", lastStage: inquiry.status, owner: ownerLabel(inquiry), changedAt: inquiry.updatedAt });
      if (inquiry.officialSearchFailed || inquiry.evidenceStatus === "NOT_FOUND") rows.push({ type: "EVIDENCE_SEARCH_FAILED", target: inquiry.id, inquiryId: inquiry.id, reason: "공식 근거 검색 또는 출처 연결에 실패했습니다.", lastStage: inquiry.status, owner: ownerLabel(inquiry), changedAt: inquiry.updatedAt });
      if (inquiry.aiState === "FAILED" || inquiry.failedStage || Number(inquiry.aiFailureCount || 0) > 0) rows.push({ type: "AI_PROCESSING_FAILED", target: inquiry.id, inquiryId: inquiry.id, reason: (inquiry.failedStage ? inquiry.failedStage + " 단계 실패" : "AI 처리 실패 이력이 있습니다.") + (inquiry.retryCount ? " · 재시도 " + inquiry.retryCount + "회" : ""), lastStage: inquiry.aiState || inquiry.status, owner: ownerLabel(inquiry), changedAt: inquiry.updatedAt });
    });

    (state.operationalExceptions || []).forEach(function (item) {
      if (item.inquiryId && inquiryIds.indexOf(item.inquiryId) < 0) return;
      rows.push({ type: item.type, target: item.targetId || item.inquiryId, inquiryId: item.inquiryId, reason: item.reason, lastStage: item.lastStage, owner: item.ownerRole || item.owner, changedAt: item.changedAt || item.detectedAt });
    });

    var seen = {};
    return rows.filter(function (item) {
      var key = item.type + ":" + item.target;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function ownerLabel(inquiry) {
    if (inquiry.status === "CONSULTATION_REQUIRED" || inquiry.status === "CONSULTATION_IN_PROGRESS" || inquiry.status === "VISIT_REVIEW_PENDING" || inquiry.status === "VISIT_SCHEDULING") {
      var counselor = staffFor(inquiry.assignedCounselorId);
      return counselor ? "상담원 · " + counselor.name : "상담원 배정 대기";
    }
    if (inquiry.status === "VISIT_SCHEDULED" || inquiry.path === "VISIT") {
      var technician = staffFor(inquiry.assignedTechnicianId);
      return technician ? "방문기사 · " + technician.name : "방문기사 배정 대기";
    }
    if (inquiry.customerActionRequired) return "고객";
    return "시스템";
  }

  function exceptionLabel(type) {
    return ({
      CARE_DATE_UNCALCULATED: "케어 일정 미산정", QUESTIONNAIRE_UNANSWERED: "사전 문진 미응답", PROCESSING_DELAY: "처리 지연",
      EVIDENCE_SEARCH_FAILED: "공식 근거 검색 실패", AI_PROCESSING_FAILED: "AI 처리 실패"
    })[type] || type;
  }

  function exceptionTone(type) {
    return type === "EVIDENCE_SEARCH_FAILED" || type === "AI_PROCESSING_FAILED" ? "danger" : "warning";
  }

  function symptomChart(inquiries) {
    var counts = {};
    inquiries.forEach(function (item) { var label = symptomLabel(item); counts[label] = (counts[label] || 0) + 1; });
    var rows = Object.keys(counts).map(function (label) { return { label: label, count: counts[label] }; }).sort(function (a, b) { return b.count - a.count; });
    var max = Math.max.apply(null, rows.map(function (item) { return item.count; }).concat([1]));
    return rows.length ? '<div class="v6-bars">' + rows.map(function (item) { return '<div class="v6-bar"><span>' + escape(item.label) + '</span><div><i style="width:' + Math.round(item.count / max * 100) + '%"></i></div><b>' + item.count + '건</b></div>'; }).join("") + '</div>' : '<div class="v6-empty"><span>⌕</span><strong>집계할 문의가 없습니다.</strong></div>';
  }

  function statusChart(inquiries) {
    var counts = {};
    inquiries.forEach(function (item) { counts[item.status] = (counts[item.status] || 0) + 1; });
    var rows = Object.keys(counts).map(function (code) { return { code: code, count: counts[code] }; }).sort(function (a, b) { return b.count - a.count; });
    return rows.length ? '<ul class="v6-status-list">' + rows.map(function (item) { return '<li><span>' + chip(statusLabel(item.code), statusTone(item.code)) + '</span><b>' + item.count + '건</b><small>' + percentage(item.count, inquiries.length) + '%</small></li>'; }).join("") + '</ul>' : '<div class="v6-empty"><span>⌕</span><strong>집계할 상태가 없습니다.</strong></div>';
  }

  function render() {
    state = Store.getState();
    var inquiries = filteredInquiries();
    var total = inquiries.length;
    var counselCount = inquiries.filter(function (item) { return Boolean(item.assignedCounselorId || item.path === "COUNSEL" || item.status.indexOf("CONSULTATION") >= 0); }).length;
    var visitCount = inquiries.filter(function (item) { return Boolean(visitFor(item) || item.assignedTechnicianId || item.path === "VISIT" || item.status.indexOf("VISIT") >= 0); }).length;
    var completedCount = inquiries.filter(function (item) { return item.status === "RESOLVED"; }).length;
    var exceptions = operationalExceptions(inquiries);
    var symptomValues = [];
    (state.inquiries || []).forEach(function (item) { (item.symptomCodes || []).forEach(function (code) { symptomValues.push(code); }); });
    var modelValues = (state.products || []).map(function (item) { return item.productCode; });
    var managementValues = (state.products || []).map(function (item) { return item.managementType; });
    var handlerValues = (state.staff || []).filter(function (item) { return item.role === "COUNSELOR" || item.role === "TECHNICIAN"; });
    var outcomeValues = Array.from(new Set((state.inquiries || []).map(outcomeCode)));

    document.getElementById("operator-exception-count").textContent = String(exceptions.length);
    root.setAttribute("aria-busy", "false");
    root.innerHTML = '<header class="v6-page-head" id="operator-summary"><div class="v6-page-head__copy"><small>ADMIN-01 · P1 READ ONLY</small><h1>고객케어 운영 대시보드</h1><p>WPUJAC104DWH 합성 문의의 상담·방문·완료 흐름과 운영 예외를 조건별로 조회합니다. 이 화면에서는 문의 상태를 변경할 수 없습니다.</p></div><div class="v6-page-head__meta"><span>집계 기준 · ' + escape(formatDateTime(referenceTime())) + '</span><span>화면설계 FIX v6</span><span>조회자 · 장민서</span></div></header>' +
      '<div class="v6-readonly-notice"><b>조회 전용</b><span>필터와 집계는 현재 공유 상태를 읽어서 계산하며, 승인·배정·완료 등 상태 변경 작업을 제공하지 않습니다.</span></div>' +
      '<section class="v6-panel v6-operator-filters" aria-label="운영 현황 조회 필터"><label class="v6-filter">기간<select data-operator-filter="period"><option value="ALL">전체 기간</option><option value="1"' + (filters.period === "1" ? " selected" : "") + '>최근 24시간</option><option value="7"' + (filters.period === "7" ? " selected" : "") + '>최근 7일</option><option value="30"' + (filters.period === "30" ? " selected" : "") + '>최근 30일</option></select></label>' +
      '<label class="v6-filter">제품 모델<select data-operator-filter="model"><option value="ALL">전체 모델</option>' + uniqueOptions(modelValues) + '</select></label>' +
      '<label class="v6-filter">관리 유형<select data-operator-filter="management"><option value="ALL">전체 유형</option>' + uniqueOptions(managementValues, function (value) { return value === "VISIT" ? "방문관리" : value; }) + '</select></label>' +
      '<label class="v6-filter">처리 담당자<select data-operator-filter="handler"><option value="ALL">전체 담당자</option>' + handlerValues.map(function (staff) { return '<option value="' + escape(staff.id) + '"' + (filters.handler === staff.id ? " selected" : "") + '>' + escape(staff.name + " · " + (staff.role === "COUNSELOR" ? "상담원" : "방문기사")) + '</option>'; }).join("") + '</select></label>' +
      '<label class="v6-filter">증상 유형<select data-operator-filter="symptom"><option value="ALL">전체 증상</option>' + uniqueOptions(symptomValues, function (code) { return ({ LOW_FLOW: "출수량 저하", TASTE_ODOR: "물맛·냄새 이상", LEAK: "제품 누수", TEMPERATURE: "냉·온수 온도 이상" })[code] || code; }) + '</select></label>' +
      '<label class="v6-filter">위험도<select data-operator-filter="risk"><option value="ALL">전체 위험도</option><option value="DANGER"' + (filters.risk === "DANGER" ? " selected" : "") + '>위험</option><option value="CAUTION"' + (filters.risk === "CAUTION" ? " selected" : "") + '>주의</option><option value="GENERAL"' + (filters.risk === "GENERAL" ? " selected" : "") + '>일반</option></select></label>' +
      '<label class="v6-filter">우선순위<select data-operator-filter="priority"><option value="ALL">전체 우선순위</option><option value="URGENT"' + (filters.priority === "URGENT" ? " selected" : "") + '>긴급</option><option value="HIGH"' + (filters.priority === "HIGH" ? " selected" : "") + '>높음</option><option value="NORMAL"' + (filters.priority === "NORMAL" ? " selected" : "") + '>일반</option></select></label>' +
      '<label class="v6-filter">문의 상태<select data-operator-filter="status"><option value="ALL">전체 상태</option>' + uniqueOptions((state.inquiries || []).map(function (item) { return item.status; }), statusLabel) + '</select></label>' +
      '<label class="v6-filter">처리 결과<select data-operator-filter="outcome"><option value="ALL">전체 결과</option>' + uniqueOptions(outcomeValues, outcomeLabel) + '</select></label>' +
      '<div class="v6-operator-filters__summary"><span>선택 조건 결과 <b>' + total + '</b>건 · 필터 변경 즉시 다시 계산</span><button class="v6-button v6-button--secondary" type="button" data-reset-operator-filters>필터 초기화</button></div></section>' +
      '<section class="v6-metric-grid" aria-label="운영 핵심 지표">' + metricCard("조회 문의", total, "현재 필터 기준", "", "◎") + metricCard("상담 전환", counselCount, percentage(counselCount, total) + "% · 담당 상담 연결", "warning", "↗") + metricCard("방문 전환", visitCount, percentage(visitCount, total) + "% · 방문 객체 연결", "", "□") + metricCard("최종 완료", completedCount, percentage(completedCount, total) + "% · RESOLVED", "safe", "✓") + '</section>' +
      '<div class="v6-operator-grid"><section class="v6-panel"><div class="v6-panel-head"><div><h2>주요 증상 유형</h2><p>복수 증상은 각각 1건으로 집계</p></div><span>' + total + '건 기준</span></div><div class="v6-chart-body">' + symptomChart(inquiries) + '</div></section><section class="v6-panel"><div class="v6-panel-head"><div><h2>문의 처리 상태</h2><p>FIX v6 상태 코드 기준</p></div><span>' + total + '건</span></div><div class="v6-chart-body">' + statusChart(inquiries) + '</div></section></div>' +
      '<section id="operator-flow" class="v6-panel"><div class="v6-panel-head"><div><h2>상담·방문 전환 집계</h2><p>고객 입력부터 최종 완료까지의 현재 누적 건수</p></div><span>중복 경로 포함</span></div><div class="v6-flow-grid"><article class="v6-flow-card"><span>전체 문의</span><strong>' + total + '</strong><small>100%</small></article><article class="v6-flow-card"><span>상담 연결</span><strong>' + counselCount + '</strong><small>' + percentage(counselCount, total) + '%</small></article><article class="v6-flow-card"><span>방문 연결</span><strong>' + visitCount + '</strong><small>' + percentage(visitCount, total) + '%</small></article><article class="v6-flow-card"><span>최종 완료</span><strong>' + completedCount + '</strong><small>' + percentage(completedCount, total) + '%</small></article></div></section>' +
      '<section id="operator-exceptions" class="v6-panel" style="margin-top:16px"><div class="v6-panel-head"><div><h2>운영 예외</h2><p>케어 일정·문진·지연·근거검색·AI 실패를 자동 분류</p></div><div class="v6-exception-summary">' + chip(exceptions.length + "건", exceptions.length ? "warning" : "success") + chip("상태 변경 불가", "outline") + '</div></div>' + (exceptions.length ? '<div class="v6-table-wrap"><table class="v6-table v6-exception-table"><thead><tr><th>예외 유형</th><th>대상</th><th>예외 사유</th><th>마지막 단계·담당</th><th>마지막 변경</th></tr></thead><tbody>' + exceptions.map(function (item) { return '<tr><td>' + chip(exceptionLabel(item.type), exceptionTone(item.type)) + '</td><td><strong>' + escape(item.target) + '</strong>' + (item.inquiryId ? '<small>연결 문의 · ' + escape(item.inquiryId) + '</small>' : "") + '</td><td><strong>' + escape(item.reason) + '</strong></td><td><strong>' + escape(statusLabel(item.lastStage)) + '</strong><small>' + escape(item.owner || "담당 주체 확인 필요") + '</small></td><td>' + escape(formatDateTime(item.changedAt)) + '</td></tr>'; }).join("") + '</tbody></table></div>' : '<div class="v6-empty"><span>✓</span><strong>현재 조건에서 감지된 운영 예외가 없습니다.</strong><p>필터를 변경하면 해당 범위의 예외를 다시 계산합니다.</p></div>') + '</section>';
    restoreFilterSelections();
    renderNotifications();
  }

  function restoreFilterSelections() {
    document.querySelectorAll("[data-operator-filter]").forEach(function (control) { if (filters[control.dataset.operatorFilter] != null) control.value = filters[control.dataset.operatorFilter]; });
  }

  function operatorNotifications() {
    return (state.notifications || []).filter(function (item) { return item.role === ACTOR.role && (!item.recipientId || item.recipientId === ACTOR.id); }).sort(function (a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
  }

  function renderNotifications() {
    var items = operatorNotifications();
    var unread = items.filter(function (item) { return !item.read && !seenNotificationIds[item.id]; }).length;
    var badge = document.getElementById("operator-notification-count");
    var toggle = document.getElementById("operator-notification-toggle");
    if (badge) { badge.textContent = String(unread); badge.hidden = unread === 0; }
    if (toggle) toggle.setAttribute("aria-label", "운영 알림, 읽지 않은 알림 " + (unread ? unread + "개" : "없음"));
    var list = document.getElementById("operator-notification-list");
    if (!list) return;
    list.innerHTML = items.length ? items.map(function (item) { return '<button class="v6-notification-item' + (!item.read && !seenNotificationIds[item.id] ? " is-unread" : "") + '" type="button" data-operator-notification-id="' + escape(item.id || "") + '" data-operator-notification-inquiry="' + escape(item.inquiryId || "") + '"><span>!</span><div><strong>' + escape(item.title) + '</strong><p>' + escape(item.message) + '</p><small>' + escape(formatDateTime(item.createdAt)) + '</small></div></button>'; }).join("") : '<div class="v6-notification-empty">새 운영 알림이 없습니다.</div>';
  }

  function setNotificationPanel(open) {
    var panel = document.getElementById("operator-notification-panel");
    var toggle = document.getElementById("operator-notification-toggle");
    if (!panel || !toggle) return;
    notificationOpen = open;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { renderNotifications(); var close = panel.querySelector("[data-close-notifications]"); if (close) close.focus({ preventScroll: true }); }
    else toggle.focus({ preventScroll: true });
  }

  root.addEventListener("change", function (event) {
    var control = event.target.closest("[data-operator-filter]");
    if (!control) return;
    filters[control.dataset.operatorFilter] = control.value;
    render();
  });
  root.addEventListener("click", function (event) {
    if (!event.target.closest("[data-reset-operator-filters]")) return;
    filters = { period: "ALL", model: "ALL", management: "ALL", handler: "ALL", symptom: "ALL", risk: "ALL", priority: "ALL", status: "ALL", outcome: "ALL" };
    render();
  });

  document.getElementById("operator-notification-toggle").addEventListener("click", function () { setNotificationPanel(!notificationOpen); });
  document.getElementById("operator-notification-panel").addEventListener("click", function (event) {
    if (event.target.closest("[data-close-notifications]")) { setNotificationPanel(false); return; }
    var item = event.target.closest("[data-operator-notification-id]");
    if (!item) return;
    seenNotificationIds[item.dataset.operatorNotificationId] = true;
    var inquiry = (state.inquiries || []).find(function (candidate) { return candidate.id === item.dataset.operatorNotificationInquiry; });
    if (inquiry) {
      filters = { period: "ALL", model: "ALL", management: "ALL", handler: "ALL", symptom: "ALL", risk: inquiry.riskLevel || "ALL", priority: "ALL", status: inquiry.status || "ALL", outcome: "ALL" };
    }
    setNotificationPanel(false);
    render();
    window.requestAnimationFrame(function () {
      var target = document.getElementById("operator-flow");
      if (target) target.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape" && notificationOpen) { event.preventDefault(); setNotificationPanel(false); } });
  document.addEventListener("click", function (event) {
    var panel = document.getElementById("operator-notification-panel");
    var toggle = document.getElementById("operator-notification-toggle");
    if (notificationOpen && panel && toggle && !panel.contains(event.target) && !toggle.contains(event.target)) setNotificationPanel(false);
  });

  if (typeof Store.subscribe === "function") Store.subscribe(function (nextState) { state = nextState || Store.getState(); render(); });
  render();
}());
