import { createContext, useContext } from 'react';
import { emptyAuth, type AuthState, type AuthUser } from './authSession';

export interface AuthContextType extends AuthState {
  login: (user: Partial<AuthUser>) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType>({
  ...emptyAuth,
  login: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
