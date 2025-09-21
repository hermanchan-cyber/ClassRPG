// Forest Arena – improved GitHub Pages build
const KEY = 'forest_arena_v2';

// ============ INITIAL STATE ============
const defaultTeams = [
  spriteTeam('owl',    'Owl',     owlSprite()),
  spriteTeam('fox',    'Fox',     foxSprite()),
  spriteTeam('stag',   'Stag',    stagSprite()),
  spriteTeam('raccoon','Raccoon', raccoonSprite()),
];
const state = load() || {
  teams: defaultTeams,
  pick: { attackerId:null, defenderId:null },
  log: [],
  settings: { sfx: true, playlistUrl: '' }
};

// ============ DOM HOOKS ============
const squadGrid = byId('squadGrid');
const leftSide  = byId('leftSide');
const rightSide = byId('rightSide');
const statusEl  = byId('status');
const logEl     = byId('log');
const overlay   = byId('overlay');
const flashBig  = byId('flashBig');
const flashSub  = byId('flashSub');

// Audio SFX (small, embedded)
const sfxEls = [byId('sfx1'), byId('sfx2'), byId('sfx3')];
primeSfx();

// Controls
byId('newGame').onclick = () => {
  if(!confirm('Start over?')) return;
  state.teams.forEach(t => { t.hp = 50; t.maxHp = 50; });
  state.log = [];
  state.pick = {attackerId:null, defenderId:null};
  saveRender();
};
byId('healAll').onclick = () => { state.teams.forEach(t => t.hp = t.maxHp); pushLog('All teams healed to full.'); saveRender(); };
byId('exportBtn').onclick = exportSave;
byId('importFile').addEventListener('change', onImportFile);

// Settings dialog
const settingsDlg = byId('settingsDlg');
byId('settingsBtn').onclick = () => {
  byId('sfxToggle').checked = !!state.settings.sfx;
  byId('playlistUrl').value = state.settings.playlistUrl || '';
  settingsDlg.showModal();
};
byId('saveSettings').onclick = (e) => {
  e.preventDefault();
  state.settings.sfx = byId('sfxToggle').checked;
  state.settings.playlistUrl = byId('playlistUrl').value.trim();
  applyPlaylist();
  save();
  settingsDlg.close();
};

// Spotify dock
const spotifyDock = byId('spotifyDock');
const spotifyWrap = byId('spotifyEmbedWrap');
byId('spotifyToggle').onclick = () => { spotifyDock.hidden = !spotifyDock.hidden; };
byId('spotifyStart').onclick = () => {
  // Best we can do: user taps this to start playback in the iframe context
  const iframe = spotifyWrap.querySelector('iframe');
  if (!iframe) return;
  iframe.focus(); // bring attention
  // We can't programmatically press play due to cross-origin + autoplay policies.
  alert('Tap the ▶︎ Play button in the Spotify player to start the playlist.');
};

// Action buttons
byId('cancelPick').onclick = cancelPick;
byId('attackBtn').onclick = onAttack;

overlay.addEventListener('click', () => overlay.classList.remove('show'));

// Render
render();
applyPlaylistIfAny();

// ============ RENDERING ============
function render(){
  renderArena();
  renderCards();
  renderLog();
  updateButtons();
}
function renderCards(){
  squadGrid.innerHTML = '';
  state.teams.forEach(t => squadGrid.appendChild(teamCard(t)));
}
function renderArena(){
  leftSide.innerHTML = ''; rightSide.innerHTML = '';
  const a = getTeam(state.pick.attackerId);
  const d = getTeam(state.pick.defenderId);
  const [L,R] = a && d ? [a,d] : [state.teams[0], state.teams[1]];
  leftSide.appendChild(spriteNode(L, 'left'));
  rightSide.appendChild(spriteNode(R, 'right'));
}
function renderLog(){
  logEl.innerHTML = state.log.slice(-200).map(x=>`<div>${esc(x)}</div>`).join('');
  logEl.scrollTop = logEl.scrollHeight;
}
function updateButtons(){
  const hasAtt = !!state.pick.attackerId;
  const hasDef = !!state.pick.defenderId;
  byId('cancelPick').disabled = !(hasAtt || hasDef);
  byId('attackBtn').disabled = !(hasAtt && hasDef);
  if (!hasAtt) status('Pick an attacker, then choose a target. (Use “Cancel” to undo.)');
  else if (!hasDef) status(`${getTeam(state.pick.attackerId).name} selected — pick a target.`);
  else status(`${getTeam(state.pick.attackerId).name} → ${getTeam(state.pick.defenderId).name}. Ready to attack.`);
}

