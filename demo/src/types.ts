export interface TCInput {
  id: string
  category: string
  name: string
  userMessage: string
  emotionProtocol: 'neutral' | 'panic' | 'shame' | 'frustration' | 'anxiety' | 'confusion'
  versionTag: string
  profile?: {
    role?: string
    studentLevel?: string
    collegeType?: string
    year?: string
    level?: string
    focusSpan?: number
    timeBudget?: { weekday: number; weekend: number }
  }
  resources?: Array<{
    type: string
    description: string
    quantity?: string
    isEstimated?: boolean
    watched?: string
  }>
  exam?: {
    subject: string
    daysLeft: number
    examType?: string
  }
  readDetails?: {
    title: string
    purpose?: string
    totalPages?: number
    deadline?: string
  }
  assignmentDetails?: {
    type: string
    description: string
    deadline?: string
  }
  watchDetails?: {
    courseName: string
    lectureCount: number
    lectureMinutes: number
    playbackSpeed?: number | null
  }
  practiceDetails?: {
    activity: string
    method?: string
    totalItems?: number
  }
  subjects?: Array<{
    name: string
    examDate: string
    examOrder: number
    difficulty: string
  }>
  globalBudget?: {
    totalDailyMin: number
    totalDays: number
    totalAvailableMin: number
  }
  originalPlan?: {
    dailyTarget: string
    subject: string
    totalPages?: number
  }
  currentProgress?: {
    daysElapsed: number
    daysMissed: number
    remainingPages: number
    remainingDays: number
    emotionalState: string
  }
  crossProfileGroup?: string
  crossProfileRole?: string
}

export interface TCExpected {
  tcId: string
  emotionProtocol: string
  versionTag: string
  expectedQuestions?: {
    required: string[]
    optional: string[]
    maxCount: number
    decisionValue?: string
  }
  effortModel: {
    type: 'range' | 'unpredictable' | 'milestone' | 'fixed'
    expected: number | null
    min: number | null
    max: number | null
    unit: string
    citation?: string
    layers?: {
      baseProcessing: number
      reviewPractice: number
      sessionOverhead: number
    }
  }
  expectedTimeFit: 'fits' | 'tight' | 'deficit' | 'impossible'
  expectedStrategy?: string[]
  warnings?: string[]
  alternatives?: string[]
  hardFailChecks?: string[]
  toneExpectation?: string
  weekdayTarget?: number
  weekendTarget?: number
  plans?: Array<{
    subject: string
    dailyMinutes?: number
    strategy?: string
  }>
}

export interface TCData {
  id: string
  name: string
  category: string
  group: TCGroup
  input: TCInput
  expected: TCExpected
}

export type TCGroup = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J'

export const TC_GROUPS: Record<TCGroup, { label: string; emoji: string; range: [number, number] }> = {
  A: { label: 'Exam - University', emoji: '🎓', range: [1, 10] },
  B: { label: 'Exam - High School', emoji: '🏫', range: [11, 13] },
  C: { label: 'Exam - Certification', emoji: '📜', range: [14, 18] },
  D: { label: 'Read', emoji: '📚', range: [19, 23] },
  E: { label: 'Assignment', emoji: '📋', range: [24, 26] },
  F: { label: 'Watch', emoji: '▶️', range: [27, 29] },
  G: { label: 'Practice', emoji: '✏️', range: [30, 32] },
  H: { label: 'Cross-Profile', emoji: '🔄', range: [33, 36] },
  I: { label: 'Replan', emoji: '🔁', range: [37, 39] },
  J: { label: 'Multi-Subject', emoji: '📦', range: [40, 42] },
}

export type PathType = 'exam' | 'read' | 'assignment' | 'watch' | 'practice' | 'other'

export interface InterviewStep {
  id: string
  coachMessage: string
  type: 'choice' | 'input' | 'multiselect' | 'confirm' | 'date'
  options?: string[]
  placeholder?: string
  allowUnsure?: boolean
  value?: string | string[] | null
}

export interface DemoState {
  phase: 'tc-select' | 'onboarding' | 'path-select' | 'interview' | 'result'
  selectedTC: TCData | null
  onboardingAnswers: Record<string, string>
  selectedPath: PathType | null
  interviewAnswers: Record<string, string | string[]>
  autoPlayStep: number
}
