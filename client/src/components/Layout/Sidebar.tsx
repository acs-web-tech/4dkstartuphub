
import { NavLink, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PostCategory } from '../../types';
import { CATEGORY_CONFIG } from '../../config';
import {
    Plus, Newspaper, Hash, Users, Globe, MessageCircle, Bookmark, Settings, Search, Lightbulb, X, Rocket, ArrowRight, Wifi
} from 'lucide-react';

interface Props {
    isOpen?: boolean;
    onClose?: () => void;
}

export default function Sidebar({ isOpen, onClose }: Props) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const activeCategory = searchParams.get('category') || '';

    const handleCategoryClick = (category: string) => {
        navigate(category === 'all' ? '/feed' : `/feed?category=${category}`);
        if (onClose) onClose();
    };

    return (
        <aside className={`sidebar ${isOpen ? 'show' : ''}`}>
            <div className="mobile-sidebar-header">
                <Link to="/" className="logo">
                    <div className='w-12' style={{ color: 'var(--accent)' }}>
                        <img src="/logo.png" alt="Logo" className='rounded' />
                    </div>
                    <span className="logo-text">Startup Hub</span>
                </Link>
                <button className="sidebar-close" onClick={onClose} aria-label="Close menu">
                    <X size={24} />
                </button>
            </div>

            {user && (
                <NavLink to={activeCategory ? `/create-post?category=${activeCategory}` : '/create-post'} className="btn btn-primary create-btn" id="create-post-nav" onClick={onClose}>
                    <Plus size={18} /> Create
                </NavLink>
            )}

            <nav className="sidebar-nav">
                <NavLink to="/feed" end className="sidebar-link" id="nav-feed" onClick={onClose}>
                    <span className="sidebar-icon"><Newspaper size={18} /></span>
                    <span className="sidebar-label">Feed</span>
                </NavLink>
                <NavLink to="/discovery" className="sidebar-link" id="nav-discovery" onClick={onClose}>
                    <span className="sidebar-icon"><Search size={18} /></span>
                    <span className="sidebar-label">Discover</span>
                </NavLink>
                <NavLink to="/members" className="sidebar-link" id="nav-members" onClick={onClose}>
                    <span className="sidebar-icon"><Users size={18} /></span>
                    <span className="sidebar-label">Members</span>
                </NavLink>
            </nav>

            <div className="sidebar-section">
                <h3 className="sidebar-heading">Categories</h3>
                <div className="sidebar-categories">
                    <button
                        className={`sidebar-cat-chip ${!activeCategory ? 'active' : ''}`}
                        onClick={() => handleCategoryClick('all')}
                    >
                        <Globe size={14} />
                        <span>All</span>
                    </button>
                    {(Object.entries(CATEGORY_CONFIG) as [PostCategory, typeof CATEGORY_CONFIG[PostCategory]][])
                        .map(
                            ([key, cat]) => {
                                const Icon = cat.icon;
                                return (
                                    <button
                                        key={key}
                                        className={`sidebar-cat-chip ${activeCategory === key ? 'active' : ''}`}
                                        onClick={() => handleCategoryClick(key)}
                                        style={{ '--chip-color': cat.color } as any}
                                    >
                                        <Icon size={14} />
                                        <span>{cat.label}</span>
                                    </button>
                                );
                            }
                        )}
                </div>
            </div>

            <div className="sidebar-section">
                <h3 className="sidebar-heading">Community</h3>
                <NavLink to="/chatrooms" className="sidebar-link" id="nav-chatrooms" onClick={onClose}>
                    <span className="sidebar-icon"><MessageCircle size={18} /></span>
                    <span className="sidebar-label">Chat Rooms</span>
                </NavLink>
                <NavLink to="/pitch-requests" className="sidebar-link" id="nav-pitch" onClick={onClose}>
                    <span className="sidebar-icon"><Lightbulb size={18} /></span>
                    <span className="sidebar-label">Pitch Requests</span>
                </NavLink>
                {user && (
                    <NavLink to="/bookmarks" className="sidebar-link" id="nav-bookmarks" onClick={onClose}>
                        <span className="sidebar-icon"><Bookmark size={18} /></span>
                        <span className="sidebar-label">Bookmarks</span>
                    </NavLink>
                )}
            </div>

            {user?.role === 'admin' && (
                <div className="sidebar-section">
                    <h3 className="sidebar-heading">Admin</h3>
                    <NavLink to="/admin" className="sidebar-link admin-link" id="nav-admin" onClick={onClose}>
                        <span className="sidebar-icon"><Settings size={18} /></span>
                        <span className="sidebar-label">Admin Panel</span>
                    </NavLink>
                </div>
            )}
        </aside>
    );
}
