import React from 'react'
import { TCData } from '../types'
import { EffortBar } from './EffortBar'

interface PlanResultProps {
  tc: TCData
  onReset: () => void
}

const TIME_FIT_CONFIG = {
  fits: { label: 'Fits ✓', className: 'badge-fits', emoji: '✅' },
  tight: { label: 'Tight ⚠️', className: 'badge-tight', emoji: '⚠️' },
  deficit: { label: 'Deficit ⛔', className: 'badge-deficit', emoji: '⛔' },
  impossible: { label: 'Impossible 🚫', className: 'badge-impossible', emoji: '🚫' },
}

const EMOTION_CONFIG: Record<string, { emoji: string; label: string; color: string; message: string }> = {
  neutral: {
    emoji: '😐',
    label: 'Neutral',
    color: 'text-gray-500',
    message: "You're in a good headspace. Let's build a solid plan.",
  },
  panic: {
    emoji: '😱',
    label: 'Panic',
    color: 'text-danger-500',
    message: "I can hear the stress. Deep breath — we'll break this into manageable pieces.",
  },
  shame: {
    emoji: '😔',
    label: 'Shame',
    color: 'text-purple-500',
    message: "Missing days doesn't mean failure. We replan, not self-blame.",
  },
  frustration: {
    emoji: '😤',
    label: 'Frustration',
    color: 'text-warning-500',
    message: "Being behind is frustrating — but the plan ahead is still doable.",
  },
  anxiety: {
    emoji: '😰',
    label: 'Anxiety',
    color: 'text-yellow-500',
    message: "Anxiety is just energy. Let's channel it into a structured plan.",
  },
  confusion: {
    emoji: '😵',
    label: 'Confusion',
    color: 'text-primary-400',
    message: "When things feel unclear, structure helps. Here's a clear path forward.",
  },
}

