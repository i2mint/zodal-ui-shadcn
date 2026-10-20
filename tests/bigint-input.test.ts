import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createShadcnRegistry } from '../src/index.js';
import type { ResolvedFieldAffordance } from '@zodal/core';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

function mount(initial: unknown) {
  const field = { zodType: 'bigint', editable: true, visible: true, title: 'N' } as unknown as ResolvedFieldAffordance;
  const Component = createShadcnRegistry().resolve(field, { mode: 'form' })!;
  const written: unknown[] = [];
  function Host() {
    const [value, setValue] = React.useState<unknown>(initial);
    return React.createElement(Component, {
      field: { value, onChange: (v: unknown) => { written.push(v); setValue(v); } },
      config: { name: 'n', label: 'N' } as any,
    });
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(React.createElement(Host)));
  const input = container.querySelector('input')!;
  const type = (text: string) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return { input, type, written };
}

describe('BigIntInput (#9)', () => {
  it('shows a bigint as digits and writes whole numbers back as bigints', () => {
    const { input, type, written } = mount(12345678901234567890n);
    expect(input.value).toBe('12345678901234567890');
    type('98765432109876543210');
    expect(written).toEqual([98765432109876543210n]);
  });

  it('keeps an intermediate text without writing it, and flags it invalid', () => {
    const { input, type, written } = mount(5n);
    type('-');
    expect(input.value).toBe('-');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    type('-7');
    expect(written).toEqual([-7n]);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    type('1.5');
    expect(written).toEqual([-7n]);
  });

  it('writes undefined when emptied', () => {
    const { type, written } = mount(5n);
    type('');
    expect(written).toEqual([undefined]);
  });
});
