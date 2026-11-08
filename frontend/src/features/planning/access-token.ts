/**
 * The signed-in user's Supabase access token, or null when signed out.
 *
 * Routine screens call only this function; it now comes from the shared
 * Supabase sign-in (identity lane).
 */
export { getAccessToken } from '@/lib/supabase/client';