function teamCard(team){
  const card = el('div','card');

  const head = el('div','cardHeader');
  const name = el('div','name'); name.textContent = team.name; name.title = 'Rename';
  name.onclick = () => {
    const v = prompt('Name:', team.name);
    if (v!==null && v.trim()){ team.name = v.trim(); saveRender(); }
  };
  const avatar = el('div','avatarSm'); avatar.style.backgroundImage = `url('${team.sprite}')`;
  head.append(name, avatar);

  const hpRow = el('div','hpRow');
  const hpbar = el('div','hpbar'); const hpfill = el('div','hpfill');
  const pct = Math.max(0, Math.min(100, (team.hp/team.maxHp)*100));
  hpfill.style.width = pct + '%';
  if (pct<=30) hpfill.style.background = 'linear-gradient(90deg,#ef4444,#b91c1c)';
  else if (pct<=60) hpfill.style.background = 'linear-gradient(90deg,#f59e0b,#b45309)';
  hpbar.appendChild(hpfill);
  const pills = el('div','stats'); pills.append(pill(`HP ${team.hp}/${team.maxHp}`));
  hpRow.append(hpbar, pills);

  const btns = el('div','btnRow');
  const pickAtt = btn('Pick Attacker','primary', () => { state.pick.attackerId = team.id; state.pick.defenderId = null; saveRender(); });
  const pickDef = btn('Pick Target','secondary', () => {
    if (!state.pick.attackerId || state.pick.attackerId === team.id){ status('Pick a different team as target.'); return; }
    state.pick.defenderId = team.id; saveRender();
  });
  const heal = btn('Heal +10','secondary', () => { team.hp = Math.min(team.maxHp, team.hp+10); saveRender(); });
  const dmg  = btn('Hit −5','secondary', () => { team.hp = Math.max(0, team.hp-5); saveRender(); });
  btns.append(pickAtt, pickDef, heal, dmg);

  card.append(head, hpRow, btns);
  return card;
}

// ============ ATTACK FLOW ============
async function onAttack(){
  const attacker = getTeam(state.pick.attackerId);
  const defender = getTeam(state.pick.defenderId);
  if (!attacker || !defender) return;

  // outcome tiers
  const r = Math.random();
  let label='MISS', dmg=0, cls='miss';
  if (r < 0.18){ label='MISS'; dmg=0; cls='miss'; }
  else if (r < 0.78){ label='HIT'; dmg = rand(3,6); cls='dmg'; }
  else if (r < 0.93){ label='HEAVY'; dmg = rand(7,12); cls='dmg'; }
  else { label='DEVASTATING!'; dmg = rand(14,20); cls='dev'; }

  // play SFX (local) – reliable, no login needed
  if (state.settings.sfx) playRandomSfx();

  await runSlashAnimation(attacker, defender);

  if (dmg>0){
    const before = defender.hp;
    defender.hp = Math.max(0, defender.hp - dmg);
    floatText(defender.id, `-${before-defender.hp}`, cls);
    defenderShake(defender.id);
  } else {
    defenderDodge(defender.id);
    floatText(defender.id, 'MISS', 'miss');
  }

  pushLog(`${attacker.name} → ${defender.name}: ${label}${dmg?` for ${dmg}`:''}.`);
  state.pick = {attackerId:null, defenderId:null};
  saveRender();
}

function cancelPick(){ state.pick = {attackerId:null, defenderId:null}; saveRender(); }

