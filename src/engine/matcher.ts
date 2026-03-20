import type { Resource, StudentProfile, TestCaseInput } from "../types.js";
import type { RateEntry } from "../types.js";
import { RATE_TABLE } from "./rates.js";

function desc(resource: Resource, exam?: TestCaseInput["exam"]): string {
  return ((resource.description ?? "") + " " + (exam?.subject ?? "")).toLowerCase();
}

function isThirdAttempt(input?: TestCaseInput): boolean {
  const msg = (input?.userMessage ?? "").toLowerCase();
  return msg.includes("3rd") || msg.includes("third") || msg.includes("twice") ||
    msg.includes("두 번") || msg.includes("세 번째") || msg.includes("last chance") ||
    msg.includes("last attempt");
}

export function matchReadingRate(
  resource: Resource,
  profile: StudentProfile,
  exam?: TestCaseInput["exam"],
  input?: TestCaseInput
): RateEntry {
  const d = desc(resource, exam);
  const isRetake = profile.isRetake === true;
  const msgLower = (input?.userMessage ?? "").toLowerCase();
  const isRetakeFromMsg = msgLower.includes("retaking") || msgLower.includes("retake") ||
    msgLower.includes("재수강") || msgLower.includes("재시험");

  // Emergency skim - panic + D-1
  if (input?.emotionProtocol === "panic" && (exam?.daysLeft ?? 99) <= 1) {
    return RATE_TABLE.reading["emergency-skim"];
  }

  // Organic chemistry
  if (d.includes("mcmurry") || d.includes("organic") || d.includes("orgo") || d.includes("유기화학")) {
    if (isThirdAttempt(input)) return RATE_TABLE.reading["orgo-3rd"];
    if (isRetake || isRetakeFromMsg || d.includes("retake") || d.includes("재수강")) return RATE_TABLE.reading["orgo-retake"];
    if (d.includes("ch.10") || d.includes("ch. 10") || d.includes("mechanism")) return RATE_TABLE.reading["orgo-mechanisms-first"];
    return RATE_TABLE.reading["orgo-first"];
  }

  // Anatomy
  if (d.includes("netter") || d.includes("anatomy") || d.includes("atlas") || d.includes("해부학")) {
    return RATE_TABLE.reading["anatomy-atlas"];
  }

  // Law
  if (d.includes("헌법") || d.includes("constitutional")) return RATE_TABLE.reading["constitutional-law-korean"];
  if (d.includes("irac") || d.includes("판례") || d.includes("law case")) return RATE_TABLE.reading["law-cases-irac"];
  if (d.includes("barbri") && (d.includes("outline") || d.includes("outlines"))) return RATE_TABLE.reading["barbri-outlines"];
  if (d.includes("bar exam") || d.includes("barbri")) return RATE_TABLE.reading["bar-exam-review"];

  // Korean certs
  if (d.includes("수제비") || d.includes("정보처리")) return RATE_TABLE.reading["jungbo-noncs"];
  if (d.includes("공인중개사") || d.includes("realtor") || d.includes("부동산") || d.includes("민법")) return RATE_TABLE.reading["realtor-law-korean"];

  // CPA
  if (d.includes("원가") || d.includes("cost accounting") || d.includes("원가계산")) return RATE_TABLE.reading["cpa-cost-weak"];
  if ((d.includes("cpa") || d.includes("재무")) && isRetake) return RATE_TABLE.reading["cpa-full-retake"];
  if (d.includes("cpa") || d.includes("재무회계") || d.includes("재무")) return RATE_TABLE.reading["cpa-review-familiar"];

  // PMP
  if (d.includes("pmbok")) return RATE_TABLE.reading["pmp-pmbok"];
  if (d.includes("rita")) return RATE_TABLE.reading["pmp-rita"];

  // Suneung
  if (d.includes("수능특강") || d.includes("ebs 수능")) return RATE_TABLE.reading["suneung-textbook"];

  // Political science / monograph / argument
  if (d.includes("polisci") || d.includes("political") || d.includes("politics") || d.includes("argument") || d.includes("monograph") || d.includes("macpherson")) {
    return RATE_TABLE.reading["polisci-monograph"];
  }

  // Genetics/Bio
  if (d.includes("genetics") || d.includes("bio") || d.includes("lewin") || d.includes("생물")) {
    return RATE_TABLE.reading["genetics-bio"];
  }

  // Review book / study guide -- check BEFORE subject-specific rates for studyGuide type
  // A studyGuide has a different reading pace (summary material) even if it's for a specific subject
  if (resource.type === "studyGuide" || d.includes("review book") || d.includes("review guide") || d.includes("ap review")) {
    return RATE_TABLE.reading["review-book"];
  }

  // AP Chem / Chemistry (only for textbooks, not review books)
  if (d.includes("zumdahl") || d.includes("ap chem") || d.includes("ap chemistry") || d.includes("chemistry")) {
    return RATE_TABLE.reading["ap-chemistry"];
  }

  // Econ
  if (d.includes("mankiw") || d.includes("econ") || d.includes("economics") || d.includes("경제") || d.includes("경영학")) {
    return RATE_TABLE.reading["econ-intro"];
  }

  // Statistics
  if (d.includes("statistics") || d.includes("통계")) {
    return RATE_TABLE.reading["statistics-textbook"];
  }

  // Novel/fiction - Harry Potter, etc.
  if (d.includes("harry potter") || d.includes("해리포터") || d.includes("소설") || d.includes("novel") || d.includes("fiction") || d.includes("불의 잔")) {
    return RATE_TABLE.reading["novel-korean"];
  }

  // Self-help / casual
  if (d.includes("atomic habits") || d.includes("자기계발") || d.includes("self-help") || d.includes("james clear")) {
    return RATE_TABLE.reading["selfhelp-casual"];
  }

  // JLPT textbook
  if (d.includes("jlpt") || d.includes("일본어")) {
    return RATE_TABLE.reading["general-textbook"];
  }

  // Suneung general
  if (d.includes("수능")) {
    return RATE_TABLE.reading["suneung-textbook"];
  }

  return RATE_TABLE.reading["general-textbook"];
}

