import http from 'node:http';
import tls from 'node:tls';
import { readFile, writeFile, mkdir, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { deflateRawSync } from 'node:zlib';

const scrypt = promisify(scryptCallback);
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const ENV_FILE = join(ROOT, '.env');
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
const PUBLIC_DIR = join(ROOT, 'public');
const DATA_DIR = join(ROOT, 'data');
const UPLOAD_DIR = join(DATA_DIR, 'uploads');
const BODY_LIMIT = 30 * 1024 * 1024;
const SESSION_DAYS = 14;
const AUTH_VERIFICATION_TTL_MINUTES = 10;
const AUTH_VERIFICATION_TTL_MS = AUTH_VERIFICATION_TTL_MINUTES * 60_000;
const captchaStore = new Map();
const rateBuckets = new Map();
const INNOVATION_GROUP_PREFIXES = Object.freeze({
  'RECF-Achieve 创新初中组': 'RECF-A-CZ',
  'RECF-Achieve 创新高中组': 'RECF-A-GZ',
  'RECF-Engage 创新小学组': 'RECF-E-XX',
  'RECF-Engage 创新初中组': 'RECF-E-CZ',
  'RECF-Inspire 创新大学组': 'RECF-I-DX',
});
const DEFAULT_EVENT_GROUPS = Object.freeze([
  'RECF-Achieve 初中组',
  'RECF-Achieve 高中组',
  'RECF-Engage 小学组',
  'RECF-Engage 初中组',
  'RECF-Inspire 大学组',
  'RECF-Achieve 创新初中组',
  'RECF-Achieve 创新高中组',
  'RECF-Engage 创新小学组',
  'RECF-Engage 创新初中组',
  'RECF-Inspire 创新大学组',
]);
const DUPLICATE_TEAM_NUMBER_MESSAGE = '该战队编号已被其他队伍注册（已被占用）\n\n如果您输入的确实是 RECF 官方分配给您的战队编号，但系统提示已被占用，请联系组委会协助核实处理：\n\n组委会邮箱：654849662@qq.com\n\n咨询电话：13761393714（小周老师）';
const CANCELLED_REGISTRATION_REAPPLY_MESSAGE = '您的赛队已取消参赛，若要重新参赛，请于右上角下拉栏 -> 我的比赛 -> 对应比赛打开列表 -> 重新申请参赛';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
};

const json = (res, status, payload, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(payload));
};

const fail = (status, message, fields) => Object.assign(new Error(message), { status, fields });
const nowIso = () => new Date().toISOString();
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const cleanText = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validPhone = (phone) => !phone || /^[+\d\s()-]{6,24}$/.test(phone);
const validUsername = (username) => /^[\p{L}\p{N}_-]{2,32}$/u.test(username);
const booleanFlag = (value) => value === true || value === 1 || value === '1' || value === 'true';
const htmlEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const PLATFORM_NAME = '美国机器人教育与竞赛基金会（RECF）授权上海瑞卜德教育科技有限公司赛事报名平台';
const TEAM_NUMBER_MAX_LENGTH = 30;
const REFUND_REQUEST_MAX_COUNT = 2;
const TEAM_NUMBER_FORMAT_MESSAGE = '请输入 1–30 个 ASCII 字符，不可包含空格或中文';
const AUTO_MAIL_NOTICE_ZH = '发送邮箱为自动邮箱，请勿回复。';
const AUTO_MAIL_NOTICE_EN = 'This email is sent from an automated mailbox, please do not reply.';
function normalizeTeamNumber(groupName, value) {
  const group = cleanText(groupName, 80);
  const raw = cleanText(value, 80);
  if (!group) throw fail(422, '请选择有效的战队组别', { group_name: '请选择战队组别' });
  const prefix = INNOVATION_GROUP_PREFIXES[group];
  const knownPrefix = Object.values(INNOVATION_GROUP_PREFIXES).find((item) => raw.toUpperCase().startsWith(item));
  const suffix = prefix ? (knownPrefix ? raw.slice(knownPrefix.length) : raw).trim() : raw;
  const finalNumber = prefix ? `${prefix}${suffix}` : raw;
  if ((prefix && !suffix) || !/^[\x21-\x7E]+$/.test(finalNumber) || finalNumber.length > TEAM_NUMBER_MAX_LENGTH) {
    throw fail(422, prefix ? '创新组编号格式不正确' : '战队编号格式不正确', { number: TEAM_NUMBER_FORMAT_MESSAGE });
  }
  return finalNumber;
}

function ensureUniqueTeamNumber(db, number, excludeId = 0) {
  const duplicate = db.prepare('SELECT id FROM teams WHERE number=? AND id<>?').get(number, Number(excludeId) || 0);
  if (duplicate) throw fail(409, DUPLICATE_TEAM_NUMBER_MESSAGE, { number: DUPLICATE_TEAM_NUMBER_MESSAGE });
}

const noticeDate = (value, fallback = '以赛事页面公布时间为准') => {
  const text = cleanText(value, 80);
  const parts = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return parts ? `${parts[1]}年${Number(parts[2])}月${Number(parts[3])}日 ${parts[4]}:${parts[5]}` : (text || fallback);
};
const defaultNoticeMarkdown = (event = {}) => `# 关于举办 ${event.title || '青少年机器人赛事'} 的通知

为做好本次赛事组织工作，现将有关事项通知如下。

## 一、赛事安排

- **比赛时间：** ${noticeDate(event.starts_at)} 至 ${noticeDate(event.ends_at)}
- **比赛地点：** ${event.location || '以赛事页面公布地点为准'}
- **报名时间：** ${noticeDate(event.registration_start)} 至 ${noticeDate(event.registration_end)}

## 二、参赛对象

面向符合赛事组别要求的学校、机构及独立战队开放报名。

## 三、报名办法

请先在网站完善教练、队员和战队资料，再进入赛事详情页选择参赛组别与战队，上传参赛费支付凭证后提交审核。

## 四、注意事项

1. 请确保报名资料真实、完整，证件信息仅用于赛事审核。
2. 报名状态为“待审核”或“已驳回”时可修改；审核通过后资料将锁定。
3. 组委会将通过报名账号预留的联系方式发布后续通知。

## 五、联系方式

- **联系人：** ${event.contact_name || '小周老师'}
- **电话：** ${event.contact_phone || '13761393714'}
`;
const required = (body, names) => {
  const fields = {};
  for (const name of names) if (!cleanText(body[name])) fields[name] = '此项为必填项';
  if (Object.keys(fields).length) throw fail(422, '请完善必填信息', fields);
};

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64);
  return { salt, hash: Buffer.from(derived).toString('hex') };
}

async function verifyPassword(password, salt, expectedHex) {
  const { hash } = await hashPassword(password, salt);
  const actual = Buffer.from(hash, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((pair) => {
    const index = pair.indexOf('=');
    return [pair.slice(0, index).trim(), decodeURIComponent(pair.slice(index + 1))];
  }));
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

async function bodyJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw fail(413, '提交内容过大，单次请求不得超过 30MB');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw fail(400, '请求内容不是有效的 JSON'); }
}

function allowRate(key, max, windowMs) {
  const now = Date.now();
  const bucket = (rateBuckets.get(key) || []).filter((time) => time > now - windowMs);
  if (bucket.length >= max) return false;
  bucket.push(now);
  rateBuckets.set(key, bucket);
  return true;
}

function pruneTransientStores() {
  const now = Date.now();
  for (const [id, item] of captchaStore) if (item.expires <= now) captchaStore.delete(id);
  for (const [key, times] of rateBuckets) {
    const active = times.filter((time) => time > now - 24 * 60 * 60_000);
    if (active.length) rateBuckets.set(key, active); else rateBuckets.delete(key);
  }
  while (captchaStore.size > 2_000) captchaStore.delete(captchaStore.keys().next().value);
}

