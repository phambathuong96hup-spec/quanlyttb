import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { HeartPulse, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { Input, Button } from '../components/ui';
import { loginUser } from '../services/api';
import { useAuth } from '../authContext';
import './Login.css';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fromLocation = (location.state as { from?: { pathname?: string; search?: string } })?.from;
  const from = fromLocation?.pathname
    ? `${fromLocation.pathname}${fromLocation.search || ''}`
    : '/dashboard';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !pin) {
      setError('Vui lòng nhập đầy đủ tên đăng nhập và mã PIN.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await loginUser({ username, pin });

      if (result.success && result.user) {
        login(result.user);
        navigate(from, { replace: true });
      } else {
        setError(result.message || 'Tên đăng nhập hoặc mã PIN không chính xác.');
      }
    } catch (err) {
      console.error(err);
      setError('Không thể kết nối đến máy chủ xác thực.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <HeartPulse size={48} className="login-logo" />
          <h1 className="login-title">Trung tâm Y tế khu vực Thanh Ba</h1>
          <p className="login-subtitle">Hệ thống Quản lý Trang thiết bị Y tế</p>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--danger-light)', padding: '10px', borderRadius: '4px' }}>
              <AlertCircle size={16} /> <span>{error}</span>
            </div>
          )}
          
          <Input 
            type="text" 
            placeholder="Tên đăng nhập hoặc Email" 
            icon={<Mail size={18} />}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <Input 
            type="password" 
            placeholder="Mã PIN" 
            icon={<Lock size={18} />}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
          />

          <Button type="submit" variant="primary" className="login-btn" disabled={isLoading}>
            {isLoading ? <><Loader2 size={18} className="animate-spin" /> Đang đăng nhập...</> : 'Đăng nhập'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Login;
