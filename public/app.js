'use strict';
// NUC Control front end: one file, no build step. Views render into #view; buttons use data-act (no inline handlers: CSP).

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const store = {
	get(k, d) { try { const v = localStorage.getItem('nc.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
	set(k, v) { try { localStorage.setItem('nc.' + k, JSON.stringify(v)); } catch {} },
};
const BOXES = [['server1', 'server1'], ['distiller', 'Distiller']];
const boxLabel = (id) => (id === 'distiller' ? 'Distiller' : id);

const fmt = {
	bytes(n) {
		if (n == null || isNaN(n)) return '–';
		const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
		while (Math.abs(n) >= 1000 && i < 4) { n /= 1000; i++; }
		return (n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
	},
	dur(sec) {
		if (sec == null) return '–';
		const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
		return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m` : `${Math.round(sec)}s`;
	},
	ago(ms) {
		if (!ms) return '–';
		const s = (Date.now() - ms) / 1000;
		return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
	},
	usd(n) { return n == null ? '–' : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`; },
	mhz(khz) { return khz ? (khz >= 1e6 ? `${(khz / 1e6).toFixed(khz % 1e5 ? 2 : 1)} GHz` : `${Math.round(khz / 1000)} MHz`) : '–'; },
	date(ms) { return new Date(ms).toLocaleString([], {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}); },
};

// ---------------------------------------------------------------- icons

const IC = {
	server: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>',
	chip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>',
	bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
	box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>',
	chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
	broom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16M6 16l2-9h8l2 9M10 7V3h4v4"/></svg>',
	sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
	signal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
	gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/></svg>',
	disk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
	key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14 9l2 2"/></svg>',
	pulse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"/><path d="M12 7v5l3 2"/></svg>',
	gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
	fan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-7 4-7s3 4 0 6l-2 1.5M14 12c4 0 7 1 7 4s-4 3-6 0l-1.5-2M12 14c0 4-1 7-4 7s-3-4 0-6l2-1.5M10 12c-4 0-7-1-7-4s4-3 6 0l1.5 2"/></svg>',
	ram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 17v3M10 17v3M14 17v3M18 17v3M6 10v4M10 10v4M14 10v4M18 10v4"/></svg>',
	power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0"/></svg>',
	refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5"/></svg>',
	stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
	play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
	logs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
	send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
	plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
	down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M6 11l6 6 6-6M5 20h14"/></svg>',
	trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};

// ---------------------------------------------------------------- logos

let LOGOS = {};
const EXTRA = {
	microsoft: {hex: '#00A4EF', d: 'M0 0h11.377v11.372H0zm12.623 0H24v11.372H12.623zM0 12.623h11.377V24H0zm12.623 0H24V24H12.623z'},
	ibm: {hex: '#4589FF', mono: 'IBM'}, tinyllama: {hex: '#C08CFF', mono: 'TL'}, moondream: {hex: '#A0A8B8', mono: 'MD'},
	nomic: {hex: '#D9DCE3', mono: 'N'}, openai: {hex: '#10A37F', mono: 'AI'}, codex: {hex: '#10A37F', mono: '>_'}, nucaloric: {hex: '#8b7cff', mono: 'N'},
};
function brandOf(name) {
	const n = String(name).toLowerCase();
	const rules = [[/^nucaloric/, 'nucaloric'], [/^(qwen|qwq)/, 'qwen'], [/^tinyllama/, 'tinyllama'], [/^(llama|codellama)/, 'meta'], [/gemma/, 'gemma'],
		[/^phi/, 'microsoft'], [/^deepseek/, 'deepseek'], [/^(mistral|ministral|mixtral|codestral|devstral)/, 'mistral'], [/^granite/, 'ibm'],
		[/^exaone/, 'lg'], [/^nemotron/, 'nvidia'], [/^smollm/, 'huggingface'], [/^moondream/, 'moondream'], [/^nomic/, 'nomic'], [/^gpt-oss/, 'openai']];
	return (rules.find(([re]) => re.test(n)) || [0, 'ollama'])[1];
}
function lum(hex) {
	const c = hex.replace('#', '').match(/../g).map((x) => { const v = parseInt(x, 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
	return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const hexA = (hex, a) => { const [r, g, b] = hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16)); return `rgba(${r},${g},${b},${a})`; };
function logo(brand, sm) {
	const L = LOGOS[brand] || EXTRA[brand] || LOGOS.ollama || {mono: '?', hex: '#888888'};
	const hex = L.hex || '#888888', dark = lum(hex) < 0.12;
	const fg = dark ? '#fff' : hex, bg = dark ? (lum(hex) < 0.02 ? '#2a2a36' : hex) : hexA(hex, 0.15);
	const inner = L.d ? `<svg viewBox="0 0 24 24" fill="${fg}"><path d="${L.d}"/></svg>` : esc(L.mono);
	return `<span class="logo${sm ? ' sm' : ''}" style="background:${bg};color:${fg}">${inner}</span>`;
}

// ---------------------------------------------------------------- api, toast, sheet

async function api(path, body, method) {
	const r = await fetch('/api' + path, {method: method || (body ? 'POST' : 'GET'), headers: {'content-type': 'application/json', 'x-nuc': '1'},
		body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin'});
	if (r.status === 401 && path !== '/login' && path !== '/password') { showLogin(); throw new Error('Signed out'); }
	const j = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error(j.error || `${r.status} ${r.statusText}`);
	return j;
}
let toastT;
function toast(msg, bad) {
	const t = $('#toast');
	t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
	clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, bad ? 4200 : 2600);
}
const busy = async (el, fn) => {
	if (el) { el.disabled = true; el.dataset.label = el.innerHTML; el.innerHTML = '<span class="spin"></span>'; }
	try { return await fn(); } catch (e) { toast(e.message, true); } finally { if (el) { el.disabled = false; el.innerHTML = el.dataset.label; } }
};
function openSheet(html) { $('#sheet-body').innerHTML = html; $('#sheet').classList.add('open'); return $('#sheet-body'); }
function closeSheet() { $('#sheet').classList.remove('open'); $('#sheet-body').innerHTML = ''; }
$('#sheet .scrim').addEventListener('click', closeSheet);
function confirmSheet({title, text, ok = 'Confirm', danger, typed}) {
	return new Promise((resolve) => {
		const el = openSheet(`<h3>${esc(title)}</h3><p class="dim">${text || ''}</p>
			${typed ? `<label class="field"><span>Type <b>${esc(typed)}</b> to confirm</span><input class="in" id="cf-in" autocomplete="off" autocapitalize="off"></label>` : ''}
			<div class="grid2" style="margin-top:14px"><button class="btn block" id="cf-no">Cancel</button><button class="btn block ${danger ? 'danger' : 'pri'}" id="cf-ok" ${typed ? 'disabled' : ''}>${esc(ok)}</button></div>`);
		const done = (v) => { closeSheet(); resolve(v); };
		$('#cf-no', el).onclick = () => done(false);
		$('#cf-ok', el).onclick = () => done(typed ? $('#cf-in', el).value.trim() : true);
		if (typed) $('#cf-in', el).oninput = (e) => { $('#cf-ok', el).disabled = e.target.value.trim() !== typed; };
	});
}

// ---------------------------------------------------------------- shared bits

function ring(pct, color) {
	const r = 26, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, (pct || 0) / 100));
	return `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--line)" stroke-width="6"/>
		<circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/></svg>`;
}
const level = (pct, warn = 70, bad = 88) => (pct >= bad ? 'var(--bad)' : pct >= warn ? 'var(--warn)' : 'var(--brand)');
function spark(hist) {
	if (!hist || hist.length < 2) return '';
	const w = 300, h = 38, n = hist.length;
	const pts = hist.map((x, i) => `${(i / (n - 1) * w).toFixed(1)},${(h - 2 - (x[1] || 0) / 100 * (h - 4)).toFixed(1)}`);
	return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8b7cff" stop-opacity=".35"/><stop offset="1" stop-color="#8b7cff" stop-opacity="0"/></linearGradient></defs>
		<polygon points="0,${h} ${pts.join(' ')} ${w},${h}" fill="url(#sg)"/><polyline points="${pts.join(' ')}" fill="none" stroke="#8b7cff" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}
const memPct = (m) => (m ? (1 - m.avail / m.total) * 100 : 0);
const rootDisk = (s) => s?.disks?.find((d) => d.mount === '/');
const segHtml = (id, opts, on) => `<div class="seg" id="${id}">${opts.map(([v, l]) => `<button data-v="${esc(v)}" class="${String(v) === String(on) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
function segBind(root, id, fn) {
	const el = $('#' + id, root); if (!el) return;
	el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $$('button', el).forEach((x) => x.classList.toggle('on', x === b)); fn(b.dataset.v, b); });
}
const segVal = (root, id) => $(`#${id} button.on`, root)?.dataset.v;
function stripHtml(strip) {
	return `<div class="strip">${strip.map((v) => `<i class="${v == null ? 'n' : v >= 0.999 ? '' : v > 0.5 ? 'p' : 'd'}" title="${v == null ? 'no data' : Math.round(v * 100) + '%'}"></i>`).join('')}</div>`;
}

// ---------------------------------------------------------------- router

const S = {box: store.get('box', 'server1'), seq: 0, timers: [], models: null};
const TOP = ['home', 'control', 'models', 'chat', 'more'];
const TITLES = {home: 'NUC Control', control: 'Control', models: 'Models', chat: 'Chat', more: 'More', bench: 'Benchmarks', storage: 'Storage',
	keys: 'Claude & Codex', calls: 'Calls', uptime: 'Uptime', settings: 'Settings'};
const every = (ms, fn) => S.timers.push(setInterval(fn, ms));

async function go() {
	const name = (location.hash.slice(1) || 'home').split('/')[0];
	const view = VIEWS[name] ? name : 'home';
	S.timers.forEach(clearInterval); S.timers = [];
	if (S.chatAbort && view !== 'chat') { S.chatAbort.abort(); S.chatAbort = null; }
	const seq = ++S.seq;
	$$('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (TOP.includes(view) ? view : 'more')));
	$('#back').classList.toggle('hidden', TOP.includes(view));
	$('#title').textContent = TITLES[view];
	$('#head-pill').innerHTML = '';
	document.body.dataset.view = view;
	const el = $('#view');
	el.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
	window.scrollTo(0, 0);
	try { await VIEWS[view](el, () => seq === S.seq); } catch (e) { if (seq === S.seq) el.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; }
	jobsTick();
}
window.addEventListener('hashchange', go);
$('#back').onclick = () => { history.length > 1 ? history.back() : (location.hash = '#more'); };

// global click delegation for data-act buttons
const ACT = {};
document.addEventListener('click', (e) => {
	const el = e.target.closest('[data-act]');
	if (!el || el.disabled) return;
	e.preventDefault();
	ACT[el.dataset.act]?.(el.dataset, el);
});

// ---------------------------------------------------------------- background jobs (pulls, benchmarks, storage)

const seenJobs = {};
let jobsTimer = null;
async function jobsTick() {
	clearTimeout(jobsTimer);
	let list = [];
	try { list = (await api('/jobs')).jobs; } catch { jobsTimer = setTimeout(jobsTick, 15000); return; }
	for (const j of list) {
		const prev = seenJobs[j.id];
		if (prev === 'running' && j.state !== 'running') {
			toast(j.state === 'done' ? `${j.title} · ${boxLabel(j.box)} done` : `${j.title} failed: ${j.error}`, j.state !== 'done');
			if (j.kind === 'pull' || j.kind === 'storage') S.models = null;
			document.dispatchEvent(new CustomEvent('jobdone', {detail: j}));
		}
		seenJobs[j.id] = j.state;
	}
	const running = list.filter((j) => j.state === 'running');
	const pill = $('#head-pill');
	if (running.length) pill.innerHTML = `<button class="pill" data-act="jobs"><span class="spin"></span>${running.length} running</button>`;
	else if (pill.querySelector('[data-act=jobs]')) pill.innerHTML = '';
	S.jobs = list;
	jobsTimer = setTimeout(jobsTick, running.length ? 2000 : 12000);
}
const jobHtml = (j) => `<div class="job"><div class="row between"><div class="grow"><div class="t ellipsis">${esc(j.title)}</div>
	<div class="xs">${esc(boxLabel(j.box))} · ${j.state === 'error' ? `<span class="bad">${esc(j.error)}</span>` : esc(j.status)}${j.bytes ? ` · ${fmt.bytes(j.bytes[0])} of ${fmt.bytes(j.bytes[1])}` : ''}</div></div>
	<span class="tag ${j.state === 'done' ? 'ok' : j.state === 'error' ? 'bad' : 'brand'}">${j.state === 'running' ? (j.progress != null ? Math.round(j.progress * 100) + '%' : '…') : j.state}</span></div>
	${j.state === 'running' ? `<div class="bar thin"><i style="width:${Math.max(3, (j.progress || 0) * 100)}%"></i></div>` : ''}</div>`;
ACT.jobs = () => openSheet(`<h3>Background work</h3><p class="dim">Installs and benchmarks keep running if you close the app.</p>${(S.jobs || []).slice(0, 20).map(jobHtml).join('') || '<p class="dim">Nothing yet.</p>'}`);

// ---------------------------------------------------------------- HOME

function boxCard(b) {
	const s = b.stats;
	if (!s) return `<div class="card"><div class="box-head"><div class="box-ic">${IC.server}</div><div class="grow"><div class="box-name">${esc(b.label)}</div><div class="s">${esc(b.hw)}</div></div><span class="pill bad"><span class="dot bad"></span>Offline</span></div><div class="note warn">${esc(b.err || 'No data yet')}</div></div>`;
	const mp = memPct(s.mem), tp = s.tempC ? s.tempC / 90 * 100 : 0, d = rootDisk(s);
	const chips = [
		s.mhz && `<span class="chip"><b>${s.mhz >= 1000 ? (s.mhz / 1000).toFixed(2) + ' GHz' : s.mhz + ' MHz'}</b> clock</span>`,
		s.fan && (s.fan.control === 'bios' ? '<span class="chip">Fan <b>BIOS</b></span>' : `<span class="chip">Fan <b>${s.fan.rpm?.toLocaleString() ?? '–'}</b> rpm</span>`),
		s.gpu && `<span class="chip">iGPU <b>${Math.round(s.gpu.tempC)}°</b> ${s.gpu.mhz} MHz</span>`,
		s.battery && `<span class="chip">Battery <b>${s.battery.pct}%</b> ${esc((s.battery.status || '').toLowerCase())}</span>`,
		d && `<span class="chip"><b>${fmt.bytes(d.free)}</b> free</span>`,
		`<span class="chip">Load <b>${s.load[0].toFixed(2)}</b></span>`,
	].filter(Boolean).join('');
	return `<div class="card"><div class="box-head"><div class="box-ic">${IC.server}</div><div class="grow"><div class="box-name">${esc(b.label)}</div><div class="s ellipsis">${esc(b.hw)}</div></div>
		<span class="pill ${b.up ? 'ok' : 'warn'}"><span class="dot ${b.up ? 'ok' : 'warn'}"></span>${b.up ? 'Up ' + fmt.dur(s.uptimeSec) : 'Stale'}</span></div>
		<div class="gauges"><div class="gauge">${ring(s.cpu, level(s.cpu))}<div class="v">${Math.round(s.cpu)}%</div><div class="l">CPU</div></div>
		<div class="gauge">${ring(mp, level(mp, 80, 92))}<div class="v">${Math.round(mp)}%</div><div class="l">RAM ${fmt.bytes(s.mem.total - s.mem.avail)}</div></div>
		<div class="gauge">${ring(tp, level(s.tempC || 0, 65, 78))}<div class="v">${s.tempC ? Math.round(s.tempC) + '°' : '–'}</div><div class="l">Temp</div></div></div>
		${spark(b.hist)}<div class="chips">${chips}</div></div>`;
}

async function home(el, alive) {
	const draw = async () => {
		const o = await api('/overview');
		if (!alive()) return;
		const checks = Object.values(o.uptime), down = checks.filter((c) => c.up === false);
		if (!$('#head-pill [data-act=jobs]')) $('#head-pill').innerHTML = down.length ? `<a class="pill bad" href="#uptime"><span class="dot bad"></span>${down.length} down</a>` : '<a class="pill ok" href="#uptime"><span class="dot ok"></span>All up</a>';
		const c = o.calls;
		el.innerHTML = `${Object.values(o.boxes).map(boxCard).join('')}
		<div class="sec"><h2>Quick actions</h2></div>
		<div class="qa">
			<button data-act="suite"><span class="ic">${IC.gauge}</span>Benchmark</button>
			<button data-act="nav" data-to="models"><span class="ic">${IC.down}</span>Install model</button>
			<button data-act="nav" data-to="chat"><span class="ic">${IC.chat}</span>Chat</button>
			<button data-act="freeram"><span class="ic">${IC.ram}</span>Free RAM</button>
			<button data-act="nav" data-to="control"><span class="ic">${IC.sliders}</span>Services</button>
			<button data-act="nav" data-to="calls"><span class="ic">${IC.signal}</span>Calls</button>
		</div>
		${o.jobs.length ? `<div class="sec"><h2>Working on</h2></div>${o.jobs.map(jobHtml).join('')}` : ''}
		${c ? `<div class="sec"><h2>Calls bot</h2><a class="act" href="#calls">Open</a></div>
		<a class="card" href="#calls" style="display:block;color:inherit"><div class="row between"><div class="row"><span class="dot ${c.ready ? 'ok' : 'bad'}"></span><b>${c.ready ? 'Live' : 'Down'}</b>
			<span class="dim">· watching ${c.watching ?? '–'} coins · watchdog ${esc(c.watchdog || '–')}</span></div></div>
			<div class="grid3" style="margin-top:12px"><div><div class="big-n">${c.today ?? '–'}</div><div class="xs">calls today</div></div>
			<div><div class="big-n">${c.scalp ? Math.round(c.scalp.rate * 100) + '%' : '–'}</div><div class="xs">hit ${c.scalp?.target ?? 1.5}x today</div></div>
			<div><div class="big-n ellipsis">${c.last ? '$' + esc(c.last.symbol) : '–'}</div><div class="xs">${c.last ? fmt.ago(c.last.at) : 'last call'}</div></div></div></a>` : ''}
		<div class="sec"><h2>Uptime · 24 h</h2><a class="act" href="#uptime">Details</a></div>
		<div class="card flat list">${Object.entries(o.uptime).map(([k, u]) => `<div><div class="row between"><div class="row"><span class="dot ${u.up ? 'ok' : u.up === false ? 'bad' : ''}"></span><span class="t">${esc(u.label)}</span></div>
			<span class="s mono">${u.pct24h != null ? u.pct24h + '%' : '–'}</span></div>${stripHtml(u.strip)}</div>`).join('')}</div>
		${o.events.length ? `<div class="sec"><h2>Recent events</h2></div><div class="card flat list">${o.events.slice(0, 6).map((e) => `<div class="row"><span class="dot ${e.up ? 'ok' : 'bad'}"></span><div class="grow"><b>${esc(e.label)}</b> ${e.up ? 'came back' : 'went down'}</div><span class="xs">${fmt.ago(e.t)}</span></div>`).join('')}</div>` : ''}`;
	};
	await draw();
	every(5000, () => draw().catch(() => {}));
}
ACT.nav = (d) => { location.hash = '#' + d.to; };
ACT.suite = async () => {
	if (!(await confirmSheet({title: 'Run the full benchmark?', text: 'CPU, disk and AI speed (qwen2.5:1.5b) on both servers. Takes about 2 minutes; the AI test briefly slows site AI on each box.', ok: 'Run it'}))) return;
	try { await api('/bench/suite', {}); toast('Benchmark started'); location.hash = '#bench'; } catch (e) { toast(e.message, true); }
};
ACT.freeram = async () => {
	if (!(await confirmSheet({title: 'Free RAM on both servers?', text: 'Unloads AI models from memory and drops the file cache. Models reload on the next request (a few seconds).', ok: 'Free RAM'}))) return;
	const out = [];
	for (const [id] of BOXES) {
		try { const u = await api('/models/unload', {box: id}); const d = await api(`/box/${id}/mem`, {op: 'dropcaches'}); out.push(`${boxLabel(id)}: ${fmt.bytes(d.freed)}${u.unloaded.length ? `, ${u.unloaded.length} model unloaded` : ''}`); }
		catch (e) { out.push(`${boxLabel(id)}: ${e.message}`); }
	}
	toast(out.join(' · '));
};

// ---------------------------------------------------------------- CONTROL

async function control(el, alive) {
	const id = S.box;
	el.innerHTML = `${segHtml('c-box', BOXES, id).replace('class="seg"', 'class="seg big"')}<div id="c-body" style="margin-top:14px"><div class="skeleton"></div></div>`;
	segBind(el, 'c-box', (v) => { S.box = v; store.set('box', v); go(); });
	const [info, svc] = await Promise.all([api(`/box/${id}/info`), api(`/box/${id}/services`).catch((e) => ({error: e.message}))]);
	if (!alive()) return;
	const s = info.stats || {}, pol = info.policy || {}, pi = id === 'distiller';
	const body = $('#c-body', el);
	const env = info.ollamaEnv || {};
	const sel = (key, opts) => `<select class="in" data-oenv="${key}">${opts.map((o) => `<option value="${o[0]}" ${String(env[key]) === String(o[0]) ? 'selected' : ''}>${o[1]}</option>`).join('')}${opts.some((o) => String(o[0]) === String(env[key])) ? '' : `<option selected value="${esc(env[key] ?? '')}">${esc(env[key] ?? 'default')}</option>`}</select>`;
	body.innerHTML = `
	<div class="card"><div class="kv"><span>Hardware</span><span>${esc(info.cpuModel || '')}</span><span>System</span><span>${esc(info.os || '')} · ${esc(info.kernel)}</span>
		<span>Live</span><span id="c-live" class="mono"></span></div></div>

	<div class="sec"><h2>Services</h2><button class="act" data-act="c-svc-refresh">Refresh</button></div>
	<div class="card flat list" id="c-svc"></div>

	<div class="sec"><h2>${pi ? 'Clock speed' : 'Performance & overclock'}</h2></div>
	${pi ? `<div class="card">
		<div class="row between"><div><div class="t">Live clock cap</div><div class="s">Instant, no reboot. Highest clock the CPU may use.</div></div><span class="big-n" id="cap-v">${fmt.mhz(info.capKhz)}</span></div>
		<input type="range" id="cap" min="600" max="${+(info.config?.arm_freq || 2000)}" step="100" value="${Math.round((info.capKhz || 2000000) / 1000)}">
		<button class="btn pri block" data-act="cap">Apply clock cap</button>
	</div>
	<div class="card"><div class="t">Boot clock (overclock)</div><div class="s">Written to config.txt, used after a reboot. Stock Pamir is 1.5 GHz; 2.0 GHz held 17 min of AI load at 64 °C.</div>
		<div style="margin:12px 0">${segHtml('boot', [[1500, '1.5'], [1800, '1.8'], [2000, '2.0'], [2200, '2.2'], [2400, '2.4']], info.config?.arm_freq)}</div>
		<div class="note warn">2.4 GHz cut power three times on the current supply. Use 2.2+ only on a proper USB-C charger.</div>
		<div class="grid2"><button class="btn block" data-act="bootclock">Save boot clock</button><button class="btn block danger" data-act="reboot">Reboot now</button></div>
		<div class="xs" style="margin-top:8px">Throttle flags: <span class="mono">${esc(s.throttled || '–')}</span> ${s.throttled === '0x0' ? '<span class="ok">· no throttling</span>' : ''}</div>
	</div>` : `<div class="card"><div class="t">Power profile</div><div class="s">Fan speed on this HP is BIOS-only, so heat and noise are set here through the clock.</div>
		<div style="margin:12px 0">${segHtml('prof', [['quiet', 'Quiet'], ['balanced', 'Balanced'], ['performance', 'Performance']], info.cpuPanel?.profile || (pol.governor === 'performance' ? 'performance' : ''))}</div>
		<details><summary class="s" style="cursor:pointer">Advanced</summary><div style="margin-top:12px">
			<label class="field"><span>Governor</span><select class="in" id="gov">${(pol.governors || []).map((g) => `<option ${g === pol.governor ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
			<label class="field"><span>Max clock</span><select class="in" id="maxf">${[...new Set([pol.hwMaxKhz, ...(pol.steps || [])])].filter(Boolean).sort((a, b) => b - a).map((k) => `<option value="${k}" ${k === pol.maxKhz ? 'selected' : ''}>${fmt.mhz(k)}</option>`).join('')}</select></label>
			<div class="row between check"><span>Turbo boost (3.5 GHz single-core)</span><label class="toggle"><input type="checkbox" id="boost" ${pol.boost ? 'checked' : ''}><i></i></label></div>
		</div></details>
	</div>
	<div class="card"><div class="row between"><div class="t">CPU overclock</div><span class="tag ${info.secureBoot ? 'warn' : 'ok'}">${info.secureBoot ? 'Locked' : 'Unlocked'}</span></div>
		${info.secureBoot ? '<div class="note warn">Secure Boot is on, so the kernel refuses the CPU register writes an overclock needs. At power-on press F10 → Advanced/Security → Secure Boot Configuration → disable. Then this unlocks.</div>'
			: '<div class="note">Secure Boot is off. Run <span class="mono">~/oc/oc-push.sh</span> (nuc menu → Servers) to step all cores from 3.1 to 3.8 GHz with stress checks; it stops at 80 °C and restores stock on errors.</div>'}
		<div class="xs">RAM is already at its chip max (DDR4-2400 CL17); matching 8 GB sticks would give full dual channel.</div>
	</div>
	${s.gpu ? `<div class="card"><div class="t">Radeon R7 iGPU (runs the AI via Vulkan)</div><div class="kv" style="margin-top:8px"><span>Clock</span><span id="g-mhz">${s.gpu.mhz} MHz</span><span>Temp</span><span id="g-t">${Math.round(s.gpu.tempC)} °C</span>
		<span>Shared memory</span><span>${fmt.bytes(s.gpu.gttUsed)} of ${fmt.bytes(s.gpu.gttTotal)}</span></div></div>` : ''}`}

	<div class="sec"><h2>Fan</h2></div>
	${pi ? `<div class="card"><div class="row between"><div><div class="t">Distiller fan</div><div class="s">nucaloric-hw follows this every few seconds.</div></div><div style="text-align:right"><div class="big-n" id="f-rpm">${s.fan?.rpm?.toLocaleString() ?? '–'}</div><div class="xs">rpm · <span id="f-pwm">${s.fan ? Math.round(s.fan.pwm / 2.55) : '–'}</span>%</div></div></div>
		<div style="margin:12px 0">${segHtml('fanp', [['auto', 'Auto'], ['quiet', 'Quiet'], ['performance', 'Strong'], ['max', 'Max']], info.fan?.preset || (info.fan?.boostMin === 255 ? 'max' : ''))}</div>
		<div class="row between"><span class="s">Or a fixed speed</span><span class="t" id="fix-v">${info.fan?.pct ?? 60}%</span></div>
		<input type="range" id="fix" min="0" max="100" step="5" value="${info.fan?.pct ?? 60}">
		<button class="btn block" data-act="fanfixed">Set fixed speed</button>
		<div class="xs" style="margin-top:8px">Fixed speeds still ramp to full above 60-70 °C.</div></div>`
	: `<div class="card"><div class="row between"><div class="t">HP system fan</div><span class="tag">BIOS</span></div><div class="note">This HP's firmware owns the fan; Linux writes are refused (tested). Pick a fan curve in BIOS (F10 → Advanced → Thermal → Fan idle mode). Here, the Quiet profile above cuts heat and so fan noise.</div>
		<div class="kv"><span>CPU</span><span id="f-cpu">${s.tempC ? Math.round(s.tempC) + ' °C' : '–'}</span>${s.gpu ? `<span>iGPU</span><span>${Math.round(s.gpu.tempC)} °C</span>` : ''}</div></div>`}

	<div class="sec"><h2>RAM</h2></div>
	<div class="card"><div class="row between"><div class="t">Memory</div><span class="s" id="m-txt"></span></div>
		<div class="bar" style="margin:10px 0 6px" id="m-bar"></div><div class="xs" id="m-leg"></div>
		<div class="row between" style="margin-top:12px"><div class="t">Swap</div><span class="s" id="sw-txt"></span></div><div class="bar thin" style="margin-top:8px" id="sw-bar"></div>
		<div class="grid2" style="margin-top:14px"><button class="btn" data-act="dropcaches">${IC.broom} Free cache</button><button class="btn" data-act="unload">${IC.box} Unload AI</button></div>
	</div>
	<div class="card"><div class="row between"><div><div class="t">Swappiness</div><div class="s">Low keeps apps in RAM, high swaps sooner.</div></div><span class="big-n" id="swp-v">${info.swappiness}</span></div>
		<input type="range" id="swp" min="0" max="100" step="5" value="${info.swappiness}"><button class="btn block" data-act="swappiness">Apply</button></div>
	<div class="card"><div class="t">AI memory (Ollama)</div><div class="s" style="margin-bottom:12px">Saving restarts Ollama on ${esc(boxLabel(id))} (a few seconds of AI downtime).</div>
		<label class="field"><span>Keep a model in RAM after use</span>${sel('OLLAMA_KEEP_ALIVE', [['30s', '30 seconds'], ['60s', '1 minute'], ['2m', '2 minutes'], ['5m', '5 minutes'], ['15m', '15 minutes'], ['1h', '1 hour'], ['-1', 'Forever']])}</label>
		<label class="field"><span>Models loaded at once</span>${sel('OLLAMA_MAX_LOADED_MODELS', [[1, '1'], [2, '2'], [3, '3']])}</label>
		<label class="field"><span>Parallel requests per model</span>${sel('OLLAMA_NUM_PARALLEL', [[1, '1'], [2, '2'], [3, '3'], [4, '4']])}</label>
		<label class="field"><span>Context length (tokens)</span>${sel('OLLAMA_CONTEXT_LENGTH', [[2048, '2K'], [4096, '4K'], [8192, '8K'], [16384, '16K'], [32768, '32K'], [65536, '64K']])}</label>
		<button class="btn pri block" data-act="oenv">Save AI memory settings</button></div>

	<div class="sec"><h2>Power</h2></div>
	<div class="card"><div class="row between"><div><div class="t">Reboot ${esc(boxLabel(id))}</div><div class="s">${id === 'server1' ? 'The website, Calls bot and this panel go offline for ~1 minute.' : 'Distiller AI goes offline for ~1 minute.'}</div></div><button class="btn danger" data-act="reboot">${IC.power} Reboot</button></div></div>`;

	const live = (st) => {
		if (!st) return;
		$('#c-live', el).textContent = `${Math.round(st.cpu)}% CPU · ${st.tempC ? Math.round(st.tempC) + '°C' : ''} · ${st.mhz ?? '–'} MHz · up ${fmt.dur(st.uptimeSec)}`;
		const m = st.mem, used = m.total - m.avail, cache = Math.min(m.cached, m.avail);
		$('#m-txt', el).textContent = `${fmt.bytes(used)} of ${fmt.bytes(m.total)}`;
		$('#m-bar', el).innerHTML = `<i style="width:${used / m.total * 100}%"></i><i class="c2" style="width:${cache / m.total * 100}%"></i>`;
		$('#m-leg', el).textContent = `${fmt.bytes(used)} used · ${fmt.bytes(cache)} cache (freeable) · ${fmt.bytes(m.avail - cache)} free`;
		const sw = m.swapTotal - m.swapFree;
		$('#sw-txt', el).textContent = `${fmt.bytes(sw)} of ${fmt.bytes(m.swapTotal)}`;
		$('#sw-bar', el).innerHTML = `<i class="${sw / m.swapTotal > 0.5 ? 'warn' : ''}" style="width:${m.swapTotal ? sw / m.swapTotal * 100 : 0}%"></i>`;
		if ($('#f-rpm', el) && st.fan) { $('#f-rpm', el).textContent = st.fan.rpm?.toLocaleString() ?? '–'; $('#f-pwm', el).textContent = Math.round(st.fan.pwm / 2.55); }
		if ($('#f-cpu', el)) $('#f-cpu', el).textContent = Math.round(st.tempC) + ' °C';
		if ($('#g-mhz', el) && st.gpu) { $('#g-mhz', el).textContent = st.gpu.mhz + ' MHz'; $('#g-t', el).textContent = Math.round(st.gpu.tempC) + ' °C'; }
	};
	const drawSvc = (r) => {
		$('#c-svc', el).innerHTML = r.error ? `<div class="note warn">${esc(r.error)}</div>` : r.services.map((x) => {
			const on = x.active === 'active', bad = x.active === 'failed';
			return `<div><div class="row"><span class="dot ${on ? 'ok' : bad ? 'bad' : ''}"></span><div class="grow"><div class="t ellipsis">${esc(x.unit)}</div>
				<div class="xs ellipsis">${on ? `up ${fmt.dur(x.upSec)}` : esc(x.sub || x.active)}${x.mem ? ` · ${fmt.bytes(x.mem)}` : ''}${x.restarts ? ` · ${x.restarts} restarts` : ''}</div></div>
				<button class="btn xs ghost" data-act="logs" data-unit="${esc(x.unit)}" aria-label="Logs">${IC.logs}</button>
				<button class="btn xs" data-act="svc" data-unit="${esc(x.unit)}" data-a="restart" aria-label="Restart">${IC.refresh}</button>
				${on ? (x.canStop ? `<button class="btn xs danger" data-act="svc" data-unit="${esc(x.unit)}" data-a="stop" aria-label="Stop">${IC.stop}</button>` : '')
					: `<button class="btn xs pri" data-act="svc" data-unit="${esc(x.unit)}" data-a="start" aria-label="Start">${IC.play}</button>`}</div></div>`;
		}).join('');
	};
	live(s); drawSvc(svc);
	S.drawSvc = async () => drawSvc(await api(`/box/${id}/services`).catch((e) => ({error: e.message})));
	$('#cap', el)?.addEventListener('input', (e) => { $('#cap-v', el).textContent = fmt.mhz(e.target.value * 1000); });
	$('#fix', el)?.addEventListener('input', (e) => { $('#fix-v', el).textContent = e.target.value + '%'; });
	$('#swp', el).addEventListener('input', (e) => { $('#swp-v', el).textContent = e.target.value; });
	segBind(el, 'prof', (v, b) => busy(null, async () => { await api(`/box/${id}/cpu`, {op: 'profile', value: v}); toast(`${b.textContent} profile on`); }));
	segBind(el, 'fanp', (v, b) => busy(null, async () => { await api(`/box/${id}/fan`, {preset: v}); toast(`Fan: ${b.textContent}`); }));
	$('#gov', el)?.addEventListener('change', (e) => busy(null, async () => { await api(`/box/${id}/cpu`, {op: 'governor', value: e.target.value}); toast('Governor ' + e.target.value); }));
	$('#maxf', el)?.addEventListener('change', (e) => busy(null, async () => { await api(`/box/${id}/cpu`, {op: 'maxfreq', value: e.target.value}); toast('Max clock ' + fmt.mhz(+e.target.value)); }));
	$('#boost', el)?.addEventListener('change', (e) => busy(null, async () => { await api(`/box/${id}/cpu`, {op: 'boost', value: e.target.checked ? 1 : 0}); toast('Turbo ' + (e.target.checked ? 'on' : 'off')); }));
	every(5000, async () => { try { const i = await api(`/box/${id}/info`); if (alive()) live(i.stats); } catch {} });
	every(15000, () => alive() && S.drawSvc());
}
ACT['c-svc-refresh'] = () => S.drawSvc?.();
ACT.svc = async (d, b) => {
	const box = S.box;
	if (d.a !== 'restart' || ['nucaloric-calls', 'nucaloric-platform', 'nuc-control', 'tailscaled', 'ollama'].includes(d.unit)) {
		const warn = {'nucaloric-platform': 'nucaloric.xyz goes offline until it is back.', 'nucaloric-calls': 'Calls stop posting while it is down.',
			'nuc-control': 'This panel reloads in a few seconds.', tailscaled: 'The public link drops for ~10 s.', ollama: 'AI requests on this box fail for a few seconds.'}[d.unit] || '';
		if (!(await confirmSheet({title: `${d.a[0].toUpperCase() + d.a.slice(1)} ${d.unit}?`, text: `On ${boxLabel(box)}. ${warn}`, ok: d.a[0].toUpperCase() + d.a.slice(1), danger: d.a === 'stop'}))) return;
	}
	await busy(b, async () => { const r = await api(`/box/${box}/svc`, {action: d.a, unit: d.unit}); toast(r.note || `${d.unit}: ${d.a} done`); });
	setTimeout(() => S.drawSvc?.(), 800);
};
ACT.logs = async (d) => {
	const el = openSheet(`<h3>${esc(d.unit)}</h3><p class="dim">${esc(boxLabel(S.box))} · last 150 lines</p><div class="logs" id="lg">Loading…</div><button class="btn block" style="margin-top:12px" data-act="logs" data-unit="${esc(d.unit)}">${IC.refresh} Reload</button>`);
	try { const r = await api(`/box/${S.box}/logs?unit=${encodeURIComponent(d.unit)}&n=150`); const lg = $('#lg', el); lg.textContent = r.lines.join('\n') || '(empty)'; lg.scrollTop = lg.scrollHeight; }
	catch (e) { $('#lg', el).textContent = e.message; }
};
ACT.cap = (d, b) => busy(b, async () => { const v = $('#cap').value * 1000; await api(`/box/${S.box}/cpu`, {op: 'cap', value: v}); toast('Clock cap ' + fmt.mhz(v)); });
ACT.bootclock = (d, b) => busy(b, async () => {
	const v = segVal(document, 'boot'); if (!v) return toast('Pick a clock', true);
	if (+v >= 2200 && !(await confirmSheet({title: `Boot at ${v / 1000} GHz?`, text: 'This clock cut power on the current supply before. If the Distiller stops answering after the reboot, set it back from its own screen or SD config.', ok: 'Save', danger: true}))) return;
	const r = await api(`/box/${S.box}/cpu`, {op: 'bootclock', value: v}); toast(r.note);
});
ACT.fanfixed = (d, b) => busy(b, async () => { const v = $('#fix').value; await api(`/box/${S.box}/fan`, {preset: 'fixed', pct: v}); $$('#fanp button').forEach((x) => x.classList.remove('on')); toast(`Fan fixed at ${v}%`); });
ACT.dropcaches = (d, b) => busy(b, async () => { const r = await api(`/box/${S.box}/mem`, {op: 'dropcaches'}); toast(`Freed ${fmt.bytes(r.freed)}`); });
ACT.unload = (d, b) => busy(b, async () => { const r = await api('/models/unload', {box: S.box}); toast(r.unloaded.length ? `Unloaded ${r.unloaded.join(', ')}` : 'No models were loaded'); });
ACT.swappiness = (d, b) => busy(b, async () => { await api(`/box/${S.box}/mem`, {op: 'swappiness', value: $('#swp').value}); toast('Swappiness ' + $('#swp').value); });
ACT.oenv = async (d, b) => {
	const set = Object.fromEntries($$('[data-oenv]').map((s) => [s.dataset.oenv, s.value]));
	if (!(await confirmSheet({title: 'Save and restart Ollama?', text: `AI on ${boxLabel(S.box)} pauses for a few seconds.`, ok: 'Save'}))) return;
	busy(b, async () => { await api(`/box/${S.box}/ollama-env`, {set}); toast('AI memory settings saved'); });
};
ACT.reboot = async () => {
	const id = S.box;
	const v = await confirmSheet({title: `Reboot ${boxLabel(id)}?`, text: id === 'server1' ? 'nucaloric.xyz, the Calls bot and this panel go offline for about a minute.' : 'Its AI models go offline for about a minute.', ok: 'Reboot', danger: true, typed: id});
	if (v !== id) return;
	try { const r = await api(`/box/${id}/reboot`, {confirm: id}); toast(r.note); } catch (e) { toast(e.message, true); }
};

// ---------------------------------------------------------------- MODELS

function fit(size, b, id) {
	if (!b?.up) return {lvl: 'bad', txt: 'offline'};
	if (b.diskFree != null && b.diskFree < size * 1.1) return {lvl: 'bad', txt: 'no disk'};
	const usable = (b.memTotal || 0) - (id === 'server1' ? 1.5e9 : 1.2e9), need = size * 1.2 + 3e8;
	return need <= usable * 0.75 ? {lvl: 'ok', txt: 'fits'} : need <= usable ? {lvl: 'warn', txt: 'tight'} : {lvl: 'bad', txt: 'too big'};
}
async function loadModels(force) { if (force || !S.models || Date.now() - S.models.at > 8000) S.models = {...(await api('/models')), at: Date.now()}; return S.models; }

async function models(el, alive) {
	const filter = store.get('mfilter', 'all');
	el.innerHTML = `<div id="m-sum"></div><div id="m-pulls"></div>
		<div class="sec"><h2>Installed</h2><button class="act" data-act="m-refresh">Refresh</button></div><div id="m-inst"><div class="skeleton"></div></div>
		<div class="sec"><h2>Get models</h2></div>
		<div class="filters" id="m-f">${[['all', 'All'], ['chat', 'Chat'], ['code', 'Code'], ['thinking', 'Thinking'], ['vision', 'Vision'], ['embed', 'Embeddings'], ['fits', 'Fits Distiller']].map(([v, l]) => `<button data-v="${v}" class="${v === filter ? 'on' : ''}">${l}</button>`).join('')}</div>
		<input class="in" id="m-q" placeholder="Search models" style="margin-bottom:12px" autocomplete="off">
		<div id="m-cat"></div>
		<div class="sec"><h2>Any Ollama model</h2></div>
		<div class="card"><div class="s" style="margin-bottom:10px">Type a tag from ollama.com/library, like <span class="mono">phi3:mini</span> or <span class="mono">qwen3:14b</span>.</div>
			<div class="row"><input class="in grow" id="m-custom" placeholder="name:tag" autocapitalize="off" autocomplete="off" spellcheck="false"><button class="btn pri" data-act="m-custom">Install</button></div></div>`;
	const draw = async (force) => {
		const M = await loadModels(force);
		if (!alive()) return;
		$('#m-sum', el).innerHTML = `<div class="grid2">${BOXES.map(([id, l]) => { const b = M.boxes[id]; return `<div class="card" style="margin:0"><div class="row"><span class="dot ${b.up ? 'ok' : 'bad'}"></span><b>${l}</b></div>
			<div class="xs" style="margin-top:6px">${b.up ? `${b.models.length} models · ${fmt.bytes(b.memTotal)} RAM<br>${fmt.bytes(b.diskFree)} disk free${b.loaded.length ? `<br><span class="ok">● ${esc(b.loaded.map((x) => x.name).join(', '))}</span>` : ''}` : esc(b.error)}</div></div>`; }).join('')}</div>`;
		const pulls = M.pulls.filter((j) => j.state === 'running' || j.ended > Date.now() - 30000);
		$('#m-pulls', el).innerHTML = pulls.length ? `<div class="sec"><h2>Installing</h2></div>${pulls.map(jobHtml).join('')}` : '';
		const all = {};
		for (const [id] of BOXES) for (const m of M.boxes[id].models) (all[m.name] ||= {name: m.name, m, on: {}}).on[id] = M.boxes[id].loaded.some((x) => x.name === m.name) ? 'loaded' : 'yes';
		$('#m-inst', el).innerHTML = `<div class="card flat list">${Object.values(all).sort((a, b) => a.name.localeCompare(b.name)).map((x) => `<div class="row" data-act="m-open" data-name="${esc(x.name)}" style="cursor:pointer">
			${logo(brandOf(x.name), true)}<div class="grow"><div class="t ellipsis">${esc(x.name)}</div><div class="xs">${esc(x.m.params || '')} ${esc(x.m.quant || '')} · ${fmt.bytes(x.m.size)}</div></div>
			<div class="wrap" style="gap:4px;justify-content:flex-end">${BOXES.filter(([id]) => x.on[id]).map(([id, l]) => `<span class="tag ${x.on[id] === 'loaded' ? 'ok' : 'brand'}">${x.on[id] === 'loaded' ? '● ' : ''}${l}</span>`).join('')}</div></div>`).join('') || '<div class="dim">No models yet.</div>'}</div>`;
		drawCat();
	};
	const drawCat = () => {
		const M = S.models, f = segValF(), q = ($('#m-q', el)?.value || '').toLowerCase();
		const have = (id, n) => M.boxes[id].models.some((m) => m.name === n || m.name === n + ':latest');
		const items = M.catalog.filter((c) => (f === 'all' || (f === 'fits' ? fit(c.size, M.boxes.distiller, 'distiller').lvl === 'ok' : c.tags.includes(f)))
			&& (!q || (c.name + c.family + c.desc).toLowerCase().includes(q)));
		$('#m-cat', el).innerHTML = items.map((c) => `<div class="mcard">${logo(c.brand)}<div class="grow"><div class="row between"><div class="t ellipsis">${esc(c.family)} <span class="dim">${esc(c.params)}</span></div><span class="xs">${fmt.bytes(c.size)}</span></div>
			<div class="s">${esc(c.desc)}</div><div class="xs mono" style="margin:4px 0 8px">${esc(c.name)}</div>
			<div class="row between"><div class="wrap" style="gap:5px">${BOXES.map(([id, l]) => { if (have(id, c.name)) return `<span class="tag brand">✓ ${l}</span>`; const ft = fit(c.size, M.boxes[id], id); return `<span class="tag ${ft.lvl}">${l} ${ft.txt}</span>`; }).join('')}</div>
			<button class="btn sm pri" data-act="m-install" data-name="${esc(c.name)}" data-size="${c.size}">${IC.down} Get</button></div></div></div>`).join('') || '<div class="dim">No match.</div>';
	};
	const segValF = () => $('#m-f button.on', el)?.dataset.v || 'all';
	$('#m-f', el).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $$('#m-f button', el).forEach((x) => x.classList.toggle('on', x === b)); store.set('mfilter', b.dataset.v); drawCat(); });
	$('#m-q', el).addEventListener('input', drawCat);
	S.drawModels = draw;
	await draw(true);
	every(3000, () => { if (alive() && S.models?.pulls.some((j) => j.state === 'running')) draw(true).catch(() => {}); });
	every(20000, () => alive() && draw(true).catch(() => {}));
}
const onJobDone = () => { if (location.hash === '#models') S.drawModels?.(true); };
document.addEventListener('jobdone', onJobDone);
ACT['m-refresh'] = () => S.drawModels?.(true);
ACT['m-custom'] = () => { const n = $('#m-custom').value.trim(); if (n) installSheet(n, null); };
ACT['m-install'] = (d) => installSheet(d.name, +d.size);
function installSheet(name, size) {
	const M = S.models;
	const el = openSheet(`<div class="row" style="margin-bottom:12px">${logo(brandOf(name))}<div><h3>Install ${esc(name)}</h3><div class="s">${size ? fmt.bytes(size) + ' download' : 'Size shows once the download starts'}</div></div></div>
		${BOXES.map(([id, l]) => { const b = M.boxes[id], has = b.models.some((m) => m.name === name || m.name === name + ':latest'), ft = size ? fit(size, b, id) : {lvl: b.up ? 'ok' : 'bad', txt: b.up ? 'online' : 'offline'};
		return `<label class="check card" style="margin-bottom:8px;padding:12px 14px"><input type="checkbox" value="${id}" ${has || !b.up ? 'disabled' : ''} ${!has && ft.lvl === 'ok' ? 'checked' : ''}>
			<div class="grow"><b>${l}</b><div class="xs">${has ? 'already installed' : `${fmt.bytes(b.memTotal)} RAM · ${fmt.bytes(b.diskFree)} free`}</div></div><span class="tag ${has ? 'brand' : ft.lvl}">${has ? 'installed' : ft.txt}</span></label>`; }).join('')}
		<button class="btn pri block" id="i-go" style="margin-top:6px">${IC.down} Install</button>`);
	$('#i-go', el).onclick = () => busy($('#i-go', el), async () => {
		const boxes = $$('input:checked', el).map((x) => x.value);
		if (!boxes.length) return toast('Pick a server', true);
		await api('/models/pull', {name, boxes});
		closeSheet(); toast(`Installing ${name}`); S.models = null; S.drawModels?.(true); jobsTick();
	});
}
ACT['m-open'] = (d) => {
	const M = S.models, name = d.name;
	const on = BOXES.filter(([id]) => M.boxes[id].models.some((m) => m.name === name));
	const m = M.boxes[on[0][0]].models.find((x) => x.name === name);
	const el = openSheet(`<div class="row" style="margin-bottom:12px">${logo(brandOf(name))}<div class="grow"><h3 class="ellipsis">${esc(name)}</h3><div class="s">${esc(m.family || '')} · ${esc(m.params || '')} · ${esc(m.quant || '')} · ${fmt.bytes(m.size)}</div></div></div>
		<button class="btn pri block" data-act="m-chat" data-name="${esc(name)}" data-box="${on.length > 1 ? 'auto' : on[0][0]}">${IC.chat} Chat with it</button>
		${on.map(([id, l]) => { const loaded = M.boxes[id].loaded.some((x) => x.name === name); return `<div class="card" style="margin-top:10px"><div class="row between"><b>${l}</b><span class="tag ${loaded ? 'ok' : ''}">${loaded ? '● in RAM' : 'on disk'}</span></div>
			<div class="grid3" style="margin-top:10px"><button class="btn sm" data-act="m-load" data-box="${id}" data-name="${esc(name)}">Load</button>
			<button class="btn sm" data-act="m-bench" data-box="${id}" data-name="${esc(name)}">${IC.gauge} Test</button>
			<button class="btn sm danger" data-act="m-del" data-box="${id}" data-name="${esc(name)}">${IC.trash} Delete</button></div></div>`; }).join('')}
		${BOXES.filter(([id]) => !on.some(([x]) => x === id)).map(([id, l]) => `<button class="btn block" style="margin-top:10px" data-act="m-install" data-name="${esc(name)}" data-size="${m.size}">${IC.down} Also install on ${l}</button>`).join('')}`);
	return el;
};
ACT['m-chat'] = (d) => { const c = chatState(); c.model = d.name; c.target = d.box; saveChat(); closeSheet(); location.hash = '#chat'; };
ACT['m-load'] = (d, b) => busy(b, async () => { await api('/models/load', {box: d.box, name: d.name}); toast(`Loading ${d.name} on ${boxLabel(d.box)}`); jobsTick(); });
ACT['m-bench'] = (d, b) => busy(b, async () => { await api('/bench', {kind: 'ai', box: d.box, model: d.name}); closeSheet(); toast('Benchmark started'); location.hash = '#bench'; });
ACT['m-del'] = async (d) => {
	const used = {'qwen2.5:3b': 'the platform', 'qwen3.5:2b': 'Claude Code (local)', 'nomic-embed-text:latest': 'code references'}[d.name] || (d.name.startsWith('nucaloric:') ? 'the NUCALORIC brand prompt' : '');
	if (!(await confirmSheet({title: `Delete ${d.name}?`, text: `From ${boxLabel(d.box)}. ${used ? `<b class="warn">Used by ${used}.</b> ` : ''}You can install it again later.`, ok: 'Delete', danger: true}))) return;
	try { await api('/models/delete', {box: d.box, name: d.name}); toast('Deleted'); S.drawModels?.(true); } catch (e) { toast(e.message, true); }
};

// ---------------------------------------------------------------- CHAT

function chatState() { return (S.chat ||= store.get('chat', {model: 'qwen2.5:3b', target: 'auto', think: false, msgs: []})); }
const saveChat = () => store.set('chat', {...S.chat, msgs: S.chat.msgs.slice(-40)});
function md(text) {
	const parts = String(text).split(/```(\w*)\n?([\s\S]*?)(?:```|$)/g);
	let out = '';
	for (let i = 0; i < parts.length; i += 3) {
		out += esc(parts[i]).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
		if (parts[i + 2] != null) out += `<pre><code>${esc(parts[i + 2].replace(/\n$/, ''))}</code></pre>`;
	}
	return out;
}
function msgHtml(m, streaming) {
	if (m.role === 'user') return `<div class="msg u">${esc(m.content)}</div>`;
	const th = m.thinking ? `<details class="th" ${streaming && !m.content ? 'open' : ''}><summary>Thinking${streaming && !m.content ? '…' : ''}</summary><div class="think">${esc(m.thinking)}</div></details>` : '';
	return `<div class="msg a">${th}${m.error ? `<span class="bad">${esc(m.error)}</span>` : `<span class="${streaming ? 'cursor' : ''}">${md(m.content)}</span>`}${m.meta ? `<div class="meta">${esc(m.meta)}</div>` : ''}</div>`;
}
async function chat(el, alive) {
	const c = chatState();
	const M = await loadModels();
	if (!alive()) return;
	const names = (t) => [...new Set((t === 'auto' ? BOXES.map(([id]) => id) : [t]).flatMap((id) => M.boxes[id]?.models.filter((m) => !/embed/.test(m.name)).map((m) => m.name) || []))].sort();
	if (!names(c.target).includes(c.model)) c.model = names(c.target).includes('qwen2.5:3b') ? 'qwen2.5:3b' : names(c.target)[0];
	el.innerHTML = `<div class="chat-top"><button class="picker" data-act="c-pick">${logo(brandOf(c.model || ''), true)}<div class="grow"><div class="t ellipsis">${esc(c.model || 'No models')}</div><div class="xs">${c.target === 'auto' ? 'Auto · fastest free box' : esc(boxLabel(c.target))}${c.think ? ' · thinking on' : ''}</div></div><span class="dim">▾</span></button>
		<button class="btn" data-act="c-new" aria-label="New chat">${IC.plus}</button></div>
		<div class="msgs" id="msgs">${c.msgs.length ? c.msgs.map((m) => msgHtml(m)).join('') : `<div class="empty-chat"><div class="big-n">Ask your own AI</div><div class="s">Runs on server1 and the Distiller. Nothing leaves your servers.</div>
			<div class="wrap">${['Summarise what a rug pull looks like on-chain', 'Write a bash one-liner to find big files', 'Explain Vulkan vs CPU inference simply'].map((p) => `<button class="btn sm" data-act="c-ex" data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div></div>`}</div>
		<div style="height:90px"></div>
		<div class="composer"><div class="in-wrap"><textarea id="c-in" rows="1" placeholder="Message ${esc(c.model || '')}"></textarea><button class="send" id="c-send" aria-label="Send">${S.chatAbort ? IC.stop : IC.send}</button></div></div>`;
	const ta = $('#c-in', el);
	ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; });
	ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); send(); } });
	$('#c-send', el).onclick = () => (S.chatAbort ? S.chatAbort.abort() : send());
	const send = (text) => { text = (text ?? ta.value).trim(); if (!text || !c.model) return; ta.value = ''; ta.style.height = 'auto'; runChat(text, el); };
	S.chatSend = send;
	window.scrollTo(0, document.body.scrollHeight);
}
ACT['c-ex'] = (d) => S.chatSend?.(d.p);
ACT['c-new'] = () => { const c = chatState(); S.chatAbort?.abort(); c.msgs = []; saveChat(); go(); };
ACT['c-pick'] = () => {
	const c = chatState(), M = S.models;
	const el = openSheet(`<h3>Model</h3><div style="margin:10px 0 14px">${segHtml('c-tg', [['auto', 'Auto'], ...BOXES], c.target)}</div>
		<div class="row between check"><span>Thinking (for Qwen 3 / DeepSeek R1)</span><label class="toggle"><input type="checkbox" id="c-th" ${c.think ? 'checked' : ''}><i></i></label></div>
		<div class="card flat list" id="c-ml"></div>`);
	const drawList = () => {
		const t = segVal(el, 'c-tg');
		const list = [...new Set((t === 'auto' ? BOXES.map(([id]) => id) : [t]).flatMap((id) => M.boxes[id]?.models.filter((m) => !/embed/.test(m.name)).map((m) => m.name) || []))].sort();
		$('#c-ml', el).innerHTML = list.map((n) => `<div class="row" data-act="c-set" data-name="${esc(n)}" style="cursor:pointer">${logo(brandOf(n), true)}<div class="grow t ellipsis">${esc(n)}</div>
			<span class="xs">${BOXES.filter(([id]) => M.boxes[id]?.models.some((m) => m.name === n)).map(([, l]) => l).join(' · ')}</span>${n === c.model ? '<span class="ok">✓</span>' : ''}</div>`).join('');
	};
	segBind(el, 'c-tg', drawList); drawList();
	$('#c-th', el).onchange = (e) => { c.think = e.target.checked; saveChat(); };
};
ACT['c-set'] = (d) => { const c = chatState(); c.model = d.name; c.target = segVal(document, 'c-tg') || 'auto'; saveChat(); closeSheet(); go(); };
async function runChat(text, el) {
	const c = chatState();
	if ($('.empty-chat', el)) $('#msgs', el).innerHTML = '';
	c.msgs.push({role: 'user', content: text});
	const a = {role: 'assistant', content: '', thinking: ''};
	c.msgs.push(a);
	const box = $('#msgs', el);
	box.insertAdjacentHTML('beforeend', msgHtml(c.msgs[c.msgs.length - 2]) + '<div id="live-msg"></div>');
	const liveEl = $('#live-msg', el);
	const paint = (streaming) => { liveEl.innerHTML = msgHtml(a, streaming); window.scrollTo(0, document.body.scrollHeight); };
	paint(true);
	const ctrl = new AbortController(); S.chatAbort = ctrl; $('#c-send', el).innerHTML = IC.stop;
	const t0 = Date.now();
	try {
		const r = await fetch('/api/chat', {method: 'POST', signal: ctrl.signal, headers: {'content-type': 'application/json', 'x-nuc': '1'},
			body: JSON.stringify({model: c.model, target: c.target, think: c.think, messages: c.msgs.slice(0, -1).map(({role, content}) => ({role, content}))})});
		if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
		const rd = r.body.getReader(), dec = new TextDecoder();
		let buf = '', last = 0;
		for (;;) {
			const {done, value} = await rd.read();
			if (done) break;
			buf += dec.decode(value, {stream: true});
			let i;
			while ((i = buf.indexOf('\n\n')) >= 0) {
				const line = buf.slice(0, i).replace(/^data: /, ''); buf = buf.slice(i + 2);
				let o; try { o = JSON.parse(line); } catch { continue; }
				if (o.t) a.content += o.t;
				if (o.th) a.thinking += o.th;
				if (o.error) a.error = o.error;
				if (o.done) a.meta = `${c.model} · ${o.tps ?? '–'} tok/s · ${o.tokens ?? 0} tokens${o.load > 0.5 ? ` · loaded in ${o.load}s` : ''} · ${((Date.now() - t0) / 1000).toFixed(1)}s`;
			}
			if (Date.now() - last > 60) { paint(true); last = Date.now(); }
		}
	} catch (e) { if (e.name !== 'AbortError') a.error = e.message; else a.meta = 'stopped'; }
	S.chatAbort = null;
	if ($('#c-send', el)) $('#c-send', el).innerHTML = IC.send;
	paint(false); liveEl.removeAttribute('id');
	saveChat();
}

// ---------------------------------------------------------------- MORE

async function more(el) {
	const items = [['bench', IC.gauge, 'Benchmarks', 'One-tap speed tests'], ['storage', IC.disk, 'Storage', 'Disks, cleanup, allocate'], ['keys', IC.key, 'Claude & Codex', 'API keys on each box'],
		['calls', IC.signal, 'Calls', 'Live callouts from the bot'], ['uptime', IC.pulse, 'Uptime', '24 h / 7 d history'], ['settings', IC.gear, 'Settings', 'Password, sign out']];
	el.innerHTML = `<div class="more-grid">${items.map(([h, ic, t, s]) => `<a href="#${h}"><span class="ic">${ic}</span><div><div class="t">${t}</div><div class="s">${s}</div></div></a>`).join('')}</div>`;
}

// ---------------------------------------------------------------- BENCH

async function bench(el, alive) {
	const M = await loadModels();
	if (!alive()) return;
	const both = M.boxes.server1.models.map((m) => m.name).filter((n) => M.boxes.distiller.models.some((m) => m.name === n) && !/embed/.test(n));
	const pick = store.get('benchModel', both.includes('qwen2.5:1.5b') ? 'qwen2.5:1.5b' : both[0]);
	el.innerHTML = `<div class="card"><div class="t">Full benchmark</div><div class="s">CPU, disk and AI speed on both servers, side by side.</div>
		<label class="field" style="margin-top:12px"><span>AI model (on both boxes)</span><select class="in" id="b-model">${both.map((n) => `<option ${n === pick ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
		<button class="btn pri block" data-act="b-suite">${IC.gauge} Run full benchmark</button></div>
		<div class="sec"><h2>Single tests</h2></div>
		<div class="card">${segHtml('b-box', BOXES, S.box)}<div class="grid3" style="margin-top:12px"><button class="btn" data-act="b-one" data-k="cpu">CPU</button><button class="btn" data-act="b-one" data-k="disk">Disk</button><button class="btn" data-act="b-one" data-k="ai">AI</button></div>
		<div class="xs" style="margin-top:8px">AI uses the model picked above if the box has it, else pick one in Models → Test.</div></div>
		<div id="b-jobs"></div><div id="b-res"></div>`;
	$('#b-model', el).onchange = (e) => store.set('benchModel', e.target.value);
	segBind(el, 'b-box', (v) => { S.box = v; store.set('box', v); });
	const draw = async () => {
		const r = await api('/bench');
		if (!alive()) return;
		const run = r.jobs.filter((j) => j.state === 'running' || j.ended > Date.now() - 15000);
		$('#b-jobs', el).innerHTML = run.length ? `<div class="sec"><h2>Running</h2></div>${run.map(jobHtml).join('')}` : '';
		const res = r.results, model = $('#b-model', el)?.value;
		const latest = (box, kind, mdl) => [...res].reverse().find((x) => x.box === box && x.kind === kind && (!mdl || x.model === mdl));
		const bars = (title, unit, rows) => { const max = Math.max(1, ...rows.map((x) => x[1] || 0)); return `<div style="margin-top:12px"><div class="xs" style="margin-bottom:2px">${title}</div>${rows.map(([l, v]) => `<div class="hbar"><span class="s">${l}</span><div class="bar"><i style="width:${(v || 0) / max * 100}%"></i></div><span class="n">${v ?? '–'}<span class="xs"> ${unit}</span></span></div>`).join('')}</div>`; };
		const ai = BOXES.map(([id, l]) => [l, latest(id, 'ai', model)]), cpu = BOXES.map(([id, l]) => [l, latest(id, 'cpu')]), disk = BOXES.map(([id, l]) => [l, latest(id, 'disk')]);
		$('#b-res', el).innerHTML = `<div class="sec"><h2>Latest results</h2></div>
		<div class="card"><div class="row">${logo(brandOf(model || ''), true)}<div><div class="t">AI speed</div><div class="xs">${esc(model || '')}</div></div></div>
			${bars('Writing (tokens/s)', 'tok/s', ai.map(([l, x]) => [l, x?.tg]))}${bars('Reading the prompt (tokens/s)', 'tok/s', ai.map(([l, x]) => [l, x?.pp]))}
			<div class="xs">${ai.map(([l, x]) => x ? `${l}: loaded in ${x.load}s, ${fmt.ago(x.at)}` : `${l}: not run`).join(' · ')}</div></div>
		<div class="card"><div class="t">CPU</div>${bars('One core (work units/s)', 'pts', cpu.map(([l, x]) => [l, x?.single]))}${bars('All cores', 'pts', cpu.map(([l, x]) => [l, x?.multi]))}</div>
		<div class="card"><div class="t">Disk</div>${bars('Write', 'MB/s', disk.map(([l, x]) => [l, x?.write]))}${bars('Read', 'MB/s', disk.map(([l, x]) => [l, x?.read]))}</div>
		<div class="sec"><h2>History</h2></div><div class="card flat list">${[...res].reverse().slice(0, 30).map((x) => `<div class="row"><span class="tag">${x.kind.toUpperCase()}</span><div class="grow"><div class="t ellipsis">${esc(boxLabel(x.box))}${x.model ? ` · ${esc(x.model)}` : ''}</div><div class="xs">${fmt.date(x.at)}</div></div>
			<span class="mono s">${x.kind === 'ai' ? `${x.tg} tok/s` : x.kind === 'cpu' ? `${x.single} / ${x.multi}` : `${x.write}w ${x.read}r`}</span></div>`).join('') || '<div class="dim">No runs yet. Tap Run full benchmark.</div>'}</div>`;
	};
	S.drawBench = draw;
	await draw();
	every(2500, () => { if (alive() && (S.jobs || []).some((j) => j.kind === 'bench' && j.state === 'running')) draw().catch(() => {}); });
}
document.addEventListener('jobdone', (e) => { if (e.detail.kind === 'bench' && location.hash === '#bench') S.drawBench?.().catch(() => {}); });
ACT['b-suite'] = (d, b) => busy(b, async () => { await api('/bench/suite', {model: $('#b-model').value}); toast('Benchmark started'); jobsTick(); setTimeout(() => S.drawBench?.(), 500); });
ACT['b-one'] = (d, b) => busy(b, async () => {
	const box = segVal(document, 'b-box'), model = $('#b-model').value;
	if (d.k === 'ai' && !S.models.boxes[box].models.some((m) => m.name === model)) return toast(`${boxLabel(box)} does not have ${model}`, true);
	await api('/bench', {kind: d.k, box, model}); toast(`${d.k.toUpperCase()} test started on ${boxLabel(box)}`); jobsTick(); setTimeout(() => S.drawBench?.(), 500);
});

// ---------------------------------------------------------------- STORAGE

const CLEAN = {journal: ['System logs', 'Shrink the journal to 200 MB'], apt: ['Package cache', 'Delete downloaded .deb files'], docker: ['Docker leftovers', 'Unused images + build cache (running containers are kept)'],
	tmp: ['Temp files', 'Old headless-browser and benchmark files (over 2 h old)'], chromium: ['Browser profiles', 'Leaked headless-Chromium profiles over 2 h old'], npm: ['npm cache', 'Re-downloads on the next install']};
async function storage(el, alive) {
	const id = S.box;
	el.innerHTML = `${segHtml('s-box', BOXES, id).replace('class="seg"', 'class="seg big"')}<div id="s-body" style="margin-top:14px"><div class="skeleton"></div></div>`;
	segBind(el, 's-box', (v) => { S.box = v; store.set('box', v); go(); });
	const info = await api(`/box/${id}/info`);
	if (!alive()) return;
	const s = info.stats, lv = info.lvm;
	$('#s-body', el).innerHTML = `<div class="card flat list">${s.disks.map((d) => { const used = d.total - d.free, p = used / d.total * 100; return `<div><div class="row between"><div><div class="t">${esc(d.mount === '/' ? 'System drive' : d.mount)}</div><div class="xs mono">${esc(d.dev)}</div></div><div style="text-align:right"><div class="t">${fmt.bytes(d.free)} free</div><div class="xs">${fmt.bytes(used)} of ${fmt.bytes(d.total)}</div></div></div>
			<div class="bar" style="margin-top:9px"><i class="${p > 90 ? 'bad' : p > 75 ? 'warn' : ''}" style="width:${p}%"></i></div></div>`; }).join('')}</div>
		${lv ? `<div class="sec"><h2>Allocate space</h2></div><div class="card"><div class="t">Unused SSD space</div>
			<div class="s">The SSD is ${fmt.bytes(lv.vgSize)}; the system volume uses ${fmt.bytes(lv.lvSize)}. <b class="ok">${fmt.bytes(lv.vgFree)}</b> is not given to anything yet.</div>
			<div class="bar" style="margin:12px 0 6px"><i style="width:${lv.lvSize / lv.vgSize * 100}%"></i></div>
			${lv.vgFree >= 2 ** 30 ? `<div class="row between" style="margin-top:12px"><span class="s">Add to the system drive</span><span class="big-n" id="lv-v">20 GB</span></div>
			<input type="range" id="lv" min="1" max="${Math.floor(lv.vgFree / 2 ** 30)}" value="${Math.min(20, Math.floor(lv.vgFree / 2 ** 30))}">
			<button class="btn pri block" data-act="lv-grow">Allocate</button><div class="xs" style="margin-top:8px">Online, no reboot. Growing is instant; shrinking later needs offline work, so add what you need.</div>` : '<div class="note">All space is allocated.</div>'}</div>` : ''}
		<div class="sec"><h2>Clean up</h2></div><div class="card flat list">${(info.clean || []).map((k) => `<div class="row"><div class="grow"><div class="t">${CLEAN[k][0]}</div><div class="xs">${CLEAN[k][1]}</div></div><button class="btn sm" data-act="clean" data-what="${k}">${IC.broom} Clean</button></div>`).join('')}</div>
		<div class="sec"><h2>What uses space</h2><button class="act" data-act="scan">Scan</button></div><div id="s-dirs" class="card"><div class="s">Tap Scan to measure the big folders (takes up to a minute).</div></div>`;
	$('#lv', el)?.addEventListener('input', (e) => { $('#lv-v', el).textContent = e.target.value + ' GB'; });
}
ACT.scan = async (d, b) => {
	const out = $('#s-dirs');
	out.innerHTML = '<div class="row"><span class="spin"></span><span class="s">Measuring folders…</span></div>';
	try {
		const r = await api(`/box/${S.box}/storage`), max = Math.max(1, ...r.dirs.map((x) => x.bytes || 0));
		out.innerHTML = r.dirs.sort((a, c) => (c.bytes || 0) - (a.bytes || 0)).map((x) => `<div style="margin:8px 0"><div class="row between"><span class="s mono ellipsis">${esc(x.path)}</span><b>${fmt.bytes(x.bytes)}</b></div><div class="bar thin" style="margin-top:5px"><i style="width:${(x.bytes || 0) / max * 100}%"></i></div></div>`).join('');
	} catch (e) { out.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; }
};
ACT.clean = (d, b) => busy(b, async () => { const r = await api(`/box/${S.box}/clean`, {what: d.what}); toast(`Freed ${fmt.bytes(r.freed)}`); });
ACT['lv-grow'] = async (d, b) => {
	const gb = $('#lv').value;
	if (!(await confirmSheet({title: `Add ${gb} GB to server1's drive?`, text: 'Grows the system volume and its filesystem while running. It cannot be shrunk back without taking the server offline.', ok: `Add ${gb} GB`}))) return;
	busy(b, async () => { await api(`/box/${S.box}/lv-grow`, {gb}); toast('Allocating…'); jobsTick(); });
};
document.addEventListener('jobdone', (e) => { if (e.detail.kind === 'storage' && location.hash === '#storage') go(); });

// ---------------------------------------------------------------- KEYS

async function keys(el, alive) {
	const k = await api('/keys');
	if (!alive()) return;
	const row = (id, p) => {
		const x = k[id];
		if (x.error) return `<div class="row"><b class="grow">${boxLabel(id)}</b><span class="xs bad">${esc(x.error)}</span></div>`;
		const st = x[p];
		const mode = p === 'anthropic' ? {local: 'Claude Code → local models', api: 'Claude Code → this API key', login: 'Claude Code → claude.ai login', unknown: 'Claude Code settings unreadable'}[x.claudeMode]
			: {chatgpt: 'Codex → ChatGPT login', 'api-key': 'Codex → this API key', none: 'Codex → not signed in', unknown: '–'}[x.codexAuth];
		return `<div><div class="row"><div class="grow"><div class="t">${boxLabel(id)}</div><div class="xs">${st.set ? `<span class="ok">✓ key ••••${esc(st.last4)}</span>${st.setAt ? ' · ' + esc(st.setAt.slice(0, 10)) : ''}` : 'No key'} · ${esc(mode)}${(p === 'anthropic' ? x.claudeCli : x.codexCli) ? '' : ' · CLI not installed'}</div></div>
			${st.set ? `<button class="btn xs danger" data-act="k-clear" data-box="${id}" data-p="${p}">Remove</button>` : ''}</div>
			${p === 'anthropic' && x.claudeCli ? `<div class="wrap" style="margin-top:8px">${[['api', 'Use API key'], ['local', 'Use local models'], ['login', 'Use claude.ai login']].filter(([m]) => m !== x.claudeMode && (m !== 'api' || st.set)).map(([m, l]) => `<button class="btn xs" data-act="k-mode" data-box="${id}" data-m="${m}">${l}</button>`).join('')}</div>` : ''}</div>`;
	};
	el.innerHTML = `<div class="card"><div class="row" style="margin-bottom:12px">${logo('claude')}<div><div class="t">Claude (Anthropic API)</div><div class="s">For Claude Code on each box</div></div></div><div class="card flat list" style="margin:0;background:var(--bg2)">${BOXES.map(([id]) => row(id, 'anthropic')).join('')}</div></div>
		<div class="card"><div class="row" style="margin-bottom:12px">${logo('codex')}<div><div class="t">Codex (OpenAI API)</div><div class="s">Logs the Codex CLI in with the key</div></div></div><div class="card flat list" style="margin:0;background:var(--bg2)">${BOXES.map(([id]) => row(id, 'openai')).join('')}</div></div>
		<div class="sec"><h2>Add a key</h2></div>
		<div class="card">${segHtml('k-p', [['anthropic', 'Claude'], ['openai', 'Codex / OpenAI']], 'anthropic')}
			<label class="field" style="margin-top:12px"><span>API key</span><input class="in mono" id="k-key" type="password" placeholder="sk-ant-… or sk-…" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
			${BOXES.map(([id, l]) => `<label class="check"><input type="checkbox" value="${id}" checked class="k-box"> Put it on ${l}</label>`).join('')}
			<div class="grid2" style="margin-top:8px"><button class="btn block" data-act="k-test">Test key</button><button class="btn pri block" data-act="k-save">Save to servers</button></div>
			<div class="xs" style="margin-top:10px">Stored root-only in /etc/nucaloric/ai-keys.env and exported to the box user's shells; never shown again in full. Claude Code keeps its current mode until you tap “Use API key”. Codex switches to the key (its ChatGPT login is backed up and comes back if you remove the key).</div>
			<div id="k-out"></div></div>`;
}
ACT['k-test'] = (d, b) => busy(b, async () => {
	const r = await api('/keys/test', {provider: segVal(document, 'k-p'), key: $('#k-key').value});
	$('#k-out').innerHTML = r.ok ? `<div class="note"><span class="ok">✓ Key works.</span> ${r.count} models, e.g. <span class="mono">${esc(r.models.slice(0, 3).join(', '))}</span></div>` : `<div class="note warn">${esc(r.error)}</div>`;
});
ACT['k-save'] = (d, b) => busy(b, async () => {
	const boxes = $$('.k-box:checked').map((x) => x.value);
	const r = await api('/keys', {provider: segVal(document, 'k-p'), key: $('#k-key').value, boxes});
	const bad = Object.entries(r).filter(([, v]) => v.error);
	if (bad.length) toast(bad.map(([id, v]) => `${boxLabel(id)}: ${v.error}`).join(' · '), true); else toast('Key saved');
	$('#k-key').value = ''; go();
});
ACT['k-clear'] = async (d) => {
	if (!(await confirmSheet({title: 'Remove this key?', text: `From ${boxLabel(d.box)}.${d.p === 'openai' ? ' Codex goes back to its previous login.' : ' Claude Code goes back to its claude.ai login if it was using the key.'}`, ok: 'Remove', danger: true}))) return;
	try { await api('/keys/clear', {provider: d.p, box: d.box}); toast('Removed'); go(); } catch (e) { toast(e.message, true); }
};
ACT['k-mode'] = (d, b) => busy(b, async () => { await api('/keys/claude-mode', {box: d.box, mode: d.m}); toast('Claude Code switched'); go(); });

// ---------------------------------------------------------------- CALLS

async function calls(el, alive) {
	const draw = async () => {
		const r = await api('/calls');
		if (!alive()) return;
		const s = r.status, sc = s.scanner || {}, st = s.calls?.scalpToday;
		el.innerHTML = `<div class="card"><div class="row between"><div class="row"><span class="dot ${s.ready ? 'ok' : 'bad'}"></span><b>${esc(s.bot || 'Calls bot')}</b></div><span class="xs">up ${fmt.dur(s.uptimeSec)} · ${s.rssMb ?? '–'} MB</span></div>
			<div class="grid3" style="margin-top:14px"><div><div class="big-n">${sc.callsToday ?? '–'}</div><div class="xs">calls today</div></div><div><div class="big-n">${st ? Math.round(st.rate * 100) + '%' : '–'}</div><div class="xs">hit ${st?.target ?? 1.5}x (2 h)</div></div><div><div class="big-n">${st ? Math.round(st.rate2x * 100) + '%' : '–'}</div><div class="xs">hit 2x</div></div></div>
			<div class="chips"><span class="chip">Watching <b>${sc.watching ?? '–'}</b></span><span class="chip">Last hour <b>${sc.callsLastHour ?? '–'}</b></span><span class="chip">Feed <b>${sc.health?.feedConnected ? 'on' : 'off'}</b></span>
			<span class="chip">Watchdog <b>${esc(s.watchdog?.state || '–')}</b></span>${s.watchdog?.exits24h != null ? `<span class="chip">Restarts 24 h <b>${s.watchdog.exits24h}</b></span>` : ''}</div>
			${s.trends?.length ? `<div class="xs" style="margin-top:10px">Trending: ${s.trends.slice(0, 5).map(esc).join(' · ')}</div>` : ''}</div>
			<div class="sec"><h2>Latest calls</h2><span class="xs">auto-refresh</span></div>
			<div class="card flat list">${r.calls.map((c) => { const x = c.x || 0; return `<div class="row" data-act="call" data-ca="${esc(c.ca)}" style="cursor:pointer">
				${c.image ? `<img class="callimg" src="${esc(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="callimg"></span>'}
				<div class="grow"><div class="row" style="gap:6px"><span class="t">$${esc(c.symbol)}</span>${c.cls ? `<span class="tag ${c.cls === 'HIGH QUALITY' ? 'ok' : c.cls === 'CAUTION' ? 'warn' : 'brand'}">${esc(c.cls.toLowerCase())}</span>` : ''}${c.active ? '<span class="dot ok"></span>' : ''}</div>
				<div class="xs ellipsis">${fmt.usd(c.mcap)} → peak ${fmt.usd(c.peak)} · ${fmt.ago(c.at)}</div></div>
				<span class="x ${x >= 2 ? 'ok' : x >= 1.5 ? 'warn' : 'dim'}">${x ? x.toFixed(2) + 'x' : '–'}</span></div>`; }).join('')}</div>`;
		$$('img.callimg', el).forEach((i) => i.addEventListener('error', () => { i.style.visibility = 'hidden'; }));
		S.callList = r.calls;
	};
	await draw();
	every(15000, () => draw().catch(() => {}));
}
ACT.call = (d) => {
	const c = S.callList.find((x) => x.ca === d.ca); if (!c) return;
	openSheet(`<div class="row" style="margin-bottom:10px">${c.image ? `<img class="callimg" src="${esc(c.image)}" alt="">` : ''}<div><h3>$${esc(c.symbol)}</h3><div class="s">${esc(c.name || '')}</div></div></div>
		<div class="kv"><span>Called</span><span>${fmt.date(c.at)} at ${fmt.usd(c.mcap)}</span><span>Peak</span><span>${fmt.usd(c.peak)} (${c.x ?? '–'}x)</span><span>Now</span><span>${fmt.usd(c.now)}</span>
		<span>Class</span><span>${esc(c.cls || 'none')}${c.risk != null ? ` · risk ${c.risk}` : ''}</span><span>By</span><span>${esc(c.by || '')}</span></div>
		${c.why ? `<div class="note">${esc(c.why)}</div>` : ''}
		<div class="mono xs" style="word-break:break-all;margin:10px 0">${esc(c.ca)}</div>
		<div class="grid3"><button class="btn sm" data-act="copy" data-v="${esc(c.ca)}">Copy CA</button><a class="btn sm" target="_blank" rel="noopener" href="https://dexscreener.com/solana/${encodeURIComponent(c.ca)}">Chart</a><a class="btn sm" target="_blank" rel="noopener" href="https://solscan.io/token/${encodeURIComponent(c.ca)}">Solscan</a></div>`);
};
ACT.copy = async (d) => { try { await navigator.clipboard.writeText(d.v); toast('Copied'); } catch { toast('Copy blocked by the browser', true); } };

// ---------------------------------------------------------------- UPTIME

async function uptime(el, alive) {
	const draw = async () => {
		const r = await api('/uptime');
		if (!alive()) return;
		el.innerHTML = Object.values(r.checks).map((u) => `<div class="card"><div class="row between"><div class="row"><span class="dot ${u.up ? 'ok' : u.up === false ? 'bad' : ''}"></span><b>${esc(u.label)}</b></div>
			<span class="tag ${u.up ? 'ok' : u.up === false ? 'bad' : ''}">${u.up ? 'Up' : u.up === false ? 'Down' : '–'}${u.since ? ' ' + fmt.dur((Date.now() - u.since) / 1000) : ''}</span></div>
			${stripHtml(u.strip)}<div class="row between xs" style="margin-top:6px"><span>24 h ago</span><span>24 h <b>${u.pct24h ?? '–'}%</b> · 7 d <b>${u.pct7d ?? '–'}%</b></span><span>now</span></div></div>`).join('')
			+ `<div class="sec"><h2>Events</h2></div><div class="card flat list">${r.events.map((e) => `<div class="row"><span class="dot ${e.up ? 'ok' : 'bad'}"></span><div class="grow"><b>${esc(e.label)}</b> ${e.up ? `back after ${fmt.dur(e.after / 1000)}` : `down after ${fmt.dur(e.after / 1000)} up`}</div><span class="xs">${fmt.date(e.t)}</span></div>`).join('') || '<div class="dim">No outages recorded yet.</div>'}</div>
			<div class="xs" style="text-align:center">Checked every minute from server1. History started when this panel was installed.</div>`;
	};
	await draw();
	every(30000, () => draw().catch(() => {}));
}

// ---------------------------------------------------------------- SETTINGS

async function settings(el) {
	el.innerHTML = `<div class="card"><div class="t">This panel</div><div class="kv" style="margin-top:8px"><span>Address</span><span class="mono" style="word-break:break-all">${esc(location.origin)}</span><span>Runs on</span><span>server1 (nuc-control.service)</span><span>Reaches</span><span>Distiller over the home network (ssh)</span></div>
		<div class="note">Add it to your home screen: Safari → Share → Add to Home Screen, or Chrome → ⋮ → Add to Home screen.</div></div>
		<div class="sec"><h2>Change password</h2></div>
		<div class="card"><label class="field"><span>Current password</span><input class="in" type="password" id="pw-c" autocomplete="current-password"></label>
			<label class="field"><span>New password (10+ characters)</span><input class="in" type="password" id="pw-n" autocomplete="new-password"></label>
			<button class="btn pri block" data-act="pw">Change password</button><div class="xs" style="margin-top:8px">Signs out every other phone or computer.</div></div>
		<button class="btn block danger" data-act="logout" style="margin-top:12px">Sign out</button>`;
}
ACT.pw = (d, b) => busy(b, async () => { await api('/password', {current: $('#pw-c').value, next: $('#pw-n').value}); $('#pw-c').value = $('#pw-n').value = ''; toast('Password changed'); });
ACT.logout = async () => { await api('/logout', {}).catch(() => {}); showLogin(); };

const VIEWS = {home, control, models, chat, more, bench, storage, keys, calls, uptime, settings};

// ---------------------------------------------------------------- boot

function showLogin() {
	$('#app').classList.add('hidden'); $('#tabs').classList.add('hidden'); $('#login').classList.remove('hidden');
	S.timers.forEach(clearInterval); S.timers = []; clearTimeout(jobsTimer);
}
$('#login-form').addEventListener('submit', async (e) => {
	e.preventDefault();
	const err = $('#login-err'), btn = $('button[type=submit]', e.target);
	err.classList.add('hidden'); btn.disabled = true;
	try { await api('/login', {password: e.target.password.value}); e.target.password.value = ''; start(); }
	catch (x) { err.textContent = x.message; err.classList.remove('hidden'); }
	finally { btn.disabled = false; }
});
function start() { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); $('#tabs').classList.remove('hidden'); go(); }
(async () => {
	LOGOS = await fetch('logos.json').then((r) => r.json()).catch(() => ({}));
	try { await api('/me'); start(); } catch { showLogin(); }
})();
