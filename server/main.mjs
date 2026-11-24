// NUC Control: phone-first control panel for server1 + the Distiller.
// Runs on server1 (127.0.0.1:8810, public through Tailscale Funnel). Privileged work goes through nuc-ctl:
// sudo locally, a forced-command ssh key on the Distiller. No npm dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {CATALOG} from './catalog.mjs';

const PORT = +process.env.PORT || 8810;
const BIND = process.env.BIND || '127.0.0.1';
const DATA = process.env.DATA_DIR || '/var/lib/nuc-panel';
const PUB = path.join(import.meta.dirname, '..', 'public');
const ROUTER = process.env.ROUTER_URL || 'http://127.0.0.1:11500';
const CALLS = process.env.CALLS_URL || 'http://127.0.0.1:8795';
const SITE = process.env.SITE_URL || 'https://nucaloric.xyz/';
const PLATFORM = process.env.PLATFORM_URL || 'http://127.0.0.1:8090/';
const BOXES = {
	server1: {id: 'server1', label: 'server1', hw: 'HP EliteDesk 705 G3 Mini', ollama: 'http://127.0.0.1:11434', local: true},
	distiller: {id: 'distiller', label: 'Distiller', hw: 'Pamir Distiller · Pi CM5', ollama: process.env.DISTILLER_OLLAMA || 'http://127.0.0.1:11435',
		hosts: (process.env.DISTILLER_HOSTS || '192.168.5.194,distiller-05d8.local,10.77.0.1').split(',')},
};
fs.mkdirSync(DATA, {recursive: true});

