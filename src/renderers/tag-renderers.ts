/**
 * Tag widgets for array fields (React): a chip input for `'tags'` form fields, a
 * chip filter for `contains` filters, and a chip cell with "+N" overflow.
 *
 * The decisions (what a draft means, which options match, how suggestion requests
 * are paced, what the filter emits) live in `../tag-logic.ts`; these components
 * are views over it, styled with shadcn/Tailwind tokens. Suggestions come from
 * `context.suggest` (a `SuggestionSource` the app injects), so no renderer imports
 * a store.
 *
 * Accessibility follows the ARIA 1.2 combobox pattern with list autocomplete: the
 * input is `role="combobox"` controlling a `role="listbox"` popup, the highlighted
 * option is `aria-activedescendant`, and a polite live region announces every add,
 * remove and refusal. Chips are a list; each has a real remove `<button>`.
 * Typed text is never thrown away: a refused draft, a failed suggestion request
 * and a blur all leave it in the input.
 *
 * The inputs are controlled: they show `field.value` and report changes through
 * `field.onChange`, like every other renderer in this package.
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SuggestionSource, VocabularyOption } from '@zodal/ui';
import type { CellProps, FilterFieldProps, FormFieldProps } from '../types.js';
import {
  createSuggestionController,
  fromContainsFilter,
  labelOf,
  matchOptions,
  optionRaw,
  resolveChoice,
  resolveDraft,
  resolveTagSettings,
  splitTags,
  suggestionToOption,
  tagKey,
  toContainsFilter,
  toValueList,
  type DraftResolution,
  type SuggestionState,
  type TagOption,
  type TagSettings,
} from '../tag-logic.js';

const h = React.createElement;

/** Visually hidden but read by screen readers; inline so it works without Tailwind. */
const VISUALLY_HIDDEN: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const CLASSES = {
  control: 'flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-sm focus-within:ring-2 focus-within:ring-ring',
  chips: 'flex flex-wrap gap-1',
  chip: 'inline-flex items-center gap-1 rounded-md border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground',
  remove: 'rounded-sm opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none',
  input: 'min-w-[8ch] flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed',
  popup: 'mt-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
  status: 'px-2 py-1.5 text-sm text-muted-foreground',
  option: 'cursor-pointer rounded-sm px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground',
  feedback: 'mt-1 text-sm text-destructive',
  toggle: 'inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-medium aria-pressed:bg-primary aria-pressed:text-primary-foreground',
  caption: 'text-sm text-muted-foreground',
  overflow: 'inline-flex items-center rounded-md border px-2 py-0.5 text-xs text-muted-foreground',
} as const;

// ============================================================================
// The chip combobox (shared by the form input and the type-ahead filter)
// ============================================================================

interface TagComboboxProps {
  /** Field name, passed to `suggest`. */
  name: string;
  /** Field label, used in accessible names. */
  label: string;
  inputId?: string;
  /** Id of the element naming the input, when no `<label htmlFor>` does. */
  labelledBy?: string;
  describedBy?: string;
  values: readonly unknown[];
  options?: readonly VocabularyOption[];
  allowCreate: boolean;
  suggest?: SuggestionSource;
  disabled: boolean;
  required?: boolean;
  placeholder?: string;
  settings: TagSettings;
  onChange: (values: unknown[]) => void;
}

