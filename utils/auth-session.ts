import { cookies } from 'next/headers';

export async function hasAppSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session')?.value;
  return Boolean(sessionToken && sessionToken.length >= 16);
}
