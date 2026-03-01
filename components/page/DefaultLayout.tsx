import styles from '@components/page/DefaultLayout.module.scss';

import * as React from 'react';

interface DefaultLayoutProps {
  previewPixelSRC: string;
  variant?: 'narrow' | 'wide';
  children?: React.ReactNode;
}

const DefaultLayout: React.FC<DefaultLayoutProps> = ({ previewPixelSRC, variant = 'narrow', children }) => {
  const variantClassName = variant === 'wide' ? styles.wide : styles.narrow;

  return (
    <div className={`${styles.body} ${variantClassName}`}>
      <img className={styles.pixel} src={previewPixelSRC} alt="" />
      {children}
    </div>
  );
};

export default DefaultLayout;
