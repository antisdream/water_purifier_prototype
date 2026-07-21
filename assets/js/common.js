(function () {
  "use strict";

  var statusMap = {
    RECEIVED: { label: "문의 접수", customer: "문의가 접수되었어요", next: "제품 상태를 확인하고 있어요", tone: "info", stage: 0 },
    ADDITIONAL_QUESTIONS: { label: "추가 질문", customer: "제품 상태를 확인하고 있어요", next: "추가 질문에 답변해 주세요", tone: "info", stage: 1 },
    SELF_ACTION: { label: "자가조치 안내", customer: "확인 방법을 안내했어요", next: "안내된 확인 후 결과를 알려주세요", tone: "teal", stage: 1 },
    ACTION_RESULT: { label: "조치 결과 확인", customer: "확인 결과를 검토하고 있어요", next: "상담 연결을 선택할 수 있어요", tone: "warning", stage: 1 },
    WAITING_COUNSEL: { label: "상담 대기", customer: "상담 연결을 준비하고 있어요", next: "상담사가 문의 내용을 확인할 예정이에요", tone: "warning", stage: 2 },
    IN_COUNSEL: { label: "상담 진행", customer: "상담이 진행 중이에요", next: "상담 결과를 안내해 드릴게요", tone: "warning", stage: 2 },
    VISIT_SCHEDULED: { label: "방문 예정", customer: "방문 점검이 예정되었어요", next: "방문 전 제품을 분해하지 말고 기다려 주세요", tone: "purple", stage: 3 },
    VISIT_COMPLETE: { label: "방문 완료", customer: "방문 점검이 완료되었어요", next: "처리 후 제품 상태를 확인해 주세요", tone: "teal", stage: 4 },
    RESOLUTION_PENDING: { label: "고객 확인 대기", customer: "처리 결과를 확인해 주세요", next: "안내 후 증상이 해결됐는지 알려주세요", tone: "teal", stage: 4 },
    COMPLETION_PENDING: { label: "처리 완료 대기", customer: "해결 확인이 접수됐어요", next: "담당자의 최종 완료 처리를 기다려 주세요", tone: "teal", stage: 4 },
    COMPLETED: { label: "처리 완료", customer: "모든 처리가 완료되었어요", next: "언제든 새 문의를 시작할 수 있어요", tone: "success", stage: 4 }
  };

  var scheduleStatusMap = (window.WATERCARE_WORKFLOW_CONFIG && window.WATERCARE_WORKFLOW_CONFIG.scheduleStatuses) || {
    ASSIGNING: { label: "기사 배정 중", customerLabel: "방문기사를 배정하고 있어요" },
    COORDINATING: { label: "일정 조율 중", customerLabel: "희망 일정을 조율하고 있어요" },
    CONFIRMED: { label: "방문 확정", customerLabel: "방문 일정이 확정되었어요" }
  };

  var riskMap = {
    GENERAL: { label: "일반", tone: "success", description: "현재 확인된 위험 신호 없음" },
    CAUTION: { label: "주의", tone: "warning", description: "추가 확인 또는 상담 권장" },
    DANGER: { label: "위험", tone: "danger", description: "안전 안내와 우선 대응 필요" }
  };

  var priorityMap = {
    NORMAL: { label: "일반", order: 1 },
    HIGH: { label: "우선", order: 2 },
    URGENT: { label: "긴급", order: 3 }
  };

  var symptomMap = {
    LOW_FLOW: "출수량 저하",
    TASTE_ODOR: "물맛·냄새 이상",
    LEAK: "누수",
    TEMPERATURE: "냉·온수 온도 이상",
    OTHER: "기타 증상"
  };

  var actionResultMap = {
    RESOLVED: "해결",
    IMPROVED: "일부 개선",
    SAME: "동일",
    WORSE: "악화",
    NOT_PERFORMED: "미수행"
  };

  var customerTypeMap = {
    INDIVIDUAL: "개인 고객",
    BUSINESS: "기업 고객"
  };

  var serviceTypeMap = {
    AS: "A/S 점검",
    INSTALL: "신규 설치",
    REPAIR: "수리",
    REGULAR_CARE: "정기 케어"
  };

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value, options) {
    if (!value) return "—";
    var date = new Date(value.length === 10 ? value + "T00:00:00" : value);
    if (Number.isNaN(date.getTime())) return escapeHTML(value);
    return new Intl.DateTimeFormat("ko-KR", options || { year: "numeric", month: "long", day: "numeric" }).format(date);
  }

  function formatShortDate(value) {
    return formatDate(value, { month: "short", day: "numeric", weekday: "short" });
  }

  function formatDateTime(value) {
    return formatDate(value, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function daysUntil(value) {
    if (!value) return null;
    var target = new Date(value + "T00:00:00");
    var base = new Date("2026-07-16T00:00:00+09:00");
    return Math.ceil((target - base) / 86400000);
  }

  function getCustomer(state, id) {
    return state.customers.find(function (item) { return item.id === id; });
  }

  function getProduct(state, id) {
    return state.products.find(function (item) { return item.id === id; });
  }

  function getStaff(state, id) {
    return state.staff.find(function (item) { return item.id === id; });
  }

  function inquiryContext(state, inquiry) {
    return {
      inquiry: inquiry,
      customer: getCustomer(state, inquiry.customerId),
      product: getProduct(state, inquiry.productId),
      counselor: inquiry.counselor && inquiry.counselor.id ? getStaff(state, inquiry.counselor.id) : null,
      engineer: inquiry.visit && inquiry.visit.engineerId ? getStaff(state, inquiry.visit.engineerId) : null
    };
  }

  function chip(text, tone, extraClass) {
    return '<span class="chip chip--' + escapeHTML(tone || "neutral") + (extraClass ? " " + escapeHTML(extraClass) : "") + '">' + escapeHTML(text) + "</span>";
  }

  function statusChip(code, customerFacing) {
    var status = statusMap[code] || { label: code, customer: code, tone: "neutral" };
    return chip(customerFacing ? status.customer : status.label, status.tone, "status-chip");
  }

  function riskChip(code) {
    var risk = riskMap[code] || { label: code, tone: "neutral" };
    return chip("위험도 · " + risk.label, risk.tone, "risk-chip");
  }

  function symptomLabels(codes) {
    return (codes || []).map(function (code) { return symptomMap[code] || code; });
  }

  function showToast(message, tone) {
    var toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = "toast is-visible" + (tone ? " toast--" + tone : "");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.className = "toast"; }, 3200);
  }

  function query(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function setQuery(params) {
    var url = new URL(window.location.href);
    Object.keys(params).forEach(function (key) {
      if (params[key] == null || params[key] === "") url.searchParams.delete(key);
      else url.searchParams.set(key, params[key]);
    });
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }

  function normalizeMenuSearchText(value) {
    var text = String(value == null ? "" : value);
    if (typeof text.normalize === "function") text = text.normalize("NFKC");
    return text.toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
  }

  function initMenuSearch(options) {
    options = options || {};
    var root = document.getElementById(options.rootId);
    if (!root) return null;

    if (root.__waterCareMenuSearch) {
      root.__waterCareMenuSearch.setItems(options.items || []);
      return root.__waterCareMenuSearch;
    }

    var input = root.querySelector("[data-menu-search-input]");
    var results = root.querySelector("[data-menu-search-results]");
    if (!input || !results) return null;

    var items = Array.isArray(options.items) ? options.items.slice() : [];
    var filteredItems = [];
    var activeIndex = -1;
    var isOpen = false;
    var composing = false;
    var optionIdPrefix = String(options.rootId || "menu-search").replace(/[^A-Za-z0-9_-]/g, "-") + "-option-";

    if (!results.id) results.id = String(options.rootId || "menu-search") + "-results";
    if (!root.getAttribute("role") && !root.querySelector('[role="search"]')) root.setAttribute("role", "search");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-haspopup", "listbox");
    input.setAttribute("aria-controls", results.id);
    input.setAttribute("aria-expanded", "false");
    results.setAttribute("role", "listbox");
    results.hidden = true;

    function searchableText(item) {
      var keywords = Array.isArray(item.keywords) ? item.keywords.join(" ") : item.keywords;
      return normalizeMenuSearchText([
        item.id,
        item.label,
        item.category,
        item.description,
        keywords
      ].join(" "));
    }

    function matchingItems(query) {
      var normalizedQuery = normalizeMenuSearchText(query);
      if (!normalizedQuery) return items.slice();
      var terms = normalizedQuery.split(" ").filter(Boolean);
      return items.filter(function (item) {
        var haystack = searchableText(item || {});
        return terms.every(function (term) { return haystack.indexOf(term) >= 0; });
      });
    }

    function updateActiveOption(index) {
      var optionsInList = results.querySelectorAll("[data-menu-search-option]");
      if (!filteredItems.length) index = -1;
      else if (index < 0) index = 0;
      else if (index >= filteredItems.length) index = filteredItems.length - 1;
      activeIndex = index;

      optionsInList.forEach(function (option, optionIndex) {
        var selected = optionIndex === activeIndex;
        option.classList.toggle("is-active", selected);
        option.setAttribute("aria-selected", selected ? "true" : "false");
      });

      if (activeIndex >= 0 && optionsInList[activeIndex]) {
        input.setAttribute("aria-activedescendant", optionsInList[activeIndex].id);
        optionsInList[activeIndex].scrollIntoView({ block: "nearest" });
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    }

    function renderResults() {
      filteredItems = matchingItems(input.value);
      if (!filteredItems.length) {
        results.innerHTML = '<div class="menu-search-empty">검색 결과가 없습니다.</div>';
        activeIndex = -1;
        input.removeAttribute("aria-activedescendant");
        return;
      }

      results.innerHTML = filteredItems.map(function (item, index) {
        var optionId = optionIdPrefix + index;
        return '<div class="menu-search-option" id="' + escapeHTML(optionId) + '" role="option" aria-selected="false" data-menu-search-option="' + index + '">' +
          '<span class="menu-search-option-copy"><strong>' + escapeHTML(item.label) + '</strong>' +
            (item.description ? '<small>' + escapeHTML(item.description) + '</small>' : "") +
          '</span>' +
          (item.category ? '<span class="menu-search-option-category">' + escapeHTML(item.category) + '</span>' : "") +
        '</div>';
      }).join("");
      updateActiveOption(activeIndex >= 0 ? Math.min(activeIndex, filteredItems.length - 1) : 0);
    }

    function openResults() {
      renderResults();
      results.hidden = false;
      isOpen = true;
      input.setAttribute("aria-expanded", "true");
    }

    function closeResults() {
      results.hidden = true;
      isOpen = false;
      activeIndex = -1;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }

    function selectItem(index) {
      var item = filteredItems[index];
      if (!item) return;
      closeResults();
      input.value = "";
      if (typeof item.onSelect === "function") item.onSelect(item);
    }

    input.addEventListener("focus", openResults);
    input.addEventListener("click", function () {
      if (!isOpen) openResults();
    });
    input.addEventListener("blur", function () { closeResults(); });
    input.addEventListener("compositionstart", function () { composing = true; });
    input.addEventListener("compositionend", function () {
      composing = false;
      activeIndex = -1;
      openResults();
    });
    input.addEventListener("input", function () {
      if (!composing) {
        activeIndex = -1;
        openResults();
      }
    });
    input.addEventListener("keydown", function (event) {
      if (event.isComposing || composing) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!isOpen) openResults();
        updateActiveOption(activeIndex < filteredItems.length - 1 ? activeIndex + 1 : 0);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!isOpen) openResults();
        updateActiveOption(activeIndex > 0 ? activeIndex - 1 : filteredItems.length - 1);
      } else if (event.key === "Enter" && isOpen) {
        event.preventDefault();
        selectItem(activeIndex >= 0 ? activeIndex : 0);
      } else if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        closeResults();
      }
    });

    results.addEventListener("mousedown", function (event) {
      if (event.target.closest("[data-menu-search-option]")) event.preventDefault();
    });
    results.addEventListener("mouseover", function (event) {
      var option = event.target.closest("[data-menu-search-option]");
      if (option && results.contains(option)) updateActiveOption(Number(option.dataset.menuSearchOption));
    });
    results.addEventListener("click", function (event) {
      var option = event.target.closest("[data-menu-search-option]");
      if (!option || !results.contains(option)) return;
      selectItem(Number(option.dataset.menuSearchOption));
    });

    function handleDocumentClick(event) {
      if (!root.contains(event.target)) closeResults();
    }

    function handleShortcut(event) {
      if (event.key !== "/" || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      var target = event.target;
      var tagName = target && target.tagName ? target.tagName.toLowerCase() : "";
      if (tagName === "input" || tagName === "textarea" || tagName === "select" || (target && target.isContentEditable)) return;
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      input.focus();
      input.select();
      openResults();
    }

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleShortcut);

    var controller = {
      close: closeResults,
      focus: function () { input.focus(); openResults(); },
      setItems: function (nextItems) {
        items = Array.isArray(nextItems) ? nextItems.slice() : [];
        if (isOpen) openResults();
      },
      destroy: function () {
        closeResults();
        document.removeEventListener("click", handleDocumentClick);
        document.removeEventListener("keydown", handleShortcut);
        delete root.__waterCareMenuSearch;
      }
    };
    root.__waterCareMenuSearch = controller;
    return controller;
  }

  function initNotificationCenter(options) {
    options = options || {};
    var toggle = document.getElementById(options.toggleId);
    var panel = document.getElementById(options.panelId);
    if (!toggle || !panel) return null;

    if (toggle.__waterCareNotificationCenter) {
      toggle.__waterCareNotificationCenter.refresh();
      return toggle.__waterCareNotificationCenter;
    }

    var list = panel.querySelector("[data-notification-list]");
    var badge = toggle.querySelector("[data-notification-badge]");
    var count = toggle.querySelector("[data-notification-count]");
    var summary = panel.querySelector("[data-notification-panel-summary]");
    var readAll = panel.querySelector("[data-notification-read-all]");
    var closeButton = panel.querySelector("[data-notification-close]");
    var liveStatus = document.querySelector("[data-notification-status]");
    var items = [];
    var isOpen = false;
    var initialized = false;
    var contextKey = null;
    var knownItemIds = {};
    var announcementTimer = null;
    var allowedTones = { neutral: true, info: true, success: true, warning: true, danger: true, teal: true, purple: true };
    if (!list || !badge || !count) return null;

    function safeTone(value) {
      return allowedTones[value] ? value : "neutral";
    }

    function iconForTone(tone) {
      if (tone === "danger" || tone === "warning") return "!";
      if (tone === "success" || tone === "teal") return "✓";
      return "i";
    }

    function announce(message) {
      if (!liveStatus || !message) return;
      window.clearTimeout(announcementTimer);
      liveStatus.textContent = "";
      announcementTimer = window.setTimeout(function () { liveStatus.textContent = message; }, 20);
    }

    function currentContextKey() {
      if (typeof options.getContextKey !== "function") return "default";
      return String(options.getContextKey() || "default");
    }

    function notificationItems() {
      var next = typeof options.getItems === "function" ? options.getItems() : [];
      return (Array.isArray(next) ? next : []).filter(function (item) { return item && item.id; }).slice().sort(function (a, b) {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
    }

    function itemMarkup(item) {
      var tone = safeTone(item.tone);
      var unread = !item.readAt;
      var inquiryMeta = item.inquiryId ? '<b>' + escapeHTML(item.inquiryId) + ' · 열기 →</b>' : '<b>내용 확인 →</b>';
      return '<li><button class="notification-item notification-item--' + tone + (unread ? ' is-unread' : '') + '" type="button" data-notification-item="' + escapeHTML(item.id) + '">' +
        '<span class="notification-item-icon" aria-hidden="true">' + iconForTone(tone) + '</span>' +
        '<span class="notification-item-copy"><span class="notification-item-heading"><strong>' + escapeHTML(item.title || "업무 상태가 변경됐습니다") + '</strong><time datetime="' + escapeHTML(item.createdAt || "") + '">' + formatDateTime(item.createdAt) + '</time></span>' +
        '<span class="notification-item-message">' + escapeHTML(item.message || "처리 내용을 확인해 주세요.") + '</span>' +
        '<span class="notification-item-meta"><span>' + (unread ? '<i>읽지 않음</i>' : '<i class="is-read">읽음</i>') + (item.actor ? ' · ' + escapeHTML(item.actor) : '') + '</span>' + inquiryMeta + '</span></span></button></li>';
    }

    function renderItems(reason) {
      var nextContextKey = currentContextKey();
      if (nextContextKey !== contextKey) {
        contextKey = nextContextKey;
        initialized = false;
        knownItemIds = {};
      }

      var focusedItem = panel.contains(document.activeElement) && document.activeElement.closest ? document.activeElement.closest("[data-notification-item]") : null;
      var focusedId = focusedItem ? focusedItem.dataset.notificationItem : null;
      items = notificationItems();
      var unreadItems = items.filter(function (item) { return !item.readAt; });
      var unreadCount = unreadItems.length;
      var badgeValue = unreadCount > 99 ? "99+" : String(unreadCount);

      count.textContent = badgeValue;
      badge.hidden = unreadCount === 0;
      toggle.setAttribute("aria-label", (options.label || "알림") + ", 읽지 않은 알림 " + (unreadCount ? unreadCount + "개" : "없음"));
      if (summary) summary.textContent = unreadCount ? "읽지 않은 알림 " + unreadCount + "개" : "새 알림이 없습니다.";
      if (readAll) readAll.disabled = unreadCount === 0;

      if (items.length) {
        list.innerHTML = items.map(itemMarkup).join("");
      } else {
        list.innerHTML = '<li class="notification-empty"><span aria-hidden="true">✓</span><strong>확인할 알림이 없습니다</strong><p>새로운 처리 내용이 생기면 이곳에 표시됩니다.</p></li>';
      }

      if (initialized) {
        var newUnreadItems = unreadItems.filter(function (item) { return !knownItemIds[item.id]; });
        if (newUnreadItems.length && reason !== "READ_NOTIFICATION" && reason !== "READ_ALL_NOTIFICATIONS") {
          announce("새 알림 " + newUnreadItems.length + "개, " + (newUnreadItems[0].title || "처리 내용을 확인해 주세요."));
        }
      }

      knownItemIds = {};
      items.forEach(function (item) { knownItemIds[item.id] = true; });
      initialized = true;

      if (isOpen && focusedId) {
        window.requestAnimationFrame(function () {
          if (!isOpen) return;
          var selectorId = window.CSS && window.CSS.escape ? window.CSS.escape(focusedId) : focusedId.replace(/"/g, "\\\"");
          var nextFocused = list.querySelector('[data-notification-item="' + selectorId + '"]');
          if (nextFocused) nextFocused.focus({ preventScroll: true });
        });
      }
    }

    function openPanel() {
      if (isOpen) return;
      if (typeof options.onBeforeOpen === "function") options.onBeforeOpen();
      renderItems();
      panel.hidden = false;
      isOpen = true;
      toggle.setAttribute("aria-expanded", "true");
      window.requestAnimationFrame(function () {
        var target = list.querySelector(".notification-item.is-unread") || list.querySelector(".notification-item") || closeButton || panel;
        target.focus({ preventScroll: true });
      });
    }

    function closePanel(restoreFocus) {
      if (!isOpen) return;
      panel.hidden = true;
      isOpen = false;
      toggle.setAttribute("aria-expanded", "false");
      if (restoreFocus && document.contains(toggle)) toggle.focus({ preventScroll: true });
    }

    function itemById(id) {
      return items.find(function (item) { return item.id === id; }) || null;
    }

    function handleToggleClick() {
      if (isOpen) closePanel(true);
      else openPanel();
    }

    function handlePanelClick(event) {
      if (event.target.closest("[data-notification-close]")) {
        event.preventDefault();
        closePanel(true);
        return;
      }
      if (event.target.closest("[data-notification-read-all]")) {
        event.preventDefault();
        if (!readAll || readAll.disabled) return;
        try {
          if (typeof options.onReadAll === "function") options.onReadAll();
          announce("모든 알림을 읽음 처리했습니다.");
        } catch (error) { showToast(error.message || "알림을 읽음 처리하지 못했습니다.", "danger"); }
        return;
      }
      var itemButton = event.target.closest("[data-notification-item]");
      if (!itemButton || !panel.contains(itemButton)) return;
      var item = itemById(itemButton.dataset.notificationItem);
      if (!item) return;
      try {
        if (!item.readAt && typeof options.onRead === "function") options.onRead(item);
        closePanel(false);
        if (typeof options.onSelect === "function") options.onSelect(item);
        else toggle.focus({ preventScroll: true });
      } catch (error) { showToast(error.message || "알림을 열지 못했습니다.", "danger"); }
    }

    function handleDocumentClick(event) {
      if (!isOpen || toggle.contains(event.target) || panel.contains(event.target)) return;
      closePanel(false);
    }

    function handleDocumentFocus(event) {
      if (!isOpen || toggle.contains(event.target) || panel.contains(event.target)) return;
      closePanel(false);
    }

    function handleDocumentKeydown(event) {
      if (!isOpen || event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closePanel(true);
    }

    toggle.addEventListener("click", handleToggleClick);
    panel.addEventListener("click", handlePanelClick);
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("focusin", handleDocumentFocus);
    document.addEventListener("keydown", handleDocumentKeydown);

    var controller = {
      open: openPanel,
      close: function (restoreFocus) { closePanel(restoreFocus !== false); },
      refresh: renderItems,
      isOpen: function () { return isOpen; },
      destroy: function () {
        closePanel(false);
        window.clearTimeout(announcementTimer);
        toggle.removeEventListener("click", handleToggleClick);
        panel.removeEventListener("click", handlePanelClick);
        document.removeEventListener("click", handleDocumentClick);
        document.removeEventListener("focusin", handleDocumentFocus);
        document.removeEventListener("keydown", handleDocumentKeydown);
        delete toggle.__waterCareNotificationCenter;
      }
    };
    toggle.__waterCareNotificationCenter = controller;
    renderItems();
    return controller;
  }

  function careDDay(date) {
    var days = daysUntil(date);
    if (days == null) return "일정 확인 필요";
    if (days === 0) return "D-DAY";
    if (days > 0) return "D-" + days;
    return "D+" + Math.abs(days);
  }

  window.WaterCareUI = {
    statusMap: statusMap,
    scheduleStatusMap: scheduleStatusMap,
    riskMap: riskMap,
    priorityMap: priorityMap,
    symptomMap: symptomMap,
    actionResultMap: actionResultMap,
    customerTypeMap: customerTypeMap,
    serviceTypeMap: serviceTypeMap,
    escapeHTML: escapeHTML,
    formatDate: formatDate,
    formatShortDate: formatShortDate,
    formatDateTime: formatDateTime,
    daysUntil: daysUntil,
    careDDay: careDDay,
    getCustomer: getCustomer,
    getProduct: getProduct,
    getStaff: getStaff,
    inquiryContext: inquiryContext,
    chip: chip,
    statusChip: statusChip,
    riskChip: riskChip,
    symptomLabels: symptomLabels,
    showToast: showToast,
    query: query,
    setQuery: setQuery,
    initMenuSearch: initMenuSearch,
    initNotificationCenter: initNotificationCenter
  };
})();
