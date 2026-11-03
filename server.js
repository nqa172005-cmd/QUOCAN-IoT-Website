/* QUOCAN IoT — ThingsBoard proxy, history, and protected website. Node.js >=22. */
const http = require('node:http');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = __dirname;
const envPath = path.join(root, '.env');
if (fsSync.existsSync(envPath)) {
  try { process.loadEnvFile(envPath); console.log('Đã đọc cấu hình .env'); }
  catch (error) { console.error('Không đọc được .env:', error.message); process.exit(1); }
}
const port = Number(process.env.PORT || 3000);
const base = (process.env.TB_BASE_URL || 'https://thingsboard.cloud').replace(/\/$/, '');
const keys = 'temperature,humidity,distance,step_count,fall_alert,activity_status';
const periods = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
const username = process.env.WEB_USERNAME || '';
const password = process.env.WEB_PASSWORD || '';
if (!process.env.TB_USERNAME || !process.env.TB_PASSWORD) {
  console.error("Thiếu cấu hình ThingsBoard");
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('PORT không hợp lệ'); process.exit(1); }

function equalConstantTime(a, b) {
  const left = crypto.createHash('sha256').update(a).digest();
  const right = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(left, right);
}
function authorized(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded;
  try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); }
  catch { return false; }
  const separator = decoded.indexOf(':');
  if (separator < 0) return false;
  return equalConstantTime(decoded.slice(0, separator), username) &&
    equalConstantTime(decoded.slice(separator + 1), password);
}
function challenge(res) {
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="QUOCAN IoT", charset="UTF-8"',
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end('Cần đăng nhập để xem QUOCAN IoT.');
}
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

let jwt = '';
let expiry = 0;
let deviceIdCache = '';
async function auth() {
  if (jwt && Date.now() < expiry) return jwt;
  const response = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.TB_USERNAME, password: process.env.TB_PASSWORD }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('ThingsBoard đăng nhập thất bại (HTTP ' + response.status + ')');
  const data = await response.json();
  if (!data.token) throw new Error('ThingsBoard không trả token');
  jwt = data.token;
  expiry = Date.now() + 5 * 60000;
  return jwt;
}
async function tb(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await auth();
    const response = await fetch(base + url, {
      headers: { 'X-Authorization': 'Bearer ' + token },
      signal: AbortSignal.timeout(20000)
    });
    if (response.status === 401 && attempt === 0) { jwt = ''; expiry = 0; continue; }
    if (!response.ok) throw new Error('ThingsBoard trả về HTTP ' + response.status);
    return response.json();
  }
  throw new Error('Không thể xác thực ThingsBoard');
}
async function getDeviceId() {
  if (process.env.TB_DEVICE_ID) return process.env.TB_DEVICE_ID.trim();
  if (deviceIdCache) return deviceIdCache;
  const deviceName = process.env.TB_DEVICE_NAME || 'QuocanIot';
  const device = await tb('/api/tenant/devices?deviceName=' + encodeURIComponent(deviceName));
  if (!device?.id?.id) throw new Error('Không tìm thấy thiết bị: ' + deviceName);
  deviceIdCache = device.id.id;
  return deviceIdCache;
}
async function getTelemetry() {
  const id = await getDeviceId();
  return tb('/api/plugins/telemetry/DEVICE/' + encodeURIComponent(id) + '/values/timeseries?keys=' + encodeURIComponent(keys));
}
async function getHistory(period) {
  if (!Object.hasOwn(periods, period)) throw new Error('Khoảng thời gian không hợp lệ');
  const endTs = Date.now();
  const startTs = endTs - periods[period];
  const interval = period === '24h' ? 900000 : period === '7d' ? 7200000 : 28800000;
  const id = await getDeviceId();
  const prefix = '/api/plugins/telemetry/DEVICE/' + encodeURIComponent(id) + '/values/timeseries';
  const params = new URLSearchParams({ keys: 'temperature,humidity,distance,step_count', startTs: String(startTs), endTs: String(endTs), interval: String(interval), agg: 'AVG', limit: '1000' });
  const history = await tb(prefix + '?' + params);
  const eventParams = new URLSearchParams({ keys: 'fall_alert', startTs: String(startTs), endTs: String(endTs), agg: 'NONE', limit: '10000' });
  const eventData = await tb(prefix + '?' + eventParams);
  return { period, startTs, endTs, interval, series: history, fallSamples: eventData.fall_alert || [], fallSamplesLimit: 10000 };
}
const routes = {
  '/': 'index.html', '/index.html': 'index.html',
  '/css/style.css': 'css/style.css', '/js/app.js': 'js/app.js'
};
const mimeTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const server = http.createServer(async (req, res) => {
  try {
    if (!authorized(req)) return challenge(res);
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Phương thức không được hỗ trợ' });
    if (url.pathname === '/api/telemetry') return sendJson(res, 200, await getTelemetry());
    if (url.pathname === '/api/history') {
      const period = url.searchParams.get('period') || url.searchParams.get('range') || '24h';
      if (!Object.hasOwn(periods, period)) return sendJson(res, 400, { error: 'Chọn 24h, 7d hoặc 30d' });
      return sendJson(res, 200, await getHistory(period));
    }
    const file = routes[url.pathname];
    if (!file) return sendJson(res, 404, { error: 'Không tìm thấy trang' });
    const content = await fs.readFile(path.join(root, file));
    res.writeHead(200, {
      'Content-Type': (mimeTypes[path.extname(file)] || 'text/plain') + '; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY'
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    console.error('Lỗi QUOCAN IoT:', error.message);
    sendJson(res, 502, { error: 'Không lấy được dữ liệu từ ThingsBoard. Kiểm tra cấu hình và nhật ký máy chủ.' });
  }
});
server.listen(port, '0.0.0.0', () => console.log('QUOCAN IoT đang chạy tại cổng ' + port));
