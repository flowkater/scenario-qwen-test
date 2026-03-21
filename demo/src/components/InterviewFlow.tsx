import React, { useEffect, useRef, useState } from 'react'
import { TCData, PathType } from '../types'
import { ChatBubble } from './ChatBubble'
import { SelectionGrid } from './SelectionCard'

interface InterviewFlowProps {
  tc: TCData | null
  path: PathType
  onComplete: (answers: Record<string, string | string[]>) => void
}

interface Step {
  id: string
  question: string
  type: 'choice' | 'input' | 'multiselect' | 'confirm'
  options?: Array<{ label: string; emoji?: string }>
  placeholder?: string
  allowUnsure?: boolean
}

function getExamSteps(tc: TCData | null): Step[] {
  return [
    {
      id: 'subject',
      question: "What subject or exam are you preparing for?",
      type: 'input',
      placeholder: 'e.g., Economics 101, Bar Exam...',
    },
    {
      id: 'examDate',
      question: "When is the exam? 📅",
      type: 'input',
      placeholder: 'e.g., in 2 weeks, March 25...',
      allowUnsure: true,
    },
    {
      id: 'resources',
      question: "What study resources do you have?",
      type: 'multiselect',
      options: [
        { label: 'Textbook', emoji: '📖' },
        { label: 'Lecture notes', emoji: '📝' },
        { label: 'Past exams', emoji: '📄' },
        { label: 'Flashcards', emoji: '🃏' },
        { label: 'Online course', emoji: '💻' },
        { label: '🤷 Not sure', emoji: '' },
      ],
    },
    {
      id: 'quantity',
      question: "How much material? (pages, chapters, hours of content...)",
      type: 'input',
      placeholder: 'e.g., ~250 pages, 6 chapters...',
      allowUnsure: true,
    },
    {
      id: 'confirm',
      question: tc
        ? `Got it! Here's what I have:\n\n📌 "${tc.input.exam?.subject ?? tc.input.name}"\n📅 ${tc.input.exam?.daysLeft ? `${tc.input.exam.daysLeft} days left` : 'date TBD'}\n📚 ${tc.input.resources?.map((r) => r.description).join(', ') ?? 'resources TBD'}\n\nShould I build your plan?`
        : "Sounds good! Ready to build your study plan?",
      type: 'confirm',
      options: [{ label: '✅ Yes, build my plan!' }, { label: '✏️ Change something' }],
    },
  ]
}

function getReadSteps(tc: TCData | null): Step[] {
  return [
    {
      id: 'title',
      question: "What are you reading?",
      type: 'input',
      placeholder: 'Book title, chapter range, article...',
    },
    {
      id: 'purpose',
      question: "Why are you reading it?",
      type: 'choice',
      options: [
        { label: 'For class', emoji: '🎓' },
        { label: 'Self-improvement', emoji: '🌱' },
        { label: 'Just for fun', emoji: '😄' },
        { label: '🤷 Not sure', emoji: '' },
      ],
    },
    {
      id: 'pages',
      question: "How many pages total?",
      type: 'input',
      placeholder: 'e.g., 250 pages, chapters 5-9...',
      allowUnsure: true,
    },
    {
      id: 'deadline',
      question: "Any deadline or target pace?",
      type: 'input',
      placeholder: 'e.g., by Friday, 30 min/day...',
      allowUnsure: true,
    },
    {
      id: 'confirm',
      question: tc
        ? `Perfect! Here's your reading plan setup:\n\n📖 "${tc.input.readDetails?.title ?? tc.input.name}"\n📄 ${tc.input.readDetails?.totalPages ?? '?'} pages\n🎯 ${tc.input.readDetails?.purpose ?? 'reading'}\n\nReady to see the plan?`
        : "Great! Ready to see your reading plan?",
      type: 'confirm',
      options: [{ label: '✅ Build my plan!' }, { label: '✏️ Change something' }],
    },
  ]
}