export function matchWatchRate(resource: Resource, profile: StudentProfile): RateEntry {
  const d = (resource.description ?? "").toLowerCase();

  if (d.includes("genetics") || d.includes("bio")) {
    return RATE_TABLE.watch["genetics-lecture-50min"];
  }
  if (d.includes("physics") || d.includes("50min") || d.includes("50-min")) {
    return RATE_TABLE.watch["physics-lecture-50min"];
  }
  if (d.includes("barbri")) {
    return RATE_TABLE.watch["barbri-lecture"];
  }
  if (d.includes("udemy") || d.includes("coursera")) {
    if (profile.level === "beginner") return RATE_TABLE.watch["udemy-coding-beginner"];
    return RATE_TABLE.watch["udemy-coding-8min"];
  }
  // Korean lectures: detect lecture length
  if (d.includes("1.5x") || d.includes("1.5배속")) return RATE_TABLE.watch["korean-lecture-1.5x-40min"];
  if (d.includes("1x") || d.includes("1배속")) return RATE_TABLE.watch["korean-lecture-1x-40min"];
  if (d.includes("강의") || d.includes("인강") || d.includes("민법")) {
    // Default assumption: unknown speed, use 1.5x assumption for Korean lectures
    return RATE_TABLE.watch["korean-lecture-unknown-40min"];
  }
  if (d.includes("lecture")) {
    // English lectures: check context
    return RATE_TABLE.watch["general-passive"];
  }
  return RATE_TABLE.watch["general-passive"];
}

export function matchPracticeRate(
  resource: Resource,
  profile: StudentProfile,
  exam?: TestCaseInput["exam"],
  input?: TestCaseInput
): RateEntry {
  const d = (resource.description ?? "").toLowerCase();
  const examSubject = (exam?.subject ?? "").toLowerCase();
  const isPanic = input?.emotionProtocol === "panic";

  // PhD journal papers
  if (d.includes("paper") && (d.includes("journal") || d.includes("article") || d.includes("phd") || d.includes("research") || d.includes("literature"))) {
    return RATE_TABLE.practice["paper-3pass"];
  }

  // Genetics problems — MUST come before general past exam check
  if (d.includes("genetics") || d.includes("bio") || d.includes("생물") ||
      examSubject.includes("genetics") || examSubject.includes("bio") || examSubject.includes("생물")) {
    if (isPanic) return RATE_TABLE.practice["genetics-problem-triage"];
    return profile.isRetake ? RATE_TABLE.practice["genetics-problem-review"] : RATE_TABLE.practice["genetics-problem-first"];
  }

  // Suneung past exams (5개년)
  if ((d.includes("수능") || d.includes("suneung") || examSubject.includes("수능") || examSubject.includes("suneung")) &&
      (d.includes("기출") || d.includes("past") || d.includes("년") || d.includes("year") || resource.type === "pastExam")) {
    return RATE_TABLE.practice["suneung-passage-set"];
  }

  // Suneung math problems
  if ((d.includes("수학") || d.includes("math")) && (d.includes("기출") || d.includes("past") || d.includes("문제"))) {
    return RATE_TABLE.practice["suneung-math"];
  }

  // General past exams / cert exam sets — AFTER specific exam type checks
  if (d.includes("past exam") || d.includes("기출") || d.includes("past paper") || resource.type === "pastExam") {
    return RATE_TABLE.practice["cert-exam-set"];
  }

  // Calculus problems
  if (d.includes("calculus") || d.includes("calc") || d.includes("미적분") || d.includes("integration")) {
    if (d.includes("hard") || d.includes("difficult")) return RATE_TABLE.practice["calc-hard"];
    if (d.includes("routine") || d.includes("easy")) return RATE_TABLE.practice["calc-routine"];
    return RATE_TABLE.practice["calc-mixed"];
  }

  // SAT math
  if (d.includes("sat") && (d.includes("math") || d.includes("수학"))) {
    return RATE_TABLE.practice["sat-math-problem"];
  }

  // Vocab / SRS / words / JLPT
  if (d.includes("vocab") || d.includes("단어") || d.includes("word") || d.includes("srs") || d.includes("anki") || d.includes("jlpt")) {
    return RATE_TABLE.practice["srs-word"];
  }

  // Essay
  if (d.includes("essay") || d.includes("에세이")) {
    if (d.includes("outline")) return RATE_TABLE.practice["essay-outline"];
    if (d.includes("revision") || d.includes("edit")) return RATE_TABLE.practice["essay-revision"];
    return RATE_TABLE.practice["essay-draft"];
  }

  // Presentation
  if (d.includes("presentation") || d.includes("발표")) {
    return RATE_TABLE.practice["presentation-prep"];
  }

  // Coding / project
  if (d.includes("coding") || d.includes("portfolio") || d.includes("react") || d.includes("project")) {
    return RATE_TABLE.practice["coding-project"];
  }

  // Math (generic)
  if (d.includes("math") || d.includes("수학") || d.includes("problem")) {
    return RATE_TABLE.practice["general-math"];
  }

  return RATE_TABLE.practice["general-math"];
}
