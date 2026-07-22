(function () {
  "use strict";

  var Config = window.WaterCareConfig || {};

  function normalize(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function registryEntry(product) {
    var productCode = normalize(product && product.productCode);
    var manualModel = normalize(product && product.manualModel);
    return (Config.modelRegistry || []).find(function (item) {
      var allowedManualModels = [item.manualModel].concat(item.relatedManualModels || []).map(normalize);
      return normalize(item.productCode) === productCode && allowedManualModels.indexOf(manualModel) >= 0;
    }) || null;
  }

  function evaluate(product) {
    if (!product || !String(product.productCode || "").trim() || !String(product.manualModel || "").trim()) {
      return {
        status: "INCOMPLETE",
        supportScope: "unsupported",
        aiAllowed: false,
        searchAllowed: false,
        consultationRequired: true,
        message: "제품 코드와 설명서 모델을 확인할 수 없어 AI 분석을 보류하고 상담을 연결합니다.",
        registry: null
      };
    }

    var entry = registryEntry(product);
    if (!entry) {
      return {
        status: "UNSUPPORTED",
        supportScope: "unsupported",
        aiAllowed: false,
        searchAllowed: false,
        consultationRequired: true,
        message: "현재 MVP에서 지원하지 않는 제품입니다. 임의 안내 없이 상담을 연결합니다.",
        registry: null
      };
    }

    if (entry.supportStatus === "SUPPORTED") {
      return {
        status: "SUPPORTED",
        supportScope: entry.supportScope,
        aiAllowed: true,
        searchAllowed: true,
        consultationRequired: false,
        message: "기본 MVP 공식 문서 검색 범위에 포함된 제품입니다.",
        registry: entry
      };
    }

    if (entry.supportStatus === "EXPANSION") {
      return {
        status: "EXPANSION",
        supportScope: entry.supportScope,
        aiAllowed: false,
        searchAllowed: false,
        consultationRequired: true,
        message: "후속 확장 모델입니다. 기본 MVP 검색에서는 제외하고 상담을 연결합니다.",
        registry: entry
      };
    }

    return {
      status: "ARCHIVED",
      supportScope: entry.supportScope,
      aiAllowed: false,
      searchAllowed: false,
      consultationRequired: true,
      message: "신규 검색·시연·평가 사용이 중단된 보관 모델입니다. 상담을 연결합니다.",
      registry: entry
    };
  }

  function applyRegistry(product) {
    var result = evaluate(product);
    var entry = result.registry;
    if (entry) {
      product.productCode = entry.productCode;
      if (!product.manualModel) product.manualModel = entry.manualModel;
      product.productGeneration = entry.productGeneration;
      product.scopeRole = entry.scopeRole;
    }
    product.supportStatus = result.status;
    product.supportScope = result.supportScope;
    product.supportMessage = result.message;
    product.aiAllowed = result.aiAllowed;
    product.searchAllowed = result.searchAllowed;
    return result;
  }

  window.WaterCareModelPolicy = {
    normalize: normalize,
    registryEntry: registryEntry,
    evaluate: evaluate,
    applyRegistry: applyRegistry
  };
}());
