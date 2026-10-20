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
function mount(config: OptionsFormField, initial: unknown, { stateful = false } = {}) {
  const Component = registry.resolve(optionsFieldAffordance(config), { mode: 'form' })!;
  const written: unknown[] = [];
  let setOutside: (v: unknown) => void = () => {};
  function Host() {
    const [value, setValue] = React.useState<unknown>(initial);
    setOutside = setValue;
    return React.createElement(Component, {
      config,
      field: { value, onChange: (v: unknown) => { written.push(v); if (stateful) setValue(v); } },
    });
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(React.createElement(Host)));
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
    expect(node.innerHTML).not.toContain('stored-secret');
    expect(input.placeholder).toBe('(unchanged)');
    type(input, 'new');
    expect(written).toEqual(['new']);
  });

  it('writes undefined, not an empty string, when a secret is emptied', () => {
    const { node, type, written } = mount(s3Options[1], 'stored', { stateful: true });
    const input = node.querySelector('input')!;
    type(input, 'x');
    type(input, '');
    expect(written).toEqual(['x', undefined]);
    expect(node.innerHTML).not.toContain('stored');
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
});
