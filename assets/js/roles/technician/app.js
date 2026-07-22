(function () {
  "use strict";

  var ACTOR = { role: "TECHNICIAN", id: "STAFF-TECH-01", name: "오세훈" };
  var ALLOWED_VISIT_STATUSES = ["CONFIRMED", "IN_PROGRESS", "COMPLETED", "FOLLOW_UP_REQUIRED"];
  var state = {
    view: "list",
    selectedVisitId: null,
    taskTab: "active",
    dateFilter: "all",
    statusFilter: "all",
    busy: false,
    lastError: ""
  };

  var Store;
  var UI;
  var root;
  var toastTimer;
  var unsubscribe;

  function array(value) {
    return Array.isArray(value) ? value : [];
  }

  function escapeHTML(value) {
    if (UI && typeof UI.escape === "function") return UI.escape(value == null ? "" : String(value));
    if (UI && typeof UI.escapeHTML === "function") return UI.escapeHTML(value == null ? "" : String(value));
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function labelBy(name, value, fallbackMap) {
    if (UI && typeof UI[name] === "function") {
      try {
        var label = UI[name](value);
        if (label != null && label !== "") {
          return String(label)
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#(?:39|039);/g, "'");
        }
      } catch (error) {
        /* Use the local screen-design labels if a shared formatter rejects a new code. */
      }
    }
    return (fallbackMap && fallbackMap[value]) || value || "확인 필요";
  }

  function statusLabel(value) {
    return labelBy("statusLabel", value, {
      CONFIRMED: "방문 확정",
      IN_PROGRESS: "점검 진행 중",
      COMPLETED: "방문 완료",
      FOLLOW_UP_REQUIRED: "추가 방문 필요",
      COMPLETION_PENDING: "최종 완료 대기",
      REVISIT_REQUIRED: "추가 방문 필요",
      RESOLVED: "처리 완료"
    });
  }

  function riskLabel(value) {
    return labelBy("riskLabel", value, {
      DANGER: "위험",
      CAUTION: "주의",
      GENERAL: "일반"
    });
  }

  function usageLabel(value) {
    return labelBy("usageLabel", value, {
      NORMAL: "일반 사용 가능",
      PARTIAL_STOP: "일부 출수·기능 사용 중지",
      TOTAL_STOP: "제품 전체 사용 중지",
      PENDING_CONSULTATION: "판단 보류·상담 필요"
    });
  }

  function formatDateTime(value) {
    if (!value) return "일정 확인 필요";
    if (UI && typeof UI.formatDateTime === "function") {
      try { return UI.formatDateTime(value); } catch (error) { /* fallback below */ }
    }
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ko-KR", {
      month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function shortVisitDate(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return { date: "일정", time: "확인 필요" };
    return {
      date: new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short" }).format(date),
      time: new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)
    };
  }

  function getSnapshot() {
    return Store.getState();
  }

  function findById(items, id) {
    return array(items).find(function (item) { return item && item.id === id; }) || null;
  }

  function contextForVisit(snapshot, visit) {
    var inquiry = findById(snapshot.inquiries, visit && visit.inquiryId);
    var product = findById(snapshot.products, (inquiry && inquiry.productId) || (visit && visit.productId));
    var customer = findById(snapshot.customers, (inquiry && inquiry.customerId) || (product && product.customerId));
    return { visit: visit, inquiry: inquiry, product: product, customer: customer };
  }

  function allowedActions(context) {
    if (!context || !context.inquiry) return [];
    if (typeof Store.getAllowedActions === "function") {
      try {
        var actions = Store.getAllowedActions(context.inquiry.id, ACTOR);
        if (Array.isArray(actions)) return actions;
      } catch (error) {
        return [];
      }
    }
    var inquiry = context.inquiry;
    return Array.isArray(inquiry.allowedActions) ? inquiry.allowedActions : Array.isArray(inquiry.allowed_actions) ? inquiry.allowed_actions : [];
  }

  function canDo(context, action) {
    return allowedActions(context).indexOf(action) >= 0;
  }

  function usageView(inquiry, result) {
    var legacy = inquiry && inquiry.usageGuidance || {};
    result = result || {};
    return {
      status: result.usageGuidanceStatus || inquiry.usageGuidanceStatus || legacy.usageGuidanceStatus || result.usageStatus || legacy.usageStatus || "PENDING_CONSULTATION",
      message: result.usageGuidanceMessage || inquiry.usageGuidanceMessage || legacy.usageGuidanceMessage || legacy.message || "현재 사용 안내를 확인해 주세요.",
      restrictedWaterTypes: result.restrictedWaterTypes || inquiry.restrictedWaterTypes || legacy.restrictedWaterTypes || [],
      restrictedFunctions: result.restrictedFunctions || inquiry.restrictedFunctions || legacy.restrictedFunctions || [],
      basis: result.guidanceBasis || inquiry.guidanceBasis || legacy.guidanceBasis || result.decisionBasis || legacy.decisionBasis || "확인 필요",
      nextAction: result.nextAction || inquiry.nextAction || legacy.nextAction || "다음 행동 확인 필요",
      updatedBy: legacy.updatedBy || inquiry.usageGuidanceUpdatedBy,
      updatedAt: legacy.updatedAt || inquiry.usageGuidanceUpdatedAt
    };
  }

  function careSchedule(product) {
    return product && product.careSchedule || {};
  }

  function assignedTechnicianId(visit, inquiry) {
    return (visit && (visit.technicianId || visit.assignedTechnicianId || visit.staffId)) ||
      (inquiry && inquiry.assignedTechnicianId) || "";
  }

  function isAssigned(context) {
    return assignedTechnicianId(context.visit, context.inquiry) === ACTOR.id;
  }

  function isAllowedVisit(visit) {
    return visit && ALLOWED_VISIT_STATUSES.indexOf(visit.status) >= 0;
  }

  function feedbackResolved(inquiry) {
    var feedback = inquiry && inquiry.resolutionFeedback;
    return feedback === "RESOLVED" || feedback === "YES" || feedback === true || Boolean(feedback && feedback.resolved === true);
  }

  function isFinalPending(context) {
    return Boolean(
      context.inquiry &&
      context.inquiry.status === "COMPLETION_PENDING" &&
      feedbackResolved(context.inquiry) &&
      context.visit &&
      context.visit.status === "COMPLETED"
    );
  }

  function selectedContext(snapshot) {
    var visit = findById(snapshot.visits, state.selectedVisitId);
    return visit ? contextForVisit(snapshot, visit) : null;
  }

  function visitTimestamp(visit) {
    return visit && (visit.confirmedAt || visit.scheduledAt || visit.desiredAt || visit.startedAt || visit.updatedAt);
  }

  function inDateFilter(visit) {
    if (state.dateFilter === "all") return true;
    var date = new Date(visitTimestamp(visit));
    if (Number.isNaN(date.getTime())) return false;
    var now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var end = new Date(start);
    if (state.dateFilter === "today") end.setDate(end.getDate() + 1);
    else if (state.dateFilter === "week") end.setDate(end.getDate() + 8);
    else return true;
    return date >= start && date < end;
  }

  function dangerWeight(context) {
    var topic = (context.inquiry && context.inquiry.topicCode) || "";
    if (topic === "symptom_leak") return 0;
    if (topic === "symptom_hot_water_safety") return 1;
    if (context.inquiry && context.inquiry.riskLevel === "DANGER") return 2;
    if (context.inquiry && context.inquiry.riskLevel === "CAUTION") return 3;
    return 4;
  }

  function assignedContexts(snapshot) {
    return array(snapshot.visits)
      .map(function (visit) { return contextForVisit(snapshot, visit); })
      .filter(function (context) { return isAssigned(context) && isAllowedVisit(context.visit); })
      .sort(function (a, b) {
        var danger = dangerWeight(a) - dangerWeight(b);
        if (danger) return danger;
        return new Date(visitTimestamp(a.visit)).getTime() - new Date(visitTimestamp(b.visit)).getTime();
      });
  }

  function visibleContexts(snapshot) {
    return assignedContexts(snapshot).filter(function (context) {
      if (state.taskTab === "final" && !isFinalPending(context)) return false;
      if (state.taskTab === "active" && isFinalPending(context)) return false;
      if (state.statusFilter !== "all" && context.visit.status !== state.statusFilter) return false;
      return inDateFilter(context.visit);
    });
  }

  function riskBadge(risk) {
    var modifier = risk === "DANGER" ? "danger" : risk === "CAUTION" ? "caution" : "success";
    return '<span class="badge badge--' + modifier + '">' + escapeHTML(riskLabel(risk)) + "</span>";
  }

  function statusBadge(code) {
    var modifier = code === "COMPLETED" ? "success" : code === "IN_PROGRESS" ? "blue" : code === "FOLLOW_UP_REQUIRED" ? "caution" : "";
    return '<span class="badge' + (modifier ? " badge--" + modifier : "") + '">' + escapeHTML(statusLabel(code)) + "</span>";
  }

  function syntheticBadge(context) {
    return context.customer && context.customer.synthetic
      ? '<span class="badge badge--synthetic">시연용 합성 데이터</span>' : "";
  }

  function renderPageHeader(screenId, eyebrow, title, lead) {
    return '<header class="page-header">' +
      '<div><p class="eyebrow">' + escapeHTML(eyebrow) + '</p><h1>' + escapeHTML(title) + '</h1><p class="lead">' + escapeHTML(lead) + '</p></div>' +
      '<span class="screen-id">' + escapeHTML(screenId) + '</span>' +
    '</header>';
  }

  function renderList(snapshot) {
    var all = assignedContexts(snapshot);
    var visible = visibleContexts(snapshot);
    var activeCount = all.filter(function (context) { return !isFinalPending(context) && context.visit.status !== "COMPLETED"; }).length;
    var dangerCount = all.filter(function (context) { return context.inquiry && context.inquiry.riskLevel === "DANGER" && context.visit.status !== "COMPLETED"; }).length;
    var finalCount = all.filter(isFinalPending).length;

    return renderPageHeader("TECH-01", "MY FIELD WORK", "오늘의 방문 업무", "오세훈 기사에게 배정된 확정·진행 업무와 최종 완료 대기 건입니다.") +
      '<section class="summary-strip" aria-label="방문 업무 요약">' +
        '<article class="summary-card"><small>진행할 방문</small><strong>' + activeCount + '</strong></article>' +
        '<article class="summary-card is-danger"><small>위험 우선 점검</small><strong>' + dangerCount + '</strong></article>' +
        '<article class="summary-card is-pending"><small>최종 완료 대기</small><strong>' + finalCount + '</strong></article>' +
      '</section>' +
      '<section class="filter-panel" aria-labelledby="filter-title">' +
        '<div class="segmented" role="tablist" aria-label="방문 업무 구분">' +
          '<button type="button" role="tab" data-task-tab="active" class="' + (state.taskTab === "active" ? "is-active" : "") + '" aria-selected="' + (state.taskTab === "active") + '">확정·진행 업무</button>' +
          '<button type="button" role="tab" data-task-tab="final" class="' + (state.taskTab === "final" ? "is-active" : "") + '" aria-selected="' + (state.taskTab === "final") + '">최종 완료 대기 ' + finalCount + '</button>' +
        '</div>' +
        '<div class="filter-panel-header"><h2 id="filter-title">업무 필터</h2><button class="filter-reset" type="button" data-action="reset-filter">초기화</button></div>' +
        '<div class="filter-grid">' +
          '<div class="filter-field"><label for="visit-date-filter">방문 날짜</label><select id="visit-date-filter" data-filter="date"><option value="all"' + selected("all", state.dateFilter) + '>전체 일정</option><option value="today"' + selected("today", state.dateFilter) + '>오늘</option><option value="week"' + selected("week", state.dateFilter) + '>앞으로 7일</option></select></div>' +
          '<div class="filter-field"><label for="visit-status-filter">방문 상태</label><select id="visit-status-filter" data-filter="status"><option value="all"' + selected("all", state.statusFilter) + '>전체 상태</option><option value="CONFIRMED"' + selected("CONFIRMED", state.statusFilter) + '>방문 확정</option><option value="IN_PROGRESS"' + selected("IN_PROGRESS", state.statusFilter) + '>점검 진행 중</option><option value="COMPLETED"' + selected("COMPLETED", state.statusFilter) + '>방문 완료</option><option value="FOLLOW_UP_REQUIRED"' + selected("FOLLOW_UP_REQUIRED", state.statusFilter) + '>추가 방문 필요</option></select></div>' +
        '</div>' +
      '</section>' +
      '<div class="list-heading"><h2>' + (state.taskTab === "final" ? "최종 확인할 문의" : "배정된 방문") + '</h2><span>총 ' + visible.length + '건</span></div>' +
      (visible.length ? '<section class="visit-list" aria-label="방문 업무 목록">' + visible.map(renderVisitCard).join("") + '</section>' : renderEmptyList());
  }

  function selected(value, current) {
    return value === current ? " selected" : "";
  }

  function renderVisitCard(context) {
    var visit = context.visit;
    var inquiry = context.inquiry || {};
    var product = context.product || {};
    var customer = context.customer || {};
    var date = shortVisitDate(visitTimestamp(visit));
    var cardClass = inquiry.riskLevel === "DANGER" ? " is-danger" : isFinalPending(context) ? " is-pending" : "";
    var buttonLabel = isFinalPending(context) ? "최종 확인" : visit.status === "IN_PROGRESS" ? "결과 입력" : visit.status === "COMPLETED" ? "결과 보기" : "사전 점검";
    var nextView = visit.status === "IN_PROGRESS" || visit.status === "COMPLETED" || visit.status === "FOLLOW_UP_REQUIRED" ? "result" : "detail";

    return '<article class="visit-card' + cardClass + '">' +
      '<div class="visit-time"><strong>' + escapeHTML(date.time) + '</strong><small>' + escapeHTML(date.date) + '</small></div>' +
      '<div class="visit-content">' +
        '<div class="visit-meta">' + syntheticBadge(context) + riskBadge(inquiry.riskLevel) + statusBadge(visit.status) + (inquiry.requiresConsultation ? '<span class="badge badge--caution">상담 필수</span>' : "") + '</div>' +
        '<h3>' + escapeHTML(inquiry.symptomLabel || "증상 확인 필요") + ' · ' + escapeHTML(customer.name || customer.id || "고객 확인 필요") + '</h3>' +
        '<p>' + escapeHTML(product.productCode || "제품 확인 필요") + ' · ' + escapeHTML(inquiry.description || "고객 증상 원문이 없습니다.") + '</p>' +
      '</div>' +
      '<button class="open-visit" type="button" data-action="open-visit" data-visit-id="' + escapeHTML(visit.id) + '" data-next-view="' + nextView + '">' + buttonLabel + '</button>' +
    '</article>';
  }

  function renderEmptyList() {
    return '<section class="empty-state"><span class="empty-state-icon" aria-hidden="true">✓</span><h2>조건에 맞는 방문 업무가 없습니다</h2><p>날짜·상태 필터를 바꾸거나 최종 완료 대기 탭을 확인해 주세요.</p><button class="button button--secondary" type="button" data-action="reset-filter">필터 초기화</button></section>';
  }

  function renderBackButton() {
    return '<button class="breadcrumb-back" type="button" data-action="back-list"><span aria-hidden="true">←</span> 방문 업무 목록</button>';
  }

  function renderContextBanner(context) {
    var inquiry = context.inquiry || {};
    var visit = context.visit;
    return '<section class="context-banner" aria-label="선택한 방문 업무">' +
      '<div><strong>' + escapeHTML(inquiry.symptomLabel || "증상 확인 필요") + '</strong><p>' + escapeHTML(formatDateTime(visitTimestamp(visit))) + ' · ' + escapeHTML(inquiry.id || "문의 ID 없음") + '</p></div>' +
      '<div class="visit-meta">' + riskBadge(inquiry.riskLevel) + statusBadge(visit.status) + '</div>' +
    '</section>';
  }

  function renderNoSelection(screenId, title) {
    return renderPageHeader(screenId, "FIELD CARE", title, "업무 목록에서 방문 건을 먼저 선택해 주세요.") +
      '<section class="empty-state"><span class="empty-state-icon" aria-hidden="true">◇</span><h2>선택된 방문이 없습니다</h2><p>본인에게 배정된 방문 업무를 선택하면 고객 정보와 공식 점검 근거를 확인할 수 있습니다.</p><button class="button button--primary" type="button" data-action="back-list">업무 목록 보기</button></section>';
  }

  function renderUnauthorized() {
    return '<section class="error-state"><span class="error-state-icon" aria-hidden="true">!</span><h2>이 방문 업무에 접근할 수 없습니다</h2><p>현재 로그인한 기사에게 배정되고 방문이 확정된 업무만 확인할 수 있습니다.</p><button class="button button--secondary" type="button" data-action="back-list">내 업무로 돌아가기</button></section>';
  }

  function renderDetail(snapshot) {
    var context = selectedContext(snapshot);
    if (!context) return renderNoSelection("TECH-02", "방문 상세·사전 점검");
    if (!isAssigned(context) || !isAllowedVisit(context.visit)) return renderUnauthorized();

    var inquiry = context.inquiry || {};
    var product = context.product || {};
    var customer = context.customer || {};
    var visit = context.visit;
    var schedule = careSchedule(product);
    var evidences = evidenceForInquiry(snapshot, inquiry);
    var priorities = inspectionPriorities(inquiry);
    var prohibited = prohibitedActions(inquiry);
    var checks = reconfirmChecks(inquiry, product);
    var canStart = canDo(context, "START_VISIT") && hasConfirmedPrevisitReport(context);

    return renderBackButton() +
      renderPageHeader("TECH-02", "PRE-VISIT REPORT", "방문 상세·사전 점검", "고객에게 다시 묻지 않도록 상담 인계와 공식 근거를 현장 도착 전에 확인합니다.") +
      renderContextBanner(context) +
      '<div class="detail-grid">' +
        '<div class="detail-column">' +
          '<section class="section-card" aria-labelledby="identity-title">' +
            '<div class="section-heading"><div><h2 id="identity-title">고객·계약·제품 식별</h2><p>현장 도착 전 대상 고객과 제품을 대조하세요.</p></div>' + syntheticBadge(context) + '</div>' +
            '<div class="identity-grid">' +
              identityItem("고객", customer.name || "확인 필요") + identityItem("고객 ID", customer.id || inquiry.customerId) +
              identityItem("구독 ID", product.subscriptionId || customer.subscriptionId || "확인 필요") + identityItem("문의 ID", inquiry.id) +
              identityItem("판매 상품 코드", product.productCode || "확인 필요") + identityItem("공식 매뉴얼 모델", product.manualModel || "확인 필요") +
              identityItem("관리 유형", product.managementLabel || product.managementType || "확인 필요") + identityItem("사용 시작일", formatDateTime(product.serviceStartDate || product.installedAt)) +
              identityItem("최근 관리일", formatDateTime(product.lastCareDate || product.lastCareAt)) + identityItem("최근 필터·카트리지 교체일", formatDateTime(product.lastFilterReplacementDate || product.lastFilterChangedAt)) +
              identityItem("다음 케어 예정일", schedule.nextCareDate || schedule.nextCareAt ? formatDateTime(schedule.nextCareDate || schedule.nextCareAt) : "확인 필요") + identityItem("다음 케어 기준", schedule.nextCareBasis || schedule.sourceType || schedule.note || "기준 미확정") +
            '</div>' +
          '</section>' +
          '<section class="section-card" aria-labelledby="symptom-title">' +
            '<div class="section-heading"><div><h2 id="symptom-title">증상·문진·추가 답변</h2><p>AI 예상 원인이 아닌 고객이 제출한 원문과 확인 정보입니다.</p></div>' + riskBadge(inquiry.riskLevel) + '</div>' +
            '<blockquote class="quote-box">“' + escapeHTML(inquiry.description || "고객 증상 원문이 없습니다.") + '”</blockquote>' +
            '<dl class="data-list">' +
              dataRow("시나리오", (inquiry.scenarioId || "-") + " · " + (inquiry.symptomLabel || "-")) +
              dataRow("발생 조건", inquiry.conditions || "추가 확인 필요") +
              dataRow("표시 문구", inquiry.displayCode || "표시 문구 없음") +
              dataRow("문진 답변", formatAnswers(inquiry.answers)) +
              dataRow("추가 답변", formatAdditionalAnswers(inquiry)) +
            '</dl>' +
          '</section>' +
          renderSafetySection(inquiry) +
          renderAiCounselHandoff(inquiry, visit) +
          renderPrevisitReport(context) +
        '</div>' +
        '<div class="detail-column">' +
          '<section class="section-card" aria-labelledby="priority-title">' +
            '<div class="section-heading"><div><h2 id="priority-title">현장 점검 우선순위</h2><p>위험 안내를 유지한 상태로 순서대로 확인합니다.</p></div></div>' +
            '<ol class="priority-list">' + priorities.map(function (item) { return '<li>' + escapeHTML(item) + '</li>'; }).join("") + '</ol>' +
            '<h3 class="safety-title" style="margin-top:18px;font-size:14px;">금지 행동</h3>' +
            '<ul class="prohibited-list">' + prohibited.map(function (item) { return '<li>' + escapeHTML(item) + '</li>'; }).join("") + '</ul>' +
          '</section>' +
          '<section class="section-card" aria-labelledby="evidence-title">' +
            '<div class="section-heading"><div><h2 id="evidence-title">공식 점검 근거</h2><p>백엔드 EvidenceCardDTO로 전달된 검증 근거만 표시합니다.</p></div><span class="badge ' + (evidences.length ? 'badge--success">검증 완료' : 'badge--caution">근거 확인 필요') + '</span></div>' +
            '<div class="evidence-stack">' + (evidences.length ? evidences.map(renderEvidence).join("") : renderNoEvidence()) + '</div>' +
          '</section>' +
          '<form id="start-visit-form" class="section-card" data-form="start-visit">' +
            '<div class="section-heading"><div><h2>현장 재확인</h2><p>고객·제품·안전 상태를 직접 확인한 후 점검을 시작하세요.</p></div></div>' +
            '<div class="check-list">' + checks.map(function (check) {
              return '<label class="check-row"><input type="checkbox" name="reconfirmed" value="' + escapeHTML(check.code) + '"' + (visit.reconfirmed ? " checked" : "") + (canStart ? "" : " disabled") + ' required><span>' + escapeHTML(check.label) + '</span></label>';
            }).join("") + '</div>' +
            (canStart
              ? '<div class="action-bar"><div class="action-note"><strong>점검 시작 전 최종 확인</strong>시작 후 방문 상태가 ‘점검 진행 중’으로 바뀝니다.</div><button class="button button--primary" type="submit"' + (state.busy ? " disabled" : "") + '>점검 시작</button></div>'
              : visit.status === "CONFIRMED"
                ? '<div class="action-bar"><div class="action-note"><strong>사전 리포트 확정 필요</strong>기사 사전 점검 리포트를 검토·확정하면 점검을 시작할 수 있습니다.</div></div>'
                : '<div class="action-bar"><div class="action-note"><strong>' + escapeHTML(statusLabel(visit.status)) + '</strong>' + (visit.status === "IN_PROGRESS" ? "현장 점검 결과를 입력해 주세요." : "등록된 방문 결과를 확인할 수 있습니다.") + '</div><button class="button button--primary" type="button" data-action="go-result">' + (visit.status === "IN_PROGRESS" ? "결과 입력" : "결과 보기") + '</button></div>') +
          '</form>' +
        '</div>' +
      '</div>';
  }

  function identityItem(label, value) {
    return '<div class="identity-item"><small>' + escapeHTML(label) + '</small><strong>' + escapeHTML(value || "확인 필요") + '</strong></div>';
  }

  function dataRow(term, description) {
    return '<div class="data-row"><dt>' + escapeHTML(term) + '</dt><dd>' + escapeHTML(description || "확인 필요") + '</dd></div>';
  }

  function formatAnswers(answers) {
    if (!answers || typeof answers !== "object" || !Object.keys(answers).length) return "등록된 문진 답변 없음";
    return Object.keys(answers).map(function (key) {
      var value = Array.isArray(answers[key]) ? answers[key].join(", ") : answers[key];
      return key + ": " + value;
    }).join(" · ");
  }

  function formatAdditionalAnswers(inquiry) {
    if (Array.isArray(inquiry.additionalAnswers) && inquiry.additionalAnswers.length) {
      return inquiry.additionalAnswers.map(function (answer) { return answer.question + ": " + answer.answer; }).join(" · ");
    }
    if (inquiry.missingFields && inquiry.missingFields.length) return "확인 필요: " + inquiry.missingFields.join(", ");
    return "추가 확인 항목 없음";
  }

  function safeActionText(actions) {
    if (!actions) return ["고객 안전조치 기록 없음"];
    var result = [];
    if (actions.waterValveClosed) result.push("원수 밸브 잠금 완료");
    if (actions.powerDisconnected) result.push("전원 플러그 분리 완료");
    if (actions.drinkingStopped) result.push("출수된 물 음용 중지 완료");
    return result.length ? result : ["완료된 안전조치가 없습니다"];
  }

  function renderSafetySection(inquiry) {
    var isDanger = inquiry.riskLevel === "DANGER";
    var actions = safeActionText(inquiry.safeActions);
    return '<section class="section-card' + (isDanger ? " safety-card" : "") + '" aria-labelledby="safety-title">' +
      '<div class="section-heading"><div><h2 id="safety-title" class="safety-title"><span class="safety-icon" aria-hidden="true">!</span>고객 안전조치</h2><p>결과 저장 전까지 현재 위험 안내를 유지합니다.</p></div>' + riskBadge(inquiry.riskLevel) + '</div>' +
      '<ul class="safety-list">' + actions.map(function (item) { return '<li>' + escapeHTML(item) + '</li>'; }).join("") + '</ul>' +
    '</section>';
  }

  function counselSummary(inquiry) {
    var record = inquiry.counselRecord;
    if (record) return [record.outcome, record.note].filter(Boolean).join(" · ") || "상담 완료";
    var timeline = array(inquiry.timeline).slice().reverse().find(function (item) {
      return /CONSULT|VISIT_NEEDED|CONFIRM_VISIT/.test(item.event || "");
    });
    return timeline ? timeline.label : "상담 인계 기록 확인 필요";
  }

  function aiRevisionText(inquiry) {
    var revision = inquiry && inquiry.aiSummaryRevision;
    if (!revision) return "상담사 수정본 없음 · AI 원본 요약을 유지합니다.";
    if (typeof revision === "string") return revision;
    return revision.text || revision.summary || "상담사 수정본 내용 확인 필요";
  }

  function confirmedCounselSummary(inquiry) {
    var confirmed = inquiry && (inquiry.confirmedConsultationSummary || inquiry.confirmed_consultation_summary || inquiry.consultationSummaryConfirmed);
    if (!confirmed) return null;
    if (typeof confirmed === "string") return { text: confirmed, confirmedBy: inquiry.summaryConfirmedBy, confirmedAt: inquiry.summaryConfirmedAt };
    return {
      text: confirmed.text || confirmed.summary || confirmed.value || "",
      confirmedBy: confirmed.confirmedBy || confirmed.confirmed_by || inquiry.summaryConfirmedBy,
      confirmedAt: confirmed.confirmedAt || confirmed.confirmed_at || inquiry.summaryConfirmedAt
    };
  }

  function reportRecord(value) {
    if (!value) return null;
    if (typeof value === "string") return { text: value };
    return {
      text: value.text || value.summary || value.value || "",
      editedBy: value.editedBy || value.updatedBy,
      editedAt: value.editedAt || value.updatedAt,
      confirmedBy: value.confirmedBy || value.confirmed_by,
      confirmedAt: value.confirmedAt || value.confirmed_at
    };
  }

  function confirmedPrevisitReport(context) {
    var inquiry = context && context.inquiry || {};
    var visit = context && context.visit || {};
    var confirmed = reportRecord(visit.confirmedPrevisitReport || inquiry.confirmedPrevisitReport || inquiry.confirmed_previsit_report);
    if (!confirmed) return null;
    confirmed.confirmedBy = confirmed.confirmedBy || visit.previsitReportConfirmedBy || inquiry.previsitReportConfirmedBy || inquiry.previsit_report_confirmed_by;
    confirmed.confirmedAt = confirmed.confirmedAt || visit.previsitReportConfirmedAt || inquiry.previsitReportConfirmedAt || inquiry.previsit_report_confirmed_at;
    return confirmed;
  }

  function hasConfirmedPrevisitReport(context) {
    var confirmed = confirmedPrevisitReport(context);
    return Boolean(confirmed && String(confirmed.text || "").trim());
  }

  function previsitDraft(context) {
    var inquiry = context.inquiry || {};
    var visit = context.visit || {};
    return reportRecord(visit.aiPrevisitReport || inquiry.aiPrevisitReport || inquiry.ai_previsit_report) || {
      text: ["방문 목적: " + (visit.visitReason || inquiry.symptomLabel || "증상 확인"), "고객 증상: " + (inquiry.description || "원문 확인 필요"), "안전 유의: " + (visit.safetyNotes || "현재 사용 안내 확인")].join("\n")
    };
  }

  function renderPrevisitReport(context) {
    var inquiry = context.inquiry || {};
    var visit = context.visit || {};
    var draft = previsitDraft(context);
    var revision = reportRecord(visit.previsitReportRevision || inquiry.previsitReportRevision || inquiry.previsit_report_revision);
    var confirmed = confirmedPrevisitReport(context);
    var canUpdate = canDo(context, "UPDATE_PREVISIT_REPORT");
    var canConfirm = canDo(context, "CONFIRM_PREVISIT_REPORT");
    var editable = revision && revision.text || confirmed && confirmed.text || draft.text;
    return '<section class="section-card" aria-labelledby="previsit-report-title">' +
      '<div class="section-heading"><div><h2 id="previsit-report-title">AI 기사 사전 점검 리포트</h2><p>실제 고장 원인이 아닌 방문 준비용 초안이며 담당 기사가 검토·확정합니다.</p></div><span class="badge badge--blue">AI 초안</span></div>' +
      '<blockquote class="quote-box">“' + escapeHTML(draft.text) + '”</blockquote>' +
      (revision ? '<div class="report-version"><strong>기사 수정본 · 미확정</strong><p>' + escapeHTML(revision.text) + '</p><small>' + escapeHTML((revision.editedBy || "담당 기사") + " · " + formatDateTime(revision.editedAt)) + '</small></div>' : '<div class="source-fallback">기사 수정본이 없습니다. AI 초안을 그대로 확정하거나 현장 준비 정보를 보완하세요.</div>') +
      (confirmed ? '<div class="report-version is-confirmed"><strong>기사 확정본</strong><p>' + escapeHTML(confirmed.text) + '</p><small>' + escapeHTML((confirmed.confirmedBy || "담당 기사") + " · " + formatDateTime(confirmed.confirmedAt)) + '</small></div>' : '<div class="source-fallback">점검 시작 전 사전 리포트 확정이 필요합니다.</div>') +
      ((canUpdate || canConfirm) ? '<form data-form="previsit-report" data-visit-id="' + escapeHTML(visit.id) + '"><div class="form-field form-field--full"><label for="previsit-report-text">기사 검토 리포트</label><textarea id="previsit-report-text" name="previsitReportText" maxlength="2000">' + escapeHTML(editable) + '</textarea></div><div class="action-bar"><div class="action-note"><strong>상태 유지 명령</strong>수정·확정은 문의·방문 상태를 변경하지 않습니다.</div><div class="inline-actions">' + (canUpdate ? '<button class="button button--secondary" type="submit" value="UPDATE_PREVISIT_REPORT">수정본 저장</button>' : "") + (canConfirm ? '<button class="button button--primary" type="submit" value="CONFIRM_PREVISIT_REPORT">사전 리포트 확정</button>' : "") + '</div></div><p class="form-error" data-form-error hidden></p></form>' : '<div class="action-note"><strong>조회 전용</strong>현재 담당자와 상태에서 허용된 리포트 작업이 없습니다.</div>') +
    '</section>';
  }

  function renderAiCounselHandoff(inquiry, visit) {
    var process = inquiry.aiProcess || {};
    var retrieval = process.retrieval || {};
    var revision = inquiry.aiSummaryRevision;
    var confirmed = confirmedCounselSummary(inquiry);
    var record = inquiry.counselRecord || {};
    var guidance = usageView(inquiry);
    var restrictedWater = array(guidance.restrictedWaterTypes).join(", ") || "제한 없음";
    var restrictedFunctions = array(guidance.restrictedFunctions).join(", ") || "제한 없음";
    var revisionEditor = revision && typeof revision === "object" ? (revision.editedBy || revision.updatedBy || "상담사") : "-";
    var revisionAt = revision && typeof revision === "object" ? (revision.editedAt || revision.updatedAt) : null;

    return '<section class="section-card" aria-labelledby="ai-original-title">' +
        '<div class="section-heading"><div><h2 id="ai-original-title">AI 원본 요약</h2><p>상담사 수정 전 생성된 원문으로, 현장 판단의 참고 정보입니다.</p></div><span class="badge badge--blue">원본 보존</span></div>' +
        '<blockquote class="quote-box">“' + escapeHTML(inquiry.aiSummaryOriginal || "등록된 AI 원본 요약이 없습니다.") + '”</blockquote>' +
        '<dl class="data-list">' +
          dataRow("AI 처리 결과", inquiry.aiOutcome || inquiry.aiState || "확인 필요") +
          dataRow("처리 모드", process.mode || "확인 필요") +
          dataRow("근거 검색", retrieval.verified === true ? "검증 근거 " + String(retrieval.resultCount || 0) + "건" : retrieval.verified === false ? "검증 근거 없음" : "검색 기록 확인 필요") +
        '</dl>' +
      '</section>' +
      '<section class="section-card" aria-labelledby="counsel-revision-title">' +
        '<div class="section-heading"><div><h2 id="counsel-revision-title">상담사 확정 요약</h2><p>확정본을 우선 표시하며 없을 때만 수정본·AI 원본을 참고합니다.</p></div>' + (confirmed ? '<span class="badge badge--success">확정본</span>' : revision ? '<span class="badge badge--caution">미확정 수정본</span>' : '<span class="badge badge--caution">원본 유지</span>') + '</div>' +
        '<blockquote class="quote-box">“' + escapeHTML(confirmed && confirmed.text || aiRevisionText(inquiry)) + '”</blockquote>' +
        '<dl class="data-list">' +
          dataRow(confirmed ? "확정 담당" : "수정 담당", confirmed && confirmed.confirmedBy || revisionEditor) +
          dataRow(confirmed ? "확정 시각" : "수정 시각", confirmed && confirmed.confirmedAt ? formatDateTime(confirmed.confirmedAt) : revisionAt ? formatDateTime(revisionAt) : "확정·수정 이력 없음") +
        '</dl>' +
      '</section>' +
      '<section class="section-card" aria-labelledby="counsel-handoff-title">' +
        '<div class="section-heading"><div><h2 id="counsel-handoff-title">상담사 방문 인계</h2><p>상담 판단과 현장 확인 요청을 독립된 인계 정보로 확인합니다.</p></div></div>' +
        '<dl class="data-list">' +
          dataRow("상담 결과", record.outcome || counselSummary(inquiry)) +
          dataRow("상담 기록", record.note || "상담 기록 확인 필요") +
          dataRow("인계 담당", record.completedBy || record.updatedBy || "담당 상담사 확인 필요") +
          dataRow("인계 시각", record.completedAt || record.updatedAt ? formatDateTime(record.completedAt || record.updatedAt) : "인계 시각 확인 필요") +
          dataRow("방문 메모", visit.notes || "별도 메모 없음") +
          dataRow("안전 메모", visit.safetyNotes || "별도 안전 메모 없음") +
        '</dl>' +
      '</section>' +
      '<section class="section-card" aria-labelledby="usage-guidance-title">' +
        '<div class="section-heading"><div><h2 id="usage-guidance-title">현재 사용 안내</h2><p>상담 이후에도 현장에서 유지해야 할 출수·기능 제한입니다.</p></div></div>' +
        '<dl class="data-list">' +
          dataRow("사용 상태", usageLabel(guidance.status)) +
          dataRow("고객 표시 안내", guidance.message) +
          dataRow("제한 출수", restrictedWater) +
          dataRow("제한 기능", restrictedFunctions) +
          dataRow("판단 근거", guidance.basis) +
          dataRow("고객의 다음 행동", guidance.nextAction) +
          dataRow("최종 변경", [guidance.updatedBy, guidance.updatedAt ? formatDateTime(guidance.updatedAt) : ""].filter(Boolean).join(" · ") || "변경 이력 없음") +
        '</dl>' +
      '</section>';
  }

  function inspectionPriorities(inquiry) {
    if (inquiry.topicCode === "symptom_leak") {
      return ["원수 밸브 잠금과 전원 분리 상태 재확인", "제품 하부·연결 호스의 실제 누수 위치 확인", "누수 범위와 주변 전기부 접촉 여부 확인", "공식 근거와 현장 원인을 구분해 기록"];
    }
    if (inquiry.topicCode === "symptom_hot_water_safety") {
      return ["출수된 물 음용 중지 상태 재확인", "화면 경고 문구와 재현 조건 확인", "전원·온수 잠금·외관 상태 점검", "전기 계통을 분해하지 않고 결과 기록"];
    }
    if (inquiry.topicCode === "symptom_cold_temperature") {
      return ["연속 출수량과 냉각 대기 시간 확인", "냉수 잠금과 220V 전원 상태 확인", "방열 공간과 먼지 필터 외관 확인", "2시간 경과 후 온도 상태 기록"];
    }
    return ["고객이 제출한 증상과 현장 증상 일치 여부 확인", "제품 코드·설치 상태·필터 주기 확인", "공식 매뉴얼 순서에 따라 외관 점검", "AI 예상 원인과 실제 원인을 분리해 기록"];
  }

  function prohibitedActions(inquiry) {
    var common = ["제품 내부나 급수·전기 계통 임의 분해", "공식 근거 없이 수질·음용 안전을 보증"];
    if (inquiry.topicCode === "symptom_hot_water_safety") common.unshift("히터·전기 계통 직접 수리");
    if (inquiry.topicCode === "symptom_leak") common.unshift("원수 밸브를 연 상태에서 누수부 분해");
    return common;
  }

  function reconfirmChecks(inquiry, product) {
    var checks = [
      { code: "CUSTOMER_PRODUCT_MATCH", label: "고객·제품·문의 ID가 현장 대상과 일치합니다." },
      { code: "MODEL_MATCH", label: (product.productCode || "제품 코드") + " / " + (product.manualModel || "매뉴얼 모델") + "을 확인했습니다." },
      { code: "SYMPTOM_RECONFIRMED", label: "고객 증상 원문과 현재 현장 증상을 다시 확인했습니다." }
    ];
    if (inquiry.riskLevel === "DANGER") {
      checks.push({ code: "SAFETY_RECONFIRMED", label: "원수 밸브·전원·음용 중지 등 안전조치 상태를 직접 재확인했습니다." });
    } else {
      checks.push({ code: "GUIDANCE_RECONFIRMED", label: "현재 사용 안내와 제한 기능을 고객과 재확인했습니다." });
    }
    return checks;
  }

  function evidenceForInquiry(snapshot, inquiry) {
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

  function evidenceValue(evidence, camel, snake) {
    return evidence[camel] != null ? evidence[camel] : evidence[snake];
  }

  function verifiedEvidence(evidence) {
    var status = String(evidenceValue(evidence, "verificationStatus", "verification_status") || "");
    return status === "OFFICIAL_VERIFIED" || status === "text_and_visual_verified" || /^live_official_page_verified/.test(status);
  }

  function evidenceMetadataText(value) {
    if (value == null || value === "") return "-";
    if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
    if (typeof value === "object") {
      try { return JSON.stringify(value); } catch (error) { return String(value); }
    }
    return String(value);
  }

  function renderEvidenceMetadata(evidence) {
    var fields = [
      ["evidence_id", evidenceValue(evidence, "evidenceId", "evidence_id")],
      ["chunk_id", evidenceValue(evidence, "chunkId", "chunk_id")],
      ["document_id", evidenceValue(evidence, "documentId", "document_id")],
      ["document_title", evidenceValue(evidence, "documentTitle", "document_title")],
      ["document_version", evidenceValue(evidence, "documentVersion", "document_version")],
      ["page_refs", evidenceValue(evidence, "pageRefs", "page_refs")],
      ["section_title", evidenceValue(evidence, "sectionTitle", "section_title")],
      ["evidence_summary", evidenceValue(evidence, "evidenceSummary", "evidence_summary")],
      ["verification_status", evidenceValue(evidence, "verificationStatus", "verification_status")],
      ["source_type", evidenceValue(evidence, "sourceType", "source_type")],
      ["provider", evidence.provider],
      ["data_classification", evidenceValue(evidence, "dataClassification", "data_classification")],
      ["source_landing_url", evidenceValue(evidence, "sourceLandingUrl", "source_landing_url")],
      ["source_direct_download_url", evidenceValue(evidence, "sourceDirectDownloadUrl", "source_direct_download_url")],
      ["product_generation", evidenceValue(evidence, "productGeneration", "product_generation")],
      ["product_code", evidenceValue(evidence, "productCode", "product_code")],
      ["model_family", evidenceValue(evidence, "modelFamily", "model_family")],
      ["manual_model", evidenceValue(evidence, "manualModel", "manual_model")],
      ["scope_role", evidenceValue(evidence, "scopeRole", "scope_role")],
      ["risk_level", evidenceValue(evidence, "riskLevel", "risk_level")],
      ["requires_consultation", evidenceValue(evidence, "requiresConsultation", "requires_consultation")],
      ["safe_actions", evidenceValue(evidence, "safeActions", "safe_actions")],
      ["escalation_conditions", evidenceValue(evidence, "escalationConditions", "escalation_conditions")],
      ["prohibited_actions", evidenceValue(evidence, "prohibitedActions", "prohibited_actions")]
    ];
    return '<details class="evidence-metadata" open><summary>EvidenceCardDTO 전체 메타데이터</summary><dl class="data-list">' +
      fields.map(function (field) { return dataRow(field[0], evidenceMetadataText(field[1])); }).join("") +
      '</dl></details>';
  }

  function renderEvidence(evidence) {
    if (UI && typeof UI.evidenceCard === "function") {
      try {
        var shared = UI.evidenceCard(evidence, { role: "TECHNICIAN", showInternal: true, allowPdf: verifiedEvidence(evidence) });
        if (typeof shared === "string" && shared.trim()) {
          var sharedId = evidenceValue(evidence, "evidenceId", "evidence_id") || "근거 ID 없음";
          var sharedLanding = evidenceValue(evidence, "sourceLandingUrl", "source_landing_url") || "";
          return '<div class="evidence-adapter" data-evidence-id="' + escapeHTML(sharedId) + '" data-landing-url="' + escapeHTML(sharedLanding) + '">' + shared + renderEvidenceMetadata(evidence) + '<div class="source-fallback" data-source-fallback="' + escapeHTML(sharedId) + '" hidden>공식 검색 화면에서 문서를 확인해주세요.</div></div>';
        }
      } catch (error) {
        /* The local renderer below preserves the fixed DTO and source-button rules. */
      }
    }

    var id = evidenceValue(evidence, "evidenceId", "evidence_id") || "근거 ID 없음";
    var title = evidenceValue(evidence, "documentTitle", "document_title") || "공식 문서";
    var version = evidenceValue(evidence, "documentVersion", "document_version") || "버전 확인 필요";
    var pages = evidenceValue(evidence, "pageRefs", "page_refs");
    var summary = evidenceValue(evidence, "evidenceSummary", "evidence_summary") || "요약 정보가 없습니다.";
    var landing = evidenceValue(evidence, "sourceLandingUrl", "source_landing_url");
    var pdf = evidenceValue(evidence, "sourceDirectDownloadUrl", "source_direct_download_url");
    var pageText = Array.isArray(pages) && pages.length ? pages.join(", ") + "쪽" : "페이지 정보 없음";
    var actions = landing ? '<a href="' + escapeHTML(landing) + '" target="_blank" rel="noopener noreferrer">공식 출처 보기</a>' : "";
    if (pdf && verifiedEvidence(evidence)) {
      actions += '<button type="button" data-action="open-pdf" data-pdf-url="' + escapeHTML(pdf) + '" data-landing-url="' + escapeHTML(landing || "") + '" data-evidence-id="' + escapeHTML(id) + '">설명서 PDF 열기</button>';
    }
    return '<article class="evidence-card">' +
      '<header><div><span class="evidence-type">OFFICIAL MANUAL</span><h4>' + escapeHTML(title) + '</h4></div><span class="badge badge--success">' + escapeHTML(verifiedEvidence(evidence) ? "공식 검증" : "상태 확인") + '</span></header>' +
      '<p>' + escapeHTML(summary) + '</p>' +
      '<div class="evidence-meta"><span><b>evidence_id</b> ' + escapeHTML(id) + '</span><span><b>문서 버전</b> ' + escapeHTML(version) + '</span><span><b>근거 페이지</b> ' + escapeHTML(pageText) + '</span><span><b>적용 모델</b> ' + escapeHTML(evidenceValue(evidence, "manualModel", "manual_model") || "확인 필요") + '</span></div>' +
      renderEvidenceMetadata(evidence) +
      (actions ? '<div class="evidence-actions">' + actions + '</div>' : "") +
      '<div class="source-fallback" data-source-fallback="' + escapeHTML(id) + '" hidden>공식 검색 화면에서 문서를 확인해주세요.</div>' +
    '</article>';
  }

  function renderNoEvidence() {
    return '<div class="source-fallback">공식 근거가 없어 점검 안내를 확정할 수 없습니다. 운영 담당자에게 근거 확인을 요청하세요.</div>';
  }

  function requiredResultPresent(visit) {
    var result = visit && visit.result;
    if (!result) return false;
    var guidance = usageView({}, result);
    return Boolean(result.actualCause && result.actions && guidance.status && guidance.basis && guidance.nextAction);
  }

  function renderResult(snapshot) {
    var context = selectedContext(snapshot);
    if (!context) return renderNoSelection("TECH-03", "방문 결과");
    if (!isAssigned(context) || !isAllowedVisit(context.visit)) return renderUnauthorized();

    var visit = context.visit;
    if (visit.status === "CONFIRMED") {
      return renderBackButton() + renderPageHeader("TECH-03", "VISIT RESULT", "방문 결과", "현장 재확인과 점검 시작을 먼저 완료해 주세요.") + renderContextBanner(context) +
        '<section class="empty-state"><span class="empty-state-icon" aria-hidden="true">◇</span><h2>아직 점검을 시작하지 않았습니다</h2><p>사전 점검 화면에서 현장 재확인 항목을 완료하면 방문 결과를 입력할 수 있습니다.</p><button class="button button--primary" type="button" data-action="go-detail">사전 점검으로 이동</button></section>';
    }

    var body = visit.status === "IN_PROGRESS" ? renderResultForm(context) : renderSavedResult(context, snapshot);
    return renderBackButton() +
      renderPageHeader("TECH-03", "VISIT RESULT", "방문 결과", "AI 예상 원인과 구분하여 현장에서 확인한 원인·조치·사용 안내를 기록합니다.") +
      renderContextBanner(context) + body;
  }

  function renderResultForm(context) {
    var inquiry = context.inquiry || {};
    var danger = inquiry.riskLevel === "DANGER";
    var canComplete = canDo(context, "VISIT_COMPLETED");
    var canRevisit = canDo(context, "REVISIT_NEEDED");
    return '<form id="visit-result-form" class="section-card" data-form="visit-result">' +
      '<div class="section-heading"><div><h2>현장 점검 결과 입력</h2><p>필수값을 모두 입력해야 방문 완료 또는 추가 방문으로 처리할 수 있습니다.</p></div><span class="badge badge--blue">점검 진행 중</span></div>' +
      (danger ? '<div class="source-fallback" style="margin-bottom:16px;">위험 안내는 결과 저장 전까지 해제되지 않습니다. 현장 조치 후 현재 사용 안내 상태를 명확히 선택하세요.</div>' : "") +
      '<div class="form-grid">' +
        fieldTextarea("actualCause", "실제 원인", "현장에서 확인한 실제 원인을 입력하세요. AI 예상 원인과 구분합니다.", true) +
        fieldTextarea("actions", "수행 조치", "점검·조정·교체 등 실제 수행한 조치를 입력하세요.", true) +
        fieldInput("parts", "교체 부품", "교체 없음 또는 부품명·수량", false) +
        '<div class="form-field"><label for="drinking-stop">음용 중지 안내 유지 여부 <span class="required">*</span></label><select id="drinking-stop" name="drinkingStopMaintained" required><option value="">선택하세요</option><option value="true"' + (danger ? " selected" : "") + '>유지 · 안전 확인 전 음용 중지</option><option value="false">해제 · 현장 판단 근거 입력 완료</option></select></div>' +
        '<div class="form-field"><label for="usage-status">현재 사용 안내 상태 <span class="required">*</span></label><select id="usage-status" name="usageGuidanceStatus" required><option value="">선택하세요</option><option value="NORMAL">일반 사용 가능</option><option value="PARTIAL_STOP">일부 출수·기능 사용 중지</option><option value="TOTAL_STOP"' + (danger ? " selected" : "") + '>제품 전체 사용 중지</option><option value="PENDING_CONSULTATION">판단 보류·상담 필요</option></select></div>' +
        '<fieldset class="form-field form-field--full" style="border:0;padding:0;margin:0;"><legend class="field-label">사용 제한 대상 출수·기능</legend><div class="choice-grid">' +
          choiceCheckbox("restrictedWater", "정수", "정수") + choiceCheckbox("restrictedWater", "냉수", "냉수") + choiceCheckbox("restrictedWater", "온수", "온수") + choiceCheckbox("restrictedWater", "전체 출수", "전체 출수", danger) +
        '</div></fieldset>' +
        fieldInput("restrictedFunctionsText", "기타 제한 기능", "예: 순간온수, 냉각 기능", false) +
        fieldTextarea("usageGuidanceMessage", "고객 표시용 사용 안내", "현재 사용할 수 있는 기능과 제한을 고객이 이해하기 쉽게 입력하세요.", true) +
        fieldTextarea("guidanceBasis", "판단 근거", "공식 근거 페이지와 현장 측정·육안 확인 결과를 함께 입력하세요.", true) +
        fieldTextarea("nextAction", "고객의 다음 행동", "경과 관찰, 상담 응답, 재방문 준비 등 고객이 할 일을 입력하세요.", true) +
        '<div class="form-field"><label for="care-history-applied">케어 이력 반영 여부 <span class="required">*</span></label><select id="care-history-applied" name="careHistoryApplied" required><option value="YES">반영</option><option value="NO">미반영·별도 확인</option></select></div>' +
        '<div class="form-field"><label for="visit-care-date">방문 완료 관리일 <span class="required">*</span></label><input id="visit-care-date" name="visitCompletedCareDate" type="date" value="' + escapeHTML(dateInputValue(new Date())) + '" required></div>' +
        '<div class="form-field"><label for="filter-replaced">필터·카트리지 교체 여부 <span class="required">*</span></label><select id="filter-replaced" name="filterReplaced" required><option value="NO">교체 없음</option><option value="YES">교체함</option></select></div>' +
        '<div class="form-field conditional-field" data-filter-items hidden><label for="filter-items">교체 항목 <span class="required">*</span></label><input id="filter-items" name="replacedFilterItems" type="text" placeholder="교체한 필터·카트리지 항목"></div>' +
        '<div class="form-field"><label for="next-care-date">다음 케어 예정일</label><input id="next-care-date" name="nextCareDate" type="date"></div>' +
        '<div class="form-field"><label for="next-care-basis">다음 케어 일정 산정 근거 <span class="required">*</span></label><select id="next-care-basis" name="nextCareBasis" required><option value="UNDEFINED">공식·팀 승인 기준 없음</option><option value="OFFICIAL">공식 운영 기준</option><option value="TEAM_RULE">팀 승인 규칙</option></select></div>' +
        '<div class="form-field"><label for="follow-up-counsel">후속 상담</label><select id="follow-up-counsel" name="followUpCounsel"><option value="NONE">필요 없음</option><option value="REQUIRED">상담 후속 확인 필요</option></select></div>' +
        '<div class="form-field"><label for="additional-visit">추가 방문 여부 <span class="required">*</span></label><select id="additional-visit" name="additionalVisit" required><option value="NO">추가 방문 없음</option><option value="YES">추가 방문 필요</option></select></div>' +
        '<div class="form-field form-field--full conditional-field" data-revisit-reason hidden><label for="revisit-reason">추가 방문 사유 <span class="required">*</span></label><textarea id="revisit-reason" name="revisitReason" placeholder="부품 확보, 추가 진단 등 재방문 사유를 입력하세요."></textarea></div>' +
        fieldTextarea("notes", "특이사항", "고객 요청, 설치 환경, 다음 담당자에게 전달할 내용을 입력하세요.", false) +
        fieldInput("signature", "고객 서명 확인", "현장에서 결과를 안내받은 고객 성명", true) +
      '</div>' +
      '<p class="form-error" data-form-error hidden></p>' +
      '<div class="action-bar"><div class="action-note"><strong>저장 전 확인</strong>추가 방문 선택 시 문의는 ‘추가 방문 필요’, 그 외에는 ‘처리 결과 확인’으로 전환됩니다.</div><button class="button button--primary" type="submit"' + (state.busy || (!canComplete && !canRevisit) ? " disabled" : "") + '>방문 결과 저장</button></div>' +
    '</form>';
  }

  function fieldTextarea(name, label, placeholder, required) {
    return '<div class="form-field form-field--full"><label for="field-' + name + '">' + escapeHTML(label) + (required ? ' <span class="required">*</span>' : "") + '</label><textarea id="field-' + name + '" name="' + name + '" placeholder="' + escapeHTML(placeholder) + '"' + (required ? " required" : "") + '></textarea></div>';
  }

  function fieldInput(name, label, placeholder, required) {
    return '<div class="form-field"><label for="field-' + name + '">' + escapeHTML(label) + (required ? ' <span class="required">*</span>' : "") + '</label><input id="field-' + name + '" name="' + name + '" type="text" placeholder="' + escapeHTML(placeholder) + '"' + (required ? " required" : "") + '></div>';
  }

  function dateInputValue(value) {
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    var pad = function (number) { return String(number).padStart(2, "0"); };
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function choiceCheckbox(name, value, label, checked) {
    return '<label class="choice-chip"><input type="checkbox" name="' + escapeHTML(name) + '" value="' + escapeHTML(value) + '"' + (checked ? " checked" : "") + '><span>' + escapeHTML(label) + '</span></label>';
  }

  function renderSavedResult(context, snapshot) {
    var visit = context.visit;
    var inquiry = context.inquiry || {};
    var result = visit.result || {};
    var guidance = usageView(inquiry, result);
    var restrictions = array(guidance.restrictedFunctions).join(", ") || "제한 없음";
    var feedback = inquiry.resolutionFeedback;
    var feedbackComment = feedback && typeof feedback === "object" ? feedback.comment : "";

    return '<div class="detail-grid">' +
      '<div class="detail-column">' +
        '<section class="section-card" aria-labelledby="saved-result-title">' +
          '<div class="section-heading"><div><h2 id="saved-result-title">저장된 방문 결과</h2><p>현장에서 저장한 실제 원인과 조치 내역입니다.</p></div>' + statusBadge(visit.status) + '</div>' +
          '<dl class="data-list">' +
            dataRow("실제 원인", result.actualCause) +
            dataRow("수행 조치", result.actions) +
            dataRow("교체 부품", result.parts || "교체 부품 없음") +
            dataRow("현재 사용 안내", usageLabel(guidance.status)) +
            dataRow("고객 표시 안내", guidance.message) +
            dataRow("제한 출수·기능", restrictions) +
            dataRow("판단 근거", guidance.basis) +
            dataRow("고객의 다음 행동", guidance.nextAction) +
            dataRow("케어 이력 반영", result.careHistoryApplied === false ? "미반영·확인 필요" : "반영") +
            dataRow("방문 완료 관리일", result.visitCompletedCareDate || visit.completedAt ? formatDateTime(result.visitCompletedCareDate || visit.completedAt) : "확인 필요") +
            dataRow("필터·카트리지 교체", result.filterReplaced ? array(result.replacedFilterItems).join(", ") || "교체 항목 확인 필요" : "교체 없음") +
            dataRow("다음 케어 예정일", result.nextCareDate ? formatDateTime(result.nextCareDate) : "확인 필요") +
            dataRow("다음 케어 산정 근거", result.nextCareBasis || "기준 미확정") +
            dataRow("후속 상담", result.followUpCounsel ? "후속 상담 필요" : "필요 없음") +
            dataRow("특이사항", result.notes || "특이사항 없음") +
            dataRow("고객 서명", result.signature || "서명 정보 없음") +
          '</dl>' +
        '</section>' +
      '</div>' +
      '<div class="detail-column">' +
        renderCompletionCard(context, feedbackComment) +
        renderCareApplication(snapshot, context) +
        '<section class="section-card"><div class="section-heading"><div><h2>처리 원칙</h2><p>방문 경로 완료 상태를 고객 화면과 공유합니다.</p></div></div><ul class="priority-list"><li>AI 예상 원인과 기사 실제 원인은 별도 기록으로 유지</li><li>고객 피드백 전까지 문의 상태는 최종 완료 대기</li><li>동일 방문·idempotency_key의 중복 저장 차단</li></ul></section>' +
      '</div>' +
    '</div>';
  }

  function renderCareApplication(snapshot, context) {
    var visit = context.visit || {};
    if (visit.status !== "COMPLETED" && !visit.careApplied) return "";
    var product = context.product || {};
    var schedule = product.careSchedule || {};
    var history = array(snapshot && snapshot.careHistory).find(function (item) {
      return item && (item.visitId === visit.id || (item.inquiryId === (context.inquiry && context.inquiry.id) && item.productId === product.id));
    });
    var applied = Boolean(visit.careApplied || history);
    var nextCareAt = schedule.nextCareDate || schedule.nextCareAt || schedule.nextDate || schedule.plannedAt || null;
    var planningLabel = schedule.label || schedule.status || "다음 일정 확인 필요";
    var appliedAt = visit.careUpdatedAt || (history && history.completedAt) || visit.completedAt;

    return '<section class="section-card" aria-labelledby="care-application-title">' +
      '<div class="section-heading"><div><h2 id="care-application-title">케어 이력·일정 반영</h2><p>방문 완료 결과가 제품 관리 정보에 적용된 상태입니다.</p></div><span class="badge ' + (applied ? "badge--success" : "badge--caution") + '">' + (applied ? "반영 완료" : "초기 이력 확인") + '</span></div>' +
      '<dl class="data-list">' +
        dataRow("케어 이력 ID", history && history.id || "연결된 이력 없음") +
        dataRow("반영 상태", applied ? "방문 결과가 케어 이력과 제품 정보에 반영됨" : "시연 초기 완료 건 · 기존 제품 이력 표시") +
        dataRow("반영 시각", appliedAt ? formatDateTime(appliedAt) : "반영 시각 확인 필요") +
        dataRow("최근 케어일", product.lastCareDate || product.lastCareAt ? formatDateTime(product.lastCareDate || product.lastCareAt) : "최근 케어일 없음") +
        dataRow("최근 필터·카트리지 교체일", product.lastFilterReplacementDate || product.lastFilterChangedAt ? formatDateTime(product.lastFilterReplacementDate || product.lastFilterChangedAt) : "교체 이력 없음") +
        dataRow("다음 케어 계획", planningLabel + (schedule.status ? " (" + schedule.status + ")" : "")) +
        dataRow("다음 케어 예정일", nextCareAt ? formatDateTime(nextCareAt) : "미정 · 고객과 별도 협의") +
        dataRow("일정 산정 근거", schedule.nextCareBasis || schedule.sourceType || schedule.note || "일정 산정 근거 확인 필요") +
        dataRow("일정 확인 상태", schedule.nextCareStatus || schedule.status || "CONFIRMATION_REQUIRED") +
        dataRow("연결 방문 ID", schedule.lastVisitId || visit.id || "확인 필요") +
      '</dl>' +
    '</section>';
  }

  function renderCompletionCard(context, feedbackComment) {
    var inquiry = context.inquiry || {};
    var visit = context.visit;
    if (inquiry.status === "RESOLVED") {
      return '<section class="section-card completion-card"><div class="completion-state"><span aria-hidden="true">✓</span><div><strong>문의 최종 완료</strong><p>방문 결과와 고객 해결 피드백이 확인되었습니다.</p></div></div><span class="badge badge--success">처리 완료</span></section>';
    }
    if (isFinalPending(context) && requiredResultPresent(visit) && canDo(context, "FINALIZE_INQUIRY")) {
      return '<section class="section-card completion-card"><div class="completion-state"><span aria-hidden="true">✓</span><div><strong>고객 해결 피드백: 해결됨</strong><p>상태: 담당자 최종 확인 필요</p></div></div>' +
        (feedbackComment ? '<blockquote class="quote-box">“' + escapeHTML(feedbackComment) + '”</blockquote>' : "") +
        '<button class="button button--primary button--wide" type="button" data-action="finalize-inquiry"' + (state.busy ? " disabled" : "") + '>문의 최종 완료</button></section>';
    }
    if (visit.status === "FOLLOW_UP_REQUIRED" || inquiry.status === "REVISIT_REQUIRED") {
      return '<section class="section-card completion-card"><div class="completion-state"><span aria-hidden="true">↻</span><div><strong>추가 방문 필요</strong><p>' + escapeHTML((visit.result && visit.result.revisitReason) || "추가 점검 일정 협의가 필요합니다.") + '</p></div></div><span class="badge badge--caution">일정 조율 대기</span></section>';
    }
    return '<section class="section-card completion-card"><div class="completion-state"><span aria-hidden="true">…</span><div><strong>고객 결과 확인 대기</strong><p>고객이 해결 여부를 제출하면 담당 기사에게 알림이 도착합니다.</p></div></div><span class="badge badge--blue">최종 완료 대기</span></section>';
  }

  function idempotencyKey(eventName, inquiryId, visitId) {
    var random = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    return [eventName, inquiryId || "NO-INQUIRY", visitId || "NO-VISIT", random].join(":");
  }

  function stateVersion(context) {
    if (context.inquiry && context.inquiry.stateVersion != null) return context.inquiry.stateVersion;
    if (context.visit && context.visit.stateVersion != null) return context.visit.stateVersion;
    var snapshot = getSnapshot();
    return snapshot.stateVersion || (snapshot.meta && snapshot.meta.revision) || 1;
  }

  function dispatchEvent(eventName, context, fields) {
    var payload = Object.assign({
      inquiryId: context.inquiry.id,
      stateVersion: stateVersion(context),
      idempotencyKey: idempotencyKey(eventName, context.inquiry.id, context.visit && context.visit.id)
    }, fields || {});
    Store.dispatch(eventName, payload, ACTOR);
    return getSnapshot();
  }

  function handlePrevisitReport(form, eventName) {
    var snapshot = getSnapshot();
    var context = selectedContext(snapshot);
    if (!context || !isAssigned(context)) return showError("현재 기사에게 배정된 방문만 사전 리포트를 처리할 수 있습니다.");
    if (!canDo(context, eventName)) return showError("현재 상태에서 허용되지 않은 사전 리포트 작업입니다.");
    var text = String(new FormData(form).get("previsitReportText") || "").trim();
    if (!text) return setFormError(form, "기사 사전 점검 리포트 내용을 입력해 주세요.");
    state.busy = true;
    setFormError(form, "");
    try {
      dispatchEvent(eventName, context, { visitId: context.visit.id, text: text });
      showToast(eventName === "CONFIRM_PREVISIT_REPORT" ? "사전 점검 리포트를 확정했습니다." : "사전 점검 리포트 수정본을 저장했습니다.");
    } catch (error) {
      setFormError(form, friendlyError(error, "사전 점검 리포트를 저장하지 못했습니다."));
      showError(friendlyError(error, "사전 점검 리포트를 저장하지 못했습니다."));
      state.busy = false;
      return;
    }
    state.busy = false;
    render();
  }

  function handleStartVisit(form) {
    var snapshot = getSnapshot();
    var context = selectedContext(snapshot);
    if (!context || !isAssigned(context)) return showError("현재 기사에게 배정된 방문만 시작할 수 있습니다.");
    if (!canDo(context, "START_VISIT") || !hasConfirmedPrevisitReport(context)) return showError("사전 리포트를 확정한 뒤 점검을 시작해 주세요.");
    var checked = Array.from(form.querySelectorAll('input[name="reconfirmed"]:checked')).map(function (input) { return input.value; });
    var total = form.querySelectorAll('input[name="reconfirmed"]').length;
    if (checked.length !== total) return showError("현장 재확인 항목을 모두 확인해 주세요.");

    state.busy = true;
    render();
    try {
      dispatchEvent("START_VISIT", context, { visitId: context.visit.id, reconfirmed: checked });
      state.view = "result";
      showToast("점검을 시작했습니다. 현장 결과를 입력해 주세요.");
    } catch (error) {
      handleDispatchError(error, "점검을 시작하지 못했습니다.");
    } finally {
      state.busy = false;
      render();
    }
  }

  function handleVisitResult(form) {
    var snapshot = getSnapshot();
    var context = selectedContext(snapshot);
    if (!context || !isAssigned(context)) return showError("현재 기사에게 배정된 방문만 저장할 수 있습니다.");
    if (!form.reportValidity()) return;

    var data = new FormData(form);
    var additionalVisit = data.get("additionalVisit") === "YES";
    var eventName = additionalVisit ? "REVISIT_NEEDED" : "VISIT_COMPLETED";
    if (!canDo(context, eventName)) return showError("현재 상태에서 허용되지 않은 방문 결과 작업입니다.");
    var revisitReason = String(data.get("revisitReason") || "").trim();
    if (additionalVisit && !revisitReason) {
      var reason = form.querySelector('[name="revisitReason"]');
      reason.setCustomValidity("추가 방문 사유를 입력해 주세요.");
      reason.reportValidity();
      reason.setCustomValidity("");
      return;
    }
    var filterReplaced = data.get("filterReplaced") === "YES";
    var replacedFilterItems = String(data.get("replacedFilterItems") || "").trim();
    if (filterReplaced && !replacedFilterItems) return showError("교체한 필터·카트리지 항목을 입력해 주세요.");
    var nextCareDate = String(data.get("nextCareDate") || "").trim();
    var nextCareBasis = String(data.get("nextCareBasis") || "UNDEFINED");
    if (nextCareDate && nextCareBasis === "UNDEFINED") return showError("다음 케어 예정일을 입력하려면 공식 기준 또는 팀 승인 규칙을 선택해 주세요.");

    var restrictions = data.getAll("restrictedWater").map(String);
    var customRestriction = String(data.get("restrictedFunctionsText") || "").trim();
    if (customRestriction) restrictions.push(customRestriction);
    var notes = String(data.get("notes") || "").trim();
    var drinkingStopMaintained = data.get("drinkingStopMaintained") === "true";
    if (drinkingStopMaintained) notes = "[음용 중지 안내 유지] " + notes;

    var fields = {
      visitId: context.visit.id,
      actualCause: String(data.get("actualCause") || "").trim(),
      actions: String(data.get("actions") || "").trim(),
      parts: String(data.get("parts") || "").trim() || "교체 부품 없음",
      drinkingStopMaintained: drinkingStopMaintained,
      usageGuidanceStatus: String(data.get("usageGuidanceStatus") || ""),
      usageGuidanceMessage: String(data.get("usageGuidanceMessage") || "").trim(),
      restrictedFunctions: restrictions,
      guidanceBasis: String(data.get("guidanceBasis") || "").trim(),
      nextAction: String(data.get("nextAction") || "").trim(),
      careHistoryApplied: data.get("careHistoryApplied") === "YES",
      visitCompletedCareDate: String(data.get("visitCompletedCareDate") || ""),
      filterReplaced: filterReplaced,
      replacedFilterItems: replacedFilterItems ? replacedFilterItems.split(/[,·]/).map(function (item) { return item.trim(); }).filter(Boolean) : [],
      nextCareDate: nextCareDate || null,
      nextCareBasis: nextCareDate ? nextCareBasis : null,
      nextCareStatus: nextCareDate ? "CONFIRMED" : "CONFIRMATION_REQUIRED",
      followUpCounsel: data.get("followUpCounsel") === "REQUIRED",
      notes: notes || "특이사항 없음",
      signature: String(data.get("signature") || "").trim()
    };
    if (additionalVisit) fields.revisitReason = revisitReason;

    state.busy = true;
    setFormError(form, "");
    form.querySelectorAll("button").forEach(function (button) { button.disabled = true; });
    var succeeded = false;
    try {
      dispatchEvent(eventName, context, fields);
      succeeded = true;
      showToast(additionalVisit ? "추가 방문 필요로 저장했습니다." : "방문 결과를 저장하고 고객 확인을 요청했습니다.");
    } catch (error) {
      setFormError(form, friendlyError(error, "방문 결과를 저장하지 못했습니다."));
      showError(friendlyError(error, "방문 결과를 저장하지 못했습니다."));
    } finally {
      state.busy = false;
      if (succeeded) render();
      else form.querySelectorAll("button").forEach(function (button) { button.disabled = false; });
    }
  }

  function handleFinalize() {
    var snapshot = getSnapshot();
    var context = selectedContext(snapshot);
    if (!context || !isAssigned(context)) return showError("현재 방문 담당 기사만 최종 완료할 수 있습니다.");
    if (!isFinalPending(context) || !requiredResultPresent(context.visit)) return showError("고객 해결 피드백과 방문 결과 필수값을 확인해 주세요.");
    if (!canDo(context, "FINALIZE_INQUIRY")) return showError("현재 상태에서 문의 최종 완료가 허용되지 않습니다.");

    state.busy = true;
    render();
    try {
      dispatchEvent("FINALIZE_INQUIRY", context, {});
      showToast("문의가 최종 완료되었습니다.");
    } catch (error) {
      handleDispatchError(error, "문의를 최종 완료하지 못했습니다.");
    } finally {
      state.busy = false;
      render();
    }
  }

  function friendlyError(error, fallback) {
    if (!error) return fallback;
    var message = error.message || String(error);
    if (/STATE_CONFLICT|state.?version|최신 상태/i.test(message)) return "다른 사용자가 문의를 먼저 변경했습니다. 최신 내용을 다시 불러왔습니다.";
    if (/AUTH|권한|assigned/i.test(message)) return "이 업무를 처리할 권한이 없습니다. 담당 배정을 확인해 주세요.";
    if (/DUPLICATE|idempotency|중복/i.test(message)) return "이미 처리된 요청입니다. 최신 처리 결과를 표시합니다.";
    return message || fallback;
  }

  function handleDispatchError(error, fallback) {
    state.lastError = friendlyError(error, fallback);
    showError(state.lastError);
  }

  function setFormError(form, message) {
    var node = form && form.querySelector("[data-form-error]");
    if (!node) return;
    node.textContent = message || "";
    node.hidden = !message;
  }

  function showToast(message) {
    if (UI && typeof UI.toast === "function") {
      try { UI.toast(message); return; } catch (error) { /* local toast below */ }
    }
    var node = document.getElementById("toast");
    if (!node) return;
    window.clearTimeout(toastTimer);
    node.textContent = message;
    node.classList.remove("is-error");
    node.classList.add("is-visible");
    toastTimer = window.setTimeout(function () { node.classList.remove("is-visible"); }, 3200);
  }

  function showError(message) {
    var node = document.getElementById("toast");
    if (UI && typeof UI.toast === "function") {
      try { UI.toast(message, "danger"); return; } catch (error) { /* local toast below */ }
    }
    if (!node) return;
    window.clearTimeout(toastTimer);
    node.textContent = message;
    node.classList.add("is-error", "is-visible");
    toastTimer = window.setTimeout(function () { node.classList.remove("is-visible", "is-error"); }, 4200);
  }

  function updateNavigation() {
    document.querySelectorAll("[data-tech-view]").forEach(function (button) {
      var active = button.getAttribute("data-tech-view") === state.view;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function renderNotifications(snapshot) {
    var notifications = array(snapshot.notifications).filter(function (item) {
      return (item.role === ACTOR.role || item.audienceRole === ACTOR.role) &&
        (item.recipientId === ACTOR.id || item.actorId === ACTOR.id || !item.recipientId);
    }).sort(function (a, b) { return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); });
    var unread = notifications.filter(function (item) { return !item.read; }).length;
    var badge = document.getElementById("notification-badge");
    var toggle = document.getElementById("notification-toggle");
    if (badge) { badge.textContent = String(unread); badge.hidden = unread === 0; }
    if (toggle) toggle.setAttribute("aria-label", "업무 알림 " + unread + "건 열기");
    var summary = document.getElementById("notification-summary");
    if (summary) summary.textContent = unread ? "읽지 않은 알림 " + unread + "건이 있습니다." : "새 알림이 없습니다.";

    var list = document.getElementById("notification-list");
    if (!list) return;
    if (UI && typeof UI.notificationList === "function") {
      try {
        var shared = UI.notificationList(notifications, { role: ACTOR.role, recipientId: ACTOR.id });
        if (typeof shared === "string" && shared.trim()) { list.innerHTML = shared; return; }
      } catch (error) {
        /* Fall back to the tablet-specific list. */
      }
    }
    list.innerHTML = notifications.length ? notifications.map(function (item) {
      return '<button class="notification-item' + (!item.read ? " is-unread" : "") + '" type="button" data-notification-id="' + escapeHTML(item.id || "") + '" data-notification-visit="' + escapeHTML(item.visitId || "") + '" data-notification-inquiry="' + escapeHTML(item.inquiryId || "") + '"><strong>' + escapeHTML(item.title || "업무 알림") + '</strong><span>' + escapeHTML(item.message || "") + '</span><span>' + escapeHTML(formatDateTime(item.createdAt)) + '</span></button>';
    }).join("") : '<section class="empty-state" style="min-height:220px;box-shadow:none;"><span class="empty-state-icon" aria-hidden="true">✓</span><h2>새 알림이 없습니다</h2><p>배정·일정·고객 피드백이 발생하면 이곳에 표시됩니다.</p></section>';
  }

  function render() {
    if (!root) return;
    try {
      var snapshot = getSnapshot();
      renderNotifications(snapshot);
      if (state.view === "detail") root.innerHTML = renderDetail(snapshot);
      else if (state.view === "result") root.innerHTML = renderResult(snapshot);
      else root.innerHTML = renderList(snapshot);
      root.setAttribute("aria-busy", "false");
      updateNavigation();
      syncConditionalFields();
    } catch (error) {
      root.setAttribute("aria-busy", "false");
      root.innerHTML = '<section class="error-state"><span class="error-state-icon" aria-hidden="true">!</span><h2>방문 업무를 표시하지 못했습니다</h2><p>' + escapeHTML(error.message || String(error)) + '</p><button class="button button--primary" type="button" data-action="retry-render">다시 불러오기</button></section>';
    }
  }

  function syncConditionalFields() {
    var select = document.querySelector('[name="additionalVisit"]');
    var field = document.querySelector("[data-revisit-reason]");
    if (select && field) {
      var show = select.value === "YES";
      field.hidden = !show;
      var textarea = field.querySelector("textarea");
      if (textarea) textarea.required = show;
    }
    var filterSelect = document.querySelector('[name="filterReplaced"]');
    var filterField = document.querySelector("[data-filter-items]");
    if (filterSelect && filterField) {
      var showFilterItems = filterSelect.value === "YES";
      filterField.hidden = !showFilterItems;
      var input = filterField.querySelector("input");
      if (input) input.required = showFilterItems;
    }
  }

  function setView(view) {
    state.view = view;
    render();
    document.getElementById("technician-main").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleRootClick(event) {
    var sharedPdf = event.target.closest("[data-official-pdf]");
    if (sharedPdf) {
      event.preventDefault();
      var adapter = sharedPdf.closest("[data-evidence-id]");
      openPdfUrl(sharedPdf.getAttribute("href"), adapter && adapter.getAttribute("data-landing-url"), adapter && adapter.getAttribute("data-evidence-id"));
      return;
    }
    var target = event.target.closest("[data-action]");
    if (!target) return;
    var action = target.getAttribute("data-action");
    if (action === "open-visit") {
      state.selectedVisitId = target.getAttribute("data-visit-id");
      setView(target.getAttribute("data-next-view") || "detail");
    } else if (action === "back-list") {
      setView("list");
    } else if (action === "go-result") {
      setView("result");
    } else if (action === "go-detail") {
      setView("detail");
    } else if (action === "reset-filter") {
      state.dateFilter = "all";
      state.statusFilter = "all";
      render();
    } else if (action === "finalize-inquiry") {
      handleFinalize();
    } else if (action === "retry-render") {
      state.lastError = "";
      render();
    } else if (action === "open-pdf") {
      openEvidencePdf(target);
    }
  }

  function openEvidencePdf(button) {
    var pdf = button.getAttribute("data-pdf-url");
    var landing = button.getAttribute("data-landing-url");
    var id = button.getAttribute("data-evidence-id");
    openPdfUrl(pdf, landing, id);
  }

  function openPdfUrl(pdf, landing, id) {
    var opened = null;
    try { opened = window.open(pdf, "_blank", "noopener,noreferrer"); } catch (error) { opened = null; }
    if (!opened) {
      var fallback = Array.from(document.querySelectorAll("[data-source-fallback]")).find(function (node) {
        return node.getAttribute("data-source-fallback") === id;
      });
      if (fallback) fallback.hidden = false;
      showError("공식 검색 화면에서 문서를 확인해주세요.");
      if (landing) {
        window.setTimeout(function () { window.open(landing, "_blank", "noopener,noreferrer"); }, 350);
      }
    }
  }

  function bindEvents() {
    root.addEventListener("click", handleRootClick);
    root.addEventListener("change", function (event) {
      var filter = event.target.getAttribute("data-filter");
      if (filter === "date") { state.dateFilter = event.target.value; render(); }
      if (filter === "status") { state.statusFilter = event.target.value; render(); }
      if (event.target.name === "additionalVisit" || event.target.name === "filterReplaced") syncConditionalFields();
    });
    root.addEventListener("submit", function (event) {
      if (event.target.matches('[data-form="previsit-report"]')) {
        event.preventDefault();
        handlePrevisitReport(event.target, event.submitter && event.submitter.value);
      }
      if (event.target.matches('[data-form="start-visit"]')) {
        event.preventDefault();
        handleStartVisit(event.target);
      }
      if (event.target.matches('[data-form="visit-result"]')) {
        event.preventDefault();
        handleVisitResult(event.target);
      }
    });
    root.addEventListener("click", function (event) {
      var tab = event.target.closest("[data-task-tab]");
      if (!tab) return;
      state.taskTab = tab.getAttribute("data-task-tab");
      state.statusFilter = "all";
      render();
    });

    document.querySelectorAll("[data-tech-view]").forEach(function (button) {
      button.addEventListener("click", function () { setView(button.getAttribute("data-tech-view")); });
    });

    var toggle = document.getElementById("notification-toggle");
    var close = document.getElementById("notification-close");
    var backdrop = document.getElementById("drawer-backdrop");
    if (toggle) toggle.addEventListener("click", openNotifications);
    if (close) close.addEventListener("click", closeNotifications);
    if (backdrop) backdrop.addEventListener("click", closeNotifications);
    document.getElementById("notification-list").addEventListener("click", handleNotificationClick);
    document.addEventListener("keydown", function (event) { if (event.key === "Escape") closeNotifications(); });
  }

  function openNotifications() {
    var panel = document.getElementById("notification-panel");
    var backdrop = document.getElementById("drawer-backdrop");
    panel.hidden = false;
    backdrop.hidden = false;
    document.getElementById("notification-toggle").setAttribute("aria-expanded", "true");
    panel.focus();
  }

  function closeNotifications() {
    var panel = document.getElementById("notification-panel");
    var backdrop = document.getElementById("drawer-backdrop");
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    backdrop.hidden = true;
    var toggle = document.getElementById("notification-toggle");
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  }

  function handleNotificationClick(event) {
    var item = event.target.closest("[data-notification-visit], [data-visit-id], [data-open-notification]");
    if (!item) return;
    var notificationNode = item.closest("[data-notification-id]");
    var notificationId = notificationNode && notificationNode.getAttribute("data-notification-id");
    var visitId = item.getAttribute("data-notification-visit") || item.getAttribute("data-visit-id");
    if (!visitId) {
      var inquiryId = item.getAttribute("data-notification-inquiry") || item.getAttribute("data-inquiry-id") || item.getAttribute("data-open-notification");
      var snapshot = getSnapshot();
      var visit = array(snapshot.visits).find(function (candidate) { return candidate.inquiryId === inquiryId && assignedTechnicianId(candidate) === ACTOR.id; });
      visitId = visit && visit.id;
    }
    if (notificationId) {
      try {
        Store.dispatch("MARK_NOTIFICATION_READ", {
          notificationId: notificationId,
          idempotencyKey: idempotencyKey("MARK_NOTIFICATION_READ", notificationId)
        }, ACTOR);
      } catch (error) {
        /* Reading a linked work item must remain available even if the read marker fails. */
      }
    }
    if (visitId) {
      state.selectedVisitId = visitId;
      closeNotifications();
      setView("detail");
    }
  }

  function init() {
    root = document.getElementById("technician-root");
    Store = window.WaterCareStore;
    UI = window.WaterCareUI || {};
    if (!Store || typeof Store.getState !== "function" || typeof Store.dispatch !== "function") {
      root.setAttribute("aria-busy", "false");
      root.innerHTML = '<section class="error-state"><span class="error-state-icon" aria-hidden="true">!</span><h2>업무 데이터를 연결하지 못했습니다</h2><p>공유 데이터·상태 저장소 스크립트가 로드되었는지 확인해 주세요.</p><a class="button button--secondary" href="index.html">역할 선택 홈으로 돌아가기</a></section>';
      return;
    }
    bindEvents();
    if (typeof Store.subscribe === "function") {
      unsubscribe = Store.subscribe(function () { if (!state.busy) render(); });
    }
    render();
  }

  window.addEventListener("beforeunload", function () { if (typeof unsubscribe === "function") unsubscribe(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}());
