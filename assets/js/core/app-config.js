(function () {
  "use strict";

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
    },
    {
      productCode: "WPUIAC506",
      manualModel: "WPU-IAC506",
      relatedManualModels: [],
      productGeneration: "IAC",
      scopeRole: "archive",
      supportScope: "archived",
      supportStatus: "ARCHIVED"
    }
  ];

  window.WaterCareConfig = Object.freeze({
    schemaVersion: "SCREEN-FIX-V6",
    seedRevision: 4,
    storageKey: "watercare.prototype.screen-fix-v6",
    primaryProductCode: "WPUJAC104DWH",
    primaryManualModel: "WPU-JAC104D",
    verifiedEvidenceStatus: "text_and_visual_verified",
    modelRegistry: modelRegistry,
    defaultActors: Object.freeze({
      counselor: { role: "COUNSELOR", id: "STAFF-CONS-01", name: "한유진" },
      technician: { role: "TECHNICIAN", id: "STAFF-TECH-01", name: "오세훈" },
      operator: { role: "OPERATOR", id: "STAFF-OPER-01", name: "장민서" }
    })
  });
}());
