/**
 * Subscription protocol type definitions (interfaces only).
 * File is .ts by design: interface definitions only.
 */

export interface IssueRef {
  id: string;
  updated_at: string;
  closed_at: string | null;
}

export interface Issue extends IssueRef {
  // Additional fields are server-defined; keep minimal here to guide clients.
  title?: string;
  status?: string;
  epic_id?: string | null;
  priority?: number;
  issue_type?: string;
  assignee?: string | null;
  labels?: string[];
}

export type SubscriptionType =
  | 'all-issues'
  | 'epics'
  | 'issues-for-epic'
  | 'blocked-issues'
  | 'ready-issues'
  | 'in-progress-issues'
  | 'closed-issues';

export interface SubscribeParamsBase {
  /** Client-chosen subscription id (unique per connection). */
  id: string;
  /** Type of list to subscribe to. */
  type: SubscriptionType;
  /** Optional parameters for the list, e.g., epic_id or filters. */
  params?: Record<string, unknown>;
}

export interface SubscribeMessage extends SubscribeParamsBase {
  kind: 'subscribe';
}

export interface UnsubscribeMessage {
  kind: 'unsubscribe';
  id: string;
}

// Mutation messages are explicit and defined elsewhere in the protocol.
// There is no generic "mutate" command pipe from clients.

export type ClientMessage = SubscribeMessage | UnsubscribeMessage;

export interface SubscribedMessage {
  kind: 'subscribed';
  id: string;
}

export interface UnsubscribedMessage {
  kind: 'unsubscribed';
  id: string;
}

export interface DeltaMessage {
  kind: 'delta';
  id: string;
  added: Issue[];
  updated: Issue[];
  removed: string[]; // ids
}

export interface ErrorMessage {
  kind: 'error';
  id?: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ServerMessage =
  | SubscribedMessage
  | UnsubscribedMessage
  | DeltaMessage
  | ErrorMessage;

export interface SubscriptionRegistryEntry {
  /** Deterministic key: type + serialized params */
  key: string;
  /** Fast-lookup map for diffing */
  itemsById: Map<string, IssueRef>;
  /** Active subscribers (connection-local ids) */
  subscribers: Set<string>;
  /** For metrics and observability (not used for TTL/GC) */
  lastRunAt?: number;
}
