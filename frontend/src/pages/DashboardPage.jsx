import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { workspaceApi } from '../services/api';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const wsResponse = await workspaceApi.getAll();
        setWorkspaces(wsResponse.data.workspaces);

        // Fetch stats for each workspace
        const statsPromises = wsResponse.data.workspaces.map(async (ws) => {
          try {
            const statsResponse = await workspaceApi.getStats(ws.id);
            return { id: ws.id, ...statsResponse.data.stats };
          } catch {
            return { id: ws.id, documents: 0, documentsProcessed: 0, chatMessages: 0, tasks: 0, toolCalls: 0 };
          }
        });
        
        const statsResults = await Promise.all(statsPromises);
        const statsMap = {};
        statsResults.forEach(s => { statsMap[s.id] = s; });
        setStats(statsMap);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleCreateWorkspace = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      const response = await workspaceApi.create({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      });
      setWorkspaces([response.data.workspace, ...workspaces]);
      setShowCreateModal(false);
      setNewName('');
      setNewDescription('');
      navigate(`/workspace/${response.data.workspace.id}`);
    } catch (err) {
      console.error('Failed to create workspace:', err);
    }
  };

  const totalStats = {
    workspaces: workspaces.length,
    documents: Object.values(stats).reduce((sum, s) => sum + s.documents, 0),
    documentsProcessed: Object.values(stats).reduce((sum, s) => sum + (s.documentsProcessed || 0), 0),
    chatMessages: Object.values(stats).reduce((sum, s) => sum + s.chatMessages, 0),
    tasks: Object.values(stats).reduce((sum, s) => sum + s.tasks, 0),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome{user?.fullName ? `, ${user.fullName}` : ''}!
        </h1>
        <p className="text-gray-600 mt-1">Manage your workspaces and documents</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalStats.workspaces}</p>
              <p className="text-sm text-gray-600">Workspaces</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalStats.documents}</p>
              <p className="text-sm text-gray-600">Documents ({totalStats.documentsProcessed} processed)</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalStats.chatMessages}</p>
              <p className="text-sm text-gray-600">Chat Messages</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-100 rounded-lg">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalStats.tasks}</p>
              <p className="text-sm text-gray-600">Tasks</p>
            </div>
          </div>
        </div>
      </div>

      {/* Workspaces Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Your Workspaces</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary text-sm"
          >
            + New Workspace
          </button>
        </div>

        {workspaces.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No workspaces yet</h3>
            <p className="text-gray-500 mb-4">Create your first workspace to get started</p>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary">
              Create Workspace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map((ws) => {
              const wsStats = stats[ws.id] || {};
              return (
                <button
                  key={ws.id}
                  onClick={() => navigate(`/workspace/${ws.id}`)}
                  className="text-left p-4 rounded-lg border border-gray-200 hover:border-primary-300 hover:shadow-md transition-all bg-white"
                >
                  <h3 className="font-semibold text-gray-900">{ws.name}</h3>
                  {ws.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{ws.description}</p>
                  )}
                  <div className="flex gap-4 mt-3 text-xs text-gray-500">
                    <span>{wsStats.documents || 0} docs</span>
                    <span>{wsStats.chatMessages || 0} chats</span>
                    <span>{wsStats.tasks || 0} tasks</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Workspace Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Workspace</h2>
            <form onSubmit={handleCreateWorkspace}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="input-field"
                    placeholder="My Project"
                    required
                    maxLength={255}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="input-field"
                    placeholder="What is this workspace for?"
                    rows={3}
                    maxLength={1000}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={!newName.trim()}>
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}