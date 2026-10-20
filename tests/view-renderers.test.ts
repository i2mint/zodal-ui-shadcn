import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CollectionView, ListItem, GridCard, groupItems, groupId } from '../src/index.js';
import type { ViewConfig, ViewGroupConfig, CollectionViewProps, ItemViewProps } from '../src/index.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

function mount(element: React.ReactElement): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(element));
  return container;
}
const rerender = (element: React.ReactElement) => act(() => root!.render(element));
const click = (el: Element) => act(() => (el as HTMLElement).click());

// Built by hand: the shape `toViewConfig(collection, mode)` returns in @zodal/ui (#14), which
// the @zodal/ui on npm this package builds against does not have yet.
const group: ViewGroupConfig = {
  field: 'class', label: 'Class', collapsible: true, defaultState: 'expanded', multiValued: false, multiValue: 'duplicate',
  order: [{ value: 'strings', label: 'Strings' }, { value: 'winds', label: 'Winds' }],
};
const config = (kind: 'list' | 'grid', overrides: Partial<ViewConfig> = {}): ViewConfig => ({
  kind,
  idField: 'id',
  fields: {
    label: { name: 'name', label: 'Name', zodType: 'string' },
    image: { name: 'image', label: 'Image', zodType: 'string' },
    badges: [
      { name: 'tags', label: 'Tags', zodType: 'array', options: [{ value: 'loud', label: 'Loud' }] },
      { name: 'electric', label: 'Electric', zodType: 'boolean' },
    ],
    secondary: [{ name: 'maker', label: 'Maker', zodType: 'string', truncate: 6 }],
  },
  group,
  selection: 'multi',
  operations: {
    item: [{ name: 'edit', label: 'Edit', builtin: true }, { name: 'delete', label: 'Delete', variant: 'destructive', confirm: true, builtin: true }],
    selection: [{ name: 'bulkDelete', label: 'Delete selected', builtin: true }],
    collection: [{ name: 'create', label: 'New', builtin: true }],
  },
  ...overrides,
} as ViewConfig);

const items = [
  { id: 'i1', name: 'Violin', image: 'violin.png', class: 'strings', tags: ['loud'], electric: false, maker: 'Stradivari' },
  { id: 'i2', name: 'Flute', class: 'winds', tags: [], electric: false, maker: 'Yamaha' },
  { id: 'i3', name: 'Theremin', class: 'strings', tags: [], electric: true, maker: 'Moog' },
];
const view = (props: Partial<CollectionViewProps> & { config: ViewConfig }) => React.createElement(CollectionView, { items, ...props });
const item = (Component: typeof ListItem, props: Partial<ItemViewProps> = {}) =>
  React.createElement(Component, { item: items[0], config: config('list'), ...props });

describe('ListItem', () => {
  it('draws a row: thumbnail, label, badges with vocabulary labels, truncated secondary text', () => {
    const c = mount(item(ListItem));
    const row = c.querySelector('li')!;
    expect(row.getAttribute('data-id')).toBe('i1');
    expect(row.querySelector('img')?.getAttribute('src')).toBe('violin.png');
    expect(row.querySelector('[data-role="label"]')?.textContent).toBe('Violin');
    expect([...row.querySelectorAll('[data-role="badges"] > span')].map((b) => b.textContent)).toEqual(['Loud']);
    const maker = row.querySelector('[data-field="maker"] span[title]');
    expect(maker?.getAttribute('title')).toBe('Stradivari');
    expect(maker?.textContent).toBe('Stradi...');
  });

  it('shows a true boolean badge by its label and a placeholder when there is no image', () => {
    const c = mount(item(ListItem, { item: items[2] }));
    expect(c.querySelector('[data-field="electric"]')?.textContent).toBe('Electric');
    expect(c.querySelector('[data-placeholder="true"]')).not.toBeNull();
  });

  it('runs operations and selection without opening the item; opens on click', () => {
    const onOperation = vi.fn();
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    const c = mount(item(ListItem, { onOperation, onSelect, onOpen, selected: true }));
    const buttons = [...c.querySelectorAll('button')];
    expect(buttons.map((b) => b.getAttribute('data-operation'))).toEqual(['edit', 'delete']);
    click(buttons[0]);
    expect(onOperation).toHaveBeenCalledWith(expect.objectContaining({ name: 'edit' }), items[0]);
    const box = c.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.checked).toBe(true);
    click(box);
    expect(onSelect).toHaveBeenCalledWith('i1', false, items[0]);
    expect(onOpen).not.toHaveBeenCalled();
    click(c.querySelector('li')!);
    expect(onOpen).toHaveBeenCalledWith(items[0]);
  });

  it('draws no checkbox or buttons without handlers, nor a checkbox when not selectable', () => {
    expect(mount(item(ListItem)).querySelector('input, button')).toBeNull();
    act(() => root?.unmount());
    expect(mount(item(ListItem, { config: config('list', { selection: false }), onSelect: () => {} })).querySelector('input')).toBeNull();
  });

  it('lets a custom value renderer draw a field', () => {
    const c = mount(item(ListItem, { renderValue: (v, f) => (f.name === 'maker' ? React.createElement('em', null, `by ${v}`) : null) }));
    expect(c.querySelector('[data-field="maker"] em')?.textContent).toBe('by Stradivari');
  });
});

