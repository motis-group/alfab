import styles from '@components/ActionButton.module.scss';

import * as React from 'react';
import * as Utilities from '@common/utilities';

interface ActionButtonProps {
  onClick?: () => void;
  hotkey?: any;
  children?: React.ReactNode;
  style?: any;
  rootStyle?: any;
  isSelected?: boolean;
}

// A span, not a div: callers put it inside Text, which is a <p>, and a div there breaks hydration.
const ActionButton = React.forwardRef<HTMLSpanElement, ActionButtonProps>(({ onClick, hotkey, children, style, rootStyle, isSelected }, ref) => {
  return (
    <span className={Utilities.classNames(styles.root, isSelected ? styles.selected : null)} style={rootStyle} onClick={onClick} tabIndex={0} ref={ref} role="button">
      {Utilities.isEmpty(hotkey) ? null : <span className={styles.hotkey}>{hotkey}</span>}
      <span className={styles.content} style={style}>
        {children}
      </span>
    </span>
  );
});

ActionButton.displayName = 'ActionButton';

export default ActionButton;
