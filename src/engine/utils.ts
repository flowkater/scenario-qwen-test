export function parseQuantity(quantityStr?: string): number | null {
  if (!quantityStr) return null;
  const s = quantityStr.toLowerCase().replace(/[,~≈]/g, "").trim();

  // "150hr", "150 hours", "24hr total"
  const hrMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:hr|hours?)/);
  if (hrMatch) return parseFloat(hrMatch[1]); // return hours as-is (caller must handle unit)

  // "250p", "250 pages", "250페이지", "300p remaining"
  const pageMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:p\b|pages?|페이지)/);
  if (pageMatch) return parseFloat(pageMatch[1]);

  // "90 problems", "30 problems", "30문제", "500 problems"
  const probMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:problems?|questions?|문제|개)/);
  if (probMatch) return parseFloat(probMatch[1]);

  // "12 lectures", "9 lectures", "180 lectures", "60 lectures"
  const lectMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:lectures?|강의?|강\b)/);
  if (lectMatch) return parseFloat(lectMatch[1]);

  // "12 papers", "5 papers"
  const paperMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:papers?|논문)/);
  if (paperMatch) return parseFloat(paperMatch[1]);

  // "2000 words", "단어"
  const wordMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:words?|단어)/);
  if (wordMatch) return parseFloat(wordMatch[1]);

  // "5 sets", "10 sets"
  const setMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:sets?|세트)/);
  if (setMatch) return parseFloat(setMatch[1]);

  // "5 years" (past exams)
  const yearMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:years?|년치)/);
  if (yearMatch) return parseFloat(yearMatch[1]);

  // "3 milestones"
  const mileMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:milestones?)/);
  if (mileMatch) return parseFloat(mileMatch[1]);

  // pure number
  const numMatch = s.match(/^(\d+(?:\.\d+)?)/);
  if (numMatch) return parseFloat(numMatch[1]);

  return null;
}

/**
 * Detect if quantity string represents hours as the PRIMARY unit (for lectures like "150hr").
 * "180 lectures (24hr total)" should NOT match — hours is secondary info there.
 */
export function isHoursQuantity(quantityStr?: string): boolean {
  if (!quantityStr) return false;
  const s = quantityStr.toLowerCase();
  // If string contains "lectures" or "강의" before "hr", hours is secondary
  if (/lectures?|강의/.test(s)) return false;
  return /\d+\s*(?:hr|hours?)/i.test(s);
}
