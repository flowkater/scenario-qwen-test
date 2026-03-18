// ===== 입력 (인터뷰 결과) =====

export interface TimeBudget {
  weekday: number;  // minutes
  weekend: number;  // minutes
}

export interface StudentProfile {
  role: "student" | "working" | "examPrep" | "self";
  studentLevel?: "highschool" | "college" | "other";
  collegeType?: "undergrad" | "grad";
  year?: string;
  readSpeed?: "fast" | "medium" | "slow";
  level: "beginner" | "capable" | "confident";
  tone: "encouraging" | "guiding" | "neutral" | "optimizing";
  focusSpan: number;  // minutes
  timeBudget: TimeBudget;
  firstTime?: boolean;
  isRetake?: boolean;
  examPrepDuration?: "justStarting" | "fewMonths" | "sixPlus" | "overYear";
  selfLearnerGoal?: "specific" | "habit" | "exploring";
}

export interface ExamDetails {
  subject: string;
  examDate: string;       // "D-5", "D-18" etc
  daysLeft: number;
  examType: "multipleChoice" | "essay" | "problemSolving" | "mixed" | "unknown";
  ddayBucket: "urgent" | "normal" | "marathon";
}

export interface Resource {
  type: "textbook" | "practice" | "lectures" | "studyGuide" | "app" | "other";
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

export interface TestCaseInput {
  id: string;              // "tc-1"
  name: string;            // "Tyler (FR, beginner, urgent, MC)"
  description: string;     // TC 설명
  profile: StudentProfile;
  exam: ExamDetails;
  resources: Resource[];
  examScope: ExamScope;
  currentState: CurrentState;
}

// ===== 출력 (Qwen 응답) =====

export interface StudyPlan {
  type: "read" | "practice" | "review";
  schedule: "daily" | "event";
  label: string;
  scope: string;
  dailyTarget: string;
  estimatedMinutes: number;
  priority: "primary" | "secondary" | "optional";
  rationale: string;
}

export interface QwenOutput {
  strategy: string;
  strategyRationale: string;
  cpiRatio: { c: number; p: number; i: number };
  plans: StudyPlan[];
  totalDailyMinutes: number;
  totalEventMinutes: number;
  timeBudgetFit: "fits" | "tight" | "over";
  coachComment: string;
  warnings: string[];
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
  cpiCheck: {
    ratioMatchesPlan: boolean;
    expectedRatio: { c: number; p: number; i: number };
    actualRatio: { c: number; p: number; i: number };
    deviation: number;
  };
  timeBudgetCheck: {
    totalDailyMinutes: number;
    weekdayBudget: number;
    fits: boolean;
    eventsOnWeekend: boolean;
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
    cpiRate: string;
    timeBudgetRate: string;
  };
}