// ---------------------------------------------------------------- helpers

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.writeFileSync(f + '.tmp', JSON.stringify(v)); fs.renameSync(f + '.tmp', f); };
const appendLine = (f, v) => fs.appendFile(path.join(DATA, f), JSON.stringify(v) + '\n', () => {});
const readLines = (f) => { try { return fs.readFileSync(path.join(DATA, f), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
const fail = (status, msg) => Object.assign(new Error(msg), {status});
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function exec(cmd, args, {stdin, timeout = 30000} = {}) {
	return new Promise((resolve) => {
		const p = spawn(cmd, args, {stdio: ['pipe', 'pipe', 'pipe']});
		let out = '', err = '';
		const t = setTimeout(() => p.kill('SIGKILL'), timeout);
		p.stdout.on('data', (d) => { out += d; });
		p.stderr.on('data', (d) => { err += d; });
		p.on('close', (code) => { clearTimeout(t); resolve({code, out, err}); });
		p.on('error', (e) => { clearTimeout(t); resolve({code: -1, out, err: e.message}); });
		p.stdin.end(stdin || '');
	});
}

const SSH_OPTS = ['-i', path.join(DATA, '.ssh/id_ed25519'), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
	'-o', `UserKnownHostsFile=${path.join(DATA, '.ssh/known_hosts')}`, '-o', 'HostKeyAlias=distiller', '-o', 'StrictHostKeyChecking=yes',
	'-o', 'ConnectTimeout=5', '-o', 'ServerAliveInterval=15', '-o', 'ControlMaster=auto', '-o', 'ControlPath=/run/nuc-panel/cm-%C', '-o', 'ControlPersist=300'];

// Run nuc-ctl on a box; resolves its JSON, throws its {error}.
async function ctl(box, args, opts = {}) {
	const b = BOXES[box];
	if (!b) throw fail(404, 'unknown box');
	args = args.map(String);
	let r;
	if (b.local) r = await exec('sudo', ['-n', '/usr/local/sbin/nuc-ctl', ...args], opts);
	else {
		const order = b.goodHost ? [b.goodHost, ...b.hosts.filter((h) => h !== b.goodHost)] : b.hosts;
		for (const h of order) {
			r = await exec('ssh', [...SSH_OPTS, `distiller@${h}`, 'nuc-ctl', ...args], opts);
			if (r.code !== 255) { b.goodHost = h; break; } // 255 = ssh itself could not connect: try the next address
		}
		if (r.code === 255) throw fail(503, `${b.label} is not reachable (${r.err.trim().split('\n').pop()})`);
	}
	let j;
	try { j = JSON.parse(r.out.trim().split('\n').pop()); } catch { throw fail(502, (r.err || r.out || `nuc-ctl exited ${r.code}`).trim().slice(-300)); }
	if (j.error) throw fail(400, j.error);
	return j;
}

async function getJson(url, timeout = 5000, init = {}) {
	const r = await fetch(url, {...init, signal: AbortSignal.timeout(timeout)});
	if (!r.ok) throw fail(r.status === 404 ? 404 : 502, (await r.text().catch(() => '')).slice(0, 300) || `HTTP ${r.status}`);
	return r.json();
}

async function* ndjson(body) {
	const dec = new TextDecoder();
	let buf = '';
	for await (const chunk of body) {
		buf += dec.decode(chunk, {stream: true});
		let i;
		while ((i = buf.indexOf('\n')) >= 0) {
			const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
			if (line) { try { yield JSON.parse(line); } catch {} }
		}
	}
	if (buf.trim()) { try { yield JSON.parse(buf); } catch {} }
}

// ---------------------------------------------------------------- auth

const AUTH = path.join(DATA, 'auth.json');
const SESS = path.join(DATA, 'sessions.json');
const scrypt = (pw, salt) => crypto.scryptSync(pw, salt, 32, {N: 16384, r: 8, p: 1}).toString('hex');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
let sessions = readJson(SESS, {});
const SESSION_DAYS = 30;

function setPassword(pw) {
	const salt = crypto.randomBytes(16).toString('hex');
	writeJson(AUTH, {salt, hash: scrypt(pw, salt), at: new Date().toISOString()});
	fs.chmodSync(AUTH, 0o600);
}
function checkPassword(pw) {
	const a = readJson(AUTH, null);
	if (!a || typeof pw !== 'string' || pw.length > 200) return false;
	return crypto.timingSafeEqual(Buffer.from(scrypt(pw, a.salt), 'hex'), Buffer.from(a.hash, 'hex'));
}
function saveSessions() {
	const now = Date.now();
	for (const [k, v] of Object.entries(sessions)) if (v.exp < now) delete sessions[k];
	writeJson(SESS, sessions); fs.chmodSync(SESS, 0o600);
}
const cookie = (req, name) => (req.headers.cookie || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1];
const session = (req) => { const t = cookie(req, 'nucctl'); const s = t && sessions[sha(t)]; return s && s.exp > Date.now() ? s : null; };
const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

// brute-force guard: 5 misses per address per 10 min, 30 overall
const misses = new Map();
let globalMisses = [];
function loginAllowed(ip) {
	const cut = Date.now() - 600_000;
	globalMisses = globalMisses.filter((t) => t > cut);
	const m = (misses.get(ip) || []).filter((t) => t > cut);
	misses.set(ip, m);
	return m.length < 5 && globalMisses.length < 30;
}
function noteMiss(ip) { misses.get(ip)?.push(Date.now()) ?? misses.set(ip, [Date.now()]); globalMisses.push(Date.now()); }

// ---------------------------------------------------------------- live state, history, uptime

const live = Object.fromEntries(Object.keys(BOXES).map((id) => [id, {stats: null, at: 0, err: null, hist: [], info: null, infoAt: 0}]));
let lastClient = 0;

async function pollBox(id) {
	const L = live[id];
	try {
		const s = await ctl(id, ['stats'], {timeout: 15000});
		L.stats = s; L.at = Date.now(); L.err = null;
		const m = s.mem;
		L.hist.push([L.at, s.cpu, s.tempC, m ? round((1 - m.avail / m.total) * 100) : null]);
		if (L.hist.length > 360) L.hist.splice(0, L.hist.length - 360);
	} catch (e) { L.err = e.message; }
}
async function pollLoop() {
	await Promise.all(Object.keys(BOXES).map(pollBox));
	setTimeout(pollLoop, Date.now() - lastClient < 120_000 ? 5000 : 30_000);
}

async function probe(url, timeout = 6000, ok = (r) => r.status < 500) {
	try { const r = await fetch(url, {method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeout)}); r.body?.cancel(); return ok(r); } catch { return false; }
}
const CHECKS = {
	// null = not polled yet since start: no sample, so a restart never shows as an outage
	server1: {label: 'server1', run: async () => (live.server1.at || live.server1.err ? live.server1.at > Date.now() - 90_000 : null)},
	distiller: {label: 'Distiller', run: async () => (live.distiller.at || live.distiller.err ? live.distiller.at > Date.now() - 90_000 : null)},
	website: {label: 'nucaloric.xyz', run: () => probe(SITE, 10_000, (r) => r.status < 400)},
	platform: {label: 'Platform API', run: () => probe(PLATFORM)},
	calls: {label: 'Calls bot', run: async () => { try { return (await getJson(CALLS + '/status', 5000)).ready === true; } catch { return false; } }},
	router: {label: 'AI router', run: () => probe(ROUTER + '/nuc/status')},
	'ai-server1': {label: 'Ollama · server1', run: () => probe(BOXES.server1.ollama + '/api/version')},
	'ai-distiller': {label: 'Ollama · Distiller', run: () => probe(BOXES.distiller.ollama + '/api/version')},
};
const WEEK = 8 * 86400_000;
let uptime = readLines('uptime.jsonl').filter((x) => x.t > Date.now() - WEEK);
let events = readLines('events.jsonl').slice(-300);
const state = {};
for (const s of uptime) for (const [k, v] of Object.entries(s.s)) if (state[k]?.up !== !!v) state[k] = {up: !!v, since: s.t};

async function uptimeTick() {
	const t = Date.now();
	const s = {};
	await Promise.all(Object.entries(CHECKS).map(async ([k, c]) => { const v = await c.run(); if (v !== null) s[k] = v ? 1 : 0; }));
	uptime.push({t, s});
	appendLine('uptime.jsonl', {t, s});
	for (const [k, v] of Object.entries(s)) {
		if (state[k] && state[k].up !== !!v) {
			const ev = {t, key: k, label: CHECKS[k].label, up: !!v, after: t - state[k].since};
			events.push(ev); appendLine('events.jsonl', ev);
		}
		if (state[k]?.up !== !!v) state[k] = {up: !!v, since: t};
	}
	if (uptime.length && uptime[0].t < t - WEEK - 3600_000) { // compact the file about once an hour
		uptime = uptime.filter((x) => x.t > t - WEEK);
		fs.writeFileSync(path.join(DATA, 'uptime.jsonl'), uptime.map((x) => JSON.stringify(x)).join('\n') + '\n');
		events = events.slice(-300);
		fs.writeFileSync(path.join(DATA, 'events.jsonl'), events.map((x) => JSON.stringify(x)).join('\n') + '\n');
	}
}

function uptimeSummary(bars = 48) {
	const t = Date.now(), out = {};
	for (const [k, c] of Object.entries(CHECKS)) {
		const pct = (ms) => { const xs = uptime.filter((x) => x.t > t - ms && k in x.s); return xs.length ? round(xs.reduce((a, x) => a + x.s[k], 0) / xs.length * 100, 2) : null; };
		const span = 86400_000 / bars, strip = Array.from({length: bars}, () => [0, 0]);
		for (const x of uptime) {
			if (x.t <= t - 86400_000 || !(k in x.s)) continue;
			const i = Math.min(bars - 1, Math.floor((x.t - (t - 86400_000)) / span));
			strip[i][0] += x.s[k]; strip[i][1]++;
		}
		out[k] = {label: c.label, up: state[k]?.up ?? null, since: state[k]?.since ?? null, pct24h: pct(86400_000), pct7d: pct(7 * 86400_000),
			strip: strip.map(([u, n]) => (n ? round(u / n, 2) : null))};
	}
	return out;
}

// ---------------------------------------------------------------- jobs (pulls, benchmarks, storage work)

const jobs = new Map();
let jobSeq = 0;
function startJob(kind, title, box, fn) {
	const j = {id: `${++jobSeq}${crypto.randomBytes(3).toString('hex')}`, kind, title, box, state: 'running', progress: null, status: 'starting',
		started: Date.now(), ended: null, result: null, error: null};
	jobs.set(j.id, j);
	for (const id of [...jobs.keys()].slice(0, Math.max(0, jobs.size - 60))) jobs.delete(id);
	Promise.resolve().then(() => fn(j)).then((r) => { j.result = r ?? null; j.state = 'done'; j.status = 'done'; j.progress = 1; })
		.catch((e) => { j.error = e.message; j.state = 'error'; j.status = 'failed'; })
		.finally(() => { j.ended = Date.now(); });
	return j;
}
const lanes = {}; // one heavy thing per box at a time (benchmarks)
const lane = (box, fn) => (lanes[box] = (lanes[box] || Promise.resolve()).catch(() => {}).then(fn));

async function pullModel(j, box, name) {
	const r = await fetch(BOXES[box].ollama + '/api/pull', {method: 'POST', body: JSON.stringify({model: name, stream: true}), signal: AbortSignal.timeout(3 * 3600_000)});
	if (!r.ok) throw new Error((await r.text()).slice(0, 300));
	let big = 0;
	for await (const o of ndjson(r.body)) {
		if (o.error) throw new Error(o.error);
		j.status = o.status?.startsWith('pulling ') ? 'downloading' : o.status;
		if (o.total && o.total >= big) { big = o.total; j.progress = (o.completed || 0) / o.total; j.bytes = [o.completed || 0, o.total]; }
	}
	return {model: name, box};
}

const BENCH_PROMPT = ('You are reviewing a Solana token launch. The mint has 1,000,000,000 supply, the top ten holders own 31 percent, ' +
	'the liquidity pool holds 84 SOL, the developer wallet sold 2 percent in the first five minutes, and volume over the last hour was ' +
	'412 SOL across 1,930 trades. ').repeat(6) + 'Write a short risk summary with three bullet points.';

async function ollamaGen(base, body, timeout = 900_000) {
	return getJson(base + '/api/generate', timeout, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({stream: false, ...body})});
}

async function benchAi(j, box, model) {
	const base = BOXES[box].ollama;
	j.status = 'loading model'; j.progress = 0.05;
	const warm = await ollamaGen(base, {model, prompt: 'Say OK.', keep_alive: '5m', options: {num_predict: 4, temperature: 0}});
	const runs = [];
	for (let i = 0; i < 2; i++) {
		j.status = `run ${i + 1} of 2`; j.progress = 0.2 + i * 0.4;
		const r = await ollamaGen(base, {model, prompt: `Run ${i} ${Date.now()}. ${BENCH_PROMPT}`, keep_alive: '5m', options: {num_predict: 128, temperature: 0, seed: 1}});
		runs.push({pp: r.prompt_eval_count / (r.prompt_eval_duration / 1e9), tg: r.eval_count / (r.eval_duration / 1e9), n: r.prompt_eval_count});
	}
	return {pp: round(median(runs.map((x) => x.pp))), tg: round(median(runs.map((x) => x.tg)), 2), load: round(warm.load_duration / 1e9, 2), promptTokens: runs[0].n};
}

function runBench(kind, box, model) {
	const title = kind === 'ai' ? `AI speed · ${model}` : kind === 'cpu' ? 'CPU speed' : 'Disk speed';
	return startJob('bench', title, box, (j) => { j.status = 'queued'; return lane(box, async () => {
		j.status = 'running';
		const r = kind === 'ai' ? await benchAi(j, box, model) : await ctl(box, ['bench', kind], {timeout: 300_000});
		const rec = {at: Date.now(), box, kind, model: kind === 'ai' ? model : undefined, ...r};
		delete rec.unit;
		appendLine('bench.jsonl', rec);
		return rec;
	}); });
}

// ---------------------------------------------------------------- http plumbing

const routes = [];
const route = (method, pattern, fn, opts = {}) => routes.push({method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, opts});
const box = (p) => { if (!BOXES[p.id]) throw fail(404, 'unknown box'); return p.id; };
const arg = (v, re, what) => { v = String(v ?? ''); if (!re.test(v)) throw fail(400, `bad ${what}`); return v; };
const MODEL_RE = /^[a-z0-9][a-z0-9._\-/]{0,80}(:[a-z0-9._\-]{1,40})?$/i;

async function body(req, limit = 1e6) {
	let s = '';
	for await (const c of req) { s += c; if (s.length > limit) throw fail(413, 'too large'); }
	try { return s ? JSON.parse(s) : {}; } catch { throw fail(400, 'bad JSON'); }
}
function send(res, status, data, headers = {}) {
	res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers});
	res.end(JSON.stringify(data));
}