describe('GridCard', () => {
  it('draws a card with the image as its cover', () => {
    const c = mount(item(GridCard, { config: config('grid') }));
    const card = c.querySelector('article')!;
    expect(card.firstElementChild?.tagName).toBe('IMG');
    expect(card.querySelector('[data-role="label"]')?.textContent).toBe('Violin');
  });
});

describe('CollectionView', () => {
  it('draws groups in vocabulary order with counts, as a list or a grid', () => {
    const c = mount(view({ config: config('list') }));
    const sections = [...c.querySelectorAll('section')];
    expect(sections.map((s) => s.getAttribute('data-group-id'))).toEqual(['class:strings', 'class:winds']);
    expect(sections[0].querySelector('[data-role="group-count"]')?.textContent).toBe('2');
    expect(sections[0].querySelectorAll('ul > li')).toHaveLength(2);
    rerender(view({ config: config('grid') }));
    expect(c.querySelector('[data-kind="grid"]')).not.toBeNull();
    expect(c.querySelectorAll('[data-role="grid"] > article')).toHaveLength(3);
  });

  it('honours collapsed groups, toggles at once and reports the toggle', () => {
    const onToggleGroup = vi.fn();
    const collapsed = ['class:winds'];
    const c = mount(view({ config: config('list'), collapsedGroups: collapsed, onToggleGroup }));
    const winds = () => c.querySelectorAll('section')[1];
    const header = () => winds().querySelector('button') as HTMLButtonElement;
    const body = () => winds().querySelector('div[id]') as HTMLElement;
    expect(body().hidden).toBe(true);
    expect(header().getAttribute('aria-expanded')).toBe('false');
    expect(header().getAttribute('aria-controls')).toBe(body().id);
    click(header());
    expect(body().hidden).toBe(false);
    expect(onToggleGroup).toHaveBeenCalledWith('class:winds');
    // New persisted state from the consumer takes over.
    rerender(view({ config: config('list'), collapsedGroups: [], onToggleGroup }));
    expect(body().hidden).toBe(false);
    rerender(view({ config: config('list'), collapsedGroups: ['class:winds'], onToggleGroup }));
    expect(body().hidden).toBe(true);
  });

  it('opens groups collapsed by default unless expanded; no toggle when not collapsible', () => {
    const closed = config('list', { group: { ...group, defaultState: 'collapsed' } });
    const c = mount(view({ config: closed, expandedGroups: ['class:strings'] }));
    expect([...c.querySelectorAll('section')].map((s) => s.getAttribute('data-collapsed'))).toEqual(['false', 'true']);
    rerender(view({ config: config('list', { group: { ...group, collapsible: false } }), collapsedGroups: ['class:winds'] }));
    expect(c.querySelector('section button')).toBeNull();
    expect([...c.querySelectorAll('section')].map((s) => s.getAttribute('data-collapsed'))).toEqual(['false', 'false']);
  });

  it('draws an ungrouped view without headers, and an empty one with a message', () => {
    const c = mount(view({ config: config('list', { group: null }) }));
    expect(c.querySelector('section')).toBeNull();
    expect(c.querySelectorAll('li')).toHaveLength(3);
    rerender(view({ config: config('grid'), items: [], emptyText: 'Nothing yet' }));
    expect(c.textContent).toBe('Nothing yet');
  });

  it('keys duplicated items per group, so an item in two groups renders twice', () => {
    const tags = config('list', { group: { ...group, field: 'tags', multiValued: true, order: undefined } });
    const twice = [{ id: 'x', name: 'X', tags: ['loud', 'soft'] }];
    const c = mount(view({ config: tags, items: twice }));
    expect(c.querySelectorAll('li[data-id="x"]')).toHaveLength(2);
  });

  it('puts collection operations, and selection operations while something is selected, in a toolbar', () => {
    const onCollectionOperation = vi.fn();
    const c = mount(view({ config: config('list'), onCollectionOperation }));
    expect([...c.querySelectorAll('[data-role="collection-view"] > [data-role="actions"] button')].map((b) => b.textContent)).toEqual(['New']);
    rerender(view({ config: config('list'), onCollectionOperation, selectedIds: ['i3'] }));
    const [create, bulk] = [...c.querySelectorAll('[data-role="collection-view"] > [data-role="actions"] button')];
    click(bulk);
    expect(onCollectionOperation).toHaveBeenCalledWith(expect.objectContaining({ name: 'bulkDelete' }), [items[2]]);
    click(create);
    expect(onCollectionOperation).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'create' }), []);
    expect(c.querySelector('li[data-id="i3"]')?.getAttribute('aria-selected')).toBe('true');
  });
});

describe('groupItems (local copy of @zodal/ui)', () => {
  it('buckets a multi-valued field, the no-value group last', () => {
    const tags: ViewGroupConfig = { ...group, field: 'tags', multiValued: true, order: undefined };
    expect(groupItems(items, tags).map((g) => [g.id, g.items.length])).toEqual([['tags:loud', 1], [groupId('tags', null), 2]]);
  });
});
