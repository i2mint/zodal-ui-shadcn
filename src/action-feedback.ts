/**
 * The response-time limits and one action's pending / indicator / double-tap-guard state:
 * `FEEDBACK_MS`, `feedbackFor`, `createActionFeedback`, `isCommandFailure`, re-exported from
 * `@zodal/ui` (0.2.6 and later), which owns them. This package carried a copy while the `@zodal/ui`
 * on npm predated them; change them in `@zodal/ui`, not here. The decision: i2mint/zodal
 * `docs/adr/0001-feedback-principle.md`.
 */

export { FEEDBACK_MS, feedbackFor, createActionFeedback, isCommandFailure } from '@zodal/ui';
export type {
  FeedbackLevel,
  ActionStatus,
  ActionFeedbackState,
  ActionFeedbackOptions,
  ActionFeedback,
  FeedbackClock,
} from '@zodal/ui';
