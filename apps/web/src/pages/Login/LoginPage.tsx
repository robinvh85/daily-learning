import { useState, type FormEvent } from 'react';
import { ApiRequestError } from '../../api/client';
import { useLogin } from '../../api/hooks';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import styles from './LoginPage.module.css';

/** Shown while nobody is signed in (Firebase Auth, email + password). */
export function LoginPage() {
  const login = useLogin();
  useDocumentTitle('Đăng nhập');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, password });
  }

  const error =
    login.error instanceof ApiRequestError && login.error.status === 401
      ? 'Email hoặc mật khẩu không đúng.'
      : login.error
        ? `Không đăng nhập được: ${login.error.message}`
        : null;

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={onSubmit} aria-labelledby="login-title">
        <div className={styles.brand}>
          <div className={styles.logo} aria-hidden="true">
            D
          </div>
          DailyLearning
        </div>
        <h1 id="login-title" className={styles.title}>
          Đăng nhập
        </h1>
        <label className={styles.field}>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Mật khẩu
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <button type="submit" className={styles.submit} disabled={login.isPending}>
          {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </main>
  );
}
