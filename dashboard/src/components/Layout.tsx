import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Layout.css';
import { useAuth } from '../auth/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, signOut, authDisabled } = useAuth();
  const { pathname } = useLocation();
  const isOwner = user?.role === 'OWNER';

  return (
    <div className="layout">
      <aside className="sidebar glass-panel">
        <div className="sidebar-header">
          <div className="logo-icon"></div>
          <h2>Bareksa GeoAI</h2>
        </div>
        <nav className="sidebar-nav">
          <Link to="/" className={`nav-item ${pathname === '/' ? 'active' : ''}`}>
            {isOwner ? 'All Orders' : 'My Orders'}
          </Link>
          {/* The owner reviews and approves; clients place the orders. */}
          {!isOwner && (
            <Link
              to="/new-order"
              className={`nav-item ${pathname === '/new-order' ? 'active' : ''}`}
            >
              New Order
            </Link>
          )}
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar glass-panel">
          <h3>Location Decision Intelligence</h3>

          <div className="flex items-center gap-4">
            {authDisabled && (
              <span className="text-xs" style={{ color: 'var(--warning)' }}>
                Sign-in disabled (local)
              </span>
            )}

            {user && (
              <>
                <div style={{ textAlign: 'right' }}>
                  <div className="text-sm">{user.name ?? user.email}</div>
                  <div className="text-xs text-muted">
                    {isOwner ? 'Owner' : 'Client'}
                  </div>
                </div>
                {!authDisabled && (
                  <button
                    className="text-sm cursor-pointer"
                    onClick={signOut}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}
                  >
                    Sign out
                  </button>
                )}
              </>
            )}
          </div>
        </header>

        <div className="content-container container">{children}</div>
      </main>
    </div>
  );
};
