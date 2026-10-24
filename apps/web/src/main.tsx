import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ApiRequestError } from './api/client';
import { App } from './App';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Do not retry client errors (404, 401…).
      retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 2,
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