// --- auth
route('GET', '/api/me', ({req}) => { const s = session(req); if (!s) throw fail(401, 'sign in'); return {ok: true, since: s.at}; }, {auth: false});
route('POST', '/api/login', async ({req, res, b}) => {
	const ip = clientIp(req);
	if (!loginAllowed(ip)) throw fail(429, 'Too many tries. Wait 10 minutes.');
	if (!checkPassword(b.password)) { noteMiss(ip); console.log(`login failed from ${ip}`); throw fail(401, 'Wrong password'); }
	const tok = crypto.randomBytes(32).toString('base64url');
	sessions[sha(tok)] = {at: Date.now(), exp: Date.now() + SESSION_DAYS * 86400_000, ip, ua: String(req.headers['user-agent'] || '').slice(0, 120)};
	saveSessions();
	console.log(`login from ${ip}`);
	res.setHeader('set-cookie', `nucctl=${tok}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`);
	return {ok: true};
}, {auth: false});
route('POST', '/api/logout', ({req, res}) => {
	const t = cookie(req, 'nucctl'); if (t) { delete sessions[sha(t)]; saveSessions(); }
	res.setHeader('set-cookie', 'nucctl=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
	return {ok: true};
});
route('POST', '/api/password', ({req, b}) => {
	if (!checkPassword(b.current)) throw fail(401, 'Current password is wrong');
	if (typeof b.next !== 'string' || b.next.length < 10) throw fail(400, 'Use at least 10 characters');
	setPassword(b.next);
	const keep = sha(cookie(req, 'nucctl'));
	sessions = {[keep]: sessions[keep]}; saveSessions(); // sign every other device out
	return {ok: true};
});

// --- overview
route('GET', '/api/overview', async () => {
	let calls = null;
	try {
		const s = await getJson(CALLS + '/status', 3000);
		calls = {ready: s.ready, today: s.scanner?.callsToday, lastHour: s.scanner?.callsLastHour, watching: s.scanner?.watching,
			last: s.scanner?.lastCall, scalp: s.calls?.scalpToday, watchdog: s.watchdog?.state};
	} catch {}
	const boxes = {};
	for (const [id, b] of Object.entries(BOXES)) {
		const L = live[id];
		boxes[id] = {id, label: b.label, hw: b.hw, up: L.at > Date.now() - 60_000, at: L.at, err: L.err, stats: L.stats, hist: L.hist.slice(-120)};
	}
	return {boxes, uptime: uptimeSummary(24), events: events.slice(-12).reverse(), calls,
		jobs: [...jobs.values()].filter((j) => j.state === 'running' || j.ended > Date.now() - 20_000)};
});

// --- per box
route('GET', '/api/box/:id/info', async ({p}) => {
	const id = box(p), L = live[id];
	if (!L.info || Date.now() - L.infoAt > 20_000) { L.info = await ctl(id, ['info']); L.infoAt = Date.now(); }
	return {...L.info, stats: L.stats};
});
route('GET', '/api/box/:id/services', ({p}) => ctl(box(p), ['services']));
route('GET', '/api/box/:id/logs', ({p, q}) => ctl(box(p), ['logs', arg(q.get('unit'), /^[\w.-]+$/, 'unit'), arg(q.get('n') || 150, /^\d{1,3}$/, 'n')]));
route('POST', '/api/box/:id/svc', ({p, b}) => ctl(box(p), ['svc', arg(b.action, /^(start|stop|restart)$/, 'action'), arg(b.unit, /^[\w.-]+$/, 'unit')], {timeout: 120_000}));
route('POST', '/api/box/:id/reboot', ({p, b}) => { const id = box(p); if (b.confirm !== id) throw fail(400, `type ${id} to confirm`); return ctl(id, ['reboot']); });
route('POST', '/api/box/:id/cpu', ({p, b}) => { live[box(p)].infoAt = 0; return ctl(p.id, ['cpu', arg(b.op, /^(profile|governor|maxfreq|boost|cap|bootclock)$/, 'op'), arg(b.value, /^[\w.-]{1,20}$/, 'value')]); });
route('POST', '/api/box/:id/fan', ({p, b}) => { live[box(p)].infoAt = 0; return ctl(p.id, ['fan', arg(b.preset, /^(auto|quiet|performance|max|fixed)$/, 'preset'), ...(b.preset === 'fixed' ? [arg(b.pct, /^\d{1,3}$/, 'percent')] : [])]); });
route('POST', '/api/box/:id/mem', ({p, b}) => ctl(box(p), ['mem', arg(b.op, /^(dropcaches|swappiness)$/, 'op'), ...(b.op === 'swappiness' ? [arg(b.value, /^\d{1,3}$/, 'value')] : [])]));
route('POST', '/api/box/:id/ollama-env', ({p, b}) => {
	live[box(p)].infoAt = 0;
	const pairs = Object.entries(b.set || {}).flatMap(([k, v]) => [arg(k, /^OLLAMA_[A-Z_]+$/, 'key'), arg(v, /^-?[\w]{1,10}$/, 'value')]);
	if (!pairs.length) throw fail(400, 'nothing to change');
	return ctl(p.id, ['ollama-env', ...pairs], {timeout: 120_000});
});
route('GET', '/api/box/:id/storage', ({p}) => ctl(box(p), ['storage'], {timeout: 240_000}));
route('POST', '/api/box/:id/clean', ({p, b}) => ctl(box(p), ['clean', arg(b.what, /^[a-z]+$/, 'cleanup')], {timeout: 600_000}));
route('POST', '/api/box/:id/lv-grow', ({p, b}) => {
	const id = box(p), gb = arg(b.gb, /^\d{1,3}$/, 'size');
	return startJob('storage', `Grow storage +${gb} GB`, id, () => ctl(id, ['lv-grow', gb], {timeout: 900_000}));
});

// --- models
route('GET', '/api/models', async () => {
	const out = {};
	await Promise.all(Object.entries(BOXES).map(async ([id, b]) => {
		try {
			const [tags, ps] = await Promise.all([getJson(b.ollama + '/api/tags', 6000), getJson(b.ollama + '/api/ps', 6000).catch(() => ({models: []}))]);
			const s = live[id].stats;
			out[id] = {up: true, models: tags.models.map((m) => ({name: m.name, size: m.size, modified: m.modified_at, family: m.details?.family,
				params: m.details?.parameter_size, quant: m.details?.quantization_level})).sort((a, c) => a.name.localeCompare(c.name)),
				loaded: ps.models.map((m) => ({name: m.name, size: m.size, vram: m.size_vram, until: m.expires_at})),
				memTotal: s?.mem?.total, memAvail: s?.mem?.avail, diskFree: s?.disks?.find((d) => d.mount === '/')?.free};
		} catch (e) { out[id] = {up: false, error: e.message, models: [], loaded: []}; }
	}));
	return {boxes: out, catalog: CATALOG, pulls: [...jobs.values()].filter((j) => j.kind === 'pull')};
});
route('POST', '/api/models/pull', ({b}) => {
	const name = arg(String(b.name || '').trim(), MODEL_RE, 'model name');
	const targets = (Array.isArray(b.boxes) ? b.boxes : []).filter((x) => BOXES[x]);
	if (!targets.length) throw fail(400, 'pick a server');
	return {jobs: targets.map((id) => startJob('pull', `Install ${name}`, id, (j) => pullModel(j, id, name)))};
});
route('POST', '/api/models/delete', async ({b}) => {
	const id = box({id: b.box}), name = arg(b.name, MODEL_RE, 'model name');
	const r = await fetch(BOXES[id].ollama + '/api/delete', {method: 'DELETE', body: JSON.stringify({model: name}), signal: AbortSignal.timeout(30_000)});
	if (!r.ok) throw fail(400, (await r.text()).slice(0, 200));
	return {ok: true};
});
route('POST', '/api/models/unload', async ({b}) => {
	const id = box({id: b.box});
	const ps = await getJson(BOXES[id].ollama + '/api/ps', 6000);
	await Promise.all(ps.models.map((m) => ollamaGen(BOXES[id].ollama, {model: m.name, keep_alive: 0}, 30_000).catch(() => {})));
	return {ok: true, unloaded: ps.models.map((m) => m.name)};
});
route('POST', '/api/models/load', async ({b}) => {
	const id = box({id: b.box}), name = arg(b.name, MODEL_RE, 'model name');
	return startJob('load', `Load ${name}`, id, async (j) => { j.status = 'loading'; await ollamaGen(BOXES[id].ollama, {model: name, keep_alive: '15m'}, 300_000); return {ok: true}; });
});

// --- chat (server-sent events)
route('POST', '/api/chat', async ({req, res, b}) => {
	const model = arg(b.model, MODEL_RE, 'model');
	const base = b.target === 'auto' || !BOXES[b.target] ? ROUTER : BOXES[b.target].ollama;
	const messages = (Array.isArray(b.messages) ? b.messages : []).slice(-40)
		.filter((m) => ['user', 'assistant', 'system'].includes(m.role) && typeof m.content === 'string').map((m) => ({role: m.role, content: m.content.slice(0, 20000)}));
	if (!messages.length) throw fail(400, 'say something');
	const ac = new AbortController();
	res.on('close', () => ac.abort());
	const r = await fetch(base + '/api/chat', {method: 'POST', signal: ac.signal, headers: {'content-type': 'application/json', 'x-nuc-client': 'nuc-control'},
		body: JSON.stringify({model, messages, stream: true, ...(b.think ? {think: true} : {}), keep_alive: '10m'})});
	if (!r.ok) throw fail(502, (await r.text()).slice(0, 300) || `AI returned ${r.status}`);
	res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no'});
	const ev = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
	ev({start: Date.now(), via: base === ROUTER ? 'auto' : b.target});
	try {
		for await (const o of ndjson(r.body)) {
			if (o.error) { ev({error: o.error}); break; }
			if (o.message?.thinking) ev({th: o.message.thinking});
			if (o.message?.content) ev({t: o.message.content});
			if (o.done) ev({done: true, tokens: o.eval_count, tps: o.eval_duration ? round(o.eval_count / (o.eval_duration / 1e9), 1) : null, load: o.load_duration ? round(o.load_duration / 1e9, 1) : null});
		}
	} catch (e) { if (!ac.signal.aborted) ev({error: e.message}); }
	res.end();
	return undefined;
});

// --- benchmarks
route('GET', '/api/bench', () => ({results: readLines('bench.jsonl').slice(-300), jobs: [...jobs.values()].filter((j) => j.kind === 'bench')}));
route('POST', '/api/bench', ({b}) => {
	const id = box({id: b.box}), kind = arg(b.kind, /^(ai|cpu|disk)$/, 'kind');
	return {jobs: [runBench(kind, id, kind === 'ai' ? arg(b.model, MODEL_RE, 'model') : null)]};
});
route('POST', '/api/bench/suite', ({b}) => {
	const model = arg(b.model || 'qwen2.5:1.5b', MODEL_RE, 'model');
	return {jobs: Object.keys(BOXES).flatMap((id) => [runBench('cpu', id), runBench('disk', id), runBench('ai', id, model)])};
});
route('GET', '/api/jobs', () => ({jobs: [...jobs.values()].reverse()}));

// --- calls bot
route('GET', '/api/calls', async () => {
	const [s, c] = await Promise.all([getJson(CALLS + '/status', 5000), getJson(CALLS + '/calls', 8000)]);
	const calls = (c.calls || []).filter((x) => !x.removed).slice(-40).reverse().map((x) => ({
		ca: x.ca, symbol: x.symbol, name: x.name, image: x.image, at: x.calledAt, mcap: x.mcapAt, peak: x.peak, now: x.lastMcap,
		x: x.mcapAt && x.peak ? round(x.peak / x.mcapAt, 2) : null, cls: x.intel?.class || null, risk: x.intel?.risk, why: x.intel?.why,
		active: x.active, hit: x.scalpHit, by: x.by}));
	return {status: {ready: s.ready, bot: s.bot, uptimeSec: s.uptimeSec, rssMb: s.rssMb, host: s.host, scanner: s.scanner, watchdog: s.watchdog,
		calls: s.calls && {total: s.calls.total, active: s.calls.active, today: s.calls.today, scalp: s.calls.scalp, scalpToday: s.calls.scalpToday, classes: s.calls.classes},
		trends: s.trends}, summary: c.summary, calls};
});

// --- uptime
route('GET', '/api/uptime', () => ({checks: uptimeSummary(48), events: events.slice(-60).reverse()}));

// --- Claude / Codex keys
route('GET', '/api/keys', async () => {
	const out = {};
	await Promise.all(Object.keys(BOXES).map(async (id) => { try { out[id] = await ctl(id, ['keys', 'status']); } catch (e) { out[id] = {error: e.message}; } }));
	return out;
});
const PROVIDER = /^(anthropic|openai)$/;
route('POST', '/api/keys/test', async ({b}) => {
	const p = arg(b.provider, PROVIDER, 'provider'), key = String(b.key || '').trim();
	if (key.length < 20 || key.length > 300) throw fail(400, 'paste the whole key');
	const r = p === 'anthropic'
		? await fetch('https://api.anthropic.com/v1/models?limit=20', {headers: {'x-api-key': key, 'anthropic-version': '2023-06-01'}, signal: AbortSignal.timeout(12_000)})
		: await fetch('https://api.openai.com/v1/models', {headers: {authorization: `Bearer ${key}`}, signal: AbortSignal.timeout(12_000)});
	const j = await r.json().catch(() => ({}));
	if (!r.ok) return {ok: false, error: j.error?.message || `HTTP ${r.status}`};
	return {ok: true, models: (j.data || []).map((m) => m.id).slice(0, 8), count: j.data?.length || 0};
});
route('POST', '/api/keys', async ({b}) => {
	const p = arg(b.provider, PROVIDER, 'provider'), key = String(b.key || '').trim();
	const targets = (Array.isArray(b.boxes) ? b.boxes : []).filter((x) => BOXES[x]);
	if (!targets.length) throw fail(400, 'pick a server');
	const out = {};
	for (const id of targets) { try { out[id] = await ctl(id, ['keys', 'set', p], {stdin: key + '\n', timeout: 60_000}); } catch (e) { out[id] = {error: e.message}; } }
	return out;
});
route('POST', '/api/keys/clear', async ({b}) => {
	const p = arg(b.provider, PROVIDER, 'provider'), id = box({id: b.box});
	return ctl(id, ['keys', 'clear', p]);
});
route('POST', '/api/keys/claude-mode', ({b}) => ctl(box({id: b.box}), ['keys', 'claude-mode', 'anthropic', arg(b.mode, /^(api|local|login)$/, 'mode')]));

// ---------------------------------------------------------------- server

const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
	'.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon'};
