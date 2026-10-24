import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import styles from '../Home/Home.module.css';

export function PlaceholderPage({ title, children }: { title: string; children: ReactNode }) {
  useDocumentTitle(title);
  return (
    <>
      <header>
        <h1 className={styles.h1}>{title}</h1>
      </header>
      <section className={styles.card}>
        <p className={styles.muted}>{children}</p>
        <Link to="/">Về trang chủ</Link>
      </section>
    </>
  );
}
