import { Navigate, Route, Routes } from 'react-router-dom';
import { useLogout, useMe, useVocabStats } from './api/hooks';
import { Layout } from './components/Layout/Layout';
import { HomePage, LessonListPage } from './pages/Home/HomePage';
import { ListeningPage } from './pages/Listening/ListeningPage';
import { LoginPage } from './pages/Login/LoginPage';
import { PlaceholderPage } from './pages/Placeholder/PlaceholderPage';
import { ReadingPage } from './pages/Reading/ReadingPage';
import { VocabPage } from './pages/Vocab/VocabPage';

export function App() {
  const me = useMe();
  const logout = useLogout();
  const stats = useVocabStats(Boolean(me.data?.user));

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
        Không kết nối được máy chủ: {me.error.message}
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
        <Route path="/read" element={<LessonListPage kind="reading" />} />
        <Route path="/read/:slug" element={<ReadingPage />} />
        <Route path="/listen" element={<LessonListPage kind="listening" />} />
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