const SEC = {'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
	'strict-transport-security': 'max-age=31536000', 'permissions-policy': 'camera=(), microphone=(), geolocation=()',
	'content-security-policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};

function serveStatic(req, res, pathname) {
	const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
	const f = path.join(PUB, path.normalize(rel));
	if (!f.startsWith(PUB) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
		res.writeHead(404, {'content-type': 'text/plain', ...SEC}); return res.end('not found');
	}
	const ext = path.extname(f);
	res.writeHead(200, {'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300', ...SEC});
	fs.createReadStream(f).pipe(res);
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, 'http://x');
	if (!url.pathname.startsWith('/api/')) return req.method === 'GET' ? serveStatic(req, res, url.pathname) : send(res, 405, {error: 'method'});
	for (const [k, v] of Object.entries(SEC)) res.setHeader(k, v);
	const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
	try {
		if (!r) throw fail(404, 'no such endpoint');
		if (r.opts.auth !== false) {
			if (!session(req)) throw fail(401, 'sign in');
			lastClient = Date.now();
		}
		// CSRF: writes need our own header (a cross-site form cannot set it) on top of the SameSite=Strict cookie
		if (req.method !== 'GET' && req.headers['x-nuc'] !== '1') throw fail(403, 'missing x-nuc header');
		const b = req.method === 'GET' ? {} : await body(req);
		const data = await r.fn({req, res, b, p: url.pathname.match(r.re).groups || {}, q: url.searchParams});
		if (data !== undefined && !res.headersSent) send(res, 200, data);
	} catch (e) {
		if (!e.status) console.error(req.method, url.pathname, e);
		if (!res.headersSent) send(res, e.status || 500, {error: e.status ? e.message : (e.name === 'TimeoutError' ? 'timed out' : e.message || 'server error')});
		else res.end();
	}
});

if (process.argv[2] === '--set-password') {
	const pw = fs.readFileSync(0, 'utf8').trim();
	if (pw.length < 10) { console.error('need at least 10 characters'); process.exit(1); }
	setPassword(pw); sessions = {}; saveSessions();
	console.log('password set; all sessions signed out');
	process.exit(0);
}
if (!fs.existsSync(AUTH)) { console.error(`no password yet: echo PASSWORD | node ${process.argv[1]} --set-password`); process.exit(1); }
server.listen(PORT, BIND, () => console.log(`NUC Control on http://${BIND}:${PORT}`));
pollLoop();
uptimeTick(); setInterval(uptimeTick, 60_000);
