(function () {
  "use strict";

  var Config = window.WaterCareConfig || {};

  function normalize(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function isRemovedLegacy(product) {
    return [normalize(product && product.productCode), normalize(product && product.manualModel)]
      .some(function (value) { return value.indexOf("IAC506") >= 0; });
  }

  function isSGeneration(product) {
    var generation = normalize(product && product.productGeneration);
    var code = normalize(product && product.productCode);
    var manual = normalize(product && product.manualModel);
    return generation === "S" || /^WPUS/.test(code) || /^WPUS/.test(manual);
  }

  function registryEntry(product) {
    var productCode = normalize(product && product.productCode);
    var manualModel = normalize(product && product.manualModel);
    return (Config.modelRegistry || []).find(function (item) {
      var allowedManualModels = [item.manualModel].concat(item.relatedManualModels || []).map(normalize);
      return normalize(item.productCode) === productCode && allowedManualModels.indexOf(manualModel) >= 0;
    }) || null;
  }

  function result(status, errorCode, supportScope, message, entry) {
    return {
      status: status,
      errorCode: errorCode || null,
      supportScope: supportScope,
      aiAllowed: status === "SUPPORTED",
      searchAllowed: status === "SUPPORTED",
      consultationRequired: status !== "SUPPORTED",
      message: message,
      registry: entry || null
    };
  }

  function evaluate(product) {
    if (isRemovedLegacy(product)) {
      return result("REMOVED_LEGACY", "MODEL-LEGACY-01", "removed_legacy", "삭제된 레거시 모델은 등록·검색·상담 시나리오에 사용할 수 없습니다.");
    }
    if (isSGeneration(product)) {
      return result("UNSUPPORTED_GENERATION", "MODEL-GENERATION-01", "unsupported_generation", "S세대 제품은 현재 MVP 지원 범위가 아닙니다. 제품 정보를 다시 확인해주세요.");
    }
    if (!product || !String(product.productCode || "").trim() || !String(product.manualModel || "").trim()) {
      return result("INCOMPLETE", "PRODUCT-VALIDATION-01", "unsupported", "제품 코드와 설명서 모델명을 모두 확인해주세요.");
    }

    var entry = registryEntry(product);
    if (!entry) {
      return result("UNSUPPORTED", "PRODUCT-VALIDATION-01", "unsupported", "현재 MVP에서 지원하지 않는 제품입니다. 임의 안내 없이 제품 정보를 다시 확인해주세요.");
    }
    if (entry.supportStatus === "SUPPORTED") {
      return result("SUPPORTED", null, entry.supportScope, "기본 MVP 공식 문서 검색 범위에 포함된 제품입니다.", entry);
    }
    return result("EXPANSION", "MODEL-EXPANSION-01", entry.supportScope, "후속 확장 모델입니다. 고객 MVP 화면에서는 숨기며 현재 AI·RAG 검색은 실행하지 않습니다.", entry);
  }

  function applyRegistry(product) {
    var evaluation = evaluate(product);
    var entry = evaluation.registry;
    if (entry) {
      product.productCode = entry.productCode;
      if (!product.manualModel) product.manualModel = entry.manualModel;
      product.productGeneration = entry.productGeneration;
      product.scopeRole = entry.scopeRole;
    }
    // removed_legacy는 저장 전에 Store가 차단하므로 운영 데이터가 생기지 않는다.
    product.supportStatus = evaluation.status;
    product.supportScope = evaluation.supportScope;
    product.supportMessage = evaluation.message;
    product.aiAllowed = evaluation.aiAllowed;
    product.searchAllowed = evaluation.searchAllowed;
    return evaluation;
  }

  window.WaterCareModelPolicy = {
    normalize: normalize,
    registryEntry: registryEntry,
    evaluate: evaluate,
    applyRegistry: applyRegistry,
    isRemovedLegacy: isRemovedLegacy,
    isSGeneration: isSGeneration
  };
}());
