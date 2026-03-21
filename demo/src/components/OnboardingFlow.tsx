import React, { useEffect, useRef, useState } from 'react'
import { TCData } from '../types'
import { ChatBubble } from './ChatBubble'
import { SelectionGrid } from './SelectionCard'

interface OnboardingFlowProps {
  tc: TCData | null
  onComplete: (answers: Record<string, string>) => void
}

interface Step {
  id: string
  question: string
  options?: Array<{ label: string; emoji?: string }>
  type: 'choice' | 'text'
}

const STEPS_BY_ROLE: Record<string, Step[]> = {
  student: [
    {
      id: 'year',
      question: "What year are you in?",
      type: 'choice',
      options: [
        { label: 'Freshman', emoji: '🌱' },
        { label: 'Sophomore', emoji: '📗' },
        { label: 'Junior', emoji: '📘' },
        { label: 'Senior', emoji: '🎓' },
      ],
    },
    {
      id: 'focusSpan',
      question: "How long can you focus in one sitting?",
      type: 'choice',
      options: [
        { label: '< 20 min', emoji: '⚡' },
        { label: '20–40 min', emoji: '🕐' },
        { label: '40–60 min', emoji: '⏰' },
        { label: '60+ min', emoji: '🔋' },
      ],
    },
  ],
  working: [
    {
      id: 'timeBudget',
      question: "How much time can you dedicate daily?",
      type: 'choice',
      options: [
        { label: '< 30 min', emoji: '⚡' },
        { label: '30–60 min', emoji: '🕐' },
        { label: '1–2 hrs', emoji: '⏰' },
        { label: '2+ hrs', emoji: '🔋' },
      ],
    },
  ],
  'exam-prep': [
    {
      id: 'examType',
      question: "What kind of exam?",
      type: 'choice',
      options: [
        { label: 'Certification', emoji: '📜' },
        { label: 'Bar / Medical', emoji: '⚖️' },
        { label: 'High School', emoji: '🏫' },
        { label: 'Language Test', emoji: '🌏' },
      ],
    },
  ],
  self: [
    {
      id: 'readSpeed',
      question: "How would you rate your reading speed?",
      type: 'choice',
      options: [
        { label: 'Slow (< 15p/hr)', emoji: '🐢' },
        { label: 'Average (15–25p/hr)', emoji: '🚶' },
        { label: 'Fast (25–35p/hr)', emoji: '🏃' },
        { label: 'Very fast (35+)', emoji: '🚀' },
      ],
    },
  ],
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ tc, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [visibleMessages, setVisibleMessages] = useState<Array<{ type: 'coach' | 'user'; text: string }>>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  const role = answers.role

  const allSteps: Step[] = [
    {
      id: 'role',
      question: "Hi! I'm your study coach 👋\n\nWhat best describes you?",
      type: 'choice',
      options: [
        { label: 'Student', emoji: '🎓' },
        { label: 'Working', emoji: '💼' },
        { label: 'Exam Prep', emoji: '📝' },
        { label: 'Self-learner', emoji: '🌱' },
      ],
    },
    ...(role ? STEPS_BY_ROLE[role.toLowerCase().replace('-', '-')] ?? STEPS_BY_ROLE.self : []),
  ]

  // Auto-fill from TC data
  useEffect(() => {
    if (!tc) return
    const { profile } = tc.input
    if (!profile) return

    const autoAnswers: Record<string, string> = {}
    if (profile.role) {
      const roleMap: Record<string, string> = {
        student: 'Student',
        working: 'Working',
        'exam-prep': 'Exam Prep',
        self: 'Self-learner',
      }
      autoAnswers.role = roleMap[profile.role] ?? 'Student'
    }
    if (profile.year) {
      const yearMap: Record<string, string> = {
        freshman: 'Freshman',
        sophomore: 'Sophomore',
        junior: 'Junior',
        senior: 'Senior',
      }
      autoAnswers.year = yearMap[profile.year] ?? 'Junior'
    }
    if (profile.focusSpan) {
      if (profile.focusSpan < 20) autoAnswers.focusSpan = '< 20 min'
      else if (profile.focusSpan < 40) autoAnswers.focusSpan = '20–40 min'
      else if (profile.focusSpan < 60) autoAnswers.focusSpan = '40–60 min'
      else autoAnswers.focusSpan = '60+ min'
    }

    // Play through steps automatically
    let delay = 400
    const msgs: Array<{ type: 'coach' | 'user'; text: string }> = []

    const playStep = (stepIdx: number, currentAnswers: Record<string, string>) => {
      const localSteps: Step[] = [
        {
          id: 'role',
          question: "Hi! I'm your study coach 👋\n\nWhat best describes you?",
          type: 'choice',
          options: [
            { label: 'Student', emoji: '🎓' },
            { label: 'Working', emoji: '💼' },
            { label: 'Exam Prep', emoji: '📝' },
            { label: 'Self-learner', emoji: '🌱' },
          ],
        },
        ...(currentAnswers.role
          ? (STEPS_BY_ROLE[currentAnswers.role.toLowerCase().replace(' ', '-')] ?? STEPS_BY_ROLE.self)
          : []),
      ]

      if (stepIdx >= localSteps.length) {
        setTimeout(() => {
          setAnswers(currentAnswers)
          setCurrentStep(localSteps.length)
          onComplete(currentAnswers)
        }, delay)
        return
      }

      const step = localSteps[stepIdx]
      const answer = autoAnswers[step.id]

      msgs.push({ type: 'coach', text: step.question })
      setTimeout(() => {
        setVisibleMessages([...msgs])
        setCurrentStep(stepIdx)
        setAnswers({ ...currentAnswers })
      }, delay)
      delay += 500

      if (answer) {
        msgs.push({ type: 'user', text: answer })
        setTimeout(() => {
          setVisibleMessages([...msgs])
        }, delay)
        delay += 400

        const nextAnswers = { ...currentAnswers, [step.id]: answer }
        playStep(stepIdx + 1, nextAnswers)
      }
    }

    playStep(0, {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tc])

  useEffect(() => {
    if (!tc && currentStep === 0 && visibleMessages.length === 0) {
      setTimeout(() => {
        setVisibleMessages([{ type: 'coach', text: allSteps[0].question }])
      }, 300)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visibleMessages])

  const currentStepDef = allSteps[currentStep]

  const handleAnswer = (value: string) => {
    const newAnswers = { ...answers, [currentStepDef.id]: value }
    setAnswers(newAnswers)

    const newMsgs = [...visibleMessages, { type: 'user' as const, text: value }]
    setVisibleMessages(newMsgs)

    const nextStep = currentStep + 1
    const roleForNext = newAnswers.role

    const nextSteps: Step[] = [
      allSteps[0],
      ...(roleForNext
        ? (STEPS_BY_ROLE[roleForNext.toLowerCase().replace(' ', '-')] ?? STEPS_BY_ROLE.self)
        : []),
    ]

    if (nextStep < nextSteps.length) {
      setTimeout(() => {
        setVisibleMessages([...newMsgs, { type: 'coach', text: nextSteps[nextStep].question }])
        setCurrentStep(nextStep)
      }, 500)
    } else {
      setTimeout(() => {
        onComplete(newAnswers)
      }, 600)
    }
  }

  const showOptions = !tc && currentStepDef && currentStep < allSteps.length
  const currentOptions = showOptions ? (currentStepDef?.options ?? []) : []

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 hide-scrollbar">
        {visibleMessages.map((msg, i) => (
          <ChatBubble
            key={i}
            type={msg.type}
            message={msg.text}
            animDelay={0}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Options */}
      {showOptions && currentOptions.length > 0 && (
        <div className="px-4 pb-4 pt-2 animate-slide-up">
          <SelectionGrid
            options={currentOptions}
            onSelect={handleAnswer}
          />
        </div>
      )}
    </div>
  )
}
