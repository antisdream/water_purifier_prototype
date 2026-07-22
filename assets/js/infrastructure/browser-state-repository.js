(function () {
  "use strict";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function create(options) {
    var memoryState = null;
    var storageKey = options.storageKey;

    function read() {
      try {
        var raw = window.localStorage && window.localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : null;
      } catch (error) {
        return memoryState ? clone(memoryState) : null;
      }
    }

    function write(state) {
      memoryState = clone(state);
      try {
        if (window.localStorage) window.localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (error) {
        // 제한된 미리보기 환경에서는 페이지 메모리 저장소로 계속 동작한다.
      }
    }

    function seed() {
      var value = options.seedProvider && options.seedProvider();
      if (!value) throw new Error("FIX 시연 데이터가 로드되지 않았습니다.");
      return clone(value);
    }

    function ensure() {
      var state = read();
      if (!state || !state.meta || state.meta.schemaVersion !== options.schemaVersion || Number(state.meta.seedRevision) !== Number(options.seedRevision)) {
        state = seed();
        write(state);
      }
      return state;
    }

    function reset() {
      var state = seed();
      write(state);
      return clone(state);
    }

    return { read: read, write: write, ensure: ensure, reset: reset, storageKey: storageKey };
  }

  window.WaterCareBrowserRepository = { create: create };
}());
