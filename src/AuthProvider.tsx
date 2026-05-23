import React, { useCallback, useMemo, useState } from 'react';
import { AuthContext } from './authContext';
import { clearAuthSession, emptyAuth, readAuthSession, writeAuthSession, type AuthState, type AuthUser } from './authSession';

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

  const value = useMemo(() => ({ ...auth, login, logout }), [auth, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;
