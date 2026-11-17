import React from 'react';

interface NavbarProps {
  activeView: 'landing' | 'studio';
  hasClips: boolean;
  onNavigateLanding: (sectionId?: string) => void;
  onOpenStudio: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  hasClips,
  onNavigateLanding,
  onOpenStudio,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full bg-black/70 backdrop-blur-2xl border-b border-white/[0.08]">
      <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onNavigateLanding()}
          className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-md px-1"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="text-white shrink-0"
          >
            <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M9 3V21" stroke="currentColor" strokeWidth="1.75" />
            <path d="M13.5 9.5L17.5 12L13.5 14.5V9.5Z" fill="#F59E0B" />
          </svg>
          <span>FrameCut</span>
        </button>

        {/* Zone 2: 4 concise single-line nav links */}
        <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-7 text-sm font-medium text-neutral-400">
          <button
            type="button"
            onClick={onOpenStudio}
            className={`relative py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer hover:text-white ${
              activeView === 'studio' ? 'text-white' : ''
            }`}
          >
            Studio
          </button>
          <button
            type="button"
            onClick={() => onNavigateLanding('templates-section')}
            className="py-1 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Templates
          </button>
          <button
            type="button"
            onClick={() => onNavigateLanding('publishing-section')}
            className="py-1 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Publishing
          </button>
          <button
            type="button"
            onClick={() => onNavigateLanding('workflow-section')}
            className="py-1 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Workflow
          </button>
        </nav>

        {/* Zone 3: 1 primary glass action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={activeView === 'studio' ? () => onNavigateLanding('hero-ingest') : onOpenStudio}
            className="glass-btn-primary px-4 py-2 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            {activeView === 'studio' ? 'New Video' : hasClips ? 'Resume Studio' : 'Open Studio'}
          </button>
        </div>
      </div>
    </header>
  );
};
