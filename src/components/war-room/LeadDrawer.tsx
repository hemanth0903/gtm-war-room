/**
 * LeadDrawer — full lead detail in a modal.
 *
 * - Every field editable inline EXCEPT score: the score input is disabled
 *   for non-admins (admins may override manually).
 * - "Score with AI" runs the deterministic score_lead rubric (the same
 *   function the assistant's score_lead tool uses) and persists the score.
 * - "Draft outreach" runs the draft_outreach builder and shows the email in
 *   a copyable modal. Nothing is written by drafting.
 * - Comments thread at the bottom (member create/read, author-or-admin delete).
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutations, useQuery, useAuthProfileReady } from 'deepspace'
import {
  Modal,
  Button,
  Input,
  Textarea,
  Label,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  useToast,
} from '../ui'
import { cn } from '@/lib/utils'
import {
  STAGES,
  SIGNAL_SOURCE_LABELS,
  scoreLead,
  buildOutreach,
  type OutreachDraft,
} from '../../lib/scoring'
import { SIGNAL_SOURCE_VALUES, type Lead } from '../../schemas/leads-schema'
import type { LeadComment } from '../../schemas/lead-comments-schema'
import type { Envelope } from './types'
import { scoreVariant } from './LeadCard'

interface LeadDrawerProps {
  lead: Envelope<Lead> | null
  onClose: () => void
  isAdmin: boolean
}

export function LeadDrawer({ lead, onClose, isAdmin }: LeadDrawerProps) {
  const { put, putConfirmed, remove, ready } = useMutations<Lead>('leads')
  const comments = useMutations<LeadComment>('lead_comments')
  const { records: allComments } = useQuery<LeadComment>('lead_comments', {
    where: lead ? { leadId: lead.recordId } : undefined,
    orderBy: 'createdAt',
    orderDir: 'asc',
  })
  const { user } = useAuthProfileReady()
  const { success, error } = useToast()

  const [draft, setDraft] = useState<Lead>(() => ({ ...(lead?.data ?? {} as Lead) }))
  const [scoring, setScoring] = useState(false)
  const [scoreReasons, setScoreReasons] = useState<string[] | null>(null)
  const [outreach, setOutreach] = useState<OutreachDraft | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset the editable draft whenever a different lead opens.
  useEffect(() => {
    setDraft({ ...(lead?.data ?? ({} as Lead)) })
    setScoreReasons(null)
    setOutreach(null)
    setCommentBody('')
  }, [lead?.recordId])

  const thread = useMemo(
    () => (allComments ?? []).filter((c) => c.data.leadId === lead?.recordId),
    [allComments, lead?.recordId],
  )

  if (!lead) return null
  const d = lead.data
  const score = d.score ?? 0

  const set = <K extends keyof Lead>(key: K, value: Lead[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const saveField = async <K extends keyof Lead>(key: K, value: Lead[K]) => {
    if (!ready) return
    set(key, value)
    try {
      await put(lead.recordId, { [key]: value } as Partial<Lead>)
    } catch (e) {
      error('Could not save', e instanceof Error ? e.message : 'Write failed')
    }
  }

  const handleScore = async () => {
    if (!ready) return
    setScoring(true)
    try {
      const breakdown = scoreLead({ ...d, ...draft })
      await putConfirmed(lead.recordId, { score: breakdown.score })
      setScoreReasons(breakdown.reasons)
      success(`Scored ${breakdown.score}/100`, 'Score saved to the lead')
    } catch (e) {
      error('Scoring failed', e instanceof Error ? e.message : 'Write failed')
    } finally {
      setScoring(false)
    }
  }

  const handleDraftOutreach = () => {
    setOutreach(buildOutreach({ ...d, ...draft }))
  }

  const copyOutreach = async () => {
    if (!outreach) return
    try {
      await navigator.clipboard.writeText(`Subject: ${outreach.subject}\n\n${outreach.body}`)
      success('Copied', 'Outreach email copied to clipboard')
    } catch {
      error('Copy failed', 'Select the text manually')
    }
  }

  const addComment = async () => {
    const body = commentBody.trim()
    if (!body || !comments.ready) return
    try {
      await comments.createConfirmed({
        leadId: lead.recordId,
        author: user?.name ?? user?.email ?? 'Teammate',
        body,
      })
      setCommentBody('')
    } catch (e) {
      error('Could not post', e instanceof Error ? e.message : 'Write failed')
    }
  }

  const deleteComment = async (id: string) => {
    try {
      await comments.remove(id)
    } catch (e) {
      error('Could not delete', e instanceof Error ? e.message : 'Write failed')
    }
  }

  const deleteLead = async () => {
    if (!isAdmin || !ready) return
    if (!window.confirm(`Delete ${d.company}? This cannot be undone.`)) return
    try {
      await remove(lead.recordId)
      onClose()
    } catch (e) {
      error('Could not delete', e instanceof Error ? e.message : 'Write failed')
    }
  }

  const field = 'flex flex-col gap-1.5'

  return (
    <>
      <Modal open={!!lead} onClose={onClose} size="xl" aria-label={`${d.company} details`}>
        <Modal.Title className="flex items-center justify-between gap-3 pr-8">
          <span className="truncate text-lg font-semibold">{d.company}</span>
          <Badge variant={scoreVariant(score)} className="tabular-nums">
            Score {score}
          </Badge>
        </Modal.Title>

        <div className="mt-4 grid max-h-[70vh] grid-cols-1 gap-6 overflow-y-auto pr-1 md:grid-cols-2">
          {/* Left: fields */}
          <div className="flex flex-col gap-4">
            <div className={field}>
              <Label>Stage</Label>
              <Select
                value={draft.stage ?? 'new'}
                onValueChange={(v) => void saveField('stage', v)}
                disabled={!ready}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className={field}>
                <Label>Contact name</Label>
                <Input
                  value={draft.contactName ?? ''}
                  onChange={(e) => set('contactName', e.target.value)}
                  onBlur={(e) => void saveField('contactName', e.target.value)}
                  disabled={!ready}
                />
              </div>
              <div className={field}>
                <Label>Title</Label>
                <Input
                  value={draft.contactTitle ?? ''}
                  onChange={(e) => set('contactTitle', e.target.value)}
                  onBlur={(e) => void saveField('contactTitle', e.target.value)}
                  disabled={!ready}
                />
              </div>
            </div>

            <div className={field}>
              <Label>Email</Label>
              <Input
                value={draft.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
                onBlur={(e) => void saveField('email', e.target.value)}
                disabled={!ready}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className={field}>
                <Label>Industry</Label>
                <Input
                  value={draft.industry ?? ''}
                  onChange={(e) => set('industry', e.target.value)}
                  onBlur={(e) => void saveField('industry', e.target.value)}
                  disabled={!ready}
                />
              </div>
              <div className={field}>
                <Label>Company size</Label>
                <Input
                  value={draft.companySize ?? ''}
                  placeholder="e.g. 850 employees"
                  onChange={(e) => set('companySize', e.target.value)}
                  onBlur={(e) => void saveField('companySize', e.target.value)}
                  disabled={!ready}
                />
              </div>
            </div>

            <div className={field}>
              <Label>Signal source</Label>
              <Select
                value={draft.signalSource ?? 'cold'}
                onValueChange={(v) => void saveField('signalSource', v)}
                disabled={!ready}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIGNAL_SOURCE_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SIGNAL_SOURCE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={field}>
              <Label>Signals</Label>
              <Textarea
                value={draft.signals ?? ''}
                rows={3}
                onChange={(e) => set('signals', e.target.value)}
                onBlur={(e) => void saveField('signals', e.target.value)}
                disabled={!ready}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className={field}>
                <Label>Owner</Label>
                <Input
                  value={draft.owner ?? ''}
                  onChange={(e) => set('owner', e.target.value)}
                  onBlur={(e) => void saveField('owner', e.target.value)}
                  disabled={!ready}
                />
              </div>
              <div className={field}>
                <Label>
                  Score{' '}
                  {!isAdmin && (
                    <span className="font-normal text-muted-foreground">(admin only)</span>
                  )}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.score ?? 0}
                  disabled={!isAdmin || !ready}
                  title={isAdmin ? 'Manual override' : 'Only admins can edit the score manually — use Score with AI'}
                  onChange={(e) => set('score', Number(e.target.value))}
                  onBlur={(e) => {
                    if (isAdmin) void saveField('score', Number(e.target.value))
                  }}
                />
              </div>
            </div>

            <div className={field}>
              <Label>Notes</Label>
              <Textarea
                value={draft.notes ?? ''}
                rows={2}
                onChange={(e) => set('notes', e.target.value)}
                onBlur={(e) => void saveField('notes', e.target.value)}
                disabled={!ready}
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={handleScore} disabled={!ready || scoring}>
                {scoring ? 'Scoring…' : '⚡ Score with AI'}
              </Button>
              <Button variant="secondary" onClick={handleDraftOutreach} disabled={!ready}>
                ✉️ Draft outreach
              </Button>
              {isAdmin && (
                <Button variant="destructive" onClick={deleteLead} disabled={!ready || saving}>
                  Delete lead
                </Button>
              )}
            </div>

            {scoreReasons && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Why this score
                </p>
                <ul className="flex flex-col gap-1 text-sm">
                  {scoreReasons.map((r, i) => (
                    <li key={i} className="text-foreground/90">
                      • {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Right: comments */}
          <div className="flex min-h-60 flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              Comments <span className="font-normal text-muted-foreground">({thread.length})</span>
            </h3>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3">
              {thread.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No comments yet — kick off the thread.
                </p>
              )}
              {thread.map((c) => {
                const mine = user && c.createdBy === user.id
                return (
                  <div key={c.recordId} className="rounded-md bg-card p-2.5 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">{c.data.author}</span>
                      {(mine || isAdmin) && (
                        <button
                          onClick={() => void deleteComment(c.recordId)}
                          className="text-[11px] text-muted-foreground hover:text-destructive"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{c.data.body}</p>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2">
              <Input
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addComment()
                }}
                placeholder="Add a comment…"
                disabled={!comments.ready}
                className="flex-1"
              />
              <Button onClick={addComment} disabled={!comments.ready || !commentBody.trim()}>
                Post
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Outreach draft modal */}
      <Modal
        open={!!outreach}
        onClose={() => setOutreach(null)}
        size="lg"
        aria-label="Outreach draft"
      >
        <Modal.Title>Draft outreach</Modal.Title>
        {outreach && (
          <div className="mt-4 flex flex-col gap-3">
            <div className={cn(field)}>
              <Label>Subject</Label>
              <Input value={outreach.subject} readOnly />
            </div>
            <div className={cn(field)}>
              <Label>Body</Label>
              <Textarea value={outreach.body} rows={12} readOnly className="font-mono text-xs" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOutreach(null)}>
                Close
              </Button>
              <Button onClick={copyOutreach}>📋 Copy email</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
