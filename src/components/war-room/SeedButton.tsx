/**
 * SeedButton — admin-only "Seed demo data" control.
 *
 * Creates the 10 demo leads across pipeline stages via records.create.
 * Refuses to run twice (checks the collection isn't already populated) and
 * stays disabled until the RecordRoom accepts writes.
 */

import { useState } from 'react'
import { useMutations, useQuery } from 'deepspace'
import { Button, useToast } from '../ui'
import { SEED_LEADS } from '../../lib/scoring'
import type { Lead } from '../../schemas/leads-schema'

export function SeedButton() {
  const { ready, create } = useMutations<Lead>('leads')
  const { records, status } = useQuery<Lead>('leads')
  const { success, error } = useToast()
  const [seeding, setSeeding] = useState(false)

  const alreadySeeded = status === 'ready' && records.length > 0

  const seed = async () => {
    if (!ready || seeding || alreadySeeded) return
    setSeeding(true)
    try {
      for (const lead of SEED_LEADS) {
        // Fire sequentially so a denied write surfaces on the right lead.
        await create({ ...lead })
      }
      success('Demo data seeded', `${SEED_LEADS.length} leads across the pipeline`)
    } catch (e) {
      error('Seeding failed', e instanceof Error ? e.message : 'Write failed')
    } finally {
      setSeeding(false)
    }
  }

  if (alreadySeeded) return null

  return (
    <Button onClick={seed} disabled={!ready || seeding || status !== 'ready'} variant="secondary">
      {seeding ? 'Seeding…' : '🌱 Seed demo data'}
    </Button>
  )
}
