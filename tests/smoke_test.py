from __future__ import annotations

from functools import partial
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from threading import Thread
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent.parent
HTML_FILES = [ROOT / "index.html", ROOT / "customer.html", ROOT / "stakeholder.html"]


class DocumentAudit(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.local_refs: list[str] = []
        self.html_lang = ""
        self.has_charset = False
        self.has_viewport = False
        self.main_count = 0
        self.role_links: list[str] = []
        self.elements: list[tuple[str, dict[str, str | None]]] = []
        self.header_depth = 0
        self.header_ids: set[str] = set()
        self.labels_for: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        if tag == "header":
            self.header_depth += 1
        self.elements.append((tag, data))
        if tag == "html":
            self.html_lang = data.get("lang") or ""
        if tag == "meta" and (data.get("charset") or "").lower() == "utf-8":
            self.has_charset = True
        if tag == "meta" and data.get("name") == "viewport":
            self.has_viewport = True
        if tag == "main":
            self.main_count += 1
        if data.get("id"):
            self.ids.append(data["id"] or "")
            if self.header_depth:
                self.header_ids.add(data["id"] or "")
        if tag == "label" and data.get("for"):
            self.labels_for.add(data["for"] or "")
        for attr in ("href", "src"):
            ref = data.get(attr)
            if ref and not ref.startswith(("#", "mailto:", "tel:", "javascript:")):
                if ref.startswith(("http://", "https://", "//")):
                    raise AssertionError(f"외부 의존 URL이 있습니다: {ref}")
                self.local_refs.append(ref.split("?", 1)[0].split("#", 1)[0])
                if ref.endswith("customer.html") or "customer.html?" in ref or ref.endswith("stakeholder.html") or "stakeholder.html?" in ref:
                    self.role_links.append(ref)

    def handle_endtag(self, tag: str) -> None:
        if tag == "header":
            self.header_depth = max(0, self.header_depth - 1)

    def find_elements(self, tag: str | None = None, attr: str | None = None, value: str | None = None) -> list[dict[str, str | None]]:
        matches: list[dict[str, str | None]] = []
        for element_tag, data in self.elements:
            if tag is not None and element_tag != tag:
                continue
            if attr is not None and attr not in data:
                continue
            if attr is not None and value is not None and data.get(attr) != value:
                continue
            matches.append(data)
        return matches


def audit_html(path: Path) -> DocumentAudit:
    parser = DocumentAudit()
    parser.feed(path.read_text(encoding="utf-8"))
    assert parser.html_lang == "ko", f"{path.name}: lang=ko 필요"
    assert parser.has_charset, f"{path.name}: UTF-8 charset 필요"
    assert parser.has_viewport, f"{path.name}: viewport 필요"
    assert parser.main_count == 1, f"{path.name}: main 요소는 1개여야 함"
    assert len(parser.ids) == len(set(parser.ids)), f"{path.name}: 중복 id 존재"
    for ref in parser.local_refs:
        target = (path.parent / ref).resolve()
        assert target.exists(), f"{path.name}: 로컬 참조 누락 {ref}"
    return parser


def assert_header_menu_search(
    audit: DocumentAudit,
    *,
    page_name: str,
    scope: str,
    root_id: str,
    input_id: str,
    results_id: str,
) -> None:
    roots = audit.find_elements(attr="data-menu-search", value=scope)
    assert len(roots) == 1, f"{page_name}: 상단 {scope} 메뉴 검색은 1개여야 함"
    assert roots[0].get("id") == root_id, f"{page_name}: 메뉴 검색 루트 ID 불일치"
    assert root_id in audit.header_ids, f"{page_name}: 메뉴 검색은 상단 header 안에 있어야 함"

    inputs = audit.find_elements(tag="input", attr="id", value=input_id)
    assert len(inputs) == 1, f"{page_name}: 메뉴 검색 입력 필요"
    search_input = inputs[0]
    assert input_id in audit.header_ids, f"{page_name}: 검색 입력은 상단 header 안에 있어야 함"
    assert "data-menu-search-input" in search_input, f"{page_name}: 공통 메뉴 검색 입력 표식 필요"
    assert search_input.get("type") == "search", f"{page_name}: 검색 입력 type=search 필요"
    assert search_input.get("role") == "combobox", f"{page_name}: 검색 입력 combobox 역할 필요"
    assert search_input.get("aria-autocomplete") == "list", f"{page_name}: 검색 자동완성 목록 ARIA 필요"
    assert search_input.get("aria-controls") == results_id, f"{page_name}: 검색 입력과 결과 목록 연결 필요"
    assert search_input.get("aria-expanded") == "false", f"{page_name}: 검색 결과는 초기 닫힘 상태여야 함"
    assert search_input.get("autocomplete") == "off", f"{page_name}: 브라우저 자동완성 대신 메뉴 결과를 사용해야 함"
    assert input_id in audit.labels_for, f"{page_name}: 검색 입력에 연결된 label 필요"

    result_lists = audit.find_elements(attr="id", value=results_id)
    assert len(result_lists) == 1, f"{page_name}: 메뉴 검색 결과 목록 필요"
    results = result_lists[0]
    assert results_id in audit.header_ids, f"{page_name}: 검색 결과는 상단 header 안에 있어야 함"
    assert "data-menu-search-results" in results, f"{page_name}: 공통 메뉴 검색 결과 표식 필요"
    assert results.get("role") == "listbox", f"{page_name}: 검색 결과 listbox 역할 필요"
    assert "hidden" in results, f"{page_name}: 검색 결과는 초기 숨김 상태여야 함"
    assert results.get("aria-label"), f"{page_name}: 검색 결과 목록 이름 필요"

    search_forms = [
        attrs for tag, attrs in audit.elements
        if tag == "form" and attrs.get("role") == "search"
    ]
    assert search_forms, f"{page_name}: 메뉴 검색 form role=search 필요"


def assert_notification_center(
    audit: DocumentAudit,
    *,
    page_name: str,
    scope: str,
    toggle_id: str,
    panel_id: str,
) -> None:
    toggles = audit.find_elements(tag="button", attr="id", value=toggle_id)
    assert len(toggles) == 1, f"{page_name}: 알림 열기 버튼은 1개여야 함"
    toggle = toggles[0]
    assert toggle.get("data-notification-center") == scope, f"{page_name}: 역할별 알림 범위 필요"
    assert "data-notification-toggle" in toggle, f"{page_name}: 공통 알림 토글 표식 필요"
    assert toggle.get("aria-controls") == panel_id, f"{page_name}: 알림 버튼과 패널 연결 필요"
    assert toggle.get("aria-expanded") == "false", f"{page_name}: 알림 패널은 초기 닫힘 상태여야 함"
    assert toggle.get("aria-haspopup") == "dialog", f"{page_name}: 알림 버튼의 대화상자 ARIA 필요"

    panels = audit.find_elements(attr="id", value=panel_id)
    assert len(panels) == 1, f"{page_name}: 알림 패널은 1개여야 함"
    panel = panels[0]
    assert "data-notification-panel" in panel, f"{page_name}: 공통 알림 패널 표식 필요"
    assert panel.get("role") == "dialog", f"{page_name}: 알림 패널 dialog 역할 필요"
    assert "hidden" in panel, f"{page_name}: 알림 패널은 초기 숨김 상태여야 함"
    assert panel.get("aria-labelledby"), f"{page_name}: 알림 패널 제목 연결 필요"

    assert len(audit.find_elements(attr="data-notification-badge")) == 1, f"{page_name}: 동적 미확인 배지 필요"
    assert len(audit.find_elements(attr="data-notification-count")) == 1, f"{page_name}: 동적 미확인 건수 필요"
    assert len(audit.find_elements(attr="data-notification-list")) == 1, f"{page_name}: 역할별 알림 목록 필요"
    assert len(audit.find_elements(tag="button", attr="data-notification-read-all")) == 1, f"{page_name}: 모두 읽음 버튼 필요"
    assert len(audit.find_elements(tag="button", attr="data-notification-close")) == 1, f"{page_name}: 알림 닫기 버튼 필요"
    statuses = audit.find_elements(attr="data-notification-status")
    assert len(statuses) == 1 and statuses[0].get("role") == "status", f"{page_name}: 알림 변경 라이브 상태 필요"
    assert statuses[0].get("aria-live") == "polite", f"{page_name}: 알림 변경은 비방해 방식으로 안내해야 함"


def menu_item_block(script: str, item_id: str) -> tuple[str, str]:
    pattern = re.compile(
        r'\{\s*id:\s*"' + re.escape(item_id) +
        r'"(?P<body>.*?)onSelect:\s*function\s*\(\)\s*\{(?P<handler>.*?)\}\s*\}',
        re.DOTALL,
    )
    match = pattern.search(script)
    assert match, f"메뉴 검색 항목 누락: {item_id}"
    return match.group(0), match.group("handler")


def assert_menu_route(script: str, item_id: str, view: str, keywords: tuple[str, ...] = ()) -> None:
    block, handler = menu_item_block(script, item_id)
    assert re.search(r'goView\(\s*"' + re.escape(view) + r'"\s*\)', handler), f"{item_id}: {view} 화면 이동 연결 필요"
    for keyword in keywords:
        assert keyword in block, f"{item_id}: 검색어 '{keyword}' 필요"


html_audits: dict[str, DocumentAudit] = {}
for html_file in HTML_FILES:
    assert html_file.exists(), f"누락 파일: {html_file.name}"
    html_audits[html_file.name] = audit_html(html_file)

customer_text = (ROOT / "customer.html").read_text(encoding="utf-8")
staff_text = (ROOT / "stakeholder.html").read_text(encoding="utf-8")
customer_script = (ROOT / "assets/js/customer.js").read_text(encoding="utf-8")
staff_script = (ROOT / "assets/js/stakeholder.js").read_text(encoding="utf-8")
store_script = (ROOT / "assets/js/store.js").read_text(encoding="utf-8")
workflow_script = (ROOT / "assets/js/workflow-config.js").read_text(encoding="utf-8")
common_script = (ROOT / "assets/js/common.js").read_text(encoding="utf-8")
usage_chart_script = (ROOT / "assets/js/usage-chart.js").read_text(encoding="utf-8")
product_viewer_script = (ROOT / "assets/js/product-viewer.js").read_text(encoding="utf-8")
mock_script = (ROOT / "assets/js/mock-data.js").read_text(encoding="utf-8")
assert "stakeholder.html" in customer_text, "고객 화면에 관계자 화면 연결 필요"
assert "customer.html" in staff_text, "관계자 화면에 고객 화면 연결 필요"
assert 'aria-live="polite"' in customer_text and 'aria-live="polite"' in staff_text
assert "skip-link" in customer_text and "skip-link" in staff_text
assert customer_text.index("assets/js/usage-chart.js") < customer_text.index("assets/js/customer.js"), "사용량 차트 모듈은 고객 화면 로직보다 먼저 로드해야 함"
assert customer_text.index("assets/js/product-viewer.js") < customer_text.index("assets/js/customer.js"), "3D 제품 뷰어 모듈은 고객 화면 로직보다 먼저 로드해야 함"
for page_text in (customer_text, staff_text):
    assert page_text.index("assets/js/workflow-config.js") < page_text.index("assets/js/store.js"), "업무 규칙 설정은 Store보다 먼저 로드해야 함"

# 하드코딩 배지가 아니라 역할·계정별 실제 상태를 읽는 알림 센터가 양쪽 상단에 필요합니다.
assert_notification_center(
    html_audits["customer.html"],
    page_name="customer.html",
    scope="customer",
    toggle_id="customer-notification-toggle",
    panel_id="customer-notification-panel",
)
assert_notification_center(
    html_audits["stakeholder.html"],
    page_name="stakeholder.html",
    scope="staff",
    toggle_id="staff-notification-toggle",
    panel_id="staff-notification-panel",
)
assert 'aria-label="알림 2개"' not in customer_text, "고객 알림 건수를 HTML에 하드코딩하면 안 됨"
assert 'aria-label="업무 알림 3개"' not in staff_text, "관계자 알림 건수를 HTML에 하드코딩하면 안 됨"

for store_api in (
    "resolveCounsel", "markNotificationRead", "markAllNotificationsRead",
    "saveProduct", "refreshDueQuestionnaires", "submitQuestionnaire",
    "updateVisitSchedule", "completeInquiry", "canAccessInquiry",
    "detectOperationalExceptions",
):
    assert f"{store_api}: {store_api}" in store_script, f"워크플로·알림 Store API 공개 누락: {store_api}"
assert "validateInquirySchema: function" in store_script, "공통 인계 스키마 검증 API 공개 누락"
assert "notifications" in mock_script and 'schemaVersion: 11' in mock_script, "제품 문진·방문 일정 상태·운영 로그를 포함한 v11 시연 스키마 필요"
assert "operationLog" in mock_script and "structuredInquirySchema" in workflow_script, "운영 로그와 공통 인계 스키마 설정 필요"
for role in ("CUSTOMER", "COUNSELOR", "ENGINEER", "OPERATOR"):
    assert f'recipientRole: "{role}"' in mock_script, f"{role} 역할 알림 가상 데이터 필요"

for notification_contract in (
    "function initNotificationCenter(options)",
    'panel.querySelector("[data-notification-list]")',
    'toggle.querySelector("[data-notification-badge]")',
    'toggle.querySelector("[data-notification-count]")',
    'panel.querySelector("[data-notification-read-all]")',
    'data-notification-item="',
    "!item.readAt",
    'toggle.setAttribute("aria-expanded", "true")',
    'toggle.setAttribute("aria-expanded", "false")',
    "panel.hidden = false",
    "panel.hidden = true",
    'event.key !== "Escape"',
    "escapeHTML(item.title",
    "escapeHTML(item.message",
    "initNotificationCenter: initNotificationCenter",
):
    assert notification_contract in common_script, f"공통 알림 센터 동작 누락: {notification_contract}"
assert 'reason !== "READ_NOTIFICATION"' in common_script and 'reason !== "READ_ALL_NOTIFICATIONS"' in common_script, "읽음 처리 자체를 새 알림으로 재공지하면 안 됨"
assert "new Date(b.createdAt || 0) - new Date(a.createdAt || 0)" in common_script, "최신 알림 우선 정렬 필요"
assert 'event.target.closest("[data-notification-close]")' in common_script, "알림 X 닫기 동작 필요"
assert 'event.target.closest("[data-notification-read-all]")' in common_script, "알림 모두 읽음 동작 필요"

for customer_notification_contract in (
    'item.recipientRole === "CUSTOMER"',
    "item.recipientId === currentCustomerId",
    'Store.markNotificationRead(item.id, "CUSTOMER", currentCustomerId)',
    'Store.markAllNotificationsRead("CUSTOMER", currentCustomerId)',
    'toggleId: "customer-notification-toggle"',
    'panelId: "customer-notification-panel"',
    'item.view === "schedule" ? "schedule"',
    "notificationController.refresh(reason)",
):
    assert customer_notification_contract in customer_script, f"고객 역할 알림 연결 누락: {customer_notification_contract}"

for staff_notification_contract in (
    "item.recipientRole === currentRole",
    "item.recipientId === staff.id",
    "Store.markNotificationRead(item.id, currentRole, currentStaff().id)",
    "Store.markAllNotificationsRead(currentRole, currentStaff().id)",
    'toggleId: "staff-notification-toggle"',
    'panelId: "staff-notification-panel"',
    'item.view && canView(item.view) ? item.view : (currentRole === "ENGINEER" ? "visits" : "queue")',
    "openCase(item.inquiryId, targetView)",
    "notificationController.refresh(reason)",
):
    assert staff_notification_contract in staff_script, f"관계자 역할 알림 연결 누락: {staff_notification_contract}"

# 고객 일정 변경은 방문 데이터 유무와 관계없이 사이드·모바일 메뉴에서 항상 접근 가능해야 합니다.
customer_schedule_entries = html_audits["customer.html"].find_elements(attr="data-customer-view", value="schedule")
assert len(customer_schedule_entries) == 2, "고객 방문 일정은 사이드 메뉴와 모바일 메뉴에 각각 필요"
assert all(entry.get("type") == "button" for entry in customer_schedule_entries), "고객 일정 진입점은 동작 가능한 버튼이어야 함"

# 양쪽 화면의 상단 메뉴 검색 구조와 접근성 연결을 검증합니다.
assert_header_menu_search(
    html_audits["customer.html"],
    page_name="customer.html",
    scope="customer",
    root_id="customer-menu-search",
    input_id="customer-menu-search-input",
    results_id="customer-menu-search-results",
)
assert_header_menu_search(
    html_audits["stakeholder.html"],
    page_name="stakeholder.html",
    scope="staff",
    root_id="staff-menu-search",
    input_id="staff-menu-search-input",
    results_id="staff-menu-search-results",
)

assert 'id="reschedule-dialog"' in customer_text, "고객 방문 일정 변경 대화상자 필요"
assert 'id="reschedule-form"' in customer_text, "고객 방문 일정 변경 폼 필요"

# 모든 고객 팝업은 필수 입력 검증과 무관하게 X·하단 취소 버튼으로 닫혀야 합니다.
for dialog_id in ("inquiry-dialog", "product-dialog", "questionnaire-dialog", "reschedule-dialog"):
    match = re.search(rf'<dialog\s+id="{dialog_id}".*?</dialog>', customer_text, re.DOTALL)
    assert match, f"{dialog_id}: 대화상자 마크업 필요"
    dialog_markup = match.group(0)
    close_buttons = re.findall(r'<button\b(?P<attrs>[^>]*)\bdata-dialog-close\b(?P<tail>[^>]*)>', dialog_markup)
    assert len(close_buttons) == 2, f"{dialog_id}: X와 하단 취소 버튼이 각각 필요"
    for before, after in close_buttons:
        attrs = before + after
        assert re.search(r'\btype="button"', attrs), f"{dialog_id}: 닫기 버튼은 type=button이어야 함"
    submit_buttons = re.findall(r'<button\b[^>]*\btype="submit"[^>]*>', dialog_markup)
    assert len(submit_buttons) == 1, f"{dialog_id}: 정상 실행 버튼은 type=submit이어야 함"

for dialog_contract in (
    'event.target.closest("[data-dialog-close]")',
    'closeButton.closest("dialog")',
    'dialog.close("cancel")',
    'dialog.removeAttribute("open")',
    "event.target !== dialog",
    "dialog.getBoundingClientRect()",
):
    assert dialog_contract in customer_script, f"팝업 닫기 공통 동작 누락: {dialog_contract}"

assert "requestVisitReschedule" in customer_script, "고객 일정 변경 요청 저장 연결 필요"
assert "resolveVisitReschedule" in staff_script, "관계자 일정 변경 승인·반려 연결 필요"
assert 'id="reschedule-review-form"' in staff_script, "관계자 일정 변경 검토 폼 필요"
assert 'id="customer-type-filter"' in staff_script, "개인·기업 고객 필터 필요"
assert 'id="signature-pad"' in staff_script, "방문기사 고객 서명 패드 필요"
assert "pointerdown" in staff_script and "pointermove" in staff_script, "서명 패드 포인터 입력 처리 필요"
schedule_call = staff_script[staff_script.index("Store.scheduleVisit") : staff_script.index("Store.scheduleVisit") + 700]
for field in ("actorId", "serviceType", "customerPreferredAt", "scheduleStatus", "confirmedAt"):
    assert f"{field}:" in schedule_call, f"방문 등록 시 {field}를 구분해 전달해야 함"
assert "Store.updateVisitSchedule" in staff_script and 'id="visit-schedule-update-form"' in staff_script, "기사 배정 중→일정 조율 중→방문 확정 연결 필요"
for schedule_status in ("ASSIGNING", "COORDINATING", "CONFIRMED"):
    assert schedule_status in workflow_script and schedule_status in store_script, f"방문 일정 상태 누락: {schedule_status}"
complete_call = staff_script[staff_script.index("Store.completeVisit") : staff_script.index("Store.completeVisit") + 1_200]
for field in ("serviceType", "engineerId", "signerName", "signerRelationship", "signerPosition", "signatureConsent", "signatureData"):
    assert f"{field}:" in complete_call, f"완료 저장에 {field} 전달 필요"
assert "VISIT_COMPLETION_V1" in store_script, "버전이 지정된 작업 완료 동의문 필요"
assert "배정된 방문기사만" in store_script, "배정 기사 완료 제한 필요"

# 고객 일정 전용 화면, 홈 노출과 상태별 CTA가 함께 유지되어야 합니다.
assert "function renderSchedule()" in customer_script, "고객 방문 일정 전용 화면 필요"
assert 'else if (currentView === "schedule") root.innerHTML = renderSchedule();' in customer_script, "schedule 라우팅 렌더 분기 필요"
assert "function homeVisitBanner()" in customer_script and "homeVisitBanner() +" in customer_script, "홈에서 방문 일정 배너를 항상 렌더해야 함"

home_banner = customer_script[customer_script.index("function homeVisitBanner()") : customer_script.index("function renderHome()")]
assert "if (!upcoming)" in home_banner, "방문 일정이 없는 고객의 홈 배너 상태 필요"
assert "현재 확정된 방문 일정이 없어요" in home_banner, "홈 일정 없음 안내 필요"
assert 'data-customer-view="schedule">일정 화면 보기' in home_banner, "일정 없음 홈 배너에서 일정 화면 진입 필요"
assert 'request.status === "REQUESTED"' in home_banner, "홈 배너의 변경 승인 대기 상태 분기 필요"
assert "일정 상태 확인" in home_banner and 'data-customer-view="schedule"' in home_banner, "승인 대기·조율 중 고객의 상태 확인 CTA 필요"
assert 'data-open-reschedule="' in home_banner and ">일정 변경</button>" in home_banner, "변경 가능한 홈 일정의 직접 변경 CTA 필요"

visit_card = customer_script[customer_script.index("function renderVisitCard(inquiry)") : customer_script.index("function renderSchedule()")]
assert 'inquiry.visit.status === "SCHEDULED" && scheduleMeta.code === "CONFIRMED" && (!request || request.status !== "REQUESTED")' in visit_card, "확정 일정만 변경 가능해야 함"
assert 'request.status === "REJECTED" ? "다시 일정 변경" : "방문 일정 변경"' in visit_card, "반려 후 재요청 CTA와 일반 변경 CTA 필요"
assert 'inquiry.visit.status === "COMPLETED"' in visit_card, "완료 방문은 변경 불가 상태로 구분해야 함"

schedule_view = customer_script[customer_script.index("function renderSchedule()") : customer_script.index("function renderProduct()")]
assert "schedule-empty-card" in schedule_view and "현재 확정된 방문 일정이 없어요" in schedule_view, "일정 없음 전용 빈 상태 필요"
assert 'data-customer-view="inquiries">문의 처리 현황 보기' in schedule_view, "빈 상태에서 문의 현황 CTA 필요"
assert 'data-open-inquiry>새 증상 문의' in schedule_view, "빈 상태에서 새 문의 CTA 필요"
assert 'scheduled.length === 1 && pending === 0' in schedule_view, "변경 승인 대기가 없을 때만 상단 일정 변경 CTA를 제공해야 함"
assert "변경 승인 대기" in schedule_view and "완료 방문" in schedule_view, "일정 화면에 승인 대기·완료 상태 집계 필요"

request_markup = customer_script[customer_script.index("function visitRequestMarkup") : customer_script.index("function homeVisitBanner")]
for status, label in (
    ('request.status === "REQUESTED"', "일정 변경 승인 대기"),
    ('request.status === "APPROVED"', "변경 일정 확정"),
    ('request.status === "REJECTED"', "변경 요청 반려 · 기존 일정 유지"),
):
    assert status in request_markup and label in request_markup, f"일정 변경 상태 표시 누락: {label}"

# 고객·관계자 메뉴 레지스트리는 실제 화면 전환 함수에 연결되어야 합니다.
assert 'rootId: "customer-menu-search"' in customer_script and "initCustomerMenuSearch();" in customer_script, "고객 상단 메뉴 검색 초기화 필요"
assert_menu_route(customer_script, "customer-home", "home")
assert_menu_route(customer_script, "customer-schedule", "schedule", ("일정 변경", "예약", "방문"))
assert_menu_route(customer_script, "customer-product", "product")
assert 'id: "customer-usage"' in customer_script and "제품 사용 리포트" in customer_script, "사용량 리포트 검색 항목 필요"
for keyword in ("출수량", "냉수", "온수", "제빙량", "시간별", "주간", "월간", "그래프"):
    assert keyword in customer_script, f"사용량 리포트 검색어 누락: {keyword}"
assert "renderProductUsage(p)" in customer_script and 'id="product-usage"' in customer_script, "내 제품 화면에 사용량 리포트가 필요"
assert customer_script.index("renderProductUsage(p)") < customer_script.index("renderProductManuals(p)"), "사용량 리포트는 제품 히어로 다음, 매뉴얼 앞에 표시해야 함"
assert 'data-usage-range="' in customer_script and 'aria-pressed="' in customer_script, "시간별·주간·월간 기간 선택 버튼 상태가 필요"
assert "usage-point-selector" in customer_script and "그래프 수치를 표로 보기" in customer_script, "차트의 키보드 선택과 표 대체 정보가 필요"
assert "제빙 기능이 없는 모델입니다" in customer_script and "기능 미지원" in customer_script, "비제빙 모델은 0이 아닌 기능 미지원으로 안내해야 함"
assert 'role="img"' in usage_chart_script and "<title" in usage_chart_script and "<desc" in usage_chart_script, "사용량 SVG에 접근 가능한 제목과 설명 필요"
assert "data-usage-point" in usage_chart_script and "niceScale" in usage_chart_script, "사용량 차트 지점과 축 계산 로직 필요"
assert "lineSeries" in usage_chart_script and "options.series" in usage_chart_script, "냉수·온수 다중 선 그래프 지원 필요"
assert "usage-chart-line usage-chart-line--" in usage_chart_script, "냉수·온수 선의 계열별 클래스 생성 필요"
assert 'data-usage-series="' in usage_chart_script, "사용량 그래프 지점에 냉수·온수 계열 식별자 필요"
assert "multipleSeries" in usage_chart_script and "!multipleSeries" in usage_chart_script, "다중 선 그래프에서는 겹치는 면적 채움을 제외해야 함"
assert "usage-water-legend" in customer_script and "냉수" in customer_script and "온수" in customer_script, "냉수·온수 범례 필요"
assert "data-usage-selected-cold" in customer_script and "data-usage-selected-hot" in customer_script, "선택 구간에 냉수·온수 개별값 필요"
assert "냉·온수 합계" in customer_script and "냉수 (L)" in customer_script and "온수 (L)" in customer_script, "상세 표에 냉수·온수·합계 열 필요"
assert "usage-routine-band" in usage_chart_script and "usage-prep-line" in usage_chart_script, "시간별 차트에 반복 사용 구간과 준비 시작 표시 필요"
assert "annotationGeometry" in usage_chart_script and "annotations" in usage_chart_script, "패턴 annotation 좌표 계산 계약 필요"
assert 'id="smart-preparation"' in customer_script and "AI 스마트 준비" in customer_script, "사용량 리포트에 스마트 준비 영역 필요"
assert "반복되는 사용 시간대" in customer_script and "준비 시작" in customer_script, "반복 패턴과 준비 시작 시각 안내 필요"
assert 'data-smart-mode="AUTO"' in customer_script and 'data-smart-mode="MANUAL"' in customer_script, "AI 자동·직접 설정 모드 필요"
assert "aria-pressed" in customer_script and "data-smart-consent-form" in customer_script, "스마트 준비 모드 상태와 명시적 동의 폼 필요"
assert "data-smart-manual-form" in customer_script and 'name="readyAt"' in customer_script and 'name="days"' in customer_script, "직접 준비 완료 시간과 반복 요일 설정 필요"
assert "data-remove-smart-schedule" in customer_script, "사용자가 직접 설정한 준비 시간을 삭제할 수 있어야 함"
assert 'id: "customer-smart-preparation"' in customer_script and "온수 준비" in customer_script and "얼음 준비" in customer_script, "상단 검색에서 스마트 준비로 바로 접근해야 함"
for store_api in ("enableSmartPreparation", "setSmartPreparationMode", "saveManualPreparation", "removeManualPreparation", "getEffectiveSmartPreparation"):
    assert store_api in store_script, f"스마트 준비 저장 API 누락: {store_api}"
assert "smartPreparationProfiles" in mock_script and 'schemaVersion: 11' in mock_script, "지식·워크플로·알림·제품 문진을 포함한 v11 스키마 필요"
assert "coldWater" in mock_script and "hotWater" in mock_script and "hotWaterFixtures" in mock_script, "제품별 냉수·온수 시계열 필요"
assert "DEMO_PATTERN_ENGINE" in mock_script and "SMART_PREPARATION_V1" in mock_script, "시연 패턴 출처와 동의 버전 필요"
assert "안전 점검으로 준비 중지" in customer_script and "실제 운영에서는 제품 IoT 제어 API" in customer_script, "안전 차단과 실제 기기 미연동 고지 필요"
assert 'id: "customer-manual"' in customer_script and "제품 사용 매뉴얼" in customer_script, "공식 영상 매뉴얼 검색 항목 필요"
assert "product-manuals" in customer_script and "renderProductManuals(p)" in customer_script, "내 제품 화면에 모델별 매뉴얼 영역 필요"
assert_menu_route(customer_script, "customer-inquiries", "inquiries")
assert_menu_route(customer_script, "customer-care", "care")
assert "goView(viewButton.dataset.customerView)" in customer_script, "고객 고정 메뉴와 goView 연결 필요"

assert 'rootId: "staff-menu-search"' in staff_script and "initStaffMenuSearch();" in staff_script, "관계자 상단 메뉴 검색 초기화 필요"
assert_menu_route(staff_script, "staff-dashboard", "dashboard")
assert_menu_route(staff_script, "staff-queue", "queue")
assert_menu_route(staff_script, "staff-visits", "visits", ("일정 변경", "변경 승인", "예약"))
assert_menu_route(staff_script, "staff-customers", "customers")
assert_menu_route(staff_script, "staff-analytics", "analytics")
assert_menu_route(staff_script, "staff-knowledge", "knowledge")
assert_menu_route(staff_script, "staff-audit", "audit")
assert "goView(viewButton.dataset.staffView)" in staff_script, "관계자 고정 메뉴와 goView 연결 필요"

# 지식·매뉴얼은 고객 애로·요구 키워드에서 관련 문서 메타데이터와 문의로 이어져야 합니다.
for keyword in ("메타데이터", "애로사항", "요구사항", "VOC", "키워드 분석", "출수량", "물맛", "누수", "상담 연결"):
    assert keyword in staff_script, f"지식 메뉴 검색어 누락: {keyword}"
assert "knowledgeDocuments" in mock_script and "knowledgeKeywordInsights" in mock_script, "지식 문서와 키워드 분석 더미 데이터 필요"
assert "DEMO_KEYWORD_ANALYSIS" in mock_script and "DEMO_METADATA" in mock_script, "지식 분석과 문서가 시연 데이터임을 명시해야 함"
assert 'id="knowledge-query"' in staff_script and 'type="search"' in staff_script, "고객 키워드 검색 입력 필요"
assert 'id="knowledge-category-filter"' in staff_script and 'id="knowledge-model-filter"' in staff_script, "분류·제품 모델 필터 필요"
assert 'data-knowledge-keyword="' in staff_script and 'aria-pressed="' in staff_script, "키워드 선택 버튼 상태 필요"
assert 'id="knowledge-result-summary"' in staff_script and 'role="status"' in staff_script, "필터 결과 건수 접근성 상태 필요"
metadata_button = re.search(r'<button\s+class="button button--ghost button--full"(?P<attrs>[^>]*data-open-knowledge-metadata[^>]*)>', staff_script)
assert metadata_button, "동작 가능한 메타데이터 보기 버튼 필요"
assert "disabled" not in metadata_button.group("attrs"), "메타데이터 보기 버튼을 비활성화하면 안 됨"
assert 'aria-haspopup="dialog"' in metadata_button.group("attrs") and 'aria-controls="knowledge-metadata-dialog"' in metadata_button.group("attrs"), "메타데이터 버튼과 대화상자 접근성 연결 필요"
assert 'id="knowledge-metadata-dialog"' in staff_text, "관계자용 문서 메타데이터 대화상자 필요"
knowledge_dialog_match = re.search(r'<dialog\s+id="knowledge-metadata-dialog"(?P<attrs>[^>]*)>.*?</dialog>', staff_text, re.DOTALL)
assert knowledge_dialog_match, "문서 메타데이터 대화상자 마크업 필요"
assert 'aria-labelledby="knowledge-metadata-title"' in knowledge_dialog_match.group("attrs"), "메타데이터 제목 접근성 연결 필요"
assert 'aria-describedby="knowledge-metadata-subtitle"' in knowledge_dialog_match.group("attrs"), "메타데이터 설명 접근성 연결 필요"
knowledge_close_buttons = re.findall(r'<button\b(?P<attrs>[^>]*)\bdata-knowledge-dialog-close\b(?P<tail>[^>]*)>', knowledge_dialog_match.group(0))
assert len(knowledge_close_buttons) == 2, "메타데이터 대화상자에 X와 하단 닫기 버튼이 필요"
for before, after in knowledge_close_buttons:
    assert re.search(r'\btype="button"', before + after), "메타데이터 닫기 버튼은 제출 동작과 분리해야 함"
assert "dialog.showModal()" in staff_script and 'dialog.setAttribute("open", "")' in staff_script, "메타데이터 대화상자 열기와 폴백 필요"
assert "function closeKnowledgeMetadata()" in staff_script and "knowledgeDialog.addEventListener(\"close\"" in staff_script, "메타데이터 닫기와 포커스 복귀 처리 필요"
assert "knowledgeDialogReturnFocus.focus()" in staff_script, "메타데이터 닫은 뒤 원래 버튼으로 포커스 복귀 필요"
assert "event.target !== knowledgeDialog" in staff_script and "getBoundingClientRect()" in staff_script, "메타데이터 배경 클릭 닫기 필요"
assert 'data-open-knowledge-case="' in staff_script and 'openCase(inquiryId, "queue")' in staff_script, "메타데이터에서 관련 문의 상세로 이동해야 함"

# 공통 검색 컨트롤러의 ARIA, 키보드, 한글 IME와 닫기 동작을 정적으로 고정합니다.
assert "function initMenuSearch(options)" in common_script and "initMenuSearch: initMenuSearch" in common_script, "공통 메뉴 검색 컨트롤러 공개 필요"
for aria_contract in (
    'input.setAttribute("role", "combobox")',
    'input.setAttribute("aria-autocomplete", "list")',
    'input.setAttribute("aria-haspopup", "listbox")',
    'input.setAttribute("aria-controls", results.id)',
    'results.setAttribute("role", "listbox")',
    'input.setAttribute("aria-activedescendant"',
    'option.setAttribute("aria-selected"',
):
    assert aria_contract in common_script, f"공통 검색 ARIA 동작 누락: {aria_contract}"
assert 'input.setAttribute("aria-expanded", "true")' in common_script, "검색 결과 열림 ARIA 상태 필요"
assert 'input.setAttribute("aria-expanded", "false")' in common_script, "검색 결과 닫힘 ARIA 상태 필요"
assert "results.hidden = false" in common_script and "results.hidden = true" in common_script, "검색 결과 표시·숨김 동작 필요"

assert 'input.addEventListener("compositionstart"' in common_script and "composing = true" in common_script, "한글 IME 조합 시작 처리 필요"
assert 'input.addEventListener("compositionend"' in common_script and "composing = false" in common_script, "한글 IME 조합 완료 처리 필요"
assert "if (!composing)" in common_script, "IME 조합 중 검색 결과 재렌더를 막아야 함"
assert "if (event.isComposing || composing) return;" in common_script, "IME 조합 중 키보드 선택을 막아야 함"
for key in ("ArrowDown", "ArrowUp", "Enter", "Escape"):
    assert f'event.key === "{key}"' in common_script, f"메뉴 검색 키보드 동작 누락: {key}"
assert re.search(r'event\.key === "Escape" && isOpen\)\s*\{.*?event\.preventDefault\(\);.*?closeResults\(\);', common_script, re.DOTALL), "Escape는 열린 결과를 닫아야 함"
close_results = common_script[common_script.index("function closeResults()") : common_script.index("function selectItem(index)")]
assert "input.value" not in close_results, "Escape·외부 클릭으로 닫을 때 사용자의 검색어를 지우면 안 됨"
assert 'event.key !== "/"' in common_script and 'document.querySelector("dialog[open]")' in common_script, "검색 단축키는 대화상자·입력 중 오작동하지 않아야 함"

css = (ROOT / "assets/css/styles.css").read_text(encoding="utf-8")
assert "@media (max-width:" in css, "반응형 미디어 쿼리 필요"
assert ":focus-visible" in css, "키보드 포커스 스타일 필요"
assert "prefers-reduced-motion" in css, "모션 감소 설정 필요"
assert ".global-menu-search" in css and ".global-menu-search-results" in css, "상단 메뉴 검색 UI 스타일 필요"
for notification_selector in (".notification-panel", ".notification-badge", ".notification-item", ".notification-item.is-unread", ".notification-empty", ".notification-panel-actions"):
    assert notification_selector in css, f"역할별 알림 센터 스타일 누락: {notification_selector}"
assert re.search(r'@media\s*\(max-width:\s*620px\).*?\.notification-button,\s*\.staff-bell\s*\{\s*display:\s*grid;', css, re.DOTALL), "모바일에서도 고객·관계자 알림 버튼이 보여야 함"
assert ".home-appointment-banner" in css and ".schedule-empty-card" in css, "고객 일정 홈 배너·빈 상태 스타일 필요"
assert ".product-photo-stage" in css and ".manual-video-card" in css, "실제 제품 사진과 영상 매뉴얼 UI 스타일 필요"
for knowledge_selector in (".knowledge-analysis-panel", ".knowledge-keyword-grid", ".knowledge-filter-bar", ".knowledge-metadata-dialog", ".knowledge-section-card"):
    assert knowledge_selector in css, f"지식 키워드·메타데이터 UI 스타일 누락: {knowledge_selector}"
for viewer_selector in (".product-viewer", ".product-viewer-stage", ".product-viewer-scene", ".product-model-3d", ".product-viewer-drag-hint"):
    assert viewer_selector in css, f"360도 3D 제품 뷰어 스타일 누락: {viewer_selector}"
assert "touch-action: pan-y pinch-zoom" in css, "제품 드래그 중에도 모바일 세로 스크롤과 확대를 보존해야 함"
assert "data-product-viewer" in customer_script and "renderProductViewer" in customer_script, "내 제품 화면에 3D 뷰어 마크업 연결 필요"
assert "ProductViewer.mount(root)" in customer_script, "제품 화면 렌더 후 3D 뷰어 초기화 필요"
viewer_markup = customer_script[customer_script.index("function renderProductViewer(model)") : customer_script.index("function renderProduct()")]
assert 'role="slider"' in viewer_markup and 'tabindex="0"' in viewer_markup, "조작부 없이도 3D 제품 영역 자체가 키보드 접근 가능해야 함"
assert 'aria-valuemin="0"' in viewer_markup and 'aria-valuemax="359"' in viewer_markup, "3D 제품 영역에 360도 각도 범위가 필요"
for removed_viewer_ui in ("data-viewer-mode", "data-viewer-range", "data-viewer-photo", "data-viewer-rotate", "data-viewer-reset", "product-viewer-controls"):
    assert removed_viewer_ui not in viewer_markup, f"요청에 따라 제거해야 하는 3D 뷰어 조작 UI가 남아 있음: {removed_viewer_ui}"
for viewer_event in ("pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"):
    assert viewer_event in product_viewer_script, f"제품 뷰어 포인터 종료·취소 처리 누락: {viewer_event}"
assert "setPointerCapture" in product_viewer_script and "releasePointerCapture" in product_viewer_script, "제품 드래그는 포인터 캡처를 안전하게 관리해야 함"
assert "AbortController" in product_viewer_script and "abortController.abort()" in product_viewer_script, "제품 전환·재렌더 시 뷰어 이벤트 정리 필요"
assert 'stage.setAttribute("aria-valuetext"' in product_viewer_script and 'status.setAttribute("aria-live", "polite")' in product_viewer_script, "제품 각도와 변경 결과의 접근성 상태 필요"
for viewer_key in ("ArrowLeft", "ArrowRight", "Home", "End"):
    assert f'event.key === "{viewer_key}"' in product_viewer_script, f"조작부를 제거한 3D 뷰어의 키보드 대체 동작 누락: {viewer_key}"
assert "setInterval" not in product_viewer_script and "auto-rotate" not in product_viewer_script.lower(), "제품 뷰어는 사용자 동의 없는 자동회전을 시작하면 안 됨"
for usage_selector in (".product-usage", ".usage-range-switch", ".usage-chart-grid", ".usage-chart-line", ".usage-chart-line--cold", ".usage-chart-line--hot", ".usage-water-legend", ".usage-legend-swatch--cold", ".usage-legend-swatch--hot", ".usage-chart-bar", ".usage-unsupported", ".usage-routine-band", ".smart-preparation", ".smart-pattern-list", ".smart-mode-switch", ".smart-manual-form"):
    assert usage_selector in css, f"사용량 시각화 스타일 누락: {usage_selector}"

script_text = "\n".join(path.read_text(encoding="utf-8") for path in (ROOT / "assets/js").glob("*.js"))
for forbidden in ("fetch(", "XMLHttpRequest", "http://"):
    assert forbidden not in script_text, f"오프라인 프로토타입 금지 의존: {forbidden}"

# 정적 UI는 외부 런타임 의존이 없고, 클릭 시 이동하는 공식 제품·YouTube 링크만 허용합니다.
external_urls = set(re.findall(r'https://[^"\']+', script_text))
allowed_prefixes = (
    "https://www.skmagic.com/",
    "https://www.youtube.com/",
)
assert external_urls, "공식 제품·영상 링크가 필요합니다."
for url in external_urls:
    assert url.startswith(allowed_prefixes), f"허용되지 않은 외부 링크: {url}"

paths = [
    "/", "/index.html", "/customer.html", "/stakeholder.html",
    "/assets/css/styles.css", "/assets/js/mock-data.js", "/assets/js/workflow-config.js", "/assets/js/store.js",
    "/assets/js/common.js", "/assets/js/usage-chart.js", "/assets/js/product-viewer.js", "/assets/js/customer.js", "/assets/js/stakeholder.js",
    "/assets/images/products/wpu-jac115dnw.png", "/assets/images/products/wpu-iac425snw.png",
    "/assets/images/manuals/t457fy7rpic.jpg", "/assets/images/manuals/a6x6ajslqvg.jpg",
    "/assets/images/manuals/nh3macwoqdq.jpg", "/assets/images/manuals/jvvjkoxj_oc.jpg",
]
server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    for request_path in paths:
        with urlopen(f"http://127.0.0.1:{server.server_port}{request_path}") as response:
            assert response.status == 200, request_path
finally:
    server.shutdown()
    thread.join(timeout=2)

print("static-http-smoke: PASS")
