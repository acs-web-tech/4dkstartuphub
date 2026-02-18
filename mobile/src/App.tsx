import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout/Layout';
import ProtectedRoute from './components/Common/ProtectedRoute';
import Feed from './pages/Feed';
import PostDetail from './pages/PostDetail';
import Login from './pages/Login';
import Register from './pages/Register';
import Members from './pages/Members';
import Discovery from './pages/Discovery';
import Profile from './pages/Profile';
import ChatRooms from './pages/ChatRooms';
import Admin from './pages/Admin';
import Bookmarks from './pages/Bookmarks';
import UserDetail from './pages/UserDetail';
import CreatePost from './components/Post/CreatePost';
import PitchRequests from './pages/PitchRequests';

import { SocketProvider } from './context/SocketContext';
import ScrollRestoration from './components/Common/ScrollRestoration';
import { initializeNativePush } from './utils/nativePush';

export default function App() {
    useEffect(() => {
        // Debug connection string
        const url = import.meta.env.VITE_API_URL;
        // alert(`Debug: API URL is configured as: ${url || 'UNDEFINED/MISSING'}`);
    }, []);

    return (
        <BrowserRouter>
            <ScrollRestoration />
            <AuthProvider>
                <SocketProvider>
                    <Routes>
                        {/* Auth pages (no layout) */}
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />

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
                            <Route path="/chatrooms" element={
                                <ProtectedRoute><ChatRooms /></ProtectedRoute>
                            } />
                            <Route path="/pitch-requests" element={
                                <ProtectedRoute><PitchRequests /></ProtectedRoute>
                            } />

                            {/* Admin only */}
                            <Route path="/admin" element={
                                <ProtectedRoute adminOnly><Admin /></ProtectedRoute>
                            } />

                            {/* Catch-all */}
                            <Route path="*" element={<Navigate to="/feed" replace />} />
                        </Route>
                    </Routes>
                </SocketProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}
