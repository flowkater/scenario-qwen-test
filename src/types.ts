// ===== 공통 기초 타입 =====

export type EmotionProtocol = "neutral" | "panic" | "shame" | "frustration" | "burnout";

export type VersionTag = "v1" | "v1.5" | "v2";

export type TimeFit = "fits" | "tight" | "deficit" | "impossible";

export type TCCategory =
  | "exam-university"
  | "exam-highschool"
  | "exam-cert"
  | "read"
  | "assignment"
  | "watch"
  | "practice"
  | "cross-profile"
  | "replan"
  | "multi-subject";

// ===== 입력 (인터뷰 결과) =====

export interface TimeBudget {
  weekday: number;   // minutes
  weekend: number;   // minutes
}

export interface StudentProfile {
  role: "student" | "working" | "examPrep" | "self";
  studentLevel?: "highschool" | "college" | "other";
  collegeType?: "undergrad" | "grad";
  year?: string;
  readSpeed?: "fast" | "medium" | "slow";
  level: "beginner" | "capable" | "confident";
  tone?: "encouraging" | "guiding" | "neutral" | "optimizing";
  focusSpan: number;   // minutes
  timeBudget: TimeBudget;
  firstTime?: boolean;
  isRetake?: boolean;
  examPrepDuration?: "justStarting" | "fewMonths" | "sixPlus" | "overYear";
  selfLearnerGoal?: "specific" | "habit" | "exploring";
}

export interface ExamDetails {
  subject: string;
  examDate?: string;       // "D-5", "D-18" etc
  daysLeft: number;
  examType: "multipleChoice" | "essay" | "problemSolving" | "mixed" | "unknown";
  ddayBucket?: "urgent" | "normal" | "marathon";
}

export interface Resource {
  type: "textbook" | "practice" | "lectures" | "studyGuide" | "app" | "other" | "video" | "problems" | "pastExam" | "outlines";
  description: string;
  quantity?: string;       // "300p", "200 problems", "9 lectures"
  watched?: string;        // for lectures: "all watched", "5/9"
  isEstimated?: boolean;   // 🤷 fallback
}

export interface ExamScope {
  description: string;     // "Ch.1-8", "전 범위", "5 domains"
  isEstimated?: boolean;   // 🤷 fallback
}

export interface CurrentState {
  description: string;     // "Read through Ch.1-5", "Haven't started"
  progressPercent?: number;
  isEstimated?: boolean;
  retakeIssue?: string;    // isRetake 시: "Not enough practice"
}

// Multi-subject TC용
export interface SubjectDetail {
  subject: string;
  daysLeft: number;
  resources: Resource[];
  timeBudgetShare?: number;  // percentage of global budget
  priority?: number;
}

// Replan TC용
export interface OriginalPlan {
  description: string;
  totalQuantity: number;
  unit: string;
  dailyTarget: number;
  startDate?: string;
}

export interface CurrentProgress {
  completedQuantity: number;
  remainingQuantity: number;
  daysElapsed: number;
  daysRemaining: number;
  description?: string;
}

export interface TestCaseInput {
  id: string;              // "tc-01"
  category: TCCategory;    // NEW v4
  name: string;            // "Tyler — Econ 101 Freshman 🤷"
  description?: string;    // TC 설명 (optional for backward compat)
  userMessage?: string;    // NEW v4: raw user message
  emotionProtocol: EmotionProtocol;  // NEW v4
  versionTag: VersionTag;            // NEW v4: minimum version needed
  profile: StudentProfile;
  exam?: ExamDetails;               // optional for non-exam TCs
  resources: Resource[];
  examScope?: ExamScope;            // optional for non-exam TCs
  currentState?: CurrentState;      // optional
  // Multi-subject support
  subjects?: SubjectDetail[];       // for multi-subject TCs
  // Replan support
  originalPlan?: OriginalPlan;
  currentProgress?: CurrentProgress;
}

// ===== 출력 (AI Coach 응답) =====

export interface EffortModel {
  type: "fixed" | "range" | "variable" | "unpredictable";
  expected: number;   // P50
  min: number;        // P25
  max: number;        // P75
  unit?: string;      // "page", "problem", "lecture", etc.
  citation?: string;  // data source
  layers?: {
    baseProcessing: number;
    reviewPractice: number;
    sessionOverhead: number;
  };
}

export interface StudyPlan {
  type: "read" | "practice" | "review" | "watch" | "simulate" | "check";
  schedule?: "daily" | "event";
  label: string;
  scope?: string;
  dailyTarget?: string;
  weekdayTarget?: number;  // NEW v4
  weekendTarget?: number;  // NEW v4
  estimatedMinutes?: number;
  estimatedDailyMinutes?: number;  // NEW engine: daily need in minutes
  effortModel?: EffortModel;  // NEW v4: replaces estimatedMinPerUnit
  priority: "primary" | "secondary" | "optional";
  phase?: "learn" | "practice" | "review" | "simulate" | "triage";
  rationale?: string;
  assumptions?: string[];   // NEW v4
  missingInfo?: string[];   // NEW v4
}

