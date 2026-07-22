from __future__ import annotations

import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
PAGES = ["index.html", "customer.html", "counselor.html", "technician.html", "operator.html", "stakeholder.html"]
ACTIVE_JS = [
    "assets/js/fix-data.js",
    "assets/js/fix-store.js",
    "assets/js/fix-common.js",
    "assets/js/gateway-v6.js",
    "assets/js/customer-app-v6.js",
    "assets/js/counselor-app-v6.js",
    "assets/js/technician-app-v6.js",
    "assets/js/operator-app-v6.js",
]
ACTIVE_CSS = [
    "assets/css/fix-base.css",
    "assets/css/gateway-v6.css",
    "assets/css/customer-mobile.css",
    "assets/css/staff-desktop-v6.css",
    "assets/css/technician-tablet.css",
]


class DocumentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.links: list[str] = []
        self.scripts: list[str] = []
        self.styles: list[str] = []
        self.lang: str | None = None
        self.viewport = False
        self.title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "html":
            self.lang = values.get("lang")
        if tag == "meta" and values.get("name") == "viewport":
            self.viewport = True
        if tag == "title":
            self.title = True
        if values.get("id"):
            self.ids.append(str(values["id"]))
        if tag == "a" and values.get("href"):
            self.links.append(str(values["href"]))
        if tag == "script" and values.get("src"):
            self.scripts.append(str(values["src"]))
        if tag == "link" and values.get("rel") == "stylesheet" and values.get("href"):
            self.styles.append(str(values["href"]))


def assert_local_target_exists(source: str, target: str) -> None:
    parsed = urlparse(target)
    if parsed.scheme or target.startswith(("#", "mailto:", "tel:")):
        return
    relative = parsed.path
    if not relative:
        return
    destination = (ROOT / relative).resolve()
    assert destination.exists(), f"{source}: missing local target {target}"


def assert_no_mojibake(file: str, text: str) -> None:
    assert "�" not in text, f"{file}: Unicode replacement character"
    suspicious = ["?뚰", "?곗씠", "怨좉컼", "留ㅼ쭅"]
    for marker in suspicious:
        assert marker not in text, f"{file}: suspicious mojibake {marker}"


def check_pages() -> None:
    parsed_pages: dict[str, DocumentParser] = {}
    for page in PAGES:
        path = ROOT / page
        assert path.exists(), f"missing page: {page}"
        text = path.read_text(encoding="utf-8")
        assert_no_mojibake(page, text)
        parser = DocumentParser()
        parser.feed(text)
        parsed_pages[page] = parser
        assert parser.lang == "ko", f"{page}: lang=ko"
        assert parser.viewport, f"{page}: viewport"
        assert parser.title, f"{page}: title"
        assert len(parser.ids) == len(set(parser.ids)), f"{page}: duplicate id"
        for target in [*parser.links, *parser.scripts, *parser.styles]:
            assert_local_target_exists(page, target)

    index = (ROOT / "index.html").read_text(encoding="utf-8")
    for role_page in ["customer.html", "counselor.html", "technician.html", "operator.html"]:
        assert f'href="{role_page}"' in index, f"gateway missing {role_page}"

    for page in ["customer.html", "counselor.html", "technician.html", "operator.html"]:
        text = (ROOT / page).read_text(encoding="utf-8")
        assert 'href="index.html"' in text, f"{page}: no gateway return"
        for other in ["customer.html", "counselor.html", "technician.html", "operator.html"]:
            if other != page:
                assert f'href="{other}"' not in text, f"{page}: direct role switch {other}"
        for core in ["fix-data.js", "fix-store.js", "fix-common.js"]:
            assert core in text, f"{page}: missing {core}"


def check_assets() -> None:
    for file in ACTIVE_JS + ACTIVE_CSS:
        path = ROOT / file
        assert path.exists() and path.stat().st_size > 0, f"missing or empty: {file}"
        text = path.read_text(encoding="utf-8")
        assert_no_mojibake(file, text)
        assert text.count("{") == text.count("}"), f"{file}: unbalanced braces"

    for file in ACTIVE_JS:
        completed = subprocess.run(
            ["node", "--check", str(ROOT / file)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        assert completed.returncode == 0, f"{file}: node --check failed\n{completed.stderr}"


def check_fix_scope() -> None:
    active_text = "\n".join((ROOT / file).read_text(encoding="utf-8") for file in [
        "index.html", "customer.html", "counselor.html", "technician.html", "operator.html", *ACTIVE_JS
    ])
    for forbidden in ["WPUIAC425SNW", "WPUJAC115DNW", "DEMO_IOT", "DEMO_METADATA", "smartPreparation", "usageTelemetry"]:
        assert forbidden not in active_text, f"active prototype exposes excluded token: {forbidden}"
    assert active_text.count("WPUJAC104DWH") >= 4
    assert "시연용 합성 데이터" in active_text

    customer_js = (ROOT / "assets/js/customer-app-v6.js").read_text(encoding="utf-8")
    counselor_js = (ROOT / "assets/js/counselor-app-v6.js").read_text(encoding="utf-8")
    technician_js = (ROOT / "assets/js/technician-app-v6.js").read_text(encoding="utf-8")
    operator_js = (ROOT / "assets/js/operator-app-v6.js").read_text(encoding="utf-8")
    for screen in ["CUST-01", "CUST-02", "CUST-03", "CUST-04", "CUST-05", "CUST-06"]:
        assert screen in customer_js, screen
    for screen in ["CONS-01", "CONS-02", "CONS-03"]:
        assert screen in counselor_js, screen
    for screen in ["TECH-01", "TECH-02", "TECH-03"]:
        assert screen in technician_js, screen
    for role, source in [("customer", customer_js), ("counselor", counselor_js), ("technician", technician_js)]:
        assert "MARK_NOTIFICATION_READ" in source, f"{role}: notification read linkage missing"
    assert "ADMIN-01" in operator_js
    assert "Store.dispatch(" not in operator_js, "operator must remain read-only"


def main() -> int:
    check_pages()
    check_assets()
    check_fix_scope()
    print("static-http-smoke-fix-v6: PASS")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"static-http-smoke-fix-v6: FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
