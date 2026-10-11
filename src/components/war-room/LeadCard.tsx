/**
 * LeadCard — a draggable pipeline card.
 *
 * Drag-and-drop uses native HTML5 DnD: the card sets its recordId on
 * dragstart; columns accept the drop and persist the stage change through
 * the RecordRoom (live-synced to every client).
 */

import { Badge } from '../ui'
import { cn } from '@/lib/utils'
import { SIGNAL_SOURCE_LABELS } from '../../lib/scoring'
import type { Lead } from '../../schemas/leads-schema'
import type { Envelope } from './types'

export function scoreVariant(score: number): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (score >= 75) return 'success'
  if (score >= 50) return 'warning'
  if (score >= 25) return 'destructive'
  return 'secondary'
}

interface LeadCardProps {
  lead: Envelope<Lead>
  draggable: boolean
  onOpen: () => void
}

export function LeadCard({ lead, draggable, onOpen }: LeadCardProps) {
  const d = lead.data
  const score = d.score ?? 0

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/lead-id', lead.recordId)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={onOpen}
      className={cn(
        'group cursor-pointer rounded-lg border border-border bg-card p-3 shadow-sm transition-all',
        'hover:border-primary/50 hover:shadow-md',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
      )}
      data-testid={`lead-card-${lead.recordId}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-tight text-foreground">{d.company}</h4>
        <Badge variant={scoreVariant(score)} size="sm" className="shrink-0 tabular-nums">
          {score}
        </Badge>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {d.contactName}
        {d.contactTitle ? ` · ${d.contactTitle}` : ''}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-muted-foreground">
          {SIGNAL_SOURCE_LABELS[d.signalSource] ?? d.signalSource}
        </span>
        {d.owner && d.owner !== 'Unassigned' && (
          <span className="shrink-0 text-[11px] font-medium text-foreground/80">{d.owner}</span>
        )}
      </div>
    </div>
  )
}
