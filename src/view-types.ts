/**
 * The collection-view config these renderers draw: the shape `toViewConfig(collection, mode)`
 * returns in `@zodal/ui` (i2mint/zodal#14).
 *
 * Declared here structurally, not imported: this package builds against `@zodal/ui` 0.2.0 from
 * npm, which predates `toViewConfig`, so `import type { ViewConfig } from '@zodal/ui'` is not
 * possible yet. Any object of this shape works, including one built by hand. Once a `@zodal/ui`
 * with `toViewConfig` is published, these become re-exports of its types (same names).
 */

/** One field as an item view shows it. */
export interface ViewFieldConfig {
  /** Field key (the item property to read). */
  name: string;
  /** Display label. */
  label: string;
  /** Zod type (`'string'`, `'enum'`, `'array'`, `'date'`...). */
  zodType: string;
  /** Display format hint (`'currency'`, `'image'`...). */
  displayFormat?: string;
  /** Enum value to badge variant. */
  badge?: Record<string, string>;
  /** Max characters before truncation. */
  truncate?: number;
  /** The value may be a `ContentRef`. */
  isContentRef?: boolean;
  /** Closed vocabulary (value to label): a badge shows the label. */
  options?: { value: string; label: string }[];
}

/** The group field and its collapse policy. */
export interface ViewGroupConfig {
  field: string;
  label: string;
  collapsible: boolean;
  defaultState: 'collapsed' | 'expanded';
  multiValued: boolean;
  multiValue: 'duplicate' | 'primary';
  /** Closed vocabulary, in group order. */
  order?: { value: string; label: string }[];
}

/** An operation the view surfaces. */
export interface ViewOperationConfig {
  name: string;
  label: string;
  icon?: string;
  variant?: string;
  confirm?: boolean | { title: string; message: string; confirmLabel?: string; cancelLabel?: string; variant?: string };
  keyboardShortcut?: string;
  builtin: boolean;
}

/** What every collection view shares. */
export interface BaseViewConfig {
  idField: string;
  fields: {
    label: ViewFieldConfig | null;
    image: ViewFieldConfig | null;
    badges: ViewFieldConfig[];
    secondary: ViewFieldConfig[];
  };
  group: ViewGroupConfig | null;
  selection: false | 'single' | 'multi';
  operations: {
    item: ViewOperationConfig[];
    selection: ViewOperationConfig[];
    collection: ViewOperationConfig[];
  };
}

/** A collection view, discriminated on `kind`. */
export type ViewConfig = (BaseViewConfig & { kind: 'list' }) | (BaseViewConfig & { kind: 'grid' });
