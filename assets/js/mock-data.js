(function () {
  "use strict";

  window.WATERCARE_SEED = {
    meta: {
      schemaVersion: 11,
      seededAt: "2026-07-16T09:00:00+09:00",
      label: "워터케어 ONE 시연 데이터",
      disclaimer: "고객·계약·제품 소유 관계·사용량·일정·문서 정보는 시연용 가상 데이터입니다."
    },
    customers: [
      { id: "CUS-001", customerType: "INDIVIDUAL", name: "김하늘", contactName: "김하늘", phone: "010-****-1842", initials: "김", segment: "케어 플러스", productId: "PROD-001", questionnaire: { status: "READY", dueAt: "2026-07-19", submittedAt: null } },
      { id: "CUS-002", customerType: "BUSINESS", name: "그린웨이브 스튜디오", contactName: "박지민", phone: "010-****-6031", initials: "그", segment: "기업 안심 케어", productId: "PROD-002", organization: { legalName: "그린웨이브 스튜디오 (가상)", businessNumber: "120-**-****", siteName: "마포 오피스", siteType: "사무실", contactRole: "총무 담당", serviceWindow: "평일 10:00–16:00", accessNote: "방문 30분 전 담당자 연락", contractTier: "Business Plus" }, questionnaire: { status: "SUBMITTED", dueAt: "2026-07-15", submittedAt: "2026-07-15T18:06:00+09:00" } },
      { id: "CUS-003", customerType: "INDIVIDUAL", name: "이서준", contactName: "이서준", phone: "010-****-7720", initials: "이", segment: "케어 플러스", productId: "PROD-003", questionnaire: { status: "SUBMITTED", dueAt: "2026-07-12", submittedAt: "2026-07-12T10:21:00+09:00" } },
      { id: "CUS-004", customerType: "INDIVIDUAL", name: "최유나", contactName: "최유나", phone: "010-****-4598", initials: "최", segment: "셀프 케어", productId: "PROD-004", questionnaire: { status: "NOT_DUE", dueAt: "2026-08-02", submittedAt: null } },
      { id: "CUS-005", customerType: "BUSINESS", name: "한빛 세무회계", contactName: "정민호", phone: "010-****-2914", initials: "한", segment: "기업 방문관리", productId: "PROD-005", organization: { legalName: "한빛 세무회계 (가상)", businessNumber: "214-**-****", siteName: "서초 본사", siteType: "사무실", contactRole: "오피스 매니저", serviceWindow: "평일 09:30–17:00", accessNote: "안내 데스크에서 방문증 수령", contractTier: "Business Standard" }, questionnaire: { status: "READY", dueAt: "2026-07-18", submittedAt: null } }
    ],
    organizations: [
      { id: "ORG-001", customerId: "CUS-002", name: "그린웨이브 스튜디오 (가상)", businessNumber: "120-**-****", contractTier: "Business Plus", status: "ACTIVE" },
      { id: "ORG-002", customerId: "CUS-005", name: "한빛 세무회계 (가상)", businessNumber: "214-**-****", contractTier: "Business Standard", status: "ACTIVE" }
    ],
    sites: [
      { id: "SITE-001", organizationId: "ORG-001", name: "마포 오피스", siteType: "사무실", area: "서울 마포구 (가상)", serviceWindow: "평일 10:00–16:00", accessNote: "방문 30분 전 담당자 연락", status: "ACTIVE" },
      { id: "SITE-002", organizationId: "ORG-002", name: "서초 본사", siteType: "사무실", area: "서울 서초구 (가상)", serviceWindow: "평일 09:30–17:00", accessNote: "안내 데스크에서 방문증 수령", status: "ACTIVE" }
    ],
    contacts: [
      { id: "CON-001", organizationId: "ORG-001", siteId: "SITE-001", name: "박지민", phone: "010-****-6031", role: "총무 담당", isPrimary: true, signatureAuthority: true },
      { id: "CON-002", organizationId: "ORG-002", siteId: "SITE-002", name: "정민호", phone: "010-****-2914", role: "오피스 매니저", isPrimary: true, signatureAuthority: true }
    ],
    productModels: [
      {
        id: "MODEL-SKM-JAC115DNW",
        manufacturer: "SK매직",
        name: "초소형 플러스 직수 정수기",
        modelCode: "WPUJAC115DNW",
        capabilities: { waterDispense: true, hotWater: true, ice: false },
        imagePath: "assets/images/products/wpu-jac115dnw.png",
        imageAlt: "SK매직 초소형 플러스 직수 정수기 내추럴 화이트",
        officialProductUrl: "https://www.skmagic.com/goods/indexGoodsDetail?goodsId=G000069985",
        manualChannelUrl: "https://www.youtube.com/@SKmagic__/videos",
        manuals: [
          { id: "MANUAL-YT-T457FY7RPIC", kind: "기능 설정", title: "[Magic Manual] 초소형 플러스 직수정수기 기능 설정 방법", videoId: "t457fy7RPic", watchUrl: "https://www.youtube.com/watch?v=t457fy7RPic", thumbnailPath: "assets/images/manuals/t457fy7rpic.jpg", source: "SK매직 매직매뉴얼" },
          { id: "MANUAL-YT-A6X6AJSLQVG", kind: "필터·청소", title: "[Magic Manual] 초소형 플러스 직수정수기 필터 교체 및 청소 방법", videoId: "a6X6AJSlQvg", watchUrl: "https://www.youtube.com/watch?v=a6X6AJSlQvg", thumbnailPath: "assets/images/manuals/a6x6ajslqvg.jpg", source: "SK매직 매직매뉴얼" }
        ]
      },
      {
        id: "MODEL-SKM-IAC425SNW",
        manufacturer: "SK매직",
        name: "원코크 플러스 얼음물 정수기",
        modelCode: "WPUIAC425SNW",
        capabilities: { waterDispense: true, hotWater: true, ice: true },
        imagePath: "assets/images/products/wpu-iac425snw.png",
        imageAlt: "SK매직 원코크 플러스 얼음물 정수기 내추럴 화이트",
        officialProductUrl: "https://www.skmagic.com/goods/indexGoodsDetail?goodsId=G000069282",
        manualChannelUrl: "https://www.youtube.com/@SKmagic__/videos",
        manuals: [
          { id: "MANUAL-YT-NH3MACWOQDQ", kind: "기능 설정", title: "[Magic Manual] 원코크 플러스 얼음물 정수기 기능 설정 방법", videoId: "nh3macwOqdQ", watchUrl: "https://www.youtube.com/watch?v=nh3macwOqdQ", thumbnailPath: "assets/images/manuals/nh3macwoqdq.jpg", source: "SK매직 매직매뉴얼" },
          { id: "MANUAL-YT-JVVJKOXJ-OC", kind: "필터·청소", title: "[Magic Manual] 원코크 플러스 얼음물 정수기 필터 교체 및 청소 방법", videoId: "JvVJKoXJ_Oc", watchUrl: "https://www.youtube.com/watch?v=JvVJKoXJ_Oc", thumbnailPath: "assets/images/manuals/jvvjkoxj_oc.jpg", source: "SK매직 매직매뉴얼" }
        ]
      }
    ],
    usagePeriods: {
      hourly: { label: "시간별", title: "오늘 시간별 사용량", period: "2026년 7월 16일", note: "00:00–23:00 · 1시간 단위", labels: ["00시", "01시", "02시", "03시", "04시", "05시", "06시", "07시", "08시", "09시", "10시", "11시", "12시", "13시", "14시", "15시", "16시", "17시", "18시", "19시", "20시", "21시", "22시", "23시"] },
      weekly: { label: "주간", title: "최근 7일 사용량", period: "2026년 7월 10일–16일", note: "일별 합계 · 최근 7일", labels: ["7/10 금", "7/11 토", "7/12 일", "7/13 월", "7/14 화", "7/15 수", "7/16 목"] },
      monthly: { label: "월간", title: "최근 6개월 사용량", period: "2026년 2월–7월", note: "월별 합계 · 7월은 16일까지", labels: ["2월", "3월", "4월", "5월", "6월", "7월*"] }
    },
    usageTelemetry: [
      {
        productId: "PROD-001", updatedAt: "2026-07-16T23:00:00+09:00", source: "DEMO_IOT", completeness: 100,
        series: {
          hourly: { water: [0.1, 0, 0, 0, 0, 0.1, 0.5, 0.9, 0.6, 0.3, 0.4, 0.5, 0.8, 0.5, 0.3, 0.4, 0.5, 0.6, 1.0, 1.2, 0.7, 0.4, 0.3, 0.2], ice: [0, 0, 0, 0, 0, 0, 0.05, 0.12, 0.08, 0.03, 0.04, 0.06, 0.12, 0.08, 0.03, 0.05, 0.06, 0.09, 0.14, 0.18, 0.11, 0.06, 0.03, 0.01] },
          weekly: { water: [7.1, 8.3, 7.8, 8.0, 7.5, 8.4, 10.3], ice: [1.0, 1.3, 1.2, 1.1, 1.0, 1.4, 1.34] },
          monthly: { water: [218, 225, 231, 239, 244, 128], ice: [28, 31, 34, 35, 38, 20] }
        }
      },
      {
        productId: "PROD-002", updatedAt: "2026-07-16T23:00:00+09:00", source: "DEMO_IOT", completeness: 99,
        series: {
          hourly: { water: [0, 0, 0, 0, 0, 0.1, 0.2, 1.5, 5.2, 8.4, 9.6, 10.8, 12.3, 11.5, 9.7, 8.8, 7.4, 5.6, 3.2, 1.8, 0.8, 0.3, 0.1, 0], ice: [0, 0, 0, 0, 0, 0, 0.1, 0.3, 0.6, 0.8, 0.9, 1.0, 1.2, 1.1, 0.9, 0.8, 0.7, 0.5, 0.3, 0.2, 0.1, 0, 0, 0] },
          weekly: { water: [92, 31, 24, 105, 112, 108, 97.3], ice: [8.2, 2.6, 1.9, 9.4, 10.1, 9.7, 9.5] },
          monthly: { water: [1920, 2014, 2088, 2156, 2230, 1162], ice: [168, 180, 190, 196, 205, 111] }
        }
      },
      {
        productId: "PROD-006", updatedAt: "2026-07-16T23:00:00+09:00", source: "DEMO_IOT", completeness: 100,
        series: {
          hourly: { water: [0, 0, 0, 0, 0, 0, 0.1, 0.8, 3.2, 5.1, 6.0, 6.8, 7.4, 6.9, 5.8, 5.2, 4.6, 3.8, 2.1, 1.0, 0.4, 0.2, 0, 0], ice: null },
          weekly: { water: [58, 17, 12, 64, 66, 63, 59.4], ice: null },
          monthly: { water: [1130, 1205, 1280, 1322, 1368, 702], ice: null }
        }
      },
      {
        productId: "PROD-003", updatedAt: "2026-07-16T23:00:00+09:00", source: "DEMO_IOT", completeness: 98,
        series: {
          hourly: { water: [0.1, 0, 0, 0, 0, 0.1, 0.4, 0.8, 0.5, 0.2, 0.3, 0.4, 0.7, 0.4, 0.2, 0.3, 0.4, 0.5, 0.8, 1.0, 0.6, 0.3, 0.2, 0.1], ice: null },
          weekly: { water: [6.2, 7.4, 6.8, 7.1, 6.6, 7.6, 8.3], ice: null },
          monthly: { water: [190, 198, 205, 212, 219, 114], ice: null }
        }
      },
      {
        productId: "PROD-004", updatedAt: "2026-07-16T23:00:00+09:00", source: "DEMO_IOT", completeness: 100,
        series: {
          hourly: { water: [0, 0, 0, 0, 0, 0.1, 0.3, 0.7, 0.4, 0.2, 0.3, 0.4, 0.6, 0.3, 0.2, 0.3, 0.3, 0.4, 0.7, 0.9, 0.5, 0.3, 0.2, 0.1], ice: null },
          weekly: { water: [5.4, 6.1, 5.9, 6.4, 6.0, 6.7, 7.2], ice: null },
          monthly: { water: [166, 171, 178, 184, 190, 98], ice: null }
        }
      },
      {
        productId: "PROD-005", updatedAt: "2026-07-16T23:00:00+09:00", source: "DEMO_IOT", completeness: 99,
        series: {
          hourly: { water: [0, 0, 0, 0, 0, 0, 0.1, 1.0, 4.0, 6.0, 7.0, 8.0, 9.0, 8.0, 7.0, 6.0, 5.0, 4.0, 2.0, 1.0, 0.4, 0.2, 0, 0], ice: [0, 0, 0, 0, 0, 0, 0.05, 0.15, 0.4, 0.55, 0.65, 0.75, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.2, 0.1, 0.05, 0, 0, 0] },
          weekly: { water: [68, 19, 14, 77, 81, 79, 68.7], ice: [5.9, 1.5, 1.1, 6.7, 7.2, 6.9, 6.5] },
          monthly: { water: [1380, 1455, 1490, 1542, 1608, 820], ice: [116, 124, 130, 136, 142, 74] }
        }
      }
    ],
    smartPreparationMeta: {
      timezone: "Asia/Seoul",
      source: "DEMO_PATTERN_ENGINE",
      modelVersion: "DEMO-PATTERN-V1",
      analysisWindowDays: 28,
      consentVersion: "SMART_PREPARATION_V1",
      resources: {
        HOT_WATER: { label: "온수", capability: "hotWater", unit: "L" },
        ICE: { label: "얼음", capability: "ice", unit: "kg" }
      }
    },
    smartPreparationProfiles: [
      {
        productId: "PROD-001", mode: "AUTO",
        consent: { usageAnalysis: "GRANTED", autoPreparation: "GRANTED", decidedAt: "2026-06-04T08:12:00+09:00", actor: "김하늘" },
        learning: {
          status: "READY", sampleDays: 28, lastAnalyzedAt: "2026-07-16T23:05:00+09:00",
          patterns: [
            { id: "PAT-001-HOT", resource: "HOT_WATER", days: ["MON", "TUE", "WED", "THU", "FRI"], daysLabel: "평일", startHour: 6, endHour: 8, peakAt: "07:00", observedDays: 18, eligibleDays: 20, confidence: 0.90, expectedAmount: 0.8, unit: "L", readyAt: "07:00", leadMinutes: 10 },
            { id: "PAT-001-ICE", resource: "ICE", days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"], daysLabel: "매일", startHour: 18, endHour: 20, peakAt: "19:00", observedDays: 22, eligibleDays: 28, confidence: 0.86, expectedAmount: 0.35, unit: "kg", readyAt: "19:00", leadMinutes: 20 }
          ]
        },
        manualSchedules: []
      },
      {
        productId: "PROD-002", mode: "AUTO",
        consent: { usageAnalysis: "GRANTED", autoPreparation: "GRANTED", decidedAt: "2026-05-20T10:15:00+09:00", actor: "박지민" },
        learning: {
          status: "READY", sampleDays: 28, lastAnalyzedAt: "2026-07-16T23:05:00+09:00",
          patterns: [
            { id: "PAT-002-HOT", resource: "HOT_WATER", days: ["MON", "TUE", "WED", "THU", "FRI"], daysLabel: "평일", startHour: 8, endHour: 10, peakAt: "09:00", observedDays: 19, eligibleDays: 20, confidence: 0.95, expectedAmount: 4.5, unit: "L", readyAt: "09:00", leadMinutes: 15 },
            { id: "PAT-002-ICE", resource: "ICE", days: ["MON", "TUE", "WED", "THU", "FRI"], daysLabel: "평일", startHour: 11, endHour: 13, peakAt: "12:00", observedDays: 18, eligibleDays: 20, confidence: 0.90, expectedAmount: 2.2, unit: "kg", readyAt: "12:00", leadMinutes: 20 }
          ]
        },
        manualSchedules: []
      },
      {
        productId: "PROD-006", mode: "MANUAL",
        consent: { usageAnalysis: "GRANTED", autoPreparation: "DECLINED", decidedAt: "2026-06-18T14:20:00+09:00", actor: "박지민" },
        learning: {
          status: "READY", sampleDays: 28, lastAnalyzedAt: "2026-07-16T23:05:00+09:00",
          patterns: [
            { id: "PAT-006-HOT", resource: "HOT_WATER", days: ["MON", "TUE", "WED", "THU", "FRI"], daysLabel: "평일", startHour: 8, endHour: 10, peakAt: "09:00", observedDays: 17, eligibleDays: 20, confidence: 0.85, expectedAmount: 3.0, unit: "L", readyAt: "09:00", leadMinutes: 15 }
          ]
        },
        manualSchedules: [
          { id: "SCH-006-HOT", resource: "HOT_WATER", days: ["MON", "TUE", "WED", "THU", "FRI"], daysLabel: "평일", readyAt: "08:50", leadMinutes: 15, enabled: true, createdAt: "2026-06-18T14:22:00+09:00" }
        ]
      },
      {
        productId: "PROD-003", mode: "MANUAL",
        consent: { usageAnalysis: "NOT_ASKED", autoPreparation: "NOT_ASKED", decidedAt: null, actor: null },
        learning: { status: "PAUSED_CONSENT", sampleDays: 0, lastAnalyzedAt: null, patterns: [] },
        manualSchedules: [
          { id: "SCH-003-HOT", resource: "HOT_WATER", days: ["SAT", "SUN"], daysLabel: "주말", readyAt: "09:30", leadMinutes: 10, enabled: true, createdAt: "2026-07-12T09:10:00+09:00" }
        ]
      },
      {
        productId: "PROD-004", mode: "AUTO",
        consent: { usageAnalysis: "GRANTED", autoPreparation: "GRANTED", decidedAt: "2026-06-11T07:42:00+09:00", actor: "최유나" },
        learning: {
          status: "READY", sampleDays: 28, lastAnalyzedAt: "2026-07-16T23:05:00+09:00",
          patterns: [
            { id: "PAT-004-HOT", resource: "HOT_WATER", days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"], daysLabel: "매일", startHour: 6, endHour: 8, peakAt: "07:00", observedDays: 24, eligibleDays: 28, confidence: 0.86, expectedAmount: 0.7, unit: "L", readyAt: "07:00", leadMinutes: 10 }
          ]
        },
        manualSchedules: []
      },
      {
        productId: "PROD-005", mode: "AUTO",
        consent: { usageAnalysis: "GRANTED", autoPreparation: "GRANTED", decidedAt: "2026-05-08T11:30:00+09:00", actor: "정민호" },
        learning: {
          status: "READY", sampleDays: 28, lastAnalyzedAt: "2026-07-16T23:05:00+09:00",
          patterns: [
            { id: "PAT-005-HOT", resource: "HOT_WATER", days: ["MON", "TUE", "WED", "THU", "FRI"], daysLabel: "평일", startHour: 8, endHour: 10, peakAt: "09:00", observedDays: 19, eligibleDays: 20, confidence: 0.95, expectedAmount: 3.8, unit: "L", readyAt: "09:00", leadMinutes: 20 },
            { id: "PAT-005-ICE", resource: "ICE", days: ["MON", "TUE", "WED", "THU", "FRI"], daysLabel: "평일", startHour: 11, endHour: 13, peakAt: "12:00", observedDays: 18, eligibleDays: 20, confidence: 0.90, expectedAmount: 1.8, unit: "kg", readyAt: "12:00", leadMinutes: 25 }
          ]
        },
        manualSchedules: []
      }
    ],
    products: [
      { id: "PROD-001", customerId: "CUS-001", modelId: "MODEL-SKM-IAC425SNW", model: "WPUIAC425SNW", modelLabel: "원코크 플러스 얼음물 정수기", serial: "DEMO-WPUIAC425-0184", startedAt: "2025-11-03", managementType: "방문관리형", status: "ACTIVE", installedArea: "주방", lastCareAt: "2026-03-18", nextCareAt: "2026-07-22", cycleMonths: 4, careState: "DUE_SOON", filterLife: 18, filterLabel: "복합 필터", careHistory: [
        { id: "CARE-011", date: "2026-03-18", type: "정기 방문 케어", performer: "가상 기사 · 오세훈", result: "필터 교체·유로 살균 완료" },
        { id: "CARE-006", date: "2025-11-03", type: "설치 케어", performer: "가상 기사 · 강나래", result: "설치·초기 점검 완료" }
      ] },
      { id: "PROD-002", customerId: "CUS-002", siteId: "SITE-001", assetTag: "GW-MAPO-01", modelId: "MODEL-SKM-IAC425SNW", model: "WPUIAC425SNW", modelLabel: "원코크 플러스 얼음물 정수기", serial: "DEMO-WPUIAC425-0261", startedAt: "2025-08-14", managementType: "방문관리형", status: "SAFETY_HOLD", installedArea: "1층 다이닝룸", lastCareAt: "2026-04-02", nextCareAt: "2026-08-02", cycleMonths: 4, careState: "NORMAL", filterLife: 42, filterLabel: "복합 필터", careHistory: [
        { id: "CARE-015", date: "2026-04-02", type: "정기 방문 케어", performer: "가상 기사 · 오세훈", result: "필터 교체·내부 세척 완료" },
        { id: "CARE-004", date: "2025-12-03", type: "정기 방문 케어", performer: "가상 기사 · 이도윤", result: "상태 양호" }
      ] },
      { id: "PROD-006", customerId: "CUS-002", siteId: "SITE-001", modelId: "MODEL-SKM-JAC115DNW", model: "WPUJAC115DNW", modelLabel: "초소형 플러스 직수 정수기", serial: "DEMO-WPUJAC115-0442", startedAt: "2026-02-10", managementType: "방문관리형", status: "ACTIVE", installedArea: "2층 라운지", siteName: "마포 오피스", assetTag: "GW-MAPO-02", lastCareAt: "2026-06-10", nextCareAt: "2026-10-10", cycleMonths: 4, careState: "NORMAL", filterLife: 72, filterLabel: "카트리지 세트", careHistory: [
        { id: "CARE-023", date: "2026-06-10", type: "기업 정기 케어", performer: "가상 기사 · 이도윤", result: "카트리지 점검·살균 완료" },
        { id: "CARE-020", date: "2026-02-10", type: "기업 설치", performer: "가상 기사 · 오세훈", result: "설치·초기 점검·인수 확인" }
      ] },
      { id: "PROD-003", customerId: "CUS-003", modelId: "MODEL-SKM-JAC115DNW", model: "WPUJAC115DNW", modelLabel: "초소형 플러스 직수 정수기", serial: "DEMO-WPUJAC115-1108", startedAt: "2025-05-21", managementType: "셀프관리형", status: "ACTIVE", installedArea: "주방", lastCareAt: "2026-07-16", nextCareAt: "2026-11-16", cycleMonths: 4, careState: "UPDATED", filterLife: 100, filterLabel: "카트리지 세트", careHistory: [
        { id: "CARE-021", date: "2026-07-16", type: "A/S 연계 케어", performer: "가상 기사 · 오세훈", result: "온도 센서 점검·카트리지 교체" },
        { id: "CARE-009", date: "2026-03-16", type: "셀프 케어", performer: "고객", result: "카트리지 교체 등록" }
      ] },
      { id: "PROD-004", customerId: "CUS-004", modelId: "MODEL-SKM-JAC115DNW", model: "WPUJAC115DNW", modelLabel: "초소형 플러스 직수 정수기", serial: "DEMO-WPUJAC115-0317", startedAt: "2026-01-09", managementType: "셀프관리형", status: "ACTIVE", installedArea: "주방", lastCareAt: "2026-04-09", nextCareAt: "2026-08-09", cycleMonths: 4, careState: "NORMAL", filterLife: 55, filterLabel: "카트리지 세트", careHistory: [
        { id: "CARE-019", date: "2026-04-09", type: "셀프 케어", performer: "고객", result: "카트리지 교체 등록" },
        { id: "CARE-002", date: "2026-01-09", type: "설치 케어", performer: "가상 기사 · 강나래", result: "설치·초기 점검 완료" }
      ] },
      { id: "PROD-005", customerId: "CUS-005", siteId: "SITE-002", assetTag: "HB-SEOCHO-01", modelId: "MODEL-SKM-IAC425SNW", model: "WPUIAC425SNW", modelLabel: "원코크 플러스 얼음물 정수기", serial: "DEMO-WPUIAC425-0912", startedAt: "2025-04-28", managementType: "방문관리형", status: "ACTIVE", installedArea: "고객 라운지", lastCareAt: "2026-03-20", nextCareAt: "2026-07-20", cycleMonths: 4, careState: "DUE_SOON", filterLife: 11, filterLabel: "복합 필터", careHistory: [
        { id: "CARE-014", date: "2026-03-20", type: "정기 방문 케어", performer: "가상 기사 · 이도윤", result: "필터 교체·코크 살균 완료" },
        { id: "CARE-005", date: "2025-11-20", type: "정기 방문 케어", performer: "가상 기사 · 오세훈", result: "상태 양호" }
      ] }
    ],
    staff: [
      { id: "STF-001", name: "한유진", role: "COUNSELOR", team: "고객케어 1팀", initials: "한", active: true },
      { id: "STF-002", name: "오세훈", role: "ENGINEER", team: "서부 방문케어팀", initials: "오", active: true },
      { id: "STF-003", name: "이도윤", role: "ENGINEER", team: "동부 방문케어팀", initials: "이", active: true },
      { id: "STF-004", name: "장민서", role: "OPERATOR", team: "서비스 운영팀", initials: "장", active: true }
    ],
    inquiries: [
      {
        id: "INQ-260716-001", customerId: "CUS-001", productId: "PROD-001", createdAt: "2026-07-16T08:42:00+09:00", updatedAt: "2026-07-16T09:18:00+09:00",
        status: "WAITING_COUNSEL", risk: "CAUTION", priority: "HIGH", symptomTypes: ["LOW_FLOW", "TASTE_ODOR"],
        title: "출수량이 줄고 물맛이 달라졌어요", description: "3일 전부터 냉수와 정수가 평소보다 약하게 나오고 물맛도 조금 텁텁하게 느껴져요.",
        structured: { started: "3일 전", targetWater: "냉수·정수", condition: "시간대와 무관하게 지속", errorCode: "표시 없음", companion: "누수·소음 없음", recentNonUse: "해당 없음", lastCare: "2026-03-18" },
        aiSummary: "냉수·정수 출수량 저하와 주관적 물맛 변화가 함께 접수되었습니다. 누수·오류 표시는 없으며 최근 필터 잔여 수명이 낮아 관리 이력 확인이 우선 필요합니다.",
        candidates: ["원수 공급 밸브 개방 상태 확인 필요", "필터 교체 주기 도래 여부 확인 필요", "장기간 미사용 여부 재확인"],
        evidence: [{ document: "원코크 플러스 얼음물 정수기 사용설명서 (시연 메타데이터)", page: "24쪽", section: "출수량이 적을 때 확인사항", confidence: 0.93 }],
        selfActions: ["제품 뒤쪽 원수 공급 밸브가 완전히 열려 있는지 눈으로 확인해 주세요.", "약 30초간 정수를 출수한 뒤 양이 회복되는지 확인해 주세요."],
        actionResult: "SAME", counselor: { id: "STF-001", note: "", decision: null }, visit: null,
        aiTrace: ["증상 구조화 완료", "안전 규칙 검사 통과", "공식 근거 1건 연결", "상담 인계 요약 생성"],
        timeline: [
          { at: "2026-07-16T08:42:00+09:00", actor: "고객 · 김하늘", type: "RECEIVED", label: "증상 문의를 접수했습니다.", detail: "자연어 증상과 대표 증상 2개 저장" },
          { at: "2026-07-16T08:45:00+09:00", actor: "AI 문진", type: "ADDITIONAL_QUESTIONS", label: "추가 질문 답변을 반영했습니다.", detail: "발생 시점·출수 종류·동반 증상 확인" },
          { at: "2026-07-16T08:51:00+09:00", actor: "고객 · 김하늘", type: "ACTION_RESULT", label: "자가조치 후에도 증상이 동일합니다.", detail: "조치 결과: 동일" },
          { at: "2026-07-16T09:18:00+09:00", actor: "고객 · 김하늘", type: "WAITING_COUNSEL", label: "상담 연결을 요청했습니다.", detail: "고객 입력과 AI 요약을 상담 큐로 전달" }
        ]
      },
      {
        id: "INQ-260715-014", customerId: "CUS-002", productId: "PROD-002", createdAt: "2026-07-15T17:54:00+09:00", updatedAt: "2026-07-16T08:20:00+09:00",
        status: "VISIT_SCHEDULED", risk: "DANGER", priority: "URGENT", symptomTypes: ["LEAK"],
        title: "제품 아래쪽으로 물이 고여요", description: "저녁부터 제품 아래 바닥에 물이 조금씩 고이고 전원선 근처도 축축해 보여요.",
        structured: { started: "어제 저녁", targetWater: "해당 없음", condition: "사용하지 않아도 물기 발생", errorCode: "표시 없음", companion: "전원선 인접 바닥 물기", recentNonUse: "해당 없음", lastCare: "2026-04-02" },
        aiSummary: "제품 하부 누수와 전원선 인접 물기가 함께 보고되어 안전 규칙에 따라 위험 단계로 분류했습니다. 고객에게 사용 중지·전원부 접촉 금지 안내 후 우선 방문으로 전환했습니다.",
        candidates: ["제품 하부 누수 위치 현장 확인", "급수 연결부 상태 확인", "전원부 주변 수분 안전 점검"],
        evidence: [{ document: "원코크 플러스 얼음물 정수기 사용설명서 (시연 메타데이터)", page: "41쪽", section: "누수 및 안전 주의사항", confidence: 0.98 }],
        selfActions: ["제품 사용을 즉시 중지하고 젖은 손으로 전원부를 만지지 마세요.", "제품을 이동하거나 분해하지 말고 안전한 거리에서 상담을 기다려 주세요."],
        actionResult: "NOT_PERFORMED", counselor: { id: "STF-001", note: "안전 안내 확인. 당일 우선 방문 필요.", decision: "VISIT" },
        visit: { id: "VIS-260716-003", workOrderId: "WO-260716-003", serviceType: "AS", engineerId: "STF-002", scheduledAt: "2026-07-17T14:00:00+09:00", area: "서울 마포구 (가상)", status: "SCHEDULED", result: null, cause: null, actions: [], replacement: null, signature: null, rescheduleRequest: { id: "RSC-260716-001", requestedAt: "2026-07-16T09:26:00+09:00", desiredAt: "2026-07-18T15:00:00+09:00", reason: "사내 회의 일정과 겹쳐 방문 가능 시간 변경 요청", status: "REJECTED", resolvedAt: "2026-07-16T09:41:00+09:00", resolvedBy: "장민서", resolutionNote: "긴급 안전 점검 건으로 기존 우선 방문 일정을 유지합니다." }, rescheduleHistory: [{ id: "RSC-260716-001", requestedAt: "2026-07-16T09:26:00+09:00", desiredAt: "2026-07-18T15:00:00+09:00", reason: "사내 회의 일정과 겹쳐 방문 가능 시간 변경 요청", status: "REJECTED", resolvedAt: "2026-07-16T09:41:00+09:00", resolvedBy: "장민서", resolutionNote: "긴급 안전 점검 건으로 기존 우선 방문 일정을 유지합니다." }] },
        aiTrace: ["위험 규칙 우선 적용", "자가조치 단계 제한", "공식 근거 1건 연결", "우선 방문 브리핑 생성"],
        timeline: [
          { at: "2026-07-15T17:54:00+09:00", actor: "고객 · 박지민", type: "RECEIVED", label: "누수 문의를 접수했습니다.", detail: "전원선 인접 물기 위험 신호 감지" },
          { at: "2026-07-15T17:55:00+09:00", actor: "안전 규칙", type: "SAFETY", label: "제품 사용 중지 안내를 우선 제공했습니다.", detail: "위험 규칙 SAFE-LEAK-02 적용" },
          { at: "2026-07-15T18:14:00+09:00", actor: "상담사 · 한유진", type: "IN_COUNSEL", label: "상담 후 우선 방문을 결정했습니다.", detail: "고객의 안전 안내 이행 여부 확인" },
          { at: "2026-07-16T08:20:00+09:00", actor: "상담사 · 한유진", type: "VISIT_SCHEDULED", label: "방문기사와 일정을 등록했습니다.", detail: "오세훈 기사 · 7월 17일 14:00" },
          { at: "2026-07-16T09:26:00+09:00", actor: "기업 고객 · 그린웨이브 스튜디오", type: "RESCHEDULE_REQUESTED", label: "방문 일정 변경을 요청했습니다.", detail: "희망 일시: 7월 18일 15:00 · 관계자 검토" },
          { at: "2026-07-16T09:41:00+09:00", actor: "운영 담당자 · 장민서", type: "RESCHEDULE_REJECTED", label: "변경 요청을 반려하고 기존 일정을 유지했습니다.", detail: "긴급 안전 점검 우선 방문" }
        ]
      },
      {
        id: "INQ-260712-009", customerId: "CUS-003", productId: "PROD-003", createdAt: "2026-07-12T10:26:00+09:00", updatedAt: "2026-07-16T11:34:00+09:00",
        status: "VISIT_COMPLETE", risk: "CAUTION", priority: "NORMAL", symptomTypes: ["TEMPERATURE"],
        title: "냉수가 충분히 차갑지 않아요", description: "이틀 전부터 냉수를 오래 받아도 미지근하고 냉각 표시등이 평소보다 오래 켜져 있어요.",
        structured: { started: "이틀 전", targetWater: "냉수", condition: "연속 출수 후에도 지속", errorCode: "표시 없음", companion: "냉각 표시등 장시간 점등", recentNonUse: "해당 없음", lastCare: "2026-03-16" },
        aiSummary: "냉수 온도 저하와 냉각 표시등 장시간 점등이 확인되었습니다. 고객이 직접 분해하지 않도록 안내하고 방문 점검을 완료했습니다.",
        candidates: ["설치 공간 통풍 상태 확인", "냉각부 작동 상태 점검", "온도 센서 상태 점검"],
        evidence: [{ document: "초소형 플러스 직수 정수기 사용설명서 (시연 메타데이터)", page: "32쪽", section: "냉수 온도가 높을 때", confidence: 0.91 }],
        selfActions: ["제품 뒤쪽 통풍 공간을 막는 물건이 없는지 확인해 주세요."],
        actionResult: "SAME", counselor: { id: "STF-001", note: "통풍 공간 정상. 센서 확인을 위해 방문 전환.", decision: "VISIT" },
        visit: { id: "VIS-260716-001", workOrderId: "WO-260716-001", serviceType: "REPAIR", engineerId: "STF-002", scheduledAt: "2026-07-16T10:30:00+09:00", completedAt: "2026-07-16T11:34:00+09:00", area: "서울 은평구 (가상)", status: "COMPLETED", result: "RESOLVED", cause: "온도 센서 접점 상태 확인 필요", actions: ["온도 센서 연결 상태 점검", "냉각 성능 확인", "카트리지 교체"], replacement: "카트리지 세트", signature: { signedBy: "이*준", relationship: "SELF", position: "본인", signedAt: "2026-07-16T11:32:00+09:00", consent: true, consentVersion: "VISIT_COMPLETION_V1", method: "DIGITAL_PAD", signatureData: { format: "POINTS_V1", strokes: [[{ x: 0.12, y: 0.58 }, { x: 0.22, y: 0.3 }, { x: 0.31, y: 0.64 }, { x: 0.41, y: 0.34 }], [{ x: 0.47, y: 0.58 }, { x: 0.59, y: 0.38 }, { x: 0.68, y: 0.62 }, { x: 0.79, y: 0.33 }]] }, integrityId: "SIG-DEMO-260716-001" }, rescheduleRequest: null },
        aiTrace: ["증상 구조화 완료", "공식 근거 1건 연결", "방문 리포트 생성", "케어 이력·다음 일정 갱신"],
        timeline: [
          { at: "2026-07-12T10:26:00+09:00", actor: "고객 · 이서준", type: "RECEIVED", label: "온도 이상 문의를 접수했습니다.", detail: "냉수 온도·표시등 상태 저장" },
          { at: "2026-07-12T13:10:00+09:00", actor: "상담사 · 한유진", type: "VISIT_SCHEDULED", label: "방문 점검으로 전환했습니다.", detail: "고객 확인사항을 기사 리포트로 전달" },
          { at: "2026-07-16T11:34:00+09:00", actor: "방문기사 · 오세훈", type: "VISIT_COMPLETE", label: "방문 점검과 케어를 완료했습니다.", detail: "온도 센서 점검·카트리지 교체" }
        ]
      },
      {
        id: "INQ-260710-006", customerId: "CUS-004", productId: "PROD-004", createdAt: "2026-07-10T19:22:00+09:00", updatedAt: "2026-07-10T19:43:00+09:00",
        status: "COMPLETED", risk: "GENERAL", priority: "NORMAL", symptomTypes: ["TASTE_ODOR"],
        title: "여행 후 물에서 냄새가 나는 것 같아요", description: "일주일 동안 집을 비운 뒤 처음 사용했는데 물에서 평소와 다른 냄새가 나는 것 같아요.",
        structured: { started: "오늘", targetWater: "정수", condition: "7일 미사용 후 최초 출수", errorCode: "표시 없음", companion: "누수·온도 이상 없음", recentNonUse: "7일", lastCare: "2026-04-09" },
        aiSummary: "장기간 미사용 후 최초 출수에서 주관적 냄새 변화가 접수되었습니다. 공식 문서의 장기간 미사용 후 출수 절차를 안내했고 증상이 해소되었습니다.",
        candidates: ["장기간 미사용 후 초기 출수 여부 확인", "카트리지 교체 이력 확인"],
        evidence: [{ document: "초소형 플러스 직수 정수기 사용설명서 (시연 메타데이터)", page: "18쪽", section: "장기간 사용하지 않은 경우", confidence: 0.96 }],
        selfActions: ["정수를 3분 이상 충분히 흘려보낸 뒤 물맛과 냄새를 다시 확인해 주세요."],
        actionResult: "RESOLVED", counselor: { id: null, note: "", decision: "SELF_RESOLVED" }, visit: null,
        aiTrace: ["증상 구조화 완료", "안전 규칙 검사 통과", "공식 근거 1건 연결", "고객 해결 확인"],
        timeline: [
          { at: "2026-07-10T19:22:00+09:00", actor: "고객 · 최유나", type: "RECEIVED", label: "물맛·냄새 문의를 접수했습니다.", detail: "장기간 미사용 조건 확인" },
          { at: "2026-07-10T19:31:00+09:00", actor: "AI 케어", type: "SELF_ACTION", label: "공식 근거 기반 확인 절차를 안내했습니다.", detail: "사용설명서 시연용 18쪽" },
          { at: "2026-07-10T19:43:00+09:00", actor: "고객 · 최유나", type: "COMPLETED", label: "증상이 해결되었다고 확인했습니다.", detail: "조치 결과: 해결" }
        ]
      },
      {
        id: "INQ-260716-005", customerId: "CUS-005", productId: "PROD-005", createdAt: "2026-07-16T09:07:00+09:00", updatedAt: "2026-07-16T09:09:00+09:00",
        status: "ADDITIONAL_QUESTIONS", risk: "GENERAL", priority: "NORMAL", symptomTypes: ["LOW_FLOW"],
        title: "아침부터 물이 조금 약하게 나와요", description: "오늘 아침부터 정수 물줄기가 평소보다 약한 것 같아요.",
        structured: { started: "오늘 아침", targetWater: "정수", condition: "확인 필요", errorCode: "확인 필요", companion: "확인 필요", recentNonUse: "확인 필요", lastCare: "2026-03-20" },
        aiSummary: "정수 출수량 저하가 접수되었습니다. 발생 조건, 오류 표시와 동반 증상 확인이 필요해 추가 질문 단계입니다.",
        candidates: ["발생 조건 확인 후 점검 후보 생성 예정"], evidence: [], selfActions: [], actionResult: null,
        counselor: { id: null, note: "", decision: null }, visit: null,
        pendingQuestions: ["냉수나 온수도 함께 약하게 나오나요?", "제품에 오류 숫자나 깜빡이는 표시가 있나요?", "제품 주변에 물기나 평소와 다른 소음이 있나요?"],
        aiTrace: ["최초 증상 저장", "필수 정보 누락 확인", "추가 질문 3개 생성"],
        timeline: [
          { at: "2026-07-16T09:07:00+09:00", actor: "고객 · 정민호", type: "RECEIVED", label: "출수량 문의를 접수했습니다.", detail: "자연어 원문 저장" },
          { at: "2026-07-16T09:09:00+09:00", actor: "AI 문진", type: "ADDITIONAL_QUESTIONS", label: "추가 확인이 필요한 항목을 정리했습니다.", detail: "오류 표시·동반 증상·발생 조건" }
        ]
      }
    ],
    knowledgeAnalysisMeta: {
      generatedAt: "2026-07-16T12:00:00+09:00",
      source: "DEMO_KEYWORD_ANALYSIS",
      modelVersion: "DEMO-KW-1.0",
      inquiryCount: 5,
      scope: "고객 문의 제목·원문·구조화 답변·조치 결과",
      disclaimer: "키워드, 빈도, 연결 문서와 구간은 화면 검증용 합성 분석 데이터입니다."
    },
    knowledgeDocuments: [
      {
        id: "KDOC-IAC425-001", type: "USER_MANUAL", modelCode: "WPUIAC425SNW", modelName: "원코크 플러스 얼음물 정수기", demoOnly: true, sourceType: "DEMO_METADATA",
        title: "원코크 플러스 얼음물 정수기 사용설명서 메타데이터", version: "DEMO-v1.1", status: "CONNECTED", statusLabel: "연결됨",
        approvalStatus: "DEMO_APPROVED", approvalLabel: "시연 승인", effectiveAt: "2026-07-01", lastReviewedAt: "2026-07-15T16:20:00+09:00",
        owner: "지식·안전 관리자 (가상)", sourceName: "SK매직 제품 정보 기반 시연 메타데이터", language: "ko-KR", checksum: "DEMO-SHA256-IAC425-91B3",
        tags: ["출수량", "물맛·냄새", "누수", "안전 상담", "필터"],
        sections: [
          { id: "SEC-IAC-24", page: "24쪽", title: "출수량이 적을 때 확인사항", category: "애로사항", keywords: ["출수량 저하", "물줄기 약함", "정수 약함", "원수 밸브", "필터"], matchedInquiryIds: ["INQ-260716-001", "INQ-260716-005"], summary: "출수 종류와 발생 조건을 확인한 뒤 원수 공급 상태와 관리 이력을 점검하는 구간입니다.", recommendedAction: "원수 공급 밸브 개방 상태와 최근 필터 관리 이력을 확인", caution: "누수·오류 신호가 함께 있으면 자가조치를 중단하고 상담으로 전환", ruleIds: ["EVIDENCE-00"] },
          { id: "SEC-IAC-28", page: "28쪽", title: "물맛·냄새가 평소와 다를 때", category: "애로사항", keywords: ["물맛 변화", "텁텁함", "냄새", "장기간 미사용"], matchedInquiryIds: ["INQ-260716-001"], summary: "최근 미사용 기간과 필터 관리 상태를 함께 확인하는 구간입니다.", recommendedAction: "최근 미사용 기간과 필터 교체 이력을 먼저 확인", caution: "수질 이상을 확정 표현하지 않고 반복되면 상담 연결", ruleIds: ["EVIDENCE-00"] },
          { id: "SEC-IAC-41", page: "41쪽", title: "누수 및 전원부 주변 안전 주의사항", category: "안전 신호", keywords: ["누수", "바닥 물기", "전원선", "축축함", "사용 중지"], matchedInquiryIds: ["INQ-260715-014"], summary: "누수와 전원부 인접 물기가 함께 보고된 경우 일반 안내보다 안전 조치를 우선하는 구간입니다.", recommendedAction: "제품 사용을 중지하고 전원부 접촉 없이 우선 상담 연결", caution: "젖은 손으로 전원부를 만지거나 제품을 분해하지 않도록 안내", ruleIds: ["SAFE-LEAK-02"] },
          { id: "SEC-IAC-44", page: "44쪽", title: "안전 상담과 점검 요청 준비", category: "요구사항", keywords: ["빠른 상담", "우선 점검", "기존 답변 인계", "방문 준비"], matchedInquiryIds: ["INQ-260715-014"], summary: "안전 위험 고객이 상담 시 반복 설명하지 않도록 제품·증상·위험 신호를 인계하는 구간입니다.", recommendedAction: "고객 원문과 위험 신호를 우선 상담 큐에 함께 전달", caution: "방문 일정 확정보다 사전 승인 안전문 전달을 우선", ruleIds: ["SAFE-LEAK-02", "HANDOFF-01"] }
        ]
      },
      {
        id: "KDOC-JAC115-001", type: "USER_MANUAL", modelCode: "WPUJAC115DNW", modelName: "초소형 플러스 직수 정수기", demoOnly: true, sourceType: "DEMO_METADATA",
        title: "초소형 플러스 직수 정수기 사용설명서 메타데이터", version: "DEMO-v1.1", status: "CONNECTED", statusLabel: "연결됨",
        approvalStatus: "DEMO_APPROVED", approvalLabel: "시연 승인", effectiveAt: "2026-07-01", lastReviewedAt: "2026-07-15T16:35:00+09:00",
        owner: "지식·안전 관리자 (가상)", sourceName: "SK매직 제품 정보 기반 시연 메타데이터", language: "ko-KR", checksum: "DEMO-SHA256-JAC115-84C2",
        tags: ["장기간 미사용", "물맛·냄새", "출수량", "냉수 온도", "상담 연결"],
        sections: [
          { id: "SEC-JAC-18", page: "18쪽", title: "장기간 사용하지 않은 경우", category: "애로사항", keywords: ["여행 후 냄새", "장기간 미사용", "최초 출수", "물맛 변화"], matchedInquiryIds: ["INQ-260710-006"], summary: "장기간 미사용 후 최초 출수에서 느끼는 물맛·냄새 변화를 확인하는 구간입니다.", recommendedAction: "충분히 출수한 뒤 변화 여부를 다시 확인", caution: "이상 지속 시 임의 진단 대신 상담 연결", ruleIds: ["EVIDENCE-00"] },
          { id: "SEC-JAC-22", page: "22쪽", title: "물줄기가 약할 때 확인사항", category: "애로사항", keywords: ["출수량 저하", "물줄기 약함", "원수 밸브", "카트리지"], matchedInquiryIds: [], summary: "동일 키워드가 이 모델에서 접수될 때 연결할 수 있도록 준비한 시연 구간입니다.", recommendedAction: "제품 모델과 관리 유형을 확인한 뒤 해당 구간 연결", caution: "다른 모델 문서와 혼용하지 않음", ruleIds: ["EVIDENCE-00"] },
          { id: "SEC-JAC-32", page: "32쪽", title: "냉수 온도가 높을 때", category: "애로사항", keywords: ["냉수 미지근함", "차갑지 않음", "냉각 표시등", "통풍"], matchedInquiryIds: ["INQ-260712-009"], summary: "냉수 온도와 냉각 표시 상태, 설치 공간 통풍 조건을 확인하는 구간입니다.", recommendedAction: "제품 주변 통풍 공간을 확인하고 지속 시 상담 연결", caution: "냉각부 분해나 임의 수리를 안내하지 않음", ruleIds: ["EVIDENCE-00"] }
        ]
      },
      {
        id: "KDOC-SAFE-001", type: "SAFETY_POLICY", modelCode: "COMMON", modelName: "전 모델 공통", demoOnly: true, sourceType: "DEMO_METADATA",
        title: "위험 신호·근거·상담 인계 규칙", version: "SAFE-RULE 0.9", status: "REVIEW", statusLabel: "검토 필요",
        approvalStatus: "DEMO_REVIEW", approvalLabel: "시연 검토 중", effectiveAt: "2026-07-10", lastReviewedAt: "2026-07-16T09:30:00+09:00",
        owner: "서비스 안전 책임자 (가상)", sourceName: "프로토타입 안전 정책 시연 데이터", language: "ko-KR", checksum: "DEMO-SHA256-SAFE-57A9",
        tags: ["누수", "전원부", "화상", "근거 없음", "상담 인계"],
        sections: [
          { id: "SEC-SAFE-LEAK", page: "규칙 2", title: "SAFE-LEAK-02 누수·전원부 물기", category: "안전 신호", keywords: ["누수", "전원선", "바닥 물기", "사용 중지"], matchedInquiryIds: ["INQ-260715-014"], summary: "누수와 전원부 인접 물기가 함께 있으면 위험 경로를 우선 적용합니다.", recommendedAction: "일반 자가조치를 차단하고 사전 승인 안전문과 우선 상담 제공", caution: "제품 이동·분해·전원부 접촉 금지", ruleIds: ["SAFE-LEAK-02"] },
          { id: "SEC-SAFE-HEAT", page: "규칙 3", title: "SAFE-HEAT-01 온수 화상 위험", category: "안전 신호", keywords: ["온수", "화상", "고온", "접촉 금지"], matchedInquiryIds: [], summary: "온수 화상 위험 표현이 감지되면 접촉 금지와 우선 상담을 적용합니다.", recommendedAction: "고온부 접촉을 피하고 상담 연결", caution: "온도 확인을 위해 직접 만지도록 안내하지 않음", ruleIds: ["SAFE-HEAT-01"] },
          { id: "SEC-SAFE-ELECTRIC", page: "규칙 4", title: "SAFE-ELECTRIC-01 전원부 인접 물기", category: "안전 신호", keywords: ["전원선", "전원부", "젖은 손", "감전 위험"], matchedInquiryIds: ["INQ-260715-014"], summary: "전원부 주변 물기가 언급되면 직접 접촉이나 플러그 조작을 유도하지 않습니다.", recommendedAction: "안전한 거리를 유지하고 우선 상담 연결", caution: "젖은 손으로 전원부·플러그를 만지지 않도록 안내", ruleIds: ["SAFE-ELECTRIC-01"] },
          { id: "SEC-SAFE-DISASSEMBLY", page: "규칙 5", title: "SAFE-DISASSEMBLY-01 임의 분해 금지", category: "안전 신호", keywords: ["분해", "이동", "임의 수리", "내부 점검"], matchedInquiryIds: ["INQ-260715-014", "INQ-260712-009"], summary: "누수·냉각 이상 고객에게 제품 분해나 내부 점검을 안내하지 않습니다.", recommendedAction: "외부에서 확인 가능한 항목만 안내하고 지속 시 상담 연결", caution: "커버 개방·제품 이동·임의 부품 교체 금지", ruleIds: ["SAFE-DISASSEMBLY-01"] },
          { id: "SEC-SAFE-EVIDENCE", page: "규칙 6", title: "EVIDENCE-00 공식 근거 없음", category: "안전 신호", keywords: ["근거 없음", "모델 불명", "지원 외", "상담 전환"], matchedInquiryIds: [], summary: "제품·버전에 맞는 근거가 없으면 임의 자가조치를 생성하지 않습니다.", recommendedAction: "근거 부족을 표시하고 상담 검토로 전환", caution: "추가 질문 단계는 근거 실패로 오분류하지 않음", ruleIds: ["EVIDENCE-00"] },
          { id: "SEC-SAFE-HANDOFF", page: "규칙 7", title: "HANDOFF-01 기수행 조치 인계", category: "요구사항", keywords: ["조치 후 동일", "반복 설명", "상담 인계", "실패 조치"], matchedInquiryIds: ["INQ-260716-001", "INQ-260712-009"], summary: "고객이 이미 수행한 조치와 결과를 상담사에게 전달해 반복 안내를 줄입니다.", recommendedAction: "원문·기수행 조치·결과·미확인 항목을 상담 요약에 포함", caution: "실패한 조치를 다시 권고하지 않음", ruleIds: ["HANDOFF-01"] }
        ]
      }
    ],
    knowledgeKeywordInsights: [
      { id: "KWI-001", category: "PAIN", categoryLabel: "애로사항", keyword: "출수량 저하", variants: ["물이 약해요", "물줄기가 약함", "출수량이 줄었어요"], severity: "CAUTION", severityLabel: "주의", sourceType: "CUSTOMER_TEXT", sourceLabel: "고객 원문", trendLabel: "2건 감지", linkedInquiryIds: ["INQ-260716-001", "INQ-260716-005"], sampleExpressions: ["냉수와 정수가 평소보다 약하게 나와요", "정수 물줄기가 평소보다 약한 것 같아요"], relatedSections: [{ documentId: "KDOC-IAC425-001", sectionId: "SEC-IAC-24" }, { documentId: "KDOC-JAC115-001", sectionId: "SEC-JAC-22" }] },
      { id: "KWI-002", category: "PAIN", categoryLabel: "애로사항", keyword: "물맛·냄새 변화", variants: ["물이 텁텁함", "여행 후 냄새", "평소와 다른 맛"], severity: "GENERAL", severityLabel: "일반", sourceType: "CUSTOMER_TEXT", sourceLabel: "고객 원문", trendLabel: "2건 감지", linkedInquiryIds: ["INQ-260716-001", "INQ-260710-006"], sampleExpressions: ["물맛도 조금 텁텁하게 느껴져요", "물을 처음 사용했는데 평소와 다른 냄새가 나요"], relatedSections: [{ documentId: "KDOC-IAC425-001", sectionId: "SEC-IAC-28" }, { documentId: "KDOC-JAC115-001", sectionId: "SEC-JAC-18" }] },
      { id: "KWI-003", category: "SAFETY", categoryLabel: "안전 신호", keyword: "누수·전원부 물기", variants: ["제품 아래 물 고임", "전원선 근처 축축함", "바닥 물기"], severity: "DANGER", severityLabel: "위험", sourceType: "CUSTOMER_TEXT", sourceLabel: "고객 원문", trendLabel: "1건 감지", linkedInquiryIds: ["INQ-260715-014"], sampleExpressions: ["제품 아래 바닥에 물이 고이고 전원선 근처도 축축해 보여요"], relatedSections: [{ documentId: "KDOC-IAC425-001", sectionId: "SEC-IAC-41" }, { documentId: "KDOC-SAFE-001", sectionId: "SEC-SAFE-LEAK" }] },
      { id: "KWI-004", category: "PAIN", categoryLabel: "애로사항", keyword: "냉수가 미지근함", variants: ["차갑지 않음", "냉각 표시등 오래 켜짐", "냉수 온도 저하"], severity: "CAUTION", severityLabel: "주의", sourceType: "CUSTOMER_TEXT", sourceLabel: "고객 원문", trendLabel: "1건 감지", linkedInquiryIds: ["INQ-260712-009"], sampleExpressions: ["냉수를 오래 받아도 미지근하고 냉각 표시등이 오래 켜져 있어요"], relatedSections: [{ documentId: "KDOC-JAC115-001", sectionId: "SEC-JAC-32" }] },
      { id: "KWI-005", category: "REQUIREMENT", categoryLabel: "요구사항", keyword: "신속한 안전 상담", variants: ["우선 확인", "빠른 점검", "안전 안내 먼저"], severity: "DANGER", severityLabel: "긴급", sourceType: "OPERATIONAL_INFERENCE", sourceLabel: "운영 요구 추론", trendLabel: "1건 도출", linkedInquiryIds: ["INQ-260715-014"], sampleExpressions: ["누수와 전원부 인접 물기 때문에 일반 안내보다 안전 상담이 먼저 필요"], relatedSections: [{ documentId: "KDOC-IAC425-001", sectionId: "SEC-IAC-44" }, { documentId: "KDOC-SAFE-001", sectionId: "SEC-SAFE-LEAK" }] },
      { id: "KWI-006", category: "REQUIREMENT", categoryLabel: "요구사항", keyword: "조치 후 상담 연결", variants: ["증상 동일", "반복 설명 방지", "기수행 조치 인계"], severity: "CAUTION", severityLabel: "주의", sourceType: "OPERATIONAL_INFERENCE", sourceLabel: "운영 요구 추론", trendLabel: "2건 도출", linkedInquiryIds: ["INQ-260716-001", "INQ-260712-009"], sampleExpressions: ["자가 확인 후에도 동일하므로 기존 답변을 유지한 채 상담 연결 필요"], relatedSections: [{ documentId: "KDOC-SAFE-001", sectionId: "SEC-SAFE-HANDOFF" }] },
      { id: "KWI-007", category: "PENDING", categoryLabel: "분석 대기", keyword: "추가 확인 후 근거 확정", variants: ["오류 표시 확인 필요", "동반 증상 확인 필요", "발생 조건 확인"], severity: "GENERAL", severityLabel: "대기", sourceType: "OPERATIONAL_STATE", sourceLabel: "처리 상태", trendLabel: "1건 대기", linkedInquiryIds: ["INQ-260716-005"], sampleExpressions: ["추가 질문이 완료되면 제품 모델에 맞는 근거 구간을 확정"], relatedSections: [{ documentId: "KDOC-IAC425-001", sectionId: "SEC-IAC-24" }] }
    ],
    notifications: [
      { id: "NOT-001", recipientRole: "CUSTOMER", recipientId: "CUS-001", eventType: "COUNSEL_REQUESTED", tone: "info", title: "상담 요청이 접수됐어요", message: "입력한 증상과 자가조치 결과가 상담사에게 전달되었습니다.", inquiryId: "INQ-260716-001", view: "inquiries", createdAt: "2026-07-16T09:18:00+09:00", readAt: null, actor: "김하늘" },
      { id: "NOT-002", recipientRole: "CUSTOMER", recipientId: "CUS-001", eventType: "ACTION_RESULT_SAVED", tone: "neutral", title: "확인 결과를 저장했어요", message: "증상이 동일하다는 답변을 반영해 다음 처리 단계를 준비했습니다.", inquiryId: "INQ-260716-001", view: "inquiries", createdAt: "2026-07-16T08:51:00+09:00", readAt: null, actor: "AI 케어" },
      { id: "NOT-003", recipientRole: "COUNSELOR", recipientId: "STF-001", eventType: "COUNSEL_QUEUE", tone: "warning", title: "새 상담 대기 · 김하늘", message: "자가조치 후에도 출수량 저하가 계속되어 상담 확인이 필요합니다.", inquiryId: "INQ-260716-001", view: "queue", createdAt: "2026-07-16T09:18:00+09:00", readAt: null, actor: "고객" },
      { id: "NOT-004", recipientRole: "COUNSELOR", recipientId: "STF-001", eventType: "DANGER_VISIT", tone: "danger", title: "위험 문의가 우선 방문으로 전환됐어요", message: "제품 하부 누수와 전원선 인접 물기가 확인된 기업 고객 건입니다.", inquiryId: "INQ-260715-014", view: "queue", createdAt: "2026-07-16T08:20:00+09:00", readAt: null, actor: "안전 규칙" },
      { id: "NOT-005", recipientRole: "COUNSELOR", recipientId: "STF-001", eventType: "VISIT_COMPLETE", tone: "success", title: "방문 작업이 완료됐어요", message: "이서준 고객의 해결 여부 확인을 기다리고 있습니다.", inquiryId: "INQ-260712-009", view: "queue", createdAt: "2026-07-16T11:34:00+09:00", readAt: null, actor: "오세훈" },
      { id: "NOT-006", recipientRole: "ENGINEER", recipientId: "STF-002", eventType: "VISIT_ASSIGNED", tone: "danger", title: "우선 방문 일정이 배정됐어요", message: "누수·전원부 인접 물기 건입니다. 고객 답변과 안전 안내를 먼저 확인하세요.", inquiryId: "INQ-260715-014", view: "visits", createdAt: "2026-07-16T08:20:00+09:00", readAt: null, actor: "한유진" },
      { id: "NOT-007", recipientRole: "ENGINEER", recipientId: "STF-002", eventType: "VISIT_SAVED", tone: "success", title: "방문 결과가 저장됐어요", message: "케어 이력과 다음 관리 일정에 작업 결과가 반영되었습니다.", inquiryId: "INQ-260712-009", view: "visits", createdAt: "2026-07-16T11:34:00+09:00", readAt: "2026-07-16T11:35:00+09:00", actor: "시스템" },
      { id: "NOT-008", recipientRole: "CUSTOMER", recipientId: "CUS-002", eventType: "RESCHEDULE_REJECTED", tone: "warning", title: "기존 방문 일정이 유지됩니다", message: "긴급 안전 점검 건으로 변경 요청이 반려되었습니다.", inquiryId: "INQ-260715-014", view: "schedule", createdAt: "2026-07-16T09:41:00+09:00", readAt: null, actor: "장민서" },
      { id: "NOT-009", recipientRole: "CUSTOMER", recipientId: "CUS-003", eventType: "RESOLUTION_CONFIRMATION", tone: "success", title: "방문 작업이 완료됐어요", message: "작업 확인서와 서명을 확인하고 현재 증상 해결 여부를 알려주세요.", inquiryId: "INQ-260712-009", view: "inquiries", createdAt: "2026-07-16T11:34:00+09:00", readAt: null, actor: "오세훈" },
      { id: "NOT-010", recipientRole: "OPERATOR", recipientId: "STF-004", eventType: "FOLLOW_UP_REQUIRED", tone: "info", title: "고객 후속 확인 대기", message: "방문 완료 후 고객의 해결 여부 확인이 남아 있습니다.", inquiryId: "INQ-260712-009", view: "queue", createdAt: "2026-07-16T11:34:00+09:00", readAt: null, actor: "시스템" }
    ],
    operationLog: [
      { id: "OP-001", at: "2026-07-16T08:45:00+09:00", category: "AI_CALL", outcome: "SUCCESS", target: "INQ-260716-001", detail: "추가 질문 구조화 · 모델 DEMO-CARE-1.0", durationMs: 640 },
      { id: "OP-002", at: "2026-07-16T08:46:00+09:00", category: "EVIDENCE_SEARCH", outcome: "SUCCESS", target: "INQ-260716-001", detail: "시연 메타데이터 1건 연결", durationMs: 85 },
      { id: "OP-003", at: "2026-07-16T09:09:00+09:00", category: "AI_CALL", outcome: "PENDING", target: "INQ-260716-005", detail: "필수 답변 대기 · 외부 API 호출 없음", durationMs: 0 }
    ],
    auditLog: [
      { id: "AUD-001", at: "2026-07-16T11:34:00+09:00", actor: "오세훈", role: "방문기사", action: "방문 결과 등록", target: "INQ-260712-009", detail: "방문 완료 및 다음 케어 일정 갱신" },
      { id: "AUD-005", at: "2026-07-16T09:41:00+09:00", actor: "장민서", role: "운영 담당자", action: "방문 일정 변경 반려", target: "INQ-260715-014", detail: "긴급 안전 점검으로 기존 일정 유지" },
      { id: "AUD-004", at: "2026-07-16T09:26:00+09:00", actor: "그린웨이브 스튜디오", role: "기업 고객", action: "방문 일정 변경 요청", target: "INQ-260715-014", detail: "7월 18일 15:00 희망 · 관계자 검토" },
      { id: "AUD-002", at: "2026-07-16T09:18:00+09:00", actor: "김하늘", role: "고객", action: "상담 요청", target: "INQ-260716-001", detail: "조치 결과 동일로 상담 대기 전환" },
      { id: "AUD-003", at: "2026-07-16T08:20:00+09:00", actor: "한유진", role: "상담사", action: "방문 일정 등록", target: "INQ-260715-014", detail: "오세훈 기사, 2026-07-16 14:00" }
    ]
  };

  function roundWater(value) {
    return Math.round(Number(value || 0) * 10) / 10;
  }

  var hotWaterFixtures = {
    "PROD-001": { hourly: [0, 0, 0, 0, 0, 0, 0.2, 0.4, 0.2, 0, 0, 0.1, 0.1, 0, 0, 0.1, 0, 0, 0.1, 0.2, 0.1, 0, 0, 0], weekly: [1.2, 1.4, 1.3, 1.3, 1.2, 1.4, 1.5], monthly: [32, 34, 35, 37, 38, 19.5] },
    "PROD-002": { hourly: [0, 0, 0, 0, 0, 0, 0, 0.3, 0.8, 1.8, 1.9, 0.5, 0.6, 0.4, 0.3, 0.3, 0.2, 0.1, 0, 0, 0, 0, 0, 0], weekly: [7, 2.1, 1.7, 8, 8.5, 8.2, 7.2], monthly: [145, 152, 159, 164, 170, 88] },
    "PROD-006": { hourly: [0, 0, 0, 0, 0, 0, 0, 0.1, 0.5, 1.1, 1.4, 0.4, 0.5, 0.4, 0.3, 0.2, 0.2, 0.1, 0, 0, 0, 0, 0, 0], weekly: [5.1, 1.4, 1, 5.6, 5.8, 5.5, 5.2], monthly: [95, 102, 108, 112, 116, 59] },
    "PROD-003": { hourly: [0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.1, 0, 0, 0.1, 0.1, 0, 0, 0, 0.1, 0, 0.1, 0.1, 0.1, 0, 0, 0], weekly: [0.8, 1.1, 1, 0.9, 0.8, 1, 1], monthly: [24, 25, 26, 27, 28, 14] },
    "PROD-004": { hourly: [0, 0, 0, 0, 0, 0, 0.1, 0.4, 0.2, 0, 0, 0.1, 0.1, 0, 0, 0.1, 0, 0, 0.1, 0.1, 0, 0, 0, 0], weekly: [0.9, 1, 1, 1.1, 1, 1.1, 1.2], monthly: [28, 29, 30, 31, 32, 16.5] },
    "PROD-005": { hourly: [0, 0, 0, 0, 0, 0, 0, 0.2, 0.7, 1.4, 1.7, 0.4, 0.5, 0.4, 0.3, 0.3, 0.2, 0.1, 0, 0, 0, 0, 0, 0], weekly: [6, 1.6, 1.2, 6.8, 7.2, 7, 6.2], monthly: [123, 130, 133, 138, 144, 73] }
  };

  window.WATERCARE_SEED.customers.forEach(function (customer) {
    customer.role = customer.role || "CUSTOMER";
    if (typeof customer.active !== "boolean") customer.active = true;
  });

  window.WATERCARE_SEED.products.forEach(function (product) {
    product.subscriptionId = product.subscriptionId || "SUB-" + String(product.id).replace(/^PROD-/, "");
  });

  window.WATERCARE_SEED.usageTelemetry.forEach(function (telemetry) {
    var fixture = hotWaterFixtures[telemetry.productId];
    ["hourly", "weekly", "monthly"].forEach(function (range) {
      var rangeSeries = telemetry.series[range];
      rangeSeries.hotWater = fixture[range].slice();
      rangeSeries.coldWater = rangeSeries.water.map(function (total, index) {
        return roundWater(total - rangeSeries.hotWater[index]);
      });
    });
  });
})();
