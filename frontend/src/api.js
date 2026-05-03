const BASE = ''; // Requests go through Vite proxy → http://127.0.0.1:8000

export async function apiFetch(path, opts = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...opts,
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.json();
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      console.warn(`API timeout (${timeoutMs}ms)`, path);
    } else {
      console.warn('API error', path, e.message);
    }
    return null;
  }
}
