import NewVersionNotice from '@components/NewVersionNotice';
import Providers from '@components/Providers';
import { PricingProvider } from '@components/PricingProvider';
import { BUILD_ID } from '@utils/build-id';
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
          <NewVersionNotice buildId={BUILD_ID} />
        </Providers>
      </body>
    </html>
  );
}
