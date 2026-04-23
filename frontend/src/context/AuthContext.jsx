import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const TOKEN_KEY = 'auth_token';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const getToken = () => localStorage.getItem(TOKEN_KEY);

  const setToken = (token) => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  };

  const authHeaders = () => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadUser = useCallback(async () => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await axios.get(`${BASE_URL}/auth/me`, { headers: authHeaders() });
      setUser(data.user);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const register = async ({ email, password, name }) => {
    const { data } = await axios.post(`${BASE_URL}/auth/register`, { email, password, name });
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const login = async ({ email, password }) => {
    const { data } = await axios.post(`${BASE_URL}/auth/login`, { email, password });
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const loginWithGoogle = async (credential) => {
    const { data } = await axios.post(`${BASE_URL}/auth/google`, { credential });
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const loginWithFacebook = async (accessToken, userID) => {
    const { data } = await axios.post(`${BASE_URL}/auth/facebook`, { accessToken, userID });
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const sendOtp = async (phone) => {
    const { data } = await axios.post(`${BASE_URL}/auth/phone`, { phone });
    return data;
  };

  const verifyOtp = async (phone, otp) => {
    const { data } = await axios.post(`${BASE_URL}/auth/verify-otp`, { phone, otp });
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    try {
      await axios.post(`${BASE_URL}/auth/logout`, {}, { headers: authHeaders() });
    } catch {}
    setToken(null);
    setUser(null);
  };

  const isPro = () => {
    if (!user) return false;
    if (user.plan === 'pro' && user.plan_expires_at && new Date(user.plan_expires_at) > new Date()) return true;
    return false;
  };

  return (
    <AuthContext.Provider value={{
      user, loading,
      register, login, loginWithGoogle, loginWithFacebook,
      sendOtp, verifyOtp, logout, isPro,
      getToken, authHeaders,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
