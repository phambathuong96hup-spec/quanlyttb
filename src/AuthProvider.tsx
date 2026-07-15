import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './authContext';
import {
  clearAuthSession,
  emptyAuth,
  readAuthSession,
  SESSION_INVALID_EVENT,
  writeAuthSession,
  type AuthState,
  type AuthUser,
} from './authSession';

import { clearApiResourceCache } from './hooks/useApiResource';

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => readAuthSession());

  const login = useCallback((user: Partial<AuthUser>) => {
    setAuth(writeAuthSession(user));
  }, []);

  const logout = useCallback(() => {
    clearAuthSession();
    clearApiResourceCache();
    setAuth(emptyAuth);
  }, []);

  useEffect(() => {
    const handleInvalidSession = () => logout();
    window.addEventListener(SESSION_INVALID_EVENT, handleInvalidSession);
    return () => window.removeEventListener(SESSION_INVALID_EVENT, handleInvalidSession);
  }, [logout]);

  const value = useMemo(() => ({ ...auth, login, logout }), [auth, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;
