import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token from Supabase session
api.interceptors.request.use(
  async (config) => {
    try {
      const { data: { session } } = await import('./supabase').then(m => m.supabase.auth.getSession());
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch (e) {
      console.warn('Failed to get auth token:', e.message);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling - REMOVED the window redirect
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      
      // Just log the error, don't redirect - that causes redirect loops
      if (status === 401) {
        console.warn('API returned 401 - token may be expired');
      }

      return Promise.reject({
        status,
        message: data.error || 'An error occurred',
        details: data.details || null,
      });
    }

    if (error.request) {
      return Promise.reject({
        status: 0,
        message: 'Network error. Please check your connection.',
        details: null,
      });
    }

    return Promise.reject({
      status: 0,
      message: error.message || 'An unexpected error occurred',
      details: null,
    });
  }
);

// =============================================
// Auth API
// =============================================
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
};

// =============================================
// Workspace API
// =============================================
export const workspaceApi = {
  getAll: () => api.get('/workspaces'),
  getById: (id) => api.get(`/workspaces/${id}`),
  create: (data) => api.post('/workspaces', data),
  update: (id, data) => api.put(`/workspaces/${id}`, data),
  delete: (id) => api.delete(`/workspaces/${id}`),
  getStats: (id) => api.get(`/workspaces/${id}/stats`),
};

// =============================================
// Document API
// =============================================
export const documentApi = {
  upload: (formData) =>
    api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getAll: (workspaceId) => api.get(`/documents?workspaceId=${workspaceId}`),
  getById: (id) => api.get(`/documents/${id}`),
  getStatus: (id) => api.get(`/documents/${id}/status`),
  delete: (id) => api.delete(`/documents/${id}`),
};

// =============================================
// Chat API
// =============================================
export const chatApi = {
  sendMessage: (data) => api.post('/chat/message', data),
  getHistory: (workspaceId, params = {}) =>
    api.get(`/chat/history?workspaceId=${workspaceId}`, { params }),
  getCitations: (messageId) => api.get(`/chat/messages/${messageId}/citations`),
};

// =============================================
// Task API
// =============================================
export const taskApi = {
  getAll: (workspaceId, params = {}) =>
    api.get(`/tasks?workspaceId=${workspaceId}`, { params }),
  create: (data) => api.post('/tasks', data),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  delete: (id, workspaceId) => api.delete(`/tasks/${id}?workspaceId=${workspaceId}`),
};

// =============================================
// Tool API
// =============================================
export const toolApi = {
  getDefinitions: () => api.get('/tools/definitions'),
  getHistory: (workspaceId) => api.get(`/tools/history?workspaceId=${workspaceId}`),
  getDetail: (id) => api.get(`/tools/history/${id}`),
};

export default api;