'use client';

import styles from '@components/FileDropZone.module.scss';

import * as React from 'react';
import * as Utilities from '@common/utilities';

interface FileDropZoneProps {
  /** Extensions for the file dialog, e.g. ".dxf,.pdf". The caller still checks what it is given. */
  accept: string;
  label: string;
  title: string;
  hint: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}

/** One box a file is dropped on or chosen through. What happens to the file is the caller's business. */
export default function FileDropZone({ accept, label, title, hint, disabled = false, onFile }: FileDropZoneProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = React.useState(false);

  function take(file: File | null | undefined) {
    if (file && !disabled) {
      onFile(file);
    }
    // Cleared so choosing the same file twice still fires a change event.
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  function openFileDialog() {
    if (!disabled) {
      inputRef.current?.click();
    }
  }

  return (
    <>
      <input ref={inputRef} className={styles.hiddenInput} type="file" accept={accept} disabled={disabled} tabIndex={-1} aria-hidden="true" onChange={(event) => take(event.target.files?.[0])} />

      <div
        className={Utilities.classNames(styles.dropZone, isDragActive ? styles.dropZoneActive : null, disabled ? styles.dropZoneDisabled : null)}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={label}
        onClick={openFileDialog}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openFileDialog();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) {
            setIsDragActive(true);
          }
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragActive(false);
          take(event.dataTransfer?.files?.[0]);
        }}
      >
        <span className={styles.dropZoneTitle}>{title}</span>
        <span className={styles.dropZoneHint}>{hint}</span>
      </div>
    </>
  );
}
