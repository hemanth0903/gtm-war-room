/**
 * Lead comments — per-lead discussion thread.
 *
 * Ownership is the default `_created_by` column: a member may edit/delete
 * only their own comments; admins may manage everything.
 */

import type { CollectionSchema } from 'deepspace/schema'

export interface LeadComment {
  leadId: string
  author: string
  body: string
}

export const leadCommentsSchema: CollectionSchema = {
  name: 'lead_comments',
  columns: [
    { name: 'leadId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'author', storage: 'text', interpretation: 'plain' },
    { name: 'body', storage: 'text', interpretation: 'plain', required: true },
  ],
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