function getAssignmentSteps(tc: TCData | null): Step[] {
  return [
    {
      id: 'type',
      question: "What kind of assignment?",
      type: 'choice',
      options: [
        { label: 'Essay / Paper', emoji: '✍️' },
        { label: 'Homework set', emoji: '📐' },
        { label: 'Presentation', emoji: '🎤' },
        { label: 'Project', emoji: '🔧' },
        { label: 'Other', emoji: '🤷' },
      ],
    },
    {
      id: 'description',
      question: "Describe the assignment briefly:",
      type: 'input',
      placeholder: 'e.g., 5-page comparative essay, 10 calculus problems...',
    },
    {
      id: 'deadline',
      question: "When is it due?",
      type: 'input',
      placeholder: 'e.g., Friday, Dec 20, in 3 days...',
      allowUnsure: true,
    },
    {
      id: 'confirm',
      question: tc
        ? `Here's what I have:\n\n📋 "${tc.input.assignmentDetails?.description ?? tc.input.name}"\n📅 Due: ${tc.input.assignmentDetails?.deadline ?? 'TBD'}\n\nReady to build the plan?`
        : "All set! Ready to plan this assignment?",
      type: 'confirm',
      options: [{ label: '✅ Build my plan!' }, { label: '✏️ Change something' }],
    },
  ]
}

function getWatchSteps(tc: TCData | null): Step[] {
  return [
    {
      id: 'course',
      question: "What course or video series?",
      type: 'input',
      placeholder: 'e.g., Physics lectures, Udemy React course...',
    },
    {
      id: 'count',
      question: "How many videos/lectures? And how long each?",
      type: 'input',
      placeholder: 'e.g., 8 lectures × 50 min',
      allowUnsure: true,
    },
    {
      id: 'deadline',
      question: "Any deadline for completion?",
      type: 'input',
      placeholder: 'e.g., by midterm in 2 weeks...',
      allowUnsure: true,
    },
    {
      id: 'confirm',
      question: tc
        ? `Got it!\n\n▶️ "${tc.input.watchDetails?.courseName ?? tc.input.name}"\n📊 ${tc.input.watchDetails?.lectureCount ?? '?'} lectures × ${tc.input.watchDetails?.lectureMinutes ?? '?'} min\n\nReady to see the schedule?`
        : "Ready to build your watch schedule?",
      type: 'confirm',
      options: [{ label: '✅ Build my plan!' }, { label: '✏️ Change something' }],
    },
  ]
}

function getPracticeSteps(tc: TCData | null): Step[] {
  return [
    {
      id: 'activity',
      question: "What are you practicing?",
      type: 'choice',
      options: [
        { label: 'Vocabulary / SRS', emoji: '🃏' },
        { label: 'Math problems', emoji: '🔢' },
        { label: 'Coding', emoji: '💻' },
        { label: 'Language drills', emoji: '🌏' },
        { label: 'Other', emoji: '🤷' },
      ],
    },
    {
      id: 'practiceQuantity',
      question: "How much total? (words, problems, exercises...)",
      type: 'input',
      placeholder: 'e.g., 2000 vocabulary words, 300 problems...',
      allowUnsure: true,
    },
    {
      id: 'daily',
      question: "How much time per day can you commit?",
      type: 'choice',
      options: [
        { label: '15 min/day', emoji: '⚡' },
        { label: '30 min/day', emoji: '🕐' },
        { label: '1 hr/day', emoji: '⏰' },
        { label: '2+ hrs/day', emoji: '🔋' },
      ],
    },
    {
      id: 'confirm',
      question: tc
        ? `Got it!\n\n✏️ ${tc.input.practiceDetails?.activity ?? 'Practice'} – ${tc.input.practiceDetails?.totalItems ?? '?'} items\n⏱️ ${tc.input.profile?.timeBudget?.weekday ?? '?'} min/day\n\nReady to build the plan?`
        : "Great! Let me build your practice schedule.",
      type: 'confirm',
      options: [{ label: '✅ Build my plan!' }, { label: '✏️ Change something' }],
    },
  ]
}

function getOtherSteps(): Step[] {
  return [
    {
      id: 'goal',
      question: "Tell me what you want to accomplish:",
      type: 'input',
      placeholder: 'Describe your learning goal...',
    },
    {
      id: 'timeline',
      question: "Any deadline or timeframe?",
      type: 'input',
      placeholder: 'e.g., 3 weeks, by end of month...',
      allowUnsure: true,
    },
    {
      id: 'confirm',
      question: "Understood! Let me craft a custom plan for you.",
      type: 'confirm',
      options: [{ label: '✅ Build my plan!' }, { label: '✏️ Start over' }],
    },
  ]
}

function getSteps(path: PathType, tc: TCData | null): Step[] {
  switch (path) {
    case 'exam': return getExamSteps(tc)
    case 'read': return getReadSteps(tc)
    case 'assignment': return getAssignmentSteps(tc)
    case 'watch': return getWatchSteps(tc)
    case 'practice': return getPracticeSteps(tc)
    case 'other': return getOtherSteps()
  }
}

function getAutoAnswer(step: Step, tc: TCData): string | string[] {
  const input = tc.input
  switch (step.id) {
    case 'subject':
      return input.exam?.subject ?? input.name ?? 'Unknown subject'
    case 'examDate':
      return input.exam?.daysLeft ? `${input.exam.daysLeft} days left` : '🤷 Not sure'
    case 'resources':
      return input.resources?.map((r) => r.type === 'textbook' ? 'Textbook' : r.type === 'lectures' ? 'Lecture notes' : 'Textbook') ?? ['🤷 Not sure']
    case 'quantity':
      return input.resources?.[0]?.quantity ?? '🤷 Not sure'
    case 'title':
      return input.readDetails?.title ?? input.name
    case 'purpose':
      const purposeMap: Record<string, string> = {
        class: 'For class',
        self: 'Self-improvement',
        'just-reading': 'Just for fun',
      }
      return purposeMap[input.readDetails?.purpose ?? ''] ?? 'For class'
    case 'pages':
      return input.readDetails?.totalPages ? `${input.readDetails.totalPages} pages` : '🤷 Not sure'
    case 'deadline':
      return input.readDetails?.deadline ?? input.assignmentDetails?.deadline ?? '🤷 Not sure'
    case 'type':
      return input.assignmentDetails?.type === 'essay' ? 'Essay / Paper' : 'Homework set'
    case 'description':
      return input.assignmentDetails?.description ?? input.name
    case 'course':
      return input.watchDetails?.courseName ?? input.name
    case 'count':
      return input.watchDetails
        ? `${input.watchDetails.lectureCount} lectures × ${input.watchDetails.lectureMinutes} min`
        : '🤷 Not sure'
    case 'activity':
      return input.practiceDetails?.activity === 'vocabulary' ? 'Vocabulary / SRS' : 'Math problems'
    case 'practiceQuantity':
      return input.practiceDetails?.totalItems ? `${input.practiceDetails.totalItems} items` : '🤷 Not sure'
    case 'daily': {
      const min = input.profile?.timeBudget?.weekday ?? 30
      if (min <= 15) return '15 min/day'
      if (min <= 30) return '30 min/day'
      if (min <= 60) return '1 hr/day'
      return '2+ hrs/day'
    }
    case 'confirm':
      return '✅ Build my plan!'
    default:
      return '🤷 Not sure'
  }
}

type Message = { type: 'coach' | 'user'; text: string }

