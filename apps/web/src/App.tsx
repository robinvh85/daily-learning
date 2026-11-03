import { Navigate, Route, Routes } from 'react-router-dom';
import { useLogout, useMe, useVocabStats } from './api/hooks';
import { Layout } from './components/Layout/Layout';
import { useStudyTimer } from './hooks/useStudyTimer';
import { HomePage } from './pages/Home/HomePage';
import { LibraryPage } from './pages/Library/LibraryPage';
import { ListeningPage } from './pages/Listening/ListeningPage';
import { LoginPage } from './pages/Login/LoginPage';
import { PlaceholderPage } from './pages/Placeholder/PlaceholderPage';
import { ReadingPage } from './pages/Reading/ReadingPage';
import { VocabPage } from './pages/Vocab/VocabPage';

export function App() {
  const me = useMe();
  const logout = useLogout();
  const loggedIn = Boolean(me.data?.user);
  const stats = useVocabStats(loggedIn);
  // Study time for the streak and the week chart (only while logged in).
  useStudyTimer(loggedIn);

  if (me.isPending) {
    return (
      <p role="status" style={{ padding: 24 }}>
        Đang tải…
      </p>
    );
  }
  if (me.isError) {
    return (
      <p role="alert" style={{ padding: 24, color: 'var(--color-red)' }}>
        Không kết nối được Firebase: {me.error.message}
      </p>
    );
  }
  if (me.data.authMode === 'password' && !me.data.user) return <LoginPage />;

  return (
    <Layout
      dueCount={stats.data?.due ?? 0}
      onLogout={me.data.authMode === 'password' ? () => logout.mutate() : undefined}
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/read" element={<LibraryPage kind="reading" />} />
        <Route path="/read/:slug" element={<ReadingPage />} />
        <Route path="/listen" element={<LibraryPage kind="listening" />} />
        <Route path="/listen/:slug" element={<ListeningPage />} />
        <Route path="/vocab" element={<VocabPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route
          path="*"
          element={
            <PlaceholderPage title="Không tìm thấy trang">Trang này không tồn tại.</PlaceholderPage>
          }
        />
      </Routes>
    </Layout>
  );
}
