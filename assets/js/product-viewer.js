(function () {
  "use strict";

  var activeController = null;
  var angleByModel = Object.create(null);

  function wrapAngle(value) {
    var numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    var rounded = Math.round(numeric);
    return ((rounded % 360) + 360) % 360;
  }

  function angleFromDrag(startAngle, startX, currentX) {
    var delta = arguments.length >= 3 ? Number(currentX) - Number(startX) : Number(startX);
    return wrapAngle(Number(startAngle) + (Number.isFinite(delta) ? delta : 0));
  }

  function angleText(angle) {
    if (angle === 0) return "정면 0도";
    if (angle === 90) return "오른쪽 측면 90도";
    if (angle === 180) return "후면 180도";
    if (angle === 270) return "왼쪽 측면 270도";
    return angle + "도";
  }

  function noopController() {
    return { destroy: function () {} };
  }

  function mount(root) {
    if (activeController && typeof activeController.destroy === "function") activeController.destroy();

    if (!root || typeof root.querySelector !== "function") {
      activeController = noopController();
      return activeController;
    }

    var viewer = root.querySelector("[data-product-viewer]");
    if (!viewer || typeof window.AbortController !== "function") {
      activeController = noopController();
      return activeController;
    }

    var stage = viewer.querySelector("[data-viewer-stage]");
    var object = viewer.querySelector("[data-viewer-object]");
    var status = viewer.querySelector("[data-viewer-status]");
    if (!stage || !object) {
      activeController = noopController();
      return activeController;
    }

    var abortController = new window.AbortController();
    var signalOptions = { signal: abortController.signal };
    var modelKey = viewer.dataset.modelId || root.dataset.modelId || "default";
    var angle = wrapAngle(Object.prototype.hasOwnProperty.call(angleByModel, modelKey) ? angleByModel[modelKey] : (viewer.dataset.initialAngle || 0));
    var dragging = false;
    var activePointerId = null;
    var dragStartX = 0;
    var dragStartAngle = angle;
    var destroyed = false;

    if (status) {
      status.setAttribute("aria-live", "polite");
      status.setAttribute("aria-atomic", "true");
    }

    function announce(message) {
      if (status) status.textContent = message;
    }

    function updateAngle(nextAngle) {
      angle = wrapAngle(nextAngle);
      object.style.setProperty("--viewer-angle", angle + "deg");
      viewer.dataset.viewerAngle = String(angle);
      stage.setAttribute("aria-valuenow", String(angle));
      stage.setAttribute("aria-valuetext", angleText(angle));
      angleByModel[modelKey] = angle;
    }

    function releasePointer(pointerId) {
      if (pointerId == null || typeof stage.releasePointerCapture !== "function") return;
      try {
        if (typeof stage.hasPointerCapture !== "function" || stage.hasPointerCapture(pointerId)) stage.releasePointerCapture(pointerId);
      } catch (error) { /* Pointer capture may already have been released. */ }
    }

    function finishDrag(event, shouldAnnounce) {
      if (!dragging || (event && event.pointerId !== activePointerId)) return;
      var pointerId = activePointerId;
      var changed = angle !== dragStartAngle;
      dragging = false;
      activePointerId = null;
      stage.classList.remove("is-dragging");
      if (!event || event.type !== "lostpointercapture") releasePointer(pointerId);
      if (shouldAnnounce && changed) announce("제품 각도를 " + angleText(angle) + "로 조정했습니다.");
    }

    function onPointerDown(event) {
      if (event.isPrimary === false || event.button !== 0) return;
      dragging = true;
      activePointerId = event.pointerId;
      dragStartX = Number(event.clientX) || 0;
      dragStartAngle = angle;
      stage.classList.add("is-dragging");
      try { stage.focus({ preventScroll: true }); } catch (error) { stage.focus(); }
      if (typeof stage.setPointerCapture === "function") {
        try { stage.setPointerCapture(activePointerId); } catch (error) { /* Continue without capture. */ }
      }
    }

    function onPointerMove(event) {
      if (!dragging || event.pointerId !== activePointerId) return;
      updateAngle(angleFromDrag(dragStartAngle, dragStartX, event.clientX));
      if (event.cancelable) event.preventDefault();
    }

    function onKeyDown(event) {
      var nextAngle = null;
      if (event.key === "ArrowLeft") nextAngle = angle - 15;
      else if (event.key === "ArrowRight") nextAngle = angle + 15;
      else if (event.key === "Home") nextAngle = 0;
      else if (event.key === "End") nextAngle = 180;
      if (nextAngle === null) return;
      event.preventDefault();
      updateAngle(nextAngle);
      announce("제품 각도를 " + angleText(angle) + "로 조정했습니다.");
    }

    stage.addEventListener("pointerdown", onPointerDown, signalOptions);
    stage.addEventListener("pointermove", onPointerMove, signalOptions);
    stage.addEventListener("pointerup", function (event) { finishDrag(event, true); }, signalOptions);
    stage.addEventListener("pointercancel", function (event) { finishDrag(event, true); }, signalOptions);
    stage.addEventListener("lostpointercapture", function (event) { finishDrag(event, true); }, signalOptions);
    stage.addEventListener("keydown", onKeyDown, signalOptions);

    var controller = {
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        finishDrag(null, false);
        abortController.abort();
        if (activeController === controller) activeController = null;
      }
    };

    activeController = controller;
    updateAngle(angle);
    return controller;
  }

  window.WaterCareProductViewer = {
    mount: mount,
    helpers: {
      wrapAngle: wrapAngle,
      angleFromDrag: angleFromDrag
    }
  };
})();