export const InterviewFlow: React.FC<InterviewFlowProps> = ({ tc, path, onComplete }) => {
  const steps = getSteps(path, tc)
  const [currentStep, setCurrentStep] = useState(0)
  const [messages, setMessages] = useState<Message[]>([])
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [inputValue, setInputValue] = useState('')
  const [selectedMulti, setSelectedMulti] = useState<string[]>([])
  const [isAutoPlaying, setIsAutoPlaying] = useState(!!tc)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Show first question
    setTimeout(() => {
      setMessages([{ type: 'coach', text: steps[0].question }])
    }, 200)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-play for TC
  useEffect(() => {
    if (!tc || !isAutoPlaying) return
    if (messages.length === 0) return

    const step = steps[currentStep]
    const answer = getAutoAnswer(step, tc)
    const answerText = Array.isArray(answer) ? answer.join(', ') : answer

    const timer = setTimeout(() => {
      const newMsgs: Message[] = [...messages, { type: 'user', text: answerText }]
      setMessages(newMsgs)
      setAnswers((prev) => ({ ...prev, [step.id]: answer }))

      const nextStep = currentStep + 1
      if (nextStep < steps.length) {
        setTimeout(() => {
          setMessages([...newMsgs, { type: 'coach', text: steps[nextStep].question }])
          setCurrentStep(nextStep)
        }, 500)
      } else {
        setTimeout(() => {
          setIsAutoPlaying(false)
          onComplete({ ...answers, [step.id]: answer })
        }, 600)
      }
    }, 800)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, currentStep, isAutoPlaying])

  const submitAnswer = (value: string | string[]) => {
    const step = steps[currentStep]
    const displayText = Array.isArray(value) ? value.join(', ') : value
    const newMsgs: Message[] = [...messages, { type: 'user', text: displayText }]
    setMessages(newMsgs)
    setAnswers((prev) => ({ ...prev, [step.id]: value }))
    setInputValue('')
    setSelectedMulti([])

    const nextStep = currentStep + 1
    if (nextStep < steps.length) {
      setTimeout(() => {
        setMessages([...newMsgs, { type: 'coach', text: steps[nextStep].question }])
        setCurrentStep(nextStep)
      }, 500)
    } else {
      setTimeout(() => {
        onComplete({ ...answers, [step.id]: value })
      }, 600)
    }
  }

  const step = steps[currentStep]
  const showInput = !isAutoPlaying && step && currentStep < steps.length

  return (
    <div className="flex flex-col h-full">
      {/* User message from TC */}
      {tc && (
        <div className="px-4 pt-3 pb-2">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <div className="text-caption2 text-amber-700 mb-1">📌 TC Scenario</div>
            <p className="text-body2-m text-amber-900 leading-relaxed">{tc.input.userMessage}</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-2 hide-scrollbar">
        {messages.map((msg, i) => (
          <ChatBubble key={i} type={msg.type} message={msg.text} animDelay={0} />
        ))}
        {isAutoPlaying && (
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-sm">🤖</div>
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      {showInput && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50 animate-slide-up">
          {step.type === 'choice' && (
            <SelectionGrid
              options={step.options ?? []}
              onSelect={(v) => submitAnswer(v)}
            />
          )}

          {step.type === 'multiselect' && (
            <div>
              <SelectionGrid
                options={step.options ?? []}
                selected={selectedMulti}
                multi
                onSelect={(v) => {
                  setSelectedMulti((prev) =>
                    prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
                  )
                }}
              />
              {selectedMulti.length > 0 && (
                <button
                  onClick={() => submitAnswer(selectedMulti)}
                  className="w-full mt-3 bg-primary-500 text-white rounded-2xl py-3 text-button1 active:bg-primary-600"
                >
                  Continue →
                </button>
              )}
            </div>
          )}

          {step.type === 'input' && (
            <div>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && inputValue.trim()) submitAnswer(inputValue.trim())
                  }}
                  placeholder={step.placeholder ?? 'Type your answer...'}
                  className="flex-1 bg-white border border-gray-200 rounded-2xl px-4 py-3 text-body1-r text-gray-800 placeholder-gray-400 outline-none focus:border-primary-400"
                />
                <button
                  onClick={() => { if (inputValue.trim()) submitAnswer(inputValue.trim()) }}
                  disabled={!inputValue.trim()}
                  className="w-12 h-12 rounded-2xl bg-primary-500 text-white flex items-center justify-center disabled:bg-gray-200 disabled:text-gray-400 active:bg-primary-600"
                >
                  ➤
                </button>
              </div>
              {step.allowUnsure && (
                <button
                  onClick={() => submitAnswer("🤷 I'm not sure")}
                  className="mt-2 w-full text-center text-caption1 text-gray-400 py-2 rounded-xl hover:bg-gray-100 active:bg-gray-200"
                >
                  🤷 I'm not sure
                </button>
              )}
            </div>
          )}

          {step.type === 'confirm' && (
            <SelectionGrid
              options={step.options ?? []}
              onSelect={(v) => submitAnswer(v)}
            />
          )}
        </div>
      )}
    </div>
  )
}
