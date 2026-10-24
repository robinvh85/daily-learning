import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from '../Home/Home.module.css';

export function PlaceholderPage({ title, children }: { title: string; children: ReactNode }) {
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
