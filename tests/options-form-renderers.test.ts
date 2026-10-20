import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createShadcnRegistry, optionsFieldAffordance, type OptionsFormField } from '../src/index.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const base = { required: false, disabled: false, hidden: false, order: 0 };
const s3Options: OptionsFormField[] = [
  { ...base, name: 'bucket', path: ['bucket'], label: 'Bucket', type: 'text', zodType: 'string' },
  { ...base, name: 'secretAccessKey', path: ['secretAccessKey'], label: 'Secret access key', type: 'password', zodType: 'string', secret: true },
  { ...base, name: 'client', path: ['client'], label: 'Client', type: 'code', zodType: 'custom', suppliedInCode: true, disabled: true },
  {
    ...base, name: 'retry', path: ['retry'], label: 'Retry', type: 'fieldset', zodType: 'object',
    fields: [{ ...base, name: 'retry.attempts', path: ['retry', 'attempts'], label: 'Attempts', type: 'number', zodType: 'number' }],
  },
];
const retryTwo: OptionsFormField = {
  ...s3Options[3],
  fields: [
    { ...base, name: 'retry.attempts', path: ['retry', 'attempts'], label: 'Attempts', type: 'number', zodType: 'number' },
    { ...base, name: 'retry.backoff', path: ['retry', 'backoff'], label: 'Backoff', type: 'number', zodType: 'number' },
  ],
};

const registry = createShadcnRegistry();
const top = (f: OptionsFormField) => registry.explain(optionsFieldAffordance(f), { mode: 'form' })[0]?.name;

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = container = undefined;
});

/**
 * Mount an options field. With `stateful`, the host keeps each written value (a re-render
 * follows every edit); without it, the value never changes (no re-render between edits).
 */
