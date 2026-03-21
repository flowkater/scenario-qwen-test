import React from 'react'

interface EffortBarProps {
  min: number | null
  expected: number | null
  max: number | null
  unit: string
  type?: string
}

export const EffortBar: React.FC<EffortBarProps> = ({ min, expected, max, unit, type }) => {
  if (type === 'unpredictable' || expected === null) {
    return (
      <div className="bg-gray-50 rounded-xl p-3">
        <div className="text-caption1 text-gray-500 mb-1">Effort Model</div>
        <div className="text-body2-m text-gray-700 font-medium">milestone-based</div>
        <div className="text-caption1 text-gray-400">Time varies by progress</div>
      </div>
    )
  }

  const safeMin = min ?? expected * 0.7
  const safeMax = max ?? expected * 1.3
  const range = safeMax - safeMin
  const p25Pct = range > 0 ? ((safeMin - safeMin) / range) * 100 : 0
  const p50Pct = range > 0 ? ((expected - safeMin) / range) * 100 : 50
  // p75 is at max

  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-caption1 text-gray-500">Effort Model</span>
        <span className="text-body2-sb text-gray-800">
          {expected} <span className="text-caption1 text-gray-500">{unit}</span>
        </span>
      </div>

      {/* Bar */}
      <div className="relative h-5 bg-gray-200 rounded-full overflow-hidden mb-1">
        {/* Min → Max fill */}
        <div
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            left: '0%',
            width: '100%',
            background: 'linear-gradient(90deg, #BCCAFF 0%, #4776FF 50%, #1D267A 100%)',
            opacity: 0.25,
          }}
        />
        {/* P50 marker */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-primary-500 rounded-full"
          style={{ left: `calc(${p50Pct}% - 2px)` }}
        />
        {/* P25 marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary-300"
          style={{ left: `${p25Pct}%` }}
        />
      </div>

      <div className="flex justify-between text-caption3 text-gray-400">
        <span>P25: {safeMin.toFixed(1)}</span>
        <span className="text-primary-500 font-semibold">P50: {expected.toFixed(1)}</span>
        <span>P75: {safeMax.toFixed(1)}</span>
      </div>
    </div>
  )
}
