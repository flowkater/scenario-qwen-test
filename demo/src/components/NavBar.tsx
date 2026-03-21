import React from 'react'

interface NavBarProps {
  title: string
  onMenuClick?: () => void
  onBackClick?: () => void
  showMenu?: boolean
  showBack?: boolean
  subtitle?: string
}

export const NavBar: React.FC<NavBarProps> = ({
  title,
  onMenuClick,
  onBackClick,
  showMenu = false,
  showBack = false,
  subtitle,
}) => {
  return (
    <div
      className="bg-white border-b border-gray-200 flex items-center px-4 py-3 gap-3"
      style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
    >
      {showBack && (
        <button
          onClick={onBackClick}
          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 4L7 10L12.5 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
      {showMenu && (
        <button
          onClick={onMenuClick}
          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-gray-900 font-semibold text-base truncate">{title}</div>
        {subtitle && <div className="text-gray-500 text-xs truncate">{subtitle}</div>}
      </div>
    </div>
  )
}
