/**
 * API client que substitui o Supabase SDK.
 * Mantém a mesma interface para compatibilidade com todos os componentes.
 * Aponta para o backend Express em /api (proxied pelo Vite em dev).
 */

const API_BASE = import.meta.env.VITE_API_URL || '';
const DEVICE_ID_KEY = 'meubusapp_device_id';
const ADMIN_TOKEN_KEY = 'admin_token';

const getDeviceId = () => localStorage.getItem(DEVICE_ID_KEY) || '';
const getAdminToken = () => localStorage.getItem(ADMIN_TOKEN_KEY) || null;

async function apiFetch(path, opts = {}) {
  const token = getAdminToken();
  const headers = {
    'Content-Type': 'application/json',
    'x-device-id': getDeviceId(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...opts.headers,
  };
  const res = await fetch(`${API_BASE}/api${path}`, { ...opts, headers });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { error: text }; }
  if (!res.ok) {
    const err = new Error(body?.error || `Erro HTTP ${res.status}`);
    err.code = body?.code;
    throw err;
  }
  return body;
}

// ── Query Builder ────────────────────────────────────────────────────────────

class QueryBuilder {
  constructor(table) {
    this._table = table;
    this._op = 'select';
    this._selectCols = '*';
    this._filters = [];
    this._orExpr = null;
    this._orderBy = null;
    this._limitN = null;
    this._data = null;
    this._single = false;
    this._maybeSingle = false;
    this._count = null;
    this._head = false;
    this._promise = null;
  }

  select(cols = '*', opts = {}) {
    // Called after insert/update/delete → just signals "return data" (backend always does RETURNING *)
    if (this._op === 'select') this._selectCols = cols;
    if (opts.count) this._count = opts.count;
    if (opts.head) this._head = opts.head;
    return this;
  }

  insert(data) { this._op = 'insert'; this._data = data; return this; }
  update(data) { this._op = 'update'; this._data = data; return this; }
  delete() { this._op = 'delete'; return this; }
  upsert(data) { this._op = 'upsert'; this._data = data; return this; }

  eq(col, val) { this._filters.push({ op: 'eq', col, val }); return this; }
  is(col, val) { this._filters.push({ op: 'is', col, val }); return this; }
  lt(col, val) { this._filters.push({ op: 'lt', col, val }); return this; }
  lte(col, val) { this._filters.push({ op: 'lte', col, val }); return this; }
  gte(col, val) { this._filters.push({ op: 'gte', col, val }); return this; }
  or(expr) { this._orExpr = expr; return this; }

  order(col, opts = {}) {
    this._orderBy = { col, ascending: opts.ascending !== false };
    return this;
  }
  limit(n) { this._limitN = n; return this; }

  single() { this._single = true; return this; }
  maybeSingle() { this._maybeSingle = true; return this; }

  // "Thenable" — makes the builder awaitable
  then(onFulfilled, onRejected) {
    if (!this._promise) this._promise = this._execute();
    return this._promise.then(onFulfilled, onRejected);
  }
  catch(onRejected) {
    if (!this._promise) this._promise = this._execute();
    return this._promise.catch(onRejected);
  }

  async _execute() {
    const body = {
      table: this._table,
      operation: this._op,
      select: this._selectCols,
      filters: this._filters,
      orExpr: this._orExpr,
      order: this._orderBy,
      limit: this._limitN,
      data: this._data,
      single: this._single,
      maybeSingle: this._maybeSingle,
      count: this._count,
      head: this._head,
    };
    try {
      const result = await apiFetch('/query', { method: 'POST', body: JSON.stringify(body) });
      return { data: result.data ?? null, count: result.count ?? null, error: result.error ?? null };
    } catch (e) {
      if (this._maybeSingle) return { data: null, count: null, error: null };
      return { data: null, count: null, error: { message: e.message, code: e.code } };
    }
  }
}

// ── Storage ─────────────────────────────────────────────────────────────────

const storageClient = {
  from(bucket) {
    return {
      async upload(path, file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', path);
        formData.append('bucket', bucket);
        const token = getAdminToken();
        const res = await fetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          headers: {
            'x-device-id': getDeviceId(),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Upload falhou' }));
          return { error: new Error(err.error) };
        }
        return { error: null };
      },

      getPublicUrl(path) {
        // path is like "banners/abc.jpg" → serve from /uploads/abc.jpg
        const filename = path.split('/').pop();
        return { data: { publicUrl: `${API_BASE}/uploads/${filename}` } };
      },

      async remove(paths) {
        await apiFetch('/upload/delete', { method: 'POST', body: JSON.stringify({ paths }) }).catch(() => {});
        return { error: null };
      },
    };
  },
};

// ── Auth ─────────────────────────────────────────────────────────────────────

const authClient = {
  async signInWithPassword({ email, password }) {
    try {
      const result = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem(ADMIN_TOKEN_KEY, result.token);
      return { data: { user: result.user }, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  },

  async getSession() {
    try {
      const result = await apiFetch('/auth/session');
      return { data: { session: result.session }, error: null };
    } catch {
      return { data: { session: null }, error: null };
    }
  },

  async signOut() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    return { error: null };
  },
};

// ── RPC ──────────────────────────────────────────────────────────────────────

async function rpc(name, params = {}) {
  try {
    const result = await apiFetch(`/rpc/${name}`, { method: 'POST', body: JSON.stringify(params) });
    return { data: result.data, error: null };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}

// ── Export (mesma interface do Supabase) ──────────────────────────────────────

export const supabase = {
  from(table) { return new QueryBuilder(table); },
  rpc,
  storage: storageClient,
  auth: authClient,
};
