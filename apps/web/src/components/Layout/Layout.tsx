import type { ReactNode } from 'react';
import { Sidebar, type SidebarProps } from '../Sidebar/Sidebar';
import styles from './Layout.module.css';

export const MAIN_ID = 'main-content';

export function Layout({ children, ...sidebar }: SidebarProps & { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      {/* First focusable element: lets keyboard users jump past the navigation. */}
      <a className={styles.skip} href={`#${MAIN_ID}`}>
        Bỏ qua đến nội dung chính
      </a>
      <Sidebar {...sidebar} />
      <main id={MAIN_ID} tabIndex={-1} className={styles.main}>
        {children}
      </main>
    </div>
  );
}
