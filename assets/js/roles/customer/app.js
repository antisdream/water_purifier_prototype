(function () {
  'use strict';

  var Store = window.WaterCareStore;
  var UI = window.WaterCareUI || {};
  var viewRoot = document.getElementById('customer-view');
  var main = document.getElementById('customer-main');
  var switcher = document.getElementById('customer-switcher');
  var notificationDialog = document.getElementById('notification-dialog');
  var notificationList = document.getElementById('notification-list');
  var notificationCount = document.getElementById('notification-count');
  var productDialog = document.getElementById('product-dialog');
  var rescheduleDialog = document.getElementById('reschedule-dialog');
  var toastNode = document.getElementById('toast');
  var toastTimer = 0;

  var app = {
    route: 'home',
    customerId: '',
    inquiryId: '',
    questionnaireSessionId: '',
    returnRoute: 'home'
  };

  var STATUS_LABELS = {
    DRAFT: '작성 중',
    QUESTIONNAIRE_IN_PROGRESS: '문진 진행 중',
    AI_GUIDANCE: 'AI 안내 확인',
    CONSULTATION_REQUIRED: '상담 연결 필요',
    CONSULTATION_IN_PROGRESS: '상담 진행 중',
    VISIT_REVIEW_PENDING: '방문 검토 중',
    VISIT_SCHEDULING: '방문 일정 조율 중',
    VISIT_SCHEDULED: '방문 예정',
    COMPLETION_PENDING: '처리 결과 확인 필요',
    REVISIT_REQUIRED: '재방문 필요',
    REOPENED: '다시 처리 중',
    RESOLVED: '처리 완료',
    CANCELLED: '취소됨'
  };

  var AI_LABELS = {
    IDLE: '분석을 준비하고 있습니다.',
    STRUCTURING: '증상 정보를 분석하고 있습니다.',
    CHECKING_MISSING_FIELDS: '추가 확인 항목을 확인하고 있습니다.',
    SAFETY_CHECK: '안전 기준을 확인하고 있습니다.',
    RETRIEVING: '공식 문서를 검색하고 있습니다.',
    RERANKING: '관련 근거를 정리하고 있습니다.',
    GENERATING: '안내를 작성하고 있습니다.',
    VALIDATING: '결과와 안전성을 확인하고 있습니다.',
    COMPLETED: '분석이 완료되었습니다.',
    FAILED: '처리하지 못했습니다. 입력은 유지됩니다.',
    CANCELLED: '처리가 중단되었습니다.'
  };

  var SYMPTOMS = [
    { code: 'LOW_FLOW', label: '출수량 저하', help: '물이 나오지 않거나 평소보다 약함' },
    { code: 'TASTE_ODOR', label: '물맛·냄새 이상', help: '맛이나 냄새가 평소와 다름' },
    { code: 'LEAK', label: '제품 누수', help: '제품 또는 연결부 주변에 물이 보임' },
    { code: 'TEMPERATURE', label: '냉·온수 온도 이상', help: '냉수나 온수 온도가 기대와 다름' },
    { code: 'OTHER', label: '기타 증상', help: '위 항목에 해당하지 않음' }
  ];

  var QUESTION_DEFINITIONS = {
    WATER_OUTAGE: { label: '현재 단수 여부를 확인하셨나요?', options: [['NO', '단수가 아닙니다'], ['YES', '단수입니다'], ['UNKNOWN', '확인하지 못했습니다']] },
    HOSE_STATE: { label: '급수 호스가 꺾이거나 눌려 있나요?', options: [['NORMAL', '정상입니다'], ['BENT', '꺾임 또는 눌림이 있습니다'], ['UNKNOWN', '확인하기 어렵습니다']] },
    FILTER_STATE: { label: '최근 필터 교체 상태를 알려주세요.', options: [['RECENT', '최근 교체했습니다'], ['OVERDUE', '교체 시기가 지났습니다'], ['UNKNOWN', '기억나지 않습니다']] },
    OTHER_FAUCET: { label: '같은 공간의 다른 수전은 정상인가요?', options: [['NORMAL', '정상입니다'], ['LOW', '수압이 약합니다'], ['UNKNOWN', '확인하지 못했습니다']] },
    HOT_WATER_USE: { label: '온수 사용 중에 증상이 발생했나요?', options: [['YES', '예'], ['NO', '아니요'], ['NOT_USED', '온수를 사용하지 않았습니다']] },
    WATER_PRESSURE: { label: '평소와 비교한 수압은 어떤가요?', options: [['NORMAL', '비슷합니다'], ['LOW', '약합니다'], ['NONE', '전혀 나오지 않습니다']] },
    UNUSED_PERIOD: { label: '제품을 사용하지 않은 기간이 있었나요?', options: [['NO', '없었습니다'], ['SHORT', '1~3일'], ['LONG', '4일 이상']] },
    FLUSHING_RESULT: { label: '공식 안내에 따라 통수한 뒤에도 증상이 계속되나요?', options: [['YES', '계속됩니다'], ['NO', '나아졌습니다'], ['NOT_DONE', '아직 하지 않았습니다']] },
    LEAK_LOCATION: { label: '물이 보이는 위치를 알려주세요.', options: [['TRAY', '물받이 주변'], ['CONNECTION', '연결부 주변'], ['BODY', '제품 본체'], ['UNKNOWN', '확인하기 어렵습니다']] },
    POWER_DISCONNECTED: { label: '제품 전원을 분리했나요?', options: [['YES', '분리했습니다'], ['NO', '아직 분리하지 않았습니다'], ['UNSAFE', '직접 확인하기 어렵습니다']] },
    SOURCE_VALVE_CLOSED: { label: '원수 밸브를 잠갔나요?', options: [['YES', '잠갔습니다'], ['NO', '아직 잠그지 않았습니다'], ['UNSAFE', '직접 확인하기 어렵습니다']] },
    CONTINUOUS_DISPENSE: { label: '연속 출수 후에 온도 이상이 발생했나요?', options: [['YES', '예'], ['NO', '아니요'], ['UNKNOWN', '확인하기 어렵습니다']] },
    LOCK_STATE: { label: '잠금 기능 상태를 확인하셨나요?', options: [['NORMAL', '정상입니다'], ['LOCKED', '잠금 상태입니다'], ['UNKNOWN', '확인하지 못했습니다']] },
    WAIT_TIME: { label: '충분히 기다린 뒤 다시 확인했나요?', options: [['YES', '예'], ['NO', '아니요']] },
    DISPLAY_TEXT: { label: '제품 화면에 표시된 문구나 코드를 입력해주세요.', type: 'text', placeholder: '표시된 문구를 그대로 입력' },
    PERFORMED_ACTIONS: { label: '이미 수행한 안전한 확인 조치를 적어주세요.', type: 'text', placeholder: '수행한 조치가 없다면 없음으로 입력' }
  };

  function escapeHtml(value) {
    if (typeof UI.escape === 'function') return UI.escape(value == null ? '' : String(value));
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDateTime(value) {
    if (!value) return '확인 필요';
    if (typeof UI.formatDateTime === 'function') {
      try { return UI.formatDateTime(value); } catch (error) { /* fallback below */ }
    }
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  function formatDate(value) {
    if (!value) return '확인 필요';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
  }

  function toLocalInput(value) {
    var date = value ? new Date(value) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (Number.isNaN(date.getTime())) date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    var local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function statusLabel(code) {
    if (typeof UI.statusLabel === 'function') {
      try { return plainText(UI.statusLabel(code)); } catch (error) { /* fallback below */ }
    }
    return STATUS_LABELS[code] || code || '확인 필요';
  }

  function riskLabel(code) {
    if (typeof UI.riskLabel === 'function') {
      try { return plainText(UI.riskLabel(code)); } catch (error) { /* fallback below */ }
    }
    return ({ NORMAL: '일반', GENERAL: '일반', CAUTION: '주의', DANGER: '위험' })[code] || code || '확인 중';
  }

  function usageLabel(code) {
    if (typeof UI.usageLabel === 'function') {
      try { return plainText(UI.usageLabel(code)); } catch (error) { /* fallback below */ }
    }
    return ({
      NORMAL: '정상 사용 가능',
      PARTIAL_STOP: '일부 기능 사용 중지',
      TOTAL_STOP: '제품 전체 사용 중지',
      PENDING_CONSULTATION: '상담 전까지 사용 제한'
    })[code] || code || '확인 필요';
  }

  function plainText(value) {
    var holder = document.createElement('span');
    holder.innerHTML = String(value == null ? '' : value);
    return holder.textContent || '';
  }

  function state() {
    return Store.getState();
  }

  function list(name) {
    var value = state() && state()[name];
    return Array.isArray(value) ? value : [];
  }

  function customerName(customer) {
    return customer && (customer.displayName || customer.name || customer.customerName) || '합성 고객';
  }

  function modelCode(product) {
    return product && (product.productCode || product.modelCode || product.product_code) || '';
  }

  function modelName(product) {
    return product && (product.productName || product.modelName || product.name) || 'SK매직 WPU-JAC104D';
  }

  function manualModel(product) {
    return product && (product.manualModel || product.manual_model) || 'WPU-JAC104D';
  }

  function managementLabel(product) {
    if (!product) return '방문관리';
    return product.managementLabel || ({ VISIT: '방문관리' })[product.managementType] || product.managementType || '방문관리';
  }

  function careSchedule(product) {
    var schedule = product && product.careSchedule;
    if (schedule && typeof schedule === 'object') {
      return { label: schedule.label || '확인 필요', source: schedule.sourceType === 'official' ? '공식 기준' : schedule.sourceType === 'team_designed' ? '팀 설계' : '확인 필요' };
    }
    return { label: product && product.careScheduleLabel || '확인 필요', source: product && product.careScheduleSource || '확인 필요' };
  }

  function usageCode(inquiry) {
    if (!inquiry) return '';
    if (typeof inquiry.usageGuidance === 'object' && inquiry.usageGuidance) {
      return inquiry.usageGuidance.usageStatus || inquiry.usageGuidance.status || inquiry.usageGuidance.code || '';
    }
    return inquiry.usageGuidance || '';
  }

  function currentCustomer() {
    return list('customers').find(function (item) { return item.id === app.customerId; }) || list('customers')[0] || null;
  }

  function productsForCustomer() {
    return list('products').filter(function (item) {
      return item.customerId === app.customerId;
    });
  }

  function currentProduct() {
    var customer = currentCustomer();
    return productsForCustomer().find(function (item) { return customer && item.id === customer.productId; }) || productsForCustomer()[0] || null;
  }

  function inquiriesForCustomer() {
    return list('inquiries')
      .filter(function (item) { return item.customerId === app.customerId; })
      .sort(function (a, b) {
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
      });
  }

  function currentInquiry() {
    var inquiries = inquiriesForCustomer();
    if (app.inquiryId) return inquiries.find(function (item) { return item.id === app.inquiryId; }) || null;
    return inquiries[0] || null;
  }

  function questionnairesForCustomer() {
    return list('questionnaireSessions').filter(function (item) { return item.customerId === app.customerId; }).sort(function (a, b) {
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
  }

  function currentQuestionnaire() {
    var sessions = questionnairesForCustomer();
    if (app.questionnaireSessionId) return sessions.find(function (item) { return item.id === app.questionnaireSessionId; }) || null;
    return sessions[0] || null;
  }

  function currentIntake() {
    return app.questionnaireSessionId ? currentQuestionnaire() : currentInquiry();
  }

  function productSupport(product) {
    if (window.WaterCareModelPolicy) return window.WaterCareModelPolicy.evaluate(product);
    return { status: product && product.supportStatus || 'UNSUPPORTED', aiAllowed: product && product.productCode === 'WPUJAC104DWH', message: product && product.supportMessage || '지원 범위를 확인해주세요.' };
  }

  function latestProductSupportRequest(product) {
    if (!product) return null;
    return list('productSupportRequests').filter(function (item) {
      return item.customerId === app.customerId && item.productId === product.id;
    }).sort(function (a, b) {
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    })[0] || null;
  }

  function productSupportRequestCard(request) {
    if (!request) return '';
    var labels = { CONSULTATION_REQUIRED: '상담 접수 대기', IN_PROGRESS: '상담원 확인 중', COMPLETED: '상담 완료' };
    return '<article class="content-card content-card--blue"><div class="content-card__header"><div><span class="card-label">PRODUCT SUPPORT · ' + escapeHtml(request.id) + '</span><h3>' + escapeHtml(labels[request.status] || request.status) + '</h3></div><span class="status-chip">' + escapeHtml(request.validationStatus || '확인 필요') + '</span></div><p>' + escapeHtml(request.result || request.reason || '제품 지원 범위를 확인하고 있습니다.') + '</p>' + (request.counselNote ? '<p><strong>상담 기록</strong> · ' + escapeHtml(request.counselNote) + '</p>' : '') + '<small>' + escapeHtml(formatDateTime(request.updatedAt || request.createdAt)) + '</small></article>';
  }

  function visitForInquiry(inquiry) {
    if (!inquiry) return null;
    return list('visits').find(function (item) { return item.inquiryId === inquiry.id; }) || null;
  }

  function evidenceForInquiry(inquiry) {
    if (!inquiry) return [];
    var ids = Array.isArray(inquiry.evidenceIds) ? inquiry.evidenceIds : [];
    return list('evidenceRegistry').filter(function (item) {
      return ids.indexOf(item.id || item.evidenceId) >= 0;
    });
  }

  function actor() {
    var customer = currentCustomer();
    return {
      role: 'CUSTOMER',
      id: customer ? customer.id : app.customerId,
      name: customerName(customer)
    };
  }

  function showToast(message, type) {
    window.clearTimeout(toastTimer);
    toastNode.textContent = message;
    toastNode.classList.toggle('is-error', type === 'error');
    toastNode.classList.add('is-visible');
    toastTimer = window.setTimeout(function () { toastNode.classList.remove('is-visible'); }, 3200);
  }

  function errorMessage(error) {
    var code = error && error.code ? '[' + error.code + '] ' : '';
    return code + (error && error.message ? error.message : '요청을 처리하지 못했습니다.');
  }

  function dispatch(eventName, payload, successMessage) {
    try {
      var eventPayload = Object.assign({}, payload || {});
      if (eventPayload.inquiryId) {
        var targetInquiry = list('inquiries').find(function (item) { return item.id === eventPayload.inquiryId; });
        if (targetInquiry && eventPayload.stateVersion == null) eventPayload.stateVersion = targetInquiry.stateVersion;
      }
      if (!eventPayload.idempotencyKey) {
        eventPayload.idempotencyKey = [eventName, eventPayload.inquiryId || eventPayload.questionnaireSessionId || eventPayload.productId || 'GLOBAL', eventPayload.stateVersion || 0, Date.now(), Math.random().toString(36).slice(2, 8)].join(':');
      }
      var result = Store.dispatch(eventName, eventPayload, actor());
      if (successMessage) showToast(successMessage);
      return result;
    } catch (error) {
      showToast(errorMessage(error), 'error');
      return false;
    }
  }

  function supportedProductOrWarn() {
    var product = currentProduct();
    if (!product) {
      showToast('[NO-DATA-01] 등록된 제품이 없습니다. 제품을 먼저 등록해주세요.', 'error');
      return null;
    }
    return product;
  }

  function setRoute(route, inquiryId) {
    app.route = route;
    if (inquiryId) app.inquiryId = inquiryId;
    render();
    window.requestAnimationFrame(function () {
      main.scrollTop = 0;
      main.focus({ preventScroll: true });
    });
  }

  function screenHeader(kicker, title, description, backRoute) {
    return `
      <div class="screen-topline">
        <div class="screen-topline__copy">
          <span class="section-kicker">${escapeHtml(kicker)}</span>
          <h1 class="screen-title">${escapeHtml(title)}</h1>
          ${description ? '<p class="screen-description">' + escapeHtml(description) + '</p>' : ''}
        </div>
        ${backRoute ? '<button class="back-button" type="button" data-route="' + escapeHtml(backRoute) + '" aria-label="이전 화면">←</button>' : ''}
      </div>`;
  }

  function progress(step) {
    var html = '<div class="progress-strip" aria-label="문의 진행 ' + step + '단계, 총 4단계">';
    for (var index = 1; index <= 4; index += 1) {
      html += '<span class="' + (index < step ? 'is-complete' : index === step ? 'is-current' : '') + '"></span>';
    }
    return html + '</div>';
  }

  function riskClass(level) {
    if (level === 'DANGER') return 'risk-chip--danger';
    if (level === 'CAUTION') return 'risk-chip--warning';
    return 'risk-chip--normal';
  }

  function nextActionText(inquiry) {
    if (!inquiry) return '새 증상 상담을 시작할 수 있습니다.';
    if (inquiry.customerActionRequired === 'SAFETY_CONFIRMATION') return '안전조치 상태를 확인하고 상담을 요청해주세요.';
    if (inquiry.status === 'DRAFT') return '작성 중인 문진을 완료해주세요.';
    if (inquiry.status === 'QUESTIONNAIRE_IN_PROGRESS' && inquiry.missingFields && inquiry.missingFields.length) return '추가 질문에 답변해주세요.';
    if (inquiry.status === 'QUESTIONNAIRE_IN_PROGRESS') return '작성 중인 문진을 완료해주세요.';
    if (inquiry.status === 'AI_GUIDANCE') return '공식 근거와 안전 안내를 확인해주세요.';
    if (inquiry.status === 'COMPLETION_PENDING' && !inquiry.resolutionFeedback) return '처리 결과를 확인하고 해결 여부를 알려주세요.';
    if (inquiry.status === 'CONSULTATION_REQUIRED') return '상담사가 문의를 확인하고 있습니다.';
    if (inquiry.status === 'VISIT_SCHEDULED') return '확정된 방문 일정을 확인해주세요.';
    if (inquiry.status === 'RESOLVED') return '문의가 최종 완료되었습니다.';
    return '처리 상태와 다음 단계를 확인해주세요.';
  }

  function currentOwner(inquiry) {
    if (!inquiry) return { title: '고객', subtitle: '새 문의 작성 가능' };
    if (isCustomerActionRequired(inquiry)) return { title: customerName(currentCustomer()), subtitle: '고객 확인 필요' };
    if (inquiry.assignedTechnicianId && ['VISIT_SCHEDULED', 'COMPLETION_PENDING', 'REVISIT_REQUIRED'].indexOf(inquiry.status) >= 0) {
      return { title: '배정 방문기사', subtitle: inquiry.assignedTechnicianId };
    }
    if (inquiry.assignedCounselorId || inquiry.requiresConsultation) {
      return { title: '담당 상담사', subtitle: inquiry.assignedCounselorId || '배정 진행 중' };
    }
    return { title: 'AI 안내', subtitle: '공식 근거 확인 단계' };
  }

  function isCustomerActionRequired(inquiry) {
    if (!inquiry) return false;
    return inquiry.customerActionRequired === true || ['ADDITIONAL_ANSWERS', 'ACTION_RESULT', 'SAFETY_CONFIRMATION', 'RESOLUTION_FEEDBACK'].indexOf(inquiry.customerActionRequired) >= 0;
  }

  function routeForInquiry(inquiry) {
    if (!inquiry) return 'home';
    if (inquiry.status === 'DRAFT') return 'precheck';
    if (inquiry.status === 'QUESTIONNAIRE_IN_PROGRESS') return inquiry.missingFields && inquiry.missingFields.length ? 'questions' : 'precheck';
    if (inquiry.status === 'AI_GUIDANCE') return 'guidance';
    if (inquiry.aiOutcome === 'NO_EVIDENCE' || inquiry.aiState === 'FAILED') return 'guidance';
    if (inquiry.status === 'CONSULTATION_REQUIRED' && inquiry.customerActionRequired === 'SAFETY_CONFIRMATION') return 'guidance';
    return 'detail';
  }

  function renderHome() {
    var customer = currentCustomer();
    var product = currentProduct();
    var support = productSupport(product);
    var latestQuestionnaire = questionnairesForCustomer()[0] || null;
    var reusableQuestionnaire = questionnairesForCustomer().find(function (item) { return item.questionnaireStatus === 'SUBMITTED' && !item.inquiryId; }) || null;
    var inquiry = inquiriesForCustomer().find(function (item) {
      return item.status !== 'RESOLVED' && item.status !== 'CANCELLED';
    }) || inquiriesForCustomer()[0];
    var precheckStatus = latestQuestionnaire && latestQuestionnaire.questionnaireStatus || customer && customer.questionnaireStatus || product && (product.questionnaireStatus || product.precheckStatus) || 'NOT_CREATED';
    var schedule = careSchedule(product);
    var precheckLabel = ({
      NOT_CREATED: '생성 전', UNANSWERED: '미응답', IN_PROGRESS: '작성 중', SUBMITTED: '제출 완료'
    })[precheckStatus] || precheckStatus;

    if (!product) {
      return '<section class="app-screen">' + screenHeader('CUST-01', '고객 홈', '지원 제품과 문의 현황을 확인합니다.') +
        '<div class="empty-state"><span class="empty-state__icon">!</span><h3>등록된 제품이 없습니다.</h3><p>제품 코드를 등록하면 지원 범위를 검증하고, 미지원 모델은 AI 분석 없이 상담으로 연결합니다.</p><button class="button button--primary" type="button" data-action="edit-product">제품 등록</button></div></section>';
    }

    return `
      <section class="app-screen" data-screen-id="CUST-01">
        ${screenHeader('CUST-01 · CUSTOMER HOME', customerName(customer) + '님, 안녕하세요', '제품 관리와 현재 필요한 행동을 한눈에 확인하세요.')}
        <article class="hero-card ${support.aiAllowed ? '' : 'hero-card--warning'}">
          <p class="hero-card__eyebrow">지금 필요한 행동</p>
          <h2>${escapeHtml(support.aiAllowed ? nextActionText(inquiry) : '제품 지원 범위를 상담사에게 확인해주세요.')}</h2>
          <p>${support.aiAllowed ? (inquiry ? escapeHtml(inquiry.id) + ' · ' + escapeHtml(statusLabel(inquiry.status)) : '등록된 진행 문의가 없습니다.') : escapeHtml(support.message)}</p>
          <div class="hero-card__actions">
            ${support.aiAllowed ? (inquiry ? '<button class="button button--light" type="button" data-action="open-inquiry" data-inquiry-id="' + escapeHtml(inquiry.id) + '">이어보기</button>' : '<button class="button button--light" type="button" data-action="start-inquiry">증상 상담</button>') : '<button class="button button--light" type="button" data-action="request-product-support">제품 상담 요청</button>'}
            ${support.aiAllowed ? '<button class="button button--outline-light" type="button" data-action="start-precheck">사전 문진</button>' : ''}
          </div>
        </article>

        ${reusableQuestionnaire && support.aiAllowed ? '<article class="content-card content-card--blue"><span class="card-label">독립 사전 문진 · ' + escapeHtml(reusableQuestionnaire.id) + '</span><h3>제출한 문진으로 증상 상담을 시작할 수 있어요.</h3><p>문진 원문과 답변을 새 문의에 연결하고, 제출 전 내용을 다시 확인합니다.</p><button class="button button--primary button--block" type="button" data-action="start-linked-inquiry" data-questionnaire-id="' + escapeHtml(reusableQuestionnaire.id) + '">이 문진으로 상담 시작</button></article>' : ''}

        <div class="content-stack">
          <article class="content-card">
            <div class="content-card__header"><div><span class="card-label">지원 제품</span><h3>내 정수기</h3></div><button class="button button--text" type="button" data-action="edit-product">수정</button></div>
            <div class="product-summary">
              <div class="product-visual" aria-hidden="true"></div>
              <div>
                <span class="data-chip">${escapeHtml(support.status === 'SUPPORTED' ? 'MVP 지원' : support.status === 'EXPANSION' ? '후속 확장' : support.status === 'ARCHIVED' ? '보관 모델' : '지원 범위 밖')}</span>
                <h3>${escapeHtml(modelName(product))}</h3>
                <code class="product-code">${escapeHtml(modelCode(product) || 'WPUJAC104DWH')}</code>
                <span class="product-code">설명서 ${escapeHtml(manualModel(product))}</span>
              </div>
            </div>
            <dl class="metadata-grid">
              <div><dt>사용 시작일</dt><dd>${escapeHtml(formatDate(product.startedAt || product.startDate || product.installedAt))}</dd></div>
              <div><dt>관리 유형</dt><dd>${escapeHtml(managementLabel(product))}</dd></div>
              <div><dt>최근 관리일</dt><dd>${escapeHtml(formatDate(product.lastCareAt))}</dd></div>
              <div><dt>필터·카트리지</dt><dd>${escapeHtml(formatDate(product.lastReplacementAt || product.lastFilterAt || product.lastFilterChangedAt))}</dd></div>
            </dl>
          </article>

          <div class="quick-actions">
            ${support.aiAllowed ? '<button class="quick-action" type="button" data-action="start-precheck"><span aria-hidden="true">✓</span><strong>사전 문진</strong><small>' + escapeHtml(precheckLabel) + ' · 문의와 분리 저장</small></button><button class="quick-action" type="button" data-action="start-inquiry"><span aria-hidden="true">＋</span><strong>증상 상담</strong><small>증상을 입력하고 공식 안내 확인</small></button>' : '<button class="quick-action" type="button" data-action="request-product-support"><span aria-hidden="true">!</span><strong>제품 상담</strong><small>AI·RAG 실행 없이 지원 범위 확인</small></button>'}
            <button class="quick-action" type="button" data-route="schedule"><span aria-hidden="true">□</span><strong>케어 일정</strong><small>${escapeHtml(schedule.label)}</small></button>
            <button class="quick-action" type="button" data-route="inquiries"><span aria-hidden="true">◎</span><strong>문의 내역</strong><small>상담·방문 처리 현황 확인</small></button>
          </div>
        </div>
      </section>`;
  }

  function renderProduct() {
    var product = currentProduct();
    if (!product) return '<section class="app-screen">' + screenHeader('MY PRODUCT', '내 제품', '제품을 등록한 뒤 지원 범위를 확인합니다.', 'home') + '<div class="empty-state"><span class="empty-state__icon">!</span><h3>등록된 제품이 없습니다.</h3><p>제품 코드를 등록하면 MVP·확장·보관·미지원 범위를 구분합니다.</p><button class="button button--primary" type="button" data-action="edit-product">제품 등록</button></div></section>';
    var support = productSupport(product);
    var supportRequest = latestProductSupportRequest(product);
    return `
      <section class="app-screen" data-screen-id="CUST-01-PRODUCT">
        ${screenHeader('MY PRODUCT', '내 제품', 'FIX 범위의 지원 제품 정보입니다.', 'home')}
        <article class="content-card content-card--tinted">
          <div class="product-summary">
            <div class="product-visual" aria-hidden="true"></div>
            <div><span class="data-chip">scope_role · mvp_primary</span><h3>${escapeHtml(modelName(product))}</h3><code class="product-code">${escapeHtml(modelCode(product) || 'WPUJAC104DWH')}</code><span class="product-code">manual_model · ${escapeHtml(manualModel(product))}</span></div>
          </div>
        </article>
        <article class="content-card ${support.aiAllowed ? '' : 'content-card--danger'}"><div class="content-card__header"><h3>제품 지원 범위</h3><span class="status-chip">${escapeHtml(support.status)}</span></div><p>${escapeHtml(support.message)}</p>${support.aiAllowed ? '' : supportRequest && supportRequest.status !== 'COMPLETED' ? '<button class="button button--secondary button--block" type="button" disabled>' + escapeHtml(supportRequest.status === 'IN_PROGRESS' ? '상담원 확인 중' : '제품 상담 접수됨') + '</button>' : '<button class="button button--secondary button--block" type="button" data-action="request-product-support">AI 분석 없이 제품 상담 요청</button>'}</article>
        ${productSupportRequestCard(supportRequest)}
        <article class="content-card">
          <div class="content-card__header"><h3>등록 정보</h3><button class="button button--text" type="button" data-action="edit-product">수정</button></div>
          <dl class="metadata-grid">
            <div><dt>사용 시작일</dt><dd>${escapeHtml(formatDate(product.startedAt || product.startDate || product.installedAt))}</dd></div>
            <div><dt>관리 유형</dt><dd>${escapeHtml(managementLabel(product))}</dd></div>
            <div><dt>최근 관리일</dt><dd>${escapeHtml(formatDate(product.lastCareAt))}</dd></div>
            <div><dt>필터·카트리지</dt><dd>${escapeHtml(formatDate(product.lastReplacementAt || product.lastFilterAt || product.lastFilterChangedAt))}</dd></div>
            <div><dt>설치 공간</dt><dd>${escapeHtml(product.installedArea || '확인 필요')}</dd></div>
            <div><dt>케어 기준</dt><dd>${escapeHtml(careSchedule(product).source)}</dd></div>
          </dl>
        </article>
        <div class="inline-notice"><strong>i</strong><p>확정된 MVP 지원 범위와 공식 근거가 있는 제품 정보만 표시합니다.</p></div>
      </section>`;
  }

  function renderPrecheck() {
    var inquiry = currentIntake();
    if (!inquiry) return renderHome();
    var independent = Boolean(app.questionnaireSessionId);
    var selected = Array.isArray(inquiry.symptomCodes) ? inquiry.symptomCodes : [];
    var answers = inquiry.answers || {};
    return `
      <section class="app-screen" data-screen-id="CUST-02">
        ${screenHeader('CUST-02 · PRE-CHECK', independent ? '독립 사전 문진' : '증상 문의·문진 입력', independent ? '문의번호를 만들지 않고 문진만 저장합니다. 제출 후 이 문진으로 상담을 시작할 수 있습니다.' : '아는 내용만 입력해도 됩니다. 선택한 내용은 다음 단계에서 다시 묻지 않습니다.', 'home')}
        ${progress(1)}
        <form id="symptom-form" novalidate>
          <fieldset class="form-section">
            <legend>대표 증상 <small class="field-help">복수 선택 가능 · 선택하지 않아도 됨</small></legend>
            <div class="choice-grid">
              ${SYMPTOMS.map(function (symptom) {
                return '<label class="choice-card"><input type="checkbox" name="symptomCodes" value="' + symptom.code + '"' + (selected.indexOf(symptom.code) >= 0 ? ' checked' : '') + '><span>' + escapeHtml(symptom.label) + '</span></label>';
              }).join('')}
            </div>
          </fieldset>
          <label class="field"><span>증상을 자세히 알려주세요 <small>증상 미선택 시 필수</small></span><textarea name="description" maxlength="500" placeholder="언제부터 어떤 상황에서 불편한지 그대로 적어주세요.">${escapeHtml(inquiry.description || '')}</textarea><small class="field-help">입력한 원문은 상담사와 방문기사에게 동일하게 전달됩니다.</small></label>
          <label class="field"><span>증상 발생 조건</span><input name="occurrenceConditions" maxlength="160" value="${escapeHtml(inquiry.occurrenceConditions || inquiry.conditions || '')}" placeholder="예: 아침 첫 출수, 연속 사용 후"></label>
          <label class="field"><span>화면 표시 문구·오류 코드</span><input name="displayText" maxlength="80" value="${escapeHtml(inquiry.displayText || inquiry.displayCode || '')}" placeholder="표시된 문구를 추정하지 말고 그대로 입력"></label>

          <fieldset class="form-section">
            <legend>기본 확인</legend>
            <div class="choice-grid choice-grid--single">
              <label class="field"><span>현재 출수 상태</span><select name="flow"><option value="">선택하지 않음</option><option value="NORMAL"${answers.flow === 'NORMAL' ? ' selected' : ''}>평소와 같음</option><option value="LOW"${answers.flow === 'LOW' ? ' selected' : ''}>평소보다 약함</option><option value="NONE"${answers.flow === 'NONE' ? ' selected' : ''}>물이 나오지 않음</option></select></label>
              <label class="field"><span>제품 주변 물기</span><select name="leak"><option value="">선택하지 않음</option><option value="NO"${answers.leak === 'NO' ? ' selected' : ''}>없음</option><option value="YES"${answers.leak === 'YES' ? ' selected' : ''}>있음</option><option value="UNKNOWN"${answers.leak === 'UNKNOWN' ? ' selected' : ''}>확인하기 어려움</option></select></label>
            </div>
          </fieldset>
          <div class="inline-notice inline-notice--danger"><strong>!</strong><p>누수, 전기·화상 위험이 의심되면 제품 사용을 중지하세요. 확인되지 않은 표시 코드는 의미를 추정하지 않고 원문 그대로 저장해 상담을 연결합니다.</p></div>
          <div class="button-row button-row--wrap">
            <button class="button button--secondary" type="submit" name="submitMode" value="draft">임시 저장</button>
            <button class="button button--primary" type="submit" name="submitMode" value="submit">${independent ? '사전 문진 제출' : '증상 제출'}</button>
          </div>
          <button class="button button--text button--block" type="button" data-action="${independent ? 'cancel-precheck' : 'cancel-inquiry'}">${independent ? '사전 문진 취소' : '문의 취소'}</button>
        </form>
      </section>`;
  }

  function renderQuestionField(code, existingValue) {
    var rawQuestion = String(code);
    var definition = QUESTION_DEFINITIONS[code] || {
      label: /[?？]$/.test(rawQuestion.trim()) ? rawQuestion : rawQuestion.replaceAll('_', ' ').toLowerCase() + ' 항목을 알려주세요.',
      type: 'text',
      placeholder: '확인한 내용을 입력'
    };
    if (definition.type === 'text') {
      return '<label class="field"><span>' + escapeHtml(definition.label) + '</span><input name="' + escapeHtml(code) + '" value="' + escapeHtml(existingValue || '') + '" placeholder="' + escapeHtml(definition.placeholder || '') + '" required></label>';
    }
    return '<fieldset class="form-section"><legend>' + escapeHtml(definition.label) + '</legend><div class="choice-grid choice-grid--single">' +
      definition.options.map(function (option) {
        return '<label class="choice-card"><input type="radio" name="' + escapeHtml(code) + '" value="' + escapeHtml(option[0]) + '"' + (existingValue === option[0] ? ' checked' : '') + ' required><span>' + escapeHtml(option[1]) + '</span></label>';
      }).join('') + '</div></fieldset>';
  }

  function renderQuestions() {
    var inquiry = currentInquiry();
    if (!inquiry) return renderHome();
    var missing = Array.isArray(inquiry.missingFields) ? inquiry.missingFields : [];
    var answers = inquiry.answers || {};
    if (!missing.length && inquiry.aiState === 'COMPLETED') return renderGuidance();
    return `
      <section class="app-screen" data-screen-id="CUST-03">
        ${screenHeader('CUST-03 · AI FOLLOW-UP', '추가 확인 질문', '이미 입력한 내용은 제외하고 필요한 항목만 확인합니다.', 'precheck')}
        ${progress(2)}
        <article class="content-card content-card--blue">
          <div class="ai-state">${inquiry.aiState !== 'FAILED' ? '<span class="ai-state__pulse" aria-hidden="true"></span>' : '<span aria-hidden="true">!</span>'}<div><h3>${escapeHtml(AI_LABELS[inquiry.aiState] || AI_LABELS.CHECKING_MISSING_FIELDS)}</h3><p>입력 내용은 유지되며 공식 근거와 안전 기준을 함께 확인합니다.</p></div></div>
        </article>
        ${inquiry.aiState === 'FAILED' ? '<article class="content-card content-card--danger"><h3>분석을 완료하지 못했습니다.</h3><p>입력은 안전하게 보관되었습니다. 실패 단계부터 다시 시도하거나 상담을 요청할 수 있습니다.</p><div class="button-row"><button class="button button--secondary" type="button" data-action="retry-ai">다시 시도</button><button class="button button--danger" type="button" data-action="request-consultation">상담 요청</button></div></article>' : ''}
        ${missing.length ? '<form id="answers-form">' + missing.map(function (code) { return renderQuestionField(code, answers[code]); }).join('') + '<button class="button button--primary button--block" type="submit">답변 제출</button></form>' : '<div class="empty-state"><span class="empty-state__icon">✓</span><h3>추가 질문이 없습니다.</h3><p>공식 근거와 안내를 확인할 수 있습니다.</p><button class="button button--primary" type="button" data-route="guidance">안내 확인</button></div>'}
      </section>`;
  }

  function safeUrl(value) {
    if (!value) return '';
    try {
      var parsed = new URL(value, window.location.href);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }

  function evidenceCard(evidence, index) {
    var title = evidence.documentTitle || evidence.documentName || evidence.title || 'WPU-JAC104D/JCC104D 사용설명서';
    var version = evidence.version || evidence.documentVersion || 'REV.00';
    var page = evidence.page || evidence.pageNumber || (Array.isArray(evidence.pageRefs) ? evidence.pageRefs.join(', ') : '') || '확인 필요';
    var summary = evidence.evidenceSummary || evidence.summary || evidence.customerSummary || '공식 문서에서 관련 안전·사용 기준을 확인했습니다.';
    var verified = evidence.verificationLabel || evidence.verificationStatus || '공식 근거 확인 완료';
    var landing = safeUrl(evidence.sourceLandingUrl || evidence.source_landing_url);
    var download = safeUrl(evidence.sourceDirectDownloadUrl || evidence.source_direct_download_url);
    var detailId = 'evidence-detail-' + index;
    return `
      <article class="evidence-card">
        <span class="evidence-card__type">공식 매뉴얼</span>
        <h4>${escapeHtml(title)}</h4>
        <dl><dt>버전</dt><dd>${escapeHtml(version)}</dd><dt>페이지</dt><dd>${escapeHtml(page)}</dd><dt>근거 요약</dt><dd>${escapeHtml(summary)}</dd><dt>검증 상태</dt><dd>${escapeHtml(verified)}</dd></dl>
        <div class="evidence-card__actions">
          ${landing ? '<a href="' + escapeHtml(landing) + '" target="_blank" rel="noopener noreferrer">공식 출처 보기 ↗</a>' : ''}
          ${download ? '<a href="' + escapeHtml(download) + '" target="_blank" rel="noopener noreferrer">설명서 PDF 열기 ↗</a>' : ''}
          <button type="button" data-action="toggle-evidence-detail" aria-controls="${detailId}" aria-expanded="false">문서 상세</button>
        </div>
        <div id="${detailId}" class="evidence-detail" hidden>문서명·버전·페이지는 공식 근거 레지스트리에 등록된 정보입니다. 내부 청크 식별자와 검증 정책은 고객 화면에 표시하지 않습니다.</div>
      </article>`;
  }

  function guidanceValue(inquiry, key, fallback) {
    var guidance = inquiry.guidance || inquiry.aiGuidance || {};
    var value = guidance[key];
    if (Array.isArray(value)) return value.join(' · ');
    return value || fallback;
  }

  function renderGuidance() {
    var inquiry = currentInquiry();
    if (!inquiry) return renderHome();
    var danger = inquiry.riskLevel === 'DANGER' && inquiry.aiOutcome === 'DANGER_DETECTED';
    var noEvidence = inquiry.aiOutcome === 'NO_EVIDENCE';
    var aiFailed = inquiry.aiState === 'FAILED';
    var evidence = evidenceForInquiry(inquiry);
    var usage = usageCode(inquiry);
    return `
      <section class="app-screen" data-screen-id="CUST-04">
        ${screenHeader('CUST-04 · OFFICIAL GUIDANCE', '공식 근거·안전 안내', '공식 문서 근거와 현재 필요한 행동을 순서대로 확인하세요.', inquiry.missingFields && inquiry.missingFields.length ? 'questions' : 'precheck')}
        ${progress(3)}
        <div class="guidance-order">
          <article class="guidance-card ${danger || noEvidence || aiFailed ? 'guidance-card--danger' : ''}"><h3>현재 해야 할 행동</h3><p>${escapeHtml(guidanceValue(inquiry, 'currentAction', danger ? inquiry.usageGuidance.nextAction : noEvidence ? '현재 범위의 공식 근거가 없어 임의 안내를 제공하지 않습니다. 상담사에게 연결합니다.' : aiFailed ? '입력은 보존되었습니다. 실패 단계부터 다시 시도하거나 상담을 요청하세요.' : '아래 공식 안내에 따라 안전하게 확인해주세요.'))}</p></article>
          <article class="guidance-card ${danger ? 'guidance-card--danger' : ''}"><h3>위험도와 사용 제한</h3><p><span class="risk-chip ${riskClass(inquiry.riskLevel)}">${escapeHtml(riskLabel(inquiry.riskLevel))}</span> <span class="usage-chip ${usage === 'TOTAL_STOP' ? 'usage-chip--danger' : ''}">${escapeHtml(usageLabel(usage || 'NORMAL'))}</span></p>${inquiry.usageGuidance && inquiry.usageGuidance.restrictedFunctions && inquiry.usageGuidance.restrictedFunctions.length ? '<small>제한 기능 · ' + escapeHtml(inquiry.usageGuidance.restrictedFunctions.join(' · ')) + '</small>' : ''}</article>
          <article class="guidance-card"><h3>공식 안전조치</h3><p>${escapeHtml(guidanceValue(inquiry, 'safetyActions', danger ? '누수 시 원수 밸브를 잠그고 전원을 분리하세요. 순간온수 경고 시 음용하지 마세요.' : '제품 외관과 급수 상태를 안전한 범위에서 확인하세요.'))}</p></article>
          <article class="guidance-card"><h3>상담 조건</h3><p>${escapeHtml(guidanceValue(inquiry, 'consultationCondition', danger ? '안전조치 여부와 관계없이 즉시 상담이 필요합니다.' : '증상이 지속되거나 조치를 수행하기 어렵다면 상담을 요청하세요.'))}</p></article>
          <article class="guidance-card"><h3>공식 근거</h3><div class="content-stack">${evidence.length ? evidence.map(evidenceCard).join('') : '<p>검증된 공식 근거가 없습니다. 자가조치 대신 상담을 연결합니다.</p>'}</div></article>
          <article class="guidance-card"><h3>증상 요약</h3><p>${escapeHtml(inquiry.description || (inquiry.symptomCodes || []).map(function (code) { var item = SYMPTOMS.find(function (symptom) { return symptom.code === code; }); return item ? item.label : code; }).join(', ') || '고객 입력 내용을 확인 중입니다.')}</p></article>
          <article class="guidance-card ${danger ? 'guidance-card--danger' : ''}"><h3>금지 행동</h3><p>${escapeHtml(guidanceValue(inquiry, 'prohibitedActions', '제품을 분해하거나 확인되지 않은 방법으로 수리하지 마세요.'))}</p></article>
        </div>
        ${danger ? '<button class="button button--danger button--block" type="button" data-route="action">안전조치 확인·상담 요청</button>' : noEvidence ? '<button class="button button--primary button--block" type="button" data-action="request-consultation">상담 요청</button>' : aiFailed ? '<div class="button-row"><button class="button button--secondary" type="button" data-action="retry-ai">실패 단계 재시도</button><button class="button button--primary" type="button" data-action="request-consultation">상담 요청</button></div>' : '<button class="button button--primary button--block" type="button" data-route="action">조치 결과 입력</button>'}
      </section>`;
  }

  function renderAction() {
    var inquiry = currentInquiry();
    if (!inquiry) return renderHome();
    var danger = inquiry.riskLevel === 'DANGER' && inquiry.aiOutcome === 'DANGER_DETECTED';
    if (danger) {
      var safeActions = inquiry.safeActions || {};
      return `
        <section class="app-screen" data-screen-id="CUST-05" data-mode="safety">
          ${screenHeader('CUST-05 · SAFETY MODE', '안전조치 확인·상담 요청', '안전조치 완료 여부와 상담 진행은 별도로 관리됩니다.', 'guidance')}
          ${progress(4)}
          <article class="content-card content-card--danger"><span class="risk-chip risk-chip--danger">위험·상담 필수</span><h3>자가 해결이나 문의 종료를 선택할 수 없습니다.</h3><p>할 수 있는 조치만 수행하고, 직접 확인하기 위험하면 체크하지 않은 상태로 상담을 요청하세요.</p></article>
          <form id="safety-action-form">
            <div class="safety-checklist">
              <label class="safety-check"><input type="checkbox" name="sourceValveClosed"${safeActions.waterValveClosed ? ' checked' : ''}><span>원수 밸브를 잠갔습니다.</span></label>
              <label class="safety-check"><input type="checkbox" name="powerDisconnected"${safeActions.powerDisconnected ? ' checked' : ''}><span>안전하게 가능한 경우 전원을 분리했습니다.</span></label>
              <label class="safety-check"><input type="checkbox" name="drinkingStopped"${safeActions.drinkingStopped ? ' checked' : ''}><span>안내가 완료될 때까지 음용을 중지했습니다.</span></label>
            </div>
            <label class="field"><span>상담사에게 전달할 내용 <small>선택</small></span><textarea name="note" maxlength="300" placeholder="조치하기 어려운 상황이나 현장 상태를 알려주세요."></textarea></label>
            <button class="button button--danger button--block" type="submit">상담 요청</button>
          </form>
        </section>`;
    }
    return `
      <section class="app-screen" data-screen-id="CUST-05" data-mode="general">
        ${screenHeader('CUST-05 · ACTION RESULT', '조치 결과·상담 요청', '공식 안내를 수행한 결과를 알려주세요.', 'guidance')}
        ${progress(4)}
        <form id="action-result-form">
          <fieldset class="form-section">
            <legend>조치 수행 결과</legend>
            <div class="result-choice">
              ${[
                ['RESOLVED', '해결됨', '문의가 즉시 완료됩니다.'],
                ['IMPROVED', '일부 개선', '상담사가 추가 확인합니다.'],
                ['SAME', '동일', '상담사가 증상을 이어서 확인합니다.'],
                ['WORSE', '악화', '우선 상담 대상으로 연결합니다.'],
                ['NOT_PERFORMED', '수행하지 않음', '어려웠던 이유와 함께 상담을 연결합니다.']
              ].map(function (item) {
                return '<label class="choice-card"><input type="radio" name="result" value="' + item[0] + '" required><span><strong>' + item[1] + '</strong>&nbsp;·&nbsp;' + item[2] + '</span></label>';
              }).join('')}
            </div>
          </fieldset>
          <label class="field"><span>수행한 조치</span><textarea name="performedAction" maxlength="300" placeholder="수행한 조치와 확인한 결과를 적어주세요."></textarea></label>
          <button class="button button--primary button--block" type="submit">결과 제출</button>
          <button class="button button--secondary button--block" type="button" data-action="request-consultation">바로 상담 요청</button>
        </form>
      </section>`;
  }

  function renderEvidenceSet(inquiry) {
    var items = evidenceForInquiry(inquiry);
    return items.length ? items.map(evidenceCard).join('') : '<p>연결된 공식 근거가 없습니다. 근거 확인이 필요하면 상담사가 직접 확인합니다.</p>';
  }

  function renderTimeline(inquiry) {
    var items = Array.isArray(inquiry.timeline) ? inquiry.timeline.slice().reverse() : [];
    if (!items.length) return '<p>아직 저장된 상태 이력이 없습니다.</p>';
    return '<ol class="timeline">' + items.map(function (item) {
      return '<li><strong>' + escapeHtml(item.label || item.title || statusLabel(item.toStatus || item.status || item.event)) + '</strong><time>' + escapeHtml(formatDateTime(item.at || item.createdAt || item.timestamp)) + '</time>' + (item.note ? '<p>' + escapeHtml(item.note) + '</p>' : '') + '</li>';
    }).join('') + '</ol>';
  }

  function renderFeedbackActions(inquiry) {
    if (inquiry.status === 'RESOLVED') return '<p>최종 완료된 문의입니다. 처리 결과와 상태 이력만 조회할 수 있습니다.</p>';
    if (inquiry.status !== 'COMPLETION_PENDING') return '';
    if (inquiry.resolutionFeedback) {
      return '<article class="content-card content-card--success"><h3>해결 피드백이 전달되었습니다.</h3><p>담당자가 확인한 뒤 문의를 최종 완료합니다.</p><span class="status-chip">담당자 최종 확인 중</span></article>';
    }
    return `
      <article class="content-card content-card--warning">
        <h3>처리 결과를 확인해주세요.</h3>
        <p>상담 또는 방문 결과를 확인하고 해결 여부를 선택해주세요.</p>
        <div class="button-row button-row--wrap">
          <button class="button button--primary" type="button" data-action="submit-feedback" data-feedback="RESOLVED">해결됨</button>
          <button class="button button--secondary" type="button" data-action="submit-feedback" data-feedback="UNRESOLVED">해결되지 않음</button>
        </div>
        <button class="button button--text button--block" type="button" data-action="request-consultation">상담 재요청</button>
      </article>`;
  }

  function renderDetail() {
    var inquiry = currentInquiry();
    if (!inquiry) return renderInquiries();
    var product = list('products').find(function (item) { return item.id === inquiry.productId; }) || currentProduct();
    var visit = visitForInquiry(inquiry);
    var owner = currentOwner(inquiry);
    var usage = usageCode(inquiry);
    var danger = inquiry.riskLevel === 'DANGER';
    return `
      <section class="app-screen" data-screen-id="CUST-06">
        ${screenHeader('CUST-06 · INQUIRY DETAIL', '문의 상세', '상담과 방문 처리 결과를 하나의 흐름으로 확인합니다.', 'inquiries')}
        <article class="content-card ${danger ? 'content-card--danger' : 'content-card--tinted'}">
          <div class="content-card__header"><div><span class="card-label">${escapeHtml(inquiry.id)}</span><h3>${escapeHtml((inquiry.symptomCodes || []).map(function (code) { var item = SYMPTOMS.find(function (symptom) { return symptom.code === code; }); return item ? item.label : code; }).join(', ') || '증상 문의')}</h3></div><span class="status-chip ${inquiry.status === 'RESOLVED' ? 'status-chip--neutral' : ''}">${escapeHtml(statusLabel(inquiry.status))}</span></div>
          <div class="button-row button-row--wrap"><span class="risk-chip ${riskClass(inquiry.riskLevel)}">${escapeHtml(riskLabel(inquiry.riskLevel))}</span><span class="usage-chip ${danger || usage === 'TOTAL_STOP' ? 'usage-chip--danger' : ''}">${escapeHtml(usageLabel(usage || 'NORMAL'))}</span></div>
        </article>
        ${renderFeedbackActions(inquiry)}
        ${danger && inquiry.status !== 'RESOLVED' ? '<div class="inline-notice inline-notice--danger"><strong>!</strong><p>현재 사용 제한은 ' + escapeHtml(usageLabel(usage)) + '입니다. ' + escapeHtml(inquiry.usageGuidance && inquiry.usageGuidance.nextAction || '담당자 안내를 확인해주세요.') + '</p></div>' : ''}
        <article class="content-card">
          <h3>현재 담당과 다음 단계</h3>
          <div class="current-owner"><span class="owner-avatar">${escapeHtml(owner.title.slice(0, 1))}</span><div><strong>${escapeHtml(owner.title)}</strong><small>${escapeHtml(owner.subtitle)}</small></div></div>
          <p>${escapeHtml(nextActionText(inquiry))}</p>
        </article>
        <article class="content-card">
          <h3>문의 정보</h3>
          <dl class="metadata-grid">
            <div><dt>제품 코드</dt><dd>${escapeHtml(modelCode(product) || 'WPUJAC104DWH')}</dd></div>
            <div><dt>설명서 모델</dt><dd>${escapeHtml(manualModel(product))}</dd></div>
            <div><dt>시나리오 ID</dt><dd>${escapeHtml(inquiry.scenarioId || '합성 시나리오')}</dd></div>
            <div><dt>고객 행동</dt><dd>${isCustomerActionRequired(inquiry) ? '필요' : '현재 없음'}</dd></div>
            <div><dt>방문 희망일</dt><dd>${escapeHtml(formatDateTime(inquiry.desiredVisitAt || (visit && visit.desiredAt)))}</dd></div>
            <div><dt>가상 확정일</dt><dd>${escapeHtml(formatDateTime(visit && (visit.confirmedAt || visit.scheduledAt)))}</dd></div>
            <div><dt>방문 상태</dt><dd>${escapeHtml(visit ? statusLabel(visit.status) : '방문 미등록')}</dd></div>
            <div><dt>마지막 변경</dt><dd>${escapeHtml(formatDateTime(inquiry.updatedAt))}</dd></div>
          </dl>
        </article>
        <article class="content-card"><h3>공식 근거</h3><div class="content-stack">${renderEvidenceSet(inquiry)}</div></article>
        ${inquiry.consultationResult || inquiry.counselRecord || (visit && visit.result) ? '<article class="content-card"><h3>상담·방문 결과</h3>' + (inquiry.consultationResult || inquiry.counselRecord ? '<p><strong>상담 결과</strong><br>' + escapeHtml(inquiry.consultationResult || inquiry.counselRecord.note || inquiry.counselRecord.outcome || '상담 완료') + '</p>' : '') + (visit && visit.result ? '<p><strong>방문 결과</strong><br>' + escapeHtml(typeof visit.result === 'object' ? [visit.result.actualCause, visit.result.actions, visit.result.nextAction].filter(Boolean).join(' · ') : visit.result) + '</p>' : '') + '</article>' : ''}
        <article class="content-card"><h3>팀 설계 상태 이력</h3>${renderTimeline(inquiry)}</article>
        <article class="content-card"><h3>최종 완료 확인</h3><p>고객 피드백: ${escapeHtml(inquiry.resolutionFeedback ? '제출 완료' : '미제출')}<br>담당자 최종 완료: ${inquiry.status === 'RESOLVED' ? '완료' : '대기'}</p></article>
      </section>`;
  }

  function renderInquiries() {
    var inquiries = inquiriesForCustomer();
    return `
      <section class="app-screen" data-screen-id="CUST-06-LIST">
        ${screenHeader('MY INQUIRIES', '문의 내역', '문의별 현재 상태와 다음 행동을 확인하세요.', 'home')}
        ${inquiries.length ? '<div class="inquiry-list">' + inquiries.map(function (inquiry) {
          return '<button class="inquiry-card" type="button" data-action="open-inquiry" data-inquiry-id="' + escapeHtml(inquiry.id) + '"><div class="inquiry-card__top"><span class="card-label">' + escapeHtml(inquiry.id) + '</span><span class="status-chip">' + escapeHtml(statusLabel(inquiry.status)) + '</span></div><h3>' + escapeHtml((inquiry.symptomCodes || []).map(function (code) { var item = SYMPTOMS.find(function (symptom) { return symptom.code === code; }); return item ? item.label : code; }).join(', ') || '작성 중인 문의') + '</h3><p>' + escapeHtml(nextActionText(inquiry)) + '</p></button>';
        }).join('') + '</div>' : '<div class="empty-state"><span class="empty-state__icon">◎</span><h3>문의 내역이 없습니다.</h3><p>불편한 증상이 있다면 문진을 시작해주세요.</p><button class="button button--primary" type="button" data-action="start-inquiry">증상 상담 시작</button></div>'}
      </section>`;
  }

  function renderSchedule() {
    var inquiryIds = inquiriesForCustomer().map(function (item) { return item.id; });
    var visits = list('visits').filter(function (item) { return inquiryIds.indexOf(item.inquiryId) >= 0; });
    var product = currentProduct();
    var schedule = careSchedule(product);
    return `
      <section class="app-screen" data-screen-id="CUST-01-SCHEDULE">
        ${screenHeader('CARE SCHEDULE', '케어·방문 일정', '확정된 기준과 진행 상태를 구분해 안내합니다.', 'home')}
        <article class="content-card content-card--tinted">
          <div class="content-card__header"><h3>정기 케어</h3><span class="status-chip status-chip--neutral">${escapeHtml(schedule.source)}</span></div>
          <p>${escapeHtml(schedule.label || '공식 또는 팀 기준이 확보되지 않아 일정 확인이 필요합니다.')}</p>
        </article>
        ${visits.length ? '<div class="content-stack">' + visits.map(function (visit) {
          return '<article class="content-card"><div class="content-card__header"><h3>' + escapeHtml(formatDateTime(visit.confirmedAt || visit.scheduledAt || visit.desiredAt)) + '</h3><span class="status-chip">' + escapeHtml(statusLabel(visit.status)) + '</span></div><p>문의 ' + escapeHtml(visit.inquiryId) + '<br>담당 방문기사 ' + escapeHtml(visit.technicianId || visit.assignedTechnicianId || '배정 중') + '</p>' + (visit.rescheduleRequest && visit.rescheduleRequest.status === 'PENDING' ? '<div class="inline-notice"><strong>i</strong><p>' + escapeHtml(formatDateTime(visit.rescheduleRequest.preferredAt)) + ' 일정으로 변경 요청을 검토 중입니다. 기존 확정 일정은 유지됩니다.</p></div>' : '') + (['CONFIRMED', 'SCHEDULING'].indexOf(visit.status) >= 0 ? '<button class="button button--secondary button--block" type="button" data-action="schedule-consultation" data-inquiry-id="' + escapeHtml(visit.inquiryId) + '" data-visit-id="' + escapeHtml(visit.id) + '">일정 변경 요청</button>' : '') + '</article>';
        }).join('') + '</div>' : '<div class="empty-state"><span class="empty-state__icon">□</span><h3>확정된 방문 일정이 없습니다.</h3><p>상담사가 방문 필요 여부를 확인한 뒤 희망일과 확정일을 각각 안내합니다.</p></div>'}
      </section>`;
  }

  function renderFatal(message) {
    viewRoot.innerHTML = '<div class="fatal-error"><h1>고객 앱을 시작할 수 없습니다.</h1><p>' + escapeHtml(message) + '</p><p><a href="index.html">역할 선택 홈으로 돌아가기</a></p></div>';
  }

  function updateNavigation() {
    document.querySelectorAll('.mobile-bottom-nav [data-route]').forEach(function (button) {
      var active = button.dataset.route === app.route ||
        (button.dataset.route === 'inquiries' && ['precheck', 'questions', 'guidance', 'action', 'detail'].indexOf(app.route) >= 0);
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function updateSwitcher() {
    var customers = list('customers');
    if (!customers.length) return;
    if (!app.customerId || !customers.some(function (item) { return item.id === app.customerId; })) {
      app.customerId = customers[0].id;
    }
    switcher.innerHTML = customers.map(function (customer) {
      return '<option value="' + escapeHtml(customer.id) + '"' + (customer.id === app.customerId ? ' selected' : '') + '>' + escapeHtml(customerName(customer)) + ' · ' + escapeHtml(customer.id) + '</option>';
    }).join('');
  }

  function notificationsForCustomer() {
    return list('notifications')
      .filter(function (item) {
        return item.customerId === app.customerId || item.recipientId === app.customerId || (!item.customerId && !item.recipientId && item.recipientRole === 'CUSTOMER');
      })
      .sort(function (a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
  }

  function updateNotifications() {
    var notifications = notificationsForCustomer();
    var unread = notifications.filter(function (item) { return !item.read && !item.readAt; }).length;
    notificationCount.textContent = String(unread);
    notificationCount.hidden = unread === 0;
    document.getElementById('notification-button').setAttribute('aria-label', unread ? '읽지 않은 알림 ' + unread + '개 열기' : '알림 열기');
    notificationList.innerHTML = notifications.length ? notifications.map(function (item) {
      return '<button class="notification-item ' + (!item.read && !item.readAt ? 'is-unread' : '') + '" type="button" data-notification-id="' + escapeHtml(item.id || '') + '" data-notification-inquiry="' + escapeHtml(item.inquiryId || '') + '" data-notification-support="' + escapeHtml(item.productSupportRequestId || '') + '"><strong>' + escapeHtml(item.title || '업무 알림') + '</strong><p>' + escapeHtml(item.message || item.body || '') + '</p><time>' + escapeHtml(formatDateTime(item.createdAt)) + '</time></button>';
    }).join('') : '<div class="empty-state"><span class="empty-state__icon">○</span><h3>새 알림이 없습니다.</h3><p>상담과 방문 상태가 변경되면 이곳에 표시됩니다.</p></div>';
  }

  function openCustomerNotification(button) {
    var notificationId = button.dataset.notificationId;
    var inquiryId = button.dataset.notificationInquiry;
    var supportRequestId = button.dataset.notificationSupport;
    if (notificationId) {
      try {
        Store.dispatch('MARK_NOTIFICATION_READ', {
          notificationId: notificationId,
          idempotencyKey: ['MARK_NOTIFICATION_READ', notificationId, app.customerId].join(':')
        }, actor());
      } catch (error) {
        showToast(errorMessage(error), 'error');
      }
    }
    if (inquiryId && inquiriesForCustomer().some(function (item) { return item.id === inquiryId; })) {
      notificationDialog.close();
      setRoute('detail', inquiryId);
    } else if (supportRequestId && list('productSupportRequests').some(function (item) { return item.id === supportRequestId && item.customerId === app.customerId; })) {
      notificationDialog.close();
      setRoute('product');
    } else {
      updateNotifications();
    }
  }

  function render() {
    if (!Store || typeof Store.getState !== 'function' || typeof Store.dispatch !== 'function') {
      renderFatal('필수 상태 모듈 WaterCareStore를 찾을 수 없습니다.');
      return;
    }
    updateSwitcher();
    updateNotifications();
    var renderers = {
      home: renderHome,
      product: renderProduct,
      precheck: renderPrecheck,
      questions: renderQuestions,
      guidance: renderGuidance,
      action: renderAction,
      detail: renderDetail,
      inquiries: renderInquiries,
      schedule: renderSchedule
    };
    var renderer = renderers[app.route] || renderHome;
    viewRoot.innerHTML = renderer();
    updateNavigation();
  }

  function startFlow(eventName, questionnaireSessionId) {
    var product = supportedProductOrWarn();
    if (!product) return;
    var support = productSupport(product);
    if (!support.aiAllowed) {
      dispatch('REQUEST_PRODUCT_SUPPORT', { productId: product.id, reason: support.message }, '제품 지원 범위 상담을 요청했습니다.');
      setRoute('product');
      return;
    }
    var payload = { productId: product.id, entryMode: eventName === 'START_CARE_PRECHECK' ? 'CARE_PRECHECK' : 'ADHOC_INQUIRY', questionnaireSessionId: questionnaireSessionId || null };
    var response = dispatch(eventName, payload);
    if (!response || !response.result) return;
    if (eventName === 'START_CARE_PRECHECK') {
      app.questionnaireSessionId = response.result;
      app.inquiryId = '';
    } else {
      app.inquiryId = response.result;
      app.questionnaireSessionId = '';
    }
    setRoute('precheck');
  }

  function formPayload(form) {
    var data = new FormData(form);
    var intake = currentIntake();
    var payload = {
      symptomCodes: data.getAll('symptomCodes'),
      description: String(data.get('description') || '').trim(),
      conditions: String(data.get('occurrenceConditions') || '').trim(),
      displayCode: String(data.get('displayText') || '').trim(),
      answers: {
        flow: String(data.get('flow') || ''),
        leak: String(data.get('leak') || '')
      }
    };
    if (app.questionnaireSessionId) {
      payload.questionnaireSessionId = intake.id;
      payload.stateVersion = intake.stateVersion;
    } else {
      payload.inquiryId = intake.id;
    }
    return payload;
  }

  function handleSymptomSubmit(event) {
    event.preventDefault();
    var mode = event.submitter && event.submitter.value || 'submit';
    var payload = formPayload(event.target);
    if (mode === 'submit' && !payload.symptomCodes.length && !payload.description) {
      showToast('[REQUIRED_INPUT] 대표 증상을 선택하지 않았다면 고객 원문을 입력해주세요.', 'error');
      event.target.querySelector('[name="description"]').focus();
      return;
    }
    if (mode === 'draft') {
      if (dispatch(app.questionnaireSessionId ? 'SAVE_QUESTIONNAIRE' : 'SAVE_DRAFT', payload, '임시 저장했습니다.')) setRoute('home');
      return;
    }
    if (app.questionnaireSessionId) {
      if (dispatch('SUBMIT_CARE_PRECHECK', payload, '문의 없이 사전 문진을 저장했습니다.')) {
        app.questionnaireSessionId = '';
        setRoute('home');
      }
      return;
    }
    if (!dispatch('SUBMIT_SYMPTOM', payload, '증상을 제출했습니다.')) return;
    var inquiry = currentInquiry();
    setRoute(inquiry && inquiry.missingFields && inquiry.missingFields.length ? 'questions' : routeForInquiry(inquiry));
  }

  function handleAnswersSubmit(event) {
    event.preventDefault();
    var inquiry = currentInquiry();
    var data = new FormData(event.target);
    var answers = {};
    (inquiry.missingFields || []).forEach(function (code) { answers[code] = String(data.get(code) || ''); });
    if (!dispatch('SUBMIT_ANSWERS', { inquiryId: inquiry.id, answers: answers }, '추가 답변을 제출했습니다.')) return;
    inquiry = currentInquiry();
    setRoute(inquiry && inquiry.missingFields && inquiry.missingFields.length ? 'questions' : routeForInquiry(inquiry));
  }

  function handleActionResult(event) {
    event.preventDefault();
    var inquiry = currentInquiry();
    var data = new FormData(event.target);
    var result = String(data.get('result') || '');
    if (!result) {
      showToast('[REQUIRED_INPUT] 조치 결과를 선택해주세요.', 'error');
      return;
    }
    var payload = {
      inquiryId: inquiry.id,
      actionResult: result,
      performedAction: String(data.get('performedAction') || '').trim()
    };
    if (result === 'RESOLVED') {
      if (dispatch('CUSTOMER_REPORTED_SELF_RESOLVED', payload, '해결 결과가 저장되었습니다.')) setRoute('detail');
    } else if (dispatch('REQUEST_CONSULTATION', payload, '상담을 요청했습니다.')) {
      setRoute('detail');
    }
  }

  function handleSafetyAction(event) {
    event.preventDefault();
    var inquiry = currentInquiry();
    var data = new FormData(event.target);
    var payload = {
      inquiryId: inquiry.id,
      safeActions: {
        waterValveClosed: data.get('sourceValveClosed') === 'on',
        powerDisconnected: data.get('powerDisconnected') === 'on',
        drinkingStopped: data.get('drinkingStopped') === 'on'
      },
      note: String(data.get('note') || '').trim()
    };
    if (dispatch('REQUEST_CONSULTATION', payload, '안전조치 상태와 상담 요청을 전달했습니다.')) setRoute('detail');
  }

  function openProductDialog() {
    var product = currentProduct();
    var form = document.getElementById('product-form');
    form.reset();
    form.elements.productId.value = product ? product.id : '';
    form.elements.productCode.value = product ? modelCode(product) : 'WPUJAC104DWH';
    form.elements.manualModel.value = product ? manualModel(product) : 'WPU-JAC104D';
    form.elements.startedAt.value = product ? String(product.startedAt || product.startDate || product.installedAt || '').slice(0, 10) : '';
    form.elements.managementType.value = product && product.managementType || 'VISIT';
    form.elements.installedArea.value = product && product.installedArea || '';
    document.getElementById('product-dialog-title').textContent = product ? '제품 정보 수정' : '제품 등록';
    document.getElementById('product-submit-label').textContent = product ? '저장' : '등록·지원범위 확인';
    productDialog.showModal();
  }

  function handleProductSubmit(event) {
    event.preventDefault();
    var data = new FormData(event.target);
    var productId = String(data.get('productId') || '');
    var productCode = String(data.get('productCode') || '').trim().toUpperCase();
    var manualModelValue = String(data.get('manualModel') || '').trim().toUpperCase();
    var payload = {
      productId: productId,
      productCode: productCode,
      manualModel: manualModelValue,
      modelName: productCode === 'WPUJAC104DWH' ? '초소형 플러스 직수 정수기' : productCode === 'WPUIAC425SNW' ? '원코크 플러스 얼음물 정수기' : '고객 등록 정수기',
      startedAt: String(data.get('startedAt') || ''),
      managementType: String(data.get('managementType') || 'VISIT'),
      installedArea: String(data.get('installedArea') || '').trim()
    };
    if (!productCode || !manualModelValue) {
      showToast('[REQUIRED_INPUT] 제품 코드와 사용설명서 모델명을 입력해주세요.', 'error');
      return;
    }
    var eventName = productId ? 'PRODUCT_UPDATED' : 'REGISTER_PRODUCT';
    var response = dispatch(eventName, payload, productId ? '제품 정보를 저장했습니다.' : '제품을 등록하고 지원 범위를 확인했습니다.');
    if (response) {
      productDialog.close();
      if (!productId && response.result) {
        Store.dispatch('VALIDATE_PRODUCT', {
          productId: response.result,
          idempotencyKey: 'VALIDATE_PRODUCT:' + response.result + ':' + Date.now()
        }, actor());
      }
      render();
    }
  }

  function openRescheduleDialog(actionButton) {
    var visit = list('visits').find(function (item) { return item.id === actionButton.dataset.visitId; });
    if (!visit) {
      showToast('[NO-DATA-01] 방문 일정을 찾을 수 없습니다.', 'error');
      return;
    }
    var form = document.getElementById('reschedule-form');
    form.reset();
    form.elements.inquiryId.value = visit.inquiryId;
    form.elements.visitId.value = visit.id;
    form.elements.preferredAt.value = toLocalInput(visit.confirmedAt || visit.scheduledAt || visit.desiredAt);
    form.elements.preferredAt.min = toLocalInput(new Date());
    document.getElementById('current-visit-time').textContent = formatDateTime(visit.confirmedAt || visit.scheduledAt || visit.desiredAt);
    rescheduleDialog.showModal();
  }

  function handleRescheduleSubmit(event) {
    event.preventDefault();
    var data = new FormData(event.target);
    var payload = {
      inquiryId: String(data.get('inquiryId') || ''),
      visitId: String(data.get('visitId') || ''),
      preferredAt: String(data.get('preferredAt') || ''),
      reason: String(data.get('reason') || '')
    };
    if (dispatch('REQUEST_VISIT_RESCHEDULE', payload, '방문 일정 변경 요청을 접수했습니다.')) {
      rescheduleDialog.close();
      setRoute('schedule');
    }
  }

  function handleClick(event) {
    var closeButton = event.target.closest('[data-dialog-close]');
    if (closeButton) {
      var dialog = closeButton.closest('dialog');
      if (dialog) dialog.close();
      return;
    }
    var routeButton = event.target.closest('[data-route]');
    if (routeButton) {
      setRoute(routeButton.dataset.route);
      return;
    }
    var actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    var action = actionButton.dataset.action;
    if (action === 'start-inquiry') startFlow('START_INQUIRY');
    else if (action === 'start-precheck') startFlow('START_CARE_PRECHECK');
    else if (action === 'start-linked-inquiry') startFlow('START_INQUIRY', actionButton.dataset.questionnaireId);
    else if (action === 'request-product-support') {
      var supportProduct = currentProduct();
      var support = productSupport(supportProduct);
      if (supportProduct && dispatch('REQUEST_PRODUCT_SUPPORT', { productId: supportProduct.id, reason: support.message }, '제품 지원 범위 상담을 요청했습니다.')) setRoute('product');
    } else if (action === 'open-inquiry') {
      app.questionnaireSessionId = '';
      app.inquiryId = actionButton.dataset.inquiryId;
      var inquiry = currentInquiry();
      setRoute(routeForInquiry(inquiry));
    } else if (action === 'edit-product') openProductDialog();
    else if (action === 'cancel-precheck') {
      var questionnaireToCancel = currentQuestionnaire();
      if (questionnaireToCancel && window.confirm('작성 중인 사전 문진을 취소하시겠습니까?') && dispatch('CANCEL_CARE_PRECHECK', { questionnaireSessionId: questionnaireToCancel.id, stateVersion: questionnaireToCancel.stateVersion }, '사전 문진을 취소했습니다.')) {
        app.questionnaireSessionId = '';
        setRoute('home');
      }
    } else if (action === 'cancel-inquiry') {
      var inquiryToCancel = currentInquiry();
      if (inquiryToCancel && window.confirm('작성 중인 문의를 취소하시겠습니까?') && dispatch('CANCEL_INQUIRY', { inquiryId: inquiryToCancel.id }, '문의를 취소했습니다.')) setRoute('home');
    } else if (action === 'retry-ai') {
      var retryInquiry = currentInquiry();
      if (retryInquiry && dispatch('RETRY_AI_PROCESS', { inquiryId: retryInquiry.id }, '보존된 입력으로 분석을 다시 시작했습니다.')) {
        retryInquiry = currentInquiry();
        setRoute(retryInquiry.missingFields && retryInquiry.missingFields.length ? 'questions' : routeForInquiry(retryInquiry));
      }
    } else if (action === 'request-consultation') {
      var consultationInquiry = currentInquiry();
      if (consultationInquiry && dispatch('REQUEST_CONSULTATION', { inquiryId: consultationInquiry.id }, '상담을 요청했습니다.')) setRoute('detail');
    } else if (action === 'submit-feedback') {
      var feedbackInquiry = currentInquiry();
      if (actionButton.dataset.feedback === 'RESOLVED') {
        if (dispatch('SUBMIT_RESOLUTION_FEEDBACK', { inquiryId: feedbackInquiry.id, resolved: true, feedback: 'RESOLVED' }, '해결 피드백을 전달했습니다.')) setRoute('detail');
      } else if (dispatch('CUSTOMER_REPORTED_UNRESOLVED', { inquiryId: feedbackInquiry.id, resolved: false, feedback: 'UNRESOLVED' }, '미해결 상태를 전달했습니다.')) {
        setRoute('detail');
      }
    } else if (action === 'schedule-consultation') {
      app.inquiryId = actionButton.dataset.inquiryId;
      openRescheduleDialog(actionButton);
    } else if (action === 'toggle-evidence-detail') {
      var detail = document.getElementById(actionButton.getAttribute('aria-controls'));
      if (detail) {
        var expanded = actionButton.getAttribute('aria-expanded') === 'true';
        actionButton.setAttribute('aria-expanded', String(!expanded));
        detail.hidden = expanded;
      }
    }
  }

  function handleSubmit(event) {
    if (event.target.id === 'symptom-form') handleSymptomSubmit(event);
    else if (event.target.id === 'answers-form') handleAnswersSubmit(event);
    else if (event.target.id === 'action-result-form') handleActionResult(event);
    else if (event.target.id === 'safety-action-form') handleSafetyAction(event);
    else if (event.target.id === 'product-form') handleProductSubmit(event);
    else if (event.target.id === 'reschedule-form') handleRescheduleSubmit(event);
  }

  function init() {
    if (!Store || typeof Store.getState !== 'function') {
      renderFatal('공통 상태 저장소(core/store.js)가 로드되지 않았습니다.');
      return;
    }
    var customers = list('customers');
    var savedCustomerId = '';
    try { savedCustomerId = sessionStorage.getItem('watercare.customerId') || ''; } catch (error) { /* storage unavailable */ }
    app.customerId = customers.some(function (item) { return item.id === savedCustomerId; }) ? savedCustomerId : (customers[0] && customers[0].id || '');

    document.addEventListener('click', handleClick);
    document.addEventListener('submit', handleSubmit);
    switcher.addEventListener('change', function () {
      app.customerId = switcher.value;
      app.inquiryId = '';
      app.route = 'home';
      try { sessionStorage.setItem('watercare.customerId', app.customerId); } catch (error) { /* storage unavailable */ }
      render();
    });
    document.getElementById('notification-button').addEventListener('click', function () {
      updateNotifications();
      notificationDialog.showModal();
    });
    notificationList.addEventListener('click', function (event) {
      var notificationButton = event.target.closest('[data-notification-id]');
      if (notificationButton) openCustomerNotification(notificationButton);
    });
    if (typeof Store.subscribe === 'function') Store.subscribe(function () { render(); });
    render();
  }

  init();
}());
