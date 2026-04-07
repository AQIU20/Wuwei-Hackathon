import type { ReactElement } from 'react'

export function WaitingIndicator({ label = 'thinking...' }: { label?: string }): ReactElement {
  return (
    <div className="message-enter">
      <div className="flex items-center gap-2 border-l border-[var(--term-border)] pl-4">
        <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--term-dim)]" />
        <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--term-dim)]" />
        <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--term-dim)]" />
        <span className="text-[11px] text-[var(--term-dim)]">{label}</span>
      </div>
    </div>
  )
}
