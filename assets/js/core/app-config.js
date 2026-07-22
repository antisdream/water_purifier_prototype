(function () {
  "use strict";

  // 화면설계서 v13의 MVP 대상만 운영 레지스트리에 둔다.
  // WPUIAC506은 removed_legacy이므로 레코드 자체를 만들지 않고 model-policy에서 입력을 차단한다.
  var modelRegistry = [
    {
      productCode: "WPUJAC104DWH",
      manualModel: "WPU-JAC104D",
      relatedManualModels: ["WPU-JCC104D"],
      productGeneration: "D",
      scopeRole: "mvp_primary",
      supportScope: "mvp_primary",
      supportStatus: "SUPPORTED"
    },
    {
      productCode: "WPUIAC425SNW",
      manualModel: "WPU-IAC425",
      relatedManualModels: [],
      productGeneration: "IAC",
      scopeRole: "expansion_secondary",
      supportScope: "expansion_secondary",
      supportStatus: "EXPANSION"
    }
  ];

  window.WaterCareConfig = Object.freeze({
    schemaVersion: "SCREEN-DESIGN-V13",
    seedRevision: 6,
    storageKey: "watercare.prototype.screen-design-v13",
    primaryProductCode: "WPUJAC104DWH",
    primaryManualModel: "WPU-JAC104D",
    verifiedEvidenceStatus: "text_and_visual_verified",
    aiMaxRetries: 2,
    modelRegistry: modelRegistry,
    defaultActors: Object.freeze({
      counselor: { role: "COUNSELOR", id: "STAFF-CONS-01", name: "한유진" },
      technician: { role: "TECHNICIAN", id: "STAFF-TECH-01", name: "오세훈" },
      operator: { role: "OPERATOR", id: "STAFF-OPER-01", name: "장민서" }
    })
  });
}());