function TagCombobox(p: TagComboboxProps) {
  const { messages: m, limit, debounceMs } = p.settings;
  const options = p.options?.length ? p.options : undefined;
  // Closed vocabulary: offer `options`. Otherwise ask `suggest`; else offer
  // `options` if any were given; else free text only.
  const source: 'options' | 'suggest' | 'none' =
    !p.allowCreate && options ? 'options' : p.suggest ? 'suggest' : options ? 'options' : 'none';
  // With a closed vocabulary, Enter takes the first match; with an open one, Enter
  // adds what was typed and the arrow keys reach the suggestions.
  const autoHighlight = !p.allowCreate;
  const values = p.values;

  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const optionId = (i: number) => `${uid}-option-${i}`;
  const inputId = p.inputId ?? `${uid}-input`;

  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<TagOption[]>([]);
  const [status, setStatus] = useState<SuggestionState['status']>('idle');
  const [active, setActive] = useState(-1);
  const [feedback, setFeedback] = useState('');
  // `seq` remounts the live text so a repeated message is announced again.
  const [announcement, setAnnouncement] = useState({ text: '', seq: 0 });
  const labels = useRef(new Map<string, string>()).current;
  const inputRef = useRef<HTMLInputElement>(null);

  // Latest props for the suggestion callbacks, which outlive a render.
  const latest = useRef({ values, options, suggest: p.suggest });
  latest.current = { values, options, suggest: p.suggest };

  const controller = useMemo(
    () => source === 'suggest'
      ? createSuggestionController({
          suggest: (query, field, opts) => latest.current.suggest!(query, field, opts),
          field: p.name,
          debounceMs,
          limit,
          onUpdate: (state) => {
            const taken = new Set(latest.current.values.map(tagKey));
            const next = state.items
              .map((s) => suggestionToOption(s, latest.current.options))
              .filter((x) => !taken.has(x.value));
            setStatus(state.status);
            setItems(next);
            setActive(autoHighlight && next.length ? 0 : -1);
          },
        })
      : undefined,
    [source, p.name, debounceMs, limit, autoHighlight],
  );
  useEffect(() => () => controller?.cancel(), [controller]);

  const labelFor = (v: unknown) => labels.get(tagKey(v)) ?? labelOf(options, v);
  const announce = (text: string) => setAnnouncement((a) => ({ text, seq: a.seq + 1 }));

  function close() {
    controller?.cancel();
    setOpen(false);
    setItems([]);
    setStatus('idle');
    setActive(-1);
  }

  /** Show what matches `query`: local options at once, suggestions paced. */
  function refresh(query: string, { force = false } = {}) {
    if (source === 'none' || (!query.trim() && !force)) {
      close();
      return;
    }
    setOpen(true);
    if (source === 'options') {
      const next = matchOptions(options!, query, values, limit);
      setItems(next);
      setStatus('ready');
      setActive(autoHighlight && next.length ? 0 : -1);
    } else {
      controller!.request(query, { immediate: force });
    }
  }

  /**
   * Resolve candidates in order against the growing selection, then report the
   * new value once (several commits in one event must not race on a stale prop).
   */
  function apply(candidates: Array<(selected: readonly unknown[]) => DraftResolution>): DraftResolution[] {
    let next: unknown[] = [...values];
    const results = candidates.map((resolve) => {
      const res = resolve(next);
      if (res.ok) {
        next = [...next, res.value];
        labels.set(tagKey(res.value), res.label);
      }
      return res;
    });
    const added = results.filter((r) => r.ok).map((r) => r.label);
    const refused = results.filter((r): r is Extract<DraftResolution, { ok: false }> => !r.ok && r.reason !== 'empty');
    if (added.length) p.onChange(next);
    const last = refused[refused.length - 1];
    const refusal = last ? (last.reason === 'duplicate' ? m.duplicate(last.label) : m.notAllowed(last.label)) : '';
    const message = [added.length ? m.added(added.join(', ')) : '', refusal].filter(Boolean).join('. ');
    if (message) announce(message);
    setFeedback(refusal);
    return results;
  }

  /** Every choice a typed draft may resolve to: options plus what is on screen. */
  const choices = (): TagOption[] => [...(options ?? []), ...items];

  /**
   * Commit typed text: each comma-separated part is a tag. Refused parts stay in
   * the input (never lose typed text), so a refusal can be corrected in place.
   */
  function commitText(text: string) {
    const parts = splitTags(text);
    const results = apply(parts.map((part) => (selected) =>
      resolveDraft(part, { choices: choices(), allowCreate: p.allowCreate, selected })));
    const refused = parts.filter((_, i) => !results[i].ok);
    setDraft(refused.join(', '));
    if (refused.length === 0) close();
  }

  function pick(i: number) {
    const opt = items[i];
    if (!opt) return;
    if (apply([(selected) => resolveChoice(opt, selected)])[0].ok) {
      setDraft('');
      close();
    }
  }

  function removeAt(i: number) {
    const removed = values[i];
    p.onChange(values.filter((_, j) => j !== i));
    announce(m.removed(labelFor(removed)));
  }

  function move(delta: 1 | -1) {
    if (!items.length) return;
    setActive((a) => (a < 0 ? (delta === 1 ? 0 : items.length - 1) : (a + delta + items.length) % items.length));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'Enter':
      case ',':
        if (open && active >= 0) {
          e.preventDefault();
          pick(active);
        } else if (draft.trim()) {
          e.preventDefault();
          commitText(draft);
        } else if (e.key === ',') {
          e.preventDefault(); // a lone comma is a separator, never part of a tag
        }
        // Enter on an empty input falls through: the form may submit.
        break;
      case 'Backspace':
        if (draft === '' && values.length) {
          e.preventDefault();
          removeAt(values.length - 1);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!open || status === 'idle' || status === 'error') refresh(draft, { force: true });
        else move(1);
        break;
      case 'ArrowUp':
        if (open) {
          e.preventDefault();
          move(-1);
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          close();
        }
        break;
      case 'Tab':
        if (open) close();
        break;
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    // Pasting "a, b, c" adds each part at once.
    const text = e.clipboardData?.getData('text') ?? '';
    if (!/[,\n]/.test(text)) return;
    e.preventDefault();
    commitText(`${draft}${text}`);
  }

  const trimmed = draft.trim();
  const statusText = status === 'loading' ? m.loading
    : status === 'error' ? m.error
    : open && items.length === 0 ? (p.allowCreate && trimmed ? m.pressEnterToAdd(trimmed) : m.noMatches)
    : '';

  return h('div', { className: 'relative', 'data-zodal-tags': '', 'data-loading': status === 'loading' ? '' : undefined },
    h('div', {
      className: CLASSES.control,
      onClick: (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) inputRef.current?.focus();
      },
    },
      // Rendered only when non-empty: a `hidden` attribute would lose to Tailwind's `flex`.
      values.length > 0 && h('ul', { className: CLASSES.chips, 'aria-label': m.selected(p.label) },
        values.map((v, i) => {
          const label = labelFor(v);
          return h('li', { key: `${tagKey(v)}-${i}`, className: CLASSES.chip },
            h('span', { 'data-chip-label': '' }, label),
            h('button', {
              type: 'button',
              className: CLASSES.remove,
              'aria-label': m.remove(label),
              disabled: p.disabled,
              onClick: () => {
                removeAt(i);
                inputRef.current?.focus();
              },
            }, '×'),
          );
        }),
      ),
      h('input', {
        ref: inputRef,
        id: inputId,
        type: 'text',
        role: 'combobox',
        autoComplete: 'off',
        className: CLASSES.input,
        value: draft,
        placeholder: p.placeholder,
        disabled: p.disabled,
        'aria-autocomplete': 'list',
        'aria-expanded': open,
        'aria-controls': listboxId,
        'aria-activedescendant': open && active >= 0 ? optionId(active) : undefined,
        'aria-labelledby': p.labelledBy,
        'aria-describedby': p.describedBy,
        'aria-required': p.required || undefined,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          setDraft(e.target.value);
          setFeedback('');
          refresh(e.target.value);
        },
        onKeyDown,
        onPaste,
        onBlur: () => {
          if (open) close(); // the draft stays in the input
        },
      }),
    ),
    h('div', { className: CLASSES.popup, hidden: !open },
      statusText ? h('div', { className: CLASSES.status, 'data-listbox-status': '' }, statusText) : null,
      h('ul', { id: listboxId, role: 'listbox', 'aria-label': m.suggestions(p.label), 'aria-busy': status === 'loading' },
        items.map((opt, i) =>
          h('li', {
            key: opt.value,
            id: optionId(i),
            role: 'option',
            className: CLASSES.option,
            'aria-selected': i === active,
            onMouseDown: (e: React.MouseEvent) => {
              e.preventDefault(); // keep focus in the input
              pick(i);
            },
          }, opt.label),
        ),
      ),
    ),
    feedback ? h('p', { className: CLASSES.feedback, 'data-feedback': '' }, feedback) : null,
    h('div', { role: 'status', 'aria-live': 'polite', 'aria-atomic': true, style: VISUALLY_HIDDEN },
      h('span', { key: announcement.seq }, announcement.text),
    ),
  );
}

