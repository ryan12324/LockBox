import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.js';
import Register from './pages/Register.js';
import Login from './pages/Login.js';
import Unlock from './pages/Unlock.js';
import ShareView from './pages/ShareView.js';
import Vault from './pages/Vault.js';
import Trash from './pages/Trash.js';
import Generator from './pages/Generator.js';
import Settings from './pages/Settings.js';
import ImportExport from './pages/ImportExport.js';
import AISettings from './pages/AISettings.js';
import Health from './pages/Health.js';
import Chat from './pages/Chat.js';
import AppLayout from './components/AppLayout.js';
import Teams from './pages/Teams.js';
import TeamDetail from './pages/TeamDetail.js';
import EmergencyAccess from './pages/EmergencyAccess.js';
import { AuraProvider } from './providers/AuraProvider.js';
import { ToastProvider } from './providers/ToastProvider.js';
const AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, userKey, isLocked } = useAuthStore();
  if (!session) return <Navigate to="/login" replace />;
  if (isLocked || !userKey) return <Navigate to="/unlock" replace />;
  return <>{children}</>;
}

export default function App() {
  const { session, isLocked, lastActivity, lock, updateActivity } = useAuthStore();

  // Auto-lock after inactivity
  useEffect(() => {
    const interval = setInterval(() => {
      if (session && !isLocked && Date.now() - lastActivity > AUTO_LOCK_MS) {
        lock();
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [session, isLocked, lastActivity, lock]);

  // Track user activity
  useEffect(() => {
    const handler = () => updateActivity();
    window.addEventListener('mousemove', handler);
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('mousemove', handler);
      window.removeEventListener('keydown', handler);
    };
  }, [updateActivity]);

  return (
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/unlock" element={<Unlock />} />
      <Route path="/share/:shareId" element={<ShareView />} />

      <Route
        element={
          <ProtectedRoute>
            <AuraProvider>
              <ToastProvider>
                <AppLayout />
              </ToastProvider>
            </AuraProvider>
          </ProtectedRoute>
        }
      >
        <Route path="/vault" element={<Vault />} />
        <Route path="/trash" element={<Trash />} />
        <Route path="/generator" element={<Generator />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/import-export" element={<ImportExport />} />
        <Route path="/settings/ai" element={<AISettings />} />
        <Route path="/health" element={<Health />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/:teamId" element={<TeamDetail />} />
        <Route path="/emergency-access" element={<EmergencyAccess />} />
      </Route>

      <Route path="/" element={<Navigate to={session ? '/vault' : '/login'} replace />} />
    </Routes>
  );
}
