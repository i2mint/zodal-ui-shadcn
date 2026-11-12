import type { ColumnConfig, FormFieldConfig, FilterFieldConfig } from '@zodal/ui';
import type { FieldHistoryStore } from './history-types.js';

/**
 * The render context a field component may receive (`@zodal/ui`'s `RendererContext`, declared
 * structurally: the published `@zodal/ui` this package builds against predates `history`).
 */
export interface FieldRenderContext {
  mode?: string;
  /** Where a field with `config.history` reads and writes its past values. Absent: no history UI. */
  history?: FieldHistoryStore;
  [key: string]: unknown;
}

/** Props passed to cell renderer components. */
export interface CellProps {
  /** The cell value. */
  value: unknown;
  /** The column configuration from toColumnDefs(). */
  config: ColumnConfig;
  /** The full row data. */
  row: Record<string, unknown>;
}

/** Props passed to form field renderer components. */
export interface FormFieldProps {
  /** Form field binding (value + onChange). */
  field: {
    value: unknown;
    onChange: (value: unknown) => void;
  };
  /** The form field configuration from toFormConfig(). */
  config: FormFieldConfig;
  /** The render context (`{ mode: 'form', history }`): text and textarea inputs offer history from it. */
  context?: FieldRenderContext;
}

/** Props passed to filter renderer components. */
export interface FilterFieldProps {
  /** Filter field binding (value + onChange). */
  field: {
    value: unknown;
    onChange: (value: unknown) => void;
  };
  /** The filter field configuration from toFilterConfig(). */
  config: FilterFieldConfig;
}
