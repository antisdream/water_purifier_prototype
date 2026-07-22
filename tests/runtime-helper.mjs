import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const runtimeFiles = [
  "assets/js/core/app-config.js",
  "assets/js/domain/model-policy.js",
  "assets/js/domain/ai-rag-simulator.js",
  "assets/js/data/seed-data.js",
  "assets/js/infrastructure/browser-state-repository.js",
  "assets/js/core/store.js"
];

export const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

export function bootRuntime() {
  const values = new Map();
  const window = {
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    },
    addEventListener() {},
    setTimeout,
    clearTimeout
  };
  const context = vm.createContext({ window, console, Date, Intl, Math, JSON, Error, RegExp, setTimeout, clearTimeout });
  for (const file of runtimeFiles) vm.runInContext(read(file), context, { filename: file });
  return window;
}
