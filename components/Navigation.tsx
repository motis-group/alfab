'use client';

import styles from '@components/Navigation.module.scss';

import * as React from 'react';

interface NavigationProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  logoHref?: string;
  logoTarget?: React.HTMLAttributeAnchorTarget;
  onClickLogo?: React.MouseEventHandler<HTMLButtonElement>;
  logo?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
}

const Navigation: React.FC<NavigationProps> = ({ children, logoHref, logoTarget, onClickLogo, logo, left, right }) => {
  // A logo that does nothing is a mark, not a control. A button with no action still takes focus
  // and still announces itself as a button, and it cannot meet a target size because there is no
  // target. Render a control only when there is something to press.
  let logoElement = (
    <span className={styles.logo} aria-hidden="true">
      {logo}
    </span>
  );

  if (onClickLogo) {
    logoElement = (
      <button className={styles.logo} onClick={onClickLogo}>
        {logo}
      </button>
    );
  }

  if (logoHref) {
    logoElement = (
      <a href={logoHref} className={styles.logo} target={logoTarget}>
        {logo}
      </a>
    );
  }

  return (
    <nav className={styles.root}>
      {logoElement}
      <section className={styles.left}>{left}</section>
      <section className={styles.children}>{children}</section>
      <section className={styles.right}>{right}</section>
    </nav>
  );
};

export default Navigation;
