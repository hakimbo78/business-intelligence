import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../auth/api';

interface Project {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

export const Home: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  useEffect(() => {
    // Never substitute placeholder projects when the API is unreachable:
    // showing invented records as if they were real violates
    // DEVELOPMENT_RULES.md §9. Surface the failure instead.
    const fetchProjects = async () => {
      try {
        setProjects(await api<Project[]>('/api/projects'));
        setError(null);
      } catch (e) {
        setProjects([]);
        setError(e instanceof Error ? e.message : 'Could not load projects.');
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'APPROVED': return 'var(--success)';
      case 'REVIEW': return 'var(--warning)';
      case 'DRAFT': return 'var(--text-muted)';
      default: return 'var(--primary)';
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1>{isOwner ? 'All Orders' : 'My Orders'}</h1>
          <p className="text-muted mt-2">
            {isOwner
              ? 'Every client order. Reports awaiting review are marked REVIEW.'
              : 'Your location intelligence analyses.'}
          </p>
        </div>
        {!isOwner && <Button onClick={() => navigate('/new-order')}>+ New Analysis</Button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><span className="spinner"></span></div>
      ) : error ? (
        <Card title="Could not load projects">
          <p className="text-muted">{error}</p>
          <p className="text-muted mt-2">
            Check that the API server is running, then reload this page.
          </p>
        </Card>
      ) : projects.length === 0 ? (
        <Card title={isOwner ? 'No client orders yet' : 'No projects yet'}>
          <p className="text-muted">
            {isOwner
              ? 'Orders placed by clients will appear here for review.'
              : 'Start your first location analysis with “+ New Analysis”.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {projects.map(p => (
            <Card key={p.id} className="hover-glow" title={p.name}>
              <div className="mt-4 mb-6">
                <span 
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    color: getStatusColor(p.status)
                  }}
                >
                  {p.status}
                </span>
                <p className="text-xs text-muted mt-4">
                  Created {new Date(p.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button 
                variant="secondary" 
                className="w-full"
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                View Details
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
