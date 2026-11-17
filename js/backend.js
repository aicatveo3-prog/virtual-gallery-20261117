/*
 * 플랫폼 백엔드 어댑터.
 * - SupabaseBackend: 실제 서버 (회원, DB, 파일 저장소). js/config.js 에 주소와 키가 있으면 사용.
 * - LocalBackend: 체험 모드. 같은 브라우저 안(IndexedDB)에만 저장되며 다른 사람에게는 보이지 않음.
 * 두 어댑터는 같은 함수 모양을 가지므로 화면 코드는 어느 쪽인지 신경 쓰지 않는다.
 */
(function () {
  'use strict';
  const cfg = window.GALLERY_CONFIG || {};
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const now = () => new Date().toISOString();
  const DEFAULT_PROFILE = { gallery_name: '', wall_color: '#eee7da', floor: 'wood', intro: '' };

  /* ---------------- Local (IndexedDB) ---------------- */
  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('gallery-platform', 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const s of ['users', 'profiles', 'artworks', 'models', 'orders', 'files']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  function LocalBackend() {
    const dbp = openDB();
    const tx = async (store, mode, fn) => { const db = await dbp; return new Promise((res, rej) => { const t = db.transaction(store, mode); const s = t.objectStore(store); const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); };
    const get = (s, id) => tx(s, 'readonly', st => st.get(id));
    const put = (s, v) => tx(s, 'readwrite', st => st.put(v));
    const del = (s, id) => tx(s, 'readwrite', st => st.delete(id));
    const all = (s) => tx(s, 'readonly', st => st.getAll());
    const urlCache = {};
    async function fileUrl(id) { if (!id) return null; if (urlCache[id]) return urlCache[id]; const f = await get('files', id); if (!f) return null; return (urlCache[id] = URL.createObjectURL(f.blob)); }
    async function hash(pw) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('gallery:' + pw)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); }
    let listeners = [];
    const sessionKey = 'gallery-session';
    function readSession() { try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch (e) { return null; } }
    function writeSession(u) { try { u ? localStorage.setItem(sessionKey, JSON.stringify(u)) : localStorage.removeItem(sessionKey); } catch (e) {} listeners.forEach(f => f(u)); }
    async function withUrls(list, key) { return Promise.all(list.map(async a => Object.assign({}, a, { url: await fileUrl(a[key]) }))); }
    return {
      mode: 'local',
      async currentUser() { return readSession(); },
      onAuthChange(f) { listeners.push(f); },
      async signUp(email, password, name) {
        email = email.trim().toLowerCase();
        const users = await all('users');
        if (users.some(u => u.email === email)) throw new Error('이미 가입된 이메일입니다.');
        const u = { id: uid(), email, name: name.trim(), pw: await hash(password), created_at: now() };
        await put('users', u);
        await put('profiles', Object.assign({ id: u.id, display_name: u.name, created_at: now() }, DEFAULT_PROFILE, { gallery_name: u.name + '의 갤러리' }));
        const s = { id: u.id, email, name: u.name }; writeSession(s); return s;
      },
      async signIn(email, password) {
        email = email.trim().toLowerCase();
        const u = (await all('users')).find(x => x.email === email);
        if (!u || u.pw !== await hash(password)) throw new Error('이메일 또는 비밀번호가 맞지 않습니다.');
        const s = { id: u.id, email, name: u.name }; writeSession(s); return s;
      },
      async signOut() { writeSession(null); },
      // 비회원(손님): 가입 없이 바로 쓰는 계정. 같은 브라우저 안에서만 유지된다.
      async guest() {
        const n = Math.floor(1000 + Math.random() * 9000), name = '손님 ' + n;
        const u = { id: uid(), email: 'guest-' + n + '-' + Date.now() + '@guest.local', name, guest: true, created_at: now() };
        await put('users', u);
        await put('profiles', Object.assign({ id: u.id, display_name: name, created_at: now() }, DEFAULT_PROFILE, { gallery_name: name + '의 갤러리' }));
        const s = { id: u.id, email: u.email, name, guest: true }; writeSession(s); return s;
      },
      async listGuests() { return (await all('users')).filter(u => u.guest).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(u => ({ id: u.id, name: u.name })); },
      async switchTo(id) { const u = await get('users', id); if (!u) throw new Error('손님을 찾을 수 없습니다.'); const p = await get('profiles', id); const s = { id: u.id, email: u.email, name: (p && p.display_name) || u.name, guest: !!u.guest }; writeSession(s); return s; },
      async getProfile(id) { return (await get('profiles', id)) || null; },
      async saveProfile(p) { const old = (await get('profiles', p.id)) || {}; const v = Object.assign({}, old, p); await put('profiles', v); return v; },
      async listGalleries() { const ps = await all('profiles'); const arts = await all('artworks'); return ps.map(p => Object.assign({}, p, { artwork_count: arts.filter(a => a.owner === p.id).length })).sort((a, b) => b.artwork_count - a.artwork_count); },
      async listArtworks(owner) { return withUrls((await all('artworks')).filter(a => a.owner === owner).sort((a, b) => a.created_at.localeCompare(b.created_at)), 'image_path'); },
      async addArtwork(owner, file, meta) {
        const fid = uid(); await put('files', { id: fid, blob: file, name: file.name });
        const a = Object.assign({ id: uid(), owner, image_path: fid, created_at: now() }, meta); await put('artworks', a); return a;
      },
      async updateArtwork(id, patch) { const a = await get('artworks', id); Object.assign(a, patch); await put('artworks', a); return a; },
      async deleteArtwork(a) { await del('artworks', a.id); if (a.image_path) await del('files', a.image_path); },
      async listModels(owner) { return withUrls((await all('models')).filter(a => a.owner === owner).sort((a, b) => a.created_at.localeCompare(b.created_at)), 'model_path'); },
      async addModel(owner, file, meta) {
        const fid = uid(); await put('files', { id: fid, blob: file, name: file.name });
        const m = Object.assign({ id: uid(), owner, model_path: fid, created_at: now() }, meta); await put('models', m); return m;
      },
      async deleteModel(m) { await del('models', m.id); if (m.model_path) await del('files', m.model_path); },
      async createOrder(o) { const v = Object.assign({ id: uid(), status: 'requested', created_at: now() }, o); await put('orders', v); return v; },
      async listOrdersForSeller(seller) { return (await all('orders')).filter(o => o.seller === seller).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
      async listOrdersForBuyer(buyer) { return (await all('orders')).filter(o => o.buyer === buyer).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
      async updateOrder(id, status) { const o = await get('orders', id); o.status = status; await put('orders', o); return o; }
    };
  }

  /* ---------------- Supabase ---------------- */
  function SupabaseBackend(sb) {
    const BUCKET = 'media';
    const pub = path => path ? sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
    const ok = r => { if (r.error) throw new Error(r.error.message); return r.data; };
    let current = null;
    const listeners = [];
    sb.auth.onAuthStateChange((_e, session) => { current = session ? toUser(session.user) : null; listeners.forEach(f => f(current)); });
    function toUser(u) { return { id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.name) || u.email.split('@')[0] }; }
    const ext = f => (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    async function upload(owner, file) { const path = `${owner}/${uid()}.${ext(file)}`; ok(await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })); return path; }
    return {
      mode: 'supabase',
      async currentUser() { const { data } = await sb.auth.getSession(); current = data.session ? toUser(data.session.user) : null; return current; },
      onAuthChange(f) { listeners.push(f); },
      async signUp(email, password, name) {
        const d = ok(await sb.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() } } }));
        if (!d.session) throw new Error('가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요.');
        const u = toUser(d.user);
        await sb.from('profiles').upsert(Object.assign({ id: u.id, display_name: u.name }, DEFAULT_PROFILE, { gallery_name: u.name + '의 갤러리' }));
        return u;
      },
      async signIn(email, password) {
        const d = ok(await sb.auth.signInWithPassword({ email: email.trim(), password })); const u = toUser(d.user);
        const p = (await sb.from('profiles').select('id').eq('id', u.id).maybeSingle()).data;
        if (!p) await sb.from('profiles').upsert(Object.assign({ id: u.id, display_name: u.name }, DEFAULT_PROFILE, { gallery_name: u.name + '의 갤러리' }));
        return u;
      },
      async signOut() { await sb.auth.signOut(); },
      async getProfile(id) { return ok(await sb.from('profiles').select('*').eq('id', id).maybeSingle()); },
      async saveProfile(p) { return ok(await sb.from('profiles').upsert(p).select().single()); },
      async listGalleries() {
        const ps = ok(await sb.from('profiles').select('*, artworks(count)').order('created_at', { ascending: false }).limit(100));
        return ps.map(p => Object.assign({}, p, { artwork_count: (p.artworks && p.artworks[0] && p.artworks[0].count) || 0 })).sort((a, b) => b.artwork_count - a.artwork_count);
      },
      async listArtworks(owner) { return ok(await sb.from('artworks').select('*').eq('owner', owner).order('created_at')).map(a => Object.assign(a, { url: pub(a.image_path) })); },
      async addArtwork(owner, file, meta) { const image_path = await upload(owner, file); return ok(await sb.from('artworks').insert(Object.assign({ owner, image_path }, meta)).select().single()); },
      async updateArtwork(id, patch) { return ok(await sb.from('artworks').update(patch).eq('id', id).select().single()); },
      async deleteArtwork(a) { ok(await sb.from('artworks').delete().eq('id', a.id)); if (a.image_path) await sb.storage.from(BUCKET).remove([a.image_path]); },
      async listModels(owner) { return ok(await sb.from('models').select('*').eq('owner', owner).order('created_at')).map(m => Object.assign(m, { url: pub(m.model_path) })); },
      async addModel(owner, file, meta) { const model_path = await upload(owner, file); return ok(await sb.from('models').insert(Object.assign({ owner, model_path }, meta)).select().single()); },
      async deleteModel(m) { ok(await sb.from('models').delete().eq('id', m.id)); if (m.model_path) await sb.storage.from(BUCKET).remove([m.model_path]); },
      async createOrder(o) { return ok(await sb.from('orders').insert(o).select().single()); },
      async listOrdersForSeller(seller) { return ok(await sb.from('orders').select('*').eq('seller', seller).order('created_at', { ascending: false })); },
      async listOrdersForBuyer(buyer) { return ok(await sb.from('orders').select('*').eq('buyer', buyer).order('created_at', { ascending: false })); },
      async updateOrder(id, status) { return ok(await sb.from('orders').update({ status }).eq('id', id).select().single()); }
    };
  }

  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('script load failed: ' + src)); document.head.appendChild(s); }); }

  window.GalleryBackend = (async () => {
    if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js');
        const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        return SupabaseBackend(sb);
      } catch (e) { console.warn('Supabase unavailable, falling back to local demo mode', e); }
    }
    return LocalBackend();
  })();
})();
