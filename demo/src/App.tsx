import React, { useState } from 'react'
import { TCData, PathType, TC_GROUPS, TCGroup } from './types'
import { ALL_TCS } from './data/loadTCs'
import { NavBar } from './components/NavBar'
import { TCSelector } from './components/TCSelector'
import { OnboardingFlow } from './components/OnboardingFlow'
import { PathSelector } from './components/PathSelector'
import { InterviewFlow } from './components/InterviewFlow'
import { PlanResult } from './components/PlanResult'

type Phase = 'home' | 'onboarding' | 'path-select' | 'interview' | 'result'

const EMOTION_EMOJI: Record<string, string> = {
  neutral: '😐',
  panic: '😱',
  shame: '😔',
  frustration: '😤',
  anxiety: '😰',
  confusion: '😵',
}

const TIME_FIT_COLORS: Record<string, string> = {
  fits: 'text-success-500',
  tight: 'text-warning-500',
  deficit: 'text-danger-500',
  impossible: 'text-gray-400',
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('home')
  const [showDrawer, setShowDrawer] = useState(false)
  const [selectedTC, setSelectedTC] = useState<TCData | null>(null)
  const [onboardingAnswers, setOnboardingAnswers] = useState<Record<string, string>>({})
  const [selectedPath, setSelectedPath] = useState<PathType | null>(null)
  const [interviewAnswers, setInterviewAnswers] = useState<Record<string, string | string[]>>({})

  const handleSelectTC = (tc: TCData) => {
    setSelectedTC(tc)
    setPhase('onboarding')
    setShowDrawer(false)
    setOnboardingAnswers({})
    setSelectedPath(null)
    setInterviewAnswers({})
  }

  const handleStartFresh = () => {
    setSelectedTC(null)
    setPhase('onboarding')
    setOnboardingAnswers({})
    setSelectedPath(null)
    setInterviewAnswers({})
  }

  const handleReset = () => {
    setPhase('home')
    setSelectedTC(null)
    setOnboardingAnswers({})
    setSelectedPath(null)
    setInterviewAnswers({})
  }

  const getNavConfig = () => {
    switch (phase) {
      case 'home':
        return { title: 'Todait Demo', showMenu: true }
      case 'onboarding':
        return { title: 'Onboarding', showBack: true, showMenu: true }
      case 'path-select':
        return { title: 'What to Study?', showBack: true, showMenu: true }
      case 'interview':
        return {
          title: selectedPath
            ? `${selectedPath.charAt(0).toUpperCase() + selectedPath.slice(1)} Interview`
            : 'Interview',
          showBack: true,
          showMenu: true,
        }
      case 'result':
        return {
          title: 'Study Plan',
          showBack: true,
          showMenu: true,
          subtitle: selectedTC?.id,
        }
    }
  }

  const handleBack = () => {
    if (phase === 'result') setPhase('interview')
    else if (phase === 'interview') setPhase('path-select')
    else if (phase === 'path-select') setPhase('onboarding')
    else if (phase === 'onboarding') setPhase('home')
  }

  const navConfig = getNavConfig()

  return (
    <div className="phone-frame">
      <NavBar
        title={navConfig.title}
        subtitle={'subtitle' in navConfig ? navConfig.subtitle : undefined}
        showMenu={'showMenu' in navConfig ? navConfig.showMenu : false}
        showBack={'showBack' in navConfig ? navConfig.showBack : false}
        onMenuClick={() => setShowDrawer(true)}
        onBackClick={handleBack}
      />

      {/* Phase: Home */}
      {phase === 'home' && (
        <HomeScreen
          onStartFresh={handleStartFresh}
          onSelectTC={() => setShowDrawer(true)}
        />
      )}

      {/* Phase: Onboarding */}
      {phase === 'onboarding' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {selectedTC && (
            <div className="px-4 pt-3">
              <TCBadge tc={selectedTC} />
            </div>
          )}
          <OnboardingFlow
            tc={selectedTC}
            onComplete={(answers) => {
              setOnboardingAnswers(answers)
              if (selectedTC) {
                // Auto-advance to path-select
                setTimeout(() => setPhase('path-select'), 400)
              } else {
                setPhase('path-select')
              }
            }}
          />
        </div>
      )}

      {/* Phase: Path Select */}
      {phase === 'path-select' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {selectedTC && (
            <div className="px-4 pt-3">
              <TCBadge tc={selectedTC} />
            </div>
          )}
          <PathSelector
            tcCategory={selectedTC?.category}
            onSelect={(path) => {
              setSelectedPath(path)
              setPhase('interview')
            }}
          />
        </div>
      )}

      {/* Phase: Interview */}
      {phase === 'interview' && selectedPath && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {selectedTC && (
            <div className="px-4 pt-3">
              <TCBadge tc={selectedTC} />
            </div>
          )}
          <InterviewFlow
            tc={selectedTC}
            path={selectedPath}
            onComplete={(answers) => {
              setInterviewAnswers(answers)
              setPhase('result')
            }}
          />
        </div>
      )}

      {/* Phase: Result */}
      {phase === 'result' && selectedTC && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <PlanResult tc={selectedTC} onReset={handleReset} />
        </div>
      )}

      {/* Phase: Result (no TC) */}
      {phase === 'result' && !selectedTC && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <div className="text-5xl mb-4">📋</div>
          <h3 className="text-title3 text-gray-800 mb-2">Plan Generated!</h3>
          <p className="text-body2-m text-gray-500 mb-6">
            In a real app, the AI coach would generate your plan here.
          </p>
          <button
            onClick={handleReset}
            className="bg-primary-500 text-white rounded-2xl px-8 py-3 text-button1 active:bg-primary-600"
          >
            Start Over
          </button>
        </div>
      )}

      {/* Fixed bottom CTA for result */}
      {phase === 'result' && (
        <div
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-mobile px-4 py-4 bg-white border-t border-gray-200"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={handleReset}
            className="w-full bg-primary-500 text-white rounded-2xl py-3.5 text-button1 active:bg-primary-600 transition-colors"
          >
            Try Another Scenario
          </button>
        </div>
      )}

      {/* TC Selector Drawer */}
      {showDrawer && (
        <TCSelector
          onSelect={handleSelectTC}
          selectedId={selectedTC?.id}
          onClose={() => setShowDrawer(false)}
        />
      )}
    </div>
  )
}

