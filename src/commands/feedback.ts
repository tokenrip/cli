import { requireAuthClient } from '../auth-client.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatFeedbackSent } from '../formatters.js';

/** Refusals for want of exactly one verified person to send the note from. */
const FEEDBACK_OPERATOR_REFUSALS = new Set(['NO_OPERATOR', 'OPERATOR_AMBIGUOUS']);

/**
 * A note refused for want of one verified person: signing in again is not the answer (the general
 * hints point at sign-in); the person can send it themselves.
 */
export const FEEDBACK_OPERATOR_HINT = "Nothing was sent. Your person can send it from Send feedback in the dashboard's account menu.";

/** Send one note to the Tokenrip team (`POST /v0/feedback`). Not a workspace write, so no why. */
export async function feedback(text: string): Promise<void> {
  const { client } = requireAuthClient();
  try {
    const { data } = await client.post('/v0/feedback', { text });
    outputSuccess(data.data, formatFeedbackSent);
  } catch (err) {
    if (err instanceof CliError && FEEDBACK_OPERATOR_REFUSALS.has(err.code)) err.hint = FEEDBACK_OPERATOR_HINT;
    throw err;
  }
}
