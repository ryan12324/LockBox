import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.js';
import { ToastProvider } from './providers/ToastProvider.js';
import { startFoldableLayout } from './lib/foldable-layout.js';
import { getServerConnection, isNativeLockboxApp } from './lib/server-connection.js';
import { startThemeSync } from './lib/theme.js';
import { clearNativeDeviceState } from './lib/native-device-state.js';

const Register = lazy(() => import('./pages/Register.js'));
const Login = lazy(() => import('./pages/Login.js'));
const Unlock = lazy(() => import('./pages/Unlock.js'));
const ShareView = lazy(() => import('./pages/ShareView.js'));
const Vault = lazy(() => import('./pages/Vault.js'));
const Trash = lazy(() => import('./pages/Trash.js'));
const Generator = lazy(() => import('./pages/Generator.js'));
const Settings = lazy(() => import('./pages/Settings.js'));
const ImportExport = lazy(() => import('./pages/ImportExport.js'));
const Health = lazy(() => import('./pages/Health.js'));
const Cleanup = lazy(() => import('./pages/Cleanup.js'));
const AppLayout = lazy(() => import('./components/AppLayout.js'));
const Teams = lazy(() => import('./pages/Teams.js'));
const TeamDetail = lazy(() => import('./pages/TeamDetail.js'));
const ServerSetup = lazy(() => import('./pages/ServerSetup.js'));
const AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, userKey, isLocked } = useAuthStore();
  if (!session) return <Navigate to="/login" replace />;
  if (isLocked || !userKey) return <Navigate to="/unlock" replace />;
  return <>{children}</>;
}

export default function App() {
  const { session, isLocked, lastActivity, lock, logout, updateActivity } = useAuthStore();
  const nativeApp = isNativeLockboxApp();
  const [serverConfigured, setServerConfigured] = useState(
    () => !nativeApp || getServerConnection() !== null
  );

  useEffect(() => {
    if (nativeApp && !serverConfigured && session) {
      void clearNativeDeviceState().finally(logout);
    }
  }, [nativeApp, serverConfigured, session, logout]);

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

  useEffect(() => startFoldableLayout(), []);
  useEffect(() => startThemeSync(), []);

  return (
    <ToastProvider>
      <Suspense
        fallback={
          <div
            role="status"
            className="min-h-screen flex items-center justify-center text-sm text-[var(--color-text-secondary)]"
          >
            Loading Authwell…
          </div>
        }
      >
        <Routes>
          {nativeApp && (
            <Route
              path="/setup"
              element={
                <ServerSetup
                  onComplete={async () => {
                    await clearNativeDeviceState().catch(() => {});
                    logout();
                    setServerConfigured(true);
                  }}
                />
              }
            />
          )}

          {nativeApp && !serverConfigured ? (
            <Route path="*" element={<Navigate to="/setup" replace />} />
          ) : (
            <>
              <Route path="/register" element={<Register />} />
              <Route path="/login" element={<Login />} />
              <Route path="/unlock" element={<Unlock />} />
              <Route path="/share/:shareId" element={<ShareView />} />

              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/vault" element={<Vault />} />
                <Route path="/trash" element={<Trash />} />
                <Route path="/generator" element={<Generator />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/import-export" element={<ImportExport />} />
                <Route path="/health" element={<Health />} />
                <Route path="/cleanup" element={<Cleanup />} />
                <Route path="/teams" element={<Teams />} />
                <Route path="/teams/:teamId" element={<TeamDetail />} />
              </Route>

              <Route path="/" element={<Navigate to={session ? '/vault' : '/login'} replace />} />
            </>
          )}
        </Routes>
      </Suspense>
    </ToastProvider>
  );
}
