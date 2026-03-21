import React, { useState } from 'react'
import { TCData, TCGroup, TC_GROUPS } from '../types'
import { ALL_TCS } from '../data/loadTCs'

interface TCSelectorProps {
  onSelect: (tc: TCData) => void
  selectedId?: string
  onClose: () => void
}

const EMOTION_EMOJI: Record<string, string> = {
  neutral: '😐',
  panic: '😱',
  shame: '😔',
  frustration: '😤',
  anxiety: '😰',
  confusion: '😵',
}

export const TCSelector: React.FC<TCSelectorProps> = ({ onSelect, selectedId, onClose }) => {
  const [expandedGroup, setExpandedGroup] = useState<TCGroup | null>(null)

  const tcsByGroup = Object.keys(TC_GROUPS).reduce((acc, g) => {
    acc[g as TCGroup] = ALL_TCS.filter((tc) => tc.group === g)
    return acc
  }, {} as Record<TCGroup, TCData[]>)

  return (
    <>
      {/* Overlay */}
      <div className="drawer-overlay" onClick={onClose} />

      {/* Drawer */}
      <div className="drawer">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-4 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-title4 text-gray-900">Test Cases</h2>
              <p className="text-caption1 text-gray-400 mt-0.5">42 scenarios</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="pb-8">
          {(Object.keys(TC_GROUPS) as TCGroup[]).map((group) => {
            const info = TC_GROUPS[group]
            const tcs = tcsByGroup[group] ?? []
            const isExpanded = expandedGroup === group

            return (
              <div key={group} className="border-b border-gray-100">
                {/* Group header */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  onClick={() => setExpandedGroup(isExpanded ? null : group)}
                >
                  <span className="text-xl w-8 text-center">{info.emoji}</span>
                  <div className="flex-1 text-left">
                    <div className="text-body2-sb text-gray-800">
                      {group}. {info.label}
                    </div>
                    <div className="text-caption3 text-gray-400">
                      TC-{String(info.range[0]).padStart(2, '0')}~{String(info.range[1]).padStart(2, '0')} · {tcs.length} cases
                    </div>
                  </div>
                  <svg
                    width="16" height="16" viewBox="0 0 16 16" fill="none"
                    className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {/* TC list */}
                {isExpanded && (
                  <div className="bg-gray-50">
                    {tcs.map((tc) => {
                      const numStr = tc.id.replace('tc-', '').padStart(2, '0')
                      const isSelected = tc.id === selectedId
                      const emotion = tc.input.emotionProtocol
                      return (
                        <button
                          key={tc.id}
                          className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-gray-100 last:border-0 transition-colors ${
                            isSelected
                              ? 'bg-primary-50 border-l-4 border-l-primary-500'
                              : 'hover:bg-white active:bg-gray-100'
                          }`}
                          onClick={() => {
                            onSelect(tc)
                            onClose()
                          }}
                        >
                          <span className="text-caption2 text-gray-400 font-mono mt-0.5 w-8 flex-shrink-0">
                            {numStr}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-caption1 leading-snug ${isSelected ? 'text-primary-700' : 'text-gray-700'}`}>
                              {tc.name}
                            </div>
                            <div className="text-caption3 text-gray-400 mt-0.5 flex items-center gap-1">
                              <span>{EMOTION_EMOJI[emotion] ?? '😐'}</span>
                              <span className="capitalize">{emotion}</span>
                              <span>·</span>
                              <span className="uppercase">{tc.expected.expectedTimeFit}</span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
