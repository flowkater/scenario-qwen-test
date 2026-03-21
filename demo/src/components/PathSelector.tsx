import React from 'react'
import { PathType } from '../types'

interface PathSelectorProps {
  onSelect: (path: PathType) => void
  tcCategory?: string
}

const PATHS: Array<{
  type: PathType
  emoji: string
  label: string
  desc: string
}> = [
  { type: 'exam', emoji: '📝', label: 'Exam', desc: 'Prep for upcoming test' },
  { type: 'read', emoji: '📚', label: 'Read', desc: 'Book or chapter reading' },
  { type: 'assignment', emoji: '📋', label: 'Assignment', desc: 'Essay, homework, project' },
  { type: 'watch', emoji: '▶️', label: 'Watch', desc: 'Lectures or videos' },
  { type: 'practice', emoji: '✏️', label: 'Practice', desc: 'Problems or vocab drills' },
  { type: 'other', emoji: '🤷', label: 'Other', desc: "I'm not sure / other goal" },
]

function categoryToPath(cat: string): PathType {
  if (cat.startsWith('exam')) return 'exam'
  if (cat === 'read') return 'read'
  if (cat === 'assignment') return 'assignment'
  if (cat === 'watch') return 'watch'
  if (cat === 'practice') return 'practice'
  if (cat === 'cross-profile') return 'exam'
  if (cat === 'replan') return 'exam'
  if (cat === 'multi-subject') return 'exam'
  return 'other'
}

export const PathSelector: React.FC<PathSelectorProps> = ({ onSelect, tcCategory }) => {
  const autoPath = tcCategory ? categoryToPath(tcCategory) : null

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 hide-scrollbar">
      <div className="text-title3 text-gray-900 mb-1">What do you want to study?</div>
      <div className="text-body2-m text-gray-500 mb-5">Choose your situation</div>

      <div className="grid grid-cols-2 gap-3">
        {PATHS.map((path, i) => {
          const isAuto = path.type === autoPath
          return (
            <button
              key={path.type}
              onClick={() => onSelect(path.type)}
              className={`
                card-hover rounded-2xl p-4 text-left border-2 animate-slide-up transition-all
                ${isAuto
                  ? 'border-primary-500 bg-primary-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300'
                }
              `}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="text-3xl mb-2">{path.emoji}</div>
              <div className={`text-body1-sb ${isAuto ? 'text-primary-700' : 'text-gray-800'}`}>
                {path.label}
              </div>
              <div className="text-caption1 text-gray-400 mt-0.5">{path.desc}</div>
              {isAuto && (
                <div className="mt-2 inline-flex items-center gap-1 bg-primary-500 text-white text-caption3 px-2 py-0.5 rounded-full">
                  ✓ TC match
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
