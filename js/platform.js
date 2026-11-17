/*
 * 플랫폼 기능: 회원가입/로그인, 내 갤러리 꾸미기, 작품 이미지 업로드, 3D 모델(GLB) 업로드,
 * 작품 판매 등록과 구매 요청, 작가의 주문 관리.
 * 3D 갤러리 엔진(index.html)이 window.__gallery 로 내보낸 함수들을 사용한다.
 */
(function () {
  'use strict';
  const G = window.__gallery;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = n => (n == null || n === '' || isNaN(n)) ? '가격 미정' : Number(n).toLocaleString('ko-KR') + '원';
  const STATUS = { requested: '요청됨 · 작가 확인 대기', accepted: '작가가 수락함', declined: '작가가 거절함', cancelled: '취소됨' };
  const MAX_ARTS = 9, MAX_MODELS = 4;
  let B = null, user = null, profile = null;

  /* ---------------- DOM ---------------- */
  const html = `
  <div class="veil pf" id="pfAuth" hidden><div class="sheet pfSheet" role="dialog" aria-labelledby="pfAuthTitle">
    <div class="eyebrow" id="pfAuthMode"></div>
    <h2 id="pfAuthTitle">로그인</h2>
    <div class="pfTabs"><button type="button" class="pfTab on" data-auth="in">로그인</button><button type="button" class="pfTab" data-auth="up">회원가입</button></div>
    <form id="pfAuthForm" class="pfForm" novalidate>
      <label id="pfNameRow" hidden>작가 이름 (갤러리에 표시)<input id="pfName" autocomplete="nickname" maxlength="30"></label>
      <label>이메일<input id="pfEmail" type="email" autocomplete="email" required></label>
      <label>비밀번호 (6자 이상)<input id="pfPw" type="password" autocomplete="current-password" minlength="6" required></label>
      <p class="pfErr" id="pfAuthErr" hidden></p>
      <button class="btn primary" id="pfAuthSubmit" type="submit">로그인</button>
    </form>
    <button class="close" type="button" data-close aria-label="닫기">×</button>
  </div></div>

  <div class="veil pf" id="pfStudio" hidden><div class="sheet pfSheet wide" role="dialog" aria-labelledby="pfStudioTitle">
    <div class="eyebrow" id="pfStudioMode"></div>
    <h2 id="pfStudioTitle">내 갤러리 관리</h2>
    <div class="pfTabs" id="pfStudioTabs">
      <button type="button" class="pfTab on" data-tab="room">꾸미기</button>
      <button type="button" class="pfTab" data-tab="arts">작품</button>
      <button type="button" class="pfTab" data-tab="models">3D 모델</button>
      <button type="button" class="pfTab" data-tab="orders">받은 주문</button>
      <button type="button" class="pfTab" data-tab="mine">내 구매 요청</button>
    </div>
    <section data-pane="room" class="pfPane">
      <form id="pfRoomForm" class="pfForm">
        <label>갤러리 이름<input id="pfGName" maxlength="40" required></label>
        <label>소개 (입구 벽에 걸림)<textarea id="pfGIntro" maxlength="160" rows="2"></textarea></label>
        <fieldset><legend>벽 색</legend><div class="swatches" id="pfWall"></div></fieldset>
        <fieldset><legend>바닥</legend><div class="pfChoice" id="pfFloor">
          <label><input type="radio" name="pfFloor" value="wood"> 원목</label>
          <label><input type="radio" name="pfFloor" value="stone"> 밝은 석재</label>
          <label><input type="radio" name="pfFloor" value="dark"> 어두운 마루</label>
        </div></fieldset>
        <div class="actions"><button class="btn primary" type="submit">저장하고 내 갤러리로 가기</button><button class="btn" type="button" id="pfLogout">로그아웃</button></div>
      </form>
    </section>
    <section data-pane="arts" class="pfPane" hidden>
      <form id="pfArtForm" class="pfForm grid2">
        <label class="span2">작품 이미지 (JPG, PNG, WebP · 15MB 이하)<input id="pfArtFile" type="file" accept="image/jpeg,image/png,image/webp" required></label>
        <label>제목<input id="pfArtTitle" maxlength="60" required></label>
        <label>제작 연도<input id="pfArtYear" maxlength="10" inputmode="numeric"></label>
        <label>재료 · 기법<input id="pfArtMedium" maxlength="40" placeholder="예: 캔버스에 유채"></label>
        <label>가격 (원)<input id="pfArtPrice" type="number" min="0" step="1000" inputmode="numeric"></label>
        <label class="span2">작품 설명<textarea id="pfArtDesc" maxlength="600" rows="3"></textarea></label>
        <label class="pfCheck span2"><input id="pfArtSale" type="checkbox"> 판매 중으로 표시하기 (관람객이 구매 요청을 보낼 수 있습니다)</label>
        <p class="pfErr span2" id="pfArtErr" hidden></p>
        <div class="actions span2"><button class="btn primary" type="submit" id="pfArtSubmit">작품 올리기</button><span class="pfNote">갤러리 벽에는 먼저 올린 순서대로 ${MAX_ARTS}점까지 걸립니다.</span></div>
      </form>
      <div class="pfList" id="pfArtList"></div>
    </section>
    <section data-pane="models" class="pfPane" hidden>
      <form id="pfModelForm" class="pfForm grid2">
        <label class="span2">3D 모델 파일 (.glb · 50MB 이하)<input id="pfModelFile" type="file" accept=".glb,model/gltf-binary" required></label>
        <label>이름<input id="pfModelName" maxlength="40" required></label>
        <label>크기 (가장 긴 변, m)<input id="pfModelSize" type="number" min="0.2" max="4" step="0.1" value="1.2"></label>
        <p class="pfErr span2" id="pfModelErr" hidden></p>
        <div class="actions span2"><button class="btn primary" type="submit" id="pfModelSubmit">모델 올리기</button><span class="pfNote">갤러리 바닥 좌대 위에 ${MAX_MODELS}개까지 놓입니다. 블렌더에서 File, Export, glTF 2.0 (.glb)으로 저장하면 됩니다.</span></div>
      </form>
      <div class="pfList" id="pfModelList"></div>
    </section>
    <section data-pane="orders" class="pfPane" hidden><div class="pfList" id="pfOrderList"></div></section>
    <section data-pane="mine" class="pfPane" hidden><div class="pfList" id="pfMineList"></div></section>
    <button class="close" type="button" data-close aria-label="닫기">×</button>
  </div></div>

  <div class="veil pf" id="pfBuy" hidden><div class="sheet pfSheet" role="dialog" aria-labelledby="pfBuyTitle">
    <div class="eyebrow">구매 요청</div>
    <h2 id="pfBuyTitle"></h2>
    <p class="pfLead" id="pfBuyMeta"></p>
    <p class="pfNotice">지금은 결제가 실제로 이루어지지 않습니다. 요청을 보내면 작가에게 전달되고, 작가가 수락하면 남겨 주신 연락처로 결제와 배송 방법을 안내합니다.</p>
    <form id="pfBuyForm" class="pfForm">
      <label>이름<input id="pfBuyName" maxlength="30" autocomplete="name" required></label>
      <label>연락처 (전화번호 또는 이메일)<input id="pfBuyContact" maxlength="60" required></label>
      <label>작가에게 남길 말<textarea id="pfBuyMsg" maxlength="400" rows="3"></textarea></label>
      <p class="pfErr" id="pfBuyErr" hidden></p>
      <button class="btn primary" type="submit">구매 요청 보내기</button>
    </form>
    <button class="close" type="button" data-close aria-label="닫기">×</button>
  </div></div>

  <div class="veil pf" id="pfDir" hidden><div class="sheet pfSheet" role="dialog" aria-labelledby="pfDirTitle">
    <div class="eyebrow" id="pfDirMode"></div>
    <h2 id="pfDirTitle">작가 갤러리</h2>
    <div class="places" id="pfDirList"></div>
    <button class="close" type="button" data-close aria-label="닫기">×</button>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.querySelectorAll('.veil.pf [data-close]').forEach(b => b.addEventListener('click', () => G.closePanels()));

  const accountBtn = document.createElement('button');
  accountBtn.className = 'hbtn'; accountBtn.type = 'button'; accountBtn.id = 'accountBtn'; accountBtn.textContent = '로그인';
  $('hudButtons').insertBefore(accountBtn, $('mapBtn'));
  accountBtn.addEventListener('click', () => { if (!G.isStarted()) return; user ? openStudio('room') : openAuth('in'); });

  const modeText = () => B && B.mode === 'local' ? '체험 모드 · 이 브라우저 안에만 저장됩니다' : '작품 속으로 · 플랫폼';
  function err(id, msg) { const e = $(id); e.textContent = msg || ''; e.hidden = !msg; }
  function busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || '처리 중…'; btn.disabled = true; } else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; } }

  /* ---------------- auth ---------------- */
  let authMode = 'in', afterAuth = null;
  function openAuth(mode, then) {
    afterAuth = then || null; setAuthMode(mode || 'in'); err('pfAuthErr');
    $('pfAuthMode').textContent = modeText(); G.showPanel('pfAuth'); setTimeout(() => $(authMode === 'up' ? 'pfName' : 'pfEmail').focus(), 60);
  }
  function setAuthMode(m) {
    authMode = m; document.querySelectorAll('#pfAuth [data-auth]').forEach(b => b.classList.toggle('on', b.dataset.auth === m));
    $('pfNameRow').hidden = m !== 'up'; $('pfAuthTitle').textContent = m === 'up' ? '회원가입' : '로그인';
    $('pfAuthSubmit').textContent = m === 'up' ? '가입하고 내 갤러리 만들기' : '로그인'; $('pfPw').autocomplete = m === 'up' ? 'new-password' : 'current-password';
  }
  document.querySelectorAll('#pfAuth [data-auth]').forEach(b => b.addEventListener('click', () => { setAuthMode(b.dataset.auth); err('pfAuthErr'); }));
  $('pfAuthForm').addEventListener('submit', async e => {
    e.preventDefault(); err('pfAuthErr');
    const email = $('pfEmail').value.trim(), pw = $('pfPw').value, name = $('pfName').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('pfAuthErr', '이메일 주소를 확인해 주세요.');
    if (pw.length < 6) return err('pfAuthErr', '비밀번호는 6자 이상이어야 합니다.');
    if (authMode === 'up' && !name) return err('pfAuthErr', '갤러리에 표시할 작가 이름을 적어 주세요.');
    const btn = $('pfAuthSubmit'); busy(btn, true);
    try {
      user = authMode === 'up' ? await B.signUp(email, pw, name) : await B.signIn(email, pw);
      profile = await B.getProfile(user.id);
      $('pfPw').value = ''; refreshAccount(); G.closePanels();
      G.toast(authMode === 'up' ? `환영합니다, ${user.name} 님. 내 갤러리가 만들어졌습니다.` : `${user.name} 님, 다시 오셨네요.`);
      if (afterAuth) afterAuth(); else if (authMode === 'up') openStudio('arts');
    } catch (ex) { err('pfAuthErr', ex.message || '잠시 후 다시 시도해 주세요.'); }
    busy(btn, false);
  });
  function refreshAccount() { accountBtn.textContent = user ? '내 갤러리 관리' : '로그인'; }

  /* ---------------- studio ---------------- */
  const WALLS = ['#eee7da', '#f4f2ee', '#dde3e6', '#e7d9d0', '#3c3a37', '#2f3b35', '#5b2e2a'];
  let tab = 'room';
  function openStudio(t) {
    if (!user) return openAuth('in', () => openStudio(t));
    $('pfStudioMode').textContent = modeText(); $('pfStudioTitle').textContent = (profile && profile.gallery_name) || '내 갤러리 관리';
    showTab(t || tab); G.showPanel('pfStudio');
  }
  function showTab(t) {
    tab = t; document.querySelectorAll('#pfStudioTabs .pfTab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    document.querySelectorAll('#pfStudio .pfPane').forEach(p => { p.hidden = p.dataset.pane !== t; });
    ({ room: fillRoom, arts: fillArts, models: fillModels, orders: fillOrders, mine: fillMine })[t]();
  }
  document.querySelectorAll('#pfStudioTabs .pfTab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  function fillRoom() {
    const p = profile || {};
    $('pfGName').value = p.gallery_name || ''; $('pfGIntro').value = p.intro || '';
    const w = $('pfWall'); w.innerHTML = '';
    WALLS.forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch' + ((p.wall_color || WALLS[0]) === c ? ' on' : ''); b.style.background = c; b.setAttribute('aria-label', '벽 색 ' + c); b.dataset.c = c; b.addEventListener('click', () => { w.querySelectorAll('.swatch').forEach(x => x.classList.remove('on')); b.classList.add('on'); }); w.appendChild(b); });
    document.querySelectorAll('input[name=pfFloor]').forEach(r => { r.checked = r.value === (p.floor || 'wood'); });
  }
  $('pfRoomForm').addEventListener('submit', async e => {
    e.preventDefault();
    const sw = document.querySelector('#pfWall .swatch.on'); const fl = document.querySelector('input[name=pfFloor]:checked');
    const btn = e.submitter; busy(btn, true, '저장 중…');
    try {
      profile = await B.saveProfile({ id: user.id, display_name: (profile && profile.display_name) || user.name, gallery_name: $('pfGName').value.trim() || user.name + '의 갤러리', intro: $('pfGIntro').value.trim(), wall_color: sw ? sw.dataset.c : WALLS[0], floor: fl ? fl.value : 'wood' });
      busy(btn, false); enterGallery(user.id);
    } catch (ex) { busy(btn, false); G.toast('저장하지 못했습니다: ' + ex.message); }
  });
  $('pfLogout').addEventListener('click', async () => { await B.signOut(); user = null; profile = null; refreshAccount(); G.closePanels(); G.toast('로그아웃했습니다.'); });

  function imageSize(file) { return new Promise(res => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => { res({ width: i.naturalWidth, height: i.naturalHeight }); URL.revokeObjectURL(u); }; i.onerror = () => { res(null); URL.revokeObjectURL(u); }; i.src = u; }); }
  $('pfArtForm').addEventListener('submit', async e => {
    e.preventDefault(); err('pfArtErr');
    const f = $('pfArtFile').files[0];
    if (!f) return err('pfArtErr', '올릴 이미지 파일을 골라 주세요.');
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return err('pfArtErr', 'JPG, PNG, WebP 이미지만 올릴 수 있습니다.');
    if (f.size > 15 * 1024 * 1024) return err('pfArtErr', '이미지가 15MB보다 큽니다. 크기를 줄여서 다시 올려 주세요.');
    if (!$('pfArtTitle').value.trim()) return err('pfArtErr', '작품 제목을 적어 주세요.');
    const size = await imageSize(f); if (!size) return err('pfArtErr', '이미지를 읽지 못했습니다. 다른 파일로 시도해 주세요.');
    const price = $('pfArtPrice').value === '' ? null : Math.max(0, Math.round(Number($('pfArtPrice').value)));
    const btn = $('pfArtSubmit'); busy(btn, true, '올리는 중…');
    try {
      await B.addArtwork(user.id, f, { title: $('pfArtTitle').value.trim(), year: $('pfArtYear').value.trim(), medium: $('pfArtMedium').value.trim(), description: $('pfArtDesc').value.trim(), price, for_sale: $('pfArtSale').checked && price != null, width: size.width, height: size.height });
      $('pfArtForm').reset(); invalidate(user.id); G.toast('작품을 올렸습니다. 내 갤러리 벽에 걸렸습니다.'); fillArts();
    } catch (ex) { err('pfArtErr', '올리지 못했습니다: ' + ex.message); }
    busy(btn, false);
  });
  function confirmBtn(btn, label, fn) {
    btn.addEventListener('click', async () => {
      if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = label; setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = '삭제'; } }, 3500); return; }
      btn.disabled = true; try { await fn(); } catch (ex) { G.toast('처리하지 못했습니다: ' + ex.message); btn.disabled = false; }
    });
  }
  async function fillArts() {
    const box = $('pfArtList'); box.innerHTML = '<p class="pfNote">불러오는 중…</p>';
    const arts = await B.listArtworks(user.id);
    box.innerHTML = arts.length ? '' : '<p class="pfEmpty">아직 올린 작품이 없습니다. 위에서 첫 작품을 올려 보세요.</p>';
    arts.forEach((a, i) => {
      const row = document.createElement('div'); row.className = 'pfRow';
      row.innerHTML = `<img alt="" src="${esc(a.url)}"><div class="pfRowMain"><b>${esc(a.title)}</b><span>${esc([a.year, a.medium].filter(Boolean).join(' · ') || '정보 없음')} · ${won(a.price)}${i >= MAX_ARTS ? ' · 벽 자리가 없어 걸리지 않음' : ''}</span></div>
        <label class="pfCheck small"><input type="checkbox" ${a.for_sale ? 'checked' : ''} ${a.price == null ? 'disabled title="가격을 정해야 판매할 수 있습니다"' : ''}> 판매 중</label><button type="button" class="btn small">삭제</button>`;
      row.querySelector('input').addEventListener('change', async ev => { try { await B.updateArtwork(a.id, { for_sale: ev.target.checked }); invalidate(user.id); G.toast(ev.target.checked ? '판매 중으로 바꿨습니다.' : '판매를 멈췄습니다.'); } catch (ex) { ev.target.checked = !ev.target.checked; G.toast('바꾸지 못했습니다: ' + ex.message); } });
      confirmBtn(row.querySelector('button'), '한 번 더 누르면 삭제', async () => { await B.deleteArtwork(a); invalidate(user.id); fillArts(); G.toast('작품을 삭제했습니다.'); });
      box.appendChild(row);
    });
  }
  $('pfModelForm').addEventListener('submit', async e => {
    e.preventDefault(); err('pfModelErr');
    const f = $('pfModelFile').files[0];
    if (!f) return err('pfModelErr', '올릴 .glb 파일을 골라 주세요.');
    if (!/\.glb$/i.test(f.name)) return err('pfModelErr', '.glb 파일만 올릴 수 있습니다. 블렌더에서 glTF 2.0 Binary(.glb)로 내보내 주세요.');
    if (f.size > 50 * 1024 * 1024) return err('pfModelErr', '파일이 50MB보다 큽니다. 블렌더에서 Decimate 등으로 가볍게 만든 뒤 올려 주세요.');
    const head = new Uint8Array(await f.slice(0, 4).arrayBuffer());
    if (String.fromCharCode.apply(null, head) !== 'glTF') return err('pfModelErr', '올바른 .glb 파일이 아닙니다. 다시 내보내 주세요.');
    const btn = $('pfModelSubmit'); busy(btn, true, '올리는 중…');
    try {
      await B.addModel(user.id, f, { name: $('pfModelName').value.trim() || f.name.replace(/\.glb$/i, ''), size_m: Math.min(4, Math.max(.2, Number($('pfModelSize').value) || 1.2)) });
      $('pfModelForm').reset(); $('pfModelSize').value = '1.2'; invalidate(user.id); G.toast('3D 모델을 올렸습니다. 내 갤러리 좌대에 놓였습니다.'); fillModels();
    } catch (ex) { err('pfModelErr', '올리지 못했습니다: ' + ex.message); }
    busy(btn, false);
  });
  async function fillModels() {
    const box = $('pfModelList'); box.innerHTML = '<p class="pfNote">불러오는 중…</p>';
    const ms = await B.listModels(user.id);
    box.innerHTML = ms.length ? '' : '<p class="pfEmpty">아직 올린 3D 모델이 없습니다.</p>';
    ms.forEach((m, i) => {
      const row = document.createElement('div'); row.className = 'pfRow';
      row.innerHTML = `<div class="pfIcon" aria-hidden="true">3D</div><div class="pfRowMain"><b>${esc(m.name)}</b><span>가장 긴 변 ${esc(m.size_m)}m${i >= MAX_MODELS ? ' · 좌대가 없어 놓이지 않음' : ''}</span></div><button type="button" class="btn small">삭제</button>`;
      confirmBtn(row.querySelector('button'), '한 번 더 누르면 삭제', async () => { await B.deleteModel(m); invalidate(user.id); fillModels(); G.toast('모델을 삭제했습니다.'); });
      box.appendChild(row);
    });
  }
  function orderRow(o, asSeller) {
    const row = document.createElement('div'); row.className = 'pfRow order';
    const when = new Date(o.created_at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
    row.innerHTML = `<div class="pfRowMain"><b>${esc(o.artwork_title)} · ${won(o.amount)}</b>
      <span class="pfStatus s-${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span>
      ${asSeller ? `<span>구매 희망자 ${esc(o.buyer_name)} · 연락처 <span class="sel">${esc(o.buyer_contact)}</span></span>` : ''}
      ${o.message ? `<span>“${esc(o.message)}”</span>` : ''}<span class="pfNote">${esc(when)}</span></div><div class="pfBtns"></div>`;
    const bx = row.querySelector('.pfBtns');
    const add = (label, status, primary) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small' + (primary ? ' primary' : ''); b.textContent = label; b.addEventListener('click', async () => { b.disabled = true; try { await B.updateOrder(o.id, status); asSeller ? fillOrders() : fillMine(); G.toast(label + ' 처리했습니다.'); } catch (ex) { b.disabled = false; G.toast('처리하지 못했습니다: ' + ex.message); } }); bx.appendChild(b); };
    if (o.status === 'requested') { if (asSeller) { add('수락', 'accepted', true); add('거절', 'declined'); } else add('요청 취소', 'cancelled'); }
    return row;
  }
  async function fillOrders() {
    const box = $('pfOrderList'); box.innerHTML = '<p class="pfNote">불러오는 중…</p>';
    const os = await B.listOrdersForSeller(user.id);
    box.innerHTML = '<p class="pfNotice">결제는 아직 실제로 처리되지 않습니다. 수락한 뒤 구매 희망자의 연락처로 결제와 배송을 직접 안내해 주세요.</p>' + (os.length ? '' : '<p class="pfEmpty">아직 받은 구매 요청이 없습니다.</p>');
    os.forEach(o => box.appendChild(orderRow(o, true)));
  }
  async function fillMine() {
    const box = $('pfMineList'); box.innerHTML = '<p class="pfNote">불러오는 중…</p>';
    const os = await B.listOrdersForBuyer(user.id);
    box.innerHTML = os.length ? '' : '<p class="pfEmpty">보낸 구매 요청이 없습니다. 다른 작가의 갤러리에서 판매 중인 작품을 눌러 보세요.</p>';
    os.forEach(o => box.appendChild(orderRow(o, false)));
  }

  /* ---------------- directory ---------------- */
  async function openDirectory() {
    $('pfDirMode').textContent = modeText();
    const box = $('pfDirList'); box.innerHTML = '<p class="pfNote">불러오는 중…</p>'; G.showPanel('pfDir');
    let list = [];
    try { list = await B.listGalleries(); } catch (ex) { box.innerHTML = `<p class="pfErr">불러오지 못했습니다: ${esc(ex.message)}</p>`; return; }
    box.innerHTML = list.length ? '' : '<p class="pfEmpty">아직 문을 연 작가 갤러리가 없습니다. 회원가입하면 첫 번째 갤러리가 됩니다.</p>';
    list.forEach(p => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'placeBtn';
      b.innerHTML = `<div class="fl" style="color:${esc(p.wall_color)};text-shadow:0 0 1px #2b241b">■</div><div><b>${esc(p.gallery_name || p.display_name)}${user && p.id === user.id ? ' · 내 갤러리' : ''}</b><span>${esc(p.display_name)} · 작품 ${p.artwork_count}점</span></div>`;
      b.addEventListener('click', () => enterGallery(p.id));
      box.appendChild(b);
    });
  }

  /* ---------------- user gallery scene ---------------- */
  function floorTexture(kind) {
    if (kind !== 'stone' && kind !== 'dark') return null;
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    let seed = kind === 'stone' ? 11 : 23; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    if (kind === 'stone') {
      g.fillStyle = '#cfc8bd'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '80,70,60'},${.04 + r() * .06})`; g.fillRect(r() * 512, r() * 512, 2 + r() * 3, 2 + r() * 3); }
      g.strokeStyle = 'rgba(90,80,70,.45)'; g.lineWidth = 2; for (let k = 0; k <= 512; k += 256) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 512); g.moveTo(0, k); g.lineTo(512, k); g.stroke(); }
    } else {
      for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(20, 22%, ${14 + r() * 6}%)`; g.fillRect(0, i * 64, 512, 64); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, i * 64, 512, 2); g.fillRect(r() * 512, i * 64, 2, 64);
        for (let k = 0; k < 30; k++) { g.strokeStyle = `rgba(255,220,180,${.02 + r() * .04})`; const y = i * 64 + r() * 64; g.beginPath(); g.moveTo(0, y); g.lineTo(512, y + (r() - .5) * 6); g.stroke(); } }
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(kind === 'stone' ? 4 : 6, kind === 'stone' ? 4 : 7); t.anisotropy = 4; return t;
  }
  const SLOTS = [
    [-5, -7.95, 0], [0, -7.95, 0], [5, -7.95, 0],
    [-7.95, -3, Math.PI / 2], [-7.95, 2.5, Math.PI / 2],
    [7.95, -3, -Math.PI / 2], [7.95, 2.5, -Math.PI / 2],
    [-4.5, 7.95, Math.PI], [4.5, 7.95, Math.PI]
  ];
  const PEDESTALS = [[-3, -2], [3, -2], [-3, 2.5], [3, 2.5]];
  function invalidate(id) { delete G.cache['u:' + id]; }
  function isDark(hex) { const n = parseInt(hex.slice(1), 16); return ((n >> 16 & 255) * .3 + (n >> 8 & 255) * .59 + (n & 255) * .11) < 110; }
  function buildUserGallery(p, arts, models) {
    const wall = /^#[0-9a-f]{6}$/i.test(p.wall_color || '') ? p.wall_color : '#eee7da';
    const place = G.buildRoom({ w: 16, d: 16, h: 5, wall: parseInt(wall.slice(1), 16), floorTex: floorTexture(p.floor) || undefined });
    const s = place.scene, own = user && user.id === p.id;
    const signBg = isDark(wall) ? '#f1e8d6' : '#221f19', signFg = isDark(wall) ? '#2b241b' : '#f1e8d6';
    G.wallText(s, [p.gallery_name || p.display_name, p.intro || `${p.display_name} 작가의 갤러리`], 0, 4.05, -7.94, 0, 5.2, { w: 1600, h: 300, title: 92, body: 40, bg: signBg, fg: signFg, pad: 50 });
    G.mapPanelMesh(s, place.inter, 0, 7.95, Math.PI);
    const loader = new THREE.TextureLoader();
    arts.slice(0, MAX_ARTS).forEach((a, i) => {
      const [x, z, ry] = SLOTS[i];
      loader.load(a.url, t => {
        t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
        const ar = (a.width && a.height) ? a.width / a.height : (t.image.width / t.image.height);
        const maxW = 2.6, maxH = 2.2; let w = maxW, h = w / ar; if (h > maxH) { h = maxH; w = h * ar; }
        const g = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.BoxGeometry(w + .12, h + .12, .07), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: .6 })); frame.castShadow = true;
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: .85 })); pic.position.z = .04;
        g.add(frame, pic); g.position.set(x, 2.15, z); g.rotation.y = ry; s.add(g);
        pic.userData.action = { type: 'userart', art: a, owner: p, label: a.for_sale && !own ? '작품 보기 · 구매 요청 가능' : '작품 보기' };
        place.inter.push(pic);
        const right = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
        const lbl = new THREE.Mesh(new THREE.PlaneGeometry(.62, .31), new THREE.MeshBasicMaterial({ map: G.textTexture([a.title, p.display_name, a.for_sale ? '판매 중 · ' + won(a.price) : (a.year || ' ')], { w: 768, h: 384, title: 44, body: 28, pad: 50 }), toneMapped: false }));
        lbl.position.set(x, 1.35, z).addScaledVector(right, w / 2 + .5).addScaledVector(new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)), .01); lbl.rotation.y = ry; s.add(lbl);
        if (a.for_sale) { const dot = new THREE.Mesh(new THREE.CircleGeometry(.05, 20), new THREE.MeshBasicMaterial({ color: 0xb8432f })); dot.position.copy(lbl.position).addScaledVector(right, -.36); dot.position.y += .1; dot.rotation.y = ry; s.add(dot); }
        const normal = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
        const sp = new THREE.SpotLight(0xfff0d8, 1.2, 12, Math.PI / 6.5, .55, 1.2); sp.position.set(x, 4.4, z).addScaledVector(normal, 2.4); sp.target.position.set(x, 2.15, z); s.add(sp, sp.target);
      }, undefined, () => console.warn('image failed', a.url));
    });
    if (!arts.length) G.wallText(s, own ? ['아직 걸린 작품이 없습니다', '오른쪽 위 「내 갤러리 관리」에서 작품 이미지를 올리면', '이 벽에 바로 걸립니다.'] : ['아직 걸린 작품이 없습니다', '작가가 작품을 준비하고 있어요.'], 0, 2.1, -7.93, 0, 3.6, { title: 64, body: 34 });
    const gl = THREE.GLTFLoader ? new THREE.GLTFLoader() : null;
    const pedMat = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: .9 });
    models.slice(0, MAX_MODELS).forEach((m, i) => {
      const [x, z] = PEDESTALS[i];
      const ped = new THREE.Mesh(new THREE.BoxGeometry(1.1, .6, 1.1), pedMat); ped.position.set(x, .3, z); ped.castShadow = ped.receiveShadow = true; s.add(ped);
      ped.userData.action = { type: 'model', model: m, owner: p, label: m.name }; place.inter.push(ped);
      if (!gl) return;
      gl.load(m.url, gltf => {
        const obj = gltf.scene; const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3());
        const k = (Number(m.size_m) || 1.2) / Math.max(size.x, size.y, size.z, 1e-6); obj.scale.setScalar(k);
        const b2 = new THREE.Box3().setFromObject(obj); const c = b2.getCenter(new THREE.Vector3());
        obj.position.set(x - c.x, .6 - b2.min.y, z - c.z);
        obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.action = { type: 'model', model: m, owner: p, label: m.name }; place.inter.push(o); } });
        s.add(obj);
        if (gltf.animations && gltf.animations.length) { const mix = new THREE.AnimationMixer(obj); gltf.animations.forEach(cl => mix.clipAction(cl).play()); place.updates.push(dt => mix.update(dt)); }
      }, undefined, () => { G.wallText(s, ['모델을 불러오지 못했습니다', m.name], x, 1.2, z + .56, 0, .9, { w: 768, h: 256, title: 44, body: 30, pad: 40 }); });
      const pl = new THREE.PointLight(0xfff0d8, .5, 5); pl.position.set(x, 3.2, z + 1); s.add(pl);
    });
    place.spawn = { pos: [0, 0, 5.5], yaw: 0 };
    place.name = [own ? '내 갤러리' : '작가 갤러리', p.gallery_name || p.display_name];
    place.ownerId = p.id;
    return place;
  }
  async function enterGallery(id) {
    try {
      const p = await B.getProfile(id); if (!p) { G.toast('갤러리를 찾을 수 없습니다.'); return; }
      const [arts, models] = await Promise.all([B.listArtworks(id), B.listModels(id)]);
      G.BUILDERS['u:' + id] = () => buildUserGallery(p, arts, models);
      invalidate(id); G.go('u:' + id);
    } catch (ex) { G.toast('갤러리를 열지 못했습니다: ' + ex.message); }
  }

  /* ---------------- artwork & purchase ---------------- */
  let buyTarget = null;
  function openUserArt(a) {
    const art = a.art, owner = a.owner, own = user && user.id === owner.id;
    $('artImgEl').src = art.url; $('artImgEl').alt = art.title;
    $('artTitle').textContent = art.title; $('artArtist').textContent = owner.display_name; $('artMedium').textContent = art.medium || '-'; $('artYear').textContent = art.year || '-';
    $('artDesc').textContent = art.description || '';
    $('artEyebrow').textContent = art.for_sale ? '작품 정보 · 판매 중 ' + won(art.price) : '작품 정보';
    $('enterWorldBtn').hidden = true;
    const bb = $('buyBtn'); bb.hidden = !art.for_sale; bb.disabled = own; bb.textContent = own ? '내 작품입니다' : '구매 요청하기';
    bb.onclick = own ? null : () => openBuy(art, owner);
    $('artSale').textContent = art.for_sale ? '결제는 아직 실제로 이루어지지 않습니다. 구매 요청을 보내면 작가가 확인 후 연락합니다.' : '';
    G.showPanel('artPanel');
  }
  function openBuy(art, owner) {
    if (!user) return openAuth('in', () => openBuy(art, owner));
    buyTarget = { art, owner }; err('pfBuyErr');
    $('pfBuyTitle').textContent = art.title; $('pfBuyMeta').textContent = `${owner.display_name} · ${won(art.price)}`;
    $('pfBuyName').value = $('pfBuyName').value || user.name; G.showPanel('pfBuy');
  }
  $('pfBuyForm').addEventListener('submit', async e => {
    e.preventDefault(); err('pfBuyErr');
    if (!$('pfBuyName').value.trim() || !$('pfBuyContact').value.trim()) return err('pfBuyErr', '이름과 연락처를 적어 주세요.');
    const btn = e.submitter; busy(btn, true, '보내는 중…');
    try {
      const { art, owner } = buyTarget;
      await B.createOrder({ artwork_id: art.id, artwork_title: art.title, seller: owner.id, buyer: user.id, buyer_name: $('pfBuyName').value.trim(), buyer_contact: $('pfBuyContact').value.trim(), message: $('pfBuyMsg').value.trim(), amount: art.price });
      $('pfBuyMsg').value = ''; G.closePanels(); G.toast('구매 요청을 보냈습니다. 「내 갤러리 관리 > 내 구매 요청」에서 진행 상황을 볼 수 있습니다.');
    } catch (ex) { err('pfBuyErr', '보내지 못했습니다: ' + ex.message); }
    busy(btn, false);
  });

  /* ---------------- hooks into the engine ---------------- */
  G.onAction = a => {
    if (a.type === 'userart') { openUserArt(a); return true; }
    if (a.type === 'model') { G.toast(`${a.model.name} · ${a.owner.display_name}`); return true; }
    return false;
  };
  G.extraPlaces = () => {
    const mine = user ? { id: 'u:' + user.id, fl: '我', name: '내 갤러리 · ' + ((profile && profile.gallery_name) || user.name), sub: '내가 꾸미고 작품을 거는 방', run: () => enterGallery(user.id) }
      : { id: 'login', fl: '我', name: '내 갤러리 만들기', sub: '회원가입하면 바로 내 방이 생깁니다', run: () => openAuth('up') };
    return [mine, { id: 'dir', fl: '作', name: '작가 갤러리 둘러보기', sub: '다른 작가들이 연 갤러리', run: openDirectory }];
  };

  window.GalleryBackend.then(async b => {
    B = b;
    try { user = await B.currentUser(); if (user) profile = await B.getProfile(user.id); } catch (e) { user = null; }
    refreshAccount();
    B.onAuthChange(async u => { user = u; profile = u ? await B.getProfile(u.id) : null; refreshAccount(); });
    window.__platform = { backend: B, enterGallery, openStudio, openAuth, openDirectory, get user() { return user; } };
  });
})();
