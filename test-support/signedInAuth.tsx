import type { PropsWithChildren } from 'react';

// Existing page tests exercise page behavior independently of the session integration tests.
export function AuthProvider({ children }: PropsWithChildren) { return children; }
export const useAuth = () => ({ status: 'signedIn', session: { user: { id: 'test-user' } }, busy: null, message: null, signOut: jest.fn(), retry: jest.fn() });
