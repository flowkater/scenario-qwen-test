// ===== AddPlan v1.0 AI Parser Types =====

export interface ParserProfile {
  role: "student" | "working" | "selfLearner";
  year?: "freshman" | "sophomore" | "junior" | "senior" | "grad" | "gap";
  firstExam?: boolean;
  reading?: "aLot" | "sometimes" | "notReally";
  level: "beginner" | "capable" | "confident";
  focusSpan?: number;
}

export type PlanCategory = "read" | "watchListen" | "practice" | "create" | "other";

export type PlanPurpose =
  // Read
  | "coverToCover" | "byChapters" | "readExamPrep"
  // Watch
  | "catchUp" | "fullCourse" | "watchByEpisodes" | "watchExamPrep"
  // Practice
  | "problemSets" | "workbook" | "dailyDrills" | "project"
  // Other
  | "countSomething" | "numberRange" | "checklist"
  // Universal
  | "notSure";

export type PlanType = "range" | "amount" | "check";

export interface ParserInput {
  category: PlanCategory;
  description: string;
  profile: ParserProfile;
}

export interface ParserConfidence {
  name: number;
  purpose: number;
  quantity: number;
  deadline: number;
}

export interface ParserOutput {
  name: string | null;
  purpose: PlanPurpose | null;
  planType: PlanType | null;
  startValue: number | null;
  endValue: number | null;
  totalQuantity: number | null;
  unit: string | null;
  deadline: string | null;  // YYYY-MM-DD
  examPrep: boolean;
  confidence: ParserConfidence;
}

// ===== Test Case =====

export interface ParserTestCase {
  id: string;
  description: string;  // TC 설명
  input: ParserInput;
  expected: ParserExpected;
  hardFailChecks: string[];  // HF-1 ~ HF-5
  notes?: string;
}

export interface ParserExpected {
  name: string | null;
  purpose: PlanPurpose | null;
  planType: PlanType | null;
  startValue?: number | null;
  endValue?: number | null;
  totalQuantity?: number | null;
  deadline?: string | null;
  examPrep: boolean;
  expectedSkipped: string[];   // ["purpose", "quantity", "deadline"]
  expectedShown: string[];     // ["quantity", "deadline", "weekday"]
}

// ===== Validation =====

export interface ParserValidation {
  tcId: string;
  parseSuccess: boolean;
  nameMatch: boolean;
  purposeMatch: boolean;
  planTypeMatch: boolean;
  quantityCorrect: boolean;
  deadlineCorrect: boolean;
  examPrepMatch: boolean;
  skipDecisionCorrect: boolean;
  hardFails: string[];
  overallPass: boolean;
  details: Record<string, any>;
}
