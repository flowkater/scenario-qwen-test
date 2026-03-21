import React from 'react'

interface SelectionCardProps {
  label: string
  emoji?: string
  selected?: boolean
  onClick: () => void
  animDelay?: number
  description?: string
}

export const SelectionCard: React.FC<SelectionCardProps> = ({
  label,
  emoji,
  selected,
  onClick,
  animDelay = 0,
  description,
}) => {
  return (
    <button
      onClick={onClick}
      className={`
        card-hover flex-shrink-0 rounded-2xl px-4 py-3 text-left transition-all
        border-2 animate-slide-up
        ${selected
          ? 'border-primary-500 bg-primary-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
        }
      `}
      style={{ animationDelay: `${animDelay}ms` }}
    >
      {emoji && <div className="text-2xl mb-1">{emoji}</div>}
      <div className={`text-button1 ${selected ? 'text-primary-600' : 'text-gray-800'}`}>
        {label}
      </div>
      {description && (
        <div className="text-caption1 text-gray-500 mt-0.5">{description}</div>
      )}
    </button>
  )
}

interface SelectionGridProps {
  options: Array<{ label: string; emoji?: string; description?: string }>
  selected?: string | string[]
  onSelect: (value: string) => void
  multi?: boolean
  animBaseDelay?: number
}

export const SelectionGrid: React.FC<SelectionGridProps> = ({
  options,
  selected,
  onSelect,
  multi = false,
  animBaseDelay = 0,
}) => {
  const isSelected = (label: string) => {
    if (!selected) return false
    if (Array.isArray(selected)) return selected.includes(label)
    return selected === label
  }

  return (
    <div className="flex flex-wrap gap-2 px-4 pb-2">
      {options.map((opt, i) => (
        <SelectionCard
          key={opt.label}
          label={opt.label}
          emoji={opt.emoji}
          description={opt.description}
          selected={isSelected(opt.label)}
          onClick={() => onSelect(opt.label)}
          animDelay={animBaseDelay + i * 60}
        />
      ))}
      {multi && (
        <div className="w-full text-caption1 text-gray-400 pt-1">
          (select all that apply)
        </div>
      )}
    </div>
  )
}
