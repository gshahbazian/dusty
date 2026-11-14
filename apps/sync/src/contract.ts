import * as Cloudflare from '@alchemy.run/cloudflare'
import type { RuntimeContext } from 'alchemy/RuntimeContext'
import type * as Effect from 'effect/Effect'

import type { SyncTrigger } from '@dusty/db'

import type { AddFeedResult, ImportEntry, ImportResult } from '#/add-feed'

export type { AddFeedResult, ImportEntry, ImportResult, SyncTrigger }

/**
 * Full runs the web app may start. The scheduled run only comes from cron,
 * and a new subscription syncs on its own through `addFeed`.
 */
export type OnDemandTrigger = Exclude<
  SyncTrigger,
  'scheduled' | 'new_subscription'
>

export type SyncRunResult =
  | {
      readonly status: 'ran'
      readonly outcome: 'completed' | 'cut_short'
      readonly feedsSynced: number
      readonly feedsFailed: number
      /** Not started because the run's time budget ran out. */
      readonly feedsSkipped: number
      readonly itemsNew: number
    }
  | { readonly status: 'skipped'; readonly reason: 'running' | 'recent' }

/**
 * The sync service's RPC surface, reached only through the web app's service
 * binding. It has no public URL.
 */
export class Sync extends Cloudflare.Worker<
  Sync,
  {
    readonly syncNow: (
      trigger: OnDemandTrigger
    ) => Effect.Effect<SyncRunResult, never, RuntimeContext>
    /** Subscribe to a feed (or a page that advertises one) and sync it now. */
    readonly addFeed: (
      url: string
    ) => Effect.Effect<AddFeedResult, never, RuntimeContext>
    /** Add OPML entries, their current articles stored as read. */
    readonly importFeeds: (
      entries: readonly ImportEntry[]
    ) => Effect.Effect<readonly ImportResult[], never, RuntimeContext>
  }
>()('Sync') {}