// ============ ANIMATION HELPERS ============
function spriteNode(team, side){
  const wrap = el('div','sprite');
  wrap.id = `sprite-${team.id}`;
  wrap.style.backgroundImage = `url('${team.sprite}')`;
  if (team.hp/team.maxHp <= .3) wrap.classList.add('hpLow');
  const lab = el('div','spriteLabel'); lab.textContent = team.name;
  wrap.appendChild(lab);
  wrap.dataset.side = side;
  return wrap;
}
function defenderShake(teamId){
  const s = byId(`sprite-${teamId}`); if(!s) return;
  s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake');
}
function defenderDodge(teamId){
  const s = byId(`sprite-${teamId}`); if(!s) return;
  s.classList.remove('dodge'); void s.offsetWidth; s.classList.add('dodge');
}
function floatText(teamId, text, kind='dmg'){
  const s = byId(`sprite-${teamId}`); if(!s) return;
  const f = el('div','float '+kind); f.textContent = text;
  s.appendChild(f);
  requestAnimationFrame(()=> f.classList.add('show'));
  setTimeout(()=> f.remove(), 1000);
}
function slashEffect(fromId){
  const s = byId(`sprite-${fromId}`); if(!s) return null;
  const sl = el('div','slash'); s.appendChild(sl);
  requestAnimationFrame(()=> sl.classList.add('run'));
  setTimeout(()=> sl.remove(), 380);
  return sl;
}
function runSlashAnimation(attacker, defender){
  return new Promise(resolve=>{
    state.pick.attackerId = attacker.id;
    state.pick.defenderId = defender.id;
    renderArena();
    setTimeout(()=>{
      slashEffect(attacker.id);
      const a = byId(`sprite-${attacker.id}`);
      const side = a?.dataset.side === 'left' ? 1 : -1;
      a.animate(
        [{ transform:`translateX(0)` }, { transform:`translateX(${side*40}px)` }, { transform:`translateX(0)` }],
        { duration: 350, easing:'ease-out' }
      );
      setTimeout(resolve, 360);
    }, 40);
  });
}

// ============ SPOTIFY (EMBED ONLY) ============
function applyPlaylistIfAny(){ if (state.settings.playlistUrl) applyPlaylist(); }
function applyPlaylist(){
  const url = state.settings.playlistUrl;
  const dock = byId('spotifyDock');
  const wrap = byId('spotifyEmbedWrap');
  if (!url){ dock.hidden = true; wrap.innerHTML=''; return; }
  // Normalize: accept either playlist page or already-embed URL
  let id = url.match(/playlist\/([a-zA-Z0-9]+)/)?.[1] || '';
  if (!id && url.includes('open.spotify.com/embed/playlist/')){
    id = url.split('/embed/playlist/')[1]?.split('?')[0];
  }
  if (!id){ alert('Could not find playlist id. Paste a URL like https://open.spotify.com/playlist/…'); return; }
  const src = `https://open.spotify.com/embed/playlist/${id}?utm_source=generator`;
  wrap.innerHTML = `<iframe src="${src}" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"></iframe>`;
  dock.hidden = false;
}

// ============ SAVE / LOAD / UTIL ============
function exportSave(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'forest_arena_save.json'; a.click();
  URL.revokeObjectURL(url);
}
function onImportFile(e){
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try{
      const d = JSON.parse(r.result);
      if (!d.teams || !Array.isArray(d.teams)) throw new Error();
      state.teams = d.teams.map(migrateTeam);
      state.log = Array.isArray(d.log) ? d.log : [];
      state.settings = Object.assign({sfx:true, playlistUrl:''}, d.settings||{});
      state.pick = {attackerId:null, defenderId:null};
      saveRender(); applyPlaylistIfAny();
    }catch(_){ alert('Invalid save file.'); }
  };
  r.readAsText(f); e.target.value='';
}
function migrateTeam(t){
  return { id:String(t.id), name:String(t.name||'Team'), sprite:String(t.sprite||owlSprite()),
           hp:clamp(Number(t.hp||50),0,999), maxHp:clamp(Number(t.maxHp||50),10,999) };
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }
function saveRender(){ save(); render(); }
function load(){ try{ const s=localStorage.getItem(KEY); return s?JSON.parse(s):null; }catch(e){ return null; } }
function rand(a,b){ return a + Math.floor(Math.random()*(b-a+1)); }
function clamp(x,a,b){ return Math.max(a, Math.min(b,x)); }
function status(text){ statusEl.textContent = text; }
function pushLog(line){ state.log.push(`[${timeNow()}] ${line}`); renderLog(); save(); }
function timeNow(){ const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function pill(txt){ const p=el('div','pill'); p.textContent=txt; return p; }
function btn(txt, cls, fn){ const b=document.createElement('button'); b.textContent=txt; if(cls) b.classList.add(cls); b.onclick=fn; return b; }
function el(tag, cls){ const e=document.createElement(tag); if(cls) e.className=cls; return e; }
function byId(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;","&gt;":"&gt;","\"":"&quot;"}[c])); }

