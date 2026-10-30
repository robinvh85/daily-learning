/**
 * Keyboard icon next to today's progress: opens the list of review shortcuts (also with `?`).
 * A non-modal popover: Escape or a click outside closes it.
 */
import { useEffect, useId, useRef } from 'react';
import { KeyboardIcon } from '../../components/Icons';
import styles from './VocabPage.module.css';

/** `range`: the keys are the two ends of a range (1–5), not alternatives. */
const SHORTCUTS: { keys: string[]; label: string; range?: boolean }[] = [
  { keys: ['Space', 'Enter'], label: 'Lật thẻ, xem nghĩa' },
  {
    keys: ['1', '5'],
    range: true,
    label: 'Chọn mức nhớ: Quên, Khó, Mai ôn, Nhớ, Dễ (khi Nhớ là 1 ngày thì không có Mai ôn: 1–4)',
  },
  { keys: ['R'], label: 'Nghe lại từ' },
  { keys: ['S'], label: 'Nghe câu ví dụ' },
  { keys: ['N', '→'], label: 'Sang từ khác (từ này ôn sau)' },
  { keys: ['?'], label: 'Mở / đóng bảng phím tắt' },
];

export interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsHelp({ open, onOpenChange }: ShortcutsHelpProps) {
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onOpenChange(false);
      buttonRef.current?.focus();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !wrapRef.current?.contains(e.target)) onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={wrapRef} className={styles.helpWrap}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.helpButton}
        aria-label="Phím tắt"
        title="Phím tắt (?)"
        aria-keyshortcuts="?"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpenChange(!open)}
      >
        <KeyboardIcon />
      </button>
      {open && (
        <div id={id} role="dialog" aria-label="Phím tắt khi ôn từ" className={styles.helpPanel}>
          <h2 className={styles.helpTitle}>Phím tắt</h2>
          <dl className={styles.helpList}>
            {SHORTCUTS.map((s) => (
              <div key={s.label} className={styles.helpRow}>
                <dt>
                  {s.keys.map((k, i) => (
                    <span key={k}>
                      {i > 0 && (s.range ? '–' : ' / ')}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </dt>
                <dd>{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
