// Thin wrapper around fetch for the sessions API.
// All components go through here, so error handling and headers live in one place.

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    signal, // lets callers cancel stale requests (see useDashboard)
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let payload = {};
    try { payload = await res.json(); } catch { /* non-JSON error */ }
    throw new ApiError(res.status, payload.error || `Request failed (${res.status})`, payload.details);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  listSessions: ({ status, limit = 20, offset = 0 } = {}, signal) => {
    const qs = new URLSearchParams({ limit, offset });
    if (status) qs.set('status', status);
    return request(`/sessions?${qs}`, { signal });
  },
  getSession: (id, signal) => request(`/sessions/${encodeURIComponent(id)}`, { signal }),
  createSession: (data) => request('/sessions', { method: 'POST', body: data }),
  updateSession: (id, patch) => request(`/sessions/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),
};
