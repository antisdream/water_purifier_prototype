(function () {
  "use strict";
  var state = window.WaterCareStore.getState();
  var revision = document.getElementById("gateway-revision");
  var inquiryCount = document.getElementById("gateway-inquiry-count");
  var evidenceCount = document.getElementById("gateway-evidence-count");
  if (revision) revision.textContent = "Revision " + state.meta.revision;
  if (inquiryCount) inquiryCount.textContent = state.inquiries.length + "건";
  if (evidenceCount) evidenceCount.textContent = state.evidenceRegistry.length + "건";

  var resetButton = document.getElementById("reset-demo");
  if (resetButton) {
    resetButton.addEventListener("click", function () {
      if (!window.confirm("네 역할의 시연 작업 상태를 초기 데이터로 되돌릴까요?")) return;
      window.WaterCareStore.reset();
      window.WaterCareUI.toast("시연 데이터를 초기화했습니다.", "success");
      window.setTimeout(function () { window.location.reload(); }, 500);
    });
  }
}());
