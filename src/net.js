// 네트워크 전송 계층: PeerJS(WebRTC 데이터 채널)로 방장 1명과 참가자 최대 3명을 잇는다.
//  - 방 코드는 숫자 5자리. 방장의 peer id는 'yardzero-' + 코드이고 참가자는 그 id로 연결한다
//  - 채널 2개: 사건용(순서와 재전송 보장, PeerJS 기본 채널)과 상태용(순서·재전송 없음, 같은 연결 위에 직접 여는 RTCDataChannel)
//  - 처음 서로를 찾는 중개만 PeerJS 공개 서버를 쓰고, 게임 데이터는 폰끼리 직접 오간다. 직접 연결이 안 되면 PeerJS 기본 설정의 중계(TURN)를 거친다
import { Peer } from 'peerjs';

const PREFIX = 'yardzero-';
export const MAX_GUESTS = 3;
// role: '' | 'host' | 'guest'. links: 연결된 상대(방장에게는 참가자들, 참가자에게는 방장 하나)
// cb: open(code) 방이 열림 / join(link) 상대와 연결됨 / leave(link, why) 끊김 / ev(link, msg) 사건 / st(link, arr) 상태 / error(kind, detail) / info() 핑·경로 갱신
export const NET = { role: '', code: '', peer: null, links: [], cb: {}, timer: 0, tries: 0, joinTimer: 0 };

const now = () => performance.now();
const peerOpts = () => Object.assign({ debug: 0 }, window.__yzPeer || {}); // 테스트에서는 window.__yzPeer로 로컬 중개 서버를 가리킨다
const call = (name, a, b) => { const f = NET.cb[name]; if (f) { try { f(a, b); } catch (e) { console.error(e); } } };
const ERR = { 'peer-unavailable': 'noroom', 'unavailable-id': 'taken', network: 'broker', 'server-error': 'broker', 'socket-error': 'broker', 'socket-closed': 'broker', 'browser-incompatible': 'browser', 'ssl-unavailable': 'broker', webrtc: 'webrtc', 'invalid-id': 'broker', 'invalid-key': 'broker' };

function attachU(link, ch) {
  ch.onopen = () => { link.u = ch; };
  if (ch.readyState === 'open') link.u = ch;
  ch.onclose = () => { if (link.u === ch) link.u = null; };
  ch.onmessage = (e) => {
    link.rx = now();
    let m;
    try { m = JSON.parse(e.data); } catch (err) { return; }
    call('st', link, m);
  };
}

function mkLink(conn, originator) {
  const link = { id: conn.peer, conn, u: null, open: false, ping: -1, route: '', rx: now(), born: now(), pid: -1, routeT: 0 };
  const pc = conn.peerConnection;
  if (pc && !originator) { // 상대가 여는 상태 채널을 받는다. PeerJS가 걸어 둔 처리기는 첫 채널에만 필요하므로 감싸서 넘긴다
    const orig = pc.ondatachannel;
    pc.ondatachannel = (e) => { if (e.channel.label === 'yz-st') attachU(link, e.channel); else if (orig) orig.call(pc, e); };
  }
  conn.on('open', () => {
    link.open = true;
    link.rx = now();
    if (originator) {
      try { attachU(link, conn.peerConnection.createDataChannel('yz-st', { ordered: false, maxRetransmits: 0 })); } catch (e) { /* 상태 채널을 못 열면 사건 채널로 보낸다 */ }
    }
    if (NET.role === 'host' && NET.links.filter((l) => l.open).length > MAX_GUESTS) { // 정원 초과
      try { conn.send({ t: 'full' }); } catch (e) { /* 무시 */ }
      setTimeout(() => drop(link, 'full'), 400);
      return;
    }
    clearTimeout(NET.joinTimer);
    call('join', link);
  });
  conn.on('data', (m) => {
    link.rx = now();
    if (!m || typeof m !== 'object') return;
    if (m.t === 'pi') { try { conn.send({ t: 'po', n: m.n }); } catch (e) { /* 무시 */ } return; }
    if (m.t === 'po') { const rtt = now() - m.n; link.ping = link.ping < 0 ? rtt : link.ping * 0.7 + rtt * 0.3; return; }
    if (m.t === '~') { call('st', link, m.d); return; }
    call('ev', link, m);
  });
  conn.on('close', () => drop(link, 'closed'));
  conn.on('error', () => drop(link, 'error'));
  NET.links.push(link);
  return link;
}

function drop(link, why) {
  const i = NET.links.indexOf(link);
  if (i < 0) return;
  NET.links.splice(i, 1);
  const was = link.open;
  link.open = false;
  try { link.conn.close(); } catch (e) { /* 이미 닫힘 */ }
  if (was || NET.role === 'guest') call('leave', link, why);
}

