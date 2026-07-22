(function () {
  "use strict";

  var Store = window.WaterCareStore;
  var UI = window.WaterCareUI || {};
  var ACTOR = { role: "OPERATOR", id: "STAFF-OPER-01", name: "장민서" };
  var root = document.getElementById("operator-app");
  var filters = { period: "ALL", model: "ALL", management: "ALL", handler: "ALL", symptom: "ALL", risk: "ALL", priority: "ALL", status: "ALL", aiState: "ALL", visitStatus: "ALL", supportStatus: "ALL", outcome: "ALL" };
  var notificationOpen = false;
  var seenNotificationIds = {};
  var state;

  if (!root) return;
  if (!Store || typeof Store.getState !== "function") {
    root.setAttribute("aria-busy", "false");
    root.innerHTML = '<div class="v6-error"><strong>공유 운영 모듈을 불러오지 못했습니다.</strong><p>config → domain → data → repository → store → UI 순서를 확인해 주세요.</p></div>';
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

  function aiStatusLabel(code) {
    return ({
      IDLE: "실행 전", STRUCTURING: "증상 구조화", CHECKING_MISSING_FIELDS: "누락 정보 확인", SAFETY_CHECK: "안전 기준 확인",
      RETRIEVING: "공식 문서 검색", RERANKING: "검색 결과 재정렬", GENERATING: "안내 생성", VALIDATING: "결과 검증",
      COMPLETED: "AI 처리 완료", FAILED: "AI 처리 실패", CANCELLED: "AI 처리 취소"
    })[code] || code || "상태 미확인";
  }

  function visitStatusLabel(code) {
    return ({
      NOT_CREATED: "방문 미생성", ASSIGNING: "기사 배정 중", SCHEDULING: "일정 조율 중", CONFIRMED: "방문 확정",
      IN_PROGRESS: "방문 진행 중", COMPLETED: "방문 완료", FOLLOW_UP_REQUIRED: "추가 방문 필요", CANCELLED: "방문 취소"
    })[code] || code || "방문 미생성";
  }

  function supportStatusLabel(code) {
    return ({ SUPPORTED: "MVP 지원", EXPANSION: "후속 확장", UNSUPPORTED: "지원 범위 밖", ARCHIVED: "보관 모델", INCOMPLETE: "제품 정보 불완전" })[code] || code || "지원 상태 미확인";
  }

  function aiOutcomeLabel(code) {
    return ({ SAFE_GUIDANCE_READY: "안전 안내 준비", DANGER_DETECTED: "위험 규칙 감지", NO_EVIDENCE: "공식 근거 없음" })[code] || code || "종료 사유 없음";
  }

  function processStageLabel(code) {
    if (["IDLE", "STRUCTURING", "CHECKING_MISSING_FIELDS", "SAFETY_CHECK", "RETRIEVING", "RERANKING", "GENERATING", "VALIDATING", "FAILED"].indexOf(code) >= 0) return aiStatusLabel(code);
    if (["ASSIGNING", "SCHEDULING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "FOLLOW_UP_REQUIRED"].indexOf(code) >= 0) return visitStatusLabel(code);
    return statusLabel(code);
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
      if (filters.aiState !== "ALL" && (inquiry.aiState || "IDLE") !== filters.aiState) return false;
      var visit = visitFor(inquiry);
      if (filters.visitStatus !== "ALL" && (visit ? visit.status : "NOT_CREATED") !== filters.visitStatus) return false;
      if (filters.supportStatus !== "ALL" && (product.supportStatus || "INCOMPLETE") !== filters.supportStatus) return false;
      if (filters.outcome !== "ALL" && outcomeCode(inquiry) !== filters.outcome) return false;
      return true;
    });
  }

  function filteredSupportRequests() {
    var reference = referenceTime();
    var periodDays = filters.period === "ALL" ? null : Number(filters.period);
    var cutoff = periodDays == null ? null : reference.getTime() - periodDays * 86400000;
    return (state.productSupportRequests || []).filter(function (request) {
      var product = (state.products || []).find(function (item) { return item.id === request.productId; }) || {};
      var created = new Date(request.updatedAt || request.createdAt || 0).getTime();
      if (cutoff != null && created < cutoff) return false;
      if (filters.model !== "ALL" && product.productCode !== filters.model) return false;
      if (filters.supportStatus !== "ALL" && request.validationStatus !== filters.supportStatus) return false;
      return true;
    }).sort(function (a, b) { return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0); });
  }

  function uniqueOptions(values, labeler) {
    return Array.from(new Set(values.filter(Boolean))).sort().map(function (value) {
      return '<option value="' + escape(value) + '">' + escape(labeler ? labeler(value) : value) + '</option>';
    }).join("");
  }

  function metricCard(label, value, meta, tone, icon) {
    return '<article class="v6-metric-card ' + (tone ? "is-" + tone : "") + '"><div><span>' + escape(label) + '</span><i>' + escape(icon) + '</i></div><strong>' + escape(value) + '</strong><small>' + escape(meta) + '</small></article>';
  }

  function failureDetails(item) {
    var details = [];
    if (item.failedStage) details.push("실패 단계 " + item.failedStage);
    if (item.errorCode) details.push("오류 코드 " + item.errorCode);
    if (Number(item.retryCount || 0) > 0) details.push("재시도 " + item.retryCount + "회");
    if (item.correlationId) details.push("correlation_id " + item.correlationId);
    return details.join(" · ");
  }

  function normalizedExceptionType(item) {
    var type = String(item.type || item.errorCode || "OPERATION_EXCEPTION").toUpperCase();
    if (type === "EVIDENCE_SEARCH_FAILED" || type.indexOf("NO_EVIDENCE") >= 0) return "NO_EVIDENCE";
    if (type.indexOf("SAVE") >= 0 || type.indexOf("REPOSITORY") >= 0) return "SAVE_FAILED";
    if (type.indexOf("AUTH") >= 0 || type.indexOf("PERMISSION") >= 0) return "AUTH_FAILED";
    if (type.indexOf("MODEL") >= 0 || type.indexOf("PRODUCT_VALIDATION") >= 0) return "PRODUCT_VALIDATION_FAILED";
    if (type.indexOf("RETRY") >= 0 && type.indexOf("EXCEEDED") >= 0) return "RETRY_EXCEEDED";
    return type;
  }

  function operationalExceptions(inquiries, supportRequests) {
    var inquiryIds = inquiries.map(function (item) { return item.id; });
    var productIds = inquiries.map(function (item) { return item.productId; }).concat((supportRequests || []).map(function (item) { return item.productId; }));
    var rows = [];
    var reference = referenceTime();

    (state.products || []).forEach(function (product) {
      if (productIds.indexOf(product.id) < 0) return;
      if (!product.careSchedule || product.careSchedule.status === "CHECK_REQUIRED" || product.careSchedule.status === "UNCALCULATED") {
        rows.push({ type: "CARE_DATE_UNCALCULATED", target: product.id, reason: product.careSchedule && product.careSchedule.note || "다음 케어 일정이 산정되지 않았습니다.", lastStage: "CARE_SCHEDULE", owner: "운영 담당자", changedAt: product.lastCareAt });
      }
      if (product.supportStatus && product.supportStatus !== "SUPPORTED") {
        rows.push({ type: "PRODUCT_VALIDATION_FAILED", target: product.id, reason: product.supportMessage || "기본 MVP 지원 범위가 아닌 제품입니다.", details: (product.productCode || "제품 코드 미확인") + " · " + supportStatusLabel(product.supportStatus), lastStage: "CONSULTATION_REQUIRED", owner: "상담원·운영 담당자", changedAt: product.updatedAt || product.installedAt });
      }
    });

    (state.customers || []).forEach(function (customer) {
      if (productIds.indexOf(customer.productId) < 0) return;
      if (["UNANSWERED", "READY", "IN_PROGRESS"].indexOf(customer.questionnaireStatus) >= 0) {
        rows.push({ type: "QUESTIONNAIRE_UNANSWERED", target: customer.id, reason: "사전 문진이 제출되지 않았습니다.", lastStage: customer.questionnaireStatus, owner: "고객", changedAt: null });
      }
    });

    (state.questionnaireSessions || state.questionnaires || []).forEach(function (item) {
      if (item.productId && productIds.indexOf(item.productId) < 0) return;
      var questionnaireStatus = item.questionnaireStatus || item.status;
      if (["UNANSWERED", "READY", "IN_PROGRESS"].indexOf(questionnaireStatus) >= 0) rows.push({ type: "QUESTIONNAIRE_UNANSWERED", target: item.id, reason: "사전 문진이 제출되지 않았습니다.", lastStage: questionnaireStatus, owner: "고객", changedAt: item.updatedAt || item.dueAt });
    });

    inquiries.forEach(function (inquiry) {
      var ageHours = (reference.getTime() - new Date(inquiry.updatedAt || inquiry.createdAt || reference).getTime()) / 3600000;
      if (["RESOLVED", "CANCELLED"].indexOf(inquiry.status) < 0 && ageHours >= 48) rows.push({ type: "PROCESSING_DELAY", target: inquiry.id, inquiryId: inquiry.id, reason: "마지막 상태 변경 후 48시간 이상 경과했습니다.", lastStage: inquiry.status, owner: ownerLabel(inquiry), changedAt: inquiry.updatedAt });
      if (inquiry.aiOutcome === "NO_EVIDENCE" || inquiry.officialSearchFailed || inquiry.evidenceStatus === "NOT_FOUND") rows.push({ type: "NO_EVIDENCE", target: inquiry.id, inquiryId: inquiry.id, reason: "현재 제품·증상 범위의 검증된 공식 근거가 없어 상담으로 전환되었습니다.", details: "문의 " + statusLabel(inquiry.status) + " · 사용 안내 " + ((inquiry.usageGuidance && inquiry.usageGuidance.usageStatus) || "PENDING_CONSULTATION"), lastStage: inquiry.aiState || inquiry.status, owner: ownerLabel(inquiry), changedAt: inquiry.updatedAt });
      if (inquiry.aiState === "FAILED" || inquiry.failedStage || Number(inquiry.aiFailureCount || 0) > 0) rows.push({ type: "AI_PROCESSING_FAILED", target: inquiry.id, inquiryId: inquiry.id, reason: "AI 처리 실패 이력을 확인하고 실패 단계부터 재시도하거나 상담으로 전환해야 합니다.", details: failureDetails(inquiry), lastStage: inquiry.aiState || inquiry.status, owner: ownerLabel(inquiry), changedAt: inquiry.updatedAt });
      if (inquiry.reanalysisRequired) rows.push({ type: "PRODUCT_REANALYSIS_REQUIRED", target: inquiry.id, inquiryId: inquiry.id, reason: "제품 모델 변경으로 기존 근거가 무효화되어 재분석이 필요합니다.", details: "AI " + aiStatusLabel(inquiry.aiState), lastStage: inquiry.aiState || inquiry.status, owner: ownerLabel(inquiry), changedAt: inquiry.updatedAt });
    });

    (supportRequests || []).forEach(function (request) {
      var product = (state.products || []).find(function (item) { return item.id === request.productId; }) || {};
      rows.push({
        type: "PRODUCT_VALIDATION_FAILED", target: request.id, supportRequestId: request.id,
        reason: request.reason || product.supportMessage || "제품 지원 범위 확인이 필요합니다.",
        details: (product.productCode || request.productId || "제품 미확인") + " · " + supportStatusLabel(request.validationStatus || product.supportStatus),
        lastStage: request.status || "CONSULTATION_REQUIRED", owner: "상담원·운영 담당자", changedAt: request.updatedAt || request.createdAt
      });
    });

    (state.operationalExceptions || []).forEach(function (item) {
      if (item.inquiryId && inquiryIds.indexOf(item.inquiryId) < 0) return;
      rows.push({ type: normalizedExceptionType(item), target: item.targetId || item.inquiryId || item.id, inquiryId: item.inquiryId, reason: item.reason || item.message || "운영 예외가 기록되었습니다.", details: failureDetails(item), lastStage: item.lastStage || item.failedStage, owner: item.ownerRole || item.owner, changedAt: item.changedAt || item.detectedAt });
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
      NO_EVIDENCE: "공식 근거 없음", EVIDENCE_SEARCH_FAILED: "공식 근거 검색 실패", AI_PROCESSING_FAILED: "AI 처리 실패",
      PRODUCT_VALIDATION_FAILED: "제품 지원 범위 예외", PRODUCT_REANALYSIS_REQUIRED: "제품 재분석 필요", SAVE_FAILED: "저장 실패",
      AUTH_FAILED: "권한 실패", RETRY_EXCEEDED: "재시도 초과", OPERATION_EXCEPTION: "운영 예외"
    })[type] || type;
  }

  function exceptionTone(type) {
    return ["NO_EVIDENCE", "EVIDENCE_SEARCH_FAILED", "AI_PROCESSING_FAILED", "SAVE_FAILED", "AUTH_FAILED", "RETRY_EXCEEDED"].indexOf(type) >= 0 ? "danger" : "warning";
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

  function aiStatusTone(code) {
    if (code === "COMPLETED") return "success";
    if (code === "FAILED") return "danger";
    if (code === "CANCELLED") return "outline";
    return "info";
  }

  function visitStatusTone(code) {
    if (code === "COMPLETED") return "success";
    if (code === "FOLLOW_UP_REQUIRED" || code === "SCHEDULING" || code === "ASSIGNING") return "warning";
    if (code === "CONFIRMED" || code === "IN_PROGRESS") return "purple";
    return "outline";
  }

  function separatedStateTable(inquiries) {
    if (!inquiries.length) return '<div class="v6-empty"><span>⌕</span><strong>표시할 상태가 없습니다.</strong><p>필터를 변경해 주세요.</p></div>';
    return '<div class="v6-table-wrap"><table class="v6-table"><thead><tr><th>문의·제품</th><th>문의 상태</th><th>방문 상태</th><th>AI 처리 상태</th><th>AI 종료·실패 상세</th></tr></thead><tbody>' + inquiries.map(function (inquiry) {
      var product = productFor(inquiry);
      var visit = visitFor(inquiry);
      var visitStatus = visit ? visit.status : "NOT_CREATED";
      var aiState = inquiry.aiState || "IDLE";
      var aiDetail = aiState === "FAILED" ? (failureDetails(inquiry) || "실패 상세 확인 필요") : aiOutcomeLabel(inquiry.aiOutcome);
      return '<tr><td><strong>' + escape(inquiry.id) + '</strong><small>' + escape((product.productCode || "제품 미확인") + " · " + supportStatusLabel(product.supportStatus)) + '</small></td>' +
        '<td>' + chip(statusLabel(inquiry.status), statusTone(inquiry.status)) + '<small>stateVersion ' + escape(inquiry.stateVersion == null ? "-" : inquiry.stateVersion) + '</small></td>' +
        '<td>' + chip(visitStatusLabel(visitStatus), visitStatusTone(visitStatus)) + '<small>' + escape(visit ? visit.id : "VisitRequest 없음") + '</small></td>' +
        '<td>' + chip(aiStatusLabel(aiState), aiStatusTone(aiState)) + '<small>문의 상태와 독립 관리</small></td>' +
        '<td><strong>' + escape(aiDetail) + '</strong><small>' + escape(formatDateTime(inquiry.updatedAt)) + '</small></td></tr>';
    }).join("") + '</tbody></table></div>';
  }

  function productSupportPanel(requests) {
    return '<section id="operator-support-requests" class="v6-panel" style="margin-top:16px"><div class="v6-panel-head"><div><h2>제품 지원 범위 상담 요청</h2><p>미지원·후속 확장·보관·정보 불완전 제품의 상담 연결 현황</p></div><div class="v6-exception-summary">' + chip(requests.length + "건", requests.length ? "warning" : "success") + chip("조회 전용", "outline") + '</div></div>' +
      (requests.length ? '<div class="v6-table-wrap"><table class="v6-table"><thead><tr><th>요청</th><th>고객·제품</th><th>검증 상태</th><th>상담 요청 사유</th><th>접수 시각</th></tr></thead><tbody>' + requests.map(function (request) {
        var product = (state.products || []).find(function (item) { return item.id === request.productId; }) || {};
        var customer = (state.customers || []).find(function (item) { return item.id === request.customerId; }) || {};
        var supportStatus = request.validationStatus || product.supportStatus || "INCOMPLETE";
        return '<tr><td><strong>' + escape(request.id) + '</strong><small>' + escape(request.status || "CONSULTATION_REQUIRED") + '</small></td>' +
          '<td><strong>' + escape(customer.name || customer.displayName || request.customerId || "고객 미확인") + '</strong><small>' + escape(product.productCode || request.productId || "제품 미확인") + '</small></td>' +
          '<td>' + chip(supportStatusLabel(supportStatus), supportStatus === "ARCHIVED" || supportStatus === "UNSUPPORTED" ? "danger" : "warning") + '</td>' +
          '<td><strong>' + escape(request.reason || product.supportMessage || "제품 지원 범위 확인 필요") + '</strong></td>' +
          '<td>' + escape(formatDateTime(request.updatedAt || request.createdAt)) + '</td></tr>';
      }).join("") + '</tbody></table></div>' : '<div class="v6-empty"><span>✓</span><strong>접수된 제품 지원 범위 상담 요청이 없습니다.</strong><p>지원 범위 밖 제품 요청이 접수되면 이 영역에 표시됩니다.</p></div>') + '</section>';
  }

  function render() {
    state = Store.getState();
    var inquiries = filteredInquiries();
    var total = inquiries.length;
    var counselCount = inquiries.filter(function (item) { return Boolean(item.assignedCounselorId || item.path === "COUNSEL" || item.status.indexOf("CONSULTATION") >= 0); }).length;
    var visitCount = inquiries.filter(function (item) { return Boolean(visitFor(item) || item.assignedTechnicianId || item.path === "VISIT" || item.status.indexOf("VISIT") >= 0); }).length;
    var completedCount = inquiries.filter(function (item) { return item.status === "RESOLVED"; }).length;
    var supportRequests = filteredSupportRequests();
    var exceptions = operationalExceptions(inquiries, supportRequests);
    var symptomValues = [];
    (state.inquiries || []).forEach(function (item) { (item.symptomCodes || []).forEach(function (code) { symptomValues.push(code); }); });
    var modelValues = (state.products || []).map(function (item) { return item.productCode; });
    var managementValues = (state.products || []).map(function (item) { return item.managementType; });
    var handlerValues = (state.staff || []).filter(function (item) { return item.role === "COUNSELOR" || item.role === "TECHNICIAN"; });
    var outcomeValues = Array.from(new Set((state.inquiries || []).map(outcomeCode)));
    var aiStateValues = (state.inquiries || []).map(function (item) { return item.aiState || "IDLE"; });
    var visitStatusValues = ["NOT_CREATED"].concat((state.visits || []).map(function (item) { return item.status; }));
    var supportStatusValues = (state.products || []).map(function (item) { return item.supportStatus || "INCOMPLETE"; }).concat((state.productSupportRequests || []).map(function (item) { return item.validationStatus; }));

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
      '<label class="v6-filter">AI 처리 상태<select data-operator-filter="aiState"><option value="ALL">전체 AI 상태</option>' + uniqueOptions(aiStateValues, aiStatusLabel) + '</select></label>' +
      '<label class="v6-filter">방문 진행 상태<select data-operator-filter="visitStatus"><option value="ALL">전체 방문 상태</option>' + uniqueOptions(visitStatusValues, visitStatusLabel) + '</select></label>' +
      '<label class="v6-filter">제품 지원 상태<select data-operator-filter="supportStatus"><option value="ALL">전체 지원 상태</option>' + uniqueOptions(supportStatusValues, supportStatusLabel) + '</select></label>' +
      '<label class="v6-filter">처리 결과<select data-operator-filter="outcome"><option value="ALL">전체 결과</option>' + uniqueOptions(outcomeValues, outcomeLabel) + '</select></label>' +
      '<div class="v6-operator-filters__summary"><span>선택 조건 결과 <b>' + total + '</b>건 · 필터 변경 즉시 다시 계산</span><button class="v6-button v6-button--secondary" type="button" data-reset-operator-filters>필터 초기화</button></div></section>' +
      '<section class="v6-metric-grid" aria-label="운영 핵심 지표">' + metricCard("조회 문의", total, "현재 필터 기준", "", "◎") + metricCard("상담 전환", counselCount, percentage(counselCount, total) + "% · 담당 상담 연결", "warning", "↗") + metricCard("방문 전환", visitCount, percentage(visitCount, total) + "% · 방문 객체 연결", "", "□") + metricCard("최종 완료", completedCount, percentage(completedCount, total) + "% · RESOLVED", "safe", "✓") + '</section>' +
      '<div class="v6-operator-grid"><section class="v6-panel"><div class="v6-panel-head"><div><h2>주요 증상 유형</h2><p>복수 증상은 각각 1건으로 집계</p></div><span>' + total + '건 기준</span></div><div class="v6-chart-body">' + symptomChart(inquiries) + '</div></section><section class="v6-panel"><div class="v6-panel-head"><div><h2>문의 처리 상태</h2><p>FIX v6 상태 코드 기준</p></div><span>' + total + '건</span></div><div class="v6-chart-body">' + statusChart(inquiries) + '</div></section></div>' +
      '<section class="v6-panel" style="margin-bottom:16px"><div class="v6-panel-head"><div><h2>문의·방문·AI 상태 분리 조회</h2><p>세 상태 흐름을 서로 다른 필드로 확인하며 운영 화면에서는 변경할 수 없습니다.</p></div><span>' + total + '건</span></div>' + separatedStateTable(inquiries) + '</section>' +
      '<section id="operator-flow" class="v6-panel"><div class="v6-panel-head"><div><h2>상담·방문 전환 집계</h2><p>고객 입력부터 최종 완료까지의 현재 누적 건수</p></div><span>중복 경로 포함</span></div><div class="v6-flow-grid"><article class="v6-flow-card"><span>전체 문의</span><strong>' + total + '</strong><small>100%</small></article><article class="v6-flow-card"><span>상담 연결</span><strong>' + counselCount + '</strong><small>' + percentage(counselCount, total) + '%</small></article><article class="v6-flow-card"><span>방문 연결</span><strong>' + visitCount + '</strong><small>' + percentage(visitCount, total) + '%</small></article><article class="v6-flow-card"><span>최종 완료</span><strong>' + completedCount + '</strong><small>' + percentage(completedCount, total) + '%</small></article></div></section>' +
      productSupportPanel(supportRequests) +
      '<section id="operator-exceptions" class="v6-panel" style="margin-top:16px"><div class="v6-panel-head"><div><h2>운영 예외</h2><p>제품 검증·케어 일정·문진·근거 부재·AI·저장·권한 실패를 구분합니다.</p></div><div class="v6-exception-summary">' + chip(exceptions.length + "건", exceptions.length ? "warning" : "success") + chip("상태 변경 불가", "outline") + '</div></div>' + (exceptions.length ? '<div class="v6-table-wrap"><table class="v6-table v6-exception-table"><thead><tr><th>예외 유형</th><th>대상</th><th>예외 사유·상세</th><th>마지막 단계·담당</th><th>마지막 변경</th></tr></thead><tbody>' + exceptions.map(function (item) { return '<tr><td>' + chip(exceptionLabel(item.type), exceptionTone(item.type)) + '</td><td><strong>' + escape(item.target) + '</strong>' + (item.inquiryId ? '<small>연결 문의 · ' + escape(item.inquiryId) + '</small>' : item.supportRequestId ? '<small>제품 지원 요청</small>' : "") + '</td><td><strong>' + escape(item.reason) + '</strong>' + (item.details ? '<small>' + escape(item.details) + '</small>' : "") + '</td><td><strong>' + escape(processStageLabel(item.lastStage)) + '</strong><small>' + escape(item.owner || "담당 주체 확인 필요") + '</small></td><td>' + escape(formatDateTime(item.changedAt)) + '</td></tr>'; }).join("") + '</tbody></table></div>' : '<div class="v6-empty"><span>✓</span><strong>현재 조건에서 감지된 운영 예외가 없습니다.</strong><p>필터를 변경하면 해당 범위의 예외를 다시 계산합니다.</p></div>') + '</section>';
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
    list.innerHTML = items.length ? items.map(function (item) { return '<button class="v6-notification-item' + (!item.read && !seenNotificationIds[item.id] ? " is-unread" : "") + '" type="button" data-operator-notification-id="' + escape(item.id || "") + '" data-operator-notification-inquiry="' + escape(item.inquiryId || "") + '" data-operator-notification-support="' + escape(item.productSupportRequestId || "") + '"><span>!</span><div><strong>' + escape(item.title) + '</strong><p>' + escape(item.message) + '</p><small>' + escape(formatDateTime(item.createdAt)) + '</small></div></button>'; }).join("") : '<div class="v6-notification-empty">새 운영 알림이 없습니다.</div>';
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
    filters = { period: "ALL", model: "ALL", management: "ALL", handler: "ALL", symptom: "ALL", risk: "ALL", priority: "ALL", status: "ALL", aiState: "ALL", visitStatus: "ALL", supportStatus: "ALL", outcome: "ALL" };
    render();
  });

  document.getElementById("operator-notification-toggle").addEventListener("click", function () { setNotificationPanel(!notificationOpen); });
  document.getElementById("operator-notification-panel").addEventListener("click", function (event) {
    if (event.target.closest("[data-close-notifications]")) { setNotificationPanel(false); return; }
    var item = event.target.closest("[data-operator-notification-id]");
    if (!item) return;
    seenNotificationIds[item.dataset.operatorNotificationId] = true;
    var inquiry = (state.inquiries || []).find(function (candidate) { return candidate.id === item.dataset.operatorNotificationInquiry; });
    var supportRequest = (state.productSupportRequests || []).find(function (candidate) { return candidate.id === item.dataset.operatorNotificationSupport; });
    if (inquiry) {
      filters = { period: "ALL", model: "ALL", management: "ALL", handler: "ALL", symptom: "ALL", risk: inquiry.riskLevel || "ALL", priority: "ALL", status: inquiry.status || "ALL", aiState: inquiry.aiState || "ALL", visitStatus: "ALL", supportStatus: "ALL", outcome: "ALL" };
    } else if (supportRequest) {
      filters = { period: "ALL", model: "ALL", management: "ALL", handler: "ALL", symptom: "ALL", risk: "ALL", priority: "ALL", status: "ALL", aiState: "ALL", visitStatus: "ALL", supportStatus: supportRequest.validationStatus || "ALL", outcome: "ALL" };
    }
    setNotificationPanel(false);
    render();
    window.requestAnimationFrame(function () {
      var target = document.getElementById(supportRequest ? "operator-support-requests" : "operator-flow");
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
