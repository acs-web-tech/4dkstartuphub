import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import React, { Suspense } from 'react';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout/Layout';
import ProtectedRoute from './components/Common/ProtectedRoute';
import NetworkStatus from './components/Common/NetworkStatus';

// Lazy-load all pages for code splitting — each page becomes its own JS chunk
const Feed = React.lazy(() => import('./pages/Feed'));
const PostDetail = React.lazy(() => import('./pages/PostDetail'));
const Login = React.lazy(() => import('./pages/Login'));
const Register = React.lazy(() => import('./pages/Register'));
const Members = React.lazy(() => import('./pages/Members'));
const Discovery = React.lazy(() => import('./pages/Discovery'));
const Profile = React.lazy(() => import('./pages/Profile'));
const ChatRooms = React.lazy(() => import('./pages/ChatRooms'));
const Admin = React.lazy(() => import('./pages/Admin'));
const Bookmarks = React.lazy(() => import('./pages/Bookmarks'));
const UserDetail = React.lazy(() => import('./pages/UserDetail'));
const CreatePost = React.lazy(() => import('./components/Post/CreatePost'));
const PitchRequests = React.lazy(() => import('./pages/PitchRequests'));
const Pricing = React.lazy(() => import('./pages/Pricing'));
const Privacy = React.lazy(() => import('./pages/Privacy'));
const ForgotPassword = React.lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));

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
