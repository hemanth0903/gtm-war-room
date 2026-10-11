/**
 * NewLeadDialog — create a lead from the board header.
 */

import { useState } from 'react'
import { useMutations } from 'deepspace'
import {
  Modal,
  Button,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  useToast,
} from '../ui'
import { SIGNAL_SOURCE_LABELS } from '../../lib/scoring'
import { SIGNAL_SOURCE_VALUES, type Lead } from '../../schemas/leads-schema'

interface NewLeadDialogProps {
  open: boolean
  onClose: () => void
}

const EMPTY: Lead = {
  company: '',
  contactName: '',
  contactTitle: '',
  email: '',
  industry: '',
  companySize: '',
  signalSource: 'cold',
  signals: '',
  score: 0,
  stage: 'new',
  owner: 'Unassigned',
  notes: '',
}

export function NewLeadDialog({ open, onClose }: NewLeadDialogProps) {
  const { ready, create } = useMutations<Lead>('leads')
  const { success, error } = useToast()
  const [form, setForm] = useState<Lead>(EMPTY)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof Lead>(key: K, value: Lead[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const submit = async () => {
    if (!form.company.trim() || !form.contactName.trim() || !ready || saving) return
    setSaving(true)
    try {
      await create({ ...form })
      success('Lead added', `${form.company} is on the board`)
      setForm(EMPTY)
      onClose()
    } catch (e) {
      error('Could not add lead', e instanceof Error ? e.message : 'Write failed')
    } finally {
      setSaving(false)
    }
  }

  const field = 'flex flex-col gap-1.5'

  return (
    <Modal open={open} onClose={onClose} size="md" aria-label="New lead">
      <Modal.Title>Add lead</Modal.Title>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className={field}>
          <Label>Company *</Label>
          <Input value={form.company} onChange={(e) => set('company', e.target.value)} disabled={!ready} />
        </div>
        <div className={field}>
          <Label>Contact name *</Label>
          <Input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} disabled={!ready} />
        </div>
        <div className={field}>
          <Label>Title</Label>
          <Input value={form.contactTitle ?? ''} onChange={(e) => set('contactTitle', e.target.value)} disabled={!ready} />
        </div>
        <div className={field}>
          <Label>Email</Label>
          <Input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} disabled={!ready} />
        </div>
        <div className={field}>
          <Label>Industry</Label>
          <Input value={form.industry ?? ''} onChange={(e) => set('industry', e.target.value)} disabled={!ready} />
        </div>
        <div className={field}>
          <Label>Company size</Label>
          <Input value={form.companySize ?? ''} placeholder="e.g. 850 employees" onChange={(e) => set('companySize', e.target.value)} disabled={!ready} />
        </div>
        <div className={`${field} col-span-2`}>
          <Label>Signal source</Label>
          <Select value={form.signalSource} onValueChange={(v) => set('signalSource', v)} disabled={!ready}>
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
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={!ready || saving || !form.company.trim() || !form.contactName.trim()}
        >
          {saving ? 'Adding…' : 'Add lead'}
        </Button>
      </div>
    </Modal>
  )
}
