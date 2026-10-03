/**
 * Turning Supabase Auth errors into copy a shopper can act on.
 *
 * Supabase returns one error code (`over_email_send_rate_limit`) for three very
 * different situations, so matching on the message is the only way to tell them
 * apart — and the difference matters enormously here, because the project's
 * default SMTP allows 2 messages per hour and only to team members:
 *
 *   "…you can only request this once every 60 seconds"  -> wait a minute
 *   "Email rate limit exceeded"                          -> the project's hourly
 *                                                         budget is spent; hours,
 *                                                         not a minute
 *   "Email address not authorized"                      -> this address cannot
 *                                                         receive codes at all
 *
 * Getting these wrong is how a shopper ends up staring at "try again in a
 * minute" for an hour. Pure functions, so they can be exercised directly.
 */

export type AuthNotice = {
  /** What the person is told. */
  message: string;
  /**
   * `notice` is the project's fault, not theirs — an exhausted email budget or
   * an address outside the team should not be rendered as a red error.
   */
  tone: "error" | "notice";
};

const GENERIC = "Could not send the code. Check the address and try again.";

/** Failure of the "send me a code" step. */
export function describeSendFailure(raw: unknown): AuthNotice {
  const message = raw instanceof Error ? raw.message : String(raw ?? "");

  if (/once every \d+ seconds/i.test(message)) {
    return { message: "Too many attempts. Wait a minute and try again.", tone: "error" };
  }
  if (/rate limit|too many requests|security purposes/i.test(message)) {
    return {
      message:
        "Code sending is paused right now — we have run out of email for the hour. Try again later.",
      tone: "notice",
    };
  }
  if (/not authorized/i.test(message)) {
    return {
      message: "We cannot send codes to this address yet. Try another one.",
      tone: "notice",
    };
  }
  if (/rate|limit/i.test(message)) {
    return { message: "Too many attempts. Wait a minute and try again.", tone: "error" };
  }
  return { message: GENERIC, tone: "error" };
}

/** Failure of the "check the code" step. */
export function describeVerifyFailure(raw: unknown): AuthNotice {
  const message = raw instanceof Error ? raw.message : String(raw ?? "");

  if (/expired|invalid|token/i.test(message)) {
    return { message: "That code is not valid or has expired. Request a new one.", tone: "error" };
  }
  if (/rate limit|too many requests|security purposes/i.test(message)) {
    return { message: "Too many attempts. Wait a minute and try again.", tone: "error" };
  }
  return { message: "That code is not valid. Request a new one.", tone: "error" };
}