function mount(
  config: OptionsFormField,
  initial: unknown,
  { stateful = false, extra = {} as Record<string, unknown> } = {},
) {
  const Component = registry.resolve(optionsFieldAffordance(config), { mode: 'form' })!;
  const written: unknown[] = [];
  let setOutside: (v: unknown) => void = () => {};
  function Host() {
    const [value, setValue] = React.useState<unknown>(initial);
    setOutside = setValue;
    return React.createElement(Component, {
      ...extra,
      config,
      field: { value, onChange: (v: unknown) => { written.push(v); if (stateful) setValue(v); } },
    });
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // StrictMode renders twice and replays effects, so a render with side effects shows up here.
  act(() => root!.render(React.createElement(React.StrictMode, null, React.createElement(Host))));
  const type = (input: HTMLInputElement, text: string) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  /** Set the value from outside (a reset, a load). */
  const reset = (v: unknown) => act(() => setOutside(v));
  return { node: container, type, reset, written };
}

describe('options-form widget types (#12)', () => {
  it('resolves fieldset, password and code to their renderers', () => {
    expect(s3Options.map(top)).toEqual(['TextInput', 'PasswordInput', 'CodeNote', 'FieldsetInput']);
  });

  it('never resolves a secret or a code-supplied field to an editable input', () => {
    expect(top({ ...s3Options[0], type: 'text', secret: true })).toBe('PasswordInput');
    expect(top({ ...s3Options[0], type: 'text', suppliedInCode: true })).toBe('CodeNote');
    expect(top({ ...s3Options[0], type: 'text', secret: true, suppliedInCode: true })).toBe('CodeNote');
  });

  it('masks a secret and never prefills it', () => {
    const { node, type, written } = mount(s3Options[1], 'stored-secret');
    const input = node.querySelector('input')!;
    expect(input.type).toBe('password');
    expect(input.value).toBe('');
    expect(input.getAttribute('value') ?? '').toBe('');
    expect(node.innerHTML).not.toContain('stored-secret');
    expect(input.placeholder).toBe('(unchanged)');
    type(input, 'new');
    expect(written).toEqual(['new']);
  });

  it('writes undefined, not an empty string, when a secret is emptied', () => {
    const { node, type, written } = mount(s3Options[1], 'stored', { stateful: true });
    const input = node.querySelector('input')!;
    type(input, 'x');
    expect(input.placeholder).toBe('(unchanged)');
    type(input, '');
    expect(written).toEqual(['x', undefined]);
    expect(input.value).toBe('');
  });

  it('clears what was typed in a secret when the value changes from outside', () => {
    const { node, type, reset } = mount(s3Options[1], 'stored', { stateful: true });
    const input = node.querySelector('input')!;
    type(input, 'typed');
    expect(input.value).toBe('typed');
    reset('saved-elsewhere');
    expect(input.value).toBe('');
    expect(node.innerHTML).not.toContain('saved-elsewhere');
  });

  it('shows a value supplied in code as a note, never an input', () => {
    const { node } = mount(s3Options[2], { some: 'client' });
    expect(node.querySelector('input, textarea, select')).toBeNull();
    expect(node.textContent).toContain('Supplied in code');
  });

  it('draws a fieldset with its children bound to keys of the value', () => {
    const { node, type, written } = mount(s3Options[3], { attempts: 3, other: true }, { stateful: true });
    const fieldset = node.firstElementChild!;
    expect(fieldset.tagName).toBe('FIELDSET');
    expect(fieldset.querySelector('legend')!.textContent).toBe('Retry');
    const input = node.querySelector('input')!;
    expect(input.value).toBe('3');
    type(input, '5');
    expect(written).toEqual([{ attempts: 5, other: true }]);
    expect(input.value).toBe('5');
  });

  it('keeps both edits when two children change without a re-render', () => {
    const { node, type, written } = mount(retryTwo, {});
    const [attempts, backoff] = node.querySelectorAll('input');
    type(attempts, '5');
    type(backoff, '2');
    expect(written.at(-1)).toEqual({ attempts: 5, backoff: 2 });
  });

  it('accumulates edits across re-renders, and a new outside value replaces the running one', () => {
    const { node, type, reset, written } = mount(retryTwo, { attempts: 1 }, { stateful: true });
    const [attempts, backoff] = node.querySelectorAll('input');
    type(attempts, '5');
    type(backoff, '2');
    expect(written).toEqual([{ attempts: 5 }, { attempts: 5, backoff: 2 }]);
    reset({ attempts: 9 });
    expect(attempts.value).toBe('9');
    expect(backoff.value).toBe('');
    type(backoff, '4');
    expect(written.at(-1)).toEqual({ attempts: 9, backoff: 4 });
  });

  const nested: OptionsFormField = {
    ...base, name: 'outer', path: ['outer'], label: 'Outer', type: 'fieldset', zodType: 'object',
    fields: [
      { ...base, name: 'outer.a', path: ['outer', 'a'], label: 'A', type: 'number', zodType: 'number' },
      {
        ...base, name: 'outer.inner', path: ['outer', 'inner'], label: 'Inner', type: 'fieldset', zodType: 'object',
        fields: [
          { ...base, name: 'outer.inner.x', path: ['outer', 'inner', 'x'], label: 'X', type: 'number', zodType: 'number' },
          { ...base, name: 'outer.inner.y', path: ['outer', 'inner', 'y'], label: 'Y', type: 'number', zodType: 'number' },
        ],
      },
    ],
  };

  it('keeps every edit in a nested fieldset with no re-render between them', () => {
    const { node, type, written } = mount(nested, { a: 1, inner: { x: 0 } });
    expect(node.querySelectorAll('fieldset')).toHaveLength(2);
    const [a, x, y] = node.querySelectorAll('input');
    type(x, '7');
    type(y, '8');
    type(a, '2');
    expect(written.at(-1)).toEqual({ a: 2, inner: { x: 7, y: 8 } });
  });

  it('keeps the stored secret when a secret in a fieldset is typed and emptied again', () => {
    const creds: OptionsFormField = {
      ...base, name: 'creds', path: ['creds'], label: 'Credentials', type: 'fieldset', zodType: 'object',
      fields: [{ ...base, name: 'creds.key', path: ['creds', 'key'], label: 'Key', type: 'password', zodType: 'string', secret: true }],
    };
    const { node, type, written } = mount(creds, { key: 'stored' }, { stateful: true });
    const input = node.querySelector('input')!;
    expect(input.value).toBe('');
    type(input, 'new');
    type(input, '');
    expect(written).toEqual([{ key: 'new' }, { key: 'stored' }]);
    expect(node.innerHTML).not.toContain('stored');
  });

  it('skips hidden children and disables every child of a disabled fieldset', () => {
    const fs: OptionsFormField = {
      ...retryTwo, disabled: true,
      fields: [retryTwo.fields![0], { ...retryTwo.fields![1], hidden: true }],
    };
    const seen: OptionsFormField[] = [];
    const { node } = mount(fs, {}, {
      extra: { renderField: (p: { config: OptionsFormField }) => { seen.push(p.config); return null; } },
    });
    expect((node.firstElementChild as HTMLFieldSetElement).disabled).toBe(true);
    expect(seen.map((c) => [c.name, c.disabled])).toEqual(
      expect.arrayContaining([['retry.attempts', true]]),
    );
    expect(seen.some((c) => c.name === 'retry.backoff')).toBe(false);
  });

  it('draws children with a renderField that uses hooks', () => {
    function useLabel(label: string) {
      const [text] = React.useState(`custom ${label}`);
      return text;
    }
    const renderField = (p: { config: OptionsFormField }) =>
      React.createElement('span', { 'data-child': p.config.name }, useLabel(p.config.label));
    const { node } = mount(retryTwo, {}, { extra: { renderField } });
    expect([...node.querySelectorAll('[data-child]')].map((e) => e.textContent)).toEqual(['custom Attempts', 'custom Backoff']);
  });

  it("resolves children through the host's registry when given one", () => {
    const host = createShadcnRegistry();
    host.register({
      tester: (f, ctx) => (ctx.mode === 'form' && f.zodType === 'number' ? 1000 : -1),
      renderer: () => React.createElement('output', null, 'overridden'),
      name: 'Override',
    });
    const { node } = mount(retryTwo, {}, { extra: { registry: host } });
    expect([...node.querySelectorAll('output')].map((e) => e.textContent)).toEqual(['overridden', 'overridden']);
  });
});
