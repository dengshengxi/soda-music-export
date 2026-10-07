/**
 * 用无头 Edge + CDP 打开 biaoda.me 的分享页，等 JS 跑完，把渲染后的正文抓下来。
 * 注意：无头浏览器会随父进程一起被回收，所以"启动 + 打开 + 等待 + 抓取"必须写在同一个脚本里。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = parseInt(process.env.BD_PORT || '9445', 10);
const PROF = path.join(os.tmpdir(), 'bdprof' + PORT);
const URL = process.env.BD_URL || 'https://biaoda.me/video-script-breakdown/share?id=15392cc4-45c6-4f6c-9cde-8037de7d8f6c';
const OUT = path.join(__dirname, '_bd_render.txt');
const WAIT = parseInt(process.env.BD_WAIT || '15000', 10);

const log = (...a) => console.log('[' + new Date().toISOString().slice(11, 19) + ']', ...a);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitPort() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      if (r.ok) return await r.json();
    } catch (e) { /* 还没起来 */ }
    await sleep(500);
  }
  throw new Error('debug port never came up');
}

function withTimeout(p, ms, tag) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: ' + tag)), ms))]);
}

async function main() {
  log('launching edge, prof=' + PROF);
  const edge = spawn(EDGE, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--remote-allow-origins=*',
    '--user-data-dir=' + PROF,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,1000',
    '--no-proxy-server',
    'about:blank',
  ], { stdio: 'ignore', detached: false });

  const ver = await waitPort();
  log('edge up: ' + ver.Browser);

  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  const target = list.find(t => t.type === 'page');
  log('ws: ' + target.webSocketDebuggerUrl);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  log('ws connected');

  let id = 0;
  const pending = new Map();
  const netUrls = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result);
      return;
    }
    if (m.method === 'Network.responseReceived') {
      const u = (m.params && m.params.response && m.params.response.url) || '';
      if (u && !/\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf)(\?|$)/i.test(u)) netUrls.push(u);
    }
  };

  function send(method, params) {
    const myId = ++id;
    ws.send(JSON.stringify({ id: myId, method, params: params || {} }));
    return new Promise((res, rej) => {
      pending.set(myId, { res, rej });
      setTimeout(() => { if (pending.has(myId)) { pending.delete(myId); rej(new Error('req timeout ' + method)); } }, 30000);
    });
  }

  async function evalJs(expr) {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true, timeout: 20000,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description));
    return r.result && r.result.value;
  }

  await send('Network.enable');
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    platform: 'Win32',
  });

  log('navigating...');
  await withTimeout(send('Page.navigate', { url: URL }), 30000, 'navigate');
  await sleep(WAIT);
  log('waited ' + WAIT + 'ms');

  const info = await evalJs('JSON.stringify({url:location.href, title:document.title, len:(document.body?document.body.innerText.length:0)})');
  log('page: ' + info);

  const text = await evalJs('(document.body?document.body.innerText:"")');
  fs.writeFileSync(OUT, text, 'utf8');
  log('wrote ' + text.length + ' chars -> ' + OUT);

  // 顺手把所有非静态资源的请求 URL 也记下来，方便找 API
  fs.writeFileSync(path.join(__dirname, '_bd_net.txt'), netUrls.join('\n'), 'utf8');
  log('net urls: ' + netUrls.length);

  ws.close();
  edge.kill();
  log('done');
  process.exit(0);
}

main().catch(e => {
  console.error('FATAL', e && e.message);
  process.exit(1);
});
