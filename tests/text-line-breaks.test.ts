/**
 * The fallback `text` widget keeps line breaks (i2mint/zodal-ui-shadcn#40): an `<input>` strips
 * them, so a value or a paste holding one turns the field into a textarea.
 */
import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ResolvedFieldAffordance } from '@zodal/core';
import { createShadcnRegistry, hasLineBreak, GROWN_TEXT_MAX_ROWS } from '../src/index.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

function mountText(initial: string, editWidgetOptions?: Record<string, unknown>) {
  const affordance = { zodType: 'string', editable: true, visible: true, title: 'Lyrics' } as unknown as ResolvedFieldAffordance;
  const ctx = { mode: 'form' as const };
  const Component = createShadcnRegistry().resolve(affordance, ctx)!;
  const written: unknown[] = [];
  const config = { name: 'lyrics', label: 'Lyrics', type: 'text', ...(editWidgetOptions ? { editWidgetOptions } : {}) };
  function Host() {
    const [value, setValue] = React.useState<unknown>(initial);
    return h(Component, { field: { value, onChange: (v: unknown) => { written.push(v); setValue(v); } }, config, context: ctx });
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(h(Host)));
  const c = container;
  const field = () => c.querySelector('input[type="text"], textarea') as HTMLInputElement | HTMLTextAreaElement;
  /** A paste of `text` with the caret (or selection) at [start, end). */
  const paste = (text: string, start: number, end = start) => {
    const el = field() as HTMLInputElement;
    el.focus();
    el.setSelectionRange(start, end);
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
    act(() => { el.dispatchEvent(event); });
    return event;
  };
  return { field, paste, written };
}

describe('hasLineBreak', () => {
  it('sees \\n, \\r\\n and \\r, and only in strings', () => {
    expect(hasLineBreak('a\nb')).toBe(true);
    expect(hasLineBreak('a\r\nb')).toBe(true);
    expect(hasLineBreak('a\rb')).toBe(true);
    expect(hasLineBreak('ab')).toBe(false);
    expect(hasLineBreak(undefined)).toBe(false);
    expect(hasLineBreak(3)).toBe(false);
  });
});

describe('TextInput keeps line breaks', () => {
  it('a one-line value stays an input', () => {
    const { field } = mountText('one line');
    expect(field().tagName).toBe('INPUT');
  });

  it('a value with breaks renders a textarea holding every line', () => {
    const { field } = mountText('one\ntwo\nthree');
    expect(field().tagName).toBe('TEXTAREA');
    expect(field().value).toBe('one\ntwo\nthree');
    expect((field() as HTMLTextAreaElement).rows).toBe(3);
  });

  it('the rows stop growing at GROWN_TEXT_MAX_ROWS', () => {
    const { field } = mountText(Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n'));
    expect((field() as HTMLTextAreaElement).rows).toBe(GROWN_TEXT_MAX_ROWS);
  });

  it('a multi-line paste turns the input into a textarea with every line, caret after the paste, focused', () => {
    const { field, paste, written } = mountText('[]');
    const event = paste('one\ntwo', 1);
    expect(event.defaultPrevented).toBe(true);
    expect(written).toEqual(['[one\ntwo]']);
    const el = field();
    expect(el.tagName).toBe('TEXTAREA');
    expect(el.value).toBe('[one\ntwo]');
    expect(document.activeElement).toBe(el);
    expect(el.selectionStart).toBe(1 + 'one\ntwo'.length);
  });

  it('a paste replaces the selected text', () => {
    const { field, paste } = mountText('keep XXX keep');
    paste('a\nb', 5, 8);
    expect(field().value).toBe('keep a\nb keep');
  });

  it('a one-line paste is left to the browser', () => {
    const { field, paste, written } = mountText('abc');
    const event = paste('plain', 1);
    expect(event.defaultPrevented).toBe(false);
    expect(written).toEqual([]);
    expect(field().tagName).toBe('INPUT');
  });

  it('stays a textarea once grown, so deleting the break does not swap the element mid-edit', () => {
    const { field } = mountText('one\ntwo');
    const el = field();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(el, 'onetwo');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(field()).toBe(el);
    expect(field().value).toBe('onetwo');
  });

  it('keepLineBreaks: false keeps the input and joins a pasted line break with a space', () => {
    const { field, paste, written } = mountText('', { keepLineBreaks: false });
    paste('one\r\n  two\nthree', 0);
    expect(written).toEqual(['one two three']);
    expect(field().tagName).toBe('INPUT');
  });
});
