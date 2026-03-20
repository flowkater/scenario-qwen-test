import type { TestCaseInput, PlanSkeleton } from "../types.js";
import { examHandler } from "./handlers/exam.js";
import { replanHandler } from "./handlers/replan.js";
import { multiSubjectHandler } from "./handlers/multi.js";
import { langExamHandler } from "./handlers/langExam.js";

function isTOEFLScoreBased(input: TestCaseInput): boolean {
  const msg = (input.userMessage ?? "").toLowerCase();
  return (input.resources ?? []).length === 0 && (
    msg.includes("toefl") ||
    msg.includes("토플") ||
    (input.exam?.subject ?? "").toLowerCase().includes("toefl")
  );
}

function isJLPT(input: TestCaseInput): boolean {
  const msg = (input.userMessage ?? "").toLowerCase();
  return msg.includes("jlpt") || msg.includes("일본어능력시험");
}

export function buildSkeleton(input: TestCaseInput): PlanSkeleton {
  // Cross-profile: handle as exam if it has single profile data
  // (cross-profile TC is split by caller before calling buildSkeleton)

  // TOEFL score-based (resources empty + TOEFL subject)
  if (isTOEFLScoreBased(input)) {
    return langExamHandler(input);
  }

  switch (input.category) {
    case "exam-university":
    case "exam-highschool":
    case "exam-cert":
    case "cross-profile":
      return examHandler(input);
    case "read":
      return examHandler(input);
    case "watch":
      return examHandler(input);
    case "practice":
      return examHandler(input);
    case "assignment":
      return examHandler(input);
    case "replan":
      return replanHandler(input);
    case "multi-subject":
      return multiSubjectHandler(input);
    default:
      return examHandler(input);
  }
}
