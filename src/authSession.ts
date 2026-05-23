export interface AuthUser {
  username: string;
  role: string;
  name: string;
  email: string;
  department: string;
  token?: string;
  expiresAt?: number;
}

export interface AuthState extends AuthUser {
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AUTH_STORAGE_KEY = 'qlttb.auth';
const LEGACY_KEYS = ['isAuthenticated', 'username', 'userRole', 'userName', 'userEmail', 'userDepartment'];

export const emptyAuth: AuthState = {
  isAuthenticated: false,
  isAdmin: false,
  username: '',
  role: '',
  name: '',
  email: '',
  department: '',
};

export const normalizeRole = (role?: string) => String(role || '').trim().toLowerCase();

export const normalizeUser = (user: Partial<AuthUser>): AuthUser => ({
  username: String(user.username || '').trim(),
  role: String(user.role || 'User').trim(),
  name: String(user.name || user.username || 'Người dùng').trim(),
  email: String(user.email || '').trim(),
  department: String(user.department || '').trim(),
  token: user.token,
  expiresAt: user.expiresAt,
});

export const clearLegacyAuth = () => {
  LEGACY_KEYS.forEach(key => localStorage.removeItem(key));
};

export const readAuthSession = (): AuthState => {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return emptyAuth;
    const session = normalizeUser(JSON.parse(raw));
    if (!session.username) return emptyAuth;
    if (session.expiresAt && session.expiresAt <= Date.now()) {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      return emptyAuth;
    }
    return {
      ...session,
      isAuthenticated: true,
      isAdmin: normalizeRole(session.role) === 'admin',
    };
  } catch {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    return emptyAuth;
  }
};

export const writeAuthSession = (user: Partial<AuthUser>): AuthState => {
  const session = normalizeUser(user);
  clearLegacyAuth();
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  return {
    ...session,
    isAuthenticated: true,
    isAdmin: normalizeRole(session.role) === 'admin',
  };
};

export const clearAuthSession = () => {
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  clearLegacyAuth();
};

export const getAuthPayload = () => {
  const session = readAuthSession();
  return {
    actorUsername: session.username,
    sessionToken: session.token,
  };
};
