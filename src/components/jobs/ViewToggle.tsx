import { LayoutGrid, List } from 'lucide-react'

import { cn } from '@/lib/utils'

export type ViewMode = 'list' | 'card'

interface ViewToggleProps {
  view: ViewMode
  onViewChange: (view: ViewMode) => void
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div role="radiogroup" aria-label="View mode" className="flex items-center gap-0.5 rounded-md border border-input p-0.5">
      <button
        role="radio"
        aria-checked={view === 'list'}
        aria-label="List view"
        onClick={() => onViewChange('list')}
        className={cn(
          'inline-flex items-center justify-center rounded-sm p-1.5 transition-colors',
          view === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <List className="h-4 w-4" />
      </button>
      <button
        role="radio"
        aria-checked={view === 'card'}
        aria-label="Card view"
        onClick={() => onViewChange('card')}
        className={cn(
          'inline-flex items-center justify-center rounded-sm p-1.5 transition-colors',
          view === 'card' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
    </div>
  )
}
