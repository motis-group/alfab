'use client';

import * as React from 'react';

import Dialog from '@components/Dialog';
import { useModals } from '@components/page/ModalContext';

interface ModalConfirmProps {
  title: string;
  message: string;
  onAnswer: (confirmed: boolean) => void;
}

/** The sacred.computer Dialog on the modal stack, in place of the browser's confirm(). */
function ModalConfirm({ title, message, onAnswer }: ModalConfirmProps) {
  const { close } = useModals();
  const root = React.useRef<HTMLDivElement>(null);

  const answer = React.useCallback(
    (confirmed: boolean) => {
      close();
      onAnswer(confirmed);
    },
    [close, onAnswer]
  );

  // The browser's dialog took the keyboard; this one has to as well. Focus lands on Cancel, the
  // safe choice for something that cannot be undone, and Escape cancels.
  React.useEffect(() => {
    const buttons = root.current?.querySelectorAll('button');
    buttons?.[buttons.length - 1]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        answer(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [answer]);

  return (
    <div ref={root}>
      <Dialog title={title} onConfirm={() => answer(true)} onCancel={() => answer(false)}>
        {message}
      </Dialog>
    </div>
  );
}

/** Asks on the modal stack and resolves true for OK, false for Cancel or Escape. */
export function useConfirm(): (title: string, message: string) => Promise<boolean> {
  const { open } = useModals();
  return React.useCallback((title: string, message: string) => new Promise<boolean>((resolve) => open(ModalConfirm, { title, message, onAnswer: resolve })), [open]);
}

export default ModalConfirm;