export const PlanResult: React.FC<PlanResultProps> = ({ tc, onReset }) => {
  const { expected } = tc
  const { input } = tc
  const timeFit = expected.expectedTimeFit
  const fitConfig = TIME_FIT_CONFIG[timeFit] ?? TIME_FIT_CONFIG.fits
  const emotion = input.emotionProtocol ?? 'neutral'
  const emotionConfig = EMOTION_CONFIG[emotion] ?? EMOTION_CONFIG.neutral

  // Compute weekday/weekend targets
  const weekdayBudget = input.profile?.timeBudget?.weekday ?? 60
  const weekendBudget = input.profile?.timeBudget?.weekend ?? 90

  // Effort display
  const effort = expected.effortModel
  const isMultiSubject = input.category === 'multi-subject'
  const subjects = input.subjects ?? []

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 hide-scrollbar space-y-4 pb-24">
      {/* Header */}
      <div className="animate-slide-up">
        <div className="text-caption1 text-gray-400 mb-1">Study Plan Generated</div>
        <h2 className="text-title3 text-gray-900 leading-tight">{input.name}</h2>
        <div className="flex items-center gap-2 mt-2">
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-caption2 font-semibold ${fitConfig.className}`}>
            {fitConfig.label}
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-caption2 bg-gray-100 text-gray-600">
            {effort.type === 'range' ? '📊 Range' : effort.type === 'unpredictable' ? '🎯 Milestone' : '📋 Plan'}
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-caption2 bg-gray-100 text-gray-600">
            {emotionConfig.emoji} {emotionConfig.label}
          </span>
        </div>
      </div>

      {/* Emotion Protocol */}
      <div
        className="animate-slide-up rounded-2xl p-4 border"
        style={{ animationDelay: '60ms', background: '#FAFAFA', borderColor: '#E5E7EB' }}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-lg flex-shrink-0">
            🤖
          </div>
          <div>
            <div className="text-caption1 text-gray-400 mb-1">Coach says:</div>
            <p className="text-body2-m text-gray-700 leading-relaxed">{emotionConfig.message}</p>
            {expected.toneExpectation && (
              <p className="text-caption1 text-gray-400 mt-2 italic">
                "{expected.toneExpectation}"
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Time Budget */}
      <div className="animate-slide-up rounded-2xl bg-white p-4 border border-gray-200" style={{ animationDelay: '120ms' }}>
        <div className="text-caption1 text-gray-400 mb-3">⏱️ Daily Time Budget</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <div className="text-caption3 text-gray-400 mb-1">WEEKDAY</div>
            <div className="text-title3 text-gray-900">{weekdayBudget}<span className="text-caption1 text-gray-400">min</span></div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <div className="text-caption3 text-gray-400 mb-1">WEEKEND</div>
            <div className="text-title3 text-gray-900">{weekendBudget}<span className="text-caption1 text-gray-400">min</span></div>
          </div>
        </div>
      </div>

      {/* Effort Model */}
      <div className="animate-slide-up rounded-2xl bg-white p-4 border border-gray-200" style={{ animationDelay: '180ms' }}>
        <EffortBar
          min={effort.min}
          expected={effort.expected}
          max={effort.max}
          unit={effort.unit}
          type={effort.type}
        />
        {effort.citation && (
          <p className="text-caption3 text-gray-400 mt-2 leading-relaxed">
            📚 {effort.citation}
          </p>
        )}
      </div>

      {/* Multi-subject breakdown */}
      {isMultiSubject && subjects.length > 0 && (
        <div className="animate-slide-up rounded-2xl bg-white p-4 border border-gray-200" style={{ animationDelay: '220ms' }}>
          <div className="text-caption1 text-gray-400 mb-3">📦 Multi-Subject Breakdown</div>
          <div className="space-y-2">
            {subjects.map((subj, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-caption3 font-bold flex-shrink-0">
                  {subj.examOrder}
                </div>
                <div className="flex-1">
                  <div className="text-body2-sb text-gray-800">{subj.name}</div>
                  <div className="text-caption3 text-gray-400">{subj.examDate} · {subj.difficulty}</div>
                </div>
              </div>
            ))}
          </div>
          {input.globalBudget && (
            <div className="mt-3 bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-caption3 text-gray-400">Total available</div>
              <div className="text-body1-sb text-gray-800">{input.globalBudget.totalAvailableMin} min over {input.globalBudget.totalDays} days</div>
            </div>
          )}
        </div>
      )}

      {/* Strategy */}
      {expected.expectedStrategy && expected.expectedStrategy.length > 0 && (
        <div className="animate-slide-up rounded-2xl bg-white p-4 border border-gray-200" style={{ animationDelay: '240ms' }}>
          <div className="text-caption1 text-gray-400 mb-3">🗺️ Study Strategy</div>
          <div className="space-y-2">
            {expected.expectedStrategy.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-primary-500 text-caption1 mt-0.5 flex-shrink-0">→</span>
                <span className="text-body2-m text-gray-700 leading-relaxed">{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expected Questions */}
      {expected.expectedQuestions && (
        <div className="animate-slide-up rounded-2xl bg-white p-4 border border-gray-200" style={{ animationDelay: '280ms' }}>
          <div className="text-caption1 text-gray-400 mb-3">❓ Coach Should Ask</div>
          {expected.expectedQuestions.required.length > 0 && (
            <div className="mb-2">
              <div className="text-caption2 text-gray-500 mb-1">Required:</div>
              {expected.expectedQuestions.required.map((q, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <span className="text-success-500 text-caption1 flex-shrink-0">✓</span>
                  <span className="text-body2-m text-gray-700">{q}</span>
                </div>
              ))}
            </div>
          )}
          {expected.expectedQuestions.optional.length > 0 && (
            <div>
              <div className="text-caption2 text-gray-500 mb-1">Optional:</div>
              {expected.expectedQuestions.optional.map((q, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <span className="text-gray-400 text-caption1 flex-shrink-0">○</span>
                  <span className="text-body2-m text-gray-500">{q}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 text-caption3 text-gray-400">
            Max {expected.expectedQuestions.maxCount} questions
          </div>
        </div>
      )}

      {/* Warnings */}
      {expected.warnings && expected.warnings.length > 0 && (
        <div className="animate-slide-up rounded-2xl border border-warning-500/30 bg-orange-50 p-4" style={{ animationDelay: '320ms' }}>
          <div className="text-caption1 text-warning-500 mb-3">⚠️ Warnings</div>
          <div className="space-y-2">
            {expected.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-warning-500 text-caption1 mt-0.5 flex-shrink-0">!</span>
                <span className="text-body2-m text-amber-800 leading-relaxed">{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hard Fail Checks */}
      {expected.hardFailChecks && expected.hardFailChecks.length > 0 && (
        <div className="animate-slide-up rounded-2xl border border-danger-500/30 bg-red-50 p-4" style={{ animationDelay: '360ms' }}>
          <div className="text-caption1 text-danger-500 mb-3">🚫 Hard Fail Checks</div>
          <div className="space-y-2">
            {expected.hardFailChecks.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-danger-500 text-caption1 mt-0.5 flex-shrink-0">✕</span>
                <span className="text-body2-m text-red-800 leading-relaxed">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alternatives */}
      {expected.alternatives && expected.alternatives.length > 0 && (
        <div className="animate-slide-up rounded-2xl bg-white p-4 border border-gray-200" style={{ animationDelay: '400ms' }}>
          <div className="text-caption1 text-gray-400 mb-3">💡 Alternatives</div>
          <div className="space-y-2">
            {expected.alternatives.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-primary-400 text-caption1 mt-0.5 flex-shrink-0">◆</span>
                <span className="text-body2-m text-gray-700 leading-relaxed">{a}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Replan details */}
      {input.category === 'replan' && input.currentProgress && (
        <div className="animate-slide-up rounded-2xl bg-white p-4 border border-gray-200" style={{ animationDelay: '440ms' }}>
          <div className="text-caption1 text-gray-400 mb-3">🔁 Replan Status</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-caption3 text-gray-400">Days missed</div>
              <div className="text-title3 text-danger-500">{input.currentProgress.daysMissed}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-caption3 text-gray-400">Days left</div>
              <div className="text-title3 text-primary-500">{input.currentProgress.remainingDays}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center col-span-2">
              <div className="text-caption3 text-gray-400">Remaining pages</div>
              <div className="text-title3 text-gray-800">{input.currentProgress.remainingPages}p</div>
            </div>
          </div>
        </div>
      )}

      {/* JSON Preview Toggle */}
      <details className="animate-slide-up rounded-2xl bg-gray-800 text-green-300 overflow-hidden" style={{ animationDelay: '480ms' }}>
        <summary className="px-4 py-3 text-caption1 cursor-pointer text-green-400 select-none">
          🔍 View raw expected output (JSON)
        </summary>
        <pre className="px-4 pb-4 text-xs overflow-x-auto hide-scrollbar leading-relaxed">
          {JSON.stringify(expected, null, 2)}
        </pre>
      </details>

      {/* Reset button space */}
      <div className="h-4" />
    </div>
  )
}
