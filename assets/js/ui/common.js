(function () {
  "use strict";

  var STATUS = {
    DRAFT: ["작성 중", "neutral"],
    QUESTIONNAIRE_IN_PROGRESS: ["문진 진행 중", "info"],
    AI_GUIDANCE: ["안내 확인 중", "info"],
    CONSULTATION_REQUIRED: ["상담 대기", "warning"],
    CONSULTATION_IN_PROGRESS: ["상담 진행 중", "info"],
    VISIT_REVIEW_PENDING: ["방문 검토 중", "warning"],
    VISIT_SCHEDULING: ["방문 일정 조율 중", "warning"],
    VISIT_SCHEDULED: ["방문 예정", "info"],
    COMPLETION_PENDING: ["처리 결과 확인·최종 완료 대기", "warning"],
    REVISIT_REQUIRED: ["추가 방문 필요", "danger"],
    REOPENED: ["문의 재개", "danger"],
    RESOLVED: ["처리 완료", "success"],
    CANCELLED: ["취소됨", "neutral"],
    ASSIGNING: ["기사 배정 중", "warning"],
    SCHEDULING: ["일정 조율 중", "warning"],
    CONFIRMED: ["방문 확정", "info"],
    IN_PROGRESS: ["방문 진행 중", "info"],
    COMPLETED: ["방문 완료", "success"],
    FOLLOW_UP_REQUIRED: ["추가 방문 필요", "danger"]
  };

  var RISK = {
    GENERAL: ["일반", "success"],
    CAUTION: ["주의", "warning"],
    DANGER: ["위험", "danger"]
  };

  var USAGE = {
    NORMAL: ["일반 사용 가능", "success"],
    PARTIAL_STOP: ["일부 출수·기능 사용 중지", "warning"],
    TOTAL_STOP: ["제품 전체 사용 중지", "danger"],
    PENDING_CONSULTATION: ["판단 보류·상담 필요", "warning"]
  };

  var AI_STATE = {
    IDLE: "분석을 준비하고 있습니다.",
    STRUCTURING: "증상 정보를 분석하고 있습니다.",
    CHECKING_MISSING_FIELDS: "추가 확인 항목을 확인하고 있습니다.",
    SAFETY_CHECK: "안전 기준을 확인하고 있습니다.",
    RETRIEVING: "공식 문서를 검색하고 있습니다.",
    RERANKING: "관련 근거를 정리하고 있습니다.",
    GENERATING: "안내를 작성하고 있습니다.",
    VALIDATING: "결과와 안전성을 확인하고 있습니다.",
    COMPLETED: "분석이 완료되었습니다.",
    FAILED: "처리하지 못했습니다. 입력은 유지됩니다.",
    CANCELLED: "처리가 중단되었습니다."
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function badge(tuple, extra) {
    tuple = tuple || ["확인 필요", "neutral"];
    return '<span class="wc-badge wc-badge--' + escapeHtml(tuple[1]) + (extra ? " " + escapeHtml(extra) : "") + '">' + escapeHtml(tuple[0]) + "</span>";
  }

  function statusLabel(code) {
    return badge(STATUS[code] || [code || "확인 필요", "neutral"]);
  }

  function riskLabel(code) {
    return badge(RISK[String(code || "GENERAL").toUpperCase()] || [code || "확인 필요", "neutral"]);
  }

  function usageLabel(code) {
    return badge(USAGE[code] || [code || "확인 필요", "neutral"]);
  }

  function aiStateLabel(code) {
    return AI_STATE[code] || code || "확인 필요";
  }

  function formatDateTime(value, options) {
    if (!value) return "미정";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ko-KR", Object.assign({
      timeZone: "Asia/Seoul", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    }, options || {})).format(date);
  }

  function evidenceCard(item, options) {
    options = options || {};
    if (!item || ["text_and_visual_verified", "OFFICIAL_VERIFIED"].indexOf(item.verificationStatus) < 0) {
      return '<article class="wc-evidence wc-evidence--held"><span class="wc-source-tag wc-source-tag--held">사용 보류</span><h4>검증된 공식 근거가 없습니다.</h4><p>임의 안내를 제공하지 않고 상담으로 연결합니다.</p></article>';
    }
    var showInternal = Boolean(options.showInternal);
    var allowPdf = options.allowPdf !== false && Boolean(item.sourceDirectDownloadUrl);
    var pages = item.pageRefs && item.pageRefs.length ? item.pageRefs.join(", ") + "쪽" : "페이지 정보 없음";
    var staffMetadata = [
      ["evidence_id", item.evidenceId], ["chunk_id", item.chunkId], ["document_id", item.documentId],
      ["section_title", item.sectionTitle], ["source_type", item.sourceType], ["provider", item.provider],
      ["risk_level", item.riskLevel], ["requires_consultation", item.requiresConsultation ? "true" : "false"],
      ["safe_actions", (item.safeActions || []).join(" · ")], ["escalation_conditions", (item.escalationConditions || []).join(" · ")],
      ["prohibited_actions", (item.prohibitedActions || []).join(" · ")], ["verification_status", item.verificationStatus],
      ["product_code", item.productCode], ["manual_model", item.manualModel], ["product_generation", item.productGeneration],
      ["model_family", item.modelFamily], ["scope_role", item.scopeRole], ["data_classification", item.dataClassification]
    ].filter(function (entry) { return entry[1] !== null && entry[1] !== undefined && entry[1] !== ""; });
    return '<article class="wc-evidence">' +
      '<div class="wc-evidence__head"><span class="wc-source-tag">공식 매뉴얼</span>' + badge(["공식 근거 확인 완료", "success"]) + '</div>' +
      '<h4>' + escapeHtml(item.documentTitle) + '</h4>' +
      '<dl class="wc-evidence__meta"><div><dt>버전</dt><dd>' + escapeHtml(item.documentVersion) + '</dd></div><div><dt>근거 위치</dt><dd>' + escapeHtml(pages) + '</dd></div></dl>' +
      '<p>' + escapeHtml(item.evidenceSummary) + '</p>' +
      (showInternal ? '<details><summary>업무용 근거 메타데이터</summary><dl class="wc-evidence__details">' + staffMetadata.map(function (entry) { return '<div><dt>' + escapeHtml(entry[0]) + '</dt><dd>' + escapeHtml(entry[1]) + '</dd></div>'; }).join("") + '</dl></details>' : '') +
      '<div class="wc-evidence__actions"><a class="wc-button wc-button--secondary" href="' + escapeHtml(item.sourceLandingUrl) + '" target="_blank" rel="noopener noreferrer">공식 출처 보기</a>' +
      (allowPdf ? '<a class="wc-button wc-button--ghost" href="' + escapeHtml(item.sourceDirectDownloadUrl) + '" target="_blank" rel="noopener noreferrer" data-official-pdf>설명서 PDF 열기</a>' : '') + '</div></article>';
  }

  function toast(message, tone) {
    var root = document.getElementById("toast");
    if (!root) return;
    root.textContent = message;
    root.className = "wc-toast is-visible" + (tone ? " wc-toast--" + tone : "");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(function () { root.className = "wc-toast"; }, 3600);
  }

  function notificationsFor(state, actor) {
    return (state.notifications || []).filter(function (item) {
      return actor && item.role === actor.role && item.recipientId === actor.id;
    }).sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  }

  function notificationList(items) {
    if (!items || !items.length) return '<div class="wc-empty"><strong>새 알림이 없습니다.</strong><p>업무가 진행되면 이곳에 연결 알림이 표시됩니다.</p></div>';
    return '<ul class="wc-notification-list">' + items.map(function (item) {
      return '<li class="' + (item.read ? "" : "is-unread") + '" data-notification-id="' + escapeHtml(item.id) + '"><div><strong>' + escapeHtml(item.title) + '</strong><p>' + escapeHtml(item.message) + '</p><time>' + escapeHtml(formatDateTime(item.createdAt)) + '</time></div>' + (item.inquiryId ? '<button class="wc-text-button" type="button" data-open-notification="' + escapeHtml(item.inquiryId) + '">문의 보기</button>' : '') + '</li>';
    }).join("") + "</ul>";
  }

  function context(state, inquiry) {
    if (!inquiry) return {};
    return {
      inquiry: inquiry,
      customer: (state.customers || []).find(function (item) { return item.id === inquiry.customerId; }),
      product: (state.products || []).find(function (item) { return item.id === inquiry.productId; }),
      visit: (state.visits || []).find(function (item) { return item.inquiryId === inquiry.id && item.status !== "CANCELLED"; }),
      evidence: (state.evidenceRegistry || []).filter(function (item) { return (inquiry.evidenceIds || []).indexOf(item.evidenceId) >= 0; })
    };
  }

  function idempotencyKey(prefix, targetId) {
    return [prefix, targetId || "new", Date.now(), Math.random().toString(16).slice(2, 8)].join("-");
  }

  function bindPdfFallback(root) {
    (root || document).addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest("[data-official-pdf]");
      if (!link) return;
      window.setTimeout(function () {
        // 새 창 차단 여부는 브라우저별로 달라 프로토타입에서는 대체 안내를 상시 제공한다.
      }, 0);
    });
  }

  window.WaterCareUI = {
    escape: escapeHtml,
    badge: badge,
    statusLabel: statusLabel,
    riskLabel: riskLabel,
    usageLabel: usageLabel,
    aiStateLabel: aiStateLabel,
    formatDateTime: formatDateTime,
    evidenceCard: evidenceCard,
    toast: toast,
    notificationsFor: notificationsFor,
    notificationList: notificationList,
    context: context,
    idempotencyKey: idempotencyKey,
    bindPdfFallback: bindPdfFallback
  };
}());
