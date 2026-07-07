import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { workspaceApi, documentApi, chatApi, taskApi, toolApi } from '../services/api';

export default function WorkspacePage() {
  const { workspaceId } = useParams();
  const [workspace, setWorkspace] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWorkspace = async () => {
      try {
        const response = await workspaceApi.getById(workspaceId);
        setWorkspace(response.data.workspace);
      } catch (err) {
        console.error('Failed to fetch workspace:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchWorkspace();
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Workspace not found</h2>
        <p className="text-gray-500 mt-2">This workspace may have been deleted.</p>
      </div>
    );
  }

  const tabs = [
    { id: 'chat', label: 'Chat', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
    { id: 'documents', label: 'Documents', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'tasks', label: 'Tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    { id: 'tools', label: 'Tool History', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{workspace.name}</h1>
          {workspace.description && (
            <p className="text-gray-600 mt-1">{workspace.description}</p>
          )}
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {activeTab === 'chat' && <ChatPanel workspaceId={workspaceId} />}
        {activeTab === 'documents' && <DocumentsPanel workspaceId={workspaceId} />}
        {activeTab === 'tasks' && <TasksPanel workspaceId={workspaceId} />}
        {activeTab === 'tools' && <ToolHistoryPanel workspaceId={workspaceId} />}
      </div>
    </div>
  );
}

// =============================================
// Retrieval Debug Panel (collapsible)
// Shows all retrieved chunks, similarity scores, and which were cited
// =============================================
function RetrievalDebugPanel({ debug }) {
  const [expanded, setExpanded] = useState(false);
  if (!debug || !debug.retrievedChunks || debug.retrievedChunks.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
      >
        <span>{expanded ? '▼' : '▶'}</span>
        <span>Show retrieval details ({debug.retrievedChunks.length} chunks)</span>
      </button>
      {expanded && (
        <div className="mt-1 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600">Workspace: {debug.workspaceId}</p>
          {debug.retrievedChunks.map((chunk, i) => {
            const isCited = debug.citedIndices && debug.citedIndices.includes(chunk.document_name);
            return (
              <div key={i} className={`p-1 rounded ${isCited ? 'bg-green-50 border border-green-200' : ''}`}>
                <span className="font-medium">{chunk.document_name}</span>
                <span className="ml-2">similarity: {(chunk.similarity * 100).toFixed(1)}%</span>
                {isCited && <span className="ml-1 text-green-600">✓ cited</span>}
                {!isCited && <span className="ml-1 text-gray-400">(not cited)</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================
// Chat Panel Component
// =============================================
function ChatPanel({ workspaceId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await chatApi.getHistory(workspaceId, { limit: 50 });
        setMessages(response.data.messages);
      } catch (err) {
        console.error('Failed to fetch chat history:', err);
      }
    };
    fetchHistory();
  }, [workspaceId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const userMessage = input.trim();
    setInput('');
    setSending(true);

    const tempUserMsg = { id: 'temp-' + Date.now(), role: 'user', content: userMessage };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const response = await chatApi.sendMessage({ workspaceId, message: userMessage });
      const assistantMsg = response.data.assistantMessage;

      // Attach retrieval debug info
      assistantMsg._retrievalDebug = {
        workspaceId,
        retrievedChunks: response.data.retrievedChunks || [],
        citedIndices: (assistantMsg.citations || []).map(c => c.document_name),
      };

      setMessages(prev => [
        ...prev.filter(m => m.id !== tempUserMsg.id),
        response.data.userMessage,
        assistantMsg,
      ]);
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempUserMsg.id),
        { id: 'error-' + Date.now(), role: 'assistant', content: '❌ Failed to get response. Please try again.' },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card p-0 overflow-hidden">
      <div className="h-[500px] overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <p>Ask a question about your documents</p>
            <p className="text-sm text-gray-400 mt-2">💡 Try: <em>"Save a task to review merit for scholarship"</em></p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-900'
            }`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <p className="text-xs font-medium text-gray-500 mb-1">Sources:</p>
                  {msg.citations.map((cite, i) => (
                    <p key={i} className="text-xs text-gray-400">
                      📄 {cite.document_name}
                    </p>
                  ))}
                </div>
              )}
              {/* Observability stats line */}
              {msg.role === 'assistant' && msg.latency_ms !== undefined && (
                <div className="mt-1 text-xs text-gray-400">
                  {msg.latency_ms}ms
                  {msg.prompt_tokens !== undefined && msg.prompt_tokens !== null && ` · ${msg.prompt_tokens.toLocaleString()} tokens`}
                  {msg.retrieval_hit && ' · retrieval hit'}
                  {msg.retrieval_hit === false && msg.retrieval_hit !== undefined && ' · retrieval miss'}
                </div>
              )}
              {msg._retrievalDebug && <RetrievalDebugPanel debug={msg._retrievalDebug} />}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-200 p-4">
        <form onSubmit={handleSend} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="input-field flex-1"
            placeholder="Ask a question about your documents..."
            disabled={sending}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={!input.trim() || sending}
          >
            {sending ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sending...
              </span>
            ) : (
              'Send'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// =============================================
// Documents Panel Component
// =============================================
function DocumentsPanel({ workspaceId }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchDocuments = async () => {
    try {
      const response = await documentApi.getAll(workspaceId);
      setDocuments(response.data.documents);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    const interval = setInterval(fetchDocuments, 5000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
      'text/plain',
      'text/tab-separated-values',
    ];
    const allowedExts = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.tsv'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
      alert('Supported formats: PDF, DOCX, XLSX, CSV, TXT');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('workspaceId', workspaceId);
      await documentApi.upload(formData);
      await fetchDocuments();
    } catch (err) {
      console.error('Upload failed:', err);
      alert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId) => {
    if (!confirm('Delete this document and all its chunks?')) return;
    try {
      await documentApi.delete(docId);
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'processed': return <span className="badge-success">Processed</span>;
      case 'processing': return <span className="badge-warning">Processing</span>;
      case 'failed': return <span className="badge-error">Failed</span>;
      case 'duplicate': return <span className="badge-info">Duplicate</span>;
      default: return <span className="badge-info">Pending</span>;
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading documents...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Documents ({documents.length})</h2>
        <label className="btn-primary cursor-pointer text-sm">
          {uploading ? 'Uploading...' : '+ Upload Document'}
          <input
            type="file"
            accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.tsv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain,text/tab-separated-values"
            onChange={handleUpload}
            className="hidden"
            disabled={uploading}
          />
        </label>
      </div>

      {documents.length === 0 ? (
        <div className="card text-center py-8">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-500">No documents uploaded yet</p>
          <p className="text-sm text-gray-400 mt-1">Upload PDF, DOCX, XLSX, CSV, or TXT to start asking questions</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="card flex items-center justify-between py-3 px-4">
              <div className="flex items-center gap-3 min-w-0">
                <svg className="w-8 h-8 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <path d="M14 2v6h6" fill="none" stroke="currentColor" strokeWidth="2"/>
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.original_filename}</p>
                  <p className="text-xs text-gray-500">
                    {(doc.file_size / 1024).toFixed(1)} KB
                    {doc.page_count ? ` · ${doc.page_count} pages` : ''}
                    {doc.chunk_count ? ` · ${doc.chunk_count} chunks` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {getStatusBadge(doc.status)}
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                  title="Delete document"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================
// Tasks Panel Component
// =============================================
function TasksPanel({ workspaceId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatResponse, setChatResponse] = useState(null);

  const fetchTasks = async () => {
    try {
      const response = await taskApi.getAll(workspaceId);
      setTasks(response.data.tasks);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTasks(); }, [workspaceId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await taskApi.create({ workspaceId, title: newTitle.trim(), description: newDescription.trim() || undefined });
      setNewTitle('');
      setNewDescription('');
      await fetchTasks();
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  const handleStatusUpdate = async (taskId, status) => {
    try {
      await taskApi.update(taskId, { workspaceId, status });
      await fetchTasks();
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const handleChatSend = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || sending) return;
    const msg = chatInput.trim();
    setSending(true);
    setChatResponse({ role: 'user', content: msg });
    setChatInput('');
    try {
      const response = await chatApi.sendMessage({ workspaceId, message: msg });
      const assistantMsg = response.data.assistantMessage;
      setChatResponse({ role: 'assistant', content: assistantMsg.content, citations: assistantMsg.citations });
    } catch (err) {
      console.error('Failed to send message:', err);
      setChatResponse({ role: 'assistant', content: '❌ Failed to send message: ' + (err.message || 'Unknown error') });
    } finally {
      setSending(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50';
      case 'in_progress': return 'text-blue-600 bg-blue-50';
      case 'cancelled': return 'text-gray-600 bg-gray-50';
      default: return 'text-yellow-600 bg-yellow-50';
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading tasks...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Tasks ({tasks.length})</h2>

      <form onSubmit={handleCreate} className="card space-y-3">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="input-field"
          placeholder="Task title..."
          maxLength={500}
        />
        <textarea
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          className="input-field"
          placeholder="Description (optional)"
          rows={2}
          maxLength={5000}
        />
        <button type="submit" className="btn-primary text-sm" disabled={!newTitle.trim()}>
          Add Task
        </button>
      </form>

      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="card text-center py-8 text-gray-500">
            <p>No tasks yet. Create one above or ask the AI to save a task.</p>
          </div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="card flex items-start justify-between py-3 px-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {task.title}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(task.status)}`}>
                    {task.status.replace('_', ' ')}
                  </span>
                </div>
                {task.description && (
                  <p className="text-sm text-gray-500 mt-1">{task.description}</p>
                )}
                {task.created_by_tool && (
                  <p className="text-xs text-gray-400 mt-1">Created via AI tool: {task.created_by_tool}</p>
                )}
              </div>
              <div className="flex gap-1 ml-3">
                {task.status !== 'completed' && (
                  <button onClick={() => handleStatusUpdate(task.id, 'completed')} className="p-1 text-green-500 hover:bg-green-50 rounded" title="Complete">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                )}
                {task.status !== 'cancelled' && task.status !== 'completed' && (
                  <button onClick={() => handleStatusUpdate(task.id, 'cancelled')} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="Cancel">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-gray-200 pt-4">
        <p className="text-sm font-medium text-gray-700 mb-2">💬 Send a message to the AI</p>
        <form onSubmit={handleChatSend} className="flex gap-3">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className="input-field flex-1"
            placeholder="Ask about your documents or save a task..."
            disabled={sending}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={!chatInput.trim() || sending}
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </form>
        {chatResponse && (
          <div className={`mt-3 rounded-2xl px-4 py-3 ${
            chatResponse.role === 'user'
              ? 'bg-primary-100 text-primary-900 ml-8'
              : 'bg-gray-100 text-gray-900'
          }`}>
            <p className="text-sm whitespace-pre-wrap">{chatResponse.content}</p>
            {chatResponse.citations && chatResponse.citations.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-xs font-medium text-gray-500 mb-1">Sources:</p>
                {chatResponse.citations.map((cite, i) => (
                  <p key={i} className="text-xs text-gray-400">📄 {cite.document_name}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================
// Tool History Panel Component
// =============================================
function ToolHistoryPanel({ workspaceId }) {
  const [toolCalls, setToolCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await toolApi.getHistory(workspaceId);
        setToolCalls(response.data.toolCalls);
      } catch (err) {
        console.error('Failed to fetch tool history:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [workspaceId]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'success': return <span className="badge-success">Success</span>;
      case 'failed': return <span className="badge-error">Failed</span>;
      case 'rejected': return <span className="badge-warning">Rejected</span>;
      case 'blocked_suspicious': return <span className="badge-warning">Blocked</span>;
      default: return <span className="badge-info">Pending</span>;
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading tool history...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Tool Call History ({toolCalls.length})</h2>

      {toolCalls.length === 0 ? (
        <div className="card text-center py-8 text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p>No tool calls yet</p>
          <p className="text-sm text-gray-400 mt-1">Ask the AI to save a task or send a summary</p>
        </div>
      ) : (
        <div className="space-y-2">
          {toolCalls.map((tc) => (
            <div key={tc.id} className="card py-3 px-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{tc.tool_name}</span>
                  {getStatusBadge(tc.status)}
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(tc.created_at).toLocaleString()}
                  {tc.execution_time_ms ? ` · ${tc.execution_time_ms}ms` : ''}
                </span>
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <p><span className="font-medium">Arguments:</span> {JSON.stringify(tc.arguments)}</p>
                {tc.result && <p><span className="font-medium">Result:</span> {JSON.stringify(tc.result)}</p>}
                {tc.error_message && <p className="text-red-500"><span className="font-medium">Error:</span> {tc.error_message}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}