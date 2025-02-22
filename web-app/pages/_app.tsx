import '@/global.scss';

import * as React from 'react';
import { AppProps } from 'next/app';

import Providers from '@components/Providers';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <Providers>
      <Component {...pageProps} />
    </Providers>
  );
}

export default MyApp;
