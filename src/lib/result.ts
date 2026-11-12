export type ActionState = { ok: boolean; message: string } | null;
export const fail = (message: string): ActionState => ({ ok: false, message });
export const done = (message: string): ActionState => ({ ok: true, message });

/** Postgres/PostgREST errors carry readable messages from our triggers; trim noise for display. */
export function friendly(error: { message: string; code?: string } | null | undefined): string {
  if (!error) return 'Something went wrong.';
  if (error.code === '23505') {
    if (/number_key/.test(error.message)) return 'That account number is already used in this company.';
    if (/name_key/.test(error.message)) return 'An account with that name already exists under the same parent.';
    return 'That already exists.';
  }
  if (error.code === '42501' || /row-level security/.test(error.message)) return 'You do not have permission to do that.';
  return error.message;
}
