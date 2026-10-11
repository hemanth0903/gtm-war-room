/**
 * GTM War Room — the pipeline board.
 *
 * Kanban columns per stage with drag-and-drop (persisted through the
 * RecordRoom, live-synced to every client). Presence shows who's here and
 * what they're viewing. Admins get the seed control; members run the board.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutations, useAuthProfileReady } from 'deepspace'
import { Button, EmptyState } from '../../../components/ui'
import { cn } from '@/lib/utils'
import { STAGES } from '../../../lib/scoring'
import type { Lead } from '../../../schemas/leads-schema'
import type { Envelope } from '../../../components/war-room/types'
import { LeadCard } from '../../../components/war-room/LeadCard'
import { LeadDrawer } from '../../../components/war-room/LeadDrawer'
import { SeedButton } from '../../../components/war-room/SeedButton'
import { NewLeadDialog } from '../../../components/war-room/NewLeadDialog'
import { PresenceBar, useWarRoomPresence } from '../../../components/war-room/PresenceBar'

export default function BoardPage() {
  const { records, status } = useQuery<Lead>('leads', { orderBy: 'updatedAt', orderDir: 'desc' })
  const { ready, put } = useMutations<Lead>('leads')
  const { user } = useAuthProfileReady()
  const { updateState } = useWarRoomPresence()

  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const role = user?.role ?? 'viewer'
  const isAdmin = role === 'admin'
  const canWrite = role === 'member' || isAdmin

  // Publish what we're looking at for the presence bar.
  useEffect(() => {
    updateState({ viewingLeadId: openLeadId })
  }, [openLeadId, updateState])

  const byStage = useMemo(() => {
    const map = new Map<string, Envelope<Lead>[]>()
    for (const s of STAGES) map.set(s.id, [])
    for (const r of records ?? []) {
      const stage = r.data.stage ?? 'new'
      const bucket = map.get(stage) ?? map.get('new')!
      bucket.push(r as Envelope<Lead>)
    }
    return map
  }, [records])

  const openLead = useMemo(
    () => (records ?? []).find((r) => r.recordId === openLeadId) as Envelope<Lead> | undefined,
    [records, openLeadId],
  )

  const leadLabel = (leadId: string): string | null => {
    const found = (records ?? []).find((r) => r.recordId === leadId)
    return found ? found.data.company : null
  }

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    setDragOver(null)
    const leadId = e.dataTransfer.getData('text/lead-id')
    if (!leadId || !ready || !canWrite) return
    const current = (records ?? []).find((r) => r.recordId === leadId)
    if (!current || current.data.stage === stageId) return
    void put(leadId, { stage: stageId })
  }

  const total = records?.length ?? 0
  const pipeline = (records ?? []).filter((r) =>
    ['new', 'contacted', 'qualified', 'meeting'].includes(r.data.stage ?? 'new'),
  ).length

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            ⚔️ GTM War Room
          </h1>
          <p className="text-sm text-muted-foreground">
            {pipeline} in pipeline · {total} total leads · live-synced
          </p>
        </div>
        <div className="flex-1" />
        <PresenceBar leadLabel={leadLabel} />
        {isAdmin && <SeedButton />}
        {canWrite && (
          <Button onClick={() => setNewLeadOpen(true)} disabled={!ready}>
            + New lead
          </Button>
        )}
      </div>

      {/* Board */}
      {status === 'loading' ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Loading the board…
        </div>
      ) : total === 0 ? (
        <EmptyState
          title="The board is empty"
          description={
            isAdmin
              ? 'Seed the demo pipeline or add your first lead to get started.'
              : 'Ask an admin to seed the demo pipeline, or add your first lead.'
          }
          action={
            canWrite
              ? { label: '+ New lead', onClick: () => setNewLeadOpen(true) }
              : undefined
          }
        />
      ) : (
        <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-3 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((stage) => {
            const cards = byStage.get(stage.id) ?? []
            return (
              <div
                key={stage.id}
                onDragOver={(e) => {
                  if (canWrite && ready) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOver(stage.id)
                  }
                }}
                onDragLeave={() => setDragOver((cur) => (cur === stage.id ? null : cur))}
                onDrop={(e) => handleDrop(e, stage.id)}
                className={cn(
                  'flex min-h-40 flex-col rounded-xl border bg-muted/30 transition-colors',
                  dragOver === stage.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border',
                )}
                data-testid={`column-${stage.id}`}
              >
                <div className="flex items-center gap-2 px-3 pb-2 pt-3">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: stage.accent }}
                  />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    {stage.label}
                  </h2>
                  <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {cards.length}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3">
                  {cards.map((lead) => (
                    <LeadCard
                      key={lead.recordId}
                      lead={lead}
                      draggable={canWrite && ready}
                      onOpen={() => setOpenLeadId(lead.recordId)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail drawer */}
      <LeadDrawer
        lead={openLead ?? null}
        onClose={() => setOpenLeadId(null)}
        isAdmin={isAdmin}
      />

      <NewLeadDialog open={newLeadOpen} onClose={() => setNewLeadOpen(false)} />
    </div>
  )
}
