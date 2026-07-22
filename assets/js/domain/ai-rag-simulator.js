(function () {
  "use strict";

  var Config = window.WaterCareConfig || {};

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function stage(code, status, at, correlationId) {
    return { stage: code, status: status || "COMPLETED", at: at || new Date().toISOString(), correlationId: correlationId || null };
  }

  function scenarioById(state, id) {
    return (state.scenarios || []).find(function (item) { return item.id === id; }) || null;
  }

  function scenarioForInput(state, symptoms, description, displayCode) {
    var codes = Array.isArray(symptoms) ? symptoms : [];
    var text = [description, displayCode].join(" ");
    if (codes.indexOf("OTHER") >= 0) return null;
    if (String(displayCode || "").trim() && !/순간온수\s*모듈\s*점검/.test(String(displayCode))) return null;
    if (codes.indexOf("LEAK") >= 0 || /누수|물이\s*고|물기/.test(text)) return scenarioById(state, "SYN-JAC104-004");
    if (/순간온수|모듈|빨간색|점검\s*문구/.test(text)) return scenarioById(state, "SYN-JAC104-006");
    if (codes.indexOf("TASTE_ODOR") >= 0 || /냄새|물맛/.test(text)) return scenarioById(state, "SYN-JAC104-005");
    if (codes.indexOf("TEMPERATURE") >= 0 || /냉수|온수|미지근/.test(text)) return scenarioById(state, "SYN-JAC104-003");
    if (/안\s*나|무출수/.test(text)) return scenarioById(state, "SYN-JAC104-001");
    if (codes.indexOf("LOW_FLOW") >= 0 || /출수|물줄기|수압|약해/.test(text)) return scenarioById(state, "SYN-JAC104-002");
    return null;
  }

  function usageGuidance(scenario, now) {
    var timestamp = now || new Date().toISOString();
    if (!scenario) {
      return {
        usageGuidanceStatus: "PENDING_CONSULTATION",
        usageGuidanceMessage: "공식 근거를 확인할 수 없어 상담 전까지 임의 조치를 중단해주세요.",
        restrictedWaterTypes: [],
        restrictedFunctions: [],
        guidanceBasis: "현재 MVP 공식 근거 없음",
        nextAction: "제품 상태를 임의로 판단하지 말고 상담원의 확인을 받아주세요.",
        updatedAt: timestamp,
        updatedBy: "근거 충분성 규칙"
      };
    }
    if (scenario.id === "SYN-JAC104-004") {
      return {
        usageGuidanceStatus: "TOTAL_STOP",
        usageGuidanceMessage: "전체 출수를 중지하고 누수 안전조치를 유지해주세요.",
        restrictedWaterTypes: ["정수", "냉수", "온수"],
        restrictedFunctions: ["전체 출수"],
        guidanceBasis: "공식 매뉴얼 누수 안전 항목",
        nextAction: "원수 밸브를 잠그고 안전하게 가능한 경우 전원을 분리한 뒤 상담을 요청하세요.",
        updatedAt: timestamp,
        updatedBy: "안전 규칙"
      };
    }
    if (scenario.id === "SYN-JAC104-006") {
      return {
        usageGuidanceStatus: "PARTIAL_STOP",
        usageGuidanceMessage: "온수 기능 사용과 출수된 물의 음용을 중지해주세요.",
        restrictedWaterTypes: ["온수"],
        restrictedFunctions: ["순간온수", "온수 출수"],
        guidanceBasis: "공식 매뉴얼 순간온수 모듈 안전 항목",
        nextAction: "온수와 표시된 이상 기능 사용을 중지하고 출수된 물을 음용하지 않은 채 상담을 요청하세요.",
        updatedAt: timestamp,
        updatedBy: "안전 규칙"
      };
    }
    return {
      usageGuidanceStatus: scenario.riskLevel === "CAUTION" ? "PENDING_CONSULTATION" : "NORMAL",
      usageGuidanceMessage: scenario.riskLevel === "CAUTION" ? "안내된 확인 후 증상이 계속되면 상담을 요청해주세요." : "공식 점검 순서에 따라 안전하게 확인할 수 있습니다.",
      restrictedWaterTypes: [],
      restrictedFunctions: [],
      guidanceBasis: scenario.riskLevel === "CAUTION" ? "공식 근거 확인 후 상담 조건 판단" : "공식 매뉴얼 점검 항목",
      nextAction: scenario.riskLevel === "CAUTION" ? "안내된 확인 후 증상이 지속되면 상담하세요." : "공식 점검 순서를 따라 확인하세요.",
      updatedAt: timestamp,
      updatedBy: "공식 근거 규칙"
    };
  }

  function verifiedEvidence(state, scenario, product) {
    if (!scenario) return [];
    return (state.evidenceRegistry || []).filter(function (item) {
      return scenario.evidenceIds.indexOf(item.evidenceId) >= 0 &&
        item.productCode === product.productCode &&
        item.manualModel === product.manualModel &&
        item.productGeneration === product.productGeneration &&
        item.modelFamily === "WPU-JAC104" &&
        item.scopeRole === "mvp_primary" &&
        item.applicability === "model_exact" &&
        ["mvp_primary", "mvp_primary_safety"].indexOf(item.allowedUse) >= 0 &&
        item.dataClassification === "official" &&
        item.verificationStatus === (Config.verifiedEvidenceStatus || "text_and_visual_verified");
    });
  }

  function missingFields(inquiry, scenario) {
    var missing = [];
    var answers = inquiry.answers || {};
    var answeredKeys = Object.keys(answers).filter(function (key) { return String(answers[key] || "").trim(); });
    var hasConditionAnswer = answeredKeys.some(function (key) { return /발생.*조건/.test(key); });
    var hasHoseAnswer = Boolean(answers.hoseChecked) || answeredKeys.some(function (key) { return /호스/.test(key); });
    if (!String(inquiry.conditions || "").trim() && !hasConditionAnswer) missing.push("증상이 발생하는 조건을 알려주세요.");
    if (scenario && scenario.id === "SYN-JAC104-001" && !hasHoseAnswer) {
      missing.push("연결 호스가 꺾였는지 확인했나요?");
    }
    return missing;
  }

  function summary(inquiry, scenario, evidence) {
    var symptom = scenario ? scenario.label : "공식 근거가 확인되지 않은 증상";
    var condition = inquiry.conditions || "발생 조건 미입력";
    var basis = evidence.length ? evidence.map(function (item) { return item.documentVersion + " " + item.pageRefs.join(",") + "쪽"; }).join(" · ") : "공식 근거 없음";
    return symptom + " 문의입니다. 고객 원문은 ‘" + (inquiry.description || "입력 없음") + "’이며, 발생 조건은 ‘" + condition + "’입니다. 근거: " + basis + ".";
  }

  function run(state, inquiry, product, options) {
    options = options || {};
    var at = options.now || new Date().toISOString();
    var correlationId = options.correlationId || null;
    if (Number(inquiry.simulationFailuresRemaining || 0) > 0) {
      inquiry.simulationFailuresRemaining = Number(inquiry.simulationFailuresRemaining) - 1;
      var simulatedError = new Error("시연용 RERANKING 단계 실패");
      simulatedError.code = "AI-FAILED-01";
      simulatedError.failedStage = "RERANKING";
      throw simulatedError;
    }
    var trace = [stage("STRUCTURING", "COMPLETED", at, correlationId), stage("CHECKING_MISSING_FIELDS", "COMPLETED", at, correlationId)];
    var scenario = scenarioForInput(state, inquiry.symptomCodes, inquiry.description, inquiry.displayCode);
    var missing = missingFields(inquiry, scenario);

    trace.push(stage("SAFETY_CHECK", "COMPLETED", at, correlationId));
    var evidence = verifiedEvidence(state, scenario, product);
    var guidance = usageGuidance(scenario, at);

    if (scenario && scenario.riskLevel === "DANGER") {
      trace.push(stage("RETRIEVING", "COMPLETED", at, correlationId));
      if (!evidence.length) {
        guidance.guidanceBasis = "안전 규칙 적용 · 공식 근거 연결 실패";
        guidance.nextAction = "위험 기능 사용을 중지하고 상담사의 확인을 기다려주세요.";
        trace.push(stage("RERANKING", "BLOCKED_NO_EVIDENCE", at, correlationId));
        trace.push(stage("COMPLETED", "NO_EVIDENCE", at, correlationId));
        return {
          aiState: "COMPLETED",
          outcomeEvent: "NO_EVIDENCE",
          scenario: clone(scenario),
          evidenceIds: [],
          missingFields: missing,
          usageGuidance: guidance,
          trace: trace,
          aiSummaryOriginal: summary(inquiry, scenario, []),
          retrieval: { mode: "DETERMINISTIC_PROTOTYPE", resultCount: 0, verified: false }
        };
      }
      trace.push(stage("RERANKING", "COMPLETED", at, correlationId));
      trace.push(stage("GENERATING", "COMPLETED", at, correlationId));
      trace.push(stage("VALIDATING", "COMPLETED", at, correlationId));
      trace.push(stage("COMPLETED", "COMPLETED", at, correlationId));
      return {
        aiState: "COMPLETED",
        outcomeEvent: "DANGER_DETECTED",
        scenario: clone(scenario),
        evidenceIds: evidence.map(function (item) { return item.evidenceId; }),
        missingFields: missing,
        usageGuidance: guidance,
        trace: trace,
        aiSummaryOriginal: summary(inquiry, scenario, evidence),
        retrieval: { mode: "DETERMINISTIC_PROTOTYPE", resultCount: evidence.length, verified: evidence.length > 0 }
      };
    }

    if (missing.length) {
      trace.push(stage("COMPLETED", "WAITING_FOR_INPUT", at, correlationId));
      return {
        aiState: "COMPLETED",
        outcomeEvent: "ADDITIONAL_INFORMATION_REQUIRED",
        scenario: scenario ? clone(scenario) : null,
        evidenceIds: evidence.map(function (item) { return item.evidenceId; }),
        missingFields: missing,
        usageGuidance: guidance,
        trace: trace,
        aiSummaryOriginal: summary(inquiry, scenario, evidence),
        retrieval: { mode: "DETERMINISTIC_PROTOTYPE", resultCount: evidence.length, verified: evidence.length > 0 }
      };
    }

    trace.push(stage("RETRIEVING", "COMPLETED", at, correlationId));
    if (!scenario || !evidence.length) {
      trace.push(stage("COMPLETED", "NO_EVIDENCE", at, correlationId));
      return {
        aiState: "COMPLETED",
        outcomeEvent: "NO_EVIDENCE",
        scenario: scenario ? clone(scenario) : null,
        evidenceIds: [],
        missingFields: [],
        usageGuidance: guidance,
        trace: trace,
        aiSummaryOriginal: summary(inquiry, scenario, []),
        retrieval: { mode: "DETERMINISTIC_PROTOTYPE", resultCount: 0, verified: false }
      };
    }

    trace.push(stage("RERANKING", "COMPLETED", at, correlationId));
    trace.push(stage("GENERATING", "COMPLETED", at, correlationId));
    trace.push(stage("VALIDATING", "COMPLETED", at, correlationId));
    trace.push(stage("COMPLETED", "COMPLETED", at, correlationId));
    return {
      aiState: "COMPLETED",
      outcomeEvent: "SAFE_GUIDANCE_READY",
      scenario: clone(scenario),
      evidenceIds: evidence.map(function (item) { return item.evidenceId; }),
      missingFields: [],
      usageGuidance: guidance,
      trace: trace,
      aiSummaryOriginal: summary(inquiry, scenario, evidence),
      retrieval: { mode: "DETERMINISTIC_PROTOTYPE", resultCount: evidence.length, verified: true }
    };
  }

  window.WaterCareAIRAGSimulator = {
    mode: "DETERMINISTIC_PROTOTYPE",
    scenarioForInput: scenarioForInput,
    usageGuidance: usageGuidance,
    run: run
  };
}());
