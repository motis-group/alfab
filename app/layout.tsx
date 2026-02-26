import Providers from '@components/Providers';
import { PricingProvider } from '@components/PricingProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-us">
      <body className="theme-light">
        <Providers>
          <PricingProvider>{children}</PricingProvider>
        </Providers>
      </body>
    </html>
  );
}