// ============================================================================
// Form: tag input
// ============================================================================

/**
 * A chip input for `type: 'tags'` form fields. Writes an array back through
 * `field.onChange`, with each option's `raw` (numbers stay numbers).
 */
export function createTagInput(settings: Partial<TagSettings> = {}) {
  const s = resolveTagSettings(settings);
  return function TagInput({ field, config, context }: FormFieldProps) {
    const helpId = config.helpText ? `${config.name}-help` : undefined;
    return h('div', { className: 'space-y-2' },
      h('label', { htmlFor: config.name, className: 'text-sm font-medium' }, config.label),
      h(TagCombobox, {
        name: config.name,
        label: config.label,
        inputId: config.name,
        describedBy: helpId,
        values: toValueList(field.value),
        options: config.options,
        allowCreate: config.allowCreate !== false,
        suggest: context?.suggest,
        disabled: config.disabled,
        required: config.required,
        placeholder: config.placeholder,
        settings: s,
        onChange: (values) => field.onChange(values),
      }),
      config.helpText ? h('p', { id: helpId, className: 'text-sm text-muted-foreground' }, config.helpText) : null,
    );
  };
}

export const TagInput = createTagInput();

// ============================================================================
// Filter: chip filter
// ============================================================================

/**
 * A chip filter for `contains` on an array field. Emits an `arrayContainsAny`
 * `FilterCondition` (or `undefined` when nothing is selected) through
 * `field.onChange`; see `toContainsFilter`. Up to `maxToggleOptions` options
 * show as toggle chips (`<button aria-pressed>`); more options, or none (free
 * text and `suggest`), give a type-ahead chip input.
 */