function hashMatches(value, expectedHash) {
  if (!expectedHash) return false;
  const actual = Buffer.from(sha256(value), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function maskEmail(email) {
  const [local = '', domain = ''] = String(email).split('@');
  const visible = local.slice(0, Math.min(2, local.length));
  const masked = '*'.repeat(Math.max(2, Math.min(6, local.length - visible.length)));
  return `${visible}${masked}@${domain}`;
}

function smtpAddress(value, fallback = '') {
  const text = String(value || '').trim();
  const bracketed = text.match(/<([^<>\s]+@[^<>\s]+)>/);
  return (bracketed?.[1] || text || fallback).trim();
}

function mimeBase64(value) {
  return Buffer.from(String(value), 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
}

function smtpMessage({ to, subject, text, html, fromAddress, fromName }) {
  const boundary = `ruibude-${randomBytes(16).toString('hex')}`;
  const encodedName = `=?UTF-8?B?${Buffer.from(fromName, 'utf8').toString('base64')}?=`;
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  const messageId = `<${Date.now()}.${randomBytes(8).toString('hex')}@${fromAddress.split('@')[1] || 'localhost'}>`;
  const lines = [
    `From: ${encodedName} <${fromAddress}>`,
    `To: <${to}>`,
    `Subject: ${encodedSubject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    mimeBase64(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    mimeBase64(html),
    `--${boundary}--`,
    '',
  ];
  return lines.join('\r\n').replace(/^\./gm, '..');
}

async function sendSmtpEmail({ to, subject, text, html }) {
  const host = cleanText(process.env.SMTP_HOST || 'smtp.exmail.qq.com', 200);
  const port = Number(process.env.SMTP_PORT || 465);
  const user = cleanText(process.env.SMTP_USER, 200);
  const password = String(process.env.SMTP_PASS || '');
  const fromAddress = smtpAddress(process.env.SMTP_FROM, user);
  const fromName = cleanText(process.env.SMTP_FROM_NAME || PLATFORM_NAME, 100);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !validEmail(user) || !password || !validEmail(fromAddress)) {
    throw fail(503, 'SMTP 邮件配置不完整');
  }

  const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
  socket.setTimeout(10_000, () => socket.destroy(new Error('SMTP timeout')));
  const lines = createInterface({ input: socket, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();

  const readResponse = async () => {
    const responseLines = [];
    while (true) {
      const result = await Promise.race([
        iterator.next(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP response timeout')), 10_000)),
      ]);
      if (result.done) throw new Error('SMTP connection closed');
      responseLines.push(result.value);
      if (/^\d{3} /.test(result.value)) return { status: Number(result.value.slice(0, 3)), lines: responseLines };
    }
  };

  const expect = async (accepted, command) => {
    if (command !== undefined) socket.write(`${command}\r\n`);
    const response = await readResponse();
    if (!accepted.includes(response.status)) throw new Error(`SMTP server returned ${response.status}`);
    return response;
  };

  try {
    await new Promise((resolveConnect, rejectConnect) => {
      socket.once('secureConnect', resolveConnect);
      socket.once('error', rejectConnect);
    });
    await expect([220]);
    await expect([250], `EHLO ${cleanText(process.env.SMTP_HELO || 'registration.shanghairoboteducation.com', 200)}`);
    await expect([334], 'AUTH LOGIN');
    await expect([334], Buffer.from(user).toString('base64'));
    await expect([235], Buffer.from(password).toString('base64'));
    await expect([250], `MAIL FROM:<${fromAddress}>`);
    await expect([250, 251], `RCPT TO:<${to}>`);
    await expect([354], 'DATA');
    await expect([250], `${smtpMessage({ to, subject, text, html, fromAddress, fromName })}\r\n.`);
    await expect([221], 'QUIT').catch(() => {});
  } catch (error) {
    throw fail(502, `邮件发送失败：${error.message}`);
  } finally {
    lines.close();
    socket.destroy();
  }
}

function hasConfiguredMailTransport() {
  return Boolean(process.env.EMAIL_WEBHOOK_URL || process.env.SMTP_PASS);
}

function shouldExposeEmailDevCode() {
  return process.env.NODE_ENV === 'test' || (process.env.NODE_ENV !== 'production' && !hasConfiguredMailTransport());
}

export function verificationCodeEmailPayload(code) {
  const value = cleanText(code, 20);
  const zh = `您的验证码为${value}，有效期为10分钟。${AUTO_MAIL_NOTICE_ZH}`;
  const en = `Your verification code is ${value} and is valid for ten minutes. ${AUTO_MAIL_NOTICE_EN}`;
  return {
    text: `${zh}\n${en}`,
    html: `<p>您的验证码为<strong>${htmlEscape(value)}</strong>，有效期为10分钟。${htmlEscape(AUTO_MAIL_NOTICE_ZH)}</p><p>Your verification code is <strong>${htmlEscape(value)}</strong> and is valid for ten minutes. ${htmlEscape(AUTO_MAIL_NOTICE_EN)}</p>`,
  };
}

function withAutoMailNotice({ text = '', html = '' }) {
  const baseText = String(text || '').trimEnd();
  const missingText = [];
  if (!baseText.includes(AUTO_MAIL_NOTICE_ZH)) missingText.push(AUTO_MAIL_NOTICE_ZH);
  if (!baseText.includes(AUTO_MAIL_NOTICE_EN)) missingText.push(AUTO_MAIL_NOTICE_EN);
  const nextText = missingText.length ? `${baseText}${baseText ? '\n\n' : ''}${missingText.join('\n')}` : baseText;
  const baseHtml = String(html || '').trimEnd();
  const missingHtml = [];
  if (!baseHtml.includes(AUTO_MAIL_NOTICE_ZH)) missingHtml.push(htmlEscape(AUTO_MAIL_NOTICE_ZH));
  if (!baseHtml.includes(AUTO_MAIL_NOTICE_EN)) missingHtml.push(htmlEscape(AUTO_MAIL_NOTICE_EN));
  const noticeHtml = missingHtml.length ? `<p style="margin-top:16px;color:#6b7280;font-size:13px;">${missingHtml.join('<br>')}</p>` : '';
  const nextHtml = noticeHtml ? `${baseHtml}${noticeHtml}` : baseHtml;
  return { text: nextText, html: nextHtml };
}

export async function sendEmailMessage({ to, subject, text, html }) {
  ({ text, html } = withAutoMailNotice({ text, html }));
  if (process.env.NODE_ENV === 'test') return;
  if (process.env.EMAIL_WEBHOOK_URL) {
    const response = await fetch(process.env.EMAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ to, subject, text, html }),
    });
    if (!response.ok) throw fail(502, '邮件服务暂时不可用，请稍后重试');
    return;
  }
  if (process.env.SMTP_PASS) {
    await sendSmtpEmail({ to, subject, text, html });
    return;
  }
  if (process.env.NODE_ENV === 'production' && (process.env.SMTP_USER || process.env.SMTP_HOST)) throw fail(503, 'SMTP 邮件配置不完整');
  if (process.env.NODE_ENV === 'production') throw fail(503, '邮件服务尚未配置');
}

function createLoginSession(db, user) {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  db.prepare('INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?)')
    .run(sha256(token), user.id, csrf, expires, nowIso());
  return { token, csrf };
}

function withTransaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const CAPTCHA_GLYPHS = {
  A:['01110','10001','10001','11111','10001','10001','10001'], B:['11110','10001','10001','11110','10001','10001','11110'],
  C:['01111','10000','10000','10000','10000','10000','01111'], D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'], F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01111','10000','10000','10111','10001','10001','01110'], H:['10001','10001','10001','11111','10001','10001','10001'],
  J:['00111','00010','00010','00010','00010','10010','01100'], K:['10001','10010','10100','11000','10100','10010','10001'],
  L:['10000','10000','10000','10000','10000','10000','11111'], M:['10001','11011','10101','10101','10001','10001','10001'],
  N:['10001','11001','10101','10011','10001','10001','10001'], P:['11110','10001','10001','11110','10000','10000','10000'],
  Q:['01110','10001','10001','10001','10101','10010','01101'], R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'], T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'], V:['10001','10001','10001','10001','10001','01010','00100'],
  W:['10001','10001','10001','10101','10101','10101','01010'], X:['10001','10001','01010','00100','01010','10001','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'], Z:['11111','00001','00010','00100','01000','10000','11111'],
  2:['01110','10001','00001','00010','00100','01000','11111'], 3:['11110','00001','00001','01110','00001','00001','11110'],
  4:['00010','00110','01010','10010','11111','00010','00010'], 5:['11111','10000','10000','11110','00001','00001','11110'],
  6:['01110','10000','10000','11110','10001','10001','01110'], 7:['11111','00001','00010','00100','01000','01000','01000'],
  8:['01110','10001','10001','01110','10001','10001','01110'], 9:['01110','10001','10001','01111','00001','00001','01110'],
};
const CAPTCHA_ALPHABET = Object.keys(CAPTCHA_GLYPHS);

function captchaSvg(code) {
  const colors = ['#1e3a5f', '#2563eb', '#0f766e', '#7c3aed'];
  const glyphs = [...code].map((char, index) => {
    const blocks = [];
    CAPTCHA_GLYPHS[char].forEach((row, y) => [...row].forEach((pixel, x) => {
      if (pixel === '1') blocks.push(`<rect x="${x * 3.2}" y="${y * 4.7}" width="3.5" height="5" rx=".7"/>`);
    }));
    const x = 15 + index * 31;
    return `<g fill="${colors[index % colors.length]}" transform="translate(${x} 9) rotate(${randomInt(-7, 8)} 8 16)">${blocks.join('')}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="52" viewBox="0 0 150 52" role="img" aria-label="图形验证码"><rect width="150" height="52" rx="8" fill="#eef3f8"/><path d="M4 15 L146 39 M8 43 L142 9" stroke="#9fb2c8" stroke-width="1.4" opacity=".8"/>${glyphs}</svg>`;
}

function rowsWithJson(rows, fields = []) {
  return rows.map((row) => {
    const copy = { ...row };
    for (const field of fields) {
      try { copy[field] = JSON.parse(copy[field] || '[]'); } catch { copy[field] = []; }
    }
    return copy;
  });
}

class AppDatabase {
  constructor(dbPath) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
        admin_level TEXT NOT NULL DEFAULT 'none' CHECK(admin_level IN ('none','mid','super')),
        nickname TEXT DEFAULT '', contact_name TEXT DEFAULT '', phone TEXT DEFAULT '',
        id_number TEXT DEFAULT '', org_name TEXT DEFAULT '', org_address TEXT DEFAULT '',
        org_intro TEXT DEFAULT '', avatar_url TEXT DEFAULT '', created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS verification_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL COLLATE NOCASE,
        code_hash TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS login_challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS password_reset_challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('avatar','member','payment','event','notice','notice_image')),
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL, gender TEXT NOT NULL, grade TEXT NOT NULL, school TEXT NOT NULL,
        id_number TEXT NOT NULL, photo_url TEXT NOT NULL, phone TEXT NOT NULL,
        city TEXT DEFAULT '', province TEXT DEFAULT '', nationality TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS coaches (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL, gender TEXT NOT NULL, phone TEXT NOT NULL, org_name TEXT NOT NULL,
        email TEXT NOT NULL, city TEXT DEFAULT '', province TEXT DEFAULT '', nationality TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        number TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, group_name TEXT NOT NULL,
        school_name TEXT NOT NULL, school_name_en TEXT DEFAULT '', address TEXT DEFAULT '', address_en TEXT DEFAULT '',
        city TEXT DEFAULT '', province TEXT DEFAULT '', nationality TEXT NOT NULL,
        contact_coach_id INTEGER NOT NULL REFERENCES coaches(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS team_members (
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        member_id INTEGER NOT NULL REFERENCES members(id), PRIMARY KEY(team_id, member_id)
      );
      CREATE TABLE IF NOT EXISTS team_coaches (
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        coach_id INTEGER NOT NULL REFERENCES coaches(id), PRIMARY KEY(team_id, coach_id)
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, published_at TEXT NOT NULL,
        image_url TEXT DEFAULT '', description TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
        contact_name TEXT NOT NULL, contact_phone TEXT NOT NULL, location TEXT NOT NULL,
        registration_start TEXT NOT NULL, registration_end TEXT NOT NULL,
        refund_deadline_days INTEGER NOT NULL DEFAULT 10 CHECK(refund_deadline_days BETWEEN 0 AND 365),
        groups_json TEXT NOT NULL,
        allow_volunteer INTEGER NOT NULL DEFAULT 0 CHECK(allow_volunteer IN (0,1)),
        allow_spectator INTEGER NOT NULL DEFAULT 0 CHECK(allow_spectator IN (0,1)),
        payee TEXT NOT NULL, account_no TEXT NOT NULL, bank_code TEXT DEFAULT '', bank_name TEXT NOT NULL,
        notice_url TEXT DEFAULT '', notice_markdown TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published')),
        created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        team_id INTEGER NOT NULL REFERENCES teams(id), user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_name TEXT NOT NULL, payment_proof_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
        rejection_reason TEXT DEFAULT '', award_info TEXT DEFAULT '', reviewed_by INTEGER REFERENCES users(id),
        reviewed_at TEXT, cancelled_at TEXT, cancellation_reason TEXT DEFAULT '',
        refund_status TEXT NOT NULL DEFAULT 'none' CHECK(refund_status IN ('none','requested','approved','rejected')),
        refund_reason TEXT DEFAULT '', refund_requested_at TEXT,
        refund_reviewed_by INTEGER REFERENCES users(id), refund_reviewed_at TEXT, refund_note TEXT DEFAULT '',
        refund_request_count INTEGER NOT NULL DEFAULT 0 CHECK(refund_request_count BETWEEN 0 AND 2),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(event_id, team_id)
      );
      CREATE TABLE IF NOT EXISTS activity_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN ('volunteer','spectator')),
        name TEXT NOT NULL,
        gender TEXT NOT NULL,
        id_number TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        organization TEXT DEFAULT '',
        volunteer_role TEXT DEFAULT '',
        availability TEXT DEFAULT '',
        experience TEXT DEFAULT '',
        attendee_count INTEGER NOT NULL DEFAULT 1 CHECK(attendee_count BETWEEN 1 AND 6),
        companion_names TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
        rejection_reason TEXT DEFAULT '',
        reviewed_by INTEGER REFERENCES users(id),
        reviewed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(event_id, user_id, type)
      );
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    const uploadsTable = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='uploads'").get()?.sql || '';
    if (uploadsTable && !uploadsTable.includes("'notice_image'")) {
      this.db.exec(`
        CREATE TABLE uploads_next (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT NOT NULL UNIQUE,
          owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK(kind IN ('avatar','member','payment','event','notice','notice_image')),
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );
        INSERT INTO uploads_next(id,url,owner_user_id,kind,mime_type,size_bytes,created_at)
          SELECT id,url,owner_user_id,kind,mime_type,size_bytes,created_at FROM uploads;
        DROP TABLE uploads;
        ALTER TABLE uploads_next RENAME TO uploads;
      `);
    }
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_member_user ON members(user_id);
      CREATE INDEX IF NOT EXISTS idx_login_challenge_user ON login_challenges(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_challenges(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_coach_user ON coaches(user_id);
      CREATE INDEX IF NOT EXISTS idx_team_user ON teams(user_id);
      CREATE INDEX IF NOT EXISTS idx_registration_user ON registrations(user_id);
      CREATE INDEX IF NOT EXISTS idx_registration_event ON registrations(event_id);
      CREATE INDEX IF NOT EXISTS idx_activity_application_user ON activity_applications(user_id, type);
      CREATE INDEX IF NOT EXISTS idx_activity_application_event ON activity_applications(event_id, status);
      CREATE INDEX IF NOT EXISTS idx_upload_owner ON uploads(owner_user_id, created_at);
    `);
    const userColumns = this.db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
    if (!userColumns.includes('username')) this.db.exec("ALTER TABLE users ADD COLUMN username TEXT NOT NULL DEFAULT '' COLLATE NOCASE");
    if (!userColumns.includes('admin_level')) {
      this.db.exec("ALTER TABLE users ADD COLUMN admin_level TEXT NOT NULL DEFAULT 'none' CHECK(admin_level IN ('none','mid','super'))");
      this.db.exec("UPDATE users SET admin_level='mid' WHERE role='admin'");
      const firstAdmin = this.db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
      if (firstAdmin) this.db.prepare("UPDATE users SET admin_level='super' WHERE id=?").run(firstAdmin.id);
    }
    this.db.exec("UPDATE users SET admin_level='none' WHERE role='user'; UPDATE users SET admin_level='mid' WHERE role='admin' AND admin_level='none'");
    if (!this.db.prepare("SELECT 1 FROM users WHERE role='admin' AND admin_level='super' LIMIT 1").get()) {
      const firstAdmin = this.db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
      if (firstAdmin) this.db.prepare("UPDATE users SET admin_level='super' WHERE id=?").run(firstAdmin.id);
    }
    const usersWithoutUsername = this.db.prepare("SELECT id,email FROM users WHERE TRIM(username)='' ORDER BY id").all();
    const usernameTaken = this.db.prepare('SELECT 1 FROM users WHERE username=? COLLATE NOCASE AND id<>?');
    const updateUsername = this.db.prepare('UPDATE users SET username=? WHERE id=?');
    for (const user of usersWithoutUsername) {
      const localPart = String(user.email || '').split('@')[0];
      const normalized = [...localPart].filter((char) => /[\p{L}\p{N}_-]/u.test(char)).join('').slice(0, 24);
      const base = normalized.length >= 2 ? normalized : `user${user.id}`;
      let candidate = base;
      let suffix = 0;
      while (usernameTaken.get(candidate, user.id)) {
        suffix += 1;
        candidate = `${base.slice(0, Math.max(2, 28 - String(suffix).length))}-${suffix}`;
      }
      updateUsername.run(candidate, user.id);
    }
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username COLLATE NOCASE)');
    const eventColumns = this.db.prepare('PRAGMA table_info(events)').all().map((column) => column.name);
    if (!eventColumns.includes('notice_markdown')) {
      this.db.exec("ALTER TABLE events ADD COLUMN notice_markdown TEXT NOT NULL DEFAULT ''");
      const legacyEvents = this.db.prepare('SELECT id,title,starts_at,ends_at,location,registration_start,registration_end,contact_name,contact_phone FROM events').all();
      const updateNotice = this.db.prepare('UPDATE events SET notice_markdown=? WHERE id=?');
      for (const event of legacyEvents) updateNotice.run(defaultNoticeMarkdown(event), event.id);
    }
    if (!eventColumns.includes('allow_volunteer')) this.db.exec('ALTER TABLE events ADD COLUMN allow_volunteer INTEGER NOT NULL DEFAULT 0 CHECK(allow_volunteer IN (0,1))');
    if (!eventColumns.includes('allow_spectator')) this.db.exec('ALTER TABLE events ADD COLUMN allow_spectator INTEGER NOT NULL DEFAULT 0 CHECK(allow_spectator IN (0,1))');
    if (!eventColumns.includes('refund_deadline_days')) this.db.exec('ALTER TABLE events ADD COLUMN refund_deadline_days INTEGER NOT NULL DEFAULT 10 CHECK(refund_deadline_days BETWEEN 0 AND 365)');
    const registrationColumns = this.db.prepare('PRAGMA table_info(registrations)').all().map((column) => column.name);
    if (!registrationColumns.includes('cancelled_at')) this.db.exec('ALTER TABLE registrations ADD COLUMN cancelled_at TEXT');
    if (!registrationColumns.includes('cancellation_reason')) this.db.exec("ALTER TABLE registrations ADD COLUMN cancellation_reason TEXT DEFAULT ''");
    if (!registrationColumns.includes('refund_status')) this.db.exec("ALTER TABLE registrations ADD COLUMN refund_status TEXT NOT NULL DEFAULT 'none'");
    if (!registrationColumns.includes('refund_reason')) this.db.exec("ALTER TABLE registrations ADD COLUMN refund_reason TEXT DEFAULT ''");
    if (!registrationColumns.includes('refund_requested_at')) this.db.exec('ALTER TABLE registrations ADD COLUMN refund_requested_at TEXT');
    if (!registrationColumns.includes('refund_reviewed_by')) this.db.exec('ALTER TABLE registrations ADD COLUMN refund_reviewed_by INTEGER');
    if (!registrationColumns.includes('refund_reviewed_at')) this.db.exec('ALTER TABLE registrations ADD COLUMN refund_reviewed_at TEXT');
    if (!registrationColumns.includes('refund_note')) this.db.exec("ALTER TABLE registrations ADD COLUMN refund_note TEXT DEFAULT ''");
    if (!registrationColumns.includes('refund_request_count')) {
      this.db.exec('ALTER TABLE registrations ADD COLUMN refund_request_count INTEGER NOT NULL DEFAULT 0');
      this.db.exec("UPDATE registrations SET refund_request_count=1 WHERE COALESCE(refund_status,'none')<>'none'");
    }
    if (!this.db.prepare("SELECT 1 FROM app_meta WHERE key='innovation-groups-v1'").get()) {
      const events = this.db.prepare('SELECT id,groups_json FROM events').all();
      const updateGroups = this.db.prepare('UPDATE events SET groups_json=? WHERE id=?');
      for (const event of events) {
        let groups = [];
        try { groups = JSON.parse(event.groups_json || '[]'); } catch {}
        const merged = [...new Set([...groups, ...Object.keys(INNOVATION_GROUP_PREFIXES)])];
        updateGroups.run(JSON.stringify(merged), event.id);
      }
      this.db.prepare("INSERT INTO app_meta(key,value) VALUES('innovation-groups-v1',?)").run(nowIso());
    }
    if (!this.db.prepare("SELECT 1 FROM app_meta WHERE key='recf-groups-v2'").get()) {
      this.db.prepare('UPDATE events SET groups_json=?').run(JSON.stringify(DEFAULT_EVENT_GROUPS));
      const legacyGroups = [
        ['V5RC小学组', 'RECF-Engage 小学组', '', ''],
        ['V5RC初中组', 'RECF-Achieve 初中组', '', ''],
        ['V5RC高中组', 'RECF-Achieve 高中组', '', ''],
        ['VEX U大学组', 'RECF-Inspire 大学组', '', ''],
        ['创新小学组', 'RECF-Engage 创新小学组', 'CXXX', 'RECF-E-XX'],
        ['创新初中组', 'RECF-Achieve 创新初中组', 'CXCZ', 'RECF-A-CZ'],
        ['创新高中组', 'RECF-Achieve 创新高中组', 'CXGZ', 'RECF-A-GZ'],
        ['创新大学组', 'RECF-Inspire 创新大学组', 'CXDX', 'RECF-I-DX'],
      ];
      for (const [legacyGroup, currentGroup, legacyPrefix, currentPrefix] of legacyGroups) {
        if (legacyPrefix) {
          const teams = this.db.prepare('SELECT id,number FROM teams WHERE group_name=?').all(legacyGroup);
          const updateTeam = this.db.prepare('UPDATE teams SET number=?,group_name=?,updated_at=? WHERE id=?');
          for (const team of teams) {
            const suffix = team.number.toUpperCase().startsWith(legacyPrefix) ? team.number.slice(legacyPrefix.length) : team.number;
            updateTeam.run(`${currentPrefix}${suffix}`, currentGroup, nowIso(), team.id);
          }
        } else {
          this.db.prepare('UPDATE teams SET group_name=?,updated_at=? WHERE group_name=?').run(currentGroup, nowIso(), legacyGroup);
        }
        this.db.prepare('UPDATE registrations SET group_name=?,updated_at=? WHERE group_name=?').run(currentGroup, nowIso(), legacyGroup);
      }
      this.db.prepare("INSERT INTO app_meta(key,value) VALUES('recf-groups-v2',?)").run(nowIso());
    }
  }

  async seed() {
    const production = process.env.NODE_ENV === 'production';
    if (!this.db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
      const created = nowIso();
      const users = production
        ? [{ username: 'admin', email: cleanText(process.env.ADMIN_EMAIL, 160).toLowerCase(), password: String(process.env.ADMIN_PASSWORD || ''), role: 'admin', nickname: '赛事管理员' }]
        : [
            { username: 'admin', email: 'admin@ruibude.local', password: 'Admin123!', role: 'admin', nickname: '赛事管理员' },
            { username: 'demo', email: 'demo@ruibude.local', password: 'Demo123!', role: 'user', nickname: '演示用户' },
          ];
      if (production && (!validEmail(users[0].email) || users[0].password.length < 12)) {
        throw new Error('生产环境首次启动必须设置 ADMIN_EMAIL 与至少 12 位的 ADMIN_PASSWORD');
      }
      for (const user of users) {
        const credential = await hashPassword(user.password);
        this.db.prepare('INSERT INTO users(username,email,password_hash,password_salt,role,admin_level,nickname,created_at) VALUES(?,?,?,?,?,?,?,?)')
          .run(user.username, user.email, credential.hash, credential.salt, user.role, user.role === 'admin' ? 'super' : 'none', user.nickname, created);
      }
    }
    if (!production && !this.db.prepare('SELECT 1 FROM events LIMIT 1').get()) {
      const admin = this.db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
      const groups = JSON.stringify(DEFAULT_EVENT_GROUPS);
      const insert = this.db.prepare(`INSERT INTO events
        (title,published_at,image_url,description,starts_at,ends_at,contact_name,contact_phone,location,registration_start,registration_end,groups_json,payee,account_no,bank_code,bank_name,notice_url,notice_markdown,status,created_by,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const common = ['上海瑞卜德教育科技有限公司', '153189255', '', '中国民生银行股份有限公司上海凯旋支行'];
      const events = [
        ['2026-2027赛季青少年机器人城市挑战赛（深圳站）','2026-08-10T09:00:00+08:00','/assets/event-shenzhen.svg','面向青少年机器人队伍的城市挑战赛，设置小学、初中、高中与大学组别。欢迎学校、机构与独立战队报名。','2026-09-26T09:00:00+08:00','2026-09-27T18:00:00+08:00','小周老师','13761393714','深圳湾体育中心','2026-08-10T09:00:00+08:00','2026-09-20T00:00:00+08:00'],
        ['2026-2027赛季机器人全国邀请赛（杭州）','2026-08-12T09:00:00+08:00','/assets/event-hangzhou.svg','全国邀请赛汇聚各地优秀青少年机器人战队，强调工程设计、程序创新与团队协作。','2026-12-17T09:00:00+08:00','2026-12-20T18:00:00+08:00','小周老师','13761393714','杭州国际博览中心','2026-08-15T09:00:00+08:00','2026-11-30T18:00:00+08:00'],
        ['2026夏季机器人公开交流赛','2026-06-01T09:00:00+08:00','/assets/event-summer.svg','夏季机器人公开交流赛已圆满结束，报名记录仍可在个人中心查询。','2026-07-19T09:00:00+08:00','2026-07-20T18:00:00+08:00','小周老师','13761393714','上海科技馆','2026-06-01T09:00:00+08:00','2026-07-10T18:00:00+08:00'],
      ];
      for (const event of events) {
        const [title, published_at, image_url, description, starts_at, ends_at, contact_name, contact_phone, location, registration_start, registration_end] = event;
        const noticeMarkdown = defaultNoticeMarkdown({ title, starts_at, ends_at, contact_name, contact_phone, location, registration_start, registration_end });
        insert.run(...event, groups, ...common, '', noticeMarkdown, 'published', admin?.id || null, nowIso(), nowIso());
      }
    }
    const demo = production ? null : this.db.prepare("SELECT id FROM users WHERE email='demo@ruibude.local'").get();
    if (demo && !this.db.prepare('SELECT 1 FROM coaches WHERE user_id=?').get(demo.id)) {
      const ts = nowIso();
      const coach = this.db.prepare('INSERT INTO coaches(user_id,name,gender,phone,org_name,email,city,province,nationality,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(demo.id, '李老师', '女', '13800000001', '星航青少年科技中心', 'coach@example.com', '深圳市', '广东省', '中国', ts);
      const member = this.db.prepare('INSERT INTO members(user_id,name,gender,grade,school,id_number,photo_url,phone,city,province,nationality,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(demo.id, '张小航', '男', '初中', '南山实验学校', '440300201201010018', '/assets/avatar-member.svg', '13800000002', '深圳市', '广东省', '中国', ts);
      const team = this.db.prepare('INSERT INTO teams(user_id,number,name,group_name,school_name,school_name_en,address,address_en,city,province,nationality,contact_coach_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(demo.id, 'XN-2401', '星航战队', 'RECF-Achieve 初中组', '南山实验学校', 'Nanshan Experimental School', '深圳市南山区', '', '深圳市', '广东省', '中国', Number(coach.lastInsertRowid), ts, ts);
      this.db.prepare('INSERT INTO team_coaches(team_id,coach_id) VALUES(?,?)').run(Number(team.lastInsertRowid), Number(coach.lastInsertRowid));
      this.db.prepare('INSERT INTO team_members(team_id,member_id) VALUES(?,?)').run(Number(team.lastInsertRowid), Number(member.lastInsertRowid));
    }
  }
}

function getSession(req, appDb) {
  const raw = parseCookies(req).session;
  if (!raw) return null;
  return appDb.db.prepare(`SELECT s.csrf_token,s.expires_at,u.* FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?`).get(sha256(raw), nowIso()) || null;
}

function publicUser(user) {
  if (!user) return null;
  const { password_hash, password_salt, csrf_token, expires_at, ...safe } = user;
  return safe;
}

function auth(req, appDb, role) {
  const user = getSession(req, appDb);
  if (!user) throw fail(401, '请先登录后继续');
  if (role && user.role !== role) throw fail(403, '当前账号没有此操作权限');
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-csrf-token'] !== user.csrf_token) {
    throw fail(403, '页面校验已过期，请刷新后重试');
  }
  return user;
}

function userOwns(db, table, id, userId) {
  return db.prepare(`SELECT * FROM ${table} WHERE id=? AND user_id=?`).get(id, userId);
}

function teamDetails(db, teamId, userId) {
  const team = db.prepare('SELECT * FROM teams WHERE id=? AND user_id=?').get(teamId, userId);
  if (!team) throw fail(404, '未找到该战队');
  team.coaches = db.prepare('SELECT c.* FROM coaches c JOIN team_coaches tc ON tc.coach_id=c.id WHERE tc.team_id=?').all(teamId);
  team.members = db.prepare('SELECT m.* FROM members m JOIN team_members tm ON tm.member_id=m.id WHERE tm.team_id=?').all(teamId);
  return team;
}

function adminTeamDetails(db, teamId) {
  const team = db.prepare(`SELECT t.*,u.email AS owner_email,u.nickname AS owner_nickname
    FROM teams t JOIN users u ON u.id=t.user_id WHERE t.id=?`).get(teamId);
  if (!team) throw fail(404, '未找到该战队');
  team.coaches = db.prepare('SELECT c.* FROM coaches c JOIN team_coaches tc ON tc.coach_id=c.id WHERE tc.team_id=? ORDER BY c.id').all(teamId);
  team.members = db.prepare('SELECT m.* FROM members m JOIN team_members tm ON tm.member_id=m.id WHERE tm.team_id=? ORDER BY m.id').all(teamId);
  team.available_coaches = db.prepare('SELECT * FROM coaches WHERE user_id=? ORDER BY id').all(team.user_id);
  team.available_members = db.prepare('SELECT * FROM members WHERE user_id=? ORDER BY id').all(team.user_id);
  team.registration_count = db.prepare('SELECT COUNT(*) AS count FROM registrations WHERE team_id=?').get(teamId).count;
  return team;
}

function adminUserDetails(db, userId) {
  const user = db.prepare(`SELECT id,username,nickname,email,phone,contact_name,id_number,org_name,org_address,org_intro,avatar_url,role,admin_level,created_at
    FROM users WHERE id=?`).get(userId);
  if (!user) throw fail(404, '未找到该用户');
  user.coaches = db.prepare('SELECT * FROM coaches WHERE user_id=? ORDER BY created_at DESC,id DESC').all(userId);
  user.members = db.prepare('SELECT * FROM members WHERE user_id=? ORDER BY created_at DESC,id DESC').all(userId);
  user.teams = db.prepare('SELECT * FROM teams WHERE user_id=? ORDER BY updated_at DESC,id DESC').all(userId).map((team) => ({
    ...team,
    coaches: db.prepare('SELECT c.id,c.name FROM coaches c JOIN team_coaches tc ON tc.coach_id=c.id WHERE tc.team_id=? ORDER BY c.id').all(team.id),
    members: db.prepare('SELECT m.id,m.name FROM members m JOIN team_members tm ON tm.member_id=m.id WHERE tm.team_id=? ORDER BY m.id').all(team.id),
  }));
  user.registrations = db.prepare(`SELECT r.id,r.group_name,r.status,r.rejection_reason,r.award_info,r.created_at,r.updated_at,
      e.id AS event_id,e.title AS event_title,e.starts_at,e.ends_at,t.id AS team_id,t.number AS team_number,t.name AS team_name
    FROM registrations r JOIN events e ON e.id=r.event_id JOIN teams t ON t.id=r.team_id
    WHERE r.user_id=? ORDER BY e.starts_at DESC,r.id DESC`).all(userId);
  return user;
}

function eventStatus(event) {
  const now = Date.now();
  if (new Date(event.starts_at).getTime() > now) return 'upcoming';
  if (new Date(event.ends_at).getTime() >= now) return 'ongoing';
  return 'ended';
}

function hydrateEvent(row) {
  if (!row) return null;
  const event = rowsWithJson([row], ['groups_json'])[0];
  event.groups = event.groups_json;
  delete event.groups_json;
  event.allow_volunteer = Boolean(event.allow_volunteer);
  event.allow_spectator = Boolean(event.allow_spectator);
  event.refund_deadline_days = Number.isInteger(Number(event.refund_deadline_days)) ? Number(event.refund_deadline_days) : 10;
  event.refund_deadline = refundDeadlineFor(event);
  event.refund_deadline_label = refundDeadlineLabelFor(event);
  event.time_status = eventStatus(event);
  const now = Date.now();
  event.registration_open = event.status === 'published' && new Date(event.registration_start).getTime() <= now && new Date(event.registration_end).getTime() >= now;
  return event;
}

function refundDeadlineFor(event) {
  const dateParts = String(event?.registration_end || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parsedDays = Number(event?.refund_deadline_days);
  const days = Number.isInteger(parsedDays) ? parsedDays : 10;
  if (!dateParts) return '';
  const [, year, month, day] = dateParts;
  // The organizer's rule is calendar-day based: N days before the registration
  // closing date, through 24:00 of that day. This site operates in China Standard Time.
  const deadlineUtc = Date.UTC(Number(year), Number(month) - 1, Number(day) - days + 1) - 8 * 60 * 60_000;
  return new Date(deadlineUtc).toISOString();
}

function refundDeadlineLabelFor(event) {
  const dateParts = String(event?.registration_end || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parsedDays = Number(event?.refund_deadline_days);
  const days = Number.isInteger(parsedDays) ? parsedDays : 10;
  if (!dateParts) return '';
  const target = new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]) - days));
  return `${target.getUTCFullYear()}年${String(target.getUTCMonth() + 1).padStart(2, '0')}月${String(target.getUTCDate()).padStart(2, '0')}日 24:00`;
}

function refundRequestCount(row) {
  const count = Number(row?.refund_request_count || 0);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function canRequestRefund(row, refundDeadlineOpen) {
  return Boolean(refundDeadlineOpen)
    && refundRequestCount(row) < REFUND_REQUEST_MAX_COUNT
    && !['requested','approved'].includes(row?.refund_status || 'none');
}

function canReapplyRegistration(row, event) {
  const now = Date.now();
  return Boolean(row?.cancelled_at)
    && (row?.refund_status || 'none') !== 'requested'
    && event?.status === 'published'
    && new Date(event?.registration_start || 0).getTime() <= now
    && new Date(event?.registration_end || 0).getTime() >= now
    && new Date(event?.starts_at || 0).getTime() >= now;
}

function validateEntityIds(db, table, ids, userId) {
  const unique = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  if (!unique.length) return [];
  const placeholders = unique.map(() => '?').join(',');
  const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id=? AND id IN (${placeholders})`).get(userId, ...unique).count;
  if (count !== unique.length) throw fail(422, '选择项中包含无效或无权限的数据');
  return unique;
}

function replaceTeamLinks(db, teamId, table, column, ids) {
  db.prepare(`DELETE FROM ${table} WHERE team_id=?`).run(teamId);
  const insert = db.prepare(`INSERT INTO ${table}(team_id,${column}) VALUES(?,?)`);
  for (const id of ids) insert.run(teamId, id);
}

function validateEventPayload(body) {
  required(body, ['title','description','starts_at','ends_at','contact_name','contact_phone','location','registration_start','registration_end','payee','account_no','bank_name']);
  const groups = [...new Set((body.groups || []).map((item) => cleanText(item, 80)).filter(Boolean))];
  if (!groups.length) throw fail(422, '至少设置一个参赛组别', { groups: '请添加参赛组别' });
  const start = new Date(body.starts_at).getTime();
  const end = new Date(body.ends_at).getTime();
  const regStart = new Date(body.registration_start).getTime();
  const regEnd = new Date(body.registration_end).getTime();
  if (![start,end,regStart,regEnd].every(Number.isFinite)) throw fail(422, '请填写有效的日期时间');
  if (start >= end) throw fail(422, '赛事结束时间必须晚于开始时间', { ends_at: '请调整结束时间' });
  if (regStart >= regEnd) throw fail(422, '报名结束时间必须晚于开始时间', { registration_end: '请调整报名结束时间' });
  if (regEnd > start) throw fail(422, '报名应在赛事开始前结束', { registration_end: '报名截止不得晚于赛事开始' });
  return groups;
}

function validateRefundDeadlineDays(value) {
  const days = Number(value ?? 10);
  if (!Number.isInteger(days) || days < 0 || days > 365) throw fail(422, '退费申请截止提前天数无效', { refund_deadline_days: '请输入 0–365 之间的整数' });
  return days;
}

function registrationDetails(db, row) {
  if (!row) return null;
  const details = { ...row };
  details.event = hydrateEvent(db.prepare('SELECT * FROM events WHERE id=?').get(row.event_id));
  details.team = teamDetails(db, row.team_id, row.user_id);
  details.deadline_open = Boolean(details.event) && Date.now() <= new Date(details.event.registration_end).getTime();
  details.refund_deadline = details.event?.refund_deadline || '';
  details.refund_deadline_open = Boolean(details.refund_deadline) && Date.now() <= new Date(details.refund_deadline).getTime();
  details.can_cancel = details.deadline_open && !details.cancelled_at;
  details.can_request_refund = canRequestRefund(details, details.refund_deadline_open);
  details.can_reapply = canReapplyRegistration(details, details.event);
  return details;
}

function emailDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function registrationReviewEmailContext(db, registrationId) {
  const registration = db.prepare(`SELECT r.id,r.team_id,r.group_name,e.title AS event_title,e.starts_at,e.ends_at,e.location,t.number AS team_number,t.name AS team_name
    FROM registrations r
    JOIN events e ON e.id=r.event_id
    JOIN teams t ON t.id=r.team_id
    WHERE r.id=?`).get(registrationId);
  if (!registration) return null;
  const coaches = db.prepare(`SELECT DISTINCT c.id,c.name,c.email
    FROM coaches c
    JOIN team_coaches tc ON tc.coach_id=c.id
    WHERE tc.team_id=?
    ORDER BY c.id`).all(registration.team_id);
  return { ...registration, coaches };
}

export function registrationReviewEmailPayload(registration, status) {
  const approved = status === 'approved';
  const eventTitle = cleanText(registration?.event_title || '赛事', 200);
  const teamLabel = [registration?.team_number, registration?.team_name].filter(Boolean).join(' · ') || '参赛战队';
  const teamId = cleanText(registration?.team_number || teamLabel, 120);
  const actionText = approved
    ? '您负责的战队报名已通过审核。'
    : `您负责的战队报名未通过审核，请登录${PLATFORM_NAME}查看审核状态，并按页面提示修改资料后重新提交。`;
  const actionTextEn = approved
    ? `Your team, ${teamId}, application to the competition ${eventTitle} has been approved.`
    : `Your team, ${teamId}, application to the competition ${eventTitle} has not been approved. Please log in to ${PLATFORM_NAME} to view the status and update the application as instructed.`;
  const eventTime = [emailDateTime(registration?.starts_at), emailDateTime(registration?.ends_at)].filter(Boolean).join(' — ');
  const rows = [
    ['赛事', eventTitle],
    ['战队', teamLabel],
    ['参赛组别', registration?.group_name || '—'],
    ['赛事时间', eventTime || '—'],
    ['比赛地点', registration?.location || '—'],
  ];
  const text = [
    '各位教练：',
    '',
    actionText,
    actionTextEn,
    '',
    ...rows.map(([label, value]) => `${label}：${value}`),
    '',
    `请关注${PLATFORM_NAME}中的后续赛事通知。`,
    '',
    PLATFORM_NAME,
  ].join('\n');
  const htmlRows = rows.map(([label, value]) => `<tr><th align="left" style="padding:6px 10px;border:1px solid #e5e7eb;background:#f8fafc;">${htmlEscape(label)}</th><td style="padding:6px 10px;border:1px solid #e5e7eb;">${htmlEscape(value)}</td></tr>`).join('');
  const html = `<p>各位教练：</p><p>${htmlEscape(actionText)}<br>${htmlEscape(actionTextEn)}</p><table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:12px 0;">${htmlRows}</table><p>请关注${htmlEscape(PLATFORM_NAME)}中的后续赛事通知。</p><p>${htmlEscape(PLATFORM_NAME)}</p>`;
  return {
    subject: `【赛事报名${approved ? '成功' : '未通过'}】${teamLabel}`,
    text,
    html,
  };
}

async function notifyRegistrationReview(db, registrationId, status) {
  const context = registrationReviewEmailContext(db, registrationId);
  if (!context) return { sent: 0, failed: 0 };
  const recipients = [...new Set((context.coaches || []).map((coach) => cleanText(coach.email, 120)).filter(validEmail))];
  if (!recipients.length) return { sent: 0, failed: 0 };
  const payload = registrationReviewEmailPayload(context, status);
  const results = await Promise.allSettled(recipients.map((to) => sendEmailMessage({ to, ...payload })));
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length) console.error(`Registration review email failed for registration ${registrationId}: ${failed.map((result) => result.reason?.message || result.reason).join('; ')}`);
  return { sent: recipients.length - failed.length, failed: failed.length };
}

const ACTIVITY_APPLICATION_TYPE_LABELS = Object.freeze({
  volunteer: '志愿者报名',
  spectator: '观赛报名',
});
const ACTIVITY_APPLICATION_TYPE_EN_LABELS = Object.freeze({
  volunteer: 'volunteer registration',
  spectator: 'spectator registration',
});

function activityApplicationReviewEmailContext(db, applicationId) {
  return db.prepare(`SELECT a.*,e.title AS event_title,e.starts_at,e.ends_at,e.location,u.email AS user_email
    FROM activity_applications a
    JOIN events e ON e.id=a.event_id
    JOIN users u ON u.id=a.user_id
    WHERE a.id=?`).get(applicationId);
}

export function activityApplicationReviewEmailPayload(application, status) {
  const approved = status === 'approved';
  const typeLabel = ACTIVITY_APPLICATION_TYPE_LABELS[application?.type] || '活动报名';
  const typeLabelEn = ACTIVITY_APPLICATION_TYPE_EN_LABELS[application?.type] || 'activity registration';
  const eventTitle = cleanText(application?.event_title || '赛事', 200);
  const actionText = approved
    ? `您的${typeLabel}已通过审核。`
    : `您的${typeLabel}未通过审核，请登录${PLATFORM_NAME}查看审核状态，并按页面提示修改资料后重新提交。`;
  const actionTextEn = approved
    ? `Your ${typeLabelEn} application to the competition ${eventTitle} has been approved.`
    : `Your ${typeLabelEn} application to the competition ${eventTitle} has not been approved. Please log in to ${PLATFORM_NAME} to view the status and update the application as instructed.`;
  const eventTime = [emailDateTime(application?.starts_at), emailDateTime(application?.ends_at)].filter(Boolean).join(' — ');
  const contentRow = application?.type === 'volunteer'
    ? ['意向岗位', application?.volunteer_role || '—']
    : ['观赛人数', `${Number(application?.attendee_count || 1)} 人`];
  const rows = [
    ['报名类别', typeLabel],
    ['赛事', eventTitle],
    ['报名人', application?.name || '—'],
    contentRow,
    ['赛事时间', eventTime || '—'],
    ['比赛地点', application?.location || '—'],
  ];
  const text = [
    '您好：',
    '',
    actionText,
    actionTextEn,
    '',
    ...rows.map(([label, value]) => `${label}：${value}`),
    '',
    `请关注${PLATFORM_NAME}中的后续赛事通知。`,
    '',
    PLATFORM_NAME,
  ].join('\n');
  const htmlRows = rows.map(([label, value]) => `<tr><th align="left" style="padding:6px 10px;border:1px solid #e5e7eb;background:#f8fafc;">${htmlEscape(label)}</th><td style="padding:6px 10px;border:1px solid #e5e7eb;">${htmlEscape(value)}</td></tr>`).join('');
  const html = `<p>您好：</p><p>${htmlEscape(actionText)}<br>${htmlEscape(actionTextEn)}</p><table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:12px 0;">${htmlRows}</table><p>请关注${htmlEscape(PLATFORM_NAME)}中的后续赛事通知。</p><p>${htmlEscape(PLATFORM_NAME)}</p>`;
  return {
    subject: `【${typeLabel}${approved ? '通过' : '未通过'}】${eventTitle}`,
    text,
    html,
  };
}

async function notifyActivityApplicationReview(db, applicationId, status) {
  const context = activityApplicationReviewEmailContext(db, applicationId);
  if (!context) return { sent: 0, failed: 0 };
  const recipients = [...new Set([context.email, context.user_email].map((email) => cleanText(email, 160).toLowerCase()).filter(validEmail))];
  if (!recipients.length) return { sent: 0, failed: 0 };
  const payload = activityApplicationReviewEmailPayload(context, status);
  const results = await Promise.allSettled(recipients.map((to) => sendEmailMessage({ to, ...payload })));
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length) console.error(`Activity application review email failed for application ${applicationId}: ${failed.map((result) => result.reason?.message || result.reason).join('; ')}`);
  return { sent: recipients.length - failed.length, failed: failed.length };
}

function spreadsheetText(value) {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function xmlEscape(value) {
  return spreadsheetText(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
}

const REGISTRATION_EXPORT_SCOPES = Object.freeze({
  all: { title: '赛事报名明细', fileName: '分组报名明细' },
  approved: { title: '审核通过赛队信息', fileName: '审核通过赛队信息' },
  cancelled: { title: '取消参赛赛队信息', fileName: '取消参赛赛队信息' },
});

function registrationExportScope(value) {
  const key = cleanText(value, 30) || 'all';
  const scope = REGISTRATION_EXPORT_SCOPES[key];
  if (!scope) throw fail(422, '导出类型无效');
  return { key, ...scope };
}

function registrationExportRows(db, eventId, scope = 'all') {
  const conditions = ['r.event_id=?'];
  const args = [eventId];
  if (scope === 'approved') conditions.push("r.status='approved'", 'r.cancelled_at IS NULL');
  if (scope === 'cancelled') conditions.push("(r.status='rejected' OR r.cancelled_at IS NOT NULL)");
  return db.prepare(`SELECT r.id,r.group_name,r.status,r.rejection_reason,r.award_info,r.created_at,r.reviewed_at,
      r.cancelled_at,r.cancellation_reason,r.refund_status,r.refund_reason,r.refund_requested_at,r.refund_reviewed_at,r.refund_note,
      t.number AS team_number,t.name AS team_name,t.school_name,t.city,t.province,t.nationality,
      u.username,u.nickname,u.email AS user_email,u.phone AS user_phone,
      contact.name AS contact_coach,contact.phone AS contact_phone,contact.email AS contact_email,
      (SELECT GROUP_CONCAT(name,'、') FROM (SELECT c.name AS name FROM coaches c JOIN team_coaches tc ON tc.coach_id=c.id WHERE tc.team_id=t.id ORDER BY c.id)) AS coach_names,
      (SELECT GROUP_CONCAT(phone,'、') FROM (SELECT c.phone AS phone FROM coaches c JOIN team_coaches tc ON tc.coach_id=c.id WHERE tc.team_id=t.id ORDER BY c.id)) AS coach_phones,
      (SELECT GROUP_CONCAT(email,'、') FROM (SELECT c.email AS email FROM coaches c JOIN team_coaches tc ON tc.coach_id=c.id WHERE tc.team_id=t.id ORDER BY c.id)) AS coach_emails,
      (SELECT GROUP_CONCAT(name,'、') FROM (SELECT m.name AS name FROM members m JOIN team_members tm ON tm.member_id=m.id WHERE tm.team_id=t.id ORDER BY m.id)) AS member_names,
      (SELECT GROUP_CONCAT(grade,'、') FROM (SELECT m.grade AS grade FROM members m JOIN team_members tm ON tm.member_id=m.id WHERE tm.team_id=t.id ORDER BY m.id)) AS member_grades,
      (SELECT GROUP_CONCAT(phone,'、') FROM (SELECT m.phone AS phone FROM members m JOIN team_members tm ON tm.member_id=m.id WHERE tm.team_id=t.id ORDER BY m.id)) AS member_phones
    FROM registrations r
    JOIN teams t ON t.id=r.team_id
    JOIN users u ON u.id=r.user_id
    LEFT JOIN coaches contact ON contact.id=t.contact_coach_id
    WHERE ${conditions.join(' AND ')} ORDER BY r.group_name COLLATE NOCASE,t.number COLLATE NOCASE,r.id`).all(...args);
}

const REGISTRATION_EXPORT_HEADERS = ['报名ID','参赛组别','战队编号','战队名称','学校/机构','省份','城市','国籍','联系人教练','联系人手机','联系人邮箱','全部教练','教练手机','教练邮箱','参赛队员','队员年级','队员手机','报名账号','账号昵称','账号邮箱','账号手机号','审核状态','报名取消状态','报名取消原因','退费状态','退费原因','退费处理说明','提交时间','审核时间','报名取消时间','退费申请时间','退费处理时间'];

function registrationExportData(rows) {
  const registrationLabels = { pending: '待审核', approved: '已通过', rejected: '已驳回' };
  const refundLabels = { none: '未申请', requested: '待处理', approved: '已同意', rejected: '已拒绝' };
  return rows.map((row) => [
    row.id,row.group_name,row.team_number,row.team_name,row.school_name,row.province,row.city,row.nationality,
    row.contact_coach,row.contact_phone,row.contact_email,row.coach_names,row.coach_phones,row.coach_emails,
    row.member_names,row.member_grades,row.member_phones,row.username,row.nickname,row.user_email,row.user_phone,
    registrationLabels[row.status] || row.status,row.cancelled_at ? '已取消' : '正常',row.cancellation_reason,
    refundLabels[row.refund_status || 'none'] || row.refund_status,row.refund_reason,row.refund_note,
    row.created_at,row.reviewed_at,row.cancelled_at,row.refund_requested_at,row.refund_reviewed_at,
  ]);
}

function excelColumnName(index) {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function xlsxInlineCell(reference, value, style = 4) {
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${reference}" s="${style}" t="n"><v>${value}</v></c>`;
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function safeExportFilePart(value, fallback = '未命名组别') {
  const safe = String(value || fallback)
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return (safe || fallback).slice(0, 80);
}

const ZIP_CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});

function zipCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = ZIP_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDosTimestamp(value = new Date()) {
  const date = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function createZipArchive(entries, createdAt = new Date()) {
  if (!Array.isArray(entries) || !entries.length) throw new Error('ZIP 压缩包至少需要一个文件');
  const localParts = [];
  const centralParts = [];
  const { dosTime, dosDate } = zipDosTimestamp(createdAt);
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(String(entry.name).replace(/\\/g, '/'), 'utf8');
    const source = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const compressed = deflateRawSync(source, { level: 6 });
    const useDeflate = compressed.length < source.length;
    const payload = useDeflate ? compressed : source;
    const method = useDeflate ? 8 : 0;
    const crc = zipCrc32(source);
    const flags = 0x0800;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(source.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(source.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function registrationsXlsx(event, groupName, rows, exportedAt = nowIso(), exportTitle = '赛事报名明细') {
  const headers = REGISTRATION_EXPORT_HEADERS;
  const dataRows = registrationExportData(rows);
  const lastRow = Math.max(3, dataRows.length + 3);
  const lastColumn = excelColumnName(headers.length - 1);
  const columns = headers.map((header, index) => {
    const width = index === 0 ? 10 : index <= 3 ? 20 : index >= 27 ? 23 : 17;
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join('');
  const headerCells = headers.map((header, index) => xlsxInlineCell(`${excelColumnName(index)}3`, header, 3)).join('');
  const rowsXml = dataRows.map((row, rowIndex) => {
    const excelRow = rowIndex + 4;
    const cells = row.map((value, columnIndex) => xlsxInlineCell(`${excelColumnName(columnIndex)}${excelRow}`, value, 4)).join('');
    return `<row r="${excelRow}">${cells}</row>`;
  }).join('');
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${columns}</cols><sheetData><row r="1" ht="30" customHeight="1">${xlsxInlineCell('A1', `${event.title} - ${groupName} - ${exportTitle}`, 1)}</row><row r="2" ht="24" customHeight="1">${xlsxInlineCell('A2', `比赛时间：${event.starts_at} 至 ${event.ends_at}　报名截止：${event.registration_end}　导出时间：${exportedAt}　本组记录：${dataRows.length} 支`, 2)}</row><row r="3" ht="34" customHeight="1">${headerCells}</row>${rowsXml}</sheetData><autoFilter ref="A3:${lastColumn}${lastRow}"/><mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/></mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="10"/><name val="Microsoft YaHei"/><family val="2"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/><family val="2"/></font><font><sz val="10"/><color rgb="FF5F6368"/><name val="Microsoft YaHei"/><family val="2"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/><family val="2"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC8152E"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F4F2"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF213A5C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFDEDEDE"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets><sheet name="赛事报名明细" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(event.title)} - ${xmlEscape(groupName)} - ${xmlEscape(exportTitle)}</dc:title><dc:creator>上海瑞卜德教育科技有限公司</dc:creator><cp:lastModifiedBy>赛事管理后台</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified></cp:coreProperties>`;
  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>上海瑞卜德教育赛事管理后台</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>工作表</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>赛事报名明细</vt:lpstr></vt:vector></TitlesOfParts><Company>上海瑞卜德教育科技有限公司</Company><AppVersion>1.0</AppVersion></Properties>`;
  const createdAt = new Date(exportedAt);
  return createZipArchive([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: packageRels },
    { name: 'docProps/app.xml', data: appXml },
    { name: 'docProps/core.xml', data: coreXml },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/styles.xml', data: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml },
  ], createdAt);
}

function groupedRegistrationExport(event, rows, exportTitle = '赛事报名明细') {
  const groupNames = [];
  const seen = new Set();
  for (const name of [...(event.groups || []), ...rows.map((row) => row.group_name)]) {
    const groupName = String(name || '').trim();
    if (!groupName || seen.has(groupName)) continue;
    seen.add(groupName);
    groupNames.push(groupName);
  }
  if (!groupNames.length) groupNames.push('未分组');
  const exportedAt = nowIso();
  const createdAt = new Date(exportedAt);
  const entries = groupNames.map((groupName, index) => ({
    name: `${String(index + 1).padStart(2, '0')}-${safeExportFilePart(groupName)}-${safeExportFilePart(exportTitle)}.xlsx`,
    data: registrationsXlsx(event, groupName, rows.filter((row) => row.group_name === groupName), exportedAt, exportTitle),
  }));
  return { archive: createZipArchive(entries, createdAt), groupNames, entries };
}

const ACTIVITY_TYPES = new Set(['volunteer', 'spectator']);
const VOLUNTEER_ROLES = new Set(['赛事服务', '检录协助', '场地协助', '秩序引导', '摄影宣传', '服从分配']);

function activityType(value) {
  const type = cleanText(value, 20);
  if (!ACTIVITY_TYPES.has(type)) throw fail(422, '请选择有效的报名类别', { type: '报名类别无效' });
  return type;
}

function validateActivityApplication(db, body) {
  const type = activityType(body.type);
  required(body, ['event_id','name','gender','id_number','phone','email']);
  const event = hydrateEvent(db.prepare("SELECT * FROM events WHERE id=? AND status='published'").get(Number(body.event_id)));
  if (!event) throw fail(404, '赛事不存在或尚未发布');
  const activityAllowed = type === 'volunteer' ? event.allow_volunteer : event.allow_spectator;
  if (!activityAllowed) throw fail(409, `该赛事暂未开放${type === 'volunteer' ? '志愿者' : '观赛'}报名`);
  if (!event.registration_open) throw fail(409, '当前不在该活动报名时间内');
  if (!['男','女','其他'].includes(body.gender)) throw fail(422, '请选择有效性别', { gender: '请选择性别' });
  if (!validPhone(body.phone)) throw fail(422, '请输入有效联系电话', { phone: '电话格式不正确' });
  if (!validEmail(body.email)) throw fail(422, '请输入有效邮箱', { email: '邮箱格式不正确' });
  if (cleanText(body.id_number, 40).length < 6) throw fail(422, '请输入有效证件号码', { id_number: '证件号码至少 6 位' });

  const data = {
    event_id: event.id,
    type,
    name: cleanText(body.name, 50),
    gender: cleanText(body.gender, 10),
    id_number: cleanText(body.id_number, 40),
    phone: cleanText(body.phone, 30),
    email: cleanText(body.email, 160).toLowerCase(),
    organization: cleanText(body.organization, 150),
    volunteer_role: '',
    availability: '',
    experience: '',
    attendee_count: 1,
    companion_names: '',
    notes: cleanText(body.notes, 1000),
  };
  if (type === 'volunteer') {
    required(body, ['organization','volunteer_role','availability']);
    if (!VOLUNTEER_ROLES.has(body.volunteer_role)) throw fail(422, '请选择有效的志愿服务岗位', { volunteer_role: '岗位选择无效' });
    data.volunteer_role = cleanText(body.volunteer_role, 40);
    data.availability = cleanText(body.availability, 500);
    data.experience = cleanText(body.experience, 1000);
  } else {
    const count = Number(body.attendee_count);
    if (!Number.isInteger(count) || count < 1 || count > 6) throw fail(422, '观赛人数须为 1 至 6 人', { attendee_count: '请选择有效人数' });
    if (count > 1 && !cleanText(body.companion_names, 500)) throw fail(422, '请填写同行观众姓名', { companion_names: '多人观赛时请填写同行人员姓名' });
    data.attendee_count = count;
    data.companion_names = cleanText(body.companion_names, 500);
  }
  return data;
}

function uploadHasExpectedSignature(buffer, mimeType) {
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  return false;
}

function validateUploadRef(db, value, user, kinds, { allowEmpty = false, allowAssets = false, mimeTypes = [], allowAdminAny = false } = {}) {
  const uploadUrl = cleanText(value, 300);
  if (!uploadUrl && allowEmpty) return '';
  if (allowAssets && /^\/assets\/[A-Za-z0-9._/-]+$/.test(uploadUrl)) return uploadUrl;
  const row = allowAdminAny && user.role === 'admin'
    ? db.prepare('SELECT * FROM uploads WHERE url=?').get(uploadUrl)
    : db.prepare('SELECT * FROM uploads WHERE url=? AND owner_user_id=?').get(uploadUrl, user.id);
  if (!row || !kinds.includes(row.kind)) throw fail(422, '请使用当前账号上传的有效文件');
  if (mimeTypes.length && !mimeTypes.includes(row.mime_type)) throw fail(422, '上传文件格式不符合要求');
  return uploadUrl;
}

function validateNoticeMarkdownUploads(db, value, user) {
  const markdown = cleanText(value, 50000);
  const localImages = [...markdown.matchAll(/!\[[^\]\n]*\]\((\/uploads\/[A-Za-z0-9._-]+)\)/g)].map((match) => match[1]);
  for (const imageUrl of new Set(localImages)) {
    validateUploadRef(db, imageUrl, user, ['notice_image'], {
      mimeTypes: ['image/jpeg','image/png','image/webp'],
      allowAdminAny: true,
    });
  }
  return markdown;
}

function resetTeamRegistrations(db, teamId) {
  db.prepare(`UPDATE registrations SET status='pending',rejection_reason='',reviewed_by=NULL,reviewed_at=NULL,updated_at=? WHERE team_id=? AND status<>'pending'`)
    .run(nowIso(), teamId);
}

async function saveUpload(body, uploadDir, user, db) {
  const kind = cleanText(body.kind, 20);
  if (!['avatar','member','payment','event','notice','notice_image'].includes(kind)) throw fail(422, '上传用途无效');
  if (['event','notice','notice_image'].includes(kind) && user.role !== 'admin') throw fail(403, '只有管理员可以上传赛事文件');
  const match = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(body.dataUrl || '');
  if (!match) throw fail(422, '仅支持 JPG、PNG、WebP 图片或 PDF 文件');
  if (kind !== 'notice' && match[1] === 'application/pdf') throw fail(422, '此处只能上传图片');
  if (kind === 'notice' && match[1] !== 'application/pdf') throw fail(422, '办赛通知仅支持 PDF 文件');
  const buffer = Buffer.from(match[2], 'base64');
  const maxBytes = kind === 'notice' ? 20 * 1024 * 1024 : 4 * 1024 * 1024;
  if (!buffer.length || buffer.length > maxBytes) throw fail(422, `文件大小必须在 ${kind === 'notice' ? '20MB' : '4MB'} 以内`);
  if (!uploadHasExpectedSignature(buffer, match[1])) throw fail(422, '文件内容与声明格式不一致');
  const used = db.prepare('SELECT COALESCE(SUM(size_bytes),0) AS total FROM uploads WHERE owner_user_id=?').get(user.id).total;
  if (used + buffer.length > 100 * 1024 * 1024) throw fail(413, '当前账号上传空间已达 100MB，请联系管理员清理旧文件');
  const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' }[match[1]];
  const fileName = `${kind || 'file'}-${Date.now()}-${randomBytes(6).toString('hex')}${extension}`;
  const filePath = join(uploadDir, fileName);
  const uploadUrl = `/uploads/${fileName}`;
  await writeFile(filePath, buffer, { flag: 'wx' });
  try {
    db.prepare('INSERT INTO uploads(url,owner_user_id,kind,mime_type,size_bytes,created_at) VALUES(?,?,?,?,?,?)')
      .run(uploadUrl, user.id, kind, match[1], buffer.length, nowIso());
  } catch (error) {
    await unlink(filePath).catch(() => {});
    throw error;
  }
  return uploadUrl;
}

function matchRoute(pathname, pattern) {
  const names = [];
  const regex = new RegExp(`^${pattern.replace(/:([A-Za-z]+)/g, (_, name) => { names.push(name); return '([^/]+)'; })}$`);
  const match = regex.exec(pathname);
  if (!match) return null;
  return Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1])]));
}

async function api(req, res, url, appDb, uploadDir) {
  const db = appDb.db;
  const path = url.pathname;
  const method = req.method;
  let params;

  if (method === 'GET' && path === '/api/captcha') {
    pruneTransientStores();
    const ip = req.socket.remoteAddress || 'local';
    if (!allowRate(`captcha:${ip}`, 40, 15 * 60_000)) throw fail(429, '验证码获取过于频繁，请稍后再试');
    const id = randomBytes(16).toString('hex');
    const code = Array.from({ length: 4 }, () => CAPTCHA_ALPHABET[randomInt(CAPTCHA_ALPHABET.length)]).join('');
    captchaStore.set(id, { code, expires: Date.now() + AUTH_VERIFICATION_TTL_MS });
    const svg = captchaSvg(code);
    return json(res, 200, { id, svg: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, expiresInSeconds: AUTH_VERIFICATION_TTL_MINUTES * 60, ...(process.env.NODE_ENV === 'test' ? { devCode: code } : {}) });
  }

  if (method === 'GET' && path === '/api/auth/me') {
    const user = getSession(req, appDb);
    return json(res, 200, { user: publicUser(user), csrfToken: user?.csrf_token || null });
  }

  if (method === 'POST' && path === '/api/auth/send-code') {
    const body = await bodyJson(req);
    const email = cleanText(body.email, 160).toLowerCase();
    const captcha = captchaStore.get(body.captchaId);
    captchaStore.delete(body.captchaId);
    if (!captcha || captcha.expires < Date.now() || captcha.code !== cleanText(body.captcha, 10).toUpperCase()) throw fail(422, '图形验证码错误或已过期', { captcha: '请刷新验证码后重试' });
    if (!validEmail(email)) throw fail(422, '请输入有效的邮箱地址', { email: '邮箱格式不正确' });
    const ip = req.socket.remoteAddress || 'local';
    if (!allowRate(`mail:${ip}`, 8, 15 * 60_000) || !allowRate(`mail:${email}`, 3, 15 * 60_000)) throw fail(429, '验证码发送过于频繁，请稍后再试');
    const code = String(randomInt(100000, 1000000));
    db.prepare('INSERT INTO verification_codes(email,code_hash,expires_at,created_at) VALUES(?,?,?,?)')
      .run(email, sha256(code), new Date(Date.now() + AUTH_VERIFICATION_TTL_MS).toISOString(), nowIso());
    await sendEmailMessage({ to: email, subject: `${PLATFORM_NAME}注册验证码`, ...verificationCodeEmailPayload(code) });
    return json(res, 200, { message: '验证码已发送，请在 10 分钟内完成验证', expiresInSeconds: AUTH_VERIFICATION_TTL_MINUTES * 60, ...(shouldExposeEmailDevCode() ? { devCode: code } : {}) });
  }

  if (method === 'POST' && path === '/api/auth/register') {
    const body = await bodyJson(req);
    const username = cleanText(body.username, 32);
    const email = cleanText(body.email, 160).toLowerCase();
    const phone = cleanText(body.phone, 30);
    const password = String(body.password || '');
    const ip = req.socket.remoteAddress || 'local';
    required(body, ['username','email','phone','code','password']);
    if (!allowRate(`register:${ip}`, 20, 15 * 60_000) || !allowRate(`register:${email}`, 10, 15 * 60_000)) throw fail(429, '注册验证尝试过多，请稍后再试');
    if (!validUsername(username)) throw fail(422, '用户名格式不正确', { username: '请输入 2–32 位中文、字母、数字、下划线或连字符' });
    if (!validEmail(email)) throw fail(422, '邮箱格式不正确', { email: '请输入有效邮箱' });
    if (!validPhone(phone)) throw fail(422, '手机号格式不正确', { phone: '请输入有效手机号' });
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw fail(422, '密码至少 8 位，且需同时包含字母和数字', { password: '请设置更安全的密码' });
    const code = db.prepare('SELECT * FROM verification_codes WHERE email=? AND used_at IS NULL AND expires_at>? ORDER BY id DESC LIMIT 1').get(email, nowIso());
    if (!code || sha256(cleanText(body.code, 12)) !== code.code_hash) throw fail(422, '邮箱验证码错误或已过期', { code: '请重新获取验证码' });
    if (db.prepare('SELECT 1 FROM users WHERE username=? COLLATE NOCASE').get(username)) throw fail(409, '该用户名已被使用', { username: '请更换用户名' });
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) throw fail(409, '该邮箱已注册，请直接登录', { email: '邮箱已存在' });
    const credential = await hashPassword(password);
    const result = db.prepare('INSERT INTO users(username,email,password_hash,password_salt,nickname,phone,created_at) VALUES(?,?,?,?,?,?,?)').run(username, email, credential.hash, credential.salt, cleanText(body.nickname, 50), phone, nowIso());
    db.prepare('UPDATE verification_codes SET used_at=? WHERE id=?').run(nowIso(), code.id);
    return json(res, 201, { message: '注册成功，请登录', userId: Number(result.lastInsertRowid) });
  }

  if (method === 'POST' && path === '/api/auth/password-reset/send-code') {
    const body = await bodyJson(req);
    const email = cleanText(body.email, 160).toLowerCase();
    const captcha = captchaStore.get(body.captchaId);
    captchaStore.delete(body.captchaId);
    if (!captcha || captcha.expires < Date.now() || captcha.code !== cleanText(body.captcha, 10).toUpperCase()) throw fail(422, '图形验证码错误或已过期', { captcha: '请刷新验证码后重试' });
    if (!validEmail(email)) throw fail(422, '请输入有效的邮箱地址', { email: '邮箱格式不正确' });
    const ip = req.socket.remoteAddress || 'local';
    const ipLimit = process.env.NODE_ENV === 'test' ? 100 : 8;
    const emailLimit = process.env.NODE_ENV === 'test' ? 100 : 3;
    if (!allowRate(`reset-mail:${ip}`, ipLimit, 15 * 60_000) || !allowRate(`reset-mail:${email}`, emailLimit, 15 * 60_000)) throw fail(429, '密码找回验证码发送过于频繁，请稍后再试');
    const challengeId = randomBytes(32).toString('base64url');
    const user = db.prepare('SELECT id,email FROM users WHERE email=?').get(email);
    let code;
    if (user) {
      code = String(randomInt(100000, 1000000));
      const createdAt = nowIso();
      withTransaction(db, () => {
        db.prepare('UPDATE password_reset_challenges SET used_at=? WHERE user_id=? AND used_at IS NULL').run(createdAt, user.id);
        db.prepare('INSERT INTO password_reset_challenges(token_hash,user_id,code_hash,expires_at,created_at) VALUES(?,?,?,?,?)')
          .run(sha256(challengeId), user.id, sha256(`${challengeId}:${code}`), new Date(Date.now() + AUTH_VERIFICATION_TTL_MS).toISOString(), createdAt);
      });
      try {
        await sendEmailMessage({
          to: email,
          subject: `${PLATFORM_NAME}密码重置验证码`,
          ...verificationCodeEmailPayload(code),
        });
      } catch (error) {
        db.prepare('DELETE FROM password_reset_challenges WHERE token_hash=?').run(sha256(challengeId));
        throw error;
      }
    }
    return json(res, 200, {
      message: '如果该邮箱已注册，密码重置验证码将在几分钟内送达',
      challengeId,
      maskedEmail: maskEmail(email),
      expiresInSeconds: AUTH_VERIFICATION_TTL_MINUTES * 60,
      ...(user && shouldExposeEmailDevCode() ? { devCode: code } : {}),
    });
  }

  if (method === 'POST' && path === '/api/auth/password-reset/confirm') {
    const body = await bodyJson(req);
    const challengeId = cleanText(body.challengeId, 200);
    const code = cleanText(body.code, 12);
    const password = String(body.password || '');
    const confirmPassword = String(body.confirm_password || '');
    const ip = req.socket.remoteAddress || 'local';
    if (!allowRate(`reset-verify:${ip}`, 30, 15 * 60_000)) throw fail(429, '验证码验证尝试过多，请稍后再试');
    if (!challengeId || !/^\d{6}$/.test(code)) throw fail(422, '请输入 6 位邮箱验证码', { code: '请输入邮件中的 6 位数字验证码' });
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw fail(422, '密码至少 8 位，且需同时包含字母和数字', { password: '请设置更安全的密码' });
    if (password !== confirmPassword) throw fail(422, '两次输入的密码不一致', { confirm_password: '请再次输入相同的新密码' });
    const challenge = db.prepare('SELECT * FROM password_reset_challenges WHERE token_hash=?').get(sha256(challengeId));
    if (!challenge || challenge.used_at || challenge.expires_at <= nowIso()) throw fail(422, '密码重置验证码错误或已过期', { code: '请返回重新获取验证码' });
    if (challenge.failed_attempts >= 5) throw fail(429, '验证码错误次数过多，请重新获取');
    if (!hashMatches(`${challengeId}:${code}`, challenge.code_hash)) {
      const attempts = challenge.failed_attempts + 1;
      db.prepare('UPDATE password_reset_challenges SET failed_attempts=? WHERE id=?').run(attempts, challenge.id);
      if (attempts >= 5) throw fail(429, '验证码错误次数过多，请重新获取', { code: '该验证码已失效' });
      throw fail(422, '密码重置验证码错误或已过期', { code: `验证码不正确，还可尝试 ${5 - attempts} 次` });
    }
    const credential = await hashPassword(password);
    withTransaction(db, () => {
      const changed = db.prepare('UPDATE password_reset_challenges SET used_at=? WHERE id=? AND used_at IS NULL').run(nowIso(), challenge.id);
      if (!changed.changes) throw fail(422, '密码重置验证码已使用，请重新获取');
      db.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').run(credential.hash, credential.salt, challenge.user_id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(challenge.user_id);
      db.prepare('UPDATE login_challenges SET used_at=? WHERE user_id=? AND used_at IS NULL').run(nowIso(), challenge.user_id);
    });
    return json(res, 200, { message: '密码已重置，请使用新密码登录' }, { 'Set-Cookie': cookie('session', '', { maxAge: -1, secure: process.env.NODE_ENV === 'production' }) });
  }

  if (method === 'POST' && path === '/api/auth/login') {
    const body = await bodyJson(req);
    const ip = req.socket.remoteAddress || 'local';
    const loginAttemptLimit = process.env.NODE_ENV === 'test' ? 100 : 12;
    if (!allowRate(`login:${ip}`, loginAttemptLimit, 15 * 60_000)) throw fail(429, '登录尝试次数过多，请 15 分钟后再试');
    const account = cleanText(body.account || body.email, 160).toLowerCase();
    if (!account) throw fail(422, '请输入用户名或邮箱', { account: '请输入注册用户名或邮箱地址' });
    const accountAttemptLimit = process.env.NODE_ENV === 'test' ? 100 : 8;
    if (!allowRate(`login-account:${account}`, accountAttemptLimit, 15 * 60_000)) throw fail(429, '该账号登录尝试次数过多，请 15 分钟后再试');
    const user = db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE OR username=? COLLATE NOCASE').get(account, account);
    if (!user || !(await verifyPassword(String(body.password || ''), user.password_salt, user.password_hash))) throw fail(401, '账号或密码不正确');
    const { token, csrf } = createLoginSession(db, user);
    return json(res, 200, { message: '登录成功', user: publicUser(user), csrfToken: csrf }, { 'Set-Cookie': cookie('session', token, { maxAge: SESSION_DAYS * 86400, secure: process.env.NODE_ENV === 'production' }) });
  }

  if (method === 'POST' && path === '/api/auth/logout') {
    const user = getSession(req, appDb);
    if (user) {
      if (req.headers['x-csrf-token'] !== user.csrf_token) throw fail(403, '页面校验已过期，请刷新后重试');
      const raw = parseCookies(req).session;
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256(raw));
    }
    return json(res, 200, { message: '已退出登录' }, { 'Set-Cookie': cookie('session', '', { maxAge: -1, secure: process.env.NODE_ENV === 'production' }) });
  }

  if (method === 'GET' && path === '/api/events') {
    const events = db.prepare(`SELECT * FROM events WHERE status='published' ORDER BY
      CASE WHEN starts_at>? THEN 0 WHEN ends_at>=? THEN 1 ELSE 2 END ASC,
      CASE WHEN starts_at>? THEN starts_at END ASC, id DESC`).all(nowIso(), nowIso(), nowIso()).map(hydrateEvent);
    return json(res, 200, { events });
  }

  if ((params = matchRoute(path, '/api/events/:id')) && method === 'GET') {
    const event = hydrateEvent(db.prepare("SELECT * FROM events WHERE id=? AND status='published'").get(Number(params.id)));
    if (!event) throw fail(404, '赛事不存在或尚未发布');
    return json(res, 200, { event });
  }

  if (method === 'POST' && path === '/api/uploads') {
    const user = auth(req, appDb);
    const ip = req.socket.remoteAddress || 'local';
    if (!allowRate(`upload-user:${user.id}`, 40, 60 * 60_000) || !allowRate(`upload-ip:${ip}`, 80, 60 * 60_000)) throw fail(429, '上传过于频繁，请稍后再试');
    const uploadUrl = await saveUpload(await bodyJson(req), uploadDir, user, db);
    return json(res, 201, { url: uploadUrl });
  }

  if (method === 'GET' && path === '/api/profile') {
    const user = auth(req, appDb);
    return json(res, 200, { profile: publicUser(user) });
  }

  if (method === 'PUT' && path === '/api/profile') {
    const user = auth(req, appDb);
    const body = await bodyJson(req);
    if (!validPhone(body.phone)) throw fail(422, '请输入有效联系电话', { phone: '电话格式不正确' });
    const avatarUrl = validateUploadRef(db, body.avatar_url, user, ['avatar'], { allowEmpty: true, allowAssets: true });
    db.prepare(`UPDATE users SET nickname=?,contact_name=?,phone=?,id_number=?,org_name=?,org_address=?,org_intro=?,avatar_url=? WHERE id=?`)
      .run(cleanText(body.nickname,50), cleanText(body.contact_name,50), cleanText(body.phone,30), cleanText(body.id_number,40), cleanText(body.org_name,120), cleanText(body.org_address,200), cleanText(body.org_intro,1000), avatarUrl, user.id);
    return json(res, 200, { message: '个人信息已保存' });
  }

  if (method === 'PUT' && path === '/api/profile/password') {
    const user = auth(req, appDb);
    const body = await bodyJson(req);
    if (!(await verifyPassword(String(body.current_password || ''), user.password_salt, user.password_hash))) throw fail(422, '当前密码不正确', { current_password: '请重新输入' });
    const next = String(body.new_password || '');
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) throw fail(422, '新密码至少 8 位且需包含字母和数字', { new_password: '密码强度不足' });
    const credential = await hashPassword(next);
    db.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').run(credential.hash, credential.salt, user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(user.id, sha256(parseCookies(req).session));
    return json(res, 200, { message: '密码已修改，其他设备已退出' });
  }

  if (method === 'GET' && path === '/api/members') {
    const user = auth(req, appDb);
    return json(res, 200, { members: db.prepare('SELECT * FROM members WHERE user_id=? ORDER BY id DESC').all(user.id) });
  }
  if (method === 'POST' && path === '/api/members') {
    const user = auth(req, appDb); const body = await bodyJson(req);
    required(body, ['name','gender','grade','school','id_number','photo_url','phone','nationality']);
    if (!validPhone(body.phone)) throw fail(422, '请输入有效联系电话', { phone: '电话格式不正确' });
    const photoUrl = validateUploadRef(db, body.photo_url, user, ['member'], { allowAssets: true });
    const result = db.prepare(`INSERT INTO members(user_id,name,gender,grade,school,id_number,photo_url,phone,city,province,nationality,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(user.id, cleanText(body.name,50), cleanText(body.gender,12), cleanText(body.grade,30), cleanText(body.school,120), cleanText(body.id_number,40), photoUrl, cleanText(body.phone,30), cleanText(body.city,50), cleanText(body.province,50), cleanText(body.nationality,50), nowIso());
    return json(res, 201, { message: '队员已添加', id: Number(result.lastInsertRowid) });
  }
  if ((params = matchRoute(path, '/api/members/:id')) && method === 'PUT') {
    const user = auth(req, appDb); const body = await bodyJson(req); const id = Number(params.id);
    if (!userOwns(db,'members',id,user.id)) throw fail(404,'未找到该队员');
    required(body, ['name','gender','grade','school','id_number','photo_url','phone','nationality']);
    if (!validPhone(body.phone)) throw fail(422, '请输入有效联系电话', { phone: '电话格式不正确' });
    const photoUrl = validateUploadRef(db, body.photo_url, user, ['member'], { allowAssets: true });
    const teamIds = db.prepare('SELECT team_id FROM team_members WHERE member_id=?').all(id).map((row) => row.team_id);
    withTransaction(db, () => {
      db.prepare('UPDATE members SET name=?,gender=?,grade=?,school=?,id_number=?,photo_url=?,phone=?,city=?,province=?,nationality=? WHERE id=?')
        .run(cleanText(body.name,50),cleanText(body.gender,12),cleanText(body.grade,30),cleanText(body.school,120),cleanText(body.id_number,40),photoUrl,cleanText(body.phone,30),cleanText(body.city,50),cleanText(body.province,50),cleanText(body.nationality,50),id);
      for (const teamId of teamIds) resetTeamRegistrations(db, teamId);
    });
    return json(res,200,{message:'队员信息已更新'});
  }
  if ((params = matchRoute(path, '/api/members/:id')) && method === 'DELETE') {
    const user = auth(req, appDb); const id = Number(params.id);
    if (!userOwns(db,'members',id,user.id)) throw fail(404,'未找到该队员');
    if (db.prepare('SELECT 1 FROM team_members WHERE member_id=?').get(id)) throw fail(409,'该队员已加入战队，请先编辑对应战队');
    db.prepare('DELETE FROM members WHERE id=?').run(id); return json(res,200,{message:'队员已删除'});
  }

  if (method === 'GET' && path === '/api/coaches') {
    const user = auth(req, appDb); return json(res,200,{coaches:db.prepare('SELECT * FROM coaches WHERE user_id=? ORDER BY id DESC').all(user.id)});
  }
  if (method === 'POST' && path === '/api/coaches') {
    const user=auth(req,appDb); const body=await bodyJson(req); required(body,['name','gender','phone','org_name','email','nationality']);
    if(!validEmail(body.email)) throw fail(422,'邮箱格式不正确',{email:'请输入有效邮箱'});
    if(!validPhone(body.phone)) throw fail(422,'电话格式不正确',{phone:'请输入有效联系电话'});
    const result=db.prepare('INSERT INTO coaches(user_id,name,gender,phone,org_name,email,city,province,nationality,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(user.id,cleanText(body.name,50),cleanText(body.gender,12),cleanText(body.phone,30),cleanText(body.org_name,120),cleanText(body.email,160),cleanText(body.city,50),cleanText(body.province,50),cleanText(body.nationality,50),nowIso());
    return json(res,201,{message:'教练已添加',id:Number(result.lastInsertRowid)});
  }
  if ((params=matchRoute(path,'/api/coaches/:id')) && method==='PUT') {
    const user=auth(req,appDb); const body=await bodyJson(req); const id=Number(params.id); if(!userOwns(db,'coaches',id,user.id)) throw fail(404,'未找到该教练');
    required(body,['name','gender','phone','org_name','email','nationality']);
    if(!validEmail(body.email)) throw fail(422,'邮箱格式不正确',{email:'请输入有效邮箱'});
    if(!validPhone(body.phone)) throw fail(422,'电话格式不正确',{phone:'请输入有效联系电话'});
    const teamIds = db.prepare('SELECT team_id FROM team_coaches WHERE coach_id=?').all(id).map((row) => row.team_id);
    withTransaction(db, () => {
      db.prepare('UPDATE coaches SET name=?,gender=?,phone=?,org_name=?,email=?,city=?,province=?,nationality=? WHERE id=?')
        .run(cleanText(body.name,50),cleanText(body.gender,12),cleanText(body.phone,30),cleanText(body.org_name,120),cleanText(body.email,160),cleanText(body.city,50),cleanText(body.province,50),cleanText(body.nationality,50),id);
      for (const teamId of teamIds) resetTeamRegistrations(db, teamId);
    });
    return json(res,200,{message:'教练信息已更新'});
  }
  if ((params=matchRoute(path,'/api/coaches/:id')) && method==='DELETE') {
    const user=auth(req,appDb); const id=Number(params.id); if(!userOwns(db,'coaches',id,user.id)) throw fail(404,'未找到该教练');
    if(db.prepare('SELECT 1 FROM team_coaches WHERE coach_id=?').get(id)||db.prepare('SELECT 1 FROM teams WHERE contact_coach_id=?').get(id)) throw fail(409,'该教练已关联战队，请先编辑对应战队');
    db.prepare('DELETE FROM coaches WHERE id=?').run(id); return json(res,200,{message:'教练已删除'});
  }

  if (method === 'GET' && path === '/api/teams') {
    const user=auth(req,appDb); const teams=db.prepare('SELECT * FROM teams WHERE user_id=? ORDER BY id DESC').all(user.id).map((team)=>teamDetails(db,team.id,user.id)); return json(res,200,{teams});
  }
  if ((params=matchRoute(path,'/api/teams/:id')) && method==='GET') { const user=auth(req,appDb); return json(res,200,{team:teamDetails(db,Number(params.id),user.id)}); }
  if (method === 'POST' && path === '/api/teams') {
    const user=auth(req,appDb); const body=await bodyJson(req); required(body,['number','name','group_name','school_name','nationality','contact_coach_id']);
    const coachIds=validateEntityIds(db,'coaches',body.coach_ids,user.id); const memberIds=validateEntityIds(db,'members',body.member_ids,user.id); const contactId=Number(body.contact_coach_id);
    if(coachIds.length>2) throw fail(422,'每个战队最多选择两名教练',{coach_ids:'最多选择两名教练'});
    if(!coachIds.includes(contactId)) throw fail(422,'联系人必须从已选教练中指定',{contact_coach_id:'请先选择该教练'}); if(!coachIds.length||!memberIds.length) throw fail(422,'战队至少需要一名教练和一名队员');
    const teamNumber=normalizeTeamNumber(body.group_name,body.number); ensureUniqueTeamNumber(db,teamNumber);
    let teamId;
    try {
      teamId = withTransaction(db, () => {
        const result=db.prepare(`INSERT INTO teams(user_id,number,name,group_name,school_name,school_name_en,address,address_en,city,province,nationality,contact_coach_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(user.id,teamNumber,cleanText(body.name,100),cleanText(body.group_name,80),cleanText(body.school_name,150),cleanText(body.school_name_en,150),cleanText(body.address,200),cleanText(body.address_en,200),cleanText(body.city,50),cleanText(body.province,50),cleanText(body.nationality,50),contactId,nowIso(),nowIso());
        const id = Number(result.lastInsertRowid);
        replaceTeamLinks(db,id,'team_coaches','coach_id',coachIds);
        replaceTeamLinks(db,id,'team_members','member_id',memberIds);
        return id;
      });
    } catch (error) { if(String(error).includes('UNIQUE')) throw fail(409,DUPLICATE_TEAM_NUMBER_MESSAGE,{number:DUPLICATE_TEAM_NUMBER_MESSAGE}); throw error; }
    return json(res,201,{message:'战队已创建',id:teamId});
  }
  if ((params=matchRoute(path,'/api/teams/:id')) && method==='PUT') {
    const user=auth(req,appDb); const body=await bodyJson(req); const id=Number(params.id); if(!userOwns(db,'teams',id,user.id)) throw fail(404,'未找到该战队'); required(body,['number','name','group_name','school_name','nationality','contact_coach_id']);
    const coachIds=validateEntityIds(db,'coaches',body.coach_ids,user.id); const memberIds=validateEntityIds(db,'members',body.member_ids,user.id); const contactId=Number(body.contact_coach_id);
    if(coachIds.length>2) throw fail(422,'每个战队最多选择两名教练',{coach_ids:'最多选择两名教练'});
    if(!coachIds.includes(contactId)) throw fail(422,'联系人必须从已选教练中指定',{contact_coach_id:'请从教练中选择联系人'});
    if(!coachIds.length||!memberIds.length) throw fail(422,'战队至少需要一名教练和一名队员');
    const teamNumber=normalizeTeamNumber(body.group_name,body.number); ensureUniqueTeamNumber(db,teamNumber,id);
    try {
      withTransaction(db, () => {
        db.prepare(`UPDATE teams SET number=?,name=?,group_name=?,school_name=?,school_name_en=?,address=?,address_en=?,city=?,province=?,nationality=?,contact_coach_id=?,updated_at=? WHERE id=?`)
          .run(teamNumber,cleanText(body.name,100),cleanText(body.group_name,80),cleanText(body.school_name,150),cleanText(body.school_name_en,150),cleanText(body.address,200),cleanText(body.address_en,200),cleanText(body.city,50),cleanText(body.province,50),cleanText(body.nationality,50),contactId,nowIso(),id);
        replaceTeamLinks(db,id,'team_coaches','coach_id',coachIds);
        replaceTeamLinks(db,id,'team_members','member_id',memberIds);
        resetTeamRegistrations(db,id);
      });
    } catch(error){ if(String(error).includes('UNIQUE')) throw fail(409,DUPLICATE_TEAM_NUMBER_MESSAGE,{number:DUPLICATE_TEAM_NUMBER_MESSAGE}); throw error; }
    return json(res,200,{message:'战队信息已更新；已审核报名将重新进入审核'});
  }
  if ((params=matchRoute(path,'/api/teams/:id')) && method==='DELETE') { const user=auth(req,appDb); const id=Number(params.id); if(!userOwns(db,'teams',id,user.id)) throw fail(404,'未找到该战队'); if(db.prepare('SELECT 1 FROM registrations WHERE team_id=?').get(id)) throw fail(409,'该战队已有参赛记录，无法删除'); db.prepare('DELETE FROM teams WHERE id=?').run(id); return json(res,200,{message:'战队已删除'}); }

  if (method === 'GET' && path === '/api/registrations') {
    const user=auth(req,appDb); const registrations=db.prepare(`SELECT r.*,e.title AS event_title,e.status AS event_status,e.starts_at,e.ends_at,e.registration_start,e.registration_end,e.refund_deadline_days,t.name AS team_name,t.number AS team_number
      FROM registrations r JOIN events e ON e.id=r.event_id JOIN teams t ON t.id=r.team_id WHERE r.user_id=? ORDER BY CASE WHEN e.starts_at>? THEN 0 WHEN e.ends_at>=? THEN 1 ELSE 2 END,e.starts_at ASC,e.id DESC`).all(user.id,nowIso(),nowIso());
    return json(res,200,{registrations:registrations.map((item)=>{
      const deadlineOpen=Date.now()<=new Date(item.registration_end).getTime();
      const refundDeadline=refundDeadlineFor(item);
      const refundDeadlineOpen=Date.now()<=new Date(refundDeadline).getTime();
      return {...item,refund_deadline:refundDeadline,refund_deadline_label:refundDeadlineLabelFor(item),event_time_status:eventStatus(item),deadline_open:deadlineOpen,refund_deadline_open:refundDeadlineOpen,can_cancel:deadlineOpen&&!item.cancelled_at,can_request_refund:canRequestRefund(item,refundDeadlineOpen),can_reapply:canReapplyRegistration(item,{status:item.event_status,starts_at:item.starts_at,registration_start:item.registration_start,registration_end:item.registration_end})};
    })});
  }
  if ((params=matchRoute(path,'/api/registrations/:id')) && method==='GET') { const user=auth(req,appDb); const row=db.prepare('SELECT * FROM registrations WHERE id=? AND user_id=?').get(Number(params.id),user.id); if(!row) throw fail(404,'未找到该报名记录'); return json(res,200,{registration:registrationDetails(db,row)}); }
  if (method === 'POST' && path === '/api/registrations') {
    const user=auth(req,appDb); const body=await bodyJson(req); required(body,['event_id','team_id','group_name','payment_proof_url']); const event=hydrateEvent(db.prepare("SELECT * FROM events WHERE id=? AND status='published'").get(Number(body.event_id))); if(!event) throw fail(404,'赛事不存在'); if(!event.registration_open) throw fail(409,'当前不在赛事报名时间内'); if(Date.now()>new Date(event.starts_at).getTime()) throw fail(409,'比赛已开始，无法提交报名'); const team=userOwns(db,'teams',Number(body.team_id),user.id); if(!team) throw fail(422,'请选择自己的参赛战队',{team_id:'无效战队'}); if(team.group_name!==body.group_name||!event.groups.includes(body.group_name)) throw fail(422,'战队组别与所选参赛组别不一致',{group_name:'请选择匹配组别'});
    const fullTeam=teamDetails(db,team.id,user.id); if(!fullTeam.coaches.length||!fullTeam.members.length) throw fail(422,'参赛战队必须至少包含一名教练和一名队员');
    const paymentProofUrl=validateUploadRef(db,body.payment_proof_url,user,['payment']);
    let result; try { result=db.prepare('INSERT INTO registrations(event_id,team_id,user_id,group_name,payment_proof_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(event.id,team.id,user.id,cleanText(body.group_name,80),paymentProofUrl,nowIso(),nowIso()); } catch(error){ if(String(error).includes('UNIQUE')) { const existing=db.prepare('SELECT cancelled_at FROM registrations WHERE event_id=? AND team_id=?').get(event.id,team.id); if(existing?.cancelled_at) throw fail(409,CANCELLED_REGISTRATION_REAPPLY_MESSAGE); throw fail(409,'该战队已报名此赛事'); } throw error; }
    return json(res,201,{message:'报名提交成功，请等待管理员审核',id:Number(result.lastInsertRowid)});
  }
  if ((params=matchRoute(path,'/api/registrations/:id')) && method==='PUT') {
    const user=auth(req,appDb); const body=await bodyJson(req); const row=db.prepare('SELECT * FROM registrations WHERE id=? AND user_id=?').get(Number(params.id),user.id); if(!row) throw fail(404,'未找到报名记录'); if(row.status==='approved') throw fail(409,'已通过的报名不可修改');
    if(row.cancelled_at) throw fail(409,'该报名已取消，无法再修改');
    if(['requested','approved'].includes(row.refund_status||'none')) throw fail(409,'退费申请处理中或已通过，暂不可修改报名');
    required(body,['team_id','group_name','payment_proof_url']);
    const event=hydrateEvent(db.prepare("SELECT * FROM events WHERE id=? AND status='published'").get(row.event_id)); if(!event) throw fail(404,'赛事不存在');
    const team=userOwns(db,'teams',Number(body.team_id),user.id); if(!team) throw fail(422,'请选择自己的参赛战队',{team_id:'无效战队'});
    const groupName=cleanText(body.group_name,80); if(team.group_name!==groupName||!event.groups.includes(groupName)) throw fail(422,'战队组别与所选参赛组别不一致',{group_name:'请选择匹配组别'});
    const fullTeam=teamDetails(db,team.id,user.id); if(!fullTeam.coaches.length||!fullTeam.members.length) throw fail(422,'参赛战队必须至少包含一名教练和一名队员');
    const paymentProofUrl=validateUploadRef(db,body.payment_proof_url,user,['payment']);
    try { db.prepare("UPDATE registrations SET team_id=?,group_name=?,payment_proof_url=?,status='pending',rejection_reason='',reviewed_by=NULL,reviewed_at=NULL,updated_at=? WHERE id=?").run(team.id,groupName,paymentProofUrl,nowIso(),row.id); }
    catch(error){ if(String(error).includes('UNIQUE')) throw fail(409,'该战队已报名此赛事'); throw error; }
    return json(res,200,{message:'报名信息已更新并重新进入审核'});
  }
  if ((params=matchRoute(path,'/api/registrations/:id/reapply')) && method==='POST') {
    const user=auth(req,appDb); const body=await bodyJson(req); const row=db.prepare('SELECT * FROM registrations WHERE id=? AND user_id=?').get(Number(params.id),user.id);
    if(!row) throw fail(404,'未找到报名记录');
    if(!row.cancelled_at) throw fail(409,'该报名当前未取消，无需重新申请参赛');
    if(row.refund_status==='requested') throw fail(409,'退费申请正在等待组委会处理，处理完成后再重新申请参赛');
    required(body,['team_id','group_name','payment_proof_url']);
    const event=hydrateEvent(db.prepare("SELECT * FROM events WHERE id=? AND status='published'").get(row.event_id)); if(!event) throw fail(404,'赛事不存在');
    if(!event.registration_open) throw fail(409,'当前不在赛事报名时间内，无法重新申请参赛');
    if(Date.now()>new Date(event.starts_at).getTime()) throw fail(409,'比赛已开始，无法重新申请参赛');
    const team=userOwns(db,'teams',Number(body.team_id),user.id); if(!team) throw fail(422,'请选择自己的参赛战队',{team_id:'无效战队'});
    const groupName=cleanText(body.group_name,80); if(team.group_name!==groupName||!event.groups.includes(groupName)) throw fail(422,'战队组别与所选参赛组别不一致',{group_name:'请选择匹配组别'});
    const fullTeam=teamDetails(db,team.id,user.id); if(!fullTeam.coaches.length||!fullTeam.members.length) throw fail(422,'参赛战队必须至少包含一名教练和一名队员');
    const paymentProofUrl=validateUploadRef(db,body.payment_proof_url,user,['payment']);
    if(row.refund_status==='approved'&&paymentProofUrl===row.payment_proof_url) throw fail(422,'该报名退费已同意，重新申请参赛请重新上传参赛费支付凭证',{payment_proof_url:'请上传新的参赛费支付凭证'});
    db.prepare(`UPDATE registrations SET team_id=?,group_name=?,payment_proof_url=?,status='pending',rejection_reason='',reviewed_by=NULL,reviewed_at=NULL,
      cancelled_at=NULL,cancellation_reason='',refund_status='none',refund_reason='',refund_requested_at=NULL,refund_reviewed_by=NULL,refund_reviewed_at=NULL,refund_note='',updated_at=? WHERE id=?`)
      .run(team.id,groupName,paymentProofUrl,nowIso(),row.id);
    return json(res,200,{message:'已重新申请参赛，请等待管理员审核'});
  }
  if ((params=matchRoute(path,'/api/registrations/:id/cancel')) && method==='POST') {
    const user=auth(req,appDb);const body=await bodyJson(req);const row=db.prepare(`SELECT r.*,e.registration_end FROM registrations r JOIN events e ON e.id=r.event_id WHERE r.id=? AND r.user_id=?`).get(Number(params.id),user.id);
    if(!row)throw fail(404,'未找到报名记录');
    if(row.cancelled_at)return json(res,200,{message:'该参赛报名已经取消'});
    if(Date.now()>new Date(row.registration_end).getTime())throw fail(409,'报名截止后不可自行取消比赛，请联系赛事组委会');
    db.prepare('UPDATE registrations SET cancelled_at=?,cancellation_reason=?,updated_at=? WHERE id=?').run(nowIso(),cleanText(body.reason,500),nowIso(),row.id);
    return json(res,200,{message:'参赛报名已取消，记录将保留供双方查询'});
  }
  if ((params=matchRoute(path,'/api/registrations/:id/refund')) && method==='POST') {
    const user=auth(req,appDb);const body=await bodyJson(req);const reason=cleanText(body.reason,500);const row=db.prepare(`SELECT r.*,e.registration_end,e.refund_deadline_days FROM registrations r JOIN events e ON e.id=r.event_id WHERE r.id=? AND r.user_id=?`).get(Number(params.id),user.id);
    if(!row)throw fail(404,'未找到报名记录');
    const refundDeadline=refundDeadlineFor(row);
    if(Date.now()>new Date(refundDeadline).getTime())throw fail(409,`已超过截止提交退费申请日期（${refundDeadlineLabelFor(row)}），无法在线提交退费申请，请联系赛事组委会`);
    if(!reason)throw fail(422,'请填写退费原因',{reason:'请简要说明退费原因'});
    if(row.refund_status==='requested')return json(res,200,{message:'退费申请正在等待组委会处理'});
    if(row.refund_status==='approved')throw fail(409,'该报名的退费申请已经通过');
    if(refundRequestCount(row)>=REFUND_REQUEST_MAX_COUNT)throw fail(409,`同一战队同一赛事最多可提交 ${REFUND_REQUEST_MAX_COUNT} 次退费申请；如仍需处理，请联系赛事组委会`);
    db.prepare("UPDATE registrations SET refund_status='requested',refund_reason=?,refund_requested_at=?,refund_reviewed_by=NULL,refund_reviewed_at=NULL,refund_note='',refund_request_count=COALESCE(refund_request_count,0)+1,updated_at=? WHERE id=?").run(reason,nowIso(),nowIso(),row.id);
    return json(res,200,{message:'退费申请已提交，请等待组委会处理'});
  }
  if ((params=matchRoute(path,'/api/registrations/:id')) && method==='DELETE') { const user=auth(req,appDb); const row=db.prepare('SELECT * FROM registrations WHERE id=? AND user_id=?').get(Number(params.id),user.id); if(!row) throw fail(404,'未找到报名记录'); if(row.status==='approved') throw fail(409,'已通过的报名不可删除'); if(row.cancelled_at||(row.refund_status||'none')!=='none')throw fail(409,'已取消或已有退费记录的报名需保留，不能删除'); db.prepare('DELETE FROM registrations WHERE id=?').run(row.id); return json(res,200,{message:'报名记录已删除'}); }

  if (method === 'GET' && path === '/api/activity-applications') {
    const user = auth(req, appDb);
    const typeParam = cleanText(url.searchParams.get('type'), 20);
    if (typeParam && !ACTIVITY_TYPES.has(typeParam)) throw fail(422, '报名类别无效');
    const where = typeParam ? 'AND a.type=?' : '';
    const args = typeParam ? [user.id, typeParam, nowIso(), nowIso()] : [user.id, nowIso(), nowIso()];
    const applications = db.prepare(`SELECT a.*,e.title AS event_title,e.starts_at,e.ends_at,e.location
      FROM activity_applications a JOIN events e ON e.id=a.event_id
      WHERE a.user_id=? ${where}
      ORDER BY CASE WHEN e.starts_at>? THEN 0 WHEN e.ends_at>=? THEN 1 ELSE 2 END,e.starts_at ASC,a.id DESC`).all(...args)
      .map((item) => ({ ...item, event_time_status: eventStatus(item) }));
    return json(res, 200, { applications });
  }
  if ((params=matchRoute(path,'/api/activity-applications/:id')) && method==='GET') {
    const user = auth(req, appDb);
    const application = db.prepare(`SELECT a.*,e.title AS event_title,e.starts_at,e.ends_at,e.location
      FROM activity_applications a JOIN events e ON e.id=a.event_id WHERE a.id=? AND a.user_id=?`).get(Number(params.id), user.id);
    if (!application) throw fail(404, '未找到该活动报名');
    return json(res, 200, { application: { ...application, event_time_status: eventStatus(application) } });
  }
  if (method === 'POST' && path === '/api/activity-applications') {
    const user = auth(req, appDb); const body = await bodyJson(req); const data = validateActivityApplication(db, body); const ts = nowIso();
    let result;
    try {
      result = db.prepare(`INSERT INTO activity_applications
        (event_id,user_id,type,name,gender,id_number,phone,email,organization,volunteer_role,availability,experience,attendee_count,companion_names,notes,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(data.event_id,user.id,data.type,data.name,data.gender,data.id_number,data.phone,data.email,data.organization,data.volunteer_role,data.availability,data.experience,data.attendee_count,data.companion_names,data.notes,ts,ts);
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw fail(409, `您已提交过该赛事的${data.type==='volunteer'?'志愿者':'观赛'}报名`);
      throw error;
    }
    return json(res, 201, { message: '报名提交成功，请等待管理员审核', id: Number(result.lastInsertRowid) });
  }
  if ((params=matchRoute(path,'/api/activity-applications/:id')) && method==='PUT') {
    const user = auth(req, appDb); const body = await bodyJson(req); const id = Number(params.id);
    const row = db.prepare('SELECT * FROM activity_applications WHERE id=? AND user_id=?').get(id, user.id);
    if (!row) throw fail(404, '未找到该活动报名');
    if (row.status === 'approved') throw fail(409, '已通过的活动报名不可修改');
    body.type = row.type;
    const data = validateActivityApplication(db, body);
    try {
      db.prepare(`UPDATE activity_applications SET event_id=?,name=?,gender=?,id_number=?,phone=?,email=?,organization=?,volunteer_role=?,availability=?,experience=?,attendee_count=?,companion_names=?,notes=?,status='pending',rejection_reason='',reviewed_by=NULL,reviewed_at=NULL,updated_at=? WHERE id=?`)
        .run(data.event_id,data.name,data.gender,data.id_number,data.phone,data.email,data.organization,data.volunteer_role,data.availability,data.experience,data.attendee_count,data.companion_names,data.notes,nowIso(),id);
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw fail(409, '您已提交过该赛事的同类报名');
      throw error;
    }
    return json(res, 200, { message: '报名信息已更新并重新提交审核' });
  }
  if ((params=matchRoute(path,'/api/activity-applications/:id')) && method==='DELETE') {
    const user = auth(req, appDb); const row = db.prepare('SELECT * FROM activity_applications WHERE id=? AND user_id=?').get(Number(params.id), user.id);
    if (!row) throw fail(404, '未找到该活动报名');
    if (row.status === 'approved') throw fail(409, '已通过的活动报名不可删除');
    db.prepare('DELETE FROM activity_applications WHERE id=?').run(row.id);
    return json(res, 200, { message: '活动报名已删除' });
  }

  if (method === 'GET' && path === '/api/admin/summary') {
    auth(req,appDb,'admin');
    const now = nowIso();
    return json(res,200,{summary:{
      events:db.prepare('SELECT COUNT(*) count FROM events').get().count,
      pending:db.prepare("SELECT COUNT(*) count FROM registrations r JOIN events e ON e.id=r.event_id WHERE r.status='pending' AND r.cancelled_at IS NULL AND e.ends_at>=?").get(now).count,
      approved:db.prepare("SELECT COUNT(*) count FROM registrations WHERE status='approved'").get().count,
      activity_pending:db.prepare("SELECT COUNT(*) count FROM activity_applications a JOIN events e ON e.id=a.event_id WHERE a.status='pending' AND e.ends_at>=?").get(now).count,
      users:db.prepare("SELECT COUNT(*) count FROM users WHERE role='user'").get().count,
      teams:db.prepare('SELECT COUNT(*) count FROM teams').get().count,
    }});
  }
  if (method === 'GET' && path === '/api/admin/events') {
    auth(req,appDb,'admin');
    const now = nowIso();
    const events = db.prepare(`SELECT * FROM events ORDER BY
      CASE WHEN starts_at>? THEN 0 ELSE 1 END ASC,
      starts_at ASC,
      title COLLATE BINARY ASC,
      id ASC`).all(now).map(hydrateEvent);
    return json(res,200,{events});
  }
  if (method === 'POST' && path === '/api/admin/events') {
    const user=auth(req,appDb,'admin'); const body=await bodyJson(req); const groups=validateEventPayload(body); const refundDeadlineDays=validateRefundDeadlineDays(body.refund_deadline_days); const ts=nowIso();
    const imageUrl=validateUploadRef(db,body.image_url,user,['event'],{allowEmpty:true,allowAssets:true,allowAdminAny:true});
    const noticeUrl=validateUploadRef(db,body.notice_url,user,['notice'],{allowEmpty:true,mimeTypes:['application/pdf'],allowAdminAny:true});
    const noticeMarkdown=validateNoticeMarkdownUploads(db,body.notice_markdown,user);
    const result=db.prepare(`INSERT INTO events(title,published_at,image_url,description,starts_at,ends_at,contact_name,contact_phone,location,registration_start,registration_end,refund_deadline_days,groups_json,allow_volunteer,allow_spectator,payee,account_no,bank_code,bank_name,notice_url,notice_markdown,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(cleanText(body.title,200),body.published_at||ts,imageUrl,cleanText(body.description,3000),body.starts_at,body.ends_at,cleanText(body.contact_name,50),cleanText(body.contact_phone,30),cleanText(body.location,200),body.registration_start,body.registration_end,refundDeadlineDays,JSON.stringify(groups),booleanFlag(body.allow_volunteer)?1:0,booleanFlag(body.allow_spectator)?1:0,cleanText(body.payee,150),cleanText(body.account_no,80),cleanText(body.bank_code,80),cleanText(body.bank_name,150),noticeUrl,noticeMarkdown,body.status==='draft'?'draft':'published',user.id,ts,ts); return json(res,201,{message:'赛事已创建',id:Number(result.lastInsertRowid)});
  }
  if ((params=matchRoute(path,'/api/admin/events/:id')) && method==='PUT') { const user=auth(req,appDb,'admin'); const body=await bodyJson(req); const id=Number(params.id); if(!db.prepare('SELECT 1 FROM events WHERE id=?').get(id)) throw fail(404,'未找到赛事'); const groups=validateEventPayload(body); const refundDeadlineDays=validateRefundDeadlineDays(body.refund_deadline_days); const imageUrl=validateUploadRef(db,body.image_url,user,['event'],{allowEmpty:true,allowAssets:true,allowAdminAny:true}); const noticeUrl=validateUploadRef(db,body.notice_url,user,['notice'],{allowEmpty:true,mimeTypes:['application/pdf'],allowAdminAny:true}); const noticeMarkdown=validateNoticeMarkdownUploads(db,body.notice_markdown,user); db.prepare(`UPDATE events SET title=?,published_at=?,image_url=?,description=?,starts_at=?,ends_at=?,contact_name=?,contact_phone=?,location=?,registration_start=?,registration_end=?,refund_deadline_days=?,groups_json=?,allow_volunteer=?,allow_spectator=?,payee=?,account_no=?,bank_code=?,bank_name=?,notice_url=?,notice_markdown=?,status=?,updated_at=? WHERE id=?`)
    .run(cleanText(body.title,200),body.published_at||nowIso(),imageUrl,cleanText(body.description,3000),body.starts_at,body.ends_at,cleanText(body.contact_name,50),cleanText(body.contact_phone,30),cleanText(body.location,200),body.registration_start,body.registration_end,refundDeadlineDays,JSON.stringify(groups),booleanFlag(body.allow_volunteer)?1:0,booleanFlag(body.allow_spectator)?1:0,cleanText(body.payee,150),cleanText(body.account_no,80),cleanText(body.bank_code,80),cleanText(body.bank_name,150),noticeUrl,noticeMarkdown,body.status==='draft'?'draft':'published',nowIso(),id); return json(res,200,{message:'赛事已更新'}); }
  if ((params=matchRoute(path,'/api/admin/events/:id/export')) && method==='GET') {
    auth(req,appDb,'admin');const event=hydrateEvent(db.prepare('SELECT * FROM events WHERE id=?').get(Number(params.id)));if(!event)throw fail(404,'未找到赛事');
    const scope=registrationExportScope(url.searchParams.get('scope'));
    const { archive, groupNames }=groupedRegistrationExport(event,registrationExportRows(db,event.id,scope.key),scope.title);
    const encodedName=encodeURIComponent(`${event.title}-${scope.fileName}.zip`);
    res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="event-${event.id}-${scope.key}-registrations.zip"; filename*=UTF-8''${encodedName}`,'Content-Length':archive.length,'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff','X-Export-Group-Count':String(groupNames.length),'X-Export-Scope':scope.key});
    res.end(archive);return;
  }
  if ((params=matchRoute(path,'/api/admin/events/:id')) && method==='DELETE') {
    auth(req,appDb,'admin');
    const id=Number(params.id);
    const result=db.prepare('DELETE FROM events WHERE id=?').run(id);
    if(!result.changes) throw fail(404,'未找到赛事');
    return json(res,200,{message:'赛事及相关报名记录已删除'});
  }

  if (method === 'GET' && path === '/api/admin/users') {
    auth(req, appDb, 'admin');
    const query = cleanText(url.searchParams.get('q'), 120);
    const conditions = [];
    const args = [];
    if (query) {
      const term = `%${query}%`;
      conditions.push(`(u.username LIKE ? COLLATE NOCASE OR u.nickname LIKE ? COLLATE NOCASE OR u.email LIKE ? COLLATE NOCASE
        OR EXISTS(SELECT 1 FROM teams t WHERE t.user_id=u.id AND (t.number LIKE ? COLLATE NOCASE OR t.name LIKE ? COLLATE NOCASE))
        OR EXISTS(SELECT 1 FROM coaches c WHERE c.user_id=u.id AND c.name LIKE ? COLLATE NOCASE)
        OR EXISTS(SELECT 1 FROM members m WHERE m.user_id=u.id AND m.name LIKE ? COLLATE NOCASE))`);
      args.push(term, term, term, term, term, term, term);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const users = db.prepare(`SELECT u.id,u.username,u.nickname,u.email,u.phone,u.contact_name,u.org_name,u.role,u.admin_level,u.created_at,
      (SELECT COUNT(*) FROM teams t WHERE t.user_id=u.id) AS team_count,
      (SELECT COUNT(*) FROM coaches c WHERE c.user_id=u.id) AS coach_count,
      (SELECT COUNT(*) FROM members m WHERE m.user_id=u.id) AS member_count,
      (SELECT COUNT(*) FROM registrations r WHERE r.user_id=u.id) AS registration_count
      FROM users u ${where} ORDER BY CASE u.admin_level WHEN 'super' THEN 0 WHEN 'mid' THEN 1 ELSE 2 END,u.created_at DESC,u.id DESC`).all(...args);
    return json(res, 200, { users });
  }
  if ((params=matchRoute(path,'/api/admin/users/:id/role')) && method==='POST') {
    const actor = auth(req, appDb, 'admin');
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) throw fail(422, '用户编号无效');
    const body = await bodyJson(req);
    const nextLevel = cleanText(body.admin_level, 20) || (body.role === 'admin' ? 'mid' : body.role === 'user' ? 'none' : '');
    if (!['none', 'mid', 'super'].includes(nextLevel)) throw fail(422, '用户权限无效');
    const result = withTransaction(db, () => {
      const target = db.prepare('SELECT id,username,email,role,admin_level FROM users WHERE id=?').get(id);
      if (!target) throw fail(404, '未找到该用户');
      const targetLevel = target.role === 'admin' ? (target.admin_level === 'super' ? 'super' : 'mid') : 'none';
      const actorLevel = actor.admin_level === 'super' ? 'super' : 'mid';
      if (targetLevel === nextLevel) return { target: { ...target, admin_level: targetLevel }, changed: false };
      if (actor.id === id) throw fail(409, '不能修改当前登录管理员自己的权限');
      if (actorLevel !== 'super' && (targetLevel === 'super' || nextLevel === 'super')) {
        throw fail(403, '只有最高管理员可以设置或撤销最高管理员权限');
      }
      if (targetLevel === 'super' && nextLevel !== 'super') {
        const superCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND admin_level='super'").get().count;
        if (superCount <= 1) throw fail(409, '系统至少需要保留一名最高管理员');
      }
      const nextRole = nextLevel === 'none' ? 'user' : 'admin';
      db.prepare('UPDATE users SET role=?,admin_level=? WHERE id=?').run(nextRole, nextLevel, id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      return { target: { ...target, role: nextRole, admin_level: nextLevel }, changed: true };
    });
    const roleLabel = nextLevel === 'super' ? '最高管理员' : nextLevel === 'mid' ? '中级管理员' : '普通用户';
    return json(res, 200, {
      message: result.changed ? `已将“${result.target.username}”设为${roleLabel}，该账号需重新登录` : `该账号已经是${roleLabel}`,
      user: { id: result.target.id, role: result.target.role, admin_level: result.target.admin_level },
    });
  }
  if ((params=matchRoute(path,'/api/admin/users/:id')) && method==='DELETE') {
    const actor = auth(req, appDb, 'admin');
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) throw fail(422, '用户编号无效');
    const result = withTransaction(db, () => {
      const target = db.prepare('SELECT id,username,role,admin_level FROM users WHERE id=?').get(id);
      if (!target) throw fail(404, '未找到该用户');
      if (actor.id === id) throw fail(409, '不能删除当前登录账号');
      if (target.role === 'admin' && target.admin_level === 'super') {
        throw fail(403, '最高管理员账号受保护，不能删除');
      }
      // Clear nullable audit references before removing the user, then remove
      // registrations first because their team FK predates cascade support.
      db.prepare('UPDATE events SET created_by=NULL WHERE created_by=?').run(id);
      db.prepare('UPDATE registrations SET reviewed_by=NULL,refund_reviewed_by=NULL WHERE reviewed_by=? OR refund_reviewed_by=?').run(id, id);
      db.prepare('UPDATE activity_applications SET reviewed_by=NULL WHERE reviewed_by=?').run(id);
      db.prepare('DELETE FROM registrations WHERE user_id=?').run(id);
      db.prepare('DELETE FROM activity_applications WHERE user_id=?').run(id);
      db.prepare('DELETE FROM users WHERE id=?').run(id);
      return target;
    });
    return json(res, 200, { message: `用户“${result.username}”及其关联资料已删除` });
  }
  if ((params=matchRoute(path,'/api/admin/users/:id')) && method==='GET') {
    auth(req, appDb, 'admin');
    return json(res, 200, { user: adminUserDetails(db, Number(params.id)) });
  }

  if (method === 'GET' && path === '/api/admin/teams') {
    auth(req,appDb,'admin');
    const query = cleanText(url.searchParams.get('q'),120);
    const conditions = []; const args = [];
    if (query) {
      const term = `%${query}%`;
      conditions.push(`(t.number LIKE ? COLLATE NOCASE OR t.name LIKE ? COLLATE NOCASE OR t.group_name LIKE ? COLLATE NOCASE OR t.school_name LIKE ? COLLATE NOCASE OR u.email LIKE ? COLLATE NOCASE
        OR EXISTS(SELECT 1 FROM team_coaches tc JOIN coaches c ON c.id=tc.coach_id WHERE tc.team_id=t.id AND c.name LIKE ? COLLATE NOCASE)
        OR EXISTS(SELECT 1 FROM team_members tm JOIN members m ON m.id=tm.member_id WHERE tm.team_id=t.id AND m.name LIKE ? COLLATE NOCASE))`);
      args.push(term,term,term,term,term,term,term);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const teams = db.prepare(`SELECT t.*,u.email AS owner_email,u.nickname AS owner_nickname,
      (SELECT COUNT(*) FROM team_coaches tc WHERE tc.team_id=t.id) AS coach_count,
      (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id=t.id) AS member_count,
      (SELECT COUNT(*) FROM registrations r WHERE r.team_id=t.id) AS registration_count
      FROM teams t JOIN users u ON u.id=t.user_id ${where}
      ORDER BY t.updated_at DESC,t.id DESC`).all(...args);
    return json(res,200,{teams});
  }
  if ((params=matchRoute(path,'/api/admin/teams/:id')) && method==='GET') {
    auth(req,appDb,'admin');
    return json(res,200,{team:adminTeamDetails(db,Number(params.id))});
  }
  if ((params=matchRoute(path,'/api/admin/teams/:id')) && method==='PUT') {
    auth(req,appDb,'admin');
    const id=Number(params.id); const current=db.prepare('SELECT * FROM teams WHERE id=?').get(id);
    if(!current)throw fail(404,'未找到该战队');
    const body=await bodyJson(req);required(body,['number','name','group_name','school_name','nationality','contact_coach_id']);
    const coachIds=validateEntityIds(db,'coaches',body.coach_ids,current.user_id);const memberIds=validateEntityIds(db,'members',body.member_ids,current.user_id);const contactId=Number(body.contact_coach_id);
    if(coachIds.length>2)throw fail(422,'每个战队最多选择两名教练',{coach_ids:'最多选择两名教练'});
    if(!coachIds.includes(contactId))throw fail(422,'联系人必须从已选教练中指定',{contact_coach_id:'请从教练中选择联系人'});
    if(!coachIds.length||!memberIds.length)throw fail(422,'战队至少需要一名教练和一名队员');
    const teamNumber=normalizeTeamNumber(body.group_name,body.number);ensureUniqueTeamNumber(db,teamNumber,id);
    try {
      withTransaction(db,()=>{
        db.prepare(`UPDATE teams SET number=?,name=?,group_name=?,school_name=?,school_name_en=?,address=?,address_en=?,city=?,province=?,nationality=?,contact_coach_id=?,updated_at=? WHERE id=?`)
          .run(teamNumber,cleanText(body.name,100),cleanText(body.group_name,80),cleanText(body.school_name,150),cleanText(body.school_name_en,150),cleanText(body.address,200),cleanText(body.address_en,200),cleanText(body.city,50),cleanText(body.province,50),cleanText(body.nationality,50),contactId,nowIso(),id);
        replaceTeamLinks(db,id,'team_coaches','coach_id',coachIds);
        replaceTeamLinks(db,id,'team_members','member_id',memberIds);
        resetTeamRegistrations(db,id);
      });
    }catch(error){if(String(error).includes('UNIQUE'))throw fail(409,DUPLICATE_TEAM_NUMBER_MESSAGE,{number:DUPLICATE_TEAM_NUMBER_MESSAGE});throw error;}
    return json(res,200,{message:'战队信息已由管理员更新；已审核报名将重新进入审核'});
  }
  if ((params=matchRoute(path,'/api/admin/teams/:id')) && method==='DELETE') {
    auth(req,appDb,'admin');const id=Number(params.id);
    if(!db.prepare('SELECT 1 FROM teams WHERE id=?').get(id))throw fail(404,'未找到该战队');
    if(db.prepare('SELECT 1 FROM registrations WHERE team_id=?').get(id))throw fail(409,'该战队已有参赛记录，为保留审核历史无法删除；可编辑战队资料');
    db.prepare('DELETE FROM teams WHERE id=?').run(id);
    return json(res,200,{message:'战队已由管理员删除'});
  }

  if (method === 'GET' && path === '/api/admin/registrations') {
    auth(req,appDb,'admin');
    const eventIdParam=cleanText(url.searchParams.get('event_id'),20);
    const eventId=eventIdParam?Number(eventIdParam):0;
    const group=cleanText(url.searchParams.get('group'),120);
    const status=cleanText(url.searchParams.get('status'),20);
    const query=cleanText(url.searchParams.get('q'),120);
    if(eventIdParam&&(!Number.isInteger(eventId)||eventId<=0))throw fail(422,'赛事 ID 无效');
    if(status&&!['pending','approved','rejected'].includes(status))throw fail(422,'审核状态无效');
    const conditions=['e.ends_at>=?']; const args=[nowIso()];
    if(eventId){conditions.push('r.event_id=?');args.push(eventId);}
    if(group){conditions.push('r.group_name=?');args.push(group);}
    if(status){conditions.push('r.status=?');conditions.push('r.cancelled_at IS NULL');args.push(status);}
    if(query){const term=`%${query}%`;conditions.push('(e.title LIKE ? COLLATE NOCASE OR t.name LIKE ? COLLATE NOCASE OR t.number LIKE ? COLLATE NOCASE OR u.email LIKE ? COLLATE NOCASE OR r.group_name LIKE ? COLLATE NOCASE)');args.push(term,term,term,term,term);}
    const rows=db.prepare(`SELECT r.*,e.title AS event_title,t.name AS team_name,t.number AS team_number,u.email AS user_email FROM registrations r JOIN events e ON e.id=r.event_id JOIN teams t ON t.id=r.team_id JOIN users u ON u.id=r.user_id WHERE ${conditions.join(' AND ')} ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,r.created_at ASC`).all(...args);
    return json(res,200,{registrations:rows});
  }
  if ((params=matchRoute(path,'/api/admin/registrations/:id')) && method==='GET') { auth(req,appDb,'admin'); const row=db.prepare('SELECT * FROM registrations WHERE id=?').get(Number(params.id)); if(!row) throw fail(404,'未找到报名记录'); return json(res,200,{registration:registrationDetails(db,row)}); }
  if ((params=matchRoute(path,'/api/admin/registrations/:id/review')) && method==='POST') {
    const user=auth(req,appDb,'admin'); const body=await bodyJson(req);
    if(!['approved','rejected'].includes(body.status)) throw fail(422,'请选择通过或驳回');
    if(body.status==='rejected'&&!cleanText(body.reason)) throw fail(422,'驳回时必须填写原因',{reason:'请说明需要修改的内容'});
    const id=Number(params.id);
    const current=db.prepare('SELECT status,cancelled_at,refund_status FROM registrations WHERE id=?').get(id);
    if(!current)throw fail(404,'未找到报名记录');
    if(current.cancelled_at)throw fail(409,'用户已取消该报名，不能再修改审核状态');
    if(body.status==='approved'&&current.refund_status==='approved')throw fail(409,'退费已同意，报名状态不能改为通过');
    if(current.status===body.status)return json(res,200,{message:body.status==='approved'?'报名状态已是通过':'报名状态已是驳回'});
    db.prepare('UPDATE registrations SET status=?,rejection_reason=?,reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=?')
      .run(body.status,body.status==='rejected'?cleanText(body.reason,500):'',user.id,nowIso(),nowIso(),id);
    const notice = await notifyRegistrationReview(db,id,body.status);
    const emailHint = notice.failed ? '，但邮件通知发送失败，请检查邮箱配置' : notice.sent ? '，已邮件通知教练' : '，未找到可通知的教练邮箱';
    return json(res,200,{message:`${body.status==='approved'?'报名已改为通过':'报名已改为驳回'}${emailHint}`});
  }
  if ((params=matchRoute(path,'/api/admin/registrations/:id/refund-review')) && method==='POST') {
    const user=auth(req,appDb,'admin');const body=await bodyJson(req);const status=cleanText(body.status,20);const note=cleanText(body.note,500);if(!['approved','rejected'].includes(status))throw fail(422,'请选择同意或拒绝退费');if(status==='rejected'&&!note)throw fail(422,'拒绝退费时请填写处理说明',{note:'请说明拒绝原因'});
    const current=db.prepare('SELECT refund_status FROM registrations WHERE id=?').get(Number(params.id));if(!current)throw fail(404,'未找到报名记录');if(current.refund_status==='none')throw fail(409,'该报名尚未提交退费申请');
    const reviewedAt=nowIso();
    db.prepare(`UPDATE registrations SET
      refund_status=?,refund_reviewed_by=?,refund_reviewed_at=?,refund_note=?,
      status=CASE WHEN ?='approved' THEN 'rejected' ELSE status END,
      rejection_reason=CASE WHEN ?='approved' THEN '退费申请已同意，报名状态已自动驳回' ELSE rejection_reason END,
      reviewed_by=CASE WHEN ?='approved' THEN ? ELSE reviewed_by END,
      reviewed_at=CASE WHEN ?='approved' THEN ? ELSE reviewed_at END,
      updated_at=? WHERE id=?`).run(status,user.id,reviewedAt,note,status,status,status,user.id,status,reviewedAt,reviewedAt,Number(params.id));
    return json(res,200,{message:status==='approved'?'退费申请已同意，报名状态已自动驳回':'退费申请已拒绝'});
  }

  if (method === 'GET' && path === '/api/admin/activity-applications') {
    auth(req, appDb, 'admin');
    const eventIdParam = cleanText(url.searchParams.get('event_id'), 20);
    const eventId = eventIdParam ? Number(eventIdParam) : 0;
    const typeParam = cleanText(url.searchParams.get('type'), 20);
    const status = cleanText(url.searchParams.get('status'), 20);
    const query = cleanText(url.searchParams.get('q'), 120);
    if (eventIdParam && (!Number.isInteger(eventId) || eventId <= 0)) throw fail(422, '赛事 ID 无效');
    if (typeParam && !ACTIVITY_TYPES.has(typeParam)) throw fail(422, '报名类别无效');
    if (status && !['pending','approved','rejected'].includes(status)) throw fail(422, '审核状态无效');
    const conditions = ['e.ends_at>=?']; const args = [nowIso()];
    if (eventId) { conditions.push('a.event_id=?'); args.push(eventId); }
    if (typeParam) { conditions.push('a.type=?'); args.push(typeParam); }
    if (status) { conditions.push('a.status=?'); args.push(status); }
    if (query) { const term=`%${query}%`; conditions.push('(e.title LIKE ? COLLATE NOCASE OR a.name LIKE ? COLLATE NOCASE OR a.phone LIKE ? COLLATE NOCASE OR a.email LIKE ? COLLATE NOCASE OR a.organization LIKE ? COLLATE NOCASE)'); args.push(term,term,term,term,term); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const applications = db.prepare(`SELECT a.*,e.title AS event_title,e.starts_at,e.ends_at,e.location,u.email AS user_email
      FROM activity_applications a JOIN events e ON e.id=a.event_id JOIN users u ON u.id=a.user_id ${where}
      ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,a.created_at ASC`).all(...args)
      .map((item) => ({ ...item, event_time_status: eventStatus(item) }));
    return json(res, 200, { applications });
  }
  if ((params=matchRoute(path,'/api/admin/activity-applications/:id')) && method==='GET') {
    auth(req, appDb, 'admin');
    const application = db.prepare(`SELECT a.*,e.title AS event_title,e.starts_at,e.ends_at,e.location,u.email AS user_email
      FROM activity_applications a JOIN events e ON e.id=a.event_id JOIN users u ON u.id=a.user_id WHERE a.id=?`).get(Number(params.id));
    if (!application) throw fail(404, '未找到该活动报名');
    return json(res, 200, { application: { ...application, event_time_status: eventStatus(application) } });
  }
  if ((params=matchRoute(path,'/api/admin/activity-applications/:id/review')) && method==='POST') {
    const user = auth(req, appDb, 'admin'); const body = await bodyJson(req);
    if (!['approved','rejected'].includes(body.status)) throw fail(422, '请选择通过或驳回');
    if (body.status === 'rejected' && !cleanText(body.reason)) throw fail(422, '驳回时必须填写原因', { reason: '请说明需要修改的内容' });
    const id = Number(params.id);
    const current = db.prepare('SELECT status FROM activity_applications WHERE id=?').get(id);
    if (!current) throw fail(404, '未找到该活动报名');
    if (current.status === body.status) return json(res, 200, { message: body.status==='approved'?'活动报名状态已是通过':'活动报名状态已是驳回' });
    db.prepare('UPDATE activity_applications SET status=?,rejection_reason=?,reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=?')
      .run(body.status,body.status==='rejected'?cleanText(body.reason,500):'',user.id,nowIso(),nowIso(),id);
    const notice = await notifyActivityApplicationReview(db, id, body.status);
    const emailHint = notice.failed ? '，但邮件通知发送失败，请检查邮箱配置' : notice.sent ? '，已邮件通知报名人' : '，未找到可通知的邮箱';
    return json(res, 200, { message: `${body.status==='approved'?'活动报名已改为通过':'活动报名已改为驳回'}${emailHint}` });
  }

  throw fail(404, '接口不存在');
}

async function serveStatic(req, res, url, uploadDir = UPLOAD_DIR, appDb) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const isUpload = pathname.startsWith('/uploads/');
  const base = isUpload ? uploadDir : PUBLIC_DIR;
  const relativePath = isUpload ? pathname.slice('/uploads/'.length) : pathname.slice(1);
  const filePath = resolve(base, normalize(relativePath));
  const boundary = relative(resolve(base), filePath);
  if (boundary.startsWith('..') || isAbsolute(boundary)) throw fail(403, '拒绝访问');
  let uploadRecord;
  let publicUpload = false;
  if (isUpload) {
    uploadRecord = appDb?.db.prepare('SELECT * FROM uploads WHERE url=?').get(pathname);
    if (!uploadRecord) throw fail(404, '文件不存在');
    publicUpload = ['event','notice'].includes(uploadRecord.kind) && Boolean(appDb.db.prepare("SELECT 1 FROM events WHERE status='published' AND (image_url=? OR notice_url=?)").get(pathname, pathname));
    if (!publicUpload && uploadRecord.kind === 'notice_image') {
      publicUpload = Boolean(appDb.db.prepare("SELECT 1 FROM events WHERE status='published' AND notice_markdown LIKE ?").get(`%${pathname}%`));
    }
    const user = getSession(req, appDb);
    if (!publicUpload && (!user || (user.role !== 'admin' && user.id !== uploadRecord.owner_user_id))) throw fail(403, '没有权限查看该文件');
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not-file');
    const data = await readFile(filePath);
    const headers = {
      'Content-Type': uploadRecord?.mime_type || MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': publicUpload || pathname.startsWith('/assets/') ? 'public,max-age=3600' : isUpload ? 'private,no-store' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    };
    if (uploadRecord?.kind === 'notice' && uploadRecord.mime_type === 'application/pdf') {
      headers['Content-Disposition'] = 'inline';
      headers['Cross-Origin-Resource-Policy'] = 'same-origin';
      res.removeHeader('X-Frame-Options');
    }
    const range = req.headers.range;
    const isMedia = /^video\//.test(headers['Content-Type']) || /^audio\//.test(headers['Content-Type']);
    if (isMedia) headers['Accept-Ranges'] = 'bytes';
    if (isMedia && range) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
      if (!match) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${data.length}` });
        res.end();
        return;
      }
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), data.length - 1) : data.length - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= data.length) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${data.length}` });
        res.end();
        return;
      }
      const chunk = data.subarray(start, end + 1);
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${data.length}`,
        'Content-Length': chunk.length,
      });
      res.end(chunk);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': data.length });
    res.end(data);
  } catch {
    if (!pathname.startsWith('/api/') && !pathname.includes('.')) {
      const data = await readFile(join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'], 'Cache-Control': 'no-cache' }); res.end(data); return;
    }
    throw fail(404, '页面不存在');
  }
}

export async function createApplication({
  dbPath = process.env.DB_PATH || join(DATA_DIR, 'app.db'),
  uploadDir = UPLOAD_DIR,
} = {}) {
  await mkdir(uploadDir, { recursive: true });
  const appDb = new AppDatabase(dbPath);
  await appDb.seed();
  appDb.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(nowIso());
  appDb.db.prepare('DELETE FROM verification_codes WHERE expires_at<=?').run(new Date(Date.now() - 24 * 60 * 60_000).toISOString());
  appDb.db.prepare('DELETE FROM login_challenges WHERE expires_at<=?').run(new Date(Date.now() - 24 * 60 * 60_000).toISOString());
  appDb.db.prepare('DELETE FROM password_reset_challenges WHERE expires_at<=?').run(new Date(Date.now() - 24 * 60 * 60_000).toISOString());
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url, appDb, uploadDir);
      else await serveStatic(req, res, url, uploadDir, appDb);
    } catch (error) {
      if (res.headersSent) return res.end();
      if ((error.status || 500) >= 500) console.error(error);
      json(res, error.status || 500, { error: error.status ? error.message : '服务器暂时无法处理请求', fields: error.fields || undefined });
    }
  });
  return { server, db: appDb.db };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = await createApplication();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
server.listen(port, host, () => console.log(`${PLATFORM_NAME}已启动：http://${host}:${port}`));
}
