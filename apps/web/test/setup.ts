import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { fetchTransport, setApiTransport } from '../src/api/client';

// Component tests stub `fetch('/api/…')` with canned responses instead of the in-browser backend.
setApiTransport(fetchTransport);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