export function createChipFilter(settings: Partial<TagSettings> = {}) {
  const s = resolveTagSettings(settings);
  return function ChipFilter({ field, config, context }: FilterFieldProps) {
    const captionId = useId();
    const values = fromContainsFilter(field.value);
    const emit = (next: readonly unknown[]) => field.onChange(toContainsFilter(config.name, next));
    const options = config.options ?? [];
    // Say the connective in words, at the point of use (faceted-filter-ux).
    const caption = h('span', { id: captionId, className: CLASSES.caption }, `${config.label} ${s.messages.anyOf}`);
    const group = (...children: React.ReactNode[]) =>
      h('div', { role: 'group', 'aria-labelledby': captionId, className: 'flex flex-wrap items-center gap-1' }, caption, ...children);

    if (options.length > 0 && options.length <= s.maxToggleOptions) {
      const isOn = (raw: unknown) => values.some((v) => tagKey(v) === tagKey(raw));
      return group(...options.map((opt) => {
        const raw = optionRaw(opt);
        return h('button', {
          key: opt.value,
          type: 'button',
          className: CLASSES.toggle,
          'aria-pressed': isOn(raw),
          onClick: () => emit(isOn(raw) ? values.filter((v) => tagKey(v) !== tagKey(raw)) : [...values, raw]),
        }, opt.label);
      }));
    }

    return group(h(TagCombobox, {
      key: 'combobox',
      name: config.name,
      label: config.label,
      labelledBy: captionId,
      values,
      options,
      // A closed vocabulary filters on its values only; otherwise any typed tag.
      allowCreate: options.length === 0,
      suggest: context?.suggest,
      disabled: false,
      placeholder: `Filter ${config.label}...`,
      settings: s,
      onChange: emit,
    }));
  };
}

export const ChipFilter = createChipFilter();

// ============================================================================
// Cell: chips with overflow
// ============================================================================

/**
 * A chip cell for array values: the first `maxVisibleChips` values as chips, the
 * rest as one "+N" chip whose title and accessible name list them. Visually
 * hidden ", " separators keep copied text and screen-reader output readable.
 */
export function createChipCell(settings: Partial<TagSettings> = {}) {
  const s = resolveTagSettings(settings);
  return function ChipCell({ value }: CellProps) {
    const list = Array.isArray(value) || value instanceof Set ? toValueList(value) : null;
    if (!list || list.length === 0) return h('span', { className: 'text-muted-foreground' }, '—');
    const shown = list.slice(0, s.maxVisibleChips);
    const hidden = list.slice(s.maxVisibleChips);
    const rest = hidden.map(tagKey).join(', ');
    return h('span', { role: 'list', className: 'inline-flex flex-wrap gap-1' },
      shown.map((v, i) =>
        h('span', { key: `${tagKey(v)}-${i}`, role: 'listitem', className: CLASSES.chip },
          tagKey(v),
          i < shown.length - 1 || hidden.length ? h('span', { style: VISUALLY_HIDDEN }, ', ') : null,
        ),
      ),
      hidden.length
        ? h('span', {
            role: 'listitem',
            className: CLASSES.overflow,
            title: rest,
            'aria-label': s.messages.more(hidden.length, rest),
            'data-overflow': '',
          }, `+${hidden.length}`)
        : null,
    );
  };
}

export const ChipCell = createChipCell();
