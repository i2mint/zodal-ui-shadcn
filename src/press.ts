/**
 * Press feedback for any pressable element: the feedback principle, applied by default.
 *
 * `usePress(action)` returns the props to spread on the element. Every press is acknowledged on
 * the pressed element itself, within the 0.1 s limit, before any network or navigation work:
 * `data-pressed` from `pointerdown` (CSS `:active` alone is not enough on iOS Safari, which applies
 * it only when a touch listener exists), then, while the action runs, `data-pending` +
 * `aria-busy` + `aria-disabled` with repeat presses ignored (the double-tap guard), and
 * `data-indicator` once the wait is long enough for a spinner (`PressIndicator` draws one). The
 * action runs on `click` (and Enter, when asked), never on `pointerdown` (WCAG 2.5.2). A page
 * restored from the back/forward cache drops a pending state left by a press that navigated away.
 *
 * `PRESS_CLASS` styles those attributes with Tailwind variants; it is on every pressable this
 * package draws. The decision: i2mint/zodal `docs/adr/0001-feedback-principle.md`.
 */

import React from 'react';
import { createActionFeedback, type ActionFeedback, type ActionFeedbackOptions, type ActionFeedbackState } from './action-feedback.js';

const h = React.createElement;

/** What {@link usePress} takes beyond the action. */
export interface PressOptions<R = unknown> extends Pick<ActionFeedbackOptions<R>, 'indicatorDelayMs' | 'minIndicatorMs' | 'isFailure' | 'clock'> {
  /** Also run on Enter (for an element that is not a native button, such as a card). */
  enterKey?: boolean;
  /** Stop the click from reaching an ancestor (a button inside a clickable card). */
  stopPropagation?: boolean;
  /** Called when the action settles (or is reset): show a failure's message here. */
  onSettled?: (state: Readonly<ActionFeedbackState<R>>) => void;
}

/** The props {@link usePress} returns, to spread on the pressable element. */
export interface PressProps {
  'data-zodal-press': '';
  'data-pressed'?: '';
  'data-pending'?: '';
  'data-indicator'?: '';
  'data-status'?: 'success' | 'error';
  'aria-busy'?: true;
  'aria-disabled'?: true;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onClick: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

/**
 * Tailwind classes for the feedback attributes: no tap delay, a quick scale-down when pressed,
 * dimmed with a progress cursor while pending; reduced motion swaps the scale for opacity.
 */
export const PRESS_CLASS =
  'touch-manipulation [-webkit-tap-highlight-color:transparent] transition-[transform,opacity] duration-75 ease-out ' +
  'data-[pressed]:scale-[0.97] data-[pressed]:opacity-85 data-[pending]:opacity-60 data-[pending]:cursor-progress ' +
  'motion-reduce:transition-opacity motion-reduce:data-[pressed]:scale-100';

/** Controls inside a pressable press themselves, not the pressable around them. */
const OWN_PRESS = '[data-zodal-press], button, a[href], input, select, textarea, label, [contenteditable]';

/** Every mounted press's reset, for a back/forward-cache restore: one window listener, not one per row. */
const resets = new Set<() => void>();
let pageshowInstalled = false;
function trackForPageshow(reset: () => void): () => void {
  if (!pageshowInstalled && typeof window !== 'undefined') {
    window.addEventListener('pageshow', (e) => {
      if ((e as PageTransitionEvent).persisted) for (const r of resets) r();
    });
    pageshowInstalled = true;
  }
  resets.add(reset);
  return () => void resets.delete(reset);
}

/**
 * Press feedback for one element: spread the returned props on it (and add {@link PRESS_CLASS}
 * to its classes). `action` may return a promise (or a zodal command result): the element stays
 * pending until it settles. The latest `action` is always the one run.
 *
 * @example
 * ```tsx
 * function LaunchTile({ app }) {
 *   const { props, state } = usePress(() => openApp(app.id), { enterKey: true });
 *   return <article {...props} className={`${PRESS_CLASS} rounded border p-4`}>
 *     {app.name}<PressIndicator show={state.indicator} />
 *   </article>;
 * }
 * ```
 */
export function usePress<R>(action: () => R | PromiseLike<R>, options: PressOptions<R> = {}): { props: PressProps; state: ActionFeedbackState<R> } {
  const { enterKey = false, stopPropagation = false, onSettled, ...timing } = options;
  const latest = React.useRef({ action, onSettled });
  latest.current = { action, onSettled };
  const [state, setState] = React.useState<ActionFeedbackState<R>>({ status: 'idle', indicator: false });
  const [pressed, setPressed] = React.useState(false);
  /** The last outcome shows until the next press starts. */
  const [outcomeShown, setOutcomeShown] = React.useState(false);
  const feedbackRef = React.useRef<ActionFeedback<[], R> | null>(null);
  if (feedbackRef.current === null) {
    feedbackRef.current = createActionFeedback(() => latest.current.action(), {
      ...timing,
      onChange: (s) => {
        setState(s);
        if (s.status !== 'pending') {
          setPressed(false);
          setOutcomeShown(true);
          latest.current.onSettled?.(s);
        }
      },
    });
  }
  const feedback = feedbackRef.current;

  React.useEffect(() => {
    const untrack = trackForPageshow(feedback.reset);
    return () => {
      untrack();
      feedback.dispose(); // safe to re-mount after: a held outcome is applied, the machine stays usable
    };
  }, [feedback]);

  // `closest` duck-typed, not `instanceof Element`, which fails across realms (a portal into an iframe).
  const owns = (e: React.SyntheticEvent) => {
    const target = e.target as Element | null;
    return typeof target?.closest === 'function' && target.closest(OWN_PRESS) === e.currentTarget;
  };
  const release = () => setPressed(false);
  const pending = state.status === 'pending';
  const props: PressProps = {
    'data-zodal-press': '',
    'data-pressed': pressed ? '' : undefined,
    'data-pending': pending ? '' : undefined,
    'data-indicator': state.indicator ? '' : undefined,
    'data-status': outcomeShown && (state.status === 'success' || state.status === 'error') ? state.status : undefined,
    'aria-busy': pending ? true : undefined,
    'aria-disabled': pending ? true : undefined,
    onPointerDown: (e) => {
      if (e.button !== 0 || !owns(e)) return;
      setPressed(true);
      setOutcomeShown(false);
    },
    onPointerUp: release,
    onPointerCancel: release,
    onPointerLeave: release,
    onClick: (e) => {
      if (stopPropagation) e.stopPropagation();
      if (owns(e)) void feedback.run();
    },
  };
  if (enterKey) {
    props.onKeyDown = (e) => {
      if (e.key === 'Enter' && e.target === e.currentTarget) void feedback.run();
    };
  }
  return { props, state };
}

/** A small spinner for a pending press past the indicator delay (a pulse under reduced motion). */
export function PressIndicator({ show }: { show: boolean }) {
  if (!show) return null;
  return h('span', {
    'aria-hidden': true,
    'data-role': 'press-indicator',
    className: 'ml-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent align-[-0.1em] motion-reduce:animate-pulse',
  });
}
