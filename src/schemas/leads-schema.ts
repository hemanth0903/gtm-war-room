/**
 * Leads collection — the core of the GTM War Room.
 *
 * One row per prospect account. The pipeline board renders these as cards
 * grouped by `stage`; every write syncs live to all connected clients via
 * the RecordRoom.
 */

import type { CollectionSchema } from 'deepspace/schema'

export const STAGE_VALUES = [
  'new',
  'contacted',
  'qualified',
  'meeting',
  'closed_won',
  'closed_lost',
] as const

export const SIGNAL_SOURCE_VALUES = [
  'funding_news',
  'job_posting',
  'website_visit',
  'trade_show',
  'tech_change',
  'content_engagement',
  'cold',
] as const

export interface Lead {
  company: string
  contactName: string
  contactTitle?: string
  email?: string
  industry?: string
  companySize?: string
  signalSource: string
  signals?: string
  score?: number
  stage?: string
  owner?: string
  notes?: string
}

export const leadsSchema: CollectionSchema = {
  name: 'leads',
  columns: [
    { name: 'company', storage: 'text', interpretation: 'plain', required: true },
    { name: 'contactName', storage: 'text', interpretation: 'plain', required: true },
    { name: 'contactTitle', storage: 'text', interpretation: 'plain' },
    { name: 'email', storage: 'text', interpretation: 'email' },
    { name: 'industry', storage: 'text', interpretation: 'plain' },
    { name: 'companySize', storage: 'text', interpretation: 'plain' },
    {
      name: 'signalSource',
      storage: 'text',
      interpretation: { kind: 'select', options: [...SIGNAL_SOURCE_VALUES] },
      required: true,
    },
    { name: 'signals', storage: 'text', interpretation: 'plain' },
    { name: 'score', storage: 'number', interpretation: 'plain', default: 0 },
    {
      name: 'stage',
      storage: 'text',
      interpretation: { kind: 'select', options: [...STAGE_VALUES] },
      default: 'new',
    },
    { name: 'owner', storage: 'text', interpretation: 'plain' },
    { name: 'notes', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    // Viewers (not signed-in or read-only) can look but not touch.
    viewer: { read: true, create: false, update: false, delete: false },
    // Members (SDRs) run the pipeline: create, move, edit. Score edits are
    // gated in the UI (admin-only field); the score_lead agent tool is the
    // sanctioned way for anyone to (re)score a lead.
    member: { read: true, create: true, update: true, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
