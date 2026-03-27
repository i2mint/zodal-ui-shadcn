import type { ColumnConfig, FormFieldConfig, FilterFieldConfig } from '@zodal/ui';

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
