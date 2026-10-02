import { describe, expect, it } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary', () => {
  it('turns a thrown error into state so the page can show a message', () => {
    expect(ErrorBoundary.getDerivedStateFromError(new Error('boom')).error?.message).toBe('boom');
  });
  it('starts with no error, so healthy pages render untouched', () => {
    expect(new ErrorBoundary({ children: null }).state.error).toBeNull();
  });
});