// Legacy support
export interface QwenOutput {
  strategy: string;
  strategyRationale: string;
  cpiRatio?: { c: number; p: number; i: number };  // deprecated in v4
  plans: StudyPlan[];
  totalDailyMinutes: number;
  totalEventMinutes?: number;
  timeBudgetFit: TimeFit;
  coachComment: string;
  warnings: string[];
  emotionProtocol?: EmotionProtocol;  // NEW v4
  versionTag?: VersionTag;            // NEW v4
  alternatives?: StudyPlan[];         // NEW v4: for deficit cases
}

// ===== 기대 출력 (TestCase Expected) =====

export interface ExpectedQuestions {
  required: string[];
  optional: string[];
  maxCount: number;
  decisionValue?: string;
}

export interface TestCaseExpected {
  tcId: string;
  emotionProtocol: EmotionProtocol;   // NEW v4
  versionTag: VersionTag;             // NEW v4
  expectedQuestions?: ExpectedQuestions;
  effortModel?: EffortModel;          // NEW v4: per primary plan
  effortModels?: { [planLabel: string]: EffortModel };  // for multi-plan TCs
  expectedTimeFit: TimeFit;
  expectedStrategy?: string[];
  warnings?: string[];
  hardFailChecks: string[];           // NEW v4: HFG rules
  toneExpectation?: string;
  notes?: string;
  // Legacy (v3 backward compat)
  expectedCpiApprox?: { c: number; p: number; i: number };  // deprecated
  expectedTimeBudgetFit?: string;  // use expectedTimeFit instead
}

// ===== 분석 결과 =====

export interface ValidationResult {
  tcId: string;
  parseSuccess: boolean;
  schemaValid: boolean;
  schemaErrors?: string[];
  smartCheck: {
    specific: boolean;
    measurable: boolean;
    achievable: boolean;
    relevant: boolean;
    timeBound: boolean;
  };
  effortModelCheck?: {         // NEW v4: replaces cpiCheck
    expected: number;
    actual: number;
    withinRange: boolean;
    deviation: number;
  };
  cpiCheck?: {                  // legacy v3
    ratioMatchesPlan: boolean;
    expectedRatio: { c: number; p: number; i: number };
    actualRatio: { c: number; p: number; i: number };
    deviation: number;
  };
  timeBudgetCheck: {
    totalDailyMinutes: number;
    weekdayBudget: number;
    fits: boolean;
    eventsOnWeekend?: boolean;
  };
  timeFitCheck?: {             // NEW v4
    expected: TimeFit;
    actual: TimeFit;
    matches: boolean;
  };
  emotionProtocolCheck?: {     // NEW v4
    expected: EmotionProtocol;
    actual: EmotionProtocol;
    matches: boolean;
  };
  hardFailCheck?: {            // NEW v4
    rules: string[];
    passed: boolean;
    failedRules?: string[];
  };
  toneCheck: {
    expectedTone: string;
    commentTone: string;
  };
  warningsCheck: {
    expectedWarnings: string[];
    actualWarnings: string[];
    missingWarnings: string[];
  };
  overallPass: boolean;
}

// ===== Plan Engine 출력 =====

export interface RateEntry {
  key: string;
  p50: number;
  p25: number;
  p75: number;
  unit: string;
  gating?: string;
  citation?: string;
}

export interface PlanSkeleton {
  plans: StudyPlan[];
  timeFit: TimeFit;
  totalDailyMinutes: number;
  warnings: string[];
  assumptions: string[];
  missingInfo: string[];
  globalBudget?: {
    totalDailyMin: number;
    allocation: { subject: string; percentage: number }[];
    conflictWarning?: string;
  };
  alternatives?: {
    label: string;
    description: string;
    timeFit: TimeFit;
  }[];
  emotionProtocol?: EmotionProtocol;
  coachComment?: string;
  strategy?: string;
  strategyRationale?: string;
  questionsToAsk?: any[];
}

export interface CoachOutput {
  emotionProtocol: EmotionProtocol;
  coachComment: string;
  strategy: string;
  strategyRationale: string;
  questionsToAsk: {
    question: string;
    decisionImpact: string;
  }[];
}

export interface TestReport {
  runDate: string;
  model: string;
  totalCases: number;
  passed: number;
  failed: number;
  results: ValidationResult[];
  summary: {
    parseRate: string;
    schemaRate: string;
    smartRate: string;
    effortModelRate?: string;  // NEW v4
    cpiRate?: string;          // legacy
    timeBudgetRate: string;
    timeFitRate?: string;      // NEW v4
    emotionProtocolRate?: string;  // NEW v4
  };
}
