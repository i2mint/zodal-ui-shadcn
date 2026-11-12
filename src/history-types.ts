/**
 * The shapes of field input history, declared here structurally: `@zodal/store`'s
 * `createFieldHistory()` returns a {@link FieldHistoryStore}, and `@zodal/ui`'s `FormFieldConfig`
 * carries a {@link ResolvedFieldHistory} as `history`. The `@zodal/ui` on npm this package builds
 * against predates both (i2mint/zodal#23), so they are declared here; any object of these shapes
 * works. Once a `@zodal/ui` with `RendererContext.history` is published, these become re-exports of
 * its types (same names; they are declared in `@zodal/core`). Design: i2mint/zodal `docs/research/field-input-history.md`.
 */

/** One remembered value of one history scope. */
export interface HistoryEntry {
  id: string;
  /** The history it belongs to. */
  scope: string;
  value: string;
  /** When it was last recorded or picked, ms since the epoch. */
  at: number;
  /** How many times it was recorded or picked. */
  uses: number;
  pinned?: boolean;
}

/** Why a value is recorded: it was used, it was saved before a reset, or a pick replaced it. */
export type HistoryReason = 'submit' | 'reset' | 'pick';

/** What a field needs from a history (`createFieldHistory()` from `@zodal/store`, or anything of this shape). */
export interface FieldHistoryStore {
  /** Remember `value` (trimmed; empty is ignored). An equal value moves to the top instead of repeating. */
  record(scope: string, value: string, options?: { reason?: HistoryReason; max?: number }): Promise<void>;
  /** Pinned first, then most recent first. `query` keeps entries containing it, ignoring case. */
  list(scope: string, options?: { query?: string; limit?: number }): Promise<HistoryEntry[]>;
  remove(id: string): Promise<void>;
  pin(id: string, pinned?: boolean): Promise<void>;
  /** Forget one scope, or every scope; resolves with what was removed, for an Undo. */
  clear(scope?: string): Promise<HistoryEntry[]>;
  /** Put entries back (the Undo of `clear` or `remove`). */
  restore(entries: readonly HistoryEntry[]): Promise<void>;
  /** Be told when a scope changes through this store (`undefined`: any scope may have). Returns the unsubscribe. */
  subscribe?(listener: (scope: string | undefined) => void): () => void;
}

/** A field's resolved history settings (`FormFieldConfig.history`). */
export interface ResolvedFieldHistory {
  max: number;
  scope: string;
}

/** Most unpinned entries kept when a config gives no cap (`@zodal/core`'s `DEFAULT_HISTORY_MAX`). */
export const DEFAULT_HISTORY_MAX = 50;

/** The history settings a form field config carries, read structurally (absent: no history). */
export function fieldHistoryOf(config: object): ResolvedFieldHistory | undefined {
  const history = (config as { history?: unknown }).history;
  if (!history || typeof history !== 'object') return undefined;
  const { max, scope } = history as Partial<ResolvedFieldHistory>;
  return typeof scope === 'string' && scope !== '' ? { scope, max: typeof max === 'number' ? max : DEFAULT_HISTORY_MAX } : undefined;
}
