(function () {
  "use strict";

  var Store = window.WaterCareStore;
  var UI = window.WaterCareUI;
  var UsageChart = window.WaterCareUsageChart;
  var ProductViewer = window.WaterCareProductViewer;
  var state = Store.getState();
  var currentView = UI.query("view") || "home";
  var requestedCustomer = UI.query("customer");
  var savedCustomer = null;
  try { savedCustomer = window.sessionStorage.getItem("watercare-one.current-customer"); } catch (error) { /* no-op */ }
  var currentCustomerId = state.customers.some(function (item) { return item.id === requestedCustomer; }) ? requestedCustomer :
    (state.customers.some(function (item) { return item.id === savedCustomer; }) ? savedCustomer : state.customers[0].id);
  var currentInquiryId = UI.query("inquiry");
  var currentProductId = UI.query("product");
  var requestedUsageRange = UI.query("usageRange");
  var currentUsageRange = ["hourly", "weekly", "monthly"].indexOf(requestedUsageRange) >= 0 ? requestedUsageRange : "hourly";
  var notificationController = null;

  function customer() { return UI.getCustomer(state, currentCustomerId); }
  function customerProducts() { return state.products.filter(function (item) { return item.customerId === currentCustomerId; }); }
  function product() {
    var products = customerProducts();
    return products.find(function (item) { return item.id === currentProductId; }) || products.find(function (item) { return item.id === customer().productId; }) || products[0];
  }
  function questionnaireForProduct(productItem) {
    return (state.questionnaires || []).filter(function (item) { return item.productId === productItem.id && item.customerId === currentCustomerId && item.status !== "SUPERSEDED"; }).sort(function (a, b) {
      return String(b.dueAt || "").localeCompare(String(a.dueAt || "")) || String(b.submittedAt || b.generatedAt || b.id || "").localeCompare(String(a.submittedAt || a.generatedAt || a.id || ""));
    })[0] || { status: "NOT_DUE", answers: {} };
  }
  function readyQuestionnaires() {
    return (state.questionnaires || []).filter(function (item) { return item.customerId === currentCustomerId && item.status === "READY"; });
  }
  function productModel(productItem) {
    var models = state.productModels || [];
    return models.find(function (item) { return item.id === productItem.modelId; }) || {
      name: productItem.modelLabel,
      modelCode: productItem.model,
      imagePath: "",
      imageAlt: productItem.modelLabel,
      manuals: []
    };
  }
  function productUsage(productItem) {
    return (state.usageTelemetry || []).find(function (item) { return item.productId === productItem.id; }) || null;
  }
  function smartPreparationProfile(productItem) {
    return (state.smartPreparationProfiles || []).find(function (item) { return item.productId === productItem.id; }) || null;
  }
  function organizationContext() {
    if (customer().customerType !== "BUSINESS") return null;
    var organization = state.organizations.find(function (item) { return item.customerId === currentCustomerId; });
    var site = organization ? state.sites.find(function (item) { return item.organizationId === organization.id; }) : null;
    var contact = organization ? state.contacts.find(function (item) { return item.organizationId === organization.id && item.isPrimary; }) : null;
    return { organization: organization, site: site, contact: contact };
  }
  function customerInquiries() {
    return state.inquiries.filter(function (item) { return item.customerId === currentCustomerId; })
      .sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
  }
  function customerVisits() {
    return customerInquiries().filter(function (item) { return item.visit; }).sort(function (a, b) {
      var aScheduled = a.visit.status === "SCHEDULED" ? 0 : 1;
      var bScheduled = b.visit.status === "SCHEDULED" ? 0 : 1;
      if (aScheduled !== bScheduled) return aScheduled - bScheduled;
      var aTime = a.visit.confirmedAt || a.visit.customerPreferredAt || a.visit.scheduledAt || 0;
      var bTime = b.visit.confirmedAt || b.visit.customerPreferredAt || b.visit.scheduledAt || 0;
      return aScheduled === 0 ? new Date(aTime) - new Date(bTime) : new Date(bTime) - new Date(aTime);
    });
  }
  function activeInquiry() {
    return customerInquiries().find(function (item) { return item.status !== "COMPLETED"; }) || customerInquiries()[0] || null;
  }

  function renderShellState() {
    var switcher = document.getElementById("customer-switcher");
    switcher.innerHTML = state.customers.map(function (item) {
      return '<option value="' + UI.escapeHTML(item.id) + '"' + (item.id === currentCustomerId ? " selected" : "") + ">" + UI.escapeHTML(item.name) + " · " + UI.escapeHTML(UI.customerTypeMap[item.customerType]) + "</option>";
    }).join("");
    document.getElementById("customer-initial").textContent = customer().initials;
    document.querySelectorAll("[data-customer-view]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.customerView === currentView);
      if (button.dataset.customerView === currentView) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    var productSelect = document.getElementById("inquiry-product");
    productSelect.innerHTML = customerProducts().map(function (item) {
      return '<option value="' + UI.escapeHTML(item.id) + '">' + UI.escapeHTML(item.modelLabel) + " · " + UI.escapeHTML(item.installedArea) + (item.assetTag ? " · " + UI.escapeHTML(item.assetTag) : "") + "</option>";
    }).join("");
  }

  function pageHeader(eyebrow, title, description, action) {
    return '<header class="page-header customer-page-heading"><div><p class="eyebrow">' + UI.escapeHTML(eyebrow) + '</p><h1>' + UI.escapeHTML(title) + '</h1><p>' + UI.escapeHTML(description) + '</p></div>' + (action || "") + "</header>";
  }

  function statusJourney(inquiry) {
    var stage = (UI.statusMap[inquiry.status] || { stage: 0 }).stage;
    var labels = ["접수", "상태 확인", "상담", "방문", "완료"];
    return '<ol class="status-journey" aria-label="문의 진행 단계">' + labels.map(function (label, index) {
      var className = index < stage ? "is-done" : (index === stage ? "is-current" : "");
      return '<li class="' + className + '"><span>' + (index < stage ? "✓" : String(index + 1)) + '</span><small>' + label + "</small></li>";
    }).join("") + "</ol>";
  }

  function activeInquiryCard(inquiry) {
    if (!inquiry) {
      return '<section class="section-card empty-inquiry-card"><div class="empty-icon">＋</div><h2>진행 중인 문의가 없어요</h2><p>제품 사용 중 불편한 점을 일상적인 표현으로 알려주세요.</p><button class="button button--primary" type="button" data-open-inquiry>새 문의 시작</button></section>';
    }
    var status = UI.statusMap[inquiry.status];
    var workflow = inquiry.workflow || {};
    return '<section class="section-card active-inquiry-card">' +
      '<div class="card-heading-row"><div><p class="eyebrow">진행 중 문의</p><h2>' + UI.escapeHTML(inquiry.title) + '</h2></div>' + UI.statusChip(inquiry.status, true) + '</div>' +
      '<div class="inquiry-id-row"><span>' + UI.escapeHTML(inquiry.id) + '</span><span>마지막 업데이트 ' + UI.formatDateTime(inquiry.updatedAt) + '</span></div>' +
      statusJourney(inquiry) +
      '<div class="next-action-box"><span aria-hidden="true">→</span><div><small>현재 담당 · ' + UI.escapeHTML(workflow.currentOwnerName || "AI 케어") + '</small><strong>' + UI.escapeHTML(workflow.nextAction || status.next) + '</strong></div></div>' +
      '<div class="card-actions"><button class="button button--secondary" type="button" data-open-case="' + UI.escapeHTML(inquiry.id) + '">문의 상세 보기</button>' +
      '<a class="text-link" href="stakeholder.html?view=queue&amp;inquiry=' + encodeURIComponent(inquiry.id) + '">관계자 전달 화면 확인 <span aria-hidden="true">↗</span></a></div></section>';
  }

  function enterpriseAccountBanner() {
    var context = organizationContext();
    if (!context) return "";
    return '<section class="enterprise-account-banner"><div class="enterprise-account-title"><span class="enterprise-mark">B2B</span><div><small>기업 고객 계정</small><strong>' + UI.escapeHTML(context.organization.name) + '</strong></div></div><dl><div><dt>사업장</dt><dd>' + UI.escapeHTML(context.site.name) + ' · ' + UI.escapeHTML(context.site.siteType) + '</dd></div><div><dt>현장 담당자</dt><dd>' + UI.escapeHTML(context.contact.name) + ' · ' + UI.escapeHTML(context.contact.role) + '</dd></div><div><dt>설치 제품</dt><dd>' + customerProducts().length + '대</dd></div><div><dt>서비스 가능 시간</dt><dd>' + UI.escapeHTML(context.site.serviceWindow) + '</dd></div></dl></section>';
  }

  function visitRequestMarkup(inquiry, detailed) {
    var request = inquiry.visit && inquiry.visit.rescheduleRequest;
    if (!request) return "";
    if (request.status === "REQUESTED") {
      return '<div class="reschedule-state reschedule-state--pending"><b>일정 변경 승인 대기</b><small>현재 ' + UI.formatDateTime(inquiry.visit.scheduledAt) + ' · 희망 ' + UI.formatDateTime(request.desiredAt) + '</small>' + (detailed ? '<p>' + UI.escapeHTML(request.reason) + '</p>' : '') + '</div>';
    }
    if (request.status === "APPROVED") {
      return '<div class="reschedule-state reschedule-state--approved"><b>변경 일정 확정</b><small>' + UI.formatDateTime(inquiry.visit.scheduledAt) + ' · ' + UI.formatDateTime(request.resolvedAt) + ' 승인</small></div>';
    }
    if (request.status === "REJECTED") {
      return '<div class="reschedule-state reschedule-state--rejected"><b>변경 요청 반려 · 기존 일정 유지</b><small>' + UI.escapeHTML(request.resolutionNote || "관계자 확인") + '</small></div>';
    }
    return "";
  }

  function visitScheduleMeta(visit) {
    var code = visit.scheduleStatus || (visit.confirmedAt || visit.scheduledAt ? "CONFIRMED" : (visit.engineerId ? "COORDINATING" : "ASSIGNING"));
    var meta = UI.scheduleStatusMap[code] || { label: code, customerLabel: code };
    return { code: code, label: meta.label, customerLabel: meta.customerLabel, displayAt: visit.confirmedAt || visit.customerPreferredAt || visit.scheduledAt };
  }

  function homeVisitBanner() {
    var upcoming = customerVisits().find(function (item) { return item.visit.status === "SCHEDULED"; });
    if (!upcoming) {
      return '<section class="home-appointment-banner is-empty"><span class="home-appointment-icon" aria-hidden="true">▦</span><div><small>방문 일정·변경</small><strong>현재 확정된 방문 일정이 없어요</strong><p>상담 후 방문이 확정되면 이 화면에서 날짜와 시간을 변경할 수 있습니다.</p></div><button class="button button--secondary" type="button" data-customer-view="schedule">일정 화면 보기</button></section>';
    }
    var context = UI.inquiryContext(state, upcoming);
    var request = upcoming.visit.rescheduleRequest;
    var pending = request && request.status === "REQUESTED";
    var scheduleMeta = visitScheduleMeta(upcoming.visit);
    return '<section class="home-appointment-banner"><span class="home-appointment-icon" aria-hidden="true">▦</span><div><small>' + (pending ? "일정 변경 승인 대기" : scheduleMeta.customerLabel) + '</small><strong>' + (pending ? "희망 " + UI.formatDateTime(request.desiredAt) : (scheduleMeta.code === "CONFIRMED" ? UI.formatDateTime(scheduleMeta.displayAt) : "고객 희망 " + UI.formatDateTime(upcoming.visit.customerPreferredAt))) + '</strong><p>' + (pending ? "현재 " + UI.formatDateTime(upcoming.visit.confirmedAt || upcoming.visit.scheduledAt) + " · 승인 전까지 기존 일정 유지" : UI.escapeHTML((UI.serviceTypeMap[upcoming.visit.serviceType] || "방문 점검") + ' · ' + context.product.model + ' · ' + (context.engineer ? context.engineer.name + ' 기사' : '기사 배정 중'))) + '</p></div>' + (pending || scheduleMeta.code !== "CONFIRMED" ? '<button class="button button--secondary" type="button" data-customer-view="schedule">일정 상태 확인</button>' : '<button class="button button--primary" type="button" data-open-reschedule="' + UI.escapeHTML(upcoming.id) + '">일정 변경</button>') + '</section>';
  }

  function renderHome() {
    var c = customer();
    var p = product();
    var model = productModel(p);
    var inquiry = activeInquiry();
    var questionnaireReady = questionnaireForProduct(p).status === "READY";
    var dday = UI.careDDay(p.nextCareAt);
    return pageHeader("MY CARE", c.customerType === "BUSINESS" ? c.name + " 케어 현황" : c.name + "님, 오늘도 안심 케어하세요", c.customerType === "BUSINESS" ? c.contactName + " " + c.organization.contactRole + "님 · 사업장 제품과 방문 일정을 관리하세요." : "제품 상태와 진행 중인 케어를 한눈에 확인할 수 있어요.", '<button class="button button--primary button--with-icon" type="button" data-open-inquiry><span aria-hidden="true">＋</span> 증상 문의</button>') +
      enterpriseAccountBanner() +
      homeVisitBanner() +
      '<section class="care-hero">' +
        '<div class="care-hero-main"><div class="care-hero-label"><span>다음 정기 케어</span><b>' + dday + '</b></div><p>' + UI.escapeHTML(p.modelLabel) + ' · ' + UI.escapeHTML(p.managementType) + '</p><h2>' + UI.formatDate(p.nextCareAt) + '</h2><div class="care-hero-meta"><span><small>최근 케어</small><strong>' + UI.formatDate(p.lastCareAt) + '</strong></span><span><small>케어 주기</small><strong>' + p.cycleMonths + '개월</strong></span><span><small>필터 잔여</small><strong>' + p.filterLife + '%</strong></span></div></div>' +
        '<div class="care-hero-action"><span class="product-visual product-visual--photo" aria-hidden="true"><img src="' + UI.escapeHTML(model.imagePath) + '" alt=""></span><div><small>' + (questionnaireReady ? "사전 문진이 도착했어요" : "다음 케어를 준비 중이에요") + '</small><strong>' + (questionnaireReady ? "방문 전 제품 상태를 알려주세요" : "예정일 전에 다시 안내해 드릴게요") + '</strong>' + (questionnaireReady ? '<button class="button button--lime" type="button" data-open-questionnaire>3분 문진 시작</button>' : '<button class="button button--light" type="button" data-customer-view="product">제품 상태 보기</button>') + '</div></div>' +
      '</section>' +
      '<div class="customer-dashboard-grid">' + activeInquiryCard(inquiry) +
        '<aside class="section-card product-health-card"><div class="card-heading-row"><div><p class="eyebrow">PRODUCT HEALTH</p><h2>제품 케어 상태</h2></div><span class="health-score">' + (p.status === "SAFETY_HOLD" ? "주의" : "양호") + '</span></div>' +
          '<div class="filter-meter"><div class="filter-meter-top"><span>' + UI.escapeHTML(p.filterLabel) + '</span><strong>' + p.filterLife + '%</strong></div><div class="meter-track"><i style="width:' + p.filterLife + '%"></i></div><small>' + (p.filterLife < 20 ? "교체 시점이 가까워 관리 이력을 확인해 주세요." : "현재 관리 주기에 맞게 사용 중이에요.") + '</small></div>' +
          '<dl class="mini-details"><div><dt>제품 모델</dt><dd>' + UI.escapeHTML(p.modelLabel) + '</dd></div><div><dt>관리 유형</dt><dd>' + UI.escapeHTML(p.managementType) + '</dd></div><div><dt>설치 공간</dt><dd>' + UI.escapeHTML(p.installedArea) + '</dd></div></dl>' +
          '<button class="button button--ghost button--full" type="button" data-customer-view="product">내 제품 자세히 보기</button>' +
        '</aside></div>' +
      '<section class="section-card quick-service-card"><div><p class="eyebrow">QUICK SERVICE</p><h2>필요한 서비스를 바로 이용하세요</h2></div><div class="quick-service-grid">' +
        '<button type="button" data-open-inquiry><span class="quick-icon quick-icon--blue" aria-hidden="true">＋</span><strong>증상 문의</strong><small>불편한 점을 AI와 확인</small></button>' +
        '<button type="button" data-customer-view="schedule"><span class="quick-icon quick-icon--schedule" aria-hidden="true">▦</span><strong>방문 일정</strong><small>' + (customerVisits().some(function (item) { return item.visit.status === "SCHEDULED"; }) ? "일정 확인·변경 요청" : "일정 변경 기능 확인") + '</small></button>' +
        '<button type="button" data-open-questionnaire><span class="quick-icon quick-icon--mint" aria-hidden="true">✓</span><strong>사전 문진</strong><small>방문 전 상태 전달</small></button>' +
        '<button type="button" data-open-usage-report><span class="quick-icon quick-icon--usage" aria-hidden="true">▥</span><strong>사용 패턴·준비</strong><small>냉·온수·제빙량 확인</small></button>' +
        '<button type="button" data-customer-view="care"><span class="quick-icon quick-icon--amber" aria-hidden="true">◷</span><strong>케어 이력</strong><small>관리·교체 기록 확인</small></button>' +
        '<button type="button" data-customer-view="inquiries"><span class="quick-icon quick-icon--purple" aria-hidden="true">◎</span><strong>처리 현황</strong><small>상담·방문 상태 확인</small></button>' +
      '</div></section>' + prototypeFooter();
  }

  function renderVisitCard(inquiry) {
    var context = UI.inquiryContext(state, inquiry);
    var request = inquiry.visit.rescheduleRequest;
    var scheduleMeta = visitScheduleMeta(inquiry.visit);
    var canChange = inquiry.visit.status === "SCHEDULED" && scheduleMeta.code === "CONFIRMED" && (!request || request.status !== "REQUESTED");
    var statusLabel = inquiry.visit.status === "COMPLETED" ? "방문 완료" : (!request ? scheduleMeta.label : request.status === "REQUESTED" ? "변경 승인 대기" : request.status === "APPROVED" ? "변경 확정" : "기존 일정 유지");
    var statusTone = inquiry.visit.status === "COMPLETED" || (request && request.status === "APPROVED") ? "success" : (request && request.status === "REQUESTED" ? "warning" : "info");
    return '<article class="customer-visit-card' + (inquiry.visit.status === "COMPLETED" ? " is-completed" : "") + '"><header><div><span class="customer-visit-date">' + UI.formatShortDate(scheduleMeta.displayAt) + '</span><h2>' + (scheduleMeta.code === "CONFIRMED" || inquiry.visit.status === "COMPLETED" ? UI.formatDateTime(scheduleMeta.displayAt) : "확정일 조율 중") + '</h2></div>' + UI.chip(statusLabel, statusTone) + '</header><div class="customer-visit-body"><div class="customer-visit-time"><span aria-hidden="true">▦</span><div><small>작업 유형</small><strong>' + UI.escapeHTML(UI.serviceTypeMap[inquiry.visit.serviceType] || "방문 점검") + '</strong><p>' + UI.escapeHTML(context.product.modelLabel + ' · ' + (context.product.assetTag || context.product.installedArea)) + '</p></div></div><dl><div><dt>고객 희망일</dt><dd>' + UI.formatDateTime(inquiry.visit.customerPreferredAt || scheduleMeta.displayAt) + '</dd></div><div><dt>가상 확정일</dt><dd>' + (inquiry.visit.confirmedAt ? UI.formatDateTime(inquiry.visit.confirmedAt) : "조율 중") + '</dd></div><div><dt>방문기사</dt><dd>' + UI.escapeHTML(context.engineer ? context.engineer.name + " 기사" : "기사 배정 중") + '</dd></div><div><dt>방문 지역</dt><dd>' + UI.escapeHTML(inquiry.visit.area) + '</dd></div><div><dt>작업지시</dt><dd>' + UI.escapeHTML(inquiry.visit.workOrderId || inquiry.visit.id) + '</dd></div></dl>' + visitRequestMarkup(inquiry, true) + '</div><footer class="customer-visit-actions"><button class="button button--ghost" type="button" data-open-case="' + UI.escapeHTML(inquiry.id) + '">문의·작업 상세</button>' + (canChange ? '<button class="button button--primary schedule-change-button" type="button" data-open-reschedule="' + UI.escapeHTML(inquiry.id) + '">' + (request && request.status === "REJECTED" ? "다시 일정 변경" : "방문 일정 변경") + '</button>' : '') + '</footer></article>';
  }

  function renderSchedule() {
    var visits = customerVisits();
    var scheduled = visits.filter(function (item) { return item.visit.status === "SCHEDULED"; });
    var completed = visits.filter(function (item) { return item.visit.status === "COMPLETED"; });
    var pending = scheduled.filter(function (item) { return item.visit.rescheduleRequest && item.visit.rescheduleRequest.status === "REQUESTED"; }).length;
    var upcomingMarkup = scheduled.length ? '<div class="customer-visit-list">' + scheduled.map(renderVisitCard).join("") + '</div>' : '<section class="section-card schedule-empty-card"><span aria-hidden="true">▦</span><div><p class="eyebrow">VISIT SCHEDULE</p><h2>현재 확정된 방문 일정이 없어요</h2><p>상담 결과 방문이 필요하면 기사와 일정이 배정됩니다. 일정 확정 후에는 이 메뉴에서 바로 변경을 요청할 수 있어요.</p><div><button class="button button--primary" type="button" data-customer-view="inquiries">문의 처리 현황 보기</button><button class="button button--secondary" type="button" data-open-inquiry>새 증상 문의</button></div></div></section>';
    return pageHeader("VISIT SCHEDULE", "방문 일정·변경", "확정된 기사 방문을 확인하고, 가능한 일정은 바로 변경 요청할 수 있습니다.", scheduled.length === 1 && pending === 0 ? '<button class="button button--primary" type="button" data-open-reschedule="' + UI.escapeHTML(scheduled[0].id) + '">일정 변경</button>' : "") +
      '<section class="customer-visit-summary"><div><small>방문 예정</small><strong>' + scheduled.length + '</strong><span>건</span></div><div><small>변경 승인 대기</small><strong>' + pending + '</strong><span>건</span></div><div><small>완료 방문</small><strong>' + completed.length + '</strong><span>건</span></div></section>' +
      upcomingMarkup +
      (completed.length ? '<section class="section-card completed-visit-history"><div class="card-heading-row"><div><p class="eyebrow">VISIT HISTORY</p><h2>완료된 방문</h2></div><span>' + completed.length + '건</span></div><div class="customer-visit-list customer-visit-list--history">' + completed.map(renderVisitCard).join("") + '</div></section>' : "") + prototypeFooter();
  }

  function renderProductViewer(model) {
    var isIceModel = Boolean(model.capabilities && model.capabilities.ice);
    var shape = isIceModel ? "ice" : "compact";
    var safeModelId = String(model.id || model.modelCode || "product").replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    var hintId = "product-viewer-hint-" + safeModelId;
    var viewerLabel = model.name + " 360도 3D 시뮬레이션";
    return '<figure class="product-photo-stage"><div class="product-viewer" data-product-viewer data-model-id="' + UI.escapeHTML(model.id || model.modelCode) + '">' +
      '<div class="product-viewer-stage" data-viewer-stage role="slider" tabindex="0" aria-label="' + UI.escapeHTML(viewerLabel) + '" aria-describedby="' + hintId + '" aria-valuemin="0" aria-valuemax="359" aria-valuenow="0" aria-valuetext="정면 0도">' +
        '<div class="product-viewer-scene" data-viewer-object style="--viewer-angle: 0deg" aria-hidden="true"><div class="product-model-3d product-model-3d--' + shape + '">' +
          '<div class="product-model-face product-model-face--front"><span class="product-model-display">' + (isIceModel ? "120㎖" : "120ml") + '</span><span class="product-model-controls" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="product-model-divider"></span><span class="product-model-spout"></span><span class="product-model-logo">SK magic</span></div>' +
          '<div class="product-model-face product-model-face--back"><span class="product-model-back-label">WATERCARE</span><span class="product-model-back-grid"></span></div>' +
          '<div class="product-model-face product-model-face--right"><span class="product-model-vent"></span></div>' +
          '<div class="product-model-face product-model-face--left"><span class="product-model-vent"></span></div>' +
          '<div class="product-model-face product-model-face--top"><span></span></div><div class="product-model-face product-model-face--bottom"></div><span class="product-model-tray"></span>' +
        '</div></div>' +
        '<span class="product-viewer-drag-hint" id="' + hintId + '">↔ 좌우로 드래그해 360° 회전</span>' +
      '</div>' +
      '<span class="sr-only" data-viewer-status aria-live="polite"></span></div>' +
      '<figcaption><span>제품 외형을 단순화한 360° 3D 시뮬레이션</span>' + (model.officialProductUrl ? '<a href="' + UI.escapeHTML(model.officialProductUrl) + '" target="_blank" rel="noopener noreferrer">공식 제품정보 <span aria-hidden="true">↗</span></a>' : '') + '</figcaption></figure>';
  }

  function renderProduct() {
    var p = product();
    var model = productModel(p);
    return pageHeader("MY PRODUCT", customer().customerType === "BUSINESS" ? "사업장 설치 제품" : "내 정수기", "등록된 구독 제품과 관리 정보를 확인하고 직접 등록·수정할 수 있습니다.", '<div class="page-header-actions"><button class="button button--secondary" type="button" data-edit-product="' + UI.escapeHTML(p.id) + '">정보 수정</button><button class="button button--primary" type="button" data-add-product>제품 등록</button></div>') +
      productPortfolioSelector() +
      '<section class="product-detail-hero">' + renderProductViewer(model) + '<div class="product-detail-copy"><div class="chip-line">' + UI.chip("구독 이용 중", "success") + UI.chip(p.managementType, "info") + (p.assetTag ? UI.chip("자산 " + p.assetTag, "neutral") : "") + '</div><h2>' + UI.escapeHTML(p.modelLabel) + '</h2><p>모델명 ' + UI.escapeHTML(p.model) + ' · 시연 시리얼 ' + UI.escapeHTML(p.serial) + '</p><dl class="product-spec-grid"><div><dt>사용 시작일</dt><dd>' + UI.formatDate(p.startedAt) + '</dd></div><div><dt>설치 공간</dt><dd>' + UI.escapeHTML(p.installedArea) + '</dd></div><div><dt>최근 케어</dt><dd>' + UI.formatDate(p.lastCareAt) + '</dd></div><div><dt>다음 케어</dt><dd>' + UI.formatDate(p.nextCareAt) + ' <b>' + UI.careDDay(p.nextCareAt) + '</b></dd></div></dl></div></section>' +
      renderProductUsage(p) +
      renderProductManuals(p) +
      '<div class="two-column-grid"><section class="section-card"><div class="card-heading-row"><div><p class="eyebrow">CARE CYCLE</p><h2>케어 주기</h2></div>' + UI.chip(p.careState === "DUE_SOON" ? "예정 임박" : "정상", p.careState === "DUE_SOON" ? "warning" : "success") + '</div><div class="cycle-visual"><span class="cycle-ring" style="--progress:' + p.filterLife + '%"><b>' + p.filterLife + '%</b><small>필터 잔여</small></span><div><strong>' + UI.escapeHTML(p.filterLabel) + '</strong><p>공식 기준과 최근 케어 이력을 기준으로 계산한 시연 일정입니다.</p><div class="meter-track"><i style="width:' + p.filterLife + '%"></i></div></div></div></section>' +
      '<section class="section-card"><div class="card-heading-row"><div><p class="eyebrow">SUBSCRIPTION</p><h2>구독·관리 정보</h2></div></div><dl class="detail-list"><div><dt>고객 유형</dt><dd>' + UI.escapeHTML(UI.customerTypeMap[customer().customerType]) + '</dd></div><div><dt>구독 ID</dt><dd>' + UI.escapeHTML(p.subscriptionId) + '</dd></div><div><dt>제품 번호</dt><dd>' + UI.escapeHTML(p.id) + '</dd></div><div><dt>관리 방식</dt><dd>' + UI.escapeHTML(p.managementType) + '</dd></div><div><dt>케어 기준</dt><dd>' + p.cycleMonths + '개월 주기 · 시연 규칙</dd></div></dl></section></div>' +
      enterpriseManagementSummary() +
      '<section class="section-card history-preview"><div class="card-heading-row"><div><p class="eyebrow">RECENT CARE</p><h2>최근 관리 이력</h2></div><button class="text-button" type="button" data-customer-view="care">전체 보기 →</button></div>' + careHistoryList(p.careHistory.slice(0, 3)) + '</section>' + prototypeFooter();
  }

  function usageTotal(values) {
    return (values || []).reduce(function (sum, value) { return sum + (typeof value === "number" && Number.isFinite(value) ? value : 0); }, 0);
  }

  function usagePeak(values) {
    var peak = { index: 0, value: -1 };
    (values || []).forEach(function (value, index) {
      if (typeof value === "number" && Number.isFinite(value) && value > peak.value) peak = { index: index, value: value };
    });
    return peak.value < 0 ? { index: 0, value: 0 } : peak;
  }

  function usageTotalLabel(range) {
    if (range === "hourly") return "오늘 누적";
    if (range === "weekly") return "최근 7일 합계";
    return "최근 6개월 합계";
  }

  function waterUsageTotalLabel(range) {
    if (range === "hourly") return "오늘 냉·온수 합계";
    if (range === "weekly") return "최근 7일 냉·온수 합계";
    return "최근 6개월 냉·온수 합계";
  }

  function smartResource(resource) {
    var resources = state.smartPreparationMeta && state.smartPreparationMeta.resources;
    return resources && resources[resource] ? resources[resource] : { label: resource, unit: "" };
  }

  function smartClockToMinutes(value) {
    var parts = String(value || "00:00").split(":");
    return Number(parts[0] || 0) * 60 + Number(parts[1] || 0);
  }

  function smartMinutesToClock(value) {
    var normalized = ((Number(value) % 1440) + 1440) % 1440;
    var hour = Math.floor(normalized / 60);
    var minute = normalized % 60;
    return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
  }

  function smartPatternAnnotations(profile, resource) {
    if (currentUsageRange !== "hourly" || !profile || !profile.learning) return [];
    return (profile.learning.patterns || []).filter(function (pattern) { return pattern.resource === resource; }).map(function (pattern) {
      var startsAt = smartMinutesToClock(smartClockToMinutes(pattern.readyAt) - pattern.leadMinutes);
      return {
        resource: resource,
        startIndex: pattern.startHour,
        endIndex: pattern.endHour,
        preparationIndex: smartClockToMinutes(startsAt) / 60,
        label: smartResource(resource).label + " 반복",
        preparationLabel: "준비 " + startsAt
      };
    });
  }

  function renderSmartPattern(pattern) {
    var meta = smartResource(pattern.resource);
    var startsAt = smartMinutesToClock(smartClockToMinutes(pattern.readyAt) - pattern.leadMinutes);
    var confidence = Math.round(pattern.confidence * 100);
    return '<li class="smart-pattern-item smart-pattern-item--' + (pattern.resource === "ICE" ? "ice" : "hot") + '"><span class="smart-pattern-icon" aria-hidden="true">' + (pattern.resource === "ICE" ? "◇" : "♨") + '</span><div class="smart-pattern-copy"><small>' + UI.escapeHTML(meta.label) + ' 사용 패턴</small><strong>' + UI.escapeHTML(pattern.daysLabel + " " + pattern.peakAt) + ' 반복 사용</strong><p>최근 ' + pattern.eligibleDays + '회 중 ' + pattern.observedDays + '회 감지 · 예상 ' + UsageChart.formatValue(pattern.expectedAmount, meta.unit) + meta.unit + ' · 신뢰도 ' + confidence + '%</p></div><div class="smart-pattern-ready"><small>준비 시작</small><strong>' + startsAt + '</strong><span>' + pattern.readyAt + '까지 준비</span></div></li>';
  }

  function renderManualSchedules(profile, blocked) {
    var schedules = profile.manualSchedules || [];
    if (!schedules.length) return '<div class="smart-manual-empty"><strong>직접 설정한 준비 시간이 없어요</strong><p>아래에서 기능과 완료 시간을 선택해 추가할 수 있습니다.</p></div>';
    return '<ul class="smart-manual-list">' + schedules.map(function (schedule) {
      var meta = smartResource(schedule.resource);
      var startsAt = smartMinutesToClock(smartClockToMinutes(schedule.readyAt) - schedule.leadMinutes);
      return '<li><div><span class="smart-manual-resource smart-manual-resource--' + (schedule.resource === "ICE" ? "ice" : "hot") + '">' + UI.escapeHTML(meta.label) + '</span><strong>' + UI.escapeHTML(schedule.daysLabel) + ' ' + schedule.readyAt + ' 준비 완료</strong><small>' + startsAt + ' 시작 · ' + schedule.leadMinutes + '분 전</small></div><button type="button" class="text-button" data-remove-smart-schedule="' + UI.escapeHTML(schedule.id) + '" data-product-id="' + UI.escapeHTML(profile.productId) + '"' + (blocked ? " disabled" : "") + '>삭제</button></li>';
    }).join("") + '</ul>';
  }

  function renderManualPreparationForm(productItem, model, blocked) {
    var resourceOptions = '<option value="HOT_WATER">온수</option>' + (model.capabilities && model.capabilities.ice ? '<option value="ICE">얼음</option>' : '');
    var dayLabels = [{ value: "MON", label: "월" }, { value: "TUE", label: "화" }, { value: "WED", label: "수" }, { value: "THU", label: "목" }, { value: "FRI", label: "금" }, { value: "SAT", label: "토" }, { value: "SUN", label: "일" }];
    return '<form class="smart-manual-form" data-smart-manual-form data-product-id="' + UI.escapeHTML(productItem.id) + '"><div class="smart-manual-fields"><label><span>준비 기능</span><select name="resource"' + (blocked ? " disabled" : "") + '>' + resourceOptions + '</select></label><label><span>준비 완료 시간</span><input type="time" name="readyAt" value="07:00" required' + (blocked ? " disabled" : "") + '></label><label><span>미리 시작</span><select name="leadMinutes"' + (blocked ? " disabled" : "") + '><option value="10">10분 전</option><option value="20">20분 전</option><option value="30">30분 전</option></select></label></div><fieldset' + (blocked ? " disabled" : "") + '><legend>반복 요일</legend><div class="smart-day-options">' + dayLabels.map(function (day, index) { return '<label><input type="checkbox" name="days" value="' + day.value + '"' + (index < 5 ? " checked" : "") + '><span>' + day.label + '</span></label>'; }).join("") + '</div></fieldset><button type="submit" class="button button--primary"' + (blocked ? " disabled" : "") + '>직접 설정 저장</button></form>';
  }

  function renderSmartPreparation(productItem, model, profile) {
    if (!profile) return "";
    var patterns = profile.learning && profile.learning.patterns ? profile.learning.patterns : [];
    var consentReady = profile.consent && profile.consent.usageAnalysis === "GRANTED" && profile.consent.autoPreparation === "GRANTED";
    var blocked = productItem.status === "SAFETY_HOLD";
    var learning = profile.learning && profile.learning.status === "LEARNING";
    var statusClass = blocked ? "blocked" : (profile.mode === "AUTO" ? (learning ? "learning" : "active") : "manual");
    var statusLabel = blocked ? "안전 점검으로 준비 중지" : (profile.mode === "AUTO" ? (learning ? "패턴 학습 중" : "AI 자동 준비 사용 중") : "직접 설정 모드");
    var patternMarkup = patterns.length ? '<ul class="smart-pattern-list">' + patterns.map(renderSmartPattern).join("") + '</ul>' : '<div class="smart-pattern-empty"><span aria-hidden="true">◎</span><div><strong>아직 반복 패턴을 학습 중이에요</strong><p>같은 시간대의 사용이 충분히 쌓이면 준비 시간을 추천합니다.</p></div></div>';
    var consentMarkup = consentReady ? "" : '<div class="smart-consent-panel"><div><strong>AI 자동 준비를 사용하려면 동의가 필요해요</strong><p>최근 사용 시간대를 분석하고, 사용 직전에 온수 또는 얼음 준비를 시작합니다.</p></div><form data-smart-consent-form data-product-id="' + UI.escapeHTML(productItem.id) + '"><label><input type="checkbox" name="usageAnalysis" required> 사용 패턴 분석에 동의합니다.</label><label><input type="checkbox" name="autoPreparation" required> 자동 준비 실행에 동의합니다.</label><button type="submit" class="button button--primary"' + (blocked ? " disabled" : "") + '>동의하고 AI 자동 시작</button></form></div>';
    var modeControls = '<div class="smart-mode-switch" role="group" aria-label="스마트 준비 방식"><button type="button" data-smart-mode="AUTO" data-product-id="' + UI.escapeHTML(productItem.id) + '" aria-pressed="' + (profile.mode === "AUTO" ? "true" : "false") + '" class="' + (profile.mode === "AUTO" ? "is-active" : "") + '"' + (blocked ? " disabled" : "") + '><strong>AI 자동</strong><small>패턴에 맞춰 준비</small></button><button type="button" data-smart-mode="MANUAL" data-product-id="' + UI.escapeHTML(productItem.id) + '" aria-pressed="' + (profile.mode === "MANUAL" ? "true" : "false") + '" class="' + (profile.mode === "MANUAL" ? "is-active" : "") + '"' + (blocked ? " disabled" : "") + '><strong>직접 설정</strong><small>요일·시간 선택</small></button></div>';
    var modeBody = profile.mode === "AUTO" ? '<div class="smart-auto-summary"><div><small>학습 기준</small><strong>최근 ' + (profile.learning.sampleDays || 0) + '일 사용 패턴</strong></div><div><small>다음 동작</small><strong>' + (patterns.length ? UI.escapeHTML(patterns[0].daysLabel + " " + smartMinutesToClock(smartClockToMinutes(patterns[0].readyAt) - patterns[0].leadMinutes)) + " 준비 시작" : "데이터 학습 후 안내") + '</strong></div><p>사용하지 않을 때는 준비 동작이 자동으로 취소되도록 운영 연동 시 안전 규칙을 적용합니다.</p></div>' : '<div class="smart-manual-settings"><div class="smart-manual-heading"><div><strong>내가 정한 시간에 준비</strong><p>완료 시간을 선택하면 제품이 필요한 시간만큼 미리 시작합니다.</p></div></div>' + renderManualSchedules(profile, blocked) + renderManualPreparationForm(productItem, model, blocked) + '</div>';
    var safetyMarkup = blocked ? '<div class="smart-safety-hold" role="alert"><span aria-hidden="true">!</span><div><strong>현재 제품이 안전 점검 상태입니다.</strong><p>자동·직접 준비는 일시 중지되며, 점검 해제 후 기존 설정으로 다시 동작합니다.</p></div></div>' : "";
    return '<section id="smart-preparation" class="smart-preparation" aria-labelledby="smart-preparation-title"><header class="smart-preparation-header"><div><p class="eyebrow">SMART PREPARATION</p><h3 id="smart-preparation-title">AI 스마트 준비</h3><p>반복되는 사용 시간대를 학습해 온수와 얼음을 필요한 때에 맞춰 준비합니다.</p></div><span class="smart-preparation-state smart-preparation-state--' + statusClass + '"><i aria-hidden="true"></i>' + statusLabel + '</span></header>' + safetyMarkup + '<div class="smart-pattern-section"><div class="smart-section-heading"><div><strong>AI가 찾은 반복 사용 시간</strong><span>최근 사용 이력의 반복 횟수와 신뢰도를 함께 표시합니다.</span></div><span class="smart-pattern-window">최근 ' + (state.smartPreparationMeta.analysisWindowDays || 28) + '일 분석</span></div>' + patternMarkup + '</div>' + consentMarkup + '<div class="smart-control-panel"><div class="smart-control-heading"><div><strong>준비 방식</strong><p>AI 자동 또는 직접 설정 중 원하는 방식을 선택하세요.</p></div>' + modeControls + '</div>' + modeBody + '</div><footer class="smart-preparation-note"><span aria-hidden="true">i</span><p><strong>현재는 시연용 AI 패턴과 제어 화면입니다.</strong> 실제 운영에서는 제품 IoT 제어 API, 사용자의 명시적 동의, 안전 상태·절전 정책을 확인한 뒤 실행해야 합니다.</p></footer></section>';
  }

  function renderUsageChartCard(metric, series, labels, period, productItem, profile) {
    if (metric === "water") {
      var coldValues = series.coldWater || series.water;
      var hotValues = series.hotWater || series.water.map(function () { return 0; });
      var coldPeak = usagePeak(coldValues);
      var hotPeak = usagePeak(hotValues);
      var coldTotal = usageTotal(coldValues);
      var hotTotal = usageTotal(hotValues);
      var combinedTotal = coldTotal + hotTotal;
      var annotations = smartPatternAnnotations(profile, "HOT_WATER");
      var chart = UsageChart.buildSvg({
        id: "usage-water-chart",
        title: period.title + " 냉수와 온수 출수량",
        description: period.period + "의 냉수와 온수 출수량입니다. 냉수는 파란 실선과 원형점, 온수는 빨간 파선과 마름모점으로 같은 리터 축에 표시합니다. 냉수 최고는 " + labels[coldPeak.index] + " " + UsageChart.formatValue(coldPeak.value, "L") + "L, 온수 최고는 " + labels[hotPeak.index] + " " + UsageChart.formatValue(hotPeak.value, "L") + "L입니다." + (annotations.length ? " 온수 반복 사용 구간과 준비 시작 시각도 함께 표시합니다." : ""),
        labels: labels,
        series: [
          { id: "cold", label: "냉수", values: coldValues },
          { id: "hot", label: "온수", values: hotValues }
        ],
        unit: "L",
        kind: "line",
        range: currentUsageRange,
        selectedIndex: labels.length - 1,
        annotations: annotations
      });
      return '<article class="usage-chart-card usage-chart-card--water" data-usage-metric="water"><header><div><span class="usage-series-key usage-series-key--water" aria-hidden="true"></span><div><small>WATER DISPENSE</small><h3>냉수·온수 출수량 <span>(L)</span></h3></div></div><div class="usage-chart-total"><small>' + waterUsageTotalLabel(currentUsageRange) + '</small><strong>' + UsageChart.formatValue(combinedTotal, "L") + '<span>L</span></strong></div></header><ul class="usage-water-legend" aria-label="출수 유형 범례"><li><span class="usage-legend-swatch usage-legend-swatch--cold" aria-hidden="true"></span><span>냉수</span><strong>' + UsageChart.formatValue(coldTotal, "L") + 'L</strong><small class="sr-only">파란 실선과 원형점</small></li><li><span class="usage-legend-swatch usage-legend-swatch--hot" aria-hidden="true"></span><span>온수</span><strong>' + UsageChart.formatValue(hotTotal, "L") + 'L</strong><small class="sr-only">빨간 파선과 원형점</small></li></ul><div class="usage-chart-scroll">' + chart + '</div><footer class="usage-chart-peaks"><span>계열별 최고</span><div><strong><i class="usage-peak-dot usage-peak-dot--cold" aria-hidden="true"></i>냉수 ' + UI.escapeHTML(labels[coldPeak.index]) + ' · ' + UsageChart.formatValue(coldPeak.value, "L") + 'L</strong><strong><i class="usage-peak-dot usage-peak-dot--hot" aria-hidden="true"></i>온수 ' + UI.escapeHTML(labels[hotPeak.index]) + ' · ' + UsageChart.formatValue(hotPeak.value, "L") + 'L</strong></div></footer></article>';
    }
    var values = series.ice;
    var peak = usagePeak(values);
    var total = usageTotal(values);
    var iceAnnotations = smartPatternAnnotations(profile, "ICE");
    var iceChart = UsageChart.buildSvg({
      id: "usage-ice-chart",
      title: period.title + " 제빙량",
      description: period.period + "의 제빙량입니다. 최고 구간은 " + labels[peak.index] + " " + UsageChart.formatValue(peak.value, "kg") + "kg입니다." + (iceAnnotations.length ? " 반복 사용 구간과 권장 준비 시작 시각도 함께 표시합니다." : ""),
      labels: labels,
      values: values,
      unit: "kg",
      kind: "bar",
      range: currentUsageRange,
      selectedIndex: labels.length - 1,
      annotations: iceAnnotations
    });
    return '<article class="usage-chart-card" data-usage-metric="ice"><header><div><span class="usage-series-key usage-series-key--ice" aria-hidden="true"></span><div><small>ICE MAKING</small><h3>제빙량 <span>(kg)</span></h3></div></div><div class="usage-chart-total"><small>' + usageTotalLabel(currentUsageRange) + '</small><strong>' + UsageChart.formatValue(total, "kg") + '<span>kg</span></strong></div></header><div class="usage-chart-scroll">' + iceChart + '</div><footer><span>최고 사용</span><strong>' + UI.escapeHTML(labels[peak.index]) + ' · ' + UsageChart.formatValue(peak.value, "kg") + 'kg</strong></footer></article>';
  }

  function renderUsageTable(labels, series, supportsIce) {
    return '<details class="usage-data-details"><summary>그래프 수치를 표로 보기</summary><div class="usage-data-table-wrap"><table class="usage-data-table"><thead><tr><th scope="col">구간</th><th scope="col">냉수 (L)</th><th scope="col">온수 (L)</th><th scope="col">냉·온수 합계 (L)</th><th scope="col">제빙량 (kg)</th></tr></thead><tbody>' + labels.map(function (label, index) {
      return '<tr><th scope="row">' + UI.escapeHTML(label) + '</th><td>' + UsageChart.formatValue(series.coldWater[index], "L") + '</td><td>' + UsageChart.formatValue(series.hotWater[index], "L") + '</td><td>' + UsageChart.formatValue(series.water[index], "L") + '</td><td>' + (supportsIce ? UsageChart.formatValue(series.ice[index], "kg") : "기능 미지원") + '</td></tr>';
    }).join("") + '</tbody></table></div></details>';
  }

  function renderProductUsage(productItem) {
    var telemetry = productUsage(productItem);
    var model = productModel(productItem);
    var profile = smartPreparationProfile(productItem);
    var period = state.usagePeriods && state.usagePeriods[currentUsageRange];
    if (!telemetry || !period || !UsageChart) {
      return '<section id="product-usage" class="section-card product-usage product-usage--empty"><p class="eyebrow">PRODUCT USAGE</p><h2>제품 사용 리포트</h2><p>이 제품의 사용량 데이터를 준비하고 있습니다.</p></section>';
    }
    var series = telemetry.series[currentUsageRange];
    var labels = period.labels;
    var supportsIce = !!(model.capabilities && model.capabilities.ice);
    var selectedIndex = labels.length - 1;
    var rangeButtons = ["hourly", "weekly", "monthly"].map(function (range) {
      var meta = state.usagePeriods[range];
      return '<button type="button" data-usage-range="' + range + '" aria-pressed="' + (range === currentUsageRange ? "true" : "false") + '" class="' + (range === currentUsageRange ? "is-active" : "") + '"><strong>' + UI.escapeHTML(meta.label) + '</strong><small>' + (range === "hourly" ? "오늘" : range === "weekly" ? "최근 7일" : "최근 6개월") + '</small></button>';
    }).join("");
    var iceChart = supportsIce ? renderUsageChartCard("ice", series, labels, period, productItem, profile) : '<article class="usage-chart-card usage-chart-card--unsupported"><header><div><span class="usage-series-key usage-series-key--ice" aria-hidden="true"></span><div><small>ICE MAKING</small><h3>제빙량 <span>(kg)</span></h3></div></div><span class="usage-capability-badge">미지원</span></header><div class="usage-unsupported"><span aria-hidden="true">◇</span><strong>제빙 기능이 없는 모델입니다</strong><p>' + UI.escapeHTML(model.name) + '은(는) 직수형 제품으로 제빙량 데이터가 제공되지 않습니다.</p></div></article>';
    var selectedIce = supportsIce ? UsageChart.formatValue(series.ice[selectedIndex], "kg") + " kg" : "기능 미지원";
    return '<section id="product-usage" class="section-card product-usage"><header class="product-usage-header"><div><p class="eyebrow">PRODUCT USAGE</p><h2>제품 사용 리포트</h2><p>냉수·온수·제빙량을 비교하고 반복 패턴에 맞는 준비 방식을 설정하세요.</p></div><div class="usage-sync-state"><span>시연 IoT 데이터</span><small>마지막 동기화 ' + UI.formatDateTime(telemetry.updatedAt) + ' · 수집률 ' + telemetry.completeness + '%</small></div></header><div class="usage-toolbar"><div class="usage-period-copy"><strong>' + UI.escapeHTML(period.title) + '</strong><span>' + UI.escapeHTML(period.period + ' · ' + period.note) + '</span></div><div class="usage-range-switch" role="group" aria-label="사용량 조회 기간">' + rangeButtons + '</div></div><div class="usage-chart-grid">' + renderUsageChartCard("water", series, labels, period, productItem, profile) + iceChart + '</div>' + renderSmartPreparation(productItem, model, profile) + '<div class="usage-selected-row"><label for="usage-point-selector"><span>상세 구간</span><select id="usage-point-selector" data-usage-point-selector aria-label="상세 사용량 구간 선택">' + labels.map(function (label, index) { return '<option value="' + index + '"' + (index === selectedIndex ? " selected" : "") + '>' + UI.escapeHTML(label) + '</option>'; }).join("") + '</select></label><div id="usage-selected-point" class="usage-selected-point" aria-live="polite"><div><small>선택 구간</small><strong data-usage-selected-label>' + UI.escapeHTML(labels[selectedIndex]) + '</strong></div><dl><div><dt>냉수</dt><dd data-usage-selected-cold>' + UsageChart.formatValue(series.coldWater[selectedIndex], "L") + ' L</dd></div><div><dt>온수</dt><dd data-usage-selected-hot>' + UsageChart.formatValue(series.hotWater[selectedIndex], "L") + ' L</dd></div><div><dt>냉·온수 합계</dt><dd data-usage-selected-water>' + UsageChart.formatValue(series.water[selectedIndex], "L") + ' L</dd></div><div><dt>제빙량</dt><dd data-usage-selected-ice>' + selectedIce + '</dd></div></dl></div></div>' + renderUsageTable(labels, series, supportsIce) + '<footer class="usage-demo-note"><span aria-hidden="true">i</span><p><strong>화면 검증용 합성 센서 데이터입니다.</strong> 실제 계량값이나 제조사 성능 수치가 아니며, 운영 시 제품 IoT 수집 API와 데이터 품질 검증이 필요합니다.</p></footer></section>';
  }

  function renderProductManuals(productItem) {
    var model = productModel(productItem);
    var manuals = model.manuals || [];
    var cards = manuals.length ? manuals.map(function (manual) {
      return '<a class="manual-video-card" href="' + UI.escapeHTML(manual.watchUrl) + '" target="_blank" rel="noopener noreferrer" data-manual-id="' + UI.escapeHTML(manual.id) + '" aria-label="' + UI.escapeHTML(manual.title) + ' YouTube에서 새 창으로 보기"><span class="manual-video-thumbnail"><img src="' + UI.escapeHTML(manual.thumbnailPath) + '" alt=""><b aria-hidden="true">▶</b><small>' + UI.escapeHTML(manual.kind) + '</small></span><span class="manual-video-copy"><small>' + UI.escapeHTML(manual.source) + '</small><strong>' + UI.escapeHTML(manual.title) + '</strong><span>영상으로 확인하기 <b aria-hidden="true">↗</b></span></span></a>';
    }).join("") : '<div class="manual-video-empty">이 모델에 연결된 공식 영상 매뉴얼이 없습니다.</div>';
    return '<section id="product-manuals" class="section-card product-manuals"><header class="product-manuals-header"><div><p class="eyebrow">OFFICIAL VIDEO GUIDE</p><h2>내 제품 사용 매뉴얼</h2><p>' + UI.escapeHTML(model.name) + ' · ' + UI.escapeHTML(model.modelCode) + ' 전용 영상입니다.</p></div><a class="manual-channel-link" href="' + UI.escapeHTML(model.manualChannelUrl || "https://www.youtube.com/@SKmagic__/videos") + '" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">▶</span> SK매직 공식 채널</a></header><div class="manual-video-grid">' + cards + '</div><footer class="manual-api-note"><span aria-hidden="true">i</span><p><strong>현재는 모델별 공식 영상을 고정 연결했습니다.</strong> 추후 YouTube Data API 연동 시 최신 영상이 자동 반영되도록 확장할 수 있습니다.</p></footer></section>';
  }

  function productPortfolioSelector() {
    var products = customerProducts();
    if (products.length < 2) return "";
    return '<section class="product-portfolio"><div><p class="eyebrow">INSTALLED ASSETS</p><h2>설치 제품 ' + products.length + '대</h2></div><div class="product-portfolio-list">' + products.map(function (item) {
      return '<button type="button" class="product-portfolio-item' + (item.id === product().id ? " is-active" : "") + '" data-select-product="' + UI.escapeHTML(item.id) + '"><span>' + UI.escapeHTML(item.assetTag || item.id) + '</span><strong>' + UI.escapeHTML(item.model) + '</strong><small>' + UI.escapeHTML(item.installedArea) + ' · 다음 케어 ' + UI.formatShortDate(item.nextCareAt) + '</small></button>';
    }).join("") + '</div></section>';
  }

  function enterpriseManagementSummary() {
    var context = organizationContext();
    if (!context) return "";
    return '<section class="section-card enterprise-management-card"><div class="card-heading-row"><div><p class="eyebrow">BUSINESS ACCOUNT</p><h2>기업·사업장 관리 정보</h2></div>' + UI.chip(context.organization.contractTier, "info") + '</div><div class="enterprise-detail-grid"><dl><div><dt>법인·단체명</dt><dd>' + UI.escapeHTML(context.organization.name) + '</dd></div><div><dt>사업자번호</dt><dd>' + UI.escapeHTML(context.organization.businessNumber) + '</dd></div><div><dt>계약 상태</dt><dd>이용 중</dd></div></dl><dl><div><dt>사업장</dt><dd>' + UI.escapeHTML(context.site.name) + '</dd></div><div><dt>방문 가능 시간</dt><dd>' + UI.escapeHTML(context.site.serviceWindow) + '</dd></div><div><dt>출입 안내</dt><dd>' + UI.escapeHTML(context.site.accessNote) + '</dd></div></dl><dl><div><dt>대표 담당자</dt><dd>' + UI.escapeHTML(context.contact.name) + ' · ' + UI.escapeHTML(context.contact.role) + '</dd></div><div><dt>연락처</dt><dd>' + UI.escapeHTML(context.contact.phone) + '</dd></div><div><dt>작업 확인 권한</dt><dd>' + (context.contact.signatureAuthority ? "서명 가능" : "별도 확인 필요") + '</dd></div></dl></div></section>';
  }

  function careHistoryList(items) {
    return '<ol class="care-history-list">' + items.map(function (item, index) {
      return '<li><span class="history-dot">' + (index === 0 ? "✓" : "·") + '</span><div><div><strong>' + UI.escapeHTML(item.type) + '</strong><time>' + UI.formatDate(item.date) + '</time></div><p>' + UI.escapeHTML(item.result) + '</p><small>' + UI.escapeHTML(item.performer) + '</small></div></li>';
    }).join("") + "</ol>";
  }

  function renderInquiries() {
    var inquiries = customerInquiries();
    var selected = inquiries.find(function (item) { return item.id === currentInquiryId; }) || inquiries[0];
    if (selected) currentInquiryId = selected.id;
    var list = inquiries.length ? inquiries.map(function (item) {
      return '<button class="customer-case-row' + (selected && item.id === selected.id ? " is-selected" : "") + '" type="button" data-select-case="' + UI.escapeHTML(item.id) + '"><span class="case-row-top"><b>' + UI.escapeHTML(item.id) + '</b><time>' + UI.formatDateTime(item.updatedAt) + '</time></span><strong>' + UI.escapeHTML(item.title) + '</strong><span class="case-row-bottom">' + UI.statusChip(item.status, true) + '<small>' + UI.symptomLabels(item.symptomTypes).join(" · ") + '</small></span></button>';
    }).join("") : '<div class="empty-state"><span>◎</span><strong>문의 내역이 없어요</strong><p>제품 사용 중 불편한 점이 생기면 새 문의를 시작해 주세요.</p></div>';
    return pageHeader("MY INQUIRIES", "문의·A/S 내역", "한 번 입력한 내용과 처리 과정을 이어서 확인할 수 있어요.", '<button class="button button--primary" type="button" data-open-inquiry>새 문의</button>') +
      '<div class="customer-case-layout"><aside class="customer-case-list"><div class="list-head"><strong>전체 문의</strong><span>' + inquiries.length + '건</span></div>' + list + '</aside><section class="customer-case-detail">' + (selected ? inquiryDetail(selected) : '<div class="empty-detail">확인할 문의를 선택해 주세요.</div>') + '</section></div>' + prototypeFooter();
  }

  function inquiryDetail(inquiry) {
    var status = UI.statusMap[inquiry.status];
    var risk = UI.riskMap[inquiry.risk];
    var p = UI.getProduct(state, inquiry.productId);
    var detail = '<header class="case-detail-header"><div class="chip-line">' + UI.statusChip(inquiry.status, true) + UI.riskChip(inquiry.risk) + '</div><h2>' + UI.escapeHTML(inquiry.title) + '</h2><p>' + UI.escapeHTML(inquiry.id) + ' · ' + UI.formatDateTime(inquiry.createdAt) + '</p></header>' + statusJourney(inquiry);
    if (inquiry.risk === "DANGER") {
      detail += '<div class="danger-guidance"><b aria-hidden="true">!</b><div><strong>안전을 위해 제품 사용을 중지해 주세요</strong><p>젖은 손으로 전원부를 만지거나 제품을 이동·분해하지 마세요. 우선 방문 요청이 접수되었습니다.</p></div></div>';
    } else {
      detail += '<div class="case-next-step"><span aria-hidden="true">→</span><div><small>현재 단계</small><strong>' + UI.escapeHTML(status.customer) + '</strong><p>' + UI.escapeHTML(status.next) + '</p></div></div>';
    }
    detail += workflowContinuity(inquiry) + '<div class="case-content-grid"><div class="case-content-main">' +
      '<section class="detail-section"><div class="detail-section-title"><h3>문의 내용</h3><span>고객 원문</span></div><blockquote>“' + UI.escapeHTML(inquiry.description) + '”</blockquote><div class="symptom-tags">' + UI.symptomLabels(inquiry.symptomTypes).map(function (label) { return UI.chip(label, "neutral"); }).join("") + '</div></section>' +
      '<section class="detail-section"><div class="detail-section-title"><h3>AI 상태 요약</h3>' + verificationLabel(inquiry) + '</div><p class="ai-summary">' + UI.escapeHTML(inquiry.aiSummary) + '</p><dl class="structured-grid">' + Object.keys(inquiry.structured).map(function (key) {
        var labels = { started: "발생 시점", targetWater: "대상 출수", condition: "발생 조건", errorCode: "오류 표시", companion: "동반 증상", recentNonUse: "장기 미사용", performedActions: "고객 기수행 조치", lastCare: "최근 관리일" };
        return '<div><dt>' + UI.escapeHTML(labels[key] || key) + '</dt><dd>' + UI.escapeHTML(inquiry.structured[key]) + '</dd></div>';
      }).join("") + '</dl></section>' +
      customerActionSection(inquiry) +
      evidenceSection(inquiry) +
      '<section class="detail-section"><div class="detail-section-title"><h3>처리 이력</h3><span>변경 이력 보존</span></div>' + timelineList(inquiry.timeline) + '</section>' +
      '</div><aside class="case-content-side">' +
      '<section class="side-info-card"><h3>제품 정보</h3><dl><div><dt>모델</dt><dd>' + UI.escapeHTML(p.modelLabel) + '</dd></div><div><dt>관리 유형</dt><dd>' + UI.escapeHTML(p.managementType) + '</dd></div><div><dt>다음 케어</dt><dd>' + UI.formatDate(p.nextCareAt) + '</dd></div></dl></section>' +
      stakeholderHandoff(inquiry) +
      '<a class="staff-handoff-link" href="stakeholder.html?view=queue&amp;inquiry=' + encodeURIComponent(inquiry.id) + '"><span>관계자에게 전달된 화면 보기</span><b aria-hidden="true">↗</b></a>' +
      '</aside></div>';
    return detail;
  }

  function verificationLabel(inquiry) {
    var verification = inquiry.workflow && inquiry.workflow.verificationStatus;
    if (verification === "PASSED") return '<span class="verified-label">✓ 안전·근거 검증 완료</span>';
    if (verification === "BLOCKED") return '<span class="verified-label verified-label--blocked">! 자동 안내 차단</span>';
    return '<span class="verified-label verified-label--pending">… 검증 진행 중</span>';
  }

  function workflowContinuity(inquiry) {
    var workflow = inquiry.workflow || {};
    var guidance = inquiry.usageGuidance || {};
    var guidanceTone = guidance.status === "FULL_STOP" ? "danger" : (guidance.status === "PARTIAL_STOP" || guidance.status === "PENDING_REVIEW" ? "warning" : "success");
    return '<section class="workflow-continuity workflow-continuity--customer"><header><div><p class="eyebrow">CONNECTED WORKFLOW</p><h3>현재 업무 연결 상태</h3></div>' + UI.chip(guidance.label || "상태 확인 중", guidanceTone) + '</header><div class="workflow-continuity-grid"><div><small>현재 담당</small><strong>' + UI.escapeHTML(workflow.currentOwnerName || "AI 케어") + '</strong><span>' + UI.escapeHTML(workflow.currentOwnerRole || "SYSTEM") + '</span></div><div><small>다음 작업</small><strong>' + UI.escapeHTML(workflow.nextAction || "문의 상태를 확인해 주세요.") + '</strong><span>' + UI.escapeHTML(workflow.routingReason || "처리 경로 확인 중") + '</span></div><div><small>제품 사용 안내</small><strong>' + UI.escapeHTML(guidance.scope || "확인 중") + '</strong><span>' + UI.escapeHTML(guidance.reason || "안전 상태를 확인하고 있습니다.") + '</span></div></div></section>';
  }

  function customerActionSection(inquiry) {
    if (inquiry.processingFailure && inquiry.processingFailure.status === "FAILED") {
      var failure = inquiry.processingFailure;
      var counselAction = inquiry.status === "WAITING_COUNSEL"
        ? '<span class="processing-failure-routed">상담사에게 기존 입력이 전달되었습니다.</span>'
        : '<button class="button button--secondary" type="button" data-request-counsel="' + UI.escapeHTML(inquiry.id) + '">입력 내용 그대로 상담 연결</button>';
      return '<section class="detail-section processing-failure-section" role="alert"><div class="detail-section-title"><h3>자동 처리를 완료하지 못했어요</h3><span>' + UI.escapeHTML(failure.type) + '</span></div><p>입력한 내용은 삭제되지 않았습니다. 같은 단계부터 다시 시도하거나 상담사에게 그대로 전달할 수 있습니다.</p><div class="processing-failure-detail"><small>처리 기록</small><strong>' + UI.escapeHTML(failure.reason || "시연 처리 오류") + '</strong><span>재시도 ' + Number(failure.retryCount || 0) + '회 · ' + UI.formatDateTime(failure.failedAt) + '</span></div><div class="processing-failure-actions"><button class="button button--primary" type="button" data-retry-processing="' + UI.escapeHTML(inquiry.id) + '">현재 단계에서 다시 시도</button>' + counselAction + '</div></section>';
    }
    if (inquiry.status === "ADDITIONAL_QUESTIONS") {
      return additionalQuestionForm(inquiry);
    }
    if (inquiry.selfActions && inquiry.selfActions.length && ["SELF_ACTION", "ACTION_RESULT"].indexOf(inquiry.status) >= 0) {
      return '<section class="detail-section action-required-section"><div class="detail-section-title"><h3>안전한 확인 방법</h3><span>공식 근거 범위</span></div><ol class="self-action-list">' + inquiry.selfActions.map(function (item) { return '<li><span>✓</span><p>' + UI.escapeHTML(item) + '</p></li>'; }).join("") + '</ol><div class="result-question"><strong>확인 후 상태가 어떤가요?</strong><div class="result-buttons">' + ["RESOLVED", "IMPROVED", "SAME", "WORSE", "NOT_PERFORMED"].map(function (code) { return '<button type="button" data-action-result="' + code + '" data-inquiry-id="' + UI.escapeHTML(inquiry.id) + '" class="' + (inquiry.actionResult === code ? "is-selected" : "") + '">' + UI.escapeHTML(UI.actionResultMap[code]) + '</button>'; }).join("") + '</div></div>' + (inquiry.actionResult && inquiry.actionResult !== "RESOLVED" ? '<button class="button button--primary button--full" type="button" data-request-counsel="' + UI.escapeHTML(inquiry.id) + '">상담사에게 연결 요청</button>' : '') + '</section>';
    }
    if (inquiry.status === "VISIT_COMPLETE") {
      return serviceCompletionReceipt(inquiry) + '<section class="detail-section followup-section"><div class="detail-section-title"><h3>방문 후 상태를 알려주세요</h3><span>후속 확인</span></div><p>방문 점검 이후 불편했던 증상이 해결되었나요?</p><div class="followup-buttons"><button class="button button--primary" type="button" data-confirm-resolution="yes" data-inquiry-id="' + UI.escapeHTML(inquiry.id) + '">네, 해결됐어요</button><button class="button button--secondary" type="button" data-confirm-resolution="no" data-inquiry-id="' + UI.escapeHTML(inquiry.id) + '">아직 불편해요</button></div></section>';
    }
    if (inquiry.status === "RESOLUTION_PENDING") {
      return '<section class="detail-section followup-section"><div class="detail-section-title"><h3>상담 후 상태를 알려주세요</h3><span>고객 확인 대기</span></div>' + (inquiry.resolutionSummary ? '<div class="customer-resolution-summary"><small>상담 안내 요약</small><p>' + UI.escapeHTML(inquiry.resolutionSummary) + '</p></div>' : '') + '<p>상담사의 안내 후 불편했던 증상이 해결되었나요?</p><div class="followup-buttons"><button class="button button--primary" type="button" data-confirm-resolution="yes" data-inquiry-id="' + UI.escapeHTML(inquiry.id) + '">네, 해결됐어요</button><button class="button button--secondary" type="button" data-confirm-resolution="no" data-inquiry-id="' + UI.escapeHTML(inquiry.id) + '">아직 불편해요</button></div></section>';
    }
    if (inquiry.status === "COMPLETION_PENDING") {
      return serviceCompletionReceipt(inquiry) + '<section class="detail-section followup-section"><div class="detail-section-title"><h3>해결 확인이 접수됐어요</h3><span>처리 완료 대기</span></div><p>고객님의 해결 확인은 저장되었습니다. 담당 상담사 또는 방문기사가 상담·작업 기록을 최종 확인하면 처리 완료로 전환됩니다.</p><div class="customer-resolution-summary"><small>다음 작업</small><p>' + UI.escapeHTML(inquiry.workflow && inquiry.workflow.nextAction || "담당자 최종 완료 처리") + '</p></div></section>';
    }
    if (["WAITING_COUNSEL", "IN_COUNSEL"].indexOf(inquiry.status) >= 0) {
      return '<section class="detail-section connected-wait-section"><div class="detail-section-title"><h3>' + (inquiry.status === "IN_COUNSEL" ? "상담사가 확인 중입니다" : "상담 큐에 전달되었습니다") + '</h3><span>문의 정보 인계 완료</span></div><p>고객 원문, 추가 답변, 근거, 수행한 조치 결과가 같은 문의 번호로 전달되어 다시 설명할 필요가 없습니다.</p></section>';
    }
    if (inquiry.status === "COMPLETED") {
      return serviceCompletionReceipt(inquiry) + '<section class="detail-section complete-section"><span aria-hidden="true">✓</span><div><h3>처리가 완료되었어요</h3><p>같은 증상이 다시 불편하면 이전 기록을 보존한 채 상담을 다시 연결할 수 있어요.</p><button class="button button--secondary" type="button" data-request-counsel="' + UI.escapeHTML(inquiry.id) + '">같은 증상 다시 상담</button></div></section>';
    }
    return "";
  }

  function additionalQuestionForm(inquiry) {
    var definitions = {
      started: { label: "증상은 언제부터 시작됐나요?", options: ["오늘", "2~3일 전", "일주일 이상", "정확히 기억나지 않음"] },
      targetWater: { label: "어느 출수에서 주로 발생하나요?", options: ["정수", "냉수", "온수", "냉수·정수 모두", "전체 출수"] },
      condition: { label: "어떤 조건에서 발생하나요?", options: ["시간대와 관계없이 계속", "처음 출수할 때만", "연속 사용 후", "간헐적으로 반복"] },
      errorCode: { label: "오류 표시가 있나요?", options: ["표시 없음", "오류 숫자 표시", "표시등 깜빡임"] },
      companion: { label: "함께 나타나는 증상이 있나요?", options: ["특이사항 없음", "누수 또는 물기", "이상 소음", "온도 이상"] },
      recentNonUse: { label: "최근 장기간 사용하지 않은 적이 있나요?", options: ["해당 없음", "3~7일 미사용", "1주 이상 미사용"] },
      performedActions: { label: "이미 직접 확인하거나 수행한 조치가 있나요?", options: ["아직 수행한 조치 없음", "원수 밸브·제품 외부 상태 확인", "충분히 출수한 뒤 상태 재확인", "상담 안내에 따른 외부 상태 확인"] }
    };
    var pending = Array.isArray(inquiry.pendingFields) ? inquiry.pendingFields : Object.keys(definitions);
    var fields = pending.filter(function (key) { return definitions[key]; }).map(function (key) {
      var definition = definitions[key];
      return '<label>' + UI.escapeHTML(definition.label) + '<select name="' + UI.escapeHTML(key) + '" required><option value="">선택해 주세요</option>' + definition.options.map(function (option) { return '<option>' + UI.escapeHTML(option) + '</option>'; }).join("") + '</select></label>';
    }).join("");
    var knownCount = Object.keys(definitions).length - pending.length;
    return '<section class="detail-section action-required-section"><div class="detail-section-title"><h3>' + (pending.length ? "누락된 정보만 확인해 주세요" : "입력 정보 분석을 계속할게요") + '</h3><span>원문에서 확인된 ' + knownCount + '개 항목은 다시 묻지 않아요</span></div><form id="additional-answer-form" data-inquiry-id="' + UI.escapeHTML(inquiry.id) + '">' + fields + '<button class="button button--primary button--full" type="submit">' + (pending.length ? "답변 제출하고 다음 단계 보기" : "기존 입력으로 분석 계속") + '</button></form></section>';
  }

  function serviceCompletionReceipt(inquiry) {
    if (!inquiry.visit || inquiry.visit.status !== "COMPLETED") return "";
    var signature = inquiry.visit.signature;
    return '<section class="detail-section service-receipt"><div class="detail-section-title"><h3>방문 작업 확인서</h3>' + UI.chip(signature ? "고객 서명 완료" : "서명 정보 없음", signature ? "success" : "warning") + '</div><div class="service-receipt-grid"><div><small>작업 유형</small><strong>' + UI.escapeHTML(UI.serviceTypeMap[inquiry.visit.serviceType] || "방문 점검") + '</strong></div><div><small>완료 일시</small><strong>' + UI.formatDateTime(inquiry.visit.completedAt) + '</strong></div><div><small>수행 조치</small><strong>' + UI.escapeHTML(inquiry.visit.actions.join(" · ")) + '</strong></div><div><small>서명 확인</small><strong>' + (signature ? UI.escapeHTML(signature.signedBy) + ' · ' + UI.formatDateTime(signature.signedAt) : "기존 기록") + '</strong></div></div><p>작업 결과와 서명 시점의 확인 내용은 변경 이력과 함께 보존됩니다.</p></section>';
  }

  function evidenceSection(inquiry) {
    if (!inquiry.evidence || !inquiry.evidence.length) {
      return '<section class="detail-section evidence-section evidence-section--empty"><div class="detail-section-title"><h3>안내 근거</h3><span>검색 중</span></div><p>확인 가능한 공식 근거를 찾기 전에는 임의의 자가조치를 안내하지 않습니다.</p></section>';
    }
    return '<section class="detail-section evidence-section"><div class="detail-section-title"><h3>안내 근거</h3><span class="verified-label">✓ 근거 연결</span></div>' + inquiry.evidence.map(function (item) {
      return '<article class="evidence-card"><span class="document-icon" aria-hidden="true">문서</span><div><strong>' + UI.escapeHTML(item.document) + '</strong><p>' + UI.escapeHTML(item.section) + '</p><small>' + UI.escapeHTML(item.page) + ' · 일치도 ' + Math.round(item.confidence * 100) + '%</small><small>' + UI.escapeHTML([item.modelCode, item.version, item.approvalStatus].filter(Boolean).join(" · ")) + '</small></div></article>';
    }).join("") + '<p class="evidence-note">이 프로토타입의 문서명과 페이지는 화면 흐름 검증용 가상 메타데이터입니다.</p></section>';
  }

  function stakeholderHandoff(inquiry) {
    if (inquiry.visit) {
      var engineer = UI.getStaff(state, inquiry.visit.engineerId);
      var request = inquiry.visit.rescheduleRequest;
      var scheduleMeta = visitScheduleMeta(inquiry.visit);
      var requestMarkup = visitRequestMarkup(inquiry, false);
      var actionMarkup = inquiry.visit.status === "SCHEDULED" && scheduleMeta.code === "CONFIRMED" && (!request || request.status !== "REQUESTED") ? '<button class="button button--ghost button--full schedule-change-button" type="button" data-open-reschedule="' + UI.escapeHTML(inquiry.id) + '">방문 일정 변경 요청</button>' : "";
      return '<section class="side-info-card handoff-card"><h3>방문 점검</h3><div class="handoff-person"><span>' + UI.escapeHTML(engineer ? engineer.initials : "기") + '</span><div><strong>' + UI.escapeHTML(engineer ? engineer.name + " 기사" : "기사 배정 중") + '</strong><small>' + UI.escapeHTML(inquiry.visit.area) + '</small></div></div><dl><div><dt>작업 유형</dt><dd>' + UI.escapeHTML(UI.serviceTypeMap[inquiry.visit.serviceType] || "A/S 점검") + '</dd></div><div><dt>고객 희망일</dt><dd>' + UI.formatDateTime(inquiry.visit.customerPreferredAt) + '</dd></div><div><dt>가상 확정일</dt><dd>' + (scheduleMeta.code === "CONFIRMED" ? UI.formatDateTime(inquiry.visit.confirmedAt || inquiry.visit.scheduledAt) : "확정 전") + '</dd></div><div><dt>일정 상태</dt><dd>' + UI.escapeHTML(inquiry.visit.status === "COMPLETED" ? "방문 완료" : scheduleMeta.label) + '</dd></div></dl>' + requestMarkup + actionMarkup + '</section>';
    }
    if (["WAITING_COUNSEL", "IN_COUNSEL"].indexOf(inquiry.status) >= 0) {
      return '<section class="side-info-card handoff-card"><h3>상담 연결</h3><div class="handoff-person"><span>상</span><div><strong>' + (inquiry.status === "IN_COUNSEL" ? "상담 진행 중" : "상담사 확인 대기") + '</strong><small>입력한 내용을 다시 설명하지 않아도 돼요</small></div></div></section>';
    }
    return "";
  }

  function timelineList(items) {
    return '<ol class="timeline-list">' + items.slice().reverse().map(function (item, index) {
      var transition = item.toStatus ? '<span class="timeline-transition">' + UI.escapeHTML(item.fromStatus || "최초 접수") + ' → ' + UI.escapeHTML(item.toStatus) + '</span>' : '';
      return '<li class="' + (index === 0 ? "is-latest" : "") + '"><span class="timeline-marker"></span><div><div><strong>' + UI.escapeHTML(item.label) + '</strong><time>' + UI.formatDateTime(item.at) + '</time></div>' + transition + '<p>' + UI.escapeHTML(item.reason || item.detail) + '</p><small>' + UI.escapeHTML(item.actor) + '</small></div></li>';
    }).join("") + "</ol>";
  }

  function renderCare() {
    var p = product();
    var questionnaire = questionnaireForProduct(p);
    var nextCare = UI.careDDay(p.nextCareAt);
    return pageHeader("CARE HISTORY", "케어 일정·이력", "정기 관리와 A/S 결과가 한 곳에 이어서 기록됩니다.", '') +
      '<section class="next-care-banner"><div><span class="eyebrow">NEXT CARE</span><h2>' + UI.formatDate(p.nextCareAt) + ' <b>' + nextCare + '</b></h2><p>' + UI.escapeHTML(p.managementType) + ' · ' + p.cycleMonths + '개월 시연 주기 기준</p></div><div class="next-care-check"><span>' + (questionnaire.status === "SUBMITTED" ? "✓" : "1") + '</span><div><strong>' + (questionnaire.status === "SUBMITTED" ? "사전 문진 제출 완료" : (questionnaire.status === "READY" ? "사전 문진을 작성해 주세요" : "문진 생성 전입니다")) + '</strong><small>' + (questionnaire.status === "SUBMITTED" ? UI.formatDateTime(questionnaire.submittedAt) : (questionnaire.status === "READY" ? "방문 전 확인 항목 5개" : "케어 7일 전 자동 생성")) + '</small></div>' + (questionnaire.status === "READY" ? '<button class="button button--lime" type="button" data-open-questionnaire>문진 시작</button>' : '') + '</div></section>' +
      '<div class="two-column-grid care-page-grid"><section class="section-card"><div class="card-heading-row"><div><p class="eyebrow">HISTORY</p><h2>전체 관리 이력</h2></div><span>' + p.careHistory.length + '건</span></div>' + careHistoryList(p.careHistory) + '</section><aside class="section-card care-standard-card"><p class="eyebrow">CARE STANDARD</p><h2>현재 적용 기준</h2><dl class="detail-list"><div><dt>관리 유형</dt><dd>' + UI.escapeHTML(p.managementType) + '</dd></div><div><dt>기본 주기</dt><dd>' + p.cycleMonths + '개월</dd></div><div><dt>최근 반영일</dt><dd>' + UI.formatDate(p.lastCareAt) + '</dd></div><div><dt>일정 상태</dt><dd>' + (p.careState === "UPDATED" ? "방문 결과 반영됨" : "정상 산정") + '</dd></div></dl><div class="standard-note"><b>안내</b><p>실제 계약별 예외 정책이 아닌 화면 시연용 주기 규칙으로 계산했습니다.</p></div></aside></div>' + prototypeFooter();
  }

  function prototypeFooter() {
    return '<footer class="prototype-footer"><p><b>시연용 프로토타입</b> 고객·계약·제품·처리 기록은 가상 데이터입니다. 고객·상담·방문 업무와 알림은 이 브라우저 안에서 실시간 연계되며 외부 인증·IoT·메시지 발송은 연동 전입니다.</p><button class="text-button" type="button" data-reset-demo>가상 데이터 초기화</button></footer>';
  }

  function render(reason) {
    state = Store.getState();
    if (!state.customers.some(function (item) { return item.id === currentCustomerId; })) currentCustomerId = state.customers[0].id;
    if (!customerProducts().some(function (item) { return item.id === currentProductId; })) currentProductId = customer().productId;
    renderShellState();
    var root = document.getElementById("customer-view");
    if (currentView === "product") root.innerHTML = renderProduct();
    else if (currentView === "schedule") root.innerHTML = renderSchedule();
    else if (currentView === "inquiries") root.innerHTML = renderInquiries();
    else if (currentView === "care") root.innerHTML = renderCare();
    else { currentView = "home"; root.innerHTML = renderHome(); }
    if (ProductViewer) ProductViewer.mount(root);
    bindDynamicForms();
    if (notificationController) notificationController.refresh(reason);
  }

  function goView(view) {
    currentView = view;
    UI.setQuery({ view: view === "home" ? null : view, customer: currentCustomerId, inquiry: view === "inquiries" ? currentInquiryId : null });
    render();
    document.getElementById("customer-main").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openUsageReport() {
    goView("product");
    window.requestAnimationFrame(function () {
      var section = document.getElementById("product-usage");
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openSmartPreparation() {
    goView("product");
    window.requestAnimationFrame(function () {
      var section = document.getElementById("smart-preparation");
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function initCustomerMenuSearch() {
    if (!UI.initMenuSearch) return;
    UI.initMenuSearch({
      rootId: "customer-menu-search",
      items: [
        { id: "customer-home", label: "홈", category: "고객 메뉴", description: "제품과 케어 현황", keywords: ["대시보드", "메인", "케어 현황"], onSelect: function () { goView("home"); } },
        { id: "customer-schedule", label: "방문 일정·변경", category: "고객 메뉴", description: "기사 방문 확인 및 일정 변경 요청", keywords: ["일정", "일정 변경", "예약", "예약 변경", "방문", "기사 방문", "A/S 일정"], onSelect: function () { goView("schedule"); } },
        { id: "customer-product", label: "내 제품", category: "고객 메뉴", description: "구독 제품·360° 3D 보기·설치 정보", keywords: ["정수기", "구독", "설치 제품", "사업장", "자산", "모델명", "360", "3D", "제품 회전", "실제 이미지"], onSelect: function () { goView("product"); } },
        { id: "customer-usage", label: "제품 사용 리포트", category: "내 제품", description: "시간별·주간·월간 냉수·온수·제빙량 그래프", keywords: ["사용량", "출수량", "냉수", "냉수량", "온수", "온수량", "제빙량", "물 사용", "시간별", "주간", "월간", "그래프", "통계", "사용 패턴"], onSelect: openUsageReport },
        { id: "customer-smart-preparation", label: "AI 스마트 준비", category: "내 제품", description: "온수·얼음 자동 준비와 직접 시간 설정", keywords: ["스마트 준비", "AI 자동", "자동 준비", "온수 준비", "얼음 준비", "제빙 준비", "직접 설정", "예약", "사용 패턴", "학습"], onSelect: openSmartPreparation },
        { id: "customer-manual", label: "제품 사용 매뉴얼", category: "내 제품", description: "모델별 공식 사용법·필터 교체 영상", keywords: ["매뉴얼", "사용법", "설명서", "동영상", "유튜브", "필터 교체", "기능 설정"], onSelect: function () { goView("product"); window.requestAnimationFrame(function () { var section = document.getElementById("product-manuals"); if (section) section.scrollIntoView({ behavior: "smooth", block: "start" }); }); } },
        { id: "customer-inquiries", label: "문의 내역", category: "고객 메뉴", description: "상담·방문 처리 현황", keywords: ["문의", "상담", "처리 현황", "증상", "문의 조회"], onSelect: function () { goView("inquiries"); } },
        { id: "customer-care", label: "케어 이력", category: "고객 메뉴", description: "관리·필터 교체 기록", keywords: ["케어", "관리 이력", "필터", "교체", "방문 이력"], onSelect: function () { goView("care"); } },
        { id: "customer-new-inquiry", label: "새 증상 문의", category: "바로 실행", description: "불편 증상 접수 시작", keywords: ["문의하기", "고장", "불편", "AI 문진"], onSelect: openInquiryDialog },
        { id: "customer-questionnaire", label: "사전 문진", category: "바로 실행", description: "방문 전 제품 상태 전달", keywords: ["문진", "방문 전", "상태 입력"], onSelect: openQuestionnaireDialog }
      ]
    });
  }

  function customerNotifications() {
    return (state.notifications || []).filter(function (item) {
      return item.recipientRole === "CUSTOMER" && (!item.recipientId || item.recipientId === currentCustomerId);
    });
  }

  function initCustomerNotificationCenter() {
    if (!UI.initNotificationCenter) return null;
    return UI.initNotificationCenter({
      toggleId: "customer-notification-toggle",
      panelId: "customer-notification-panel",
      label: "고객 알림",
      getContextKey: function () { return "CUSTOMER:" + currentCustomerId; },
      getItems: customerNotifications,
      onBeforeOpen: function () { state = Store.getState(); },
      onRead: function (item) { Store.markNotificationRead(item.id, "CUSTOMER", currentCustomerId); },
      onReadAll: function () { Store.markAllNotificationsRead("CUSTOMER", currentCustomerId); },
      onSelect: function (item) {
        if (item.inquiryId && state.inquiries.some(function (inquiry) { return inquiry.id === item.inquiryId && inquiry.customerId === currentCustomerId; })) currentInquiryId = item.inquiryId;
        goView(item.view === "schedule" ? "schedule" : (item.inquiryId ? "inquiries" : (item.view || "home")));
      }
    });
  }

  function openInquiryDialog() {
    var dialog = document.getElementById("inquiry-dialog");
    document.getElementById("inquiry-form").reset();
    document.getElementById("inquiry-product").value = product().id;
    document.getElementById("description-count").textContent = "0";
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  }

  function openProductDialog(productId) {
    var dialog = document.getElementById("product-dialog");
    var form = document.getElementById("product-form");
    var existing = productId ? customerProducts().find(function (item) { return item.id === productId; }) : null;
    form.reset();
    document.getElementById("product-dialog-title").textContent = existing ? "정수기 정보 수정" : "정수기 등록";
    document.getElementById("product-edit-id").value = existing ? existing.id : "";
    document.getElementById("product-model-id").innerHTML = (state.productModels || []).map(function (model) { return '<option value="' + UI.escapeHTML(model.id) + '">' + UI.escapeHTML(model.name + " · " + model.modelCode) + '</option>'; }).join("");
    var business = organizationContext();
    var siteField = document.getElementById("product-site-field");
    var siteSelect = document.getElementById("product-site-id");
    siteField.hidden = !business;
    siteSelect.required = Boolean(business);
    siteSelect.innerHTML = business ? (state.sites || []).filter(function (site) { return site.organizationId === business.organization.id; }).map(function (site) { return '<option value="' + UI.escapeHTML(site.id) + '">' + UI.escapeHTML(site.name + " · " + site.area) + '</option>'; }).join("") : "";
    if (existing) {
      form.elements.modelId.value = existing.modelId;
      form.elements.startedAt.value = existing.startedAt;
      form.elements.managementType.value = existing.managementType;
      form.elements.lastReplacementAt.value = existing.lastReplacementAt || existing.lastCareAt;
      form.elements.installedArea.value = existing.installedArea;
      form.elements.siteId.value = existing.siteId || "";
      form.elements.assetTag.value = existing.assetTag || "";
    } else {
      form.elements.startedAt.value = new Date().toISOString().slice(0, 10);
      form.elements.lastReplacementAt.value = new Date().toISOString().slice(0, 10);
    }
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  }

  function openQuestionnaireDialog() {
    var dialog = document.getElementById("questionnaire-dialog");
    var ready = readyQuestionnaires();
    if (!ready.length) {
      var selectedQuestionnaire = questionnaireForProduct(product());
      UI.showToast(selectedQuestionnaire.status === "SUBMITTED" ? "현재 제품의 사전 문진은 이미 제출했습니다." : "현재 제출 가능한 사전 문진이 없습니다.");
      return;
    }
    var select = document.getElementById("questionnaire-product");
    select.innerHTML = ready.map(function (item) { var itemProduct = UI.getProduct(state, item.productId); return '<option value="' + UI.escapeHTML(item.productId) + '">' + UI.escapeHTML(itemProduct.modelLabel + " · " + itemProduct.installedArea) + '</option>'; }).join("");
    document.getElementById("questionnaire-form").reset();
    if (ready.some(function (item) { return item.productId === product().id; })) select.value = product().id;
    if (ready.some(function (item) { return item.productId === product().id; })) select.value = product().id;
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  }

  function toLocalDateTimeInput(value) {
    var date = new Date(value);
    var local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function openRescheduleDialog(inquiryId) {
    var inquiry = state.inquiries.find(function (item) { return item.id === inquiryId; });
    if (!inquiry || !inquiry.visit || inquiry.visit.status !== "SCHEDULED" || visitScheduleMeta(inquiry.visit).code !== "CONFIRMED") {
      UI.showToast("변경할 방문 일정이 없습니다.", "danger");
      return;
    }
    var dialog = document.getElementById("reschedule-dialog");
    var form = document.getElementById("reschedule-form");
    form.reset();
    document.getElementById("reschedule-inquiry-id").value = inquiry.id;
    document.getElementById("current-appointment-time").textContent = UI.formatDateTime(inquiry.visit.scheduledAt) + " · " + inquiry.visit.area;
    var desired = document.getElementById("desired-visit-time");
    desired.min = toLocalDateTimeInput(new Date(Date.now() + 3600000).toISOString());
    desired.value = toLocalDateTimeInput(new Date(new Date(inquiry.visit.scheduledAt).getTime() + 86400000).toISOString());
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  }

  function bindDynamicForms() {
    var additional = document.getElementById("additional-answer-form");
    if (additional) additional.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(additional);
      try {
        Store.answerAdditionalQuestions(additional.dataset.inquiryId, { started: data.get("started"), targetWater: data.get("targetWater"), condition: data.get("condition"), errorCode: data.get("errorCode"), companion: data.get("companion"), recentNonUse: data.get("recentNonUse"), performedActions: data.get("performedActions") }, customer().name, currentCustomerId);
        var answered = Store.getState().inquiries.find(function (item) { return item.id === additional.dataset.inquiryId; });
        UI.showToast(answered && answered.status === "SELF_ACTION" ? "답변을 반영해 안전한 확인 방법을 준비했습니다." : "답변을 저장하고 상담사에게 연결했습니다.", answered && answered.risk === "DANGER" ? "danger" : "success");
      } catch (error) { UI.showToast(error.message, "danger"); }
    });
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close("cancel");
    else dialog.removeAttribute("open");
  }

  function bindDialogDismissals() {
    document.querySelectorAll(".app-dialog").forEach(function (dialog) {
      dialog.addEventListener("click", function (event) {
        if (event.target !== dialog) return;
        var rect = dialog.getBoundingClientRect();
        var outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
        if (outside) closeDialog(dialog);
      });
    });
  }

  function selectUsagePoint(index) {
    var telemetry = productUsage(product());
    var period = state.usagePeriods && state.usagePeriods[currentUsageRange];
    if (!telemetry || !period) return;
    var series = telemetry.series[currentUsageRange];
    var numericIndex = Number(index);
    if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= period.labels.length) return;
    var model = productModel(product());
    var supportsIce = !!(model.capabilities && model.capabilities.ice);
    var label = document.querySelector("[data-usage-selected-label]");
    var cold = document.querySelector("[data-usage-selected-cold]");
    var hot = document.querySelector("[data-usage-selected-hot]");
    var water = document.querySelector("[data-usage-selected-water]");
    var ice = document.querySelector("[data-usage-selected-ice]");
    var selector = document.querySelector("[data-usage-point-selector]");
    if (label) label.textContent = period.labels[numericIndex];
    if (cold) cold.textContent = UsageChart.formatValue(series.coldWater[numericIndex], "L") + " L";
    if (hot) hot.textContent = UsageChart.formatValue(series.hotWater[numericIndex], "L") + " L";
    if (water) water.textContent = UsageChart.formatValue(series.water[numericIndex], "L") + " L";
    if (ice) ice.textContent = supportsIce ? UsageChart.formatValue(series.ice[numericIndex], "kg") + " kg" : "기능 미지원";
    if (selector) selector.value = String(numericIndex);
    document.querySelectorAll("[data-usage-point]").forEach(function (point) {
      var selected = Number(point.dataset.usageIndex) === numericIndex;
      point.classList.toggle("is-selected", selected);
      if (selected) point.setAttribute("aria-current", "true");
      else point.removeAttribute("aria-current");
    });
  }

  document.addEventListener("click", function (event) {
    var closeButton = event.target.closest("[data-dialog-close]");
    if (closeButton) {
      event.preventDefault();
      closeDialog(closeButton.closest("dialog"));
      return;
    }
    var usageRangeButton = event.target.closest("[data-usage-range]");
    if (usageRangeButton) {
      currentUsageRange = usageRangeButton.dataset.usageRange;
      UI.setQuery({ usageRange: currentUsageRange, product: product().id, customer: currentCustomerId, view: "product" });
      render();
      window.requestAnimationFrame(function () {
        var activeRange = document.querySelector('[data-usage-range="' + currentUsageRange + '"]');
        var section = document.getElementById("product-usage");
        if (activeRange) activeRange.focus({ preventScroll: true });
        if (section) section.scrollIntoView({ block: "start" });
      });
      return;
    }
    var smartModeButton = event.target.closest("[data-smart-mode]");
    if (smartModeButton) {
      try {
        Store.setSmartPreparationMode(smartModeButton.dataset.productId, smartModeButton.dataset.smartMode, customer().customerType === "BUSINESS" ? customer().contactName : customer().name);
        UI.showToast(smartModeButton.dataset.smartMode === "AUTO" ? "AI가 반복 패턴에 맞춰 준비하도록 설정했습니다." : "직접 설정 모드로 변경했습니다.", "success");
      } catch (error) { UI.showToast(error.message, "danger"); }
      return;
    }
    var removeSmartSchedule = event.target.closest("[data-remove-smart-schedule]");
    if (removeSmartSchedule) {
      try {
        Store.removeManualPreparation(removeSmartSchedule.dataset.productId, removeSmartSchedule.dataset.removeSmartSchedule, customer().customerType === "BUSINESS" ? customer().contactName : customer().name);
        UI.showToast("직접 설정한 준비 시간을 삭제했습니다.", "success");
      } catch (error) { UI.showToast(error.message, "danger"); }
      return;
    }
    var usagePoint = event.target.closest("[data-usage-point]");
    if (usagePoint) { selectUsagePoint(usagePoint.dataset.usageIndex); return; }
    var viewButton = event.target.closest("[data-customer-view]");
    if (viewButton) { goView(viewButton.dataset.customerView); return; }
    if (event.target.closest("[data-open-usage-report]")) { openUsageReport(); return; }
    if (event.target.closest("[data-open-inquiry]")) { openInquiryDialog(); return; }
    if (event.target.closest("[data-open-questionnaire]")) { openQuestionnaireDialog(); return; }
    if (event.target.closest("[data-add-product]")) { openProductDialog(null); return; }
    var editProductButton = event.target.closest("[data-edit-product]");
    if (editProductButton) { openProductDialog(editProductButton.dataset.editProduct); return; }
    var rescheduleButton = event.target.closest("[data-open-reschedule]");
    if (rescheduleButton) { openRescheduleDialog(rescheduleButton.dataset.openReschedule); return; }
    var productButton = event.target.closest("[data-select-product]");
    if (productButton) {
      currentProductId = productButton.dataset.selectProduct;
      UI.setQuery({ product: currentProductId, customer: currentCustomerId });
      render();
      UI.showToast("선택한 설치 제품의 케어 정보를 표시합니다.");
      return;
    }
    var openCase = event.target.closest("[data-open-case]");
    if (openCase) { currentInquiryId = openCase.dataset.openCase; goView("inquiries"); return; }
    var selectCase = event.target.closest("[data-select-case]");
    if (selectCase) { currentInquiryId = selectCase.dataset.selectCase; UI.setQuery({ view: "inquiries", customer: currentCustomerId, inquiry: currentInquiryId }); render(); return; }
    var resultButton = event.target.closest("[data-action-result]");
    if (resultButton) {
      try { Store.setActionResult(resultButton.dataset.inquiryId, resultButton.dataset.actionResult, customer().name, currentCustomerId); UI.showToast(resultButton.dataset.actionResult === "RESOLVED" ? "해결 확인을 접수했습니다. 담당자가 최종 확인합니다." : (["SAME", "WORSE", "NOT_PERFORMED"].indexOf(resultButton.dataset.actionResult) >= 0 ? "결과를 저장하고 상담사에게 자동 연결했습니다." : "조치 결과를 저장했습니다."), "success"); }
      catch (error) { UI.showToast(error.message, "danger"); }
      return;
    }
    var retryButton = event.target.closest("[data-retry-processing]");
    if (retryButton) {
      try { Store.retryProcessing(retryButton.dataset.retryProcessing, currentCustomerId); UI.showToast("기존 입력을 유지한 채 현재 단계부터 다시 진행합니다.", "success"); }
      catch (error) { UI.showToast(error.message, "danger"); }
      return;
    }
    var counselButton = event.target.closest("[data-request-counsel]");
    if (counselButton) {
      try { Store.requestCounsel(counselButton.dataset.requestCounsel, customer().name, currentCustomerId); UI.showToast("상담 요청이 접수되었습니다.", "success"); }
      catch (error) { UI.showToast(error.message, "danger"); }
      return;
    }
    var confirmButton = event.target.closest("[data-confirm-resolution]");
    if (confirmButton) {
      try { Store.confirmResolution(confirmButton.dataset.inquiryId, confirmButton.dataset.confirmResolution === "yes", customer().name, currentCustomerId); UI.showToast(confirmButton.dataset.confirmResolution === "yes" ? "해결 확인이 접수되었습니다. 담당자가 최종 완료 처리합니다." : "문의가 다시 상담 큐에 전달되었습니다.", "success"); }
      catch (error) { UI.showToast(error.message, "danger"); }
      return;
    }
    if (event.target.closest("[data-reset-demo]")) {
      if (window.confirm("시연 중 변경한 내용을 지우고 최초 가상 데이터 5건으로 되돌릴까요?")) {
        Store.reset(); currentCustomerId = "CUS-001"; currentProductId = "PROD-001"; currentInquiryId = null; currentView = "home"; currentUsageRange = "hourly"; UI.setQuery({ view: null, customer: null, product: null, inquiry: null, usageRange: null }); UI.showToast("가상 데이터를 초기화했습니다.", "success");
      }
    }
  });

  document.addEventListener("submit", function (event) {
    var consentForm = event.target.closest && event.target.closest("[data-smart-consent-form]");
    if (consentForm) {
      event.preventDefault();
      var consentData = new FormData(consentForm);
      if (!consentData.get("usageAnalysis") || !consentData.get("autoPreparation")) {
        UI.showToast("두 동의 항목을 확인해 주세요.", "danger");
        return;
      }
      try {
        Store.enableSmartPreparation(consentForm.dataset.productId, customer().customerType === "BUSINESS" ? customer().contactName : customer().name);
        UI.showToast("AI 사용 패턴 학습과 자동 준비를 시작했습니다.", "success");
      } catch (error) { UI.showToast(error.message, "danger"); }
      return;
    }
    var manualForm = event.target.closest && event.target.closest("[data-smart-manual-form]");
    if (manualForm) {
      event.preventDefault();
      var manualData = new FormData(manualForm);
      try {
        Store.saveManualPreparation(manualForm.dataset.productId, {
          resource: manualData.get("resource"),
          readyAt: manualData.get("readyAt"),
          leadMinutes: Number(manualData.get("leadMinutes")),
          days: manualData.getAll("days")
        }, customer().customerType === "BUSINESS" ? customer().contactName : customer().name);
        UI.showToast("직접 설정한 준비 시간을 저장했습니다.", "success");
      } catch (error) { UI.showToast(error.message, "danger"); }
    }
  });

  document.addEventListener("change", function (event) {
    if (event.target.matches("[data-usage-point-selector]")) selectUsagePoint(event.target.value);
  });

  document.addEventListener("focusin", function (event) {
    var point = event.target.closest && event.target.closest("[data-usage-point]");
    if (point) selectUsagePoint(point.dataset.usageIndex);
  });

  document.addEventListener("mouseover", function (event) {
    var point = event.target.closest && event.target.closest("[data-usage-point]");
    if (point) selectUsagePoint(point.dataset.usageIndex);
  });

  document.getElementById("customer-switcher").addEventListener("change", function (event) {
    currentCustomerId = event.target.value;
    currentProductId = customer().productId;
    currentInquiryId = null;
    try { window.sessionStorage.setItem("watercare-one.current-customer", currentCustomerId); } catch (error) { /* no-op */ }
    UI.setQuery({ customer: currentCustomerId, product: currentProductId, inquiry: null });
    render();
    UI.showToast(customer().name + " 고객의 가상 계정으로 전환했습니다.");
  });

  document.querySelector("textarea[name='description']").addEventListener("input", function (event) {
    document.getElementById("description-count").textContent = event.target.value.length;
  });

  document.getElementById("inquiry-form").addEventListener("submit", function (event) {
    if (event.submitter && event.submitter.value === "cancel") return;
    event.preventDefault();
    var form = event.currentTarget;
    var data = new FormData(form);
    var symptoms = data.getAll("symptoms");
    var submit = document.getElementById("submit-inquiry");
    submit.disabled = true;
    try {
      var inquiryId = Store.createInquiry({ customerId: currentCustomerId, productId: data.get("productId"), symptomTypes: symptoms, description: data.get("description"), requestId: "FORM-" + Date.now() }, { role: "CUSTOMER", id: currentCustomerId });
      currentInquiryId = inquiryId;
      currentView = "inquiries";
      document.getElementById("inquiry-dialog").close();
      UI.setQuery({ customer: currentCustomerId, view: "inquiries", inquiry: inquiryId });
      render();
      UI.showToast("문의가 접수되었습니다. 추가 확인 질문을 준비했어요.", "success");
    } catch (error) { UI.showToast(error.message, "danger"); }
    finally { submit.disabled = false; }
  });

  document.getElementById("product-form").addEventListener("submit", function (event) {
    if (event.submitter && event.submitter.value === "cancel") return;
    event.preventDefault();
    var data = new FormData(event.currentTarget);
    try {
      var savedProductId = Store.saveProduct({
        id: data.get("id") || null,
        customerId: currentCustomerId,
        modelId: data.get("modelId"),
        startedAt: data.get("startedAt"),
        managementType: data.get("managementType"),
        lastReplacementAt: data.get("lastReplacementAt"),
        installedArea: data.get("installedArea"),
        siteId: data.get("siteId") || null,
        assetTag: data.get("assetTag"),
        requestId: data.get("id") ? null : "PRODUCT-FORM-" + Date.now()
      }, { role: "CUSTOMER", id: currentCustomerId });
      currentProductId = savedProductId;
      document.getElementById("product-dialog").close();
      UI.setQuery({ customer: currentCustomerId, view: "product", product: currentProductId });
      render();
      UI.showToast(data.get("id") ? "제품 정보를 수정했습니다." : "제품을 등록했습니다.", "success");
    } catch (error) { UI.showToast(error.message, "danger"); }
  });

  document.getElementById("questionnaire-form").addEventListener("submit", function (event) {
    if (event.submitter && event.submitter.value === "cancel") return;
    event.preventDefault();
    var data = new FormData(event.currentTarget);
    try {
      Store.submitQuestionnaire(currentCustomerId, data.get("productId"), { flow: data.get("flow"), leak: data.get("leak"), taste: data.get("taste"), temperature: data.get("temperature"), performedActions: data.get("performedActions") }, { role: "CUSTOMER", id: currentCustomerId });
      document.getElementById("questionnaire-dialog").close();
      UI.showToast("사전 문진을 제출했습니다. 관계자 화면에도 반영됩니다.", "success");
    } catch (error) { UI.showToast(error.message, "danger"); }
  });

  document.getElementById("reschedule-form").addEventListener("submit", function (event) {
    if (event.submitter && event.submitter.value === "cancel") return;
    event.preventDefault();
    var data = new FormData(event.currentTarget);
    try {
      var desiredDate = new Date(data.get("desiredAt"));
      if (Number.isNaN(desiredDate.getTime())) throw new Error("변경 희망 일시를 확인해 주세요.");
      var desiredAt = desiredDate.toISOString();
      Store.requestVisitReschedule(data.get("inquiryId"), {
        desiredAt: desiredAt,
        reason: data.get("reasonCode") + " · " + data.get("reason"),
        actorName: customer().customerType === "BUSINESS" ? customer().name + " / " + customer().contactName : customer().name,
        customerType: customer().customerType,
        customerId: currentCustomerId
      });
      document.getElementById("reschedule-dialog").close();
      UI.showToast("일정 변경 요청을 전달했습니다. 승인 전까지 기존 일정이 유지됩니다.", "success");
    } catch (error) { UI.showToast(error.message, "danger"); }
  });

  notificationController = initCustomerNotificationCenter();
  try { Store.refreshDueQuestionnaires(); state = Store.getState(); } catch (error) { UI.showToast(error.message, "danger"); }
  Store.subscribe(function (nextState, reason) { state = nextState; render(reason); });
  render();
  initCustomerMenuSearch();
  bindDialogDismissals();
})();
