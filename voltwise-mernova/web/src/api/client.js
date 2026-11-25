/**
 * Thin fetch wrapper around the Voltwise API.
 * In dev, Vite proxies /api to the Express server (see vite.config.js).
 */
const BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, { method = 'GET', body, headers = {}, raw = false, blob = false, timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      signal: ctrl.signal,
      headers: { ...(raw ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
  } catch (err) {
    const e = new Error(err.name === 'AbortError' ? 'The server took too long to respond' : 'Cannot reach the API server');
    e.offline = true;
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return null;
  if (blob && res.ok) return { blob: await res.blob(), filename: filenameFrom(res) };

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }

  if (!res.ok) {
    const error = new Error(data?.error || `Request failed (${res.status})`);
    error.status = res.status;
    error.details = data?.details;
    throw error;
  }
  return data;
}

function filenameFrom(res) {
  const cd = res.headers.get('content-disposition') || '';
  return /filename="([^"]+)"/.exec(cd)?.[1] || 'voltwise-export';
}

/** Strip client-only fields (uid) before sending loads. */
export const cleanLoads = (loads) => loads.map(({ uid, ...rest }) => rest);

export const api = {
  health: () => request('/health', { timeoutMs: 4000 }),
  reference: () => request('/reference'),

  listProjects: ({ q = '', status = '' } = {}) =>
    request(`/projects?limit=200${q ? `&q=${encodeURIComponent(q)}` : ''}${status ? `&status=${status}` : ''}`),
  getProject: (id) => request(`/projects/${id}`),
  createProject: (project) => request('/projects', { method: 'POST', body: project }),
  updateProject: (id, patch) => request(`/projects/${id}`, { method: 'PUT', body: patch }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  duplicateProject: (id) => request(`/projects/${id}/duplicate`, { method: 'POST' }),
  revisions: (id) => request(`/projects/${id}/revisions`),
  restoreRevision: (id, rev) => request(`/projects/${id}/revisions/${rev}/restore`, { method: 'POST' }),

  exportFile: (kind, payload) => request(`/export/${kind}`, { method: 'POST', body: payload, blob: true, timeoutMs: 60000 }),
};

export function saveBlob({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
