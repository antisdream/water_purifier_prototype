(function () {
  "use strict";

  var Store = window.WaterCareStore;
  var UI = window.WaterCareUI;
  var WorkflowConfig = window.WATERCARE_WORKFLOW_CONFIG || {};
  var state = Store.getState();
  var requestedRole = UI.query("role");
  var currentRole = ["COUNSELOR", "ENGINEER", "OPERATOR"].indexOf(requestedRole) >= 0 ? requestedRole : "COUNSELOR";
  var currentView = UI.query("view") || (currentRole === "ENGINEER" ? "visits" : (currentRole === "COUNSELOR" ? "queue" : "dashboard"));
  var currentInquiryId = UI.query("inquiry") || null;
  var detailTab = "summary";
  var filters = { query: "", status: "ALL", risk: "ALL", customerType: "ALL" };
  var analyticsFilters = { period: "30", model: "ALL", management: "ALL", handler: "ALL" };
  var knowledgeFilters = { query: "", category: "ALL", model: "ALL", insightId: null };
  var knowledgeDialogReturnFocus = null;
  var signatureStrokes = [];
  var notificationController = null;
  var staffMenuController = null;

  function allowedViews() {
    return (WorkflowConfig.roleViews && WorkflowConfig.roleViews[currentRole]) || ["visits", "knowledge"];
  }

  function canView(view) { return allowedViews().indexOf(view) >= 0; }

  function canOpenInquiry(inquiry) {
    return Boolean(inquiry && Store.canAccessInquiry(inquiry.id, { role: currentRole, id: currentStaff().id }));
  }

  function currentStaff() {
    var preferred = { COUNSELOR: "STF-001", ENGINEER: "STF-002", OPERATOR: "STF-004" }[currentRole];
    return UI.getStaff(state, preferred);
  }

  function priorityValue(inquiry) {
    return (UI.priorityMap[inquiry.priority] || { order: 0 }).order * 10 + (inquiry.risk === "DANGER" ? 5 : inquiry.risk === "CAUTION" ? 2 : 0);
  }

  function visitDisplayAt(visit) {
    if (!visit) return null;
    return visit.confirmedAt || visit.customerPreferredAt || visit.scheduledAt || null;
  }

  function visitScheduleLabel(visit) {
    if (!visit) return "일정 없음";
    var status = visit.scheduleStatus || (visit.confirmedAt || visit.scheduledAt ? "CONFIRMED" : (visit.engineerId ? "COORDINATING" : "ASSIGNING"));
    return (UI.scheduleStatusMap[status] || {}).label || status;
  }

  function sortedInquiries() {
    return state.inquiries.slice().sort(function (a, b) {
      return priorityValue(b) - priorityValue(a) || new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }

  function filteredInquiries() {
    var query = filters.query.trim().toLowerCase();
    return sortedInquiries().filter(function (inquiry) {
      var context = UI.inquiryContext(state, inquiry);
      var matchesQuery = !query || [inquiry.id, inquiry.title, context.customer.name, context.product.model].join(" ").toLowerCase().indexOf(query) >= 0;
      var matchesStatus = filters.status === "ALL" || inquiry.status === filters.status;
      var matchesRisk = filters.risk === "ALL" || inquiry.risk === filters.risk;
      var matchesCustomerType = filters.customerType === "ALL" || context.customer.customerType === filters.customerType;
      if (currentRole === "ENGINEER") return matchesQuery && matchesStatus && matchesRisk && matchesCustomerType && inquiry.visit && inquiry.visit.engineerId === currentStaff().id;
      return matchesQuery && matchesStatus && matchesRisk && matchesCustomerType;
    });
  }

  function renderShellState() {
    document.getElementById("staff-role").value = currentRole;
    document.getElementById("staff-avatar").textContent = currentStaff().initials;
    document.getElementById("last-sync").textContent = "리비전 " + state.meta.revision + " · 방금 동기화";
    document.getElementById("queue-badge").textContent = state.inquiries.filter(function (item) { return item.status === "WAITING_COUNSEL"; }).length;
    document.querySelectorAll("[data-staff-view]").forEach(function (button) {
      var permitted = canView(button.dataset.staffView);
      button.hidden = !permitted;
      button.setAttribute("aria-hidden", permitted ? "false" : "true");
      button.classList.toggle("is-active", button.dataset.staffView === currentView);
      if (button.dataset.staffView === currentView) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function roleLabel() {
    return { COUNSELOR: "상담사", ENGINEER: "방문기사", OPERATOR: "운영 담당자" }[currentRole];
  }

  function pageHeader(eyebrow, title, description, action) {
    return '<header class="page-header staff-page-heading"><div><p class="eyebrow">' + UI.escapeHTML(eyebrow) + '</p><h1>' + UI.escapeHTML(title) + '</h1><p>' + UI.escapeHTML(description) + '</p></div>' + (action || "") + "</header>";
  }

  function metricCard(label, value, meta, tone, icon) {
    return '<article class="staff-metric-card"><div class="metric-card-top"><span class="metric-icon metric-icon--' + tone + '" aria-hidden="true">' + icon + '</span><small>' + UI.escapeHTML(label) + '</small></div><strong>' + value + '</strong><p>' + meta + '</p></article>';
  }

  function renderDashboard() {
    var all = sortedInquiries();
    var active = all.filter(function (item) { return item.status !== "COMPLETED"; }).length;
    var waiting = all.filter(function (item) { return item.status === "WAITING_COUNSEL"; }).length;
    var urgent = all.filter(function (item) { return item.risk === "DANGER"; }).length;
    var visits = all.filter(function (item) { return item.visit && item.visit.status === "SCHEDULED"; }).length;
    var completed = all.filter(function (item) { return item.status === "COMPLETED" || item.status === "VISIT_COMPLETE" || item.status === "RESOLUTION_PENDING"; }).length;
    var focusCases = all.filter(function (item) { return item.status !== "COMPLETED"; }).slice(0, 4);
    var roleDescription = currentRole === "COUNSELOR" ? "우선순위가 높은 문의부터 확인하고, 고객이 제공한 정보를 이어서 상담하세요." : currentRole === "ENGINEER" ? "방문 전 사전 점검 리포트와 고객의 기존 답변을 확인하세요." : "케어·상담·방문 흐름의 병목과 예외 건을 한눈에 확인하세요.";
    return pageHeader("CARE OPERATIONS", roleLabel() + " 업무 현황", roleDescription, '<div class="staff-date-card"><small>오늘</small><strong>2026. 07. 16. 목</strong></div>') +
      '<section class="staff-metric-grid">' +
        metricCard("진행 중 문의", active, '<b class="text-blue">실시간</b> 전체 케어 흐름', "blue", "◎") +
        metricCard("상담 대기", waiting, '우선 확인 필요 <b class="text-amber">' + waiting + '건</b>', "amber", "◷") +
        metricCard("위험 문의", urgent, '안전 규칙 우선 <b class="text-red">' + urgent + '건</b>', "red", "!") +
        metricCard("오늘 방문", visits, '예정 ' + visits + '건 · 완료 ' + completed + '건', "green", "□") +
      '</section>' +
      '<div class="staff-dashboard-grid"><section class="work-panel priority-panel"><div class="panel-heading"><div><p class="eyebrow">PRIORITY QUEUE</p><h2>우선 확인 문의</h2></div><button class="text-button" type="button" data-staff-view="queue">전체 큐 보기 →</button></div><div class="business-table-wrap"><table class="business-table"><thead><tr><th>우선순위</th><th>문의·고객</th><th>증상</th><th>현재 상태</th><th>최근 변경</th><th><span class="sr-only">열기</span></th></tr></thead><tbody>' + focusCases.map(queueTableRow).join("") + '</tbody></table></div></section>' +
      '<aside class="work-panel today-visits-panel"><div class="panel-heading"><div><p class="eyebrow">TODAY</p><h2>방문 일정</h2></div><span>' + visits + '건</span></div>' + visitMiniList(all.filter(function (item) { return item.visit; }).slice(0, 3)) + '<button class="button button--ghost button--full" type="button" data-staff-view="visits">전체 방문 일정</button></aside></div>' +
      '<div class="staff-dashboard-lower"><section class="work-panel flow-panel"><div class="panel-heading"><div><p class="eyebrow">SERVICE FLOW</p><h2>문의 처리 흐름</h2></div><span class="live-label"><i></i> 실시간 집계</span></div>' + flowOverview(all) + '</section>' +
      '<section class="work-panel exception-panel"><div class="panel-heading"><div><p class="eyebrow">EXCEPTIONS</p><h2>확인 필요 항목</h2></div></div><ul><li><span class="exception-icon exception-icon--amber">!</span><div><strong>방문 일정 변경 승인 대기</strong><small>고객 희망 일정과 기사 일정을 확인하세요</small></div><b>' + state.inquiries.filter(function (i) { return i.visit && i.visit.rescheduleRequest && i.visit.rescheduleRequest.status === "REQUESTED"; }).length + '</b></li><li><span class="exception-icon exception-icon--amber">!</span><div><strong>사전 문진 미응답</strong><small>케어 예정 고객의 최신 문진 상태를 확인하세요</small></div><b>' + (state.questionnaires || []).filter(function (item) { return item.status === "READY"; }).length + '</b></li><li><span class="exception-icon exception-icon--red">!</span><div><strong>위험 문의 진행 중</strong><small>누수·전원부 인접 물기</small></div><b>' + urgent + '</b></li><li><span class="exception-icon exception-icon--blue">i</span><div><strong>고객 후속 확인 대기</strong><small>상담·방문 완료 후 해결 여부 확인</small></div><b>' + state.inquiries.filter(function (i) { return i.status === "VISIT_COMPLETE" || i.status === "RESOLUTION_PENDING"; }).length + '</b></li></ul></section></div>' + prototypeFooter();
  }

  function queueTableRow(inquiry) {
    var c = UI.inquiryContext(state, inquiry);
    var priorityTone = inquiry.priority === "URGENT" ? "danger" : inquiry.priority === "HIGH" ? "warning" : "neutral";
    return '<tr data-case-row="' + UI.escapeHTML(inquiry.id) + '" tabindex="0"><td>' + UI.chip((UI.priorityMap[inquiry.priority] || {}).label || inquiry.priority, priorityTone) + '</td><td><strong>' + UI.escapeHTML(inquiry.id) + '</strong><small>' + UI.escapeHTML(c.customer.name) + ' · ' + UI.escapeHTML(c.product.model) + '</small></td><td><span>' + UI.symptomLabels(inquiry.symptomTypes).join(" · ") + '</span></td><td>' + UI.statusChip(inquiry.status, false) + '</td><td><time>' + UI.formatDateTime(inquiry.updatedAt) + '</time></td><td><button class="table-arrow" type="button" data-open-staff-case="' + UI.escapeHTML(inquiry.id) + '" aria-label="' + UI.escapeHTML(inquiry.id) + ' 상세 열기">→</button></td></tr>';
  }

  function visitMiniList(inquiries) {
    if (!inquiries.length) return '<div class="empty-state small"><span>□</span><p>등록된 방문 일정이 없습니다.</p></div>';
    return '<ol class="visit-mini-list">' + inquiries.map(function (inquiry) {
      var c = UI.inquiryContext(state, inquiry);
      var displayAt = visitDisplayAt(inquiry.visit);
      return '<li><time><strong>' + (displayAt ? UI.formatDate(displayAt, { hour: "2-digit", minute: "2-digit", hour12: false }) : "미정") + '</strong><small>' + (displayAt ? UI.formatShortDate(displayAt) : "희망일 확인") + '</small></time><span class="visit-line"></span><div><strong>' + UI.escapeHTML(c.customer.name) + ' · ' + UI.symptomLabels(inquiry.symptomTypes)[0] + '</strong><small>' + UI.escapeHTML(inquiry.visit.area) + '</small><span>' + UI.escapeHTML(visitScheduleLabel(inquiry.visit) + ' · ' + (c.engineer ? c.engineer.name + " 기사" : "기사 미지정")) + '</span></div></li>';
    }).join("") + "</ol>";
  }

  function flowOverview(inquiries) {
    var denominator = Math.max(inquiries.length, 1);
    var stages = [
      { label: "문의 접수·문진", codes: ["RECEIVED", "ADDITIONAL_QUESTIONS", "SELF_ACTION", "ACTION_RESULT"], tone: "blue" },
      { label: "상담", codes: ["WAITING_COUNSEL", "IN_COUNSEL"], tone: "amber" },
      { label: "방문 점검", codes: ["VISIT_SCHEDULED"], tone: "purple" },
      { label: "완료·후속", codes: ["VISIT_COMPLETE", "RESOLUTION_PENDING", "COMPLETION_PENDING", "COMPLETED"], tone: "green" }
    ];
    return '<div class="flow-overview">' + stages.map(function (stage, index) {
      var count = inquiries.filter(function (item) { return stage.codes.indexOf(item.status) >= 0; }).length;
      return '<div class="flow-stage"><span class="flow-stage-icon flow-stage-icon--' + stage.tone + '">' + (index + 1) + '</span><small>' + stage.label + '</small><strong>' + count + '건</strong><div class="flow-bar"><i style="width:' + (count ? Math.max(12, (count / denominator) * 100) : 0) + '%"></i></div></div>' + (index < stages.length - 1 ? '<span class="flow-arrow" aria-hidden="true">→</span>' : '');
    }).join("") + "</div>";
  }

  function renderQueue() {
    var inquiries = filteredInquiries();
    var selected = state.inquiries.find(function (item) { return item.id === currentInquiryId; });
    if (!selected || inquiries.every(function (item) { return item.id !== selected.id; })) selected = inquiries[0] || null;
    if (selected) currentInquiryId = selected.id;
    return pageHeader("INQUIRY MANAGEMENT", "상담·문의 큐", "위험도, 우선순위와 고객의 기존 답변을 기준으로 문의를 처리합니다.", '<button class="button button--secondary" type="button" data-refresh-state>데이터 새로고침</button>') +
      '<section class="queue-toolbar" aria-label="문의 필터"><label class="search-field"><span aria-hidden="true">⌕</span><input id="queue-search" type="search" value="' + UI.escapeHTML(filters.query) + '" placeholder="문의 ID, 고객·기업명, 모델 검색" aria-label="문의 검색"></label><label>고객 유형<select id="customer-type-filter"><option value="ALL">전체 고객</option><option value="INDIVIDUAL"' + (filters.customerType === "INDIVIDUAL" ? " selected" : "") + '>개인 고객</option><option value="BUSINESS"' + (filters.customerType === "BUSINESS" ? " selected" : "") + '>기업 고객</option></select></label><label>상태<select id="status-filter"><option value="ALL">전체 상태</option>' + Object.keys(UI.statusMap).map(function (code) { return '<option value="' + code + '"' + (filters.status === code ? " selected" : "") + '>' + UI.escapeHTML(UI.statusMap[code].label) + '</option>'; }).join("") + '</select></label><label>위험도<select id="risk-filter"><option value="ALL">전체 위험도</option><option value="DANGER"' + (filters.risk === "DANGER" ? " selected" : "") + '>위험</option><option value="CAUTION"' + (filters.risk === "CAUTION" ? " selected" : "") + '>주의</option><option value="GENERAL"' + (filters.risk === "GENERAL" ? " selected" : "") + '>일반</option></select></label><span class="filter-result"><b>' + inquiries.length + '</b>건</span></section>' +
      '<div class="staff-case-layout"><aside class="staff-case-list" aria-label="문의 목록">' + (inquiries.length ? inquiries.map(staffCaseListItem).join("") : '<div class="empty-state"><span>⌕</span><strong>조건에 맞는 문의가 없습니다</strong><p>검색어나 필터를 변경해 보세요.</p></div>') + '</aside><section class="staff-case-detail">' + (selected ? renderStaffDetail(selected) : '<div class="empty-detail">확인할 문의를 선택해 주세요.</div>') + '</section></div>' + prototypeFooter();
  }

  function staffCaseListItem(inquiry) {
    var c = UI.inquiryContext(state, inquiry);
    return '<button class="staff-case-item' + (inquiry.id === currentInquiryId ? " is-selected" : "") + '" type="button" data-select-staff-case="' + UI.escapeHTML(inquiry.id) + '"><span class="staff-case-item-top">' + UI.riskChip(inquiry.risk) + '<time>' + UI.formatDateTime(inquiry.updatedAt) + '</time></span><strong>' + UI.escapeHTML(inquiry.title) + '</strong><span class="staff-case-customer">' + UI.escapeHTML(c.customer.name) + ' · ' + UI.escapeHTML(c.product.model) + ' · ' + UI.escapeHTML(c.product.managementType) + '</span><span class="staff-case-item-bottom">' + UI.statusChip(inquiry.status, false) + '<b>' + UI.escapeHTML(inquiry.id) + '</b></span></button>';
  }

  function renderStaffDetail(inquiry) {
    var c = UI.inquiryContext(state, inquiry);
    var organization = c.customer.customerType === "BUSINESS" ? state.organizations.find(function (item) { return item.customerId === c.customer.id; }) : null;
    var site = organization ? state.sites.find(function (item) { return item.organizationId === organization.id; }) : null;
    var contact = organization ? state.contacts.find(function (item) { return item.organizationId === organization.id && item.isPrimary; }) : null;
    var tabs = [{ id: "summary", label: "통합 요약" }, { id: "answers", label: "고객 답변" }, { id: "evidence", label: "근거·이력" }, { id: "timeline", label: "처리 이력" }];
    return '<header class="staff-detail-header"><div><div class="chip-line">' + UI.statusChip(inquiry.status, false) + UI.riskChip(inquiry.risk) + UI.chip("우선순위 · " + (UI.priorityMap[inquiry.priority] || {}).label, inquiry.priority === "URGENT" ? "danger" : inquiry.priority === "HIGH" ? "warning" : "neutral") + '</div><h2>' + UI.escapeHTML(inquiry.title) + '</h2><p>' + UI.escapeHTML(inquiry.id) + ' · 구독 ' + UI.escapeHTML(c.product.subscriptionId) + (inquiry.counselor && inquiry.counselor.sessionId ? ' · 상담 ' + UI.escapeHTML(inquiry.counselor.sessionId) : '') + ' · 접수 ' + UI.formatDateTime(inquiry.createdAt) + '</p></div><a class="customer-context-link" href="customer.html?customer=' + encodeURIComponent(c.customer.id) + '&amp;view=inquiries&amp;inquiry=' + encodeURIComponent(inquiry.id) + '">고객 화면 확인 ↗</a></header>' +
      '<div class="customer-identity-strip' + (organization ? " is-business" : "") + '"><span class="customer-avatar">' + UI.escapeHTML(c.customer.initials) + '</span><div><strong>' + UI.escapeHTML(c.customer.name) + '</strong><small>' + UI.escapeHTML(UI.customerTypeMap[c.customer.customerType]) + ' · ' + (contact ? UI.escapeHTML(contact.name + " " + contact.role) : UI.escapeHTML(c.customer.phone)) + '</small></div><dl><div><dt>' + (organization ? "사업장·자산" : "제품") + '</dt><dd>' + (organization ? UI.escapeHTML(site.name + " · " + (c.product.assetTag || c.product.id)) : UI.escapeHTML(c.product.modelLabel)) + '</dd></div><div><dt>관리 유형</dt><dd>' + UI.escapeHTML(c.product.managementType) + '</dd></div><div><dt>' + (organization ? "방문 가능 시간" : "최근 케어") + '</dt><dd>' + (organization ? UI.escapeHTML(site.serviceWindow) : UI.formatDate(c.product.lastCareAt)) + '</dd></div></dl></div>' +
      '<nav class="detail-tabs" aria-label="문의 상세 탭">' + tabs.map(function (tab) { return '<button class="' + (detailTab === tab.id ? "is-active" : "") + '" type="button" data-detail-tab="' + tab.id + '">' + tab.label + '</button>'; }).join("") + '</nav>' +
      '<div class="staff-detail-body"><div class="staff-detail-content">' + renderDetailTab(inquiry, c) + '</div><aside class="work-action-panel">' + renderRoleAction(inquiry, c) + '</aside></div>';
  }

  function renderDetailTab(inquiry, c) {
    if (detailTab === "answers") {
      return '<section class="staff-detail-section"><div class="section-title-row"><h3>고객 최초 입력</h3><span>원문 보존</span></div><blockquote>“' + UI.escapeHTML(inquiry.description) + '”</blockquote></section><section class="staff-detail-section"><div class="section-title-row"><h3>구조화된 답변</h3><span class="verified-label">✓ 반복 질문 방지</span></div><dl class="staff-structured-grid">' + Object.keys(inquiry.structured).map(function (key) { var labels = { started: "발생 시점", targetWater: "대상 출수", condition: "발생 조건", errorCode: "오류 표시", companion: "동반 증상", recentNonUse: "장기 미사용", performedActions: "고객 기수행 조치", lastCare: "최근 관리일" }; return '<div><dt>' + UI.escapeHTML(labels[key] || key) + '</dt><dd>' + UI.escapeHTML(inquiry.structured[key]) + '<small>고객 확인</small></dd></div>'; }).join("") + '</dl>' + (inquiry.pendingQuestions && inquiry.pendingQuestions.length ? '<div class="pending-question-box"><strong>추가 확인 필요</strong><ul>' + inquiry.pendingQuestions.map(function (item) { return '<li>' + UI.escapeHTML(item) + '</li>'; }).join("") + '</ul></div>' : '') + '</section>';
    }
    if (detailTab === "evidence") {
      return '<section class="staff-detail-section"><div class="section-title-row"><h3>공식 근거 검색 결과</h3><span>' + inquiry.evidence.length + '건</span></div>' + (inquiry.evidence.length ? inquiry.evidence.map(staffEvidenceCard).join("") : '<div class="no-evidence-warning"><b>!</b><div><strong>연결된 근거가 없습니다</strong><p>공식 근거를 확인하기 전에는 자가조치를 생성하지 않고 상담으로 전환합니다.</p></div></div>') + '</section><section class="staff-detail-section"><div class="section-title-row"><h3>최근 케어 이력</h3><span>' + c.product.careHistory.length + '건</span></div><ol class="compact-history">' + c.product.careHistory.map(function (item) { return '<li><time>' + UI.formatDate(item.date) + '</time><div><strong>' + UI.escapeHTML(item.type) + '</strong><p>' + UI.escapeHTML(item.result) + '</p><small>' + UI.escapeHTML(item.performer) + '</small></div></li>'; }).join("") + '</ol></section>';
    }
    if (detailTab === "timeline") {
      return '<section class="staff-detail-section"><div class="section-title-row"><h3>상태·처리 이력</h3><span>삭제 불가</span></div>' + staffTimeline(inquiry.timeline) + '</section>';
    }
    return staffWorkflowContinuity(inquiry) + questionnaireHandoff(c.customer, c.product, inquiry) + fieldPreVisitReport(inquiry, c) + '<section class="staff-detail-section ai-briefing"><div class="section-title-row"><h3>AI 상담 브리핑</h3>' + staffVerificationLabel(inquiry) + '</div><p>' + UI.escapeHTML(inquiry.aiSummary) + '</p><div class="briefing-facts"><div><small>대표 증상</small><strong>' + UI.symptomLabels(inquiry.symptomTypes).join(" · ") + '</strong></div><div><small>발생 시점</small><strong>' + UI.escapeHTML(inquiry.structured.started) + '</strong></div><div><small>조치 결과</small><strong>' + UI.escapeHTML(UI.actionResultMap[inquiry.actionResult] || "확인 전") + '</strong></div><div><small>오류 표시</small><strong>' + UI.escapeHTML(inquiry.structured.errorCode) + '</strong></div></div></section>' +
      (inquiry.risk === "DANGER" ? '<section class="staff-safety-alert"><b>!</b><div><strong>위험 규칙이 우선 적용된 문의입니다</strong><p>자가조치 단계가 제한되었으며 제품 사용 중지와 전원부 접촉 금지 안내가 전달되었습니다.</p></div></section>' : '') +
      '<section class="staff-detail-section"><div class="section-title-row"><h3>우선 확인 항목</h3><span>확정 진단 아님</span></div><ol class="check-candidate-list">' + inquiry.candidates.map(function (item, index) { return '<li><span>' + (index + 1) + '</span><p>' + UI.escapeHTML(item) + '</p><small>확인 필요</small></li>'; }).join("") + '</ol></section>' +
      '<section class="staff-detail-section handoff-completeness"><div class="section-title-row"><h3>인계 정보 완전성</h3><span class="score-label">' + (inquiry.evidence.length ? "96%" : "72%") + '</span></div><div class="completeness-bar"><i style="width:' + (inquiry.evidence.length ? "96%" : "72%") + '"></i></div><div class="completeness-items"><span class="is-complete">✓ 제품·구독</span><span class="is-complete">✓ 증상 원문</span><span class="is-complete">✓ 추가 답변</span><span class="' + (inquiry.evidence.length ? "is-complete" : "is-missing") + '">' + (inquiry.evidence.length ? "✓" : "!") + ' 공식 근거</span><span class="' + (inquiry.actionResult ? "is-complete" : "is-missing") + '">' + (inquiry.actionResult ? "✓" : "!") + ' 조치 결과</span></div></section>';
  }

  function staffEvidenceCard(item) {
    var metadata = [item.documentId, item.sectionId, item.modelCode, item.version, item.approvalStatus].filter(Boolean).join(" · ");
    return '<article class="staff-evidence-card"><span>문서</span><div><strong>' + UI.escapeHTML(item.document) + '</strong><p>' + UI.escapeHTML(item.section) + '</p><small>' + UI.escapeHTML(item.page) + ' · 검색 일치도 ' + Math.round(item.confidence * 100) + '%</small><small class="evidence-metadata-line">' + UI.escapeHTML(metadata) + '</small><small class="evidence-metadata-line">등록 ' + UI.formatDateTime(item.registeredAt) + ' · 검색 ' + UI.formatDateTime(item.retrievedAt) + '</small></div><b>근거 연결</b></article>';
  }

  function staffVerificationLabel(inquiry) {
    var verification = inquiry.workflow && inquiry.workflow.verificationStatus;
    if (verification === "PASSED") return '<span class="verified-label">✓ 안전·근거 검증 완료</span>';
    if (verification === "BLOCKED") return '<span class="verified-label verified-label--blocked">! 자동 안내 차단</span>';
    return '<span class="verified-label verified-label--pending">… 검증 대기</span>';
  }

  function staffWorkflowContinuity(inquiry) {
    var workflow = inquiry.workflow || {};
    return '<section class="staff-detail-section workflow-continuity workflow-continuity--staff"><header><div><p class="eyebrow">LIVE HANDOFF</p><h3>연결된 업무 상태</h3></div>' + UI.statusChip(inquiry.status, false) + '</header><div class="workflow-continuity-grid"><div><small>현재 담당</small><strong>' + UI.escapeHTML(workflow.currentOwnerName || "AI 케어") + '</strong><span>' + UI.escapeHTML(workflow.currentOwnerRole || "SYSTEM") + '</span></div><div><small>다음 작업</small><strong>' + UI.escapeHTML(workflow.nextAction || "상태 확인 필요") + '</strong><span>' + UI.escapeHTML(workflow.nextActorRole || "-") + '</span></div><div><small>라우팅 근거</small><strong>' + UI.escapeHTML(workflow.routingDecision || "COLLECT_MORE") + '</strong><span>' + UI.escapeHTML(workflow.routingReason || "처리 경로 확인 중") + '</span></div><div><small>검증·근거</small><strong>' + UI.escapeHTML((workflow.verificationStatus || "PENDING") + " · " + (workflow.evidenceStatus || "PENDING")) + '</strong><span>같은 문의 ID로 원문부터 후속 결과까지 보존</span></div></div></section>';
  }

  function fieldPreVisitReport(inquiry, context) {
    if (!inquiry.visit) return "";
    var structured = inquiry.structured || {};
    var counselRecord = inquiry.counselor && inquiry.counselor.record || {};
    var confirmedFields = counselRecord.confirmedFields || [];
    var fieldLabels = { started: "발생 시점", targetWater: "대상 출수", condition: "발생 조건", errorCode: "오류 표시", companion: "동반 증상", recentNonUse: "장기 미사용", performedActions: "고객 기수행 조치", lastCare: "최근 관리일" };
    var confirmed = [];
    var rechecks = [];
    Object.keys(fieldLabels).forEach(function (key) {
      var value = String(structured[key] || "").trim();
      if (!value || value.indexOf("확인 필요") >= 0) rechecks.push({ item: fieldLabels[key], reason: "고객 답변이 없거나 불명확해 현장에서 재확인이 필요합니다." });
      else if (confirmedFields.indexOf(key) >= 0) confirmed.push({ item: fieldLabels[key], value: value });
      else rechecks.push({ item: fieldLabels[key], reason: "고객 답변은 있으나 상담사가 확인 완료로 표시하지 않아 현장 재확인이 필요합니다." });
    });
    (inquiry.candidates || []).forEach(function (candidate) {
      if (!rechecks.some(function (item) { return item.item === candidate; })) rechecks.push({ item: candidate, reason: "AI 점검 후보이며 확정 진단이 아니므로 현장 관찰과 계측으로 확인해야 합니다." });
    });
    var ids = [
      ["고객 ID", context.customer.id], ["구독 ID", context.product.subscriptionId], ["제품 ID", context.product.id],
      ["문의 ID", inquiry.id], ["상담 세션 ID", inquiry.counselor && inquiry.counselor.sessionId || "상담 세션 미생성"],
      ["방문·작업지시 ID", inquiry.visit.id + " · " + (inquiry.visit.workOrderId || "작업지시 미생성")]
    ];
    return '<section class="staff-detail-section field-previsit-report"><div class="section-title-row"><div><p class="eyebrow">FIELD HANDOFF REPORT</p><h3>방문 전 인계 리포트</h3></div>' + UI.chip(inquiry.visit.scheduleStatus === "CONFIRMED" ? "방문 확정본" : "일정 조율본", inquiry.visit.scheduleStatus === "CONFIRMED" ? "success" : "info") + '</div><dl class="previsit-id-grid">' + ids.map(function (item) { return '<div><dt>' + UI.escapeHTML(item[0]) + '</dt><dd>' + UI.escapeHTML(item[1]) + '</dd></div>'; }).join("") + '</dl><div class="previsit-counsel-result"><small>상담사 추가 확인사항</small><p>' + UI.escapeHTML(counselRecord.additionalChecks || "추가 확인사항 미기록") + '</p><small>고객 안내 내용</small><p>' + UI.escapeHTML(counselRecord.guidance || "안내 내용 미기록") + '</p><small>상담 결과·방문 필요 여부</small><strong>' + UI.escapeHTML(counselRecord.result || inquiry.counselor && inquiry.counselor.note || "상담 결과 미기록") + ' · ' + (counselRecord.visitRequired === true ? "방문 필요" : counselRecord.visitRequired === false ? "방문 불필요" : "결정 전") + '</strong></div><div class="previsit-check-columns"><section><header><strong>상담사가 이미 확인</strong><span>' + confirmed.length + '개</span></header><ul>' + confirmed.map(function (item) { return '<li><span>✓</span><div><small>' + UI.escapeHTML(item.item) + '</small><strong>' + UI.escapeHTML(item.value) + '</strong></div></li>'; }).join("") + '</ul></section><section class="needs-recheck"><header><strong>현장 재확인 필요·사유</strong><span>' + rechecks.length + '개</span></header><ul>' + rechecks.map(function (item) { return '<li><span>!</span><div><strong>' + UI.escapeHTML(item.item) + '</strong><small>' + UI.escapeHTML(item.reason) + '</small></div></li>'; }).join("") + '</ul></section></div><p class="previsit-disclaimer">이 리포트는 고객 원문·추가 답변·상담 기록·시연 근거를 묶은 인계 자료이며, 현장 확인 전 확정 진단으로 사용하지 않습니다.</p></section>';
  }

  function questionnaireHandoff(customer, product, inquiry) {
    var questionnaires = (state.questionnaires || []).filter(function (item) { return item.customerId === customer.id && item.productId === product.id && item.status !== "SUPERSEDED"; });
    var questionnaire = questionnaires.find(function (item) { return inquiry && item.inquiryId === inquiry.id; }) || questionnaires.sort(function (a, b) { return String(b.dueAt || "").localeCompare(String(a.dueAt || "")) || String(b.submittedAt || b.generatedAt || b.id || "").localeCompare(String(a.submittedAt || a.generatedAt || a.id || "")); })[0] || {};
    if (questionnaire.status !== "SUBMITTED") return '<section class="staff-detail-section questionnaire-handoff is-pending"><div class="section-title-row"><h3>방문 전 사전 문진</h3><span>미제출</span></div><p>고객 문진이 제출되면 이 문의와 배정기사 알림에 바로 반영됩니다.</p></section>';
    var answers = questionnaire.answers || {};
    var labels = { flow: { NORMAL: "출수량 정상", LOW: "출수량 저하" }, leak: { NO: "주변 물기 없음", YES: "주변 물기 있음" }, taste: { NO: "물맛·냄새 변화 없음", YES: "물맛·냄새 변화 있음" }, temperature: { NORMAL: "냉·온수 정상", COLD_ISSUE: "냉수 온도 확인 필요", HOT_ISSUE: "온수 온도 확인 필요", NOT_USED: "냉·온수 미사용" }, performedActions: { NONE: "기수행 조치 없음", VALVE_CHECK: "원수 밸브·외부 상태 확인", DISPENSE_CHECK: "충분히 출수 후 확인", OTHER_SAFE_CHECK: "안내된 외부 상태 확인" } };
    return '<section class="staff-detail-section questionnaire-handoff"><div class="section-title-row"><h3>방문 전 사전 문진</h3><span class="verified-label">✓ ' + UI.formatDateTime(questionnaire.submittedAt) + '</span></div><p>' + UI.escapeHTML(product.model + " · " + (questionnaire.inquiryId ? "문의 " + questionnaire.inquiryId + " 연결" : "제품 단위 저장")) + '</p><div class="questionnaire-answer-grid"><span>' + UI.escapeHTML((labels.flow || {})[answers.flow] || "출수량 미입력") + '</span><span class="' + (answers.leak === "YES" ? "is-danger" : "") + '">' + UI.escapeHTML((labels.leak || {})[answers.leak] || "물기 미입력") + '</span><span>' + UI.escapeHTML((labels.taste || {})[answers.taste] || "물맛 미입력") + '</span><span>' + UI.escapeHTML((labels.temperature || {})[answers.temperature] || "온도 미입력") + '</span><span>' + UI.escapeHTML((labels.performedActions || {})[answers.performedActions] || "기수행 조치 미입력") + '</span></div></section>';
  }

  function staffTimeline(items) {
    return '<ol class="staff-timeline">' + items.slice().reverse().map(function (item, index) { var transition = item.toStatus ? '<span class="timeline-transition">' + UI.escapeHTML(item.fromStatus || "최초 접수") + ' → ' + UI.escapeHTML(item.toStatus) + '</span>' : ''; return '<li class="' + (index === 0 ? "is-latest" : "") + '"><span></span><div><div><strong>' + UI.escapeHTML(item.label) + '</strong><time>' + UI.formatDateTime(item.at) + '</time></div>' + transition + '<p>' + UI.escapeHTML(item.reason || item.detail) + '</p><small>' + UI.escapeHTML(item.actor) + '</small></div></li>'; }).join("") + "</ol>";
  }

  function renderRoleAction(inquiry, c) {
    var rescheduleReview = renderRescheduleReview(inquiry);
    if (currentRole === "COUNSELOR") return rescheduleReview + renderCounselorAction(inquiry, c);
    if (currentRole === "ENGINEER") return rescheduleReview + renderEngineerAction(inquiry, c);
    return rescheduleReview + '<div class="action-panel-heading"><p class="eyebrow">OPERATIONS</p><h3>운영 검토</h3><span>' + UI.escapeHTML(inquiry.id) + '</span></div><div class="read-only-notice"><span>보기 전용</span><p>운영 담당자는 상태 흐름과 변경 이력을 검토합니다. 일정 변경 요청은 이 패널에서 승인하거나 반려할 수 있습니다.</p></div><dl class="action-summary-list"><div><dt>현재 상태</dt><dd>' + UI.statusChip(inquiry.status, false) + '</dd></div><div><dt>마지막 변경</dt><dd>' + UI.formatDateTime(inquiry.updatedAt) + '</dd></div><div><dt>근거 연결</dt><dd>' + inquiry.evidence.length + '건</dd></div><div><dt>이력 이벤트</dt><dd>' + inquiry.timeline.length + '건</dd></div></dl><button class="button button--ghost button--full" type="button" data-detail-tab="timeline">전체 변경 이력 보기</button>';
  }

  function renderRescheduleReview(inquiry) {
    if (!inquiry.visit || !inquiry.visit.rescheduleRequest) return "";
    var request = inquiry.visit.rescheduleRequest;
    if (request.status === "REQUESTED") {
      if (currentRole === "ENGINEER") {
        return '<section class="reschedule-review-card is-readonly"><div class="reschedule-review-head"><span>일정 변경 요청</span>' + UI.chip("승인 대기", "warning") + '</div><dl><div><dt>현재 일정</dt><dd>' + UI.formatDateTime(inquiry.visit.scheduledAt) + '</dd></div><div><dt>고객 희망</dt><dd>' + UI.formatDateTime(request.desiredAt) + '</dd></div><div><dt>변경 사유</dt><dd>' + UI.escapeHTML(request.reason) + '</dd></div></dl><p>상담사 또는 운영 담당자의 확정 전까지 기존 일정이 유지됩니다.</p></section>';
      }
      return '<section class="reschedule-review-card"><div class="reschedule-review-head"><span>일정 변경 요청</span>' + UI.chip("처리 필요", "warning") + '</div><dl><div><dt>현재 일정</dt><dd>' + UI.formatDateTime(inquiry.visit.scheduledAt) + '</dd></div><div><dt>고객 희망</dt><dd>' + UI.formatDateTime(request.desiredAt) + '</dd></div><div><dt>변경 사유</dt><dd>' + UI.escapeHTML(request.reason) + '</dd></div></dl><form id="reschedule-review-form" data-inquiry-id="' + UI.escapeHTML(inquiry.id) + '"><label>처리 메모<textarea name="resolutionNote" rows="2" placeholder="승인 또는 반려 사유를 기록하세요."></textarea></label><div class="reschedule-review-actions"><button class="button button--secondary" type="submit" name="decision" value="REJECT">기존 일정 유지</button><button class="button button--primary" type="submit" name="decision" value="APPROVE">희망 일정 승인</button></div></form></section>';
    }
    return '<section class="reschedule-review-card is-complete"><div class="reschedule-review-head"><span>일정 변경 처리</span>' + UI.chip(request.status === "APPROVED" ? "변경 확정" : "요청 반려", request.status === "APPROVED" ? "success" : "neutral") + '</div><p>' + UI.escapeHTML(request.resolutionNote || "처리 완료") + ' · ' + UI.formatDateTime(request.resolvedAt) + '</p></section>';
  }

  function renderCounselorAction(inquiry, c) {
    var head = '<div class="action-panel-heading"><p class="eyebrow">COUNSEL DESK</p><h3>상담 처리</h3><span>담당 · ' + UI.escapeHTML(currentStaff().name) + '</span></div>';
    if (inquiry.status === "WAITING_COUNSEL") {
      return head + '<div class="ready-action-card"><span>01</span><div><strong>상담을 시작할 준비가 됐어요</strong><p>고객 답변, 조치 결과와 공식 근거를 확인했습니다.</p></div></div><button class="button button--primary button--full" type="button" data-start-counsel="' + UI.escapeHTML(inquiry.id) + '">상담 시작</button><p class="action-help">시작 시 담당 상담사와 시간이 변경 이력에 기록됩니다.</p>';
    }
    if (inquiry.status === "IN_COUNSEL") {
      return head + renderCounselForm(inquiry);
    }
    if (inquiry.status === "VISIT_SCHEDULED" && inquiry.visit && inquiry.visit.scheduleStatus !== "CONFIRMED") {
      return head + '<div class="ready-action-card"><span>02</span><div><strong>' + UI.escapeHTML((UI.scheduleStatusMap[inquiry.visit.scheduleStatus] || {}).label || inquiry.visit.scheduleStatus) + '</strong><p>고객 희망 ' + UI.formatDateTime(inquiry.visit.customerPreferredAt) + '</p></div></div><form id="visit-schedule-update-form" data-inquiry-id="' + UI.escapeHTML(inquiry.id) + '"><label>일정 상태<select name="scheduleStatus" required><option value="COORDINATING"' + (inquiry.visit.scheduleStatus === "COORDINATING" ? " selected" : "") + '>일정 조율 중</option><option value="CONFIRMED">방문 확정</option></select></label><label>가상 방문기사<select name="engineerId" required><option value="">기사를 선택하세요</option>' + state.staff.filter(function (item) { return item.role === "ENGINEER"; }).map(function (item) { return '<option value="' + item.id + '"' + (item.id === inquiry.visit.engineerId ? " selected" : "") + '>' + UI.escapeHTML(item.name + " · " + item.team) + '</option>'; }).join("") + '</select></label><label>가상 확정 방문일<input type="datetime-local" name="confirmedAt" value="2026-07-22T10:00"></label><button class="button button--primary button--full" type="submit">일정 상태 저장</button></form>';
    }
    if (inquiry.status === "COMPLETION_PENDING") {
      var canFinalize = !inquiry.counselor || !inquiry.counselor.id || inquiry.counselor.id === currentStaff().id;
      return head + '<div class="ready-action-card"><span>✓</span><div><strong>고객이 해결을 확인했습니다</strong><p>처리 기록을 검토한 뒤 최종 완료로 전환하세요.</p></div></div>' + (canFinalize ? '<button class="button button--primary button--full" type="button" data-complete-inquiry="' + UI.escapeHTML(inquiry.id) + '">처리 최종 완료</button>' : '<div class="read-only-notice"><span>담당자 확인 중</span><p>담당 상담사 또는 배정 기사만 최종 완료할 수 있습니다.</p></div>');
    }
    return head + '<div class="read-only-notice"><span>처리 단계 이동</span><p>현재 문의는 ' + UI.escapeHTML((UI.statusMap[inquiry.status] || {}).label) + ' 단계입니다. 담당 기사 또는 고객의 다음 처리를 기다리고 있습니다.</p></div>' + (inquiry.counselor.note ? '<div class="saved-note"><small>저장된 상담 기록</small><p>' + UI.escapeHTML(inquiry.counselor.note) + '</p></div>' : '');
  }

  function renderCounselForm(inquiry) {
    var record = inquiry.counselor && inquiry.counselor.record || {};
    var confirmed = record.confirmedFields || [];
    var confirmationLabels = { started: "발생 시점", targetWater: "대상 출수", condition: "발생 조건", errorCode: "오류 표시", companion: "동반 증상", recentNonUse: "장기 미사용", performedActions: "기수행 조치", lastCare: "최근 관리일" };
    var confirmationFields = Object.keys(confirmationLabels).map(function (key) { return '<label><input type="checkbox" name="confirmedFields" value="' + key + '"' + (confirmed.indexOf(key) >= 0 ? " checked" : "") + '> ' + UI.escapeHTML(confirmationLabels[key]) + '</label>'; }).join("");
    var engineers = state.staff.filter(function (item) { return item.role === "ENGINEER"; }).map(function (item) { return '<option value="' + item.id + '">' + UI.escapeHTML(item.name + " · " + item.team) + '</option>'; }).join("");
    return '<form id="counsel-action-form" data-inquiry-id="' + UI.escapeHTML(inquiry.id) + '"><label>추가 확인사항<textarea name="additionalChecks" rows="3" placeholder="상담 중 새로 확인한 사실을 기록하세요." required>' + UI.escapeHTML(record.additionalChecks || "") + '</textarea></label><label>고객 안내 내용<textarea name="guidance" rows="3" placeholder="고객에게 안내한 사용 범위와 다음 행동을 기록하세요." required>' + UI.escapeHTML(record.guidance || "") + '</textarea></label><label>상담 결과<textarea name="result" rows="3" placeholder="확정 진단이 아닌 상담 처리 결과를 기록하세요." required>' + UI.escapeHTML(record.result || "") + '</textarea></label><fieldset class="counsel-confirmation-fields"><legend>상담사가 실제 확인한 항목 <small>기사에게 그대로 전달</small></legend>' + confirmationFields + '</fieldset><label>방문점검 필요 여부<select name="visitRequired" required><option value="UNKNOWN">결정 전</option><option value="NO"' + (record.visitRequired === false ? " selected" : "") + '>방문 불필요</option><option value="YES"' + (record.visitRequired === true ? " selected" : "") + '>방문 필요</option></select></label><button class="button button--secondary button--full" type="submit" name="action" value="save-note">구조화 상담 기록 저장</button><button class="button button--primary button--full" type="submit" name="action" value="resolve">방문 불필요 · 고객 확인 요청</button><div class="action-divider"><span>방문점검이 필요한 경우</span></div><label>작업 유형<select name="serviceType" required><option value="AS">A/S 점검</option><option value="INSTALL">신규 설치</option><option value="REPAIR">수리</option><option value="REGULAR_CARE">정기 케어</option></select></label><label>고객 희망 방문일<input type="datetime-local" name="customerPreferredAt" value="2026-07-22T10:00" required></label><label>일정 상태<select name="scheduleStatus" required><option value="ASSIGNING" selected>기사 배정 중</option><option value="COORDINATING">일정 조율 중</option><option value="CONFIRMED">방문 확정</option></select></label><label>가상 방문기사<select name="engineerId"><option value="">기사 배정 전</option>' + engineers + '</select></label><label>가상 확정 방문일<input type="datetime-local" name="confirmedAt"></label><label>방문 권역<select name="area"><option>서울 서부권 (가상)</option><option>서울 동부권 (가상)</option><option>경기 북부권 (가상)</option></select></label><button class="button button--primary button--full" type="submit" name="action" value="schedule">방문 필요 · 일정 등록</button><p class="action-help">추가 확인·안내·상담 결과·방문 필요 여부와 확인 항목이 상담 세션 ID에 저장됩니다.</p></form>';
  }

  function renderEngineerAction(inquiry, c) {
    var head = '<div class="action-panel-heading"><p class="eyebrow">FIELD CARE</p><h3>방문 결과</h3><span>담당 · ' + UI.escapeHTML(currentStaff().name) + '</span></div>';
    if (inquiry.status === "VISIT_SCHEDULED" && inquiry.visit) {
      if (inquiry.visit.engineerId !== currentStaff().id) return head + '<div class="read-only-notice"><span>다른 기사 배정 건</span><p>배정된 방문기사만 작업 결과와 고객 서명을 등록할 수 있습니다.</p></div>';
      if (inquiry.visit.scheduleStatus !== "CONFIRMED") return head + '<div class="read-only-notice"><span>' + UI.escapeHTML((UI.scheduleStatusMap[inquiry.visit.scheduleStatus] || {}).label || "일정 조율 중") + '</span><p>상담사가 가상 확정일을 등록한 뒤 현장 작업 결과를 입력할 수 있습니다.</p></div>';
      if (inquiry.visit.rescheduleRequest && inquiry.visit.rescheduleRequest.status === "REQUESTED") return head + '<div class="read-only-notice"><span>일정 변경 승인 대기</span><p>상담사 또는 운영 담당자가 고객 희망 일정을 확정한 후 작업 완료를 등록할 수 있습니다.</p></div>';
      var isBusiness = c.customer.customerType === "BUSINESS";
      var defaultSigner = isBusiness ? c.customer.contactName : c.customer.name;
      return head + '<div class="visit-appointment-card"><span>' + UI.escapeHTML(UI.serviceTypeMap[inquiry.visit.serviceType] || "A/S 점검") + ' · ' + UI.escapeHTML(visitScheduleLabel(inquiry.visit)) + '</span><strong>' + UI.formatDateTime(inquiry.visit.confirmedAt || inquiry.visit.scheduledAt) + '</strong><small>' + UI.escapeHTML(inquiry.visit.area) + ' · ' + UI.escapeHTML(inquiry.visit.workOrderId || inquiry.visit.id) + '</small></div><form id="visit-result-form" data-inquiry-id="' + UI.escapeHTML(inquiry.id) + '"><label>작업 유형<select name="serviceType" required><option value="AS"' + (inquiry.visit.serviceType === "AS" ? " selected" : "") + '>A/S 점검</option><option value="INSTALL"' + (inquiry.visit.serviceType === "INSTALL" ? " selected" : "") + '>신규 설치</option><option value="REPAIR"' + (inquiry.visit.serviceType === "REPAIR" ? " selected" : "") + '>수리</option><option value="REGULAR_CARE"' + (inquiry.visit.serviceType === "REGULAR_CARE" ? " selected" : "") + '>정기 케어</option></select></label><label>점검 결과<select name="result" required><option value="">선택하세요</option><option value="RESOLVED">현장 조치 후 정상 확인</option><option value="MONITOR">조치 후 경과 관찰</option><option value="FOLLOWUP">추가 방문 검토</option></select></label><label>확인된 원인 또는 확인 불가 사유<textarea name="cause" rows="3" placeholder="확정 표현을 피하고 현장에서 확인한 사실을 기록하세요." required></textarea></label><fieldset><legend>수행 조치 <small>1개 이상</small></legend><label><input type="checkbox" name="actions" value="연결부 상태 점검"> 연결부 상태 점검</label><label><input type="checkbox" name="actions" value="출수·온도 성능 확인"> 출수·온도 성능 확인</label><label><input type="checkbox" name="actions" value="필터·카트리지 교체"> 필터·카트리지 교체</label><label><input type="checkbox" name="actions" value="살균·세척 케어"> 살균·세척 케어</label><label><input type="checkbox" name="actions" value="신규 설치·시운전"> 신규 설치·시운전</label></fieldset><label>교체·설치 항목<select name="replacement"><option>교체 없음</option><option>복합 필터</option><option>카트리지 세트</option><option>정수기 본체 설치</option><option>기타 · 시연 부품</option></select></label><section class="signature-confirmation"><div class="signature-confirmation-head"><span>고객 작업내용 확인 및 서명</span>' + UI.chip(isBusiness ? "기업 담당자" : "개인 고객", "info") + '</div><p>위 작업 유형, 점검 결과, 수행 조치와 교체 항목을 확인한 후 서명합니다. 서명 후 내용이 변경되면 재확인이 필요합니다.</p><label>서명자 이름<input name="signerName" value="' + UI.escapeHTML(defaultSigner) + '" required></label><label>서명자 관계<select name="signerRelationship" required>' + (isBusiness ? '<option value="BUSINESS_REP">기업·사업장 담당자</option>' : '<option value="SELF">본인</option><option value="FAMILY">가족</option><option value="OTHER">기타 대리인</option>') + '</select></label>' + (isBusiness ? '<label>부서·직책<input name="signerPosition" value="' + UI.escapeHTML(c.customer.organization.contactRole) + '" required></label>' : '<input name="signerPosition" type="hidden" value="본인">') + '<div class="signature-pad-wrap"><canvas id="signature-pad" class="signature-pad" width="520" height="170" tabindex="0" aria-label="고객 전자 서명 입력 영역"></canvas><div><small id="signature-state">서명란에 손가락, 펜 또는 마우스로 서명해 주세요.</small><button id="clear-signature" type="button">다시 쓰기</button></div></div><label class="signature-consent"><input type="checkbox" name="signatureConsent" required> <span>작업 완료 확인 및 서명정보 수집 안내(VISIT_COMPLETION_V1)를 확인했습니다.</span></label></section><button class="button button--primary button--full" type="submit">고객 서명과 함께 작업 완료</button><p class="action-help">완료 시 작업 확인서, 서명 시각, 케어 이력과 다음 일정이 함께 저장됩니다.</p></form>';
    }
    if (inquiry.visit && inquiry.visit.status === "COMPLETED") {
      var signature = inquiry.visit.signature;
      return head + '<div class="completed-visit-card"><span>✓</span><div><strong>' + UI.escapeHTML(UI.serviceTypeMap[inquiry.visit.serviceType] || "방문 작업") + ' 등록 완료</strong><p>' + UI.escapeHTML(inquiry.visit.cause) + '</p><small>' + UI.formatDateTime(inquiry.visit.completedAt) + '</small></div></div><dl class="action-summary-list"><div><dt>작업지시</dt><dd>' + UI.escapeHTML(inquiry.visit.workOrderId || inquiry.visit.id) + '</dd></div><div><dt>수행 조치</dt><dd>' + UI.escapeHTML(inquiry.visit.actions.join(" · ")) + '</dd></div><div><dt>교체·설치 항목</dt><dd>' + UI.escapeHTML(inquiry.visit.replacement || "교체 없음") + '</dd></div><div><dt>고객 확인</dt><dd>' + (signature ? UI.escapeHTML(signature.signedBy) + ' · 서명 완료' : "기존 기록 · 서명 정보 없음") + '</dd></div><div><dt>다음 케어</dt><dd>' + UI.formatDate(c.product.nextCareAt) + '</dd></div></dl>' + (signature && signature.signatureData ? '<div class="signature-preview-wrap"><small>고객 서명 · ' + UI.formatDateTime(signature.signedAt) + '</small><canvas class="signature-preview" data-signature-inquiry="' + UI.escapeHTML(inquiry.id) + '" width="420" height="120" aria-label="저장된 고객 서명"></canvas><span>' + UI.escapeHTML(signature.integrityId) + '</span></div>' : '') + (inquiry.status === "COMPLETION_PENDING" ? '<button class="button button--primary button--full" type="button" data-complete-inquiry="' + UI.escapeHTML(inquiry.id) + '">고객 해결 확인 · 최종 완료</button>' : '<p class="action-help">고객의 해결 여부 확인을 기다리고 있습니다.</p>');
    }
    return head + '<div class="read-only-notice"><span>배정 전</span><p>방문 예정 상태의 문의에서만 결과를 등록할 수 있습니다. 상담사의 방문 전환과 기사 배정을 확인해 주세요.</p></div>';
  }

  function renderVisits() {
    var visits = sortedInquiries().filter(function (item) {
      if (!item.visit) return false;
      return currentRole !== "ENGINEER" || item.visit.engineerId === currentStaff().id;
    });
    var pendingChanges = visits.filter(function (item) { return item.visit.rescheduleRequest && item.visit.rescheduleRequest.status === "REQUESTED"; }).length;
    var selected = visits.find(function (item) { return item.id === currentInquiryId; }) || visits[0] || null;
    if (selected) currentInquiryId = selected.id;
    return pageHeader("FIELD SCHEDULE", "방문 일정", currentRole === "ENGINEER" ? "내게 배정된 방문 건만 표시됩니다. 고객 답변과 작업지시를 확인하고 현장 결과를 등록하세요." : "고객 일정 변경 요청과 기사 배정 현황을 함께 관리합니다.", '<div class="staff-date-card"><small>배정 기준</small><strong>' + UI.escapeHTML(currentStaff().name) + ' · ' + UI.escapeHTML(roleLabel()) + '</strong></div>') +
      '<section class="visit-summary-grid visit-summary-grid--four"><div><span>기사 배정 중</span><strong>' + visits.filter(function (item) { return item.visit.status === "SCHEDULED" && item.visit.scheduleStatus === "ASSIGNING"; }).length + '</strong><small>건</small></div><div><span>일정 조율 중</span><strong>' + visits.filter(function (item) { return item.visit.status === "SCHEDULED" && item.visit.scheduleStatus === "COORDINATING"; }).length + '</strong><small>건 · 변경요청 ' + pendingChanges + '</small></div><div><span>방문 확정</span><strong>' + visits.filter(function (item) { return item.visit.status === "SCHEDULED" && item.visit.scheduleStatus === "CONFIRMED"; }).length + '</strong><small>건</small></div><div><span>작업 등록 완료</span><strong>' + visits.filter(function (item) { return item.visit.status === "COMPLETED"; }).length + '</strong><small>건</small></div></section>' +
      '<div class="visit-work-layout"><aside class="visit-schedule-list"><div class="list-head"><strong>' + (currentRole === "ENGINEER" ? "내 배정 방문" : "전체 방문") + '</strong><span>' + visits.length + '건</span></div>' + (visits.length ? visits.map(function (inquiry) { var c = UI.inquiryContext(state, inquiry); var displayAt = visitDisplayAt(inquiry.visit); var changeChip = inquiry.visit.rescheduleRequest && inquiry.visit.rescheduleRequest.status === "REQUESTED" ? UI.chip("변경 요청", "warning") : ""; return '<button class="visit-schedule-item' + (selected && selected.id === inquiry.id ? " is-selected" : "") + '" type="button" data-select-visit="' + UI.escapeHTML(inquiry.id) + '"><time><strong>' + (displayAt ? UI.formatDate(displayAt, { hour: "2-digit", minute: "2-digit", hour12: false }) : "미정") + '</strong><small>' + (displayAt ? UI.formatShortDate(displayAt) : "희망일 확인") + '</small></time><div><span class="chip-line">' + UI.riskChip(inquiry.risk) + UI.chip(visitScheduleLabel(inquiry.visit), inquiry.visit.scheduleStatus === "CONFIRMED" ? "success" : "info") + changeChip + '</span><strong>' + UI.escapeHTML(c.customer.name) + ' · ' + UI.escapeHTML(UI.serviceTypeMap[inquiry.visit.serviceType] || "A/S 점검") + '</strong><small>' + UI.escapeHTML(inquiry.visit.area) + ' · ' + UI.escapeHTML(c.product.model) + '</small></div></button>'; }).join("") : '<div class="empty-state small"><span>□</span><p>현재 배정된 방문 일정이 없습니다.</p></div>') + '</aside><section class="staff-case-detail visit-detail">' + (selected ? renderStaffDetail(selected) : '<div class="empty-detail">등록된 방문 일정이 없습니다.</div>') + '</section></div>' + prototypeFooter();
  }

  function renderCustomers() {
    var customers = state.customers;
    var organizations = state.organizations || [];
    var sites = state.sites || [];
    var contacts = state.contacts || [];
    var businessCustomers = customers.filter(function (item) { return item.customerType === "BUSINESS"; });
    var dueProducts = state.products.filter(function (item) { return item.careState === "DUE_SOON"; }).length;
    return pageHeader("ACCOUNT & SITE MANAGEMENT", "고객·사업장 관리", "개인과 기업 계정, 사업장 담당자, 설치 자산과 서비스 이력을 하나의 계정 기준으로 확인합니다.", '<a class="button button--secondary" href="customer.html?customer=CUS-002">기업 고객 화면 확인 ↗</a>') +
      '<section class="customer-account-kpis">' +
        metricCard("전체 고객 계정", customers.length, '<b class="text-blue">개인 ' + (customers.length - businessCustomers.length) + '</b> · 기업 ' + businessCustomers.length, "blue", "◎") +
        metricCard("기업 계약", businessCustomers.length, '<b class="text-green">운영 중</b> 합성 계약', "green", "▣") +
        metricCard("관리 사업장", sites.length, '현장 담당자 <b class="text-blue">' + contacts.length + '명</b>', "blue", "□") +
        metricCard("설치 제품", state.products.length, '케어 임박 <b class="text-amber">' + dueProducts + '대</b>', "amber", "◷") +
      '</section>' +
      '<section class="work-panel account-directory"><div class="panel-heading"><div><p class="eyebrow">ACCOUNT DIRECTORY</p><h2>전체 고객 계정</h2></div><span>합성 데이터 ' + customers.length + '건</span></div><div class="business-table-wrap"><table class="business-table"><thead><tr><th>고객·계정</th><th>유형</th><th>대표 담당자</th><th>사업장</th><th>설치 제품</th><th>서비스 상태</th><th>고객 화면</th></tr></thead><tbody>' + customers.map(function (customer) {
        var organization = organizations.find(function (item) { return item.customerId === customer.id; });
        var relatedSites = organization ? sites.filter(function (item) { return item.organizationId === organization.id; }) : [];
        var contact = organization ? contacts.find(function (item) { return item.organizationId === organization.id && item.isPrimary; }) : null;
        var products = state.products.filter(function (item) { return item.customerId === customer.id; });
        var due = products.some(function (item) { return item.careState === "DUE_SOON"; });
        return '<tr><td><strong>' + UI.escapeHTML(organization ? organization.name : customer.name) + '</strong><small>' + UI.escapeHTML(customer.id) + ' · ' + UI.escapeHTML(customer.segment) + '</small></td><td>' + UI.chip(UI.customerTypeMap[customer.customerType], customer.customerType === "BUSINESS" ? "info" : "neutral") + '</td><td><strong>' + UI.escapeHTML(contact ? contact.name : customer.name) + '</strong><small>' + UI.escapeHTML(contact ? contact.role : customer.phone) + '</small></td><td>' + (relatedSites.length ? UI.escapeHTML(relatedSites.map(function (item) { return item.name; }).join(" · ")) : "개인 설치처") + '</td><td><strong>' + products.length + '대</strong><small>' + UI.escapeHTML(products.map(function (item) { return item.assetTag || item.model; }).join(" · ")) + '</small></td><td>' + UI.chip(due ? "케어 임박" : "정상 관리", due ? "warning" : "success") + '</td><td><a class="table-arrow" href="customer.html?customer=' + encodeURIComponent(customer.id) + '" aria-label="' + UI.escapeHTML(customer.name) + ' 고객 화면 열기">→</a></td></tr>';
      }).join("") + '</tbody></table></div></section>' +
      '<section class="enterprise-account-section"><div class="panel-heading"><div><p class="eyebrow">BUSINESS ACCOUNTS</p><h2>기업 계약·현장 자산</h2></div><span>기업 ' + businessCustomers.length + '곳</span></div><div class="enterprise-account-grid">' + businessCustomers.map(function (customer) {
        var organization = organizations.find(function (item) { return item.customerId === customer.id; });
        var relatedSites = sites.filter(function (item) { return organization && item.organizationId === organization.id; });
        var relatedContacts = contacts.filter(function (item) { return organization && item.organizationId === organization.id; });
        var products = state.products.filter(function (item) { return item.customerId === customer.id; });
        var nextVisit = state.inquiries.filter(function (item) { return item.customerId === customer.id && item.visit && item.visit.status === "SCHEDULED"; }).sort(function (a, b) { return new Date(a.visit.scheduledAt) - new Date(b.visit.scheduledAt); })[0];
        return '<article class="enterprise-account-card"><header><div><span class="enterprise-mark">B2B</span><div><small>' + UI.escapeHTML(customer.id) + '</small><h3>' + UI.escapeHTML(organization.name) + '</h3></div></div>' + UI.chip(organization.contractTier, "info") + '</header><dl class="enterprise-account-facts"><div><dt>사업자번호</dt><dd>' + UI.escapeHTML(organization.businessNumber) + '</dd></div><div><dt>계약 상태</dt><dd>이용 중</dd></div><div><dt>다음 방문</dt><dd>' + (nextVisit ? UI.formatDateTime(nextVisit.visit.scheduledAt) : "등록 일정 없음") + '</dd></div></dl><div class="enterprise-site-list">' + relatedSites.map(function (site) { var siteContact = relatedContacts.find(function (item) { return item.siteId === site.id; }); var siteProducts = products.filter(function (item) { return item.siteId === site.id; }); return '<section><div><strong>' + UI.escapeHTML(site.name) + '</strong><small>' + UI.escapeHTML(site.siteType + ' · ' + site.area) + '</small></div><dl><div><dt>방문 가능</dt><dd>' + UI.escapeHTML(site.serviceWindow) + '</dd></div><div><dt>현장 담당</dt><dd>' + UI.escapeHTML(siteContact ? siteContact.name + ' · ' + siteContact.role : '미지정') + '</dd></div><div><dt>출입 안내</dt><dd>' + UI.escapeHTML(site.accessNote) + '</dd></div></dl><ul>' + siteProducts.map(function (product) { return '<li><span>' + UI.escapeHTML(product.assetTag || product.id) + '</span><strong>' + UI.escapeHTML(product.model) + '</strong><small>' + UI.escapeHTML(product.installedArea) + '</small></li>'; }).join("") + '</ul></section>'; }).join("") + '</div><footer><span>서명 권한 담당자 ' + relatedContacts.filter(function (item) { return item.signatureAuthority; }).length + '명</span><a class="button button--ghost" href="customer.html?customer=' + encodeURIComponent(customer.id) + '">고객 계정 보기</a></footer></article>';
      }).join("") + '</div></section>' + prototypeFooter();
  }

  function analyticsReferenceTime() {
    var timestamps = state.inquiries.map(function (item) { return new Date(item.updatedAt).getTime(); }).filter(function (value) { return Number.isFinite(value); });
    return new Date(timestamps.length ? Math.max.apply(null, timestamps) : Date.now());
  }

  function percentage(part, total) {
    return total ? Math.round((part / total) * 100) : 0;
  }

  function inquiryHandlerIds(inquiry) {
    return [inquiry.counselor && inquiry.counselor.id, inquiry.visit && inquiry.visit.engineerId].filter(Boolean);
  }

  function analyticsInquiries() {
    var reference = analyticsReferenceTime();
    var cutoff = analyticsFilters.period === "ALL" ? null : new Date(reference.getTime() - Number(analyticsFilters.period) * 86400000);
    return state.inquiries.filter(function (inquiry) {
      var product = UI.getProduct(state, inquiry.productId);
      if (cutoff && new Date(inquiry.createdAt).getTime() < cutoff.getTime()) return false;
      if (analyticsFilters.model !== "ALL" && product.modelId !== analyticsFilters.model) return false;
      if (analyticsFilters.management !== "ALL" && product.managementType !== analyticsFilters.management) return false;
      if (analyticsFilters.handler !== "ALL" && inquiryHandlerIds(inquiry).indexOf(analyticsFilters.handler) < 0) return false;
      return true;
    });
  }

  function handoffScore(inquiry) {
    var structured = inquiry.structured || {};
    var required = (WorkflowConfig.structuredInquirySchema && WorkflowConfig.structuredInquirySchema.requiredFields) || ["started", "targetWater", "condition", "errorCode", "companion", "recentNonUse", "lastCare"];
    var structuredComplete = required.every(function (field) { return typeof structured[field] === "string" && structured[field].trim(); });
    var checks = [
      structuredComplete,
      Boolean(inquiry.risk && inquiry.priority),
      Boolean(inquiry.workflow && inquiry.workflow.routingDecision && inquiry.workflow.verificationStatus),
      Boolean(inquiry.usageGuidance && inquiry.usageGuidance.status && inquiry.usageGuidance.nextAction),
      Boolean(inquiry.workflow && inquiry.workflow.evidenceStatus)
    ];
    return percentage(checks.filter(Boolean).length, checks.length);
  }

  function analyticsExceptionRows(all) {
    var inquiryIds = all.map(function (item) { return item.id; });
    var productIds = all.map(function (item) { return item.productId; });
    var questionnaireIds = (state.questionnaires || []).filter(function (item) { return productIds.indexOf(item.productId) >= 0; }).map(function (item) { return item.id; });
    return Store.detectOperationalExceptions(analyticsReferenceTime().toISOString()).filter(function (item) {
      if (item.inquiryId) return inquiryIds.indexOf(item.inquiryId) >= 0;
      return productIds.indexOf(item.targetId) >= 0 || questionnaireIds.indexOf(item.targetId) >= 0;
    });
  }

  function renderAnalytics() {
    var all = analyticsInquiries();
    var total = all.length;
    var counselCount = all.filter(function (item) { return Boolean(item.counselor && item.counselor.id); }).length;
    var visitCount = all.filter(function (item) { return Boolean(item.visit); }).length;
    var selfResolvedCount = all.filter(function (item) { return item.actionResult === "RESOLVED" && !item.visit; }).length;
    var handoffAverage = total ? Math.round(all.reduce(function (sum, item) { return sum + handoffScore(item); }, 0) / total) : 0;
    var riskCounts = { GENERAL: 0, CAUTION: 0, DANGER: 0 };
    all.forEach(function (item) { riskCounts[item.risk] = (riskCounts[item.risk] || 0) + 1; });
    var symptoms = ["LOW_FLOW", "TASTE_ODOR", "LEAK", "TEMPERATURE"].map(function (code) { return { code: code, label: UI.symptomMap[code], count: all.filter(function (item) { return item.symptomTypes.indexOf(code) >= 0; }).length }; });
    var max = Math.max.apply(null, symptoms.map(function (item) { return item.count; }).concat([1]));
    var modelOptions = (state.productModels || []).map(function (model) { return '<option value="' + UI.escapeHTML(model.id) + '"' + (analyticsFilters.model === model.id ? " selected" : "") + '>' + UI.escapeHTML(model.modelCode + " · " + model.name) + '</option>'; }).join("");
    var managementOptions = Array.from(new Set(state.products.map(function (item) { return item.managementType; }))).map(function (value) { return '<option value="' + UI.escapeHTML(value) + '"' + (analyticsFilters.management === value ? " selected" : "") + '>' + UI.escapeHTML(value) + '</option>'; }).join("");
    var handlerOptions = state.staff.filter(function (item) { return item.active; }).map(function (staff) { return '<option value="' + UI.escapeHTML(staff.id) + '"' + (analyticsFilters.handler === staff.id ? " selected" : "") + '>' + UI.escapeHTML(staff.name + " · " + ({ COUNSELOR: "상담사", ENGINEER: "방문기사", OPERATOR: "운영" }[staff.role] || staff.role)) + '</option>'; }).join("");
    var exceptions = analyticsExceptionRows(all);
    var referenceLabel = UI.formatDateTime(analyticsReferenceTime().toISOString());
    return pageHeader("SERVICE ANALYTICS", "운영 분석", "선택한 조건에 맞는 가상 문의 원본에서 모든 지표를 다시 계산합니다.", '<span class="analytics-reference">집계 기준 · ' + referenceLabel + '</span>') +
      '<section class="work-panel analytics-filter-panel" aria-label="운영 분석 필터"><label>기간<select id="analytics-period"><option value="ALL"' + (analyticsFilters.period === "ALL" ? " selected" : "") + '>전체 기간</option><option value="30"' + (analyticsFilters.period === "30" ? " selected" : "") + '>최근 30일</option><option value="7"' + (analyticsFilters.period === "7" ? " selected" : "") + '>최근 7일</option><option value="1"' + (analyticsFilters.period === "1" ? " selected" : "") + '>최근 24시간</option></select></label><label>모델<select id="analytics-model"><option value="ALL">전체 모델</option>' + modelOptions + '</select></label><label>관리 유형<select id="analytics-management"><option value="ALL">전체 유형</option>' + managementOptions + '</select></label><label>처리 담당자<select id="analytics-handler"><option value="ALL">전체 담당자</option>' + handlerOptions + '</select></label><span><b>' + total + '</b>건 분석</span></section>' +
      '<section class="analytics-kpi-grid">' + metricCard("상담 전환율", percentage(counselCount, total) + "%", '<b class="text-blue">' + counselCount + '건</b> / 대상 ' + total + '건', "blue", "↗") + metricCard("방문 전환율", percentage(visitCount, total) + "%", '<b class="text-green">' + visitCount + '건</b> / 대상 ' + total + '건', "green", "□") + metricCard("자가 해결률", percentage(selfResolvedCount, total) + "%", '<b class="text-green">' + selfResolvedCount + '건</b> / 대상 ' + total + '건', "green", "✓") + metricCard("인계 완전성", handoffAverage + "%", '<b class="text-blue">필수 5개 영역</b> 평균', "blue", "◎") + '</section>' +
      '<div class="analytics-grid"><section class="work-panel symptom-chart"><div class="panel-heading"><div><p class="eyebrow">SYMPTOM TYPE</p><h2>대표 증상 분포</h2></div><span>복수 선택 포함</span></div><div class="bar-chart">' + symptoms.map(function (item) { return '<div><span>' + UI.escapeHTML(item.label) + '</span><div><i style="width:' + Math.round((item.count / max) * 100) + '%"></i></div><b>' + item.count + '건</b></div>'; }).join("") + '</div></section><section class="work-panel risk-chart"><div class="panel-heading"><div><p class="eyebrow">RISK LEVEL</p><h2>위험도 분포</h2></div></div><div class="donut-wrap"><div class="donut" style="--general:' + percentage(riskCounts.GENERAL, total) + '%;--caution:' + percentage(riskCounts.CAUTION, total) + '%"><span><strong>' + total + '</strong><small>필터 문의</small></span></div><ul><li><i class="legend-general"></i><span>일반</span><b>' + riskCounts.GENERAL + '건</b></li><li><i class="legend-caution"></i><span>주의</span><b>' + riskCounts.CAUTION + '건</b></li><li><i class="legend-danger"></i><span>위험</span><b>' + riskCounts.DANGER + '건</b></li></ul></div></section></div>' +
      '<section class="work-panel analytics-flow-panel"><div class="panel-heading"><div><p class="eyebrow">CONVERSION FLOW</p><h2>케어 전환 흐름</h2></div><small>고객 입력 → 상담 → 방문 → 최종 완료</small></div>' + flowOverview(all) + '</section>' +
      '<section class="work-panel analytics-exception-panel"><div class="panel-heading"><div><p class="eyebrow">OPERATION EXCEPTIONS</p><h2>운영 예외 자동 감지</h2></div><span>' + exceptions.length + '건</span></div>' + (exceptions.length ? '<div class="business-table-wrap"><table class="business-table"><thead><tr><th>유형</th><th>대상</th><th>감지 사유</th><th>마지막 단계</th><th>현재 담당</th></tr></thead><tbody>' + exceptions.map(function (item) { return '<tr><td>' + UI.chip(item.type, item.type === "EVIDENCE_NOT_FOUND" ? "danger" : "warning") + '</td><td>' + (item.inquiryId ? '<button class="id-link" type="button" data-open-staff-case="' + UI.escapeHTML(item.inquiryId) + '">' + UI.escapeHTML(item.targetId) + '</button>' : UI.escapeHTML(item.targetId)) + '</td><td>' + UI.escapeHTML(item.reason) + '</td><td>' + UI.escapeHTML(item.lastStage) + '</td><td>' + UI.escapeHTML(item.ownerRole) + '</td></tr>'; }).join("") + '</tbody></table></div>' : '<div class="empty-state small"><span>✓</span><p>현재 필터 조건에서 감지된 운영 예외가 없습니다.</p></div>') + '</section>' + prototypeFooter();
  }

  function normalizeKnowledgeText(value) {
    return String(value || "").trim().toLocaleLowerCase("ko-KR");
  }

  function knowledgeDocumentById(documentId) {
    return (state.knowledgeDocuments || []).find(function (doc) { return doc.id === documentId; });
  }

  function knowledgeInsightText(insight) {
    return [insight.keyword, insight.categoryLabel, insight.sourceLabel]
      .concat(insight.variants || [], insight.sampleExpressions || [])
      .join(" ");
  }

  function knowledgeDocumentText(doc) {
    var sectionText = (doc.sections || []).map(function (section) {
      return [section.title, section.category, section.summary, section.recommendedAction, section.caution]
        .concat(section.keywords || [], section.ruleIds || [])
        .join(" ");
    }).join(" ");
    return [doc.id, doc.modelCode, doc.modelName, doc.title, doc.version, doc.statusLabel, doc.approvalLabel, doc.owner, doc.sourceName]
      .concat(doc.tags || [], [sectionText])
      .join(" ");
  }

  function insightMatchesModel(insight, modelCode) {
    if (modelCode === "ALL") return true;
    var docs = (insight.relatedSections || []).map(function (relation) { return knowledgeDocumentById(relation.documentId); }).filter(Boolean);
    var specificDocs = docs.filter(function (doc) { return doc.modelCode !== "COMMON"; });
    if (specificDocs.length) return specificDocs.some(function (doc) { return doc.modelCode === modelCode; });
    return docs.some(function (doc) { return doc.modelCode === "COMMON"; });
  }

  function filteredKnowledgeInsights() {
    var query = normalizeKnowledgeText(knowledgeFilters.query);
    return (state.knowledgeKeywordInsights || []).filter(function (insight) {
      if (knowledgeFilters.insightId && insight.id !== knowledgeFilters.insightId) return false;
      if (knowledgeFilters.category !== "ALL" && insight.category !== knowledgeFilters.category) return false;
      if (!insightMatchesModel(insight, knowledgeFilters.model)) return false;
      if (!query) return true;
      var directMatch = normalizeKnowledgeText(knowledgeInsightText(insight)).indexOf(query) >= 0;
      var documentMatch = (insight.relatedSections || []).some(function (relation) {
        var doc = knowledgeDocumentById(relation.documentId);
        return doc && normalizeKnowledgeText(knowledgeDocumentText(doc)).indexOf(query) >= 0;
      });
      return directMatch || documentMatch;
    });
  }

  function filteredKnowledgeDocuments(insights) {
    var query = normalizeKnowledgeText(knowledgeFilters.query);
    var relatedIds = [];
    insights.forEach(function (insight) {
      (insight.relatedSections || []).forEach(function (relation) {
        if (relatedIds.indexOf(relation.documentId) < 0) relatedIds.push(relation.documentId);
      });
    });
    var categoryMap = { PAIN: "애로사항", REQUIREMENT: "요구사항", SAFETY: "안전 신호", PENDING: "애로사항" };
    return (state.knowledgeDocuments || []).filter(function (doc) {
      if (knowledgeFilters.insightId && relatedIds.indexOf(doc.id) < 0) return false;
      if (knowledgeFilters.model !== "ALL" && doc.modelCode !== knowledgeFilters.model && !(doc.modelCode === "COMMON" && relatedIds.indexOf(doc.id) >= 0)) return false;
      if (knowledgeFilters.category !== "ALL") {
        var sectionCategory = categoryMap[knowledgeFilters.category];
        var categoryMatch = (doc.sections || []).some(function (section) { return section.category === sectionCategory; });
        if (!categoryMatch || (relatedIds.length && relatedIds.indexOf(doc.id) < 0)) return false;
      }
      if (!query) return true;
      return normalizeKnowledgeText(knowledgeDocumentText(doc)).indexOf(query) >= 0 || relatedIds.indexOf(doc.id) >= 0;
    });
  }

  function knowledgeSeverityTone(severity) {
    return severity === "DANGER" ? "danger" : severity === "CAUTION" ? "warning" : "neutral";
  }

  function renderKnowledgeKeywordCards(insights) {
    if (!insights.length) return '<div class="knowledge-empty"><span>⌕</span><strong>일치하는 키워드가 없습니다</strong><p>검색어 또는 분류·모델 필터를 바꿔보세요.</p></div>';
    return '<div class="knowledge-keyword-grid">' + insights.map(function (insight) {
      var selected = knowledgeFilters.insightId === insight.id;
      var className = "knowledge-keyword-card knowledge-keyword-card--" + insight.category.toLowerCase() + (selected ? " is-selected" : "");
      return '<button class="' + className + '" type="button" data-knowledge-keyword="' + UI.escapeHTML(insight.id) + '" aria-pressed="' + selected + '"><span class="knowledge-keyword-type">' + UI.escapeHTML(insight.categoryLabel) + '</span><strong>' + UI.escapeHTML(insight.keyword) + '</strong><small>' + UI.escapeHTML((insight.variants || []).join(" · ")) + '</small><span class="knowledge-keyword-meta">' + UI.chip(insight.severityLabel, knowledgeSeverityTone(insight.severity)) + '<b>' + UI.escapeHTML(insight.trendLabel) + '</b><em>' + UI.escapeHTML(insight.sourceLabel) + '</em></span></button>';
    }).join("") + '</div>';
  }

  function relatedInsightsForDocument(doc, filteredInsights) {
    return filteredInsights.filter(function (insight) {
      return (insight.relatedSections || []).some(function (relation) { return relation.documentId === doc.id; });
    });
  }

  function renderKnowledgeDocumentCards(docs, insights) {
    if (!docs.length) return '<div class="knowledge-empty knowledge-empty--documents"><span>≡</span><strong>연결 문서가 없습니다</strong><p>선택한 조건에 맞는 시연 문서 메타데이터가 없습니다.</p></div>';
    return docs.map(function (doc) {
      var relatedInsights = relatedInsightsForDocument(doc, insights);
      var linkedCases = [];
      (doc.sections || []).forEach(function (section) { (section.matchedInquiryIds || []).forEach(function (id) { if (linkedCases.indexOf(id) < 0) linkedCases.push(id); }); });
      var statusTone = doc.status === "CONNECTED" ? "success" : "warning";
      return '<article class="knowledge-card"><div class="knowledge-card-top"><span>' + (doc.type === "SAFETY_POLICY" ? "규칙" : "문서") + '</span>' + UI.chip(doc.statusLabel, statusTone) + '</div><small>' + UI.escapeHTML(doc.modelCode + " · " + doc.modelName) + '</small><h2>' + UI.escapeHTML(doc.title) + '</h2><div class="knowledge-card-keywords">' + (relatedInsights.length ? relatedInsights.slice(0, 4).map(function (insight) { return '<span>' + UI.escapeHTML(insight.keyword) + '</span>'; }).join("") : '<span>연결 키워드 대기</span>') + '</div><dl><div><dt>버전</dt><dd>' + UI.escapeHTML(doc.version) + '</dd></div><div><dt>연결 구간</dt><dd>' + doc.sections.length + '개</dd></div><div><dt>연결 사례</dt><dd>' + linkedCases.length + '건</dd></div><div><dt>승인 상태</dt><dd>' + UI.escapeHTML(doc.approvalLabel) + '</dd></div></dl><button class="button button--ghost button--full" type="button" data-open-knowledge-metadata="' + UI.escapeHTML(doc.id) + '" aria-haspopup="dialog" aria-controls="knowledge-metadata-dialog">메타데이터 보기</button></article>';
    }).join("");
  }

  function renderKnowledgeRuleRows() {
    var safetyDoc = (state.knowledgeDocuments || []).find(function (doc) { return doc.type === "SAFETY_POLICY"; });
    if (!safetyDoc) return '<tr><td colspan="4">등록된 시연 안전 규칙이 없습니다.</td></tr>';
    return safetyDoc.sections.map(function (section) {
      return '<tr><td><strong>' + UI.escapeHTML((section.ruleIds || [section.id])[0]) + '</strong></td><td>' + UI.escapeHTML((section.keywords || []).slice(0, 3).join(" + ")) + '</td><td>' + UI.escapeHTML(section.recommendedAction) + '</td><td>' + UI.chip("시연 활성", "success") + '</td></tr>';
    }).join("");
  }

  function renderKnowledgeResults() {
    var insights = filteredKnowledgeInsights();
    var docs = filteredKnowledgeDocuments(insights);
    return { insights: insights, docs: docs };
  }

  function renderKnowledge() {
    var result = renderKnowledgeResults();
    var meta = state.knowledgeAnalysisMeta || {};
    var uniqueCases = [];
    (state.knowledgeKeywordInsights || []).forEach(function (insight) { (insight.linkedInquiryIds || []).forEach(function (id) { if (uniqueCases.indexOf(id) < 0) uniqueCases.push(id); }); });
    return pageHeader("KNOWLEDGE BASE", "지식·매뉴얼", "고객 애로사항·요구사항 키워드에서 관련 문서 구간과 문의 사례를 바로 확인합니다.", '<button class="button button--secondary" type="button" disabled>문서 등록 · 운영 연동 후</button>') +
      '<div class="knowledge-notice"><b>i</b><p><strong>시연용 키워드·지식 저장소입니다.</strong> 실제 AI 분석이나 공식 문서 원문이 아닌, 합성 문의 5건과 연결된 가상 메타데이터를 사용합니다.</p></div>' +
      '<section class="work-panel knowledge-analysis-panel" aria-labelledby="knowledge-analysis-title"><div class="knowledge-analysis-head"><div><p class="eyebrow">CUSTOMER VOC KEYWORDS</p><h2 id="knowledge-analysis-title">고객 애로·요구 키워드 분석</h2><p>고객 원문과 운영 요구 추론을 구분하고, 선택한 키워드와 연결된 문서만 아래에 표시합니다.</p></div><span class="knowledge-analysis-source">' + UI.escapeHTML(meta.modelVersion || "DEMO-KW") + '<small>' + UI.escapeHTML(UI.formatDateTime(meta.generatedAt)) + ' 생성</small></span></div>' +
      '<div class="knowledge-analysis-kpis"><div><span>분석 문의</span><strong>' + uniqueCases.length + '</strong><small>고유 문의 · 복수 키워드 포함</small></div><div><span>도출 키워드</span><strong>' + (state.knowledgeKeywordInsights || []).length + '</strong><small>애로·요구·안전·대기</small></div><div><span>연결 문서</span><strong>' + (state.knowledgeDocuments || []).length + '</strong><small>모델 문서와 공통 규칙</small></div><div><span>위험 신호</span><strong>' + (state.knowledgeKeywordInsights || []).filter(function (item) { return item.category === "SAFETY"; }).length + '</strong><small>안전 규칙 우선 표시</small></div></div>' +
      '<div class="knowledge-filter-bar"><label class="knowledge-search-field"><span>⌕</span><input id="knowledge-query" type="search" value="' + UI.escapeHTML(knowledgeFilters.query) + '" placeholder="예: 출수량, 물맛, 누수, 상담 연결" aria-label="고객 키워드와 문서 검색"></label><label><span>분류</span><select id="knowledge-category-filter"><option value="ALL">전체 분류</option><option value="PAIN"' + (knowledgeFilters.category === "PAIN" ? " selected" : "") + '>애로사항</option><option value="REQUIREMENT"' + (knowledgeFilters.category === "REQUIREMENT" ? " selected" : "") + '>요구사항</option><option value="SAFETY"' + (knowledgeFilters.category === "SAFETY" ? " selected" : "") + '>안전 신호</option><option value="PENDING"' + (knowledgeFilters.category === "PENDING" ? " selected" : "") + '>분석 대기</option></select></label><label><span>제품 모델</span><select id="knowledge-model-filter"><option value="ALL">전체 모델</option><option value="WPUIAC425SNW"' + (knowledgeFilters.model === "WPUIAC425SNW" ? " selected" : "") + '>원코크 플러스</option><option value="WPUJAC115DNW"' + (knowledgeFilters.model === "WPUJAC115DNW" ? " selected" : "") + '>초소형 플러스</option></select></label><button class="button button--ghost" type="button" data-reset-knowledge-filter>필터 초기화</button></div>' +
      '<div id="knowledge-keyword-results">' + renderKnowledgeKeywordCards(result.insights) + '</div></section>' +
      '<div class="knowledge-result-heading"><div><p class="eyebrow">LINKED KNOWLEDGE</p><h2>연결 문서 메타데이터</h2></div><p id="knowledge-result-summary" role="status" aria-live="polite">키워드 ' + result.insights.length + '개 · 관련 문서 ' + result.docs.length + '개</p></div><section id="knowledge-document-results" class="knowledge-grid">' + renderKnowledgeDocumentCards(result.docs, result.insights) + '</section>' +
      '<section class="work-panel rule-table-panel"><div class="panel-heading"><div><p class="eyebrow">SAFETY RULES</p><h2>핵심 안전 원칙</h2></div><span>시연용 문서 메타데이터와 연결</span></div><div class="business-table-wrap"><table class="business-table"><thead><tr><th>규칙 ID</th><th>감지 키워드</th><th>우선 처리</th><th>상태</th></tr></thead><tbody>' + renderKnowledgeRuleRows() + '</tbody></table></div></section>' + prototypeFooter();
  }

  function updateKnowledgeResults() {
    if (currentView !== "knowledge") return;
    var result = renderKnowledgeResults();
    var keywordRoot = document.getElementById("knowledge-keyword-results");
    var documentRoot = document.getElementById("knowledge-document-results");
    var summary = document.getElementById("knowledge-result-summary");
    if (keywordRoot) keywordRoot.innerHTML = renderKnowledgeKeywordCards(result.insights);
    if (documentRoot) documentRoot.innerHTML = renderKnowledgeDocumentCards(result.docs, result.insights);
    if (summary) summary.textContent = "키워드 " + result.insights.length + "개 · 관련 문서 " + result.docs.length + "개";
  }

  function renderKnowledgeMetadata(doc) {
    var relatedInsights = (state.knowledgeKeywordInsights || []).filter(function (insight) {
      return (insight.relatedSections || []).some(function (relation) { return relation.documentId === doc.id; });
    });
    var insightMarkup = relatedInsights.length ? relatedInsights.map(function (insight) {
      return '<article class="knowledge-dialog-insight"><header><div><span>' + UI.escapeHTML(insight.categoryLabel) + '</span><strong>' + UI.escapeHTML(insight.keyword) + '</strong></div>' + UI.chip(insight.severityLabel, knowledgeSeverityTone(insight.severity)) + '</header><p>“' + UI.escapeHTML((insight.sampleExpressions || [""])[0]) + '”</p><footer><span>' + UI.escapeHTML(insight.sourceLabel) + '</span><b>연결 문의 ' + insight.linkedInquiryIds.length + '건</b></footer></article>';
    }).join("") : '<div class="knowledge-empty"><strong>연결된 고객 키워드가 없습니다</strong></div>';
    var sectionMarkup = (doc.sections || []).map(function (section) {
      var caseButtons = (section.matchedInquiryIds || []).length ? section.matchedInquiryIds.map(function (id) { return '<button type="button" data-open-knowledge-case="' + UI.escapeHTML(id) + '">' + UI.escapeHTML(id) + ' →</button>'; }).join("") : '<span>현재 연결 사례 없음</span>';
      return '<article class="knowledge-section-card"><header><div><span>' + UI.escapeHTML(section.page) + '</span><strong>' + UI.escapeHTML(section.title) + '</strong></div>' + UI.chip(section.category, section.category === "안전 신호" ? "danger" : section.category === "요구사항" ? "info" : "neutral") + '</header><p>' + UI.escapeHTML(section.summary) + '</p><div class="knowledge-section-keywords">' + (section.keywords || []).map(function (keyword) { return '<span>#' + UI.escapeHTML(keyword) + '</span>'; }).join("") + '</div><dl><div><dt>권장 연결</dt><dd>' + UI.escapeHTML(section.recommendedAction) + '</dd></div><div><dt>주의 조건</dt><dd>' + UI.escapeHTML(section.caution) + '</dd></div><div><dt>규칙 ID</dt><dd>' + UI.escapeHTML((section.ruleIds || []).join(" · ") || "없음") + '</dd></div></dl><footer><span>관련 문의</span><div>' + caseButtons + '</div></footer></article>';
    }).join("");
    return '<div class="knowledge-dialog-demo-note"><b>가상 데이터</b><p>고객 표현·요구 추론·페이지·해시는 시연용이며 실제 문서 원문이나 운영 AI 분석 결과가 아닙니다.</p></div><section class="knowledge-metadata-grid"><div><span>문서 ID</span><strong>' + UI.escapeHTML(doc.id) + '</strong></div><div><span>모델</span><strong>' + UI.escapeHTML(doc.modelCode + " · " + doc.modelName) + '</strong></div><div><span>버전·승인</span><strong>' + UI.escapeHTML(doc.version + " · " + doc.approvalLabel) + '</strong></div><div><span>시행·검토</span><strong>' + UI.escapeHTML(doc.effectiveAt + " · " + UI.formatDateTime(doc.lastReviewedAt)) + '</strong></div><div><span>관리 책임</span><strong>' + UI.escapeHTML(doc.owner) + '</strong></div><div><span>무결성 식별자</span><strong>' + UI.escapeHTML(doc.checksum) + '</strong></div></section><section class="knowledge-dialog-section"><div class="section-title-row"><h3>연결된 고객 애로·요구</h3><span>' + relatedInsights.length + '개 키워드</span></div><div class="knowledge-dialog-insights">' + insightMarkup + '</div></section><section class="knowledge-dialog-section"><div class="section-title-row"><h3>문서 구간 메타데이터</h3><span>' + doc.sections.length + '개 구간</span></div><div class="knowledge-section-list">' + sectionMarkup + '</div></section>';
  }

  function openKnowledgeMetadata(documentId) {
    var doc = knowledgeDocumentById(documentId);
    var dialog = document.getElementById("knowledge-metadata-dialog");
    if (!doc || !dialog) { UI.showToast("문서 메타데이터를 찾을 수 없습니다.", "danger"); return; }
    document.getElementById("knowledge-metadata-title").textContent = doc.title;
    document.getElementById("knowledge-metadata-subtitle").textContent = doc.modelCode + " · " + doc.statusLabel + " · " + doc.version;
    document.getElementById("knowledge-metadata-content").innerHTML = renderKnowledgeMetadata(doc);
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  }

  function closeKnowledgeMetadata() {
    var dialog = document.getElementById("knowledge-metadata-dialog");
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close("cancel");
    else {
      dialog.removeAttribute("open");
      if (knowledgeDialogReturnFocus && document.contains(knowledgeDialogReturnFocus)) knowledgeDialogReturnFocus.focus();
      knowledgeDialogReturnFocus = null;
    }
  }

  function renderAudit() {
    var focusNotice = currentInquiryId ? '<div class="audit-focus-notice"><span>연결된 문의</span><strong>' + UI.escapeHTML(currentInquiryId) + '</strong><button type="button" data-open-staff-case="' + UI.escapeHTML(currentInquiryId) + '">업무 상세 열기</button></div>' : "";
    return pageHeader("AUDIT TRAIL", "변경 이력", "주요 상태 변경자, 시각과 변경 사유를 조회합니다.", '<button class="button button--secondary" type="button" data-reset-demo>가상 데이터 초기화</button>') +
      focusNotice + '<section class="work-panel audit-panel"><div class="panel-heading"><div><p class="eyebrow">RECENT ACTIVITY</p><h2>사용자·상태 변경</h2></div><span>총 ' + state.auditLog.length + '건</span></div><div class="business-table-wrap"><table class="business-table audit-table"><thead><tr><th>변경 시각</th><th>변경자·역할</th><th>작업</th><th>대상</th><th>변경 내용</th></tr></thead><tbody>' + state.auditLog.map(function (item) { return '<tr' + (currentInquiryId && item.target === currentInquiryId ? ' class="is-audit-focus"' : '') + '><td><time>' + UI.formatDateTime(item.at) + '</time></td><td><strong>' + UI.escapeHTML(item.actor) + '</strong><small>' + UI.escapeHTML(item.role) + '</small></td><td>' + UI.escapeHTML(item.action) + '</td><td>' + (state.inquiries.some(function (inquiry) { return inquiry.id === item.target; }) ? '<button class="id-link" type="button" data-open-staff-case="' + UI.escapeHTML(item.target) + '">' + UI.escapeHTML(item.target) + '</button>' : UI.escapeHTML(item.target)) + '</td><td>' + UI.escapeHTML(item.detail) + '</td></tr>'; }).join("") + '</tbody></table></div></section>' +
      '<section class="work-panel audit-panel operation-log-panel"><div class="panel-heading"><div><p class="eyebrow">OPERATION LOG</p><h2>AI·근거검색·오류·사용자 행위</h2></div><span>총 ' + (state.operationLog || []).length + '건</span></div><div class="business-table-wrap"><table class="business-table audit-table"><thead><tr><th>발생 시각</th><th>유형</th><th>결과</th><th>대상</th><th>처리 내용</th><th>소요</th></tr></thead><tbody>' + (state.operationLog || []).map(function (item) { return '<tr' + (currentInquiryId && item.target === currentInquiryId ? ' class="is-audit-focus"' : '') + '><td><time>' + UI.formatDateTime(item.at) + '</time></td><td>' + UI.escapeHTML(item.category) + '</td><td>' + UI.chip(item.outcome, item.outcome === "SUCCESS" ? "success" : item.outcome === "PENDING" ? "warning" : "danger") + '</td><td>' + UI.escapeHTML(item.target || "-") + '</td><td><strong>' + UI.escapeHTML(item.detail) + '</strong><small>' + UI.escapeHTML([item.actorRole, item.previousStatus && item.previousStatus + " → " + item.nextStatus, item.schemaVersion].filter(Boolean).join(" · ") || "민감정보 제외") + '</small></td><td>' + Number(item.durationMs || 0) + 'ms</td></tr>'; }).join("") + '</tbody></table></div></section><div class="audit-safety-note"><b>보관 원칙</b><p>프로토타입에서는 로컬 브라우저에만 저장합니다. 운영 환경에서는 변경 이력을 삭제 불가능한 서버 로그로 보관하고 비밀키·민감정보를 평문으로 남기지 않아야 합니다.</p></div>' + prototypeFooter();
  }

  function prototypeFooter() {
    return '<footer class="prototype-footer prototype-footer--staff"><p><b>시연 환경</b> 가상 데이터 · 고객·상담·방문 업무와 역할별 알림은 브라우저 내 실시간 연계 · 외부 메시지·운영 서버 연동 전</p><span>Schema v' + state.meta.schemaVersion + ' · Revision ' + state.meta.revision + '</span></footer>';
  }

  function prepareSignatureCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(280, Math.round(rect.width || Number(canvas.getAttribute("width")) || 520));
    var cssHeight = Math.max(120, Math.round(rect.height || Number(canvas.getAttribute("height")) || 170));
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.4;
    context.strokeStyle = "#12324a";
    return { context: context, width: cssWidth, height: cssHeight };
  }

  function drawSignature(canvas, strokes) {
    if (!canvas) return;
    var prepared = prepareSignatureCanvas(canvas);
    prepared.context.clearRect(0, 0, prepared.width, prepared.height);
    (strokes || []).forEach(function (stroke) {
      if (!stroke || stroke.length < 2) return;
      prepared.context.beginPath();
      prepared.context.moveTo(stroke[0].x * prepared.width, stroke[0].y * prepared.height);
      stroke.slice(1).forEach(function (point) { prepared.context.lineTo(point.x * prepared.width, point.y * prepared.height); });
      prepared.context.stroke();
    });
  }

  function initSignaturePad() {
    var canvas = document.getElementById("signature-pad");
    if (!canvas) return;
    signatureStrokes = [];
    drawSignature(canvas, signatureStrokes);
    var activePointerId = null;
    var activeStroke = null;
    var stateLabel = document.getElementById("signature-state");

    function pointFromEvent(event) {
      var rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(rect.width, 1))),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(rect.height, 1)))
      };
    }

    function finishStroke(event) {
      if (activePointerId !== event.pointerId) return;
      if (activeStroke && activeStroke.length < 2) signatureStrokes.pop();
      try { canvas.releasePointerCapture(event.pointerId); } catch (ignore) { /* pointer may already be released */ }
      activePointerId = null;
      activeStroke = null;
      drawSignature(canvas, signatureStrokes);
      if (stateLabel) stateLabel.textContent = signatureStrokes.length ? "서명이 입력되었습니다. 제출 전 다시 확인해 주세요." : "서명란에 손가락, 펜 또는 마우스로 서명해 주세요.";
    }

    canvas.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      activePointerId = event.pointerId;
      activeStroke = [pointFromEvent(event)];
      signatureStrokes.push(activeStroke);
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", function (event) {
      if (activePointerId !== event.pointerId || !activeStroke) return;
      event.preventDefault();
      var point = pointFromEvent(event);
      var previous = activeStroke[activeStroke.length - 1];
      if (Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y) < 0.002) return;
      activeStroke.push(point);
      drawSignature(canvas, signatureStrokes);
    });
    canvas.addEventListener("pointerup", finishStroke);
    canvas.addEventListener("pointercancel", finishStroke);
    canvas.addEventListener("keydown", function (event) {
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        signatureStrokes = [];
        drawSignature(canvas, signatureStrokes);
        if (stateLabel) stateLabel.textContent = "서명을 지웠습니다. 다시 서명해 주세요.";
      }
    });
    var clearButton = document.getElementById("clear-signature");
    if (clearButton) clearButton.addEventListener("click", function () {
      signatureStrokes = [];
      drawSignature(canvas, signatureStrokes);
      if (stateLabel) stateLabel.textContent = "서명을 지웠습니다. 다시 서명해 주세요.";
      canvas.focus();
    });
  }

  function initSignaturePreviews() {
    document.querySelectorAll("[data-signature-inquiry]").forEach(function (canvas) {
      var inquiry = state.inquiries.find(function (item) { return item.id === canvas.dataset.signatureInquiry; });
      var signatureData = inquiry && inquiry.visit && inquiry.visit.signature && inquiry.visit.signature.signatureData;
      drawSignature(canvas, signatureData ? signatureData.strokes : []);
    });
  }

  function bindDynamicForms() {
    var counselForm = document.getElementById("counsel-action-form");
    if (counselForm) counselForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(counselForm);
      var action = event.submitter ? event.submitter.value : "";
      var visitRequiredValue = data.get("visitRequired");
      var counselRecord = {
        additionalChecks: data.get("additionalChecks"), guidance: data.get("guidance"), result: data.get("result"),
        visitRequired: visitRequiredValue === "YES" ? true : (visitRequiredValue === "NO" ? false : null),
        confirmedFields: data.getAll("confirmedFields")
      };
      try {
        if (action === "save-note") {
          Store.saveCounselNote(counselForm.dataset.inquiryId, counselRecord, currentStaff().id, currentStaff().name);
          UI.showToast("상담 기록을 저장했습니다.", "success");
        } else if (action === "resolve") {
          counselRecord.visitRequired = false;
          Store.resolveCounsel(counselForm.dataset.inquiryId, counselRecord, currentStaff().id, currentStaff().name);
          UI.showToast("상담 결과를 고객 확인 단계로 전달했습니다.", "success");
        } else if (action === "schedule") {
          counselRecord.visitRequired = true;
          Store.saveCounselNote(counselForm.dataset.inquiryId, counselRecord, currentStaff().id, currentStaff().name);
          var scheduleStatus = data.get("scheduleStatus");
          var confirmedAt = data.get("confirmedAt");
          Store.scheduleVisit(counselForm.dataset.inquiryId, {
            actorId: currentStaff().id,
            engineerId: data.get("engineerId") || null,
            serviceType: data.get("serviceType"),
            customerPreferredAt: new Date(data.get("customerPreferredAt")).toISOString(),
            scheduleStatus: scheduleStatus,
            confirmedAt: confirmedAt ? new Date(confirmedAt).toISOString() : null,
            area: data.get("area")
          });
          UI.showToast(scheduleStatus === "CONFIRMED" ? "기사와 방문 확정 일정을 등록했습니다." : "고객 희망일과 일정 진행 상태를 등록했습니다.", "success");
        }
      } catch (error) { UI.showToast(error.message, "danger"); }
    });
    var visitScheduleForm = document.getElementById("visit-schedule-update-form");
    if (visitScheduleForm) visitScheduleForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(visitScheduleForm);
      var confirmedAt = data.get("confirmedAt");
      try {
        Store.updateVisitSchedule(visitScheduleForm.dataset.inquiryId, {
          actorId: currentStaff().id,
          scheduleStatus: data.get("scheduleStatus"),
          engineerId: data.get("engineerId"),
          confirmedAt: confirmedAt ? new Date(confirmedAt).toISOString() : null
        });
        UI.showToast(data.get("scheduleStatus") === "CONFIRMED" ? "방문 일정을 확정했습니다." : "방문기사와 일정을 조율 중으로 저장했습니다.", "success");
      } catch (error) { UI.showToast(error.message, "danger"); }
    });
    var rescheduleForm = document.getElementById("reschedule-review-form");
    if (rescheduleForm) rescheduleForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(rescheduleForm);
      var decision = event.submitter ? event.submitter.value : "";
      var note = String(data.get("resolutionNote") || "").trim();
      try {
        if (decision === "REJECT" && note.length < 5) throw new Error("일정 변경 반려 사유를 5자 이상 입력해 주세요.");
        Store.resolveVisitReschedule(rescheduleForm.dataset.inquiryId, { decision: decision, resolutionNote: note, actorId: currentStaff().id });
        UI.showToast(decision === "APPROVE" ? "고객 희망 일정으로 변경을 확정했습니다." : "기존 일정을 유지하고 반려 사유를 기록했습니다.", "success");
      } catch (error) { UI.showToast(error.message, "danger"); }
    });
    var visitForm = document.getElementById("visit-result-form");
    if (visitForm) visitForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(visitForm);
      try {
        Store.completeVisit(visitForm.dataset.inquiryId, { serviceType: data.get("serviceType"), result: data.get("result"), cause: data.get("cause"), actions: data.getAll("actions"), replacement: data.get("replacement"), engineerId: currentStaff().id, engineerName: currentStaff().name, signerName: data.get("signerName"), signerRelationship: data.get("signerRelationship"), signerPosition: data.get("signerPosition"), signatureConsent: data.get("signatureConsent") === "on", signatureData: { format: "POINTS_V1", strokes: signatureStrokes } });
        signatureStrokes = [];
        UI.showToast("작업 결과와 고객 서명, 다음 케어 일정을 반영했습니다.", "success");
      } catch (error) { UI.showToast(error.message, "danger"); }
    });
    var search = document.getElementById("queue-search");
    if (search) search.addEventListener("input", function (event) { filters.query = event.target.value; render(); var next = document.getElementById("queue-search"); if (next) { next.focus(); next.setSelectionRange(filters.query.length, filters.query.length); } });
    var statusFilter = document.getElementById("status-filter");
    if (statusFilter) statusFilter.addEventListener("change", function (event) { filters.status = event.target.value; render(); });
    var riskFilter = document.getElementById("risk-filter");
    if (riskFilter) riskFilter.addEventListener("change", function (event) { filters.risk = event.target.value; render(); });
    var customerTypeFilter = document.getElementById("customer-type-filter");
    if (customerTypeFilter) customerTypeFilter.addEventListener("change", function (event) { filters.customerType = event.target.value; render(); });
    [
      ["analytics-period", "period"],
      ["analytics-model", "model"],
      ["analytics-management", "management"],
      ["analytics-handler", "handler"]
    ].forEach(function (binding) {
      var control = document.getElementById(binding[0]);
      if (control) control.addEventListener("change", function (event) { analyticsFilters[binding[1]] = event.target.value; render(); });
    });
    initSignaturePad();
    initSignaturePreviews();
  }

  function render(reason) {
    state = Store.getState();
    if (!canView(currentView)) currentView = allowedViews()[0];
    var clearedInaccessibleInquiry = false;
    if (currentInquiryId) {
      var requestedInquiry = state.inquiries.find(function (item) { return item.id === currentInquiryId; });
      if (!canOpenInquiry(requestedInquiry)) { currentInquiryId = null; clearedInaccessibleInquiry = true; }
    }
    if (clearedInaccessibleInquiry) UI.setQuery({ role: currentRole, view: currentView === "dashboard" ? null : currentView, inquiry: null });
    renderShellState();
    var root = document.getElementById("staff-view");
    if (currentView === "queue") root.innerHTML = renderQueue();
    else if (currentView === "visits") root.innerHTML = renderVisits();
    else if (currentView === "customers") root.innerHTML = renderCustomers();
    else if (currentView === "analytics") root.innerHTML = renderAnalytics();
    else if (currentView === "knowledge") root.innerHTML = renderKnowledge();
    else if (currentView === "audit") root.innerHTML = renderAudit();
    else { currentView = "dashboard"; root.innerHTML = renderDashboard(); }
    bindDynamicForms();
    if (notificationController) notificationController.refresh(reason);
  }

  function goView(view) {
    if (!canView(view)) {
      UI.showToast("현재 역할에서는 이 메뉴에 접근할 수 없습니다.", "danger");
      return;
    }
    currentView = view;
    if (view !== "queue" && view !== "visits") currentInquiryId = null;
    UI.setQuery({ role: currentRole, view: view === "dashboard" ? null : view, inquiry: currentInquiryId });
    render();
    document.getElementById("staff-main").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function initStaffMenuSearch() {
    if (!UI.initMenuSearch) return;
    var items = [
      { id: "staff-dashboard", view: "dashboard", label: "통합 현황", category: "업무 메뉴", description: "문의·방문·예외 현황", keywords: ["대시보드", "홈", "업무 현황", "KPI"], onSelect: function () { goView("dashboard"); } },
      { id: "staff-queue", view: "queue", label: "상담·문의 큐", category: "업무 메뉴", description: "우선순위 문의 확인 및 상담", keywords: ["상담", "문의", "상담 큐", "위험 문의", "고객 문의"], onSelect: function () { goView("queue"); } },
      { id: "staff-visits", view: "visits", label: "방문 일정·변경 승인", category: "업무 메뉴", description: "기사 일정, 변경 요청 및 현장 작업", keywords: ["방문", "일정", "일정 변경", "변경 승인", "예약", "기사", "A/S", "설치", "수리", "고객 서명"], onSelect: function () { currentInquiryId = null; goView("visits"); } },
      { id: "staff-customers", view: "customers", label: "고객·사업장", category: "업무 메뉴", description: "개인·기업 고객과 설치 자산", keywords: ["고객", "기업", "회사", "사무실", "사업장", "담당자", "자산"], onSelect: function () { goView("customers"); } },
      { id: "staff-analytics", view: "analytics", label: "운영 분석", category: "업무 메뉴", description: "상담·방문 전환과 증상 지표", keywords: ["분석", "통계", "지표", "전환율", "운영"], onSelect: function () { goView("analytics"); } },
      { id: "staff-knowledge", view: "knowledge", label: "지식·매뉴얼", category: "관리 메뉴", description: "고객 애로·요구 키워드와 문서 메타데이터", keywords: ["지식", "매뉴얼", "문서", "메타데이터", "안전 규칙", "근거", "애로사항", "요구사항", "VOC", "키워드 분석", "출수량", "물맛", "냄새", "누수", "전원부", "냉수", "상담 연결"], onSelect: function () { goView("knowledge"); } },
      { id: "staff-audit", view: "audit", label: "변경 이력", category: "관리 메뉴", description: "상태 변경과 AI·검색 운영 로그", keywords: ["이력", "감사", "로그", "변경 기록", "AI 호출", "검색 실패", "audit"], onSelect: function () { goView("audit"); } }
    ].filter(function (item) { return canView(item.view); });
    if (staffMenuController) staffMenuController.setItems(items);
    else staffMenuController = UI.initMenuSearch({ rootId: "staff-menu-search", items: items });
  }

  function staffNotifications() {
    var staff = currentStaff();
    return (state.notifications || []).filter(function (item) {
      return item.recipientRole === currentRole && (!item.recipientId || item.recipientId === staff.id);
    });
  }

  function initStaffNotificationCenter() {
    if (!UI.initNotificationCenter) return null;
    return UI.initNotificationCenter({
      toggleId: "staff-notification-toggle",
      panelId: "staff-notification-panel",
      label: "업무 알림",
      getContextKey: function () { return currentRole + ":" + currentStaff().id; },
      getItems: staffNotifications,
      onBeforeOpen: function () { state = Store.getState(); },
      onRead: function (item) { Store.markNotificationRead(item.id, currentRole, currentStaff().id); },
      onReadAll: function () { Store.markAllNotificationsRead(currentRole, currentStaff().id); },
      onSelect: function (item) {
        var targetView = item.view && canView(item.view) ? item.view : (currentRole === "ENGINEER" ? "visits" : "queue");
        if (item.inquiryId && (targetView === "queue" || targetView === "visits")) {
          openCase(item.inquiryId, targetView);
          document.getElementById("staff-main").focus({ preventScroll: true });
        } else if (item.inquiryId && canOpenInquiry(state.inquiries.find(function (inquiry) { return inquiry.id === item.inquiryId; }))) {
          currentInquiryId = item.inquiryId;
          currentView = targetView;
          UI.setQuery({ role: currentRole, view: targetView === "dashboard" ? null : targetView, inquiry: item.inquiryId });
          render();
          document.getElementById("staff-main").focus({ preventScroll: true });
        } else goView(targetView || "dashboard");
      }
    });
  }

  function openCase(id, view) {
    var inquiry = state.inquiries.find(function (item) { return item.id === id; });
    if (!canOpenInquiry(inquiry)) {
      UI.showToast("현재 역할에 배정된 문의만 확인할 수 있습니다.", "danger");
      return;
    }
    var targetView = currentRole === "ENGINEER" ? "visits" : (view || "queue");
    if (!canView(targetView)) targetView = allowedViews()[0];
    if (currentInquiryId !== id) signatureStrokes = [];
    currentInquiryId = id;
    currentView = targetView;
    detailTab = "summary";
    UI.setQuery({ role: currentRole, view: currentView, inquiry: id });
    render();
  }

  document.addEventListener("click", function (event) {
    var knowledgeKeyword = event.target.closest("[data-knowledge-keyword]");
    if (knowledgeKeyword) {
      knowledgeFilters.insightId = knowledgeFilters.insightId === knowledgeKeyword.dataset.knowledgeKeyword ? null : knowledgeKeyword.dataset.knowledgeKeyword;
      updateKnowledgeResults();
      return;
    }
    var knowledgeMetadataButton = event.target.closest("[data-open-knowledge-metadata]");
    if (knowledgeMetadataButton) {
      knowledgeDialogReturnFocus = knowledgeMetadataButton;
      openKnowledgeMetadata(knowledgeMetadataButton.dataset.openKnowledgeMetadata);
      return;
    }
    if (event.target.closest("[data-knowledge-dialog-close]")) {
      event.preventDefault();
      closeKnowledgeMetadata();
      return;
    }
    var knowledgeCaseButton = event.target.closest("[data-open-knowledge-case]");
    if (knowledgeCaseButton) {
      var inquiryId = knowledgeCaseButton.dataset.openKnowledgeCase;
      knowledgeDialogReturnFocus = null;
      closeKnowledgeMetadata();
      openCase(inquiryId, "queue");
      return;
    }
    if (event.target.closest("[data-reset-knowledge-filter]")) {
      knowledgeFilters = { query: "", category: "ALL", model: "ALL", insightId: null };
      var knowledgeQuery = document.getElementById("knowledge-query");
      var knowledgeCategory = document.getElementById("knowledge-category-filter");
      var knowledgeModel = document.getElementById("knowledge-model-filter");
      if (knowledgeQuery) knowledgeQuery.value = "";
      if (knowledgeCategory) knowledgeCategory.value = "ALL";
      if (knowledgeModel) knowledgeModel.value = "ALL";
      updateKnowledgeResults();
      if (knowledgeQuery) knowledgeQuery.focus();
      return;
    }
    var viewButton = event.target.closest("[data-staff-view]");
    if (viewButton) { goView(viewButton.dataset.staffView); return; }
    var openButton = event.target.closest("[data-open-staff-case]");
    if (openButton) { openCase(openButton.dataset.openStaffCase, "queue"); return; }
    var row = event.target.closest("[data-case-row]");
    if (row) { openCase(row.dataset.caseRow, "queue"); return; }
    var selectButton = event.target.closest("[data-select-staff-case]");
    if (selectButton) { openCase(selectButton.dataset.selectStaffCase, "queue"); return; }
    var visitButton = event.target.closest("[data-select-visit]");
    if (visitButton) { openCase(visitButton.dataset.selectVisit, "visits"); return; }
    var tabButton = event.target.closest("[data-detail-tab]");
    if (tabButton) { detailTab = tabButton.dataset.detailTab; render(); return; }
    var startButton = event.target.closest("[data-start-counsel]");
    if (startButton) {
      try { Store.startCounsel(startButton.dataset.startCounsel, currentStaff().id, currentStaff().name); UI.showToast("상담을 시작했습니다. 고객 화면에도 반영됩니다.", "success"); }
      catch (error) { UI.showToast(error.message, "danger"); }
      return;
    }
    var completeButton = event.target.closest("[data-complete-inquiry]");
    if (completeButton) {
      try {
        Store.completeInquiry(completeButton.dataset.completeInquiry, { role: currentRole, id: currentStaff().id });
        UI.showToast("고객 해결 확인과 처리 기록 검토를 마치고 최종 완료했습니다.", "success");
      } catch (error) { UI.showToast(error.message, "danger"); }
      return;
    }
    if (event.target.closest("[data-refresh-state]")) { state = Store.getState(); render(); UI.showToast("최신 상태로 새로고침했습니다."); return; }
    if (event.target.closest("[data-reset-demo]")) {
      if (window.confirm("시연 중 변경한 내용을 지우고 최초 가상 데이터 5건으로 되돌릴까요?")) { Store.reset(); currentInquiryId = null; currentView = "dashboard"; UI.setQuery({ role: currentRole, view: null, inquiry: null }); UI.showToast("가상 데이터를 초기화했습니다.", "success"); }
    }
  });

  document.addEventListener("keydown", function (event) {
    var row = event.target.closest && event.target.closest("[data-case-row]");
    if (row && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openCase(row.dataset.caseRow, "queue"); }
  });

  document.addEventListener("input", function (event) {
    if (event.target.id !== "knowledge-query") return;
    knowledgeFilters.query = event.target.value;
    knowledgeFilters.insightId = null;
    updateKnowledgeResults();
  });

  document.addEventListener("change", function (event) {
    if (event.target.id === "knowledge-category-filter") {
      knowledgeFilters.category = event.target.value;
      knowledgeFilters.insightId = null;
      updateKnowledgeResults();
    }
    if (event.target.id === "knowledge-model-filter") {
      knowledgeFilters.model = event.target.value;
      knowledgeFilters.insightId = null;
      updateKnowledgeResults();
    }
  });

  var knowledgeDialog = document.getElementById("knowledge-metadata-dialog");
  if (knowledgeDialog) {
    knowledgeDialog.addEventListener("click", function (event) {
      if (event.target !== knowledgeDialog) return;
      var rect = knowledgeDialog.getBoundingClientRect();
      var outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) closeKnowledgeMetadata();
    });
    knowledgeDialog.addEventListener("close", function () {
      if (knowledgeDialogReturnFocus && document.contains(knowledgeDialogReturnFocus)) knowledgeDialogReturnFocus.focus();
      knowledgeDialogReturnFocus = null;
    });
  }

  document.getElementById("staff-role").addEventListener("change", function (event) {
    currentRole = event.target.value;
    if (currentRole === "ENGINEER") currentView = "visits";
    else if (currentRole === "OPERATOR") currentView = "dashboard";
    else currentView = "queue";
    detailTab = "summary";
    state = Store.getState();
    var roleInquiry = currentInquiryId && state.inquiries.find(function (item) { return item.id === currentInquiryId; });
    if (!canOpenInquiry(roleInquiry)) currentInquiryId = null;
    UI.setQuery({ role: currentRole, view: currentView, inquiry: currentInquiryId });
    render();
    initStaffMenuSearch();
    UI.showToast(roleLabel() + " 업무 화면으로 전환했습니다.");
  });

  notificationController = initStaffNotificationCenter();
  Store.subscribe(function (nextState, reason) { state = nextState; render(reason); });
  render();
  initStaffMenuSearch();
})();
