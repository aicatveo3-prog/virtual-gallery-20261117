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
  const MAX_MODELS = 4;
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
        <label>작가 이름<input id="pfDName" maxlength="30" required></label>
        <label>갤러리 이름<input id="pfGName" maxlength="40" required></label>
        <label>소개 (입구 벽에 걸림)<textarea id="pfGIntro" maxlength="160" rows="2"></textarea></label>
        <fieldset><legend>빠른 분위기 (누르면 아래 값이 한꺼번에 바뀝니다)</legend><div class="pfPresets" id="pfPresets"></div></fieldset>
        <div class="pfForm grid2">
          <label>방 크기와 모양<select id="pfSize"></select></label>
          <label>천장 높이<select id="pfHeight"></select></label>
          <label>가벽 (작품을 더 걸 수 있는 칸막이)<select id="pfPart"></select></label>
          <label>벽 마감<select id="pfFinish"></select></label>
          <label>바닥 재질<select id="pfFloorSel"></select></label>
          <label>천장<select id="pfCeil"></select></label>
        </div>
        <fieldset><legend>벽마다 색 따로 정하기</legend><div class="pfWalls" id="pfWallColors"></div></fieldset>
        <div class="actions"><button class="btn primary" type="submit">저장하고 내 갤러리로 가기</button><button class="btn" type="button" id="pfLogout">로그아웃</button></div>
      </form>
      <div class="pfGuest" id="pfGuestBox" hidden>
        <p class="pfNotice">비회원 테스트 모드입니다. 가입 없이 쓰는 대신, 올린 내용은 이 브라우저 안에만 저장되고 다른 기기나 다른 사람에게는 보이지 않습니다. 구매 요청을 시험하려면 다른 손님으로 바꿔서 서로의 갤러리를 방문해 보세요.</p>
        <div class="actions"><select id="pfGuestSel" aria-label="손님 고르기"></select><button class="btn" type="button" id="pfGuestSwitch">이 손님으로 바꾸기</button><button class="btn" type="button" id="pfGuestNew">새 손님 만들기</button></div>
      </div>
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
        <div class="actions span2"><button class="btn primary" type="submit" id="pfArtSubmit">작품 올리기</button><span class="pfNote">올리면 빈 벽에 자동으로 걸립니다. 아래 목록의 「벽에 걸기」로 원하는 자리에 옮길 수 있어요.</span></div>
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

  const modeText = () => B && B.mode === 'local' ? '비회원 테스트 모드 · 이 브라우저 안에만 저장됩니다' : '작품 속으로 · 플랫폼';
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
  const PRESETS = [
    { name: '밝은 화이트큐브', L: { finish: 'paint', floor: 'stone', ceiling: 'white', walls: { n: '#f4f2ee', e: '#f4f2ee', s: '#f4f2ee', w: '#f4f2ee', p: '#f4f2ee' } } },
    { name: '따뜻한 한지방', L: { finish: 'hanji', floor: 'wood', ceiling: 'wood', walls: { n: '#eee4cf', e: '#eee4cf', s: '#eee4cf', w: '#eee4cf', p: '#e3d2b4' } } },
    { name: '어두운 극장', L: { finish: 'paint', floor: 'dark', ceiling: 'dark', walls: { n: '#2f2c29', e: '#2f2c29', s: '#2f2c29', w: '#2f2c29', p: '#5b2e2a' } } },
    { name: '노출 콘크리트', L: { finish: 'concrete', floor: 'concrete', ceiling: 'dark', walls: { n: '#d9d7d3', e: '#d9d7d3', s: '#d9d7d3', w: '#d9d7d3', p: '#e8e4dc' } } },
    { name: '고전 미술관', L: { finish: 'plaster', floor: 'carpet', ceiling: 'white', walls: { n: '#2f3b35', e: '#2f3b35', s: '#2f3b35', w: '#2f3b35', p: '#e7d9d0' } } },
  ];
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
    $('pfDName').value = p.display_name || user.name; $('pfGName').value = p.gallery_name || ''; $('pfGIntro').value = p.intro || '';
    fillGuests();
    const L = layoutOf(p);
    const fillSel = (id, map, val) => { const el = $(id); el.innerHTML = Object.keys(map).map(k => `<option value="${k}">${esc(typeof map[k] === 'string' ? map[k] : map[k].label)}</option>`).join(''); el.value = String(val); };
    fillSel('pfSize', SIZES, L.size); fillSel('pfHeight', HEIGHTS, L.height); fillSel('pfPart', PARTS, L.partition);
    fillSel('pfFinish', FINISHES, L.finish); fillSel('pfFloorSel', FLOORS, L.floor); fillSel('pfCeil', CEILS, L.ceiling);
    const wc = $('pfWallColors'); wc.innerHTML = '';
    Object.entries(Object.assign({}, WALL_IDS, { p: '가벽' })).forEach(([k, label]) => { const l = document.createElement('label'); l.innerHTML = `${esc(label.replace(/ 벽$/, ''))}<input type="color" data-wall="${k}" value="${L.walls[k]}">`; wc.appendChild(l); });
    const pr = $('pfPresets'); pr.innerHTML = '';
    PRESETS.forEach(ps => { const b = document.createElement('button'); b.type = 'button'; b.textContent = ps.name; b.addEventListener('click', () => { $('pfFinish').value = ps.L.finish; $('pfFloorSel').value = ps.L.floor; $('pfCeil').value = ps.L.ceiling; wc.querySelectorAll('input[data-wall]').forEach(i => { i.value = ps.L.walls[i.dataset.wall]; }); G.toast(`「${ps.name}」 분위기로 골랐습니다. 저장하면 적용됩니다.`); }); pr.appendChild(b); });
  }
  function readLayout() {
    const walls = {}; $('pfWallColors').querySelectorAll('input[data-wall]').forEach(i => { walls[i.dataset.wall] = i.value; });
    return { size: $('pfSize').value, height: Number($('pfHeight').value), partition: $('pfPart').value, finish: $('pfFinish').value, floor: $('pfFloorSel').value, ceiling: $('pfCeil').value, walls };
  }
  $('pfRoomForm').addEventListener('submit', async e => {
    e.preventDefault();
    const layout = readLayout();
    const btn = e.submitter; busy(btn, true, '저장 중…');
    try {
      const dn = $('pfDName').value.trim() || user.name; user.name = dn;
      profile = await B.saveProfile({ id: user.id, display_name: dn, gallery_name: $('pfGName').value.trim() || user.name + '의 갤러리', intro: $('pfGIntro').value.trim(), wall_color: layout.walls.n, floor: layout.floor, layout });
      busy(btn, false); G.closePanels(); await enterGallery(user.id); G.toast('방을 새로 꾸몄습니다. 입구에서 다시 둘러보세요.');
    } catch (ex) { busy(btn, false); G.toast('저장하지 못했습니다: ' + ex.message); }
  });
  const GUEST = () => B && B.mode === 'local';
  async function fillGuests() {
    $('pfGuestBox').hidden = !GUEST(); $('pfLogout').hidden = GUEST();
    if (!GUEST()) return;
    const gs = await B.listGuests(); const sel = $('pfGuestSel'); sel.innerHTML = '';
    for (const g of gs) { const p = await B.getProfile(g.id); const o = document.createElement('option'); o.value = g.id; o.textContent = ((p && p.display_name) || g.name) + (g.id === user.id ? ' (지금)' : ''); o.selected = g.id === user.id; sel.appendChild(o); }
  }
  async function becomeGuest(u) { user = u; profile = await B.getProfile(user.id); refreshAccount(); G.closePanels(); G.toast(`${profile.display_name}(으)로 바꿨습니다.`); enterGallery(user.id); }
  $('pfGuestSwitch').addEventListener('click', async () => { const id = $('pfGuestSel').value; if (id && id !== user.id) becomeGuest(await B.switchTo(id)); });
  $('pfGuestNew').addEventListener('click', async () => becomeGuest(await B.guest()));
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
      const added = await B.addArtwork(user.id, f, { title: $('pfArtTitle').value.trim(), year: $('pfArtYear').value.trim(), medium: $('pfArtMedium').value.trim(), description: $('pfArtDesc').value.trim(), price, for_sale: $('pfArtSale').checked && price != null, width: size.width, height: size.height });
      $('pfArtForm').reset(); await reloadGallery(user.id); fillArts(added);
      const hungNow = isHung(added);
      G.toast(hungNow ? '작품을 올리고 빈 벽에 걸었습니다. 자리를 바꾸려면 「벽에 걸기」를 누르세요.' : '작품을 올렸습니다. 빈 벽이 없어 보관함에 넣었습니다. 「벽에 걸기」로 자리를 골라 주세요.');
    } catch (ex) { err('pfArtErr', '올리지 못했습니다: ' + ex.message); }
    busy(btn, false);
  });
  function confirmBtn(btn, label, fn) {
    btn.addEventListener('click', async () => {
      if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = label; setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = '삭제'; } }, 3500); return; }
      btn.disabled = true; try { await fn(); } catch (ex) { G.toast('처리하지 못했습니다: ' + ex.message); btn.disabled = false; }
    });
  }
  // Is this work on a wall right now (explicitly placed or auto-placed)?
  function hungSet(arts) { const geo = surfacesFor(layoutOf(profile)); const pls = resolvePlacements(arts, geo); return new Set(arts.filter(a => pls[a.id]).map(a => a.id)); }
  function isHung(a) { const d = galleryData[user.id]; return !!(a && d && hungSet(d.arts).has(a.id)); }
  async function fillArts(justAdded) {
    const box = $('pfArtList'); box.innerHTML = '<p class="pfNote">불러오는 중…</p>';
    const arts = await B.listArtworks(user.id);
    const hungIds = hungSet(arts);
    box.innerHTML = arts.length ? '' : '<p class="pfEmpty">아직 올린 작품이 없습니다. 위에서 첫 작품을 올려 보세요.</p>';
    arts.forEach(a => {
      const on = hungIds.has(a.id);
      const row = document.createElement('div'); row.className = 'pfRow';
      row.innerHTML = `<img alt="" src="${esc(a.url)}"><div class="pfRowMain"><b>${esc(a.title)}<span class="pfTag ${on ? 'on' : 'off'}">${on ? '벽에 걸림' : '보관 중'}</span></b><span>${esc([a.year, a.medium].filter(Boolean).join(' · ') || '정보 없음')} · ${won(a.price)}</span>
        <label class="pfCheck small"><input type="checkbox" ${a.for_sale ? 'checked' : ''} ${a.price == null ? 'disabled title="가격을 정해야 판매할 수 있습니다"' : ''}> 판매 중</label></div>
        <div class="pfBtns"><button type="button" class="btn small primary" data-act="hang">${on ? '자리 옮기기' : '벽에 걸기'}</button>${on ? '<button type="button" class="btn small" data-act="down">내리기</button>' : ''}</div><button type="button" class="btn small" data-act="del">삭제</button>`;
      row.querySelector('input').addEventListener('change', async ev => { try { await B.updateArtwork(a.id, { for_sale: ev.target.checked }); await reloadGallery(user.id); G.toast(ev.target.checked ? '판매 중으로 바꿨습니다.' : '판매를 멈췄습니다.'); } catch (ex) { ev.target.checked = !ev.target.checked; G.toast('바꾸지 못했습니다: ' + ex.message); } });
      row.querySelector('[data-act=hang]').addEventListener('click', () => startPlacing(a));
      const dn = row.querySelector('[data-act=down]'); if (dn) dn.addEventListener('click', async () => { dn.disabled = true; try { await takeDown(a); fillArts(); } catch (ex) { dn.disabled = false; G.toast('내리지 못했습니다: ' + ex.message); } });
      confirmBtn(row.querySelector('[data-act=del]'), '한 번 더 누르면 삭제', async () => { await B.deleteArtwork(a); await reloadGallery(user.id); fillArts(); G.toast('작품을 삭제했습니다.'); });
      if (justAdded && justAdded.id === a.id) row.style.outline = '2px solid var(--celadon)';
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
  const SIZES = { small: { w: 10, d: 10, label: '작은 방 (10×10m)' }, standard: { w: 16, d: 16, label: '기본 전시실 (16×16m)' }, hall: { w: 24, d: 18, label: '넓은 홀 (24×18m)' }, corridor: { w: 10, d: 28, label: '긴 회랑 (10×28m)' } };
  const HEIGHTS = { 3.6: '낮은 천장 3.6m', 5: '보통 5m', 7: '높은 천장 7m' };
  const PARTS = { none: '가벽 없음', center: '가운데 가벽 1개', two: '양쪽 가벽 2개', three: '가벽 3개 (지그재그)' };
  const FLOORS = { wood: '원목', stone: '밝은 석재', dark: '어두운 마루', concrete: '콘크리트', carpet: '붉은 카펫' };
  const FINISHES = { paint: '매끈한 페인트', plaster: '거친 회벽', hanji: '한지', concrete: '노출 콘크리트' };
  const CEILS = { white: '흰 천장', dark: '검은 천장', wood: '나무 천장' };
  const WALL_IDS = { n: '정면(북쪽) 벽', w: '왼쪽(서쪽) 벽', e: '오른쪽(동쪽) 벽', s: '입구(남쪽) 벽' };
  const hexOk = c => /^#[0-9a-f]{6}$/i.test(c || '');
  function layoutOf(p) {
    const L = Object.assign({}, (p && p.layout) || {});
    const base = hexOk(p && p.wall_color) ? p.wall_color : '#eee7da';
    L.size = SIZES[L.size] ? L.size : 'standard';
    L.height = HEIGHTS[L.height] ? Number(L.height) : 5;
    L.partition = PARTS[L.partition] ? L.partition : 'none';
    L.walls = Object.assign({ n: base, e: base, s: base, w: base, p: base }, L.walls || {});
    for (const k in L.walls) if (!hexOk(L.walls[k])) L.walls[k] = base;
    L.finish = FINISHES[L.finish] ? L.finish : 'paint';
    L.floor = FLOORS[L.floor] ? L.floor : (FLOORS[p && p.floor] ? p.floor : 'wood');
    L.ceiling = CEILS[L.ceiling] ? L.ceiling : 'white';
    return L;
  }
  function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
  function canvasTex(draw, rep) { const c = document.createElement('canvas'); c.width = c.height = 512; draw(c.getContext('2d'), 512); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 4; return t; }
  function noise(g, n, r, light, dark, size) { for (let i = 0; i < n; i++) { g.fillStyle = r() < .5 ? light : dark; const s = size * (.5 + r()); g.fillRect(r() * 512, r() * 512, s, s); } }
  function floorTexture(kind, w, d) {
    const r = rng(7 + kind.length * 13);
    if (kind === 'wood') { const t = G.woodTexture(); t.repeat.set(w / 2.6, d / 2.3); return t; }
    if (kind === 'stone') return canvasTex((g) => { g.fillStyle = '#cfc8bd'; g.fillRect(0, 0, 512, 512); noise(g, 4000, r, 'rgba(255,255,255,.08)', 'rgba(80,70,60,.08)', 3); g.strokeStyle = 'rgba(90,80,70,.45)'; g.lineWidth = 2; for (let k = 0; k <= 512; k += 256) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 512); g.moveTo(0, k); g.lineTo(512, k); g.stroke(); } }, [w / 4, d / 4]);
    if (kind === 'dark') return canvasTex((g) => { for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(20, 22%, ${14 + r() * 6}%)`; g.fillRect(0, i * 64, 512, 64); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, i * 64, 512, 2); g.fillRect(r() * 512, i * 64, 2, 64); } }, [w / 2.6, d / 2.3]);
    if (kind === 'concrete') return canvasTex((g) => { g.fillStyle = '#9d9a94'; g.fillRect(0, 0, 512, 512); noise(g, 9000, r, 'rgba(255,255,255,.06)', 'rgba(0,0,0,.07)', 4); for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(60,55,50,${.03 + r() * .05})`; g.beginPath(); g.ellipse(r() * 512, r() * 512, 30 + r() * 90, 20 + r() * 60, r() * 3, 0, 6.3); g.fill(); } g.strokeStyle = 'rgba(50,45,40,.35)'; g.strokeRect(1, 1, 510, 510); }, [w / 5, d / 5]);
    return canvasTex((g) => { g.fillStyle = '#7d2422'; g.fillRect(0, 0, 512, 512); noise(g, 14000, r, 'rgba(255,200,180,.06)', 'rgba(0,0,0,.08)', 2); }, [w / 3, d / 3]);
  }
  const finishCache = {};
  function finishTexture(kind) {
    if (kind === 'paint') return null;
    if (finishCache[kind]) return finishCache[kind];
    const r = rng(31 + kind.length);
    const t = kind === 'plaster' ? canvasTex(g => { g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 512, 512); for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '120,120,120'},${.05 + r() * .08})`; g.beginPath(); g.ellipse(r() * 512, r() * 512, 3 + r() * 14, 2 + r() * 8, r() * 3, 0, 6.3); g.fill(); } }, [3, 1.5])
      : kind === 'hanji' ? canvasTex(g => { g.fillStyle = '#f7f1e3'; g.fillRect(0, 0, 512, 512); for (let i = 0; i < 2600; i++) { g.strokeStyle = `rgba(${r() < .5 ? '255,255,255' : '150,130,100'},${.06 + r() * .08})`; g.lineWidth = .6 + r(); const x = r() * 512, y = r() * 512, a = r() * 6.3, l = 4 + r() * 18; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } }, [4, 2])
      : canvasTex(g => { g.fillStyle = '#d9d7d3'; g.fillRect(0, 0, 512, 512); noise(g, 12000, r, 'rgba(255,255,255,.05)', 'rgba(0,0,0,.05)', 2); g.fillStyle = 'rgba(60,60,60,.35)'; for (const [x, y] of [[64, 64], [448, 64], [64, 448], [448, 448]]) { g.beginPath(); g.arc(x, y, 7, 0, 6.3); g.fill(); } g.strokeStyle = 'rgba(80,80,80,.35)'; g.lineWidth = 2; g.strokeRect(1, 1, 510, 510); }, [2.5, 1.2]);
    return (finishCache[kind] = t);
  }
  function wallMaterial(color, finish, len, hh) {
    let map = finishTexture(finish);
    if (map && len) { map = map.clone(); map.needsUpdate = true; map.repeat.set(len / (finish === 'concrete' ? 2.4 : 3), hh / (finish === 'concrete' ? 1.2 : 3)); }
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), map, roughness: finish === 'paint' ? .9 : 1 });
  }
  function isDark(hex) { const n = parseInt(hex.slice(1), 16); return ((n >> 16 & 255) * .3 + (n >> 8 & 255) * .59 + (n & 255) * .11) < 110; }

  // Every hangable surface: id, centre on the floor line, right/normal vectors, length and height.
  function surfacesFor(L) {
    const { w, d } = SIZES[L.size], h = L.height, ph = Math.min(h - .6, 3.6), out = [];
    const mk = (id, cx, cz, ry, len, hh, label, color) => out.push({ id, center: new THREE.Vector3(cx, 0, cz), ry, right: new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry)), normal: new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)), len, h: hh, label, color });
    mk('n', 0, -d / 2, 0, w, h, WALL_IDS.n, L.walls.n); mk('w', -w / 2, 0, Math.PI / 2, d, h, WALL_IDS.w, L.walls.w);
    mk('e', w / 2, 0, -Math.PI / 2, d, h, WALL_IDS.e, L.walls.e); mk('s', 0, d / 2, Math.PI, w, h, WALL_IDS.s, L.walls.s);
    const panels = [];
    if (L.partition === 'center') panels.push({ x: 0, z: 0, len: Math.min(8, w * .5), along: 'x' });
    if (L.partition === 'two') { const len = Math.min(7, d * .4); panels.push({ x: -w / 4, z: 0, len, along: 'z' }, { x: w / 4, z: 0, len, along: 'z' }); }
    if (L.partition === 'three') { const len = Math.min(6, w * .42); panels.push({ x: -w * .18, z: -d * .22, len, along: 'x' }, { x: w * .18, z: 0, len, along: 'x' }, { x: -w * .18, z: d * .22 - 1, len, along: 'x' }); }
    panels.forEach((pn, i) => {
      const t = .15;
      if (pn.along === 'x') { mk(`p${i}a`, pn.x, pn.z + t, 0, pn.len, ph, `가벽 ${i + 1} 앞면`, L.walls.p); mk(`p${i}b`, pn.x, pn.z - t, Math.PI, pn.len, ph, `가벽 ${i + 1} 뒷면`, L.walls.p); }
      else { mk(`p${i}a`, pn.x + t, pn.z, Math.PI / 2, pn.len, ph, `가벽 ${i + 1} 오른쪽 면`, L.walls.p); mk(`p${i}b`, pn.x - t, pn.z, -Math.PI / 2, pn.len, ph, `가벽 ${i + 1} 왼쪽 면`, L.walls.p); }
    });
    return { w, d, h, ph, surfaces: out, panels };
  }
  function artSize(a) { const ar = (a.width && a.height) ? a.width / a.height : 1; let w = 2.2, h = w / ar; if (h > 1.9) { h = 1.9; w = h * ar; } return { w, h }; }
  function clampPlacement(pl, surf, a) {
    const { w, h } = artSize(a), half = surf.len / 2 - w / 2 - .25;
    return { wall: surf.id, x: Math.max(-Math.max(half, 0), Math.min(Math.max(half, 0), pl.x)), y: Math.max(h / 2 + .45, Math.min(surf.h - h / 2 - .2, pl.y)) };
  }
  // Fill empty spots automatically for works that have never been placed.
  function autoPlace(arts, geo) {
    const valid = pl => pl && pl.wall && geo.surfaces.some(s => s.id === pl.wall);
    const taken = arts.filter(a => valid(a.placement)).map(a => a.placement);
    const kioskX = geo.w / 2 - 1.4;
    const order = ['n', 'w', 'e'].concat(geo.surfaces.filter(s => s.id[0] === 'p').map(s => s.id), ['s']);
    const out = {};
    for (const a of arts) {
      if (valid(a.placement) || (a.placement && a.placement.stored)) continue;
      let spot = null;
      for (const id of order) {
        const surf = geo.surfaces.find(s => s.id === id); if (!surf) continue;
        const y = Math.min(2.0, surf.h / 2 + .2);
        for (let x = -surf.len / 2 + 1.7; x <= surf.len / 2 - 1.7 + 1e-6; x += 2.9) {
          if (id === 's' && Math.abs(-x - kioskX) < 2.2) continue;
          if (taken.some(t => t.wall === id && Math.abs(t.x - x) < 2.6)) continue;
          spot = { wall: id, x, y }; break;
        }
        if (spot) break;
      }
      out[a.id] = spot; if (spot) taken.push(spot);
    }
    return out;
  }
  // placement: null/없음 = 빈 자리에 자동, {stored:true} = 보관함, {wall,x,y} = 직접 고른 자리
  function resolvePlacements(arts, geo) {
    const auto = autoPlace(arts, geo), out = {};
    for (const a of arts) {
      const pl = a.placement;
      const surf = pl && pl.wall && geo.surfaces.find(x => x.id === pl.wall);
      out[a.id] = surf ? clampPlacement(pl, surf, a) : (pl && pl.stored ? null : (auto[a.id] || null));
    }
    return out;
  }
  function invalidate(id) { delete G.cache['u:' + id]; }
  function buildUserGallery(p, arts, models) {
    const L = layoutOf(p), geo = surfacesFor(L), { w, d, h } = geo, own = user && user.id === p.id;
    const s = new THREE.Scene(); s.background = new THREE.Color(0x15130f); s.environment = G.envTex;
    const place = { scene: s, inter: [], reach: 9, updates: [], walls: [] };
    // floor, ceiling
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: floorTexture(L.floor, w, d), roughness: L.floor === 'carpet' ? 1 : .42 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const ceilMat = L.ceiling === 'wood' ? new THREE.MeshStandardMaterial({ map: (() => { const t = G.woodTexture(); t.repeat.set(w / 3, d / 3); return t; })(), roughness: .8 }) : new THREE.MeshStandardMaterial({ color: L.ceiling === 'dark' ? 0x24211e : 0xf2efe8, roughness: 1 });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.y = h; s.add(ceil);
    // walls (outer)
    geo.surfaces.forEach(sf => {
      const isPanel = sf.id[0] === 'p';
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sf.len, sf.h), wallMaterial(sf.color, L.finish, sf.len, sf.h));
      mesh.position.copy(sf.center).addScaledVector(sf.normal, isPanel ? .001 : 0); mesh.position.y = sf.h / 2; mesh.rotation.y = sf.ry; mesh.receiveShadow = true;
      mesh.userData.surface = sf; s.add(mesh); place.walls.push(mesh);
      if (!isPanel) { const bb = new THREE.Mesh(new THREE.BoxGeometry(sf.len, .12, .03), new THREE.MeshStandardMaterial({ color: 0x2a221a })); bb.position.copy(sf.center).addScaledVector(sf.normal, .015); bb.position.y = .06; bb.rotation.y = sf.ry; s.add(bb); }
    });
    // partition bodies (edges + top)
    geo.panels.forEach(pn => {
      const box = new THREE.Mesh(pn.along === 'x' ? new THREE.BoxGeometry(pn.len, geo.ph, .28) : new THREE.BoxGeometry(.28, geo.ph, pn.len), wallMaterial(L.walls.p, L.finish));
      box.position.set(pn.x, geo.ph / 2, pn.z); box.castShadow = box.receiveShadow = true; s.add(box);
    });
    // light
    s.add(new THREE.HemisphereLight(0xfff4e2, 0x3a2f24, .42)); s.add(new THREE.AmbientLight(0xffffff, .08));
    const strip = new THREE.MeshBasicMaterial({ color: 0xfff6e6 });
    for (let x = -w / 2 + 3; x < w / 2 - 1; x += Math.max(3, w / 4)) { const m = new THREE.Mesh(new THREE.BoxGeometry(.14, .04, d * .8), strip); m.position.set(x, h - .03, 0); s.add(m); }
    const fill = new THREE.PointLight(0xfff2de, .35, Math.max(w, d) * 1.4); fill.position.set(0, h - .5, 0); s.add(fill);
    // sign + map kiosk
    const signBg = isDark(L.walls.n) ? '#f1e8d6' : '#221f19', signFg = isDark(L.walls.n) ? '#2b241b' : '#f1e8d6';
    const signW = Math.min(5.2, w * .5);
    G.wallText(s, [p.gallery_name || p.display_name, p.intro || `${p.display_name} 작가의 갤러리`], 0, h - .5 - signW * 300 / 1600 / 2, -d / 2 + .02, 0, signW, { w: 1600, h: 300, title: 92, body: 40, bg: signBg, fg: signFg, pad: 50 });
    G.mapPanelMesh(s, place.inter, w / 2 - 1.4, d / 2 - .02, Math.PI);
    // artworks
    const pls = resolvePlacements(arts, geo);
    const loader = new THREE.TextureLoader();
    let spots = 0;
    place.hung = [];
    arts.forEach(a => {
      const pl = pls[a.id]; if (!pl) return;
      const surf = geo.surfaces.find(x => x.id === pl.wall); if (!surf) return;
      place.hung.push({ art: a, pl });
      const { w: aw, h: ah } = artSize(a);
      const g = new THREE.Group(); g.position.copy(surf.center).addScaledVector(surf.right, pl.x).addScaledVector(surf.normal, .045); g.position.y = pl.y; g.rotation.y = surf.ry; s.add(g);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(aw + .12, ah + .12, .07), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: .6 })); frame.castShadow = true; g.add(frame);
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(aw, ah), new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: .85 })); pic.position.z = .04; g.add(pic);
      loader.load(a.url, t => { t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; pic.material.map = t; pic.material.color.set(0xffffff); pic.material.needsUpdate = true; }, undefined, () => console.warn('image failed', a.url));
      pic.userData.action = { type: 'userart', art: a, owner: p, label: own ? '작품 보기 · 옮기기' : (a.for_sale ? '작품 보기 · 구매 요청 가능' : '작품 보기') };
      place.inter.push(pic);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(.56, .28), new THREE.MeshBasicMaterial({ map: G.textTexture([a.title, p.display_name, a.for_sale ? '판매 중 · ' + won(a.price) : (a.year || ' ')], { w: 768, h: 384, title: 44, body: 28, pad: 50 }), toneMapped: false }));
      const side = (pl.x + aw / 2 + .5 > surf.len / 2 - .2) ? -1 : 1;
      lbl.position.copy(surf.center).addScaledVector(surf.right, pl.x + side * (aw / 2 + .45)).addScaledVector(surf.normal, .02); lbl.position.y = Math.max(1.2, pl.y - ah / 2 + .2); lbl.rotation.y = surf.ry; s.add(lbl);
      if (a.for_sale) { const dot = new THREE.Mesh(new THREE.CircleGeometry(.045, 20), new THREE.MeshBasicMaterial({ color: 0xb8432f })); dot.position.copy(lbl.position).addScaledVector(surf.right, -.33).addScaledVector(surf.normal, .005); dot.position.y += .1; dot.rotation.y = surf.ry; s.add(dot); }
      if (spots++ < 10) { const sp = new THREE.SpotLight(0xfff0d8, 1.1, 12, Math.PI / 7, .55, 1.2); sp.position.copy(g.position).addScaledVector(surf.normal, 2.2); sp.position.y = Math.min(h - .3, pl.y + 2.4); sp.target.position.copy(g.position); s.add(sp, sp.target); }
    });
    if (!place.hung.length) {
      const msg = own ? ['아직 걸린 작품이 없습니다', '「내 갤러리 관리 > 작품」에서 올리거나', '「벽에 걸기」를 누르고 벽을 클릭하세요.'] : ['아직 걸린 작품이 없습니다', '작가가 작품을 준비하고 있어요.'];
      G.wallText(s, msg, 0, Math.min(2.1, h / 2), -d / 2 + .03, 0, Math.min(3.6, w * .4), { title: 64, body: 34 });
    }
    // models on pedestals, avoiding partitions
    const blocked = (x, z) => geo.panels.some(pn => (pn.along === 'x' ? Math.abs(x - pn.x) < pn.len / 2 + 1 && Math.abs(z - pn.z) < 1.3 : Math.abs(z - pn.z) < pn.len / 2 + 1 && Math.abs(x - pn.x) < 1.3));
    const cands = [[-w / 4, -d / 4], [w / 4, -d / 4], [-w / 4, d / 4 - 1], [w / 4, d / 4 - 1], [0, -d / 4], [0, d / 4 - 1], [-w / 3, 0], [w / 3, 0]].filter(([x, z]) => !blocked(x, z));
    const gl = THREE.GLTFLoader ? new THREE.GLTFLoader() : null;
    const pedMat = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: .9 });
    models.slice(0, Math.min(MAX_MODELS, cands.length)).forEach((m, i) => {
      const [x, z] = cands[i];
      const ped = new THREE.Mesh(new THREE.BoxGeometry(1.1, .6, 1.1), pedMat); ped.position.set(x, .3, z); ped.castShadow = ped.receiveShadow = true; s.add(ped);
      ped.userData.action = { type: 'model', model: m, owner: p, label: m.name }; place.inter.push(ped);
      if (!gl) return;
      gl.load(m.url, gltf => {
        const obj = gltf.scene; const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3());
        const k = Math.min((Number(m.size_m) || 1.2), h - 1.2) / Math.max(size.x, size.y, size.z, 1e-6); obj.scale.setScalar(k);
        const b2 = new THREE.Box3().setFromObject(obj); const c = b2.getCenter(new THREE.Vector3());
        obj.position.set(x - c.x, .6 - b2.min.y, z - c.z);
        obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.action = { type: 'model', model: m, owner: p, label: m.name }; place.inter.push(o); } });
        s.add(obj);
        if (gltf.animations && gltf.animations.length) { const mix = new THREE.AnimationMixer(obj); gltf.animations.forEach(cl => mix.clipAction(cl).play()); place.updates.push(dt => mix.update(dt)); }
      }, undefined, () => { G.wallText(s, ['모델을 불러오지 못했습니다', m.name], x, 1.2, z + .56, 0, .9, { w: 768, h: 256, title: 44, body: 30, pad: 40 }); });
      const pl = new THREE.PointLight(0xfff0d8, .5, 5); pl.position.set(x, Math.min(3.2, h - .3), z + 1); s.add(pl);
    });
    place.clamp = q => {
      q.x = Math.max(-w / 2 + .5, Math.min(w / 2 - .5, q.x)); q.z = Math.max(-d / 2 + .5, Math.min(d / 2 - .5, q.z)); q.y = G.player.eye;
      for (const pn of geo.panels) {
        const hx = (pn.along === 'x' ? pn.len / 2 : .14) + .4, hz = (pn.along === 'x' ? .14 : pn.len / 2) + .4;
        const dx = q.x - pn.x, dz = q.z - pn.z;
        if (Math.abs(dx) < hx && Math.abs(dz) < hz) { if (hx - Math.abs(dx) < hz - Math.abs(dz)) q.x = pn.x + Math.sign(dx || 1) * hx; else q.z = pn.z + Math.sign(dz || 1) * hz; }
      }
    };
    place.spawn = { pos: [0, 0, d / 2 - 2.2], yaw: 0 };
    place.name = [own ? '내 갤러리' : '작가 갤러리', p.gallery_name || p.display_name];
    place.ownerId = p.id; place.geo = geo;
    return place;
  }
  const galleryData = {};
  async function loadGallery(id) {
    const p = await B.getProfile(id); if (!p) throw new Error('갤러리를 찾을 수 없습니다.');
    const [arts, models] = await Promise.all([B.listArtworks(id), B.listModels(id)]);
    galleryData[id] = { p, arts, models };
    G.BUILDERS['u:' + id] = () => buildUserGallery(p, arts, models);
    return galleryData[id];
  }
  async function enterGallery(id) {
    try { await loadGallery(id); invalidate(id); G.go('u:' + id); }
    catch (ex) { G.toast('갤러리를 열지 못했습니다: ' + ex.message); }
  }
  // Rebuild the gallery in place (keeps the visitor where they stand) after a change.
  async function reloadGallery(id) {
    await loadGallery(id);
    if (G.getCurId() === 'u:' + id) G.refreshPlace('u:' + id); else invalidate(id);
  }

  /* ---------------- hanging works: pick a work, click a wall ---------------- */
  const banner = document.createElement('div'); banner.id = 'pfPlaceBar'; banner.hidden = true;
  banner.innerHTML = '<span id="pfPlaceMsg"></span><button type="button" class="btn small" id="pfPlaceCancel">그만두기</button>';
  document.body.appendChild(banner);
  let placing = null, ghost = null;
  const pray = new THREE.Raycaster();
  function wallHit(ndc) {
    const cur = G.cache['u:' + (user && user.id)]; if (!cur || G.getCurId() !== 'u:' + user.id) return null;
    pray.setFromCamera(ndc, G.camera); pray.far = 40;
    const hits = pray.intersectObjects(cur.walls, false); if (!hits.length) return null;
    const hpt = hits[0].point, sf = hits[0].object.userData.surface;
    const rel = hpt.clone().sub(sf.center);
    return { surf: sf, pl: clampPlacement({ wall: sf.id, x: rel.dot(sf.right), y: hpt.y }, sf, placing.art) };
  }
  function ghostUpdate() {
    if (!placing) return;
    const cur = G.cache['u:' + user.id]; if (!cur) return;
    if (!ghost) { const { w, h } = artSize(placing.art); ghost = new THREE.Mesh(new THREE.PlaneGeometry(w + .12, h + .12), new THREE.MeshBasicMaterial({ color: 0x7fae9a, transparent: true, opacity: .45, depthWrite: false })); }
    if (ghost.parent !== cur.scene) cur.scene.add(ghost);
    const hit = wallHit(G.getPointerNDC());
    ghost.visible = !!hit;
    if (hit) { ghost.position.copy(hit.surf.center).addScaledVector(hit.surf.right, hit.pl.x).addScaledVector(hit.surf.normal, .09); ghost.position.y = hit.pl.y; ghost.rotation.y = hit.surf.ry; $('pfPlaceMsg').textContent = `「${placing.art.title}」 · ${hit.surf.label}에 걸려면 클릭`; }
    else $('pfPlaceMsg').textContent = `「${placing.art.title}」을(를) 걸 벽을 바라보고 클릭하세요`;
  }
  (function loop() { requestAnimationFrame(loop); ghostUpdate(); })();
  async function startPlacing(art) {
    if (!user) return;
    G.closePanels();
    if (G.getCurId() !== 'u:' + user.id) { await enterGallery(user.id); await new Promise(r => setTimeout(r, 700)); }
    placing = { art }; banner.hidden = false; ghostUpdate();
    G.toast(isTouchDevice() ? '걸고 싶은 벽을 톡 누르세요.' : '벽을 바라보고 클릭하면 그 자리에 걸립니다. 걸어 다니며 위치를 고를 수 있어요.');
  }
  function stopPlacing() { placing = null; banner.hidden = true; if (ghost && ghost.parent) ghost.parent.remove(ghost); ghost = null; }
  const isTouchDevice = () => matchMedia('(pointer: coarse)').matches;
  $('pfPlaceCancel').addEventListener('click', stopPlacing);
  window.addEventListener('keydown', e => { if (placing && (e.key === 'Escape' || e.key === 'q')) stopPlacing(); });
  G.onPointerPick = ndc => {
    if (!placing || G.isPanelOpen()) return false;
    const hit = wallHit(ndc); if (!hit) { G.toast('벽을 눌러 주세요.'); return true; }
    const art = placing.art; stopPlacing();
    B.updateArtwork(art.id, { placement: hit.pl }).then(() => reloadGallery(user.id)).then(() => G.toast(`「${art.title}」을(를) ${hit.surf.label}에 걸었습니다.`)).catch(ex => G.toast('걸지 못했습니다: ' + ex.message));
    return true;
  };
  async function takeDown(art) { await B.updateArtwork(art.id, { placement: { stored: true } }); await reloadGallery(user.id); G.toast(`「${art.title}」을(를) 벽에서 내렸습니다. 보관함에 있습니다.`); }

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
    const td = $('pfTakeDownBtn'); td.hidden = !own;
    if (own) {
      bb.hidden = false; bb.disabled = false; bb.textContent = '다른 자리로 옮기기'; bb.onclick = () => startPlacing(art);
      td.onclick = async () => { G.closePanels(); try { await takeDown(art); } catch (ex) { G.toast('내리지 못했습니다: ' + ex.message); } };
    }
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
    // 비회원 모드: 로그인 화면 없이 손님 계정을 바로 만든다.
    if (!user && B.mode === 'local') { try { user = await B.guest(); profile = await B.getProfile(user.id); } catch (e) { user = null; } }
    refreshAccount();
    B.onAuthChange(async u => { user = u; profile = u ? await B.getProfile(u.id) : null; refreshAccount(); });
    window.__platform = { becomeGuest, backend: B, enterGallery, openStudio, openAuth, openDirectory, get user() { return user; } };
  });
})();
