import type { ReactElement } from 'react'

export function EmptyState(): ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mb-4 text-2xl text-[var(--term-blue)]">&gt;_</div>
        <p className="text-sm text-[var(--term-text-soft)]">Ready. Type a message to start.</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {['read', 'write', 'edit', 'bash'].map((tool) => (
            <span
              key={tool}
              className="rounded border border-[var(--term-border)] bg-[var(--term-surface)] px-2 py-1 text-[11px] text-[var(--term-dim)]"
            >
              {tool}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
