import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { NewOrder } from './pages/NewOrder';
import { ProjectDetails } from './pages/ProjectDetails';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './auth/AuthContext';

/** Nothing behind this renders until we know who the caller is. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <span className="spinner"></span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

/** Only clients place orders; the owner reviews and approves them. */
function ClientOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role === 'OWNER') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, googleClientId } = useAuth();

  const routes = (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route
                  path="/new-order"
                  element={
                    <ClientOnly>
                      <NewOrder />
                    </ClientOnly>
                  }
                />
                <Route path="/projects/:id" element={<ProjectDetails />} />
              </Routes>
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
  );

  // GoogleOAuthProvider needs a client id; when sign-in is disabled locally
  // there is none, and the login screen is never reached anyway.
  return googleClientId ? (
    <GoogleOAuthProvider clientId={googleClientId}>{routes}</GoogleOAuthProvider>
  ) : (
    routes
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