// ============ SPRITES (tiny inline, replace later with PNGs if you want) ============
function px(svg){ return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg); }
function owlSprite(){
  return px(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' shape-rendering='crispEdges'>
  <rect width='64' height='64' fill='#13223f'/>
  <rect x='20' y='10' width='24' height='26' fill='#8b6f44'/>
  <rect x='24' y='18' width='6' height='6' fill='#ffd166'/>
  <rect x='34' y='18' width='6' height='6' fill='#ffd166'/>
  <rect x='29' y='24' width='6' height='4' fill='#d97706'/>
  <rect x='18' y='36' width='28' height='16' fill='#6b4f2b'/>
  <rect x='22' y='52' width='8' height='6' fill='#a16207'/>
  <rect x='34' y='52' width='8' height='6' fill='#a16207'/>
</svg>`);
}
function foxSprite(){
  return px(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' shape-rendering='crispEdges'>
  <rect width='64' height='64' fill='#13223f'/>
  <rect x='14' y='24' width='36' height='22' fill='#ef6c00'/>
  <rect x='14' y='16' width='10' height='10' fill='#ef6c00'/>
  <rect x='40' y='16' width='10' height='10' fill='#ef6c00'/>
  <rect x='20' y='28' width='10' height='6' fill='#fff'/>
  <rect x='34' y='28' width='10' height='6' fill='#fff'/>
  <rect x='28' y='36' width='8' height='4' fill='#000'/>
  <rect x='46' y='40' width='12' height='6' fill='#f59e0b'/>
</svg>`);
}
function stagSprite(){
  return px(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' shape-rendering='crispEdges'>
  <rect width='64' height='64' fill='#13223f'/>
  <rect x='18' y='22' width='28' height='22' fill='#8b5e34'/>
  <rect x='12' y='12' width='8' height='8' fill='#c8b27a'/>
  <rect x='44' y='12' width='8' height='8' fill='#c8b27a'/>
  <rect x='24' y='28' width='6' height='6' fill='#000'/>
  <rect x='34' y='28' width='6' height='6' fill='#000'/>
  <rect x='30' y='36' width='6' height='4' fill='#6b3f25'/>
  <rect x='22' y='44' width='6' height='10' fill='#6b4f2b'/>
  <rect x='36' y='44' width='6' height='10' fill='#6b4f2b'/>
</svg>`);
}
function raccoonSprite(){
  return px(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' shape-rendering='crispEdges'>
  <rect width='64' height='64' fill='#13223f'/>
  <rect x='16' y='24' width='32' height='22' fill='#6b7280'/>
  <rect x='16' y='18' width='10' height='8' fill='#6b7280'/>
  <rect x='38' y='18' width='10' height='8' fill='#6b7280'/>
  <rect x='20' y='30' width='24' height='6' fill='#111827'/>
  <rect x='22' y='30' width='6' height='6' fill='#fff'/>
  <rect x='36' y='30' width='6' height='6' fill='#fff'/>
  <rect x='46' y='42' width='12' height='6' fill='#4b5563'/>
</svg>`);
}

// ============ SFX (tiny base64 WAVs) ============
function primeSfx(){
  // Three small, different "chiptune-ish" clicks/pops for variety
  const clips = [
    // short blip
    'data:audio/wav;base64,UklGRngAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABYAAAAAAACAgICAgP//AACAgICA',
    // pop
    'data:audio/wav;base64,UklGRkQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABYAAAAAAACAgP//AACAgICA',
    // click
    'data:audio/wav;base64,UklGRFQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABYAAAAAAACAAAABAQEA'
  ];
  sfxEls.forEach((a,i)=>{ a.src = clips[i % clips.length]; a.volume = 0.6; });
}
function playRandomSfx(){
  const a = sfxEls[Math.floor(Math.random()*sfxEls.length)];
  if (!a) return;
  try { a.currentTime = 0; a.play(); } catch(e){}
}
