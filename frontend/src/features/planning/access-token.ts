/**
 * The signed-in user's Supabase access token, or null when signed out.
 *
 * Sign-in belongs to the identity lane and the frontend has no Supabase client
 * yet, so nobody can be signed in. Routine screens call only this function, so
 * connecting real sign-in means changing just this body.
 */
export async function getAccessToken(): Promise<string | null> {
  return null;
}
