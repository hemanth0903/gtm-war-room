/**
 * PresenceBar — who else is in the war room right now, and what they're looking at.
 *
 * Uses the PresenceRoom (ephemeral state, not records): each client publishes
 * `{ viewingLeadId }` and we render every other connected peer as an avatar
 * with their current focus. Self is excluded by the hook.
 */

import { usePresenceRoom, useUserLookup, getUserColor } from 'deepspace'
import { Avatar, AvatarFallback } from '../ui'
import { cn } from '@/lib/utils'

export const PRESENCE_SCOPE = 'war-room'

interface PresenceBarProps {
  /** Resolve a leadId to a company name for the "viewing X" label. */
  leadLabel: (leadId: string) => string | null
}

export function useWarRoomPresence() {
  return usePresenceRoom(PRESENCE_SCOPE)
}

export function PresenceBar({ leadLabel }: PresenceBarProps) {
  const { peers, connected } = usePresenceRoom(PRESENCE_SCOPE)
  const { getUser } = useUserLookup()

  if (!connected || peers.length === 0) return null

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        {peers.length} online
      </span>
      <div className="flex items-center gap-2">
        {peers.map((peer) => {
          const info = getUser(peer.userId)
          const name = info?.name ?? peer.userName ?? 'Teammate'
          const viewingId = (peer.state?.viewingLeadId as string | null) ?? null
          const viewing = viewingId ? leadLabel(viewingId) : null
          return (
            <div
              key={peer.userId}
              className="flex items-center gap-1.5"
              title={viewing ? `${name} is viewing ${viewing}` : `${name} is on the board`}
            >
              <Avatar className={cn('h-6 w-6 text-[10px]')}>
                <AvatarFallback style={{ backgroundColor: getUserColor(peer.userId) }}>
                  {name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="max-w-40 truncate text-xs text-muted-foreground">
                {viewing ? (
                  <>
                    <span className="text-foreground">{name.split(' ')[0]}</span>
                    {' → '}
                    {viewing}
                  </>
                ) : (
                  name.split(' ')[0]
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
