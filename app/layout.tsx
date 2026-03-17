import Providers from '@components/Providers';
import { PricingProvider } from '@components/PricingProvider';
import { readThemePreferencesFromCookie } from '@utils/theme-preferences-server';
import { themePreferencesToBodyClassName } from '@utils/theme-preferences';

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialThemePreferences = await readThemePreferencesFromCookie();

  return (
    <html lang="en-us">
      <body className={themePreferencesToBodyClassName(initialThemePreferences)}>
        <Providers initialThemePreferences={initialThemePreferences}>
          <PricingProvider>{children}</PricingProvider>
        </Providers>
      </body>
    </html>
  );
}
