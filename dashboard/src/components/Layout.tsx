import React from 'react';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="layout">
      <aside className="sidebar glass-panel">
        <div className="sidebar-header">
          <div className="logo-icon"></div>
          <h2>Bareksa GeoAI</h2>
        </div>
        <nav className="sidebar-nav">
          <a href="/" className="nav-item active">Dashboard</a>
          <a href="/new-order" className="nav-item">New Order</a>
          <a href="/scouting" className="nav-item text-muted">Area Scouting (Soon)</a>
        </nav>
      </aside>
      <main className="main-content">
        <header className="topbar glass-panel">
          <h3>Location Decision Intelligence</h3>
          <div className="user-profile"></div>
        </header>
        <div className="content-container container">
          {children}
        </div>
      </main>
    </div>
  );
};
