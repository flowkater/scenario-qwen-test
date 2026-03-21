import React from 'react'

interface ChatBubbleProps {
  type: 'coach' | 'user'
  message: string
  animDelay?: number
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ type, message, animDelay = 0 }) => {
  if (type === 'coach') {
    return (
      <div
        className="flex items-start gap-2 mb-3 animate-bubble-in"
        style={{ animationDelay: `${animDelay}ms` }}
      >
        <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0 text-sm">
          🤖
        </div>
        <div className="max-w-[78%] bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
          <p className="text-gray-800 text-[15px] leading-relaxed whitespace-pre-wrap">{message}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex items-start gap-2 mb-3 justify-end animate-bubble-in"
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <div
        className="max-w-[78%] rounded-2xl rounded-tr-sm px-4 py-3"
        style={{ background: 'var(--primary-500)' }}
      >
        <p className="text-white text-[15px] leading-relaxed whitespace-pre-wrap">{message}</p>
      </div>
    </div>
  )
}
