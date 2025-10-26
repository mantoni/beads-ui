/**
 * SubscriptionIssueStore interface definitions.
 * File is .ts by design: interfaces only.
 */
import type { DeltaMessage, Issue } from './subscriptions';

/** Stable comparator used by stores for deterministic ordering. */
export type IssueComparator = (a: Issue, b: Issue) => number;

/** Options for creating a subscription-scoped issue store. */
export interface SubscriptionIssueStoreOptions {
  /** Deterministic sort for snapshot(). Defaults to Issues view order. */
  sort?: IssueComparator;
}

/**
 * One subscription == one store.
 * Stores own normalized items for a single subscription id and expose
 * a stable, sorted snapshot for rendering.
 */
export interface SubscriptionIssueStore {
  /** Client-chosen subscription id this store belongs to. */
  readonly id: string;

  /**
   * Subscribe to store changes. Listener is invoked after each applied delta
   * exactly once, regardless of how many items changed.
   * Returns an unsubscribe function.
   */
  subscribe(listener: () => void): () => void;

  /**
   * Apply an initial snapshot (all items in added) or a subsequent delta.
   * The store must be idempotent and ignore stale updates using updated_at.
   */
  applyDelta(delta: DeltaMessage): void;

  /** Stable, read-only snapshot of issues for rendering. */
  snapshot(): readonly Issue[];

  /** Convenience helpers for tests and lookups. */
  size(): number;
  getById(id: string): Issue | undefined;

  /** Release references and listeners when the owning view unmounts. */
  dispose(): void;
}

/** Factory signature for creating subscription stores. */
export interface CreateSubscriptionIssueStore {
  (id: string, options?: SubscriptionIssueStoreOptions): SubscriptionIssueStore;
}
