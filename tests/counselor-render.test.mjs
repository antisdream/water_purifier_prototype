import assert from "node:assert/strict";
import vm from "node:vm";
import { bootRuntime, read } from "./runtime-helper.mjs";

function createElement(id) {
  return {
    id,
    innerHTML: "",
    textContent: "",
    className: "",
    hidden: false,
    dataset: {},
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    addEventListener() {},
    querySelector() { return null; },
    focus() {},
    contains() { return false; },
    scrollIntoView() {}
  };
}

const window = bootRuntime();
window.crypto = { randomUUID: () => "00000000-0000-4000-8000-000000000001" };

const elements = new Map();
for (const id of [
  "counselor-app", "counselor-queue-count", "counselor-notification-count",
  "counselor-notification-toggle", "counselor-notification-list",
  "counselor-notification-panel", "v6-toast"
]) elements.set(id, createElement(id));

const document = {
  getElementById(id) { return elements.get(id) || null; },
  querySelectorAll() { return []; },
  addEventListener() {}
};

window.document = document;
window.WaterCareUI = {
  escape(value) {
    return String(value == null ? "" : value).replace(/[&<>'\"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[character]);
  },
  formatDateTime(value) { return value ? String(value) : "기록 없음"; }
};

const context = vm.createContext({
  window, document, console, Date, Intl, Math, JSON, Error, RegExp,
  setTimeout, clearTimeout, FormData: class FormData {}
});

vm.runInContext(read("assets/js/roles/counselor/app.js"), context, {
  filename: "assets/js/roles/counselor/app.js"
});

const root = elements.get("counselor-app");
assert.equal(root.getAttribute("aria-busy"), "false");
assert.match(root.innerHTML, /CONS-01/);
assert.match(root.innerHTML, /상담·문의 큐/);
assert.doesNotMatch(root.innerHTML, /불러오는 중/);

console.log("counselor-render-screen-design-v13: PASS");
