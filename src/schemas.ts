/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Add schemas by creating a file in src/schemas/ and importing it here.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { AI_CHATS_SCHEMA } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { leadsSchema } from './schemas/leads-schema'
import { leadCommentsSchema } from './schemas/lead-comments-schema'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  leadsSchema,
  leadCommentsSchema,
  // Enables the in-app assistant + local agent surfaces in worker.ts
  // (registerAgent is gated on this schema being present).
  AI_CHATS_SCHEMA,
]
