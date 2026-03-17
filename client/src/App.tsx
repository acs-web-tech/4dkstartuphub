import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import React, { Suspense } from 'react';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout/Layout';
import ProtectedRoute from './components/Common/ProtectedRoute';
import NetworkStatus from './components/Common/NetworkStatus';

/**
 * Wraps React.lazy with automatic retry logic.
 * If a dynamic import fails (e.g. stale chunk hash after deployment, flaky network),
 * it retries up to `retries` times with a short delay. On final failure, it forces
 * a full page reload to fetch the latest index.html with updated chunk references.
 */
function lazyWithRetry(importFn: () => Promise<any>, retries = 3, delay = 1000) {
    return React.lazy(() => {
        const attempt = (remaining: number): Promise<any> =>
            importFn().catch((err: any) => {
                if (remaining <= 0) {
                    // Last resort: reload the page to get fresh chunk manifest
                    // Only if this looks like a chunk load error
                    if (
                        err?.message?.includes('dynamically imported module') ||
                        err?.message?.includes('Loading chunk') ||
                        err?.message?.includes('Failed to fetch')
                    ) {
                        window.location.reload();
                        // Return a never-resolving promise to prevent React from rendering an error
                        return new Promise(() => {});
                    }
                    throw err;
                }
                return new Promise<void>((resolve) => setTimeout(resolve, delay)).then(() =>
                    attempt(remaining - 1)
                );
            });
        return attempt(retries);
    });
}

// Lazy-load all pages with retry — each page becomes its own JS chunk
const Feed = lazyWithRetry(() => import('./pages/Feed'));
const PostDetail = lazyWithRetry(() => import('./pages/PostDetail'));
const Login = lazyWithRetry(() => import('./pages/Login'));
const Register = lazyWithRetry(() => import('./pages/Register'));
const Members = lazyWithRetry(() => import('./pages/Members'));
const Discovery = lazyWithRetry(() => import('./pages/Discovery'));
const Profile = lazyWithRetry(() => import('./pages/Profile'));
const ChatRooms = lazyWithRetry(() => import('./pages/ChatRooms'));
const Admin = lazyWithRetry(() => import('./pages/Admin'));
const Bookmarks = lazyWithRetry(() => import('./pages/Bookmarks'));
const UserDetail = lazyWithRetry(() => import('./pages/UserDetail'));
const CreatePost = lazyWithRetry(() => import('./components/Post/CreatePost'));
const PitchRequests = lazyWithRetry(() => import('./pages/PitchRequests'));
const Pricing = lazyWithRetry(() => import('./pages/Pricing'));
const Privacy = lazyWithRetry(() => import('./pages/Privacy'));
const ForgotPassword = lazyWithRetry(() => import('./pages/ForgotPassword'));
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword'));

import { SocketProvider } from './context/SocketContext';
import { ModalProvider } from './context/ModalContext';
import ScrollRestoration from './components/Common/ScrollRestoration';
import ErrorBoundary from './components/Common/ErrorBoundary';

const PageLoader = () => (
    <div className="loading-container">
        <div className="spinner" />
        <p>Loading...</p>
    </div>
);

const ModalLoader = () => (
    <div className="post-detail-is-modal">
        <div className="modal-backdrop" />
        <div className="modal-wrapper" style={{ alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" />
            <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Loading Post...</p>
        </div>
    </div>
);

const AppRoutes = () => {
    const location = useLocation();
    const background = location.state && location.state.background;

    return (
        <>
            <Routes location={background || location}>
                {/* Auth pages (no layout) */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />

                {/* Main app layout */}
                <Route element={<Layout />}>
                    <Route path="/" element={<Navigate to="/feed" replace />} />

                    {/* Protected community routes */}
                    <Route path="/feed" element={
                        <ProtectedRoute><Feed /></ProtectedRoute>
                    } />
                    <Route path="/posts/:id" element={
                        <ProtectedRoute><PostDetail /></ProtectedRoute>
                    } />
                    <Route path="/discovery" element={
                        <ProtectedRoute><Discovery /></ProtectedRoute>
                    } />
                    <Route path="/members" element={
                        <ProtectedRoute><Members /></ProtectedRoute>
                    } />
                    <Route path="/users/:id" element={
                        <ProtectedRoute><UserDetail /></ProtectedRoute>
                    } />

                    {/* Feature protected routes */}
                    <Route path="/create-post" element={
                        <ProtectedRoute><CreatePost /></ProtectedRoute>
                    } />
                    <Route path="/edit-post/:id" element={
                        <ProtectedRoute><CreatePost /></ProtectedRoute>
                    } />
                    <Route path="/profile" element={
                        <ProtectedRoute><Profile /></ProtectedRoute>
                    } />
                    <Route path="/bookmarks" element={
                        <ProtectedRoute><Bookmarks /></ProtectedRoute>
                    } />
                    <Route path="/chatrooms/:roomId?" element={
                        <ProtectedRoute><ChatRooms /></ProtectedRoute>
                    } />
                    <Route path="/pitch-requests" element={
                        <ProtectedRoute><PitchRequests /></ProtectedRoute>
                    } />
                    <Route path="/pricing" element={
                        <Pricing />
                    } />
                    <Route path="/privacy" element={<Privacy />} />

                    {/* Admin only */}
                    <Route path="/admin" element={
                        <ProtectedRoute adminOnly><Admin /></ProtectedRoute>
                    } />

                    {/* Catch-all */}
                    <Route path="*" element={<Navigate to="/feed" replace />} />
                </Route>
            </Routes>

            {/* Render modals when background state is present */}
            {background && (
                <Routes>
                    <Route path="/posts/:id" element={
                        <Suspense fallback={<ModalLoader />}>
                            <ProtectedRoute><PostDetail isModal /></ProtectedRoute>
                        </Suspense>
                    } />
                </Routes>
            )}
        </>
    );
};

export default function App() {
    return (
        <BrowserRouter>
            <NetworkStatus />
            <ScrollRestoration />
            <ErrorBoundary>
                <ModalProvider>
                    <AuthProvider>
                        <SocketProvider>
                            <Suspense fallback={<PageLoader />}>
                                <AppRoutes />
                            </Suspense>
                        </SocketProvider>
                    </AuthProvider>
                </ModalProvider>
            </ErrorBoundary>
        </BrowserRouter>
    );
}
