import type { ReactNode } from 'react';
import { Sidebar, type SidebarProps } from '../Sidebar/Sidebar';
import styles from './Layout.module.css';

export function Layout({ children, ...sidebar }: SidebarProps & { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <Sidebar {...sidebar} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
