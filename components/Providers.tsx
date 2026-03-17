'use client';

import * as React from 'react';

import { ThemeProvider } from '@components/ThemeProvider';
import { ModalProvider } from '@components/page/ModalContext';
import { ThemePreferences } from '@utils/theme-preferences';

interface ProvidersProps {
  children: React.ReactNode;
  initialThemePreferences: ThemePreferences;
}

const Providers: React.FC<ProvidersProps> = ({ children, initialThemePreferences }) => {
  return (
    <ThemeProvider initialThemePreferences={initialThemePreferences}>
      <ModalProvider>{children}</ModalProvider>
    </ThemeProvider>
  );
};

export default Providers;