async function detectRoute(link) {
  try {
    const st = await link.conn.peerConnection.getStats(), by = {};
    let pair = null;
    st.forEach((r) => { by[r.id] = r; });
    st.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = by[r.selectedCandidatePairId]; });
    if (!pair) st.forEach((r) => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
    if (!pair) return;
    const l = by[pair.localCandidateId], r = by[pair.remoteCandidateId];
    link.route = (l && l.candidateType === 'relay') || (r && r.candidateType === 'relay') ? 'relay' : 'direct';
  } catch (e) { /* 통계를 못 읽으면 표시만 비운다 */ }
}

function tick() {
  const t = now();
  for (const link of NET.links.slice()) {
    if (!link.open) { if (t - link.born > 20000) drop(link, 'timeout'); continue; }
    try { link.conn.send({ t: 'pi', n: t }); } catch (e) { /* 무시 */ }
    if (t - link.rx > 9000) { drop(link, 'timeout'); continue; }
    if (t - link.routeT > (link.route ? 10000 : 1500)) { link.routeT = t; detectRoute(link); }
  }
  call('info');
}

function start(role) {
  NET.role = role;
  clearInterval(NET.timer);
  NET.timer = setInterval(tick, 1000);
}

function onPeerError(e) {
  const kind = ERR[e && e.type] || 'unknown';
  if (NET.role === 'host' && kind === 'taken' && !NET.code && NET.tries < 6) { openRoom(); return; } // 코드가 겹치면 다른 코드로
  // 방이 이미 열렸거나 상대와 이어진 뒤에는 중개 서버 문제로 끊지 않는다(게임 데이터는 중개 서버를 거치지 않는다)
  if ((kind === 'broker' || kind === 'taken') && ((NET.role === 'host' && NET.code) || NET.links.some((l) => l.open))) return;
  if (kind === 'webrtc' && NET.links.some((l) => l.open)) return; // 이미 이어진 상대가 있으면 개별 오류는 넘긴다
  call('error', kind, e && e.type);
}

function openRoom() {
  NET.tries++;
  if (NET.peer) { try { NET.peer.destroy(); } catch (e) { /* 무시 */ } }
  const code = String(10000 + Math.floor(Math.random() * 90000));
  const peer = (NET.peer = new Peer(PREFIX + code, peerOpts()));
  peer.on('open', () => { if (NET.peer !== peer) return; NET.code = code; call('open', code); });
  peer.on('connection', (conn) => { if (NET.peer === peer) mkLink(conn, false); });
  // 중개 서버와 끊기면 조금 뒤 같은 코드로 다시 붙는다(새 참가자가 들어올 수 있게)
  peer.on('disconnected', () => { setTimeout(() => { if (NET.peer === peer && !peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch (e) { /* 다음에 다시 */ } } }, 2500); });
  peer.on('error', (e) => { if (NET.peer === peer) onPeerError(e); });
}

export function host() {
  close();
  start('host');
  NET.tries = 0;
  openRoom();
}

export function join(code) {
  close();
  start('guest');
  NET.code = code;
  const peer = (NET.peer = new Peer(peerOpts()));
  peer.on('open', () => {
    if (NET.peer !== peer) return;
    mkLink(peer.connect(PREFIX + code, { label: 'ev', reliable: true, serialization: 'json' }), true);
  });
  peer.on('error', (e) => { if (NET.peer === peer) onPeerError(e); });
  clearTimeout(NET.joinTimer);
  NET.joinTimer = setTimeout(() => { if (NET.peer === peer && !NET.links.some((l) => l.open)) call('error', 'timeout'); }, 15000);
}

// 사건: 순서와 도착이 보장된다. link를 주지 않으면 연결된 모두에게
export function sendEv(msg, link) {
  for (const l of link ? [link] : NET.links) {
    if (!l.open) continue;
    try { l.conn.send(msg); } catch (e) { /* 끊기는 중 */ }
  }
}
// 상태: 자주 보내고 늦게 온 것은 버려도 되는 값. 상태 채널이 없으면 사건 채널로 보낸다
export function sendSt(arr, link) {
  let s = null;
  for (const l of link ? [link] : NET.links) {
    if (!l.open) continue;
    try {
      if (l.u && l.u.readyState === 'open') { if (l.u.bufferedAmount < 65536) l.u.send(s || (s = JSON.stringify(arr))); }
      else l.conn.send({ t: '~', d: arr });
    } catch (e) { /* 끊기는 중 */ }
  }
}

export function close() {
  clearInterval(NET.timer);
  clearTimeout(NET.joinTimer);
  const peer = NET.peer;
  NET.peer = null;
  NET.role = '';
  NET.code = '';
  NET.links.length = 0;
  if (peer) { try { peer.destroy(); } catch (e) { /* 무시 */ } }
}