// Home Screen
const HomeScreen: React.FC<{ onStartFresh: () => void; onSelectTC: () => void }> = ({
  onStartFresh,
  onSelectTC,
}) => {
  const groups = Object.keys(TC_GROUPS) as TCGroup[]
  const grouped = groups.map((g) => ({
    group: g,
    info: TC_GROUPS[g],
    tcs: ALL_TCS.filter((tc) => tc.group === g),
  }))

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar pb-8">
      {/* Hero */}
      <div className="px-5 pt-6 pb-4">
        <div className="text-display2 text-gray-900 leading-tight">
          Todait<br />
          <span className="text-primary-500">AI Coach</span>
        </div>
        <p className="text-body1-r text-gray-500 mt-2 leading-relaxed">
          42 test case scenarios for the onboarding + AddPlan flow
        </p>
      </div>

      {/* CTA Buttons */}
      <div className="px-4 flex gap-3 mb-6">
        <button
          onClick={onSelectTC}
          className="flex-1 bg-primary-500 text-white rounded-2xl py-3.5 text-button1 active:bg-primary-600 transition-colors"
        >
          Browse 42 TCs
        </button>
        <button
          onClick={onStartFresh}
          className="flex-1 bg-white border-2 border-gray-200 text-gray-700 rounded-2xl py-3.5 text-button1 active:bg-gray-50 transition-colors"
        >
          Try Free Flow
        </button>
      </div>

      {/* Stats */}
      <div className="px-4 grid grid-cols-3 gap-2 mb-6">
        {[
          { label: 'Test Cases', value: '42', emoji: '🧪' },
          { label: 'Categories', value: '10', emoji: '📂' },
          { label: 'Emotions', value: '6', emoji: '🎭' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl p-3 text-center border border-gray-200">
            <div className="text-xl mb-1">{stat.emoji}</div>
            <div className="text-title2 text-gray-900">{stat.value}</div>
            <div className="text-caption3 text-gray-400">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* TC Groups */}
      <div className="px-4">
        <div className="text-caption1 text-gray-400 mb-3 uppercase tracking-wider">Scenario Groups</div>
        <div className="space-y-2">
          {grouped.map(({ group, info, tcs }) => (
            <div key={group} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-3">
                <span className="text-xl">{info.emoji}</span>
                <div className="flex-1">
                  <div className="text-body2-sb text-gray-800">
                    {group}. {info.label}
                  </div>
                  <div className="text-caption3 text-gray-400">
                    TC-{String(info.range[0]).padStart(2, '0')}~{String(info.range[1]).padStart(2, '0')} · {tcs.length} cases
                  </div>
                </div>
              </div>
              {/* Mini TC list */}
              <div className="border-t border-gray-100 px-4 py-2 flex flex-wrap gap-x-3 gap-y-1">
                {tcs.map((tc) => (
                  <div key={tc.id} className="flex items-center gap-1 text-caption3 text-gray-500">
                    <span>{EMOTION_EMOJI[tc.input.emotionProtocol] ?? '😐'}</span>
                    <span className={`font-semibold ${TIME_FIT_COLORS[tc.expected.expectedTimeFit] ?? ''}`}>
                      {tc.expected.expectedTimeFit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// TC Badge chip
const TCBadge: React.FC<{ tc: TCData }> = ({ tc }) => (
  <div className="flex items-center gap-2 bg-primary-50 border border-primary-200 rounded-xl px-3 py-2 mb-2 animate-fade-in">
    <span className="text-caption2 text-primary-600 font-mono">{tc.id.toUpperCase()}</span>
    <span className="text-caption3 text-primary-400">·</span>
    <span className="text-caption2 text-primary-700 truncate">{tc.name}</span>
  </div>
)
