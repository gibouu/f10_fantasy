'use client'

import * as React from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Search, UserPlus, CheckCircle2, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { FriendRequestData } from '@/types/domain'
import { FriendRequestStatus } from '@/types/domain'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type SearchResult = {
  id: string
  publicUsername: string | null
  avatarUrl: string | null
  teamLogoUrl?: string | null
  teamColor?: string | null
}

type FriendsData = {
  friends: SearchResult[]
  pendingReceived: FriendRequestData[]
  pendingSent: FriendRequestData[]
}

interface FriendSearchProps {
  currentUserId: string
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function FriendSearch({ currentUserId }: FriendSearchProps) {
  const [query, setQuery] = React.useState('')
  const debouncedQuery = useDebounce(query, 300)

  // Friends + pending requests
  const { data: friendsData, mutate: mutateFriends } = useSWR<FriendsData>(
    '/api/friends',
    fetcher,
  )

  // Search results — only fire when query is non-empty
  const { data: searchResults } = useSWR<SearchResult[]>(
    debouncedQuery.trim().length >= 2
      ? `/api/friends?q=${encodeURIComponent(debouncedQuery.trim())}`
      : null,
    fetcher,
  )

  const [pendingActions, setPendingActions] = React.useState<Set<string>>(new Set())

  const markPending = (id: string) =>
    setPendingActions((s) => new Set(s).add(id))
  const clearPending = (id: string) =>
    setPendingActions((s) => { const n = new Set(s); n.delete(id); return n })

  // ── Send friend request ───────────────────────────────────────────────────
  const handleAdd = async (addresseeId: string) => {
    markPending(addresseeId)
    try {
      await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresseeId }),
      })
      // Refresh friends list
      mutateFriends()
    } finally {
      clearPending(addresseeId)
    }
  }

  // ── Accept / reject ───────────────────────────────────────────────────────
  const handleRequestAction = async (
    requestId: string,
    action: 'accept' | 'reject',
  ) => {
    markPending(requestId)
    try {
      await fetch(`/api/friends/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      mutateFriends()
    } finally {
      clearPending(requestId)
    }
  }

  const friends = friendsData?.friends ?? []
  const pendingReceived = friendsData?.pendingReceived ?? []
  const pendingSent = friendsData?.pendingSent ?? []

  const sentIds = new Set(pendingSent.map((r) => r.addresseeId))
  const friendIds = new Set(friends.map((f) => f.id))

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">Manage Friends</h2>
        <span className="text-sm text-text-tertiary">{friends.length} friends</span>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a player by username..."
          className={cn(
            'w-full rounded-xl bg-surface-elevated border border-[var(--border)] pl-9 pr-4 py-2.5',
            'text-sm text-text-primary placeholder:text-text-tertiary',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background',
          )}
        />
      </div>

      {/* Search results */}
      {debouncedQuery.trim().length >= 2 && searchResults && (
        <div className="flex flex-col gap-1">
          {searchResults.length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-3">No players found.</p>
          ) : (
            searchResults.map((user) => {
              const isFriend = friendIds.has(user.id)
              const hasPending = sentIds.has(user.id)

              return (
                <div
                  key={user.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-elevated transition-colors"
                >
                  <Avatar
                    src={null}
                    name={user.publicUsername ?? user.id}
                    size="md"
                    teamLogoUrl={user.teamLogoUrl}
                    teamColor={user.teamColor}
                  />
                  <span className="flex-1 text-sm text-text-primary truncate">
                    {user.publicUsername ?? 'Anonymous'}
                  </span>
                  {isFriend ? (
                    <span className="text-xs text-[#30d158] font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Friends
                    </span>
                  ) : hasPending ? (
                    <span className="text-xs text-text-tertiary">Pending</span>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={pendingActions.has(user.id)}
                      onClick={() => handleAdd(user.id)}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Pending received requests */}
      {pendingReceived.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-2">
            Friend Requests ({pendingReceived.length})
          </h3>
          <div className="flex flex-col gap-1">
            {pendingReceived.map((req) => (
              <div
                key={req.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-elevated border border-[var(--border)]"
              >
                <Avatar
                  src={null}
                  name={req.requesterUsername ?? req.requesterId}
                  size="md"
                />
                <span className="flex-1 text-sm text-text-primary truncate">
                  {req.requesterUsername ?? 'Anonymous'}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={pendingActions.has(req.id)}
                    onClick={() => handleRequestAction(req.id, 'accept')}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={pendingActions.has(req.id)}
                    onClick={() => handleRequestAction(req.id, 'reject')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current friends list */}
      {friends.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-2">Your Friends</h3>
          <div className="flex flex-col gap-1">
            {friends.map((friend) => (
              <Link
                key={friend.id}
                href={`/profile/${friend.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-elevated transition-colors"
              >
                <Avatar
                  src={null}
                  name={friend.publicUsername ?? friend.id}
                  size="md"
                  teamLogoUrl={friend.teamLogoUrl}
                  teamColor={friend.teamColor}
                />
                <span className="flex-1 text-sm text-text-primary truncate">
                  {friend.publicUsername ?? 'Anonymous'}
                </span>
                <CheckCircle2 className="h-4 w-4 text-[#30d158] shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
