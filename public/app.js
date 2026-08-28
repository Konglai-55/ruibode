const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const app = $('#app');
const header = $('#site-header');
const modalRoot = $('#modal-root');
const toastRegion = $('#toast-region');

const state = {
  user: null,
  csrfToken: null,
  events: [],
  captcha: null,
  passwordResetChallenge: null,
  renderId: 0,
  lastFocus: null,
  markdownSelection: null,
  activityAvailability: { volunteer: false, spectator: false },
  homeCarouselTimer: null,
};
const INNOVATION_GROUP_PREFIXES = Object.freeze({
  'RECF-Achieve 创新初中组': 'RECF-A-CZ',
  'RECF-Achieve 创新高中组': 'RECF-A-GZ',
  'RECF-Engage 创新小学组': 'RECF-E-XX',
  'RECF-Engage 创新初中组': 'RECF-E-CZ',
  'RECF-Inspire 创新大学组': 'RECF-I-DX',
});
const DEFAULT_TEAM_GROUPS = Object.freeze([
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
const TEAM_NUMBER_MAX_LENGTH = 30;
const REGISTRATION_DRAFT_KEY = 'ruibude-registration-draft-v1';
const AUTH_VERIFICATION_TTL_MS = 10 * 60_000;
const TEAM_NUMBER_FORMAT_MESSAGE = '请输入 1–30 个 ASCII 字符，不可包含空格或中文';
const DUPLICATE_REGISTRATION_MESSAGE = '该战队已报名此赛事';
const CANCELLED_REGISTRATION_REAPPLY_MESSAGE = '您的赛队已取消参赛，若要重新参赛，请于右上角下拉栏 -> 我的比赛 -> 对应比赛打开列表 -> 重新申请参赛';
const RULE_PROGRAMS = Object.freeze([
  {
    id: 'recf-engage',
    shortName: 'RECF Engage 小初塑料',
    title: 'RECF Engage·飞跃巅峰·小初塑料',
    game: 'Tier Takeover',
    version: '中文赛事手册 1.1',
    cover: '/assets/rules/recf-engage-cover.png',
    pdf: '/assets/rules/RECF·飞跃巅峰·小初塑料·1.1.pdf',
    description: '面向小学及初中阶段的实践型机器人竞赛，通过设计、搭建、编程和团队协作，引导学生在真实任务中培养工程思维与解决问题的能力。',
    highlights: ['小学组（U12）或初中组（U15），每队 2 名及以上学生', '可使用指定的 VEX IQ、Hexbug、LEGO 电子元件与结构件', '允许符合规则的切割件及 3D 打印自制零件'],
  },
  {
    id: 'recf-achieve',
    shortName: 'RECF Achieve 初高金属',
    title: 'RECF Achieve·高瞻远瞩·初高金属',
    game: 'Pinnacle',
    version: '中文规则 1.2',
    cover: '/assets/rules/recf-achieve-cover.png',
    pdf: '/assets/rules/RECF·高瞻远瞩·初高金属·1.2.pdf',
    description: '面向初中及高中阶段的综合机器人竞赛，鼓励学生灵活运用多种机械系统、气动元件与自制零件，完成驾驶、自动程序和联队任务。',
    highlights: ['初中组（U15）或高中组（U19），每队 1 名及以上学生', '可使用 VEX V5、Robits、TETRIX MAX 等结构系统，电子系统统一使用 VEX V5', '允许符合规则的气动、切割塑料件及 3D 打印零件'],
  },
  {
    id: 'recf-inspire',
    shortName: 'RECF Inspire 大学金属',
    title: 'RECF Inspire·高瞻远瞩·大学金属',
    game: 'Pinnacle',
    version: '中文规则 1.2',
    cover: '/assets/rules/recf-inspire-cover.png',
    pdf: '/assets/rules/RECF·高瞻远瞩·大学金属·1.2.pdf',
    description: '面向高等教育阶段学生的开放式机器人竞赛，强调自主工程设计、跨系统整合以及同一战队两台机器人的协同策略。',
    highlights: ['适用于正在接受高等教育的在籍大学学生', '结构系统开放，可按规则使用多种机器人平台与常规消费级零部件', '允许大量自制塑料、3D 打印及定制设计零件', '一个RECF Inspire联盟由来自同一支已注册赛队的两台机器人和两个操作手团队组成'],
  },
]);
const DUPLICATE_TEAM_NUMBER_MESSAGE = '该战队编号已被其他队伍注册（已被占用）\n\n如果您输入的确实是 RECF 官方分配给您的战队编号，但系统提示已被占用，请联系组委会协助核实处理：\n\n组委会邮箱：654849662@qq.com\n\n咨询电话：13761393714（小周老师）';

const iconPaths = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V21h14V10.5M9 21v-6h6v6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  map: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H3v2a4 4 0 0 0 4 4M17 6h4v2a4 4 0 0 1-4 4"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  logout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A11.2 11.2 0 0 1 12 4c6.5 0 10 8 10 8a16.2 16.2 0 0 1-2.3 3.5M6.6 6.6C3.5 8.5 2 12 2 12s3.5 8 10 8a9 9 0 0 0 4.1-1"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 14v6h14v-6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  alert: '<path d="M10.3 3.6L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  dashboard: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  flag: '<path d="M5 22V4"/><path d="M5 5h11l-2 4 2 4H5"/>',
  wallet: '<path d="M4 6h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h13v4"/><path d="M16 12h5v4h-5a2 2 0 0 1 0-4z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  bold: '<path d="M7 5h6a4 4 0 0 1 0 8H7zM7 13h7a4 4 0 0 1 0 8H7z"/>',
  italic: '<path d="M10 5h8M6 19h8M14 5L10 19"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/>',
  orderedList: '<path d="M10 6h11M10 12h11M10 18h11M4 5h1v3M3.5 13c.5-1 2.5-1 2.5.3 0 1-2.5 2.7-2.5 2.7H6M3.5 19h1.25a1.25 1.25 0 0 1 0 2.5H3.5"/>',
  quote: '<path d="M7 17H4a2 2 0 0 1-2-2v-3a5 5 0 0 1 5-5v3a2 2 0 0 0-2 2h2zM18 17h-3a2 2 0 0 1-2-2v-3a5 5 0 0 1 5-5v3a2 2 0 0 0-2 2h2z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M9 4v16M15 4v16"/>',
  code: '<path d="M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5L5 19"/>',
};

function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.info}</svg>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function safeUrl(value) {
  const url = String(value || '');
  return /^(\/|data:image\/)/.test(url) ? escapeHtml(url) : '';
}

function safeMarkdownHref(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('#') || /^\/(?!\/)/.test(raw)) return raw;
  try {
    const parsed = new URL(raw, location.origin);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? raw : '';
  } catch { return ''; }
}

function safeMarkdownImageSrc(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\/(?:assets|uploads)\/[^\s"'<>]+$/.test(raw)) return raw;
  return '';
}

function markdownInline(value) {
  const tokens = [];
  const hold = (html) => `\uE000${tokens.push(html) - 1}\uE001`;
  let text = String(value ?? '');
  text = text.replace(/`([^`\n]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`));
  text = text.replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, (source, label, src) => {
    const safeSrc = safeMarkdownImageSrc(src);
    if (!safeSrc) return source;
    return hold(`<img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(label || '通知图片')}" loading="lazy">`);
  });
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (source, label, href) => {
    const safeHref = safeMarkdownHref(href);
    if (!safeHref) return source;
    const external = /^https?:/i.test(safeHref) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return hold(`<a href="${escapeHtml(safeHref)}"${external}>${escapeHtml(label)}</a>`);
  });
  text = text.replace(/\b(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?\b/g,
    (_, year, month, day, hour, minute) => `${year}年${Number(month)}月${Number(day)}日 ${hour}:${minute}`);
  let html = escapeHtml(text)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>');
  return html.replace(/\uE000(\d+)\uE001/g, (_, index) => tokens[Number(index)] || '');
}

function markdownCells(line) {
  return String(line).trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function renderMarkdown(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let paragraph = [];
  let listType = '';
  let listItems = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${paragraph.map(markdownInline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    output.push(`<${listType}>${listItems.map((item) => `<li>${markdownInline(item)}</li>`).join('')}</${listType}>`);
    listType = ''; listItems = [];
  };
  const flush = () => { flushParagraph(); flushList(); };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      flush();
      const code = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) { code.push(lines[index]); index += 1; }
      output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (!line.trim()) { flush(); continue; }

    const nextLine = lines[index + 1] || '';
    const headerCells = markdownCells(line);
    const separatorCells = markdownCells(nextLine);
    const isTable = line.includes('|') && separatorCells.length === headerCells.length && separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell));
    if (isTable) {
      flush();
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        rows.push(markdownCells(lines[index]));
        index += 1;
      }
      index -= 1;
      output.push(`<div class="markdown-table-wrap"><table><thead><tr>${headerCells.map((cell) => `<th>${markdownInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headerCells.map((_, cellIndex) => `<td>${markdownInline(row[cellIndex] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    const heading = line.match(/^\s*(#{1,4})\s+(.+)$/);
    if (heading) { flush(); const level = heading[1].length; output.push(`<h${level}>${markdownInline(heading[2].trim())}</h${level}>`); continue; }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); output.push('<hr>'); continue; }
    if (/^\s*>\s?/.test(line)) {
      flush();
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) { quote.push(lines[index].replace(/^\s*>\s?/, '')); index += 1; }
      index -= 1;
      output.push(`<blockquote>${quote.map(markdownInline).join('<br>')}</blockquote>`);
      continue;
    }
    const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = unordered ? 'ul' : 'ol';
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((unordered || ordered)[1]);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flush();
  return output.join('');
}

function noticeMarkdown(event) {
  const content = String(event?.notice_markdown || '').trim();
  const pdfUrl = safeUrl(event?.notice_url);
  const pdfViewerUrl = pdfUrl ? `${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH` : '';
  const body = content ? `<div class="markdown-body notice-markdown">${renderMarkdown(content)}</div>` : '';
  const pdf = pdfUrl ? `<section class="notice-pdf" aria-labelledby="notice-pdf-title"><div class="notice-pdf-header"><div><span class="record-label">PDF 附件</span><h3 id="notice-pdf-title">办赛通知 PDF</h3></div></div><iframe class="notice-pdf-frame" src="${pdfViewerUrl}" title="${escapeHtml(event?.title || '赛事')}办赛通知 PDF" loading="lazy" referrerpolicy="same-origin"></iframe><p class="notice-pdf-fallback">PDF 为页面内只读预览；若当前浏览器仍无法直接显示，请联系赛事管理员确认浏览器设置。</p></section>` : '';
  return body || pdf
    ? `${body}${pdf}`
    : `<div class="empty-state"><div class="empty-icon">${icon('file',30)}</div><h3>暂无办赛通知</h3><p>赛事管理员尚未发布通知正文或 PDF 文件。</p></div>`;
}

function routeInfo() {
  const raw = location.hash.slice(1) || '/home';
  const [path, query = ''] = raw.split('?');
  return { path: path.startsWith('/') ? path : `/${path}`, query: new URLSearchParams(query) };
}

function go(path) {
  location.hash = path.startsWith('#') ? path.slice(1) : path;
}

function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) }).format(date);
}

function toInputDate(value) {
  if (!value) return '';
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

function refundDeadlineLabel(registrationEnd, daysValue = 10) {
  const parts = String(registrationEnd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const days = Number(daysValue);
  if (!parts || !Number.isInteger(days) || days < 0) return '';
  const target = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]) - days));
  return `${target.getUTCFullYear()}年${String(target.getUTCMonth() + 1).padStart(2, '0')}月${String(target.getUTCDate()).padStart(2, '0')}日 24:00`;
}

function syncAdminRefundDeadline(form) {
  if (!form) return;
  const preview = form.querySelector('[data-refund-deadline-preview]');
  const helper = form.querySelector('[data-refund-deadline-helper]');
  if (!preview) return;
  const label = refundDeadlineLabel(form.elements.registration_end?.value, form.elements.refund_deadline_days?.value);
  preview.value = label || '请先填写有效的报名截止日期和提前天数';
  if (helper) helper.textContent = label ? `系统自动计算：用户可在 ${label} 前（含该时刻）提交退费申请。` : '填写后系统将自动计算最终截止时刻。';
}

function eventStatusMeta(status) {
  return {
    upcoming: { label: '未开始', className: 'badge-upcoming' },
    ongoing: { label: '进行中', className: 'badge-ongoing' },
    ended: { label: '已结束', className: 'badge-ended' },
  }[status] || { label: '未知', className: 'badge-ended' };
}

function reviewStatusMeta(status) {
  return {
    pending: { label: '待审核', className: 'badge-pending' },
    approved: { label: '已通过', className: 'badge-approved' },
    rejected: { label: '已驳回', className: 'badge-rejected' },
  }[status] || { label: status, className: 'badge-ended' };
}

function refundStatusMeta(status) {
  return {
    none: { label: '未申请', className: 'badge-ended' },
    requested: { label: '退费待处理', className: 'badge-pending' },
    approved: { label: '退费已同意', className: 'badge-approved' },
    rejected: { label: '退费已拒绝', className: 'badge-rejected' },
  }[status || 'none'] || { label: status, className: 'badge-ended' };
}

function registrationStatusMeta(registration) {
  return registration.cancelled_at ? { label: '已取消', className: 'badge-ended' } : reviewStatusMeta(registration.status);
}

function badge(meta) { return `<span class="badge ${meta.className}">${escapeHtml(meta.label)}</span>`; }

async function apiFetch(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  if (state.csrfToken && !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase())) headers['X-CSRF-Token'] = state.csrfToken;
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || '请求失败，请稍后重试');
    error.status = response.status; error.fields = payload.fields;
    if (response.status === 401 && !path.startsWith('/api/auth/')) { state.user = null; state.csrfToken = null; renderHeader(); }
    throw error;
  }
  return payload;
}

function toastDuration(message, type) {
  const text = String(message ?? '');
  if (text.includes(CANCELLED_REGISTRATION_REAPPLY_MESSAGE)) return 180_000;
  if (text.includes(DUPLICATE_REGISTRATION_MESSAGE)) return 10_000;
  return type === 'error' ? 5200 : 4200;
}

function toast(message, type = 'success', duration) {
  const displayDuration = Number.isFinite(Number(duration)) ? Number(duration) : toastDuration(message, type);
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span>${escapeHtml(message)}</span><button type="button" aria-label="关闭通知">${icon('close', 18)}</button>`;
  node.querySelector('button').addEventListener('click', () => node.remove());
  toastRegion.append(node);
  setTimeout(() => node.remove(), displayDuration);
}

async function prepareBlobVideo(video) {
  if (video.dataset.blobReady === 'true' || video.dataset.blobLoading === 'true') return video.dataset.blobReady === 'true';
  const sourceUrl = video.dataset.videoSrc;
  if (!sourceUrl) return false;
  video.dataset.blobLoading = 'true';
  try {
    const response = await fetch(sourceUrl, { credentials: 'same-origin', cache: 'force-cache' });
    if (!response.ok) throw new Error('视频资源加载失败');
    const blobUrl = URL.createObjectURL(await response.blob());
    video.src = blobUrl;
    video.dataset.blobReady = 'true';
    video.dataset.blobUrl = blobUrl;
    video.load();
    return true;
  } catch (error) {
    toast('视频加载失败，请稍后重试', 'error');
    return false;
  } finally {
    delete video.dataset.blobLoading;
  }
}

function isAppleMobileBrowser() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function prepareNativeVideo(video) {
  if (video.dataset.nativeReady === 'true') return true;
  const sourceUrl = video.dataset.videoSrc;
  if (!sourceUrl) return false;
  video.src = sourceUrl;
  video.dataset.nativeReady = 'true';
  video.load();
  return true;
}

async function startProtectedVideo(video) {
  if (video.dataset.blobReady === 'true' || video.dataset.nativeReady === 'true') return;
  // iOS Safari may reject play() once an asynchronous Blob fetch has completed,
  // because it is no longer considered a user-initiated action. Keep its first
  // tap in the native media pipeline so the standard controls remain reliable.
  if (isAppleMobileBrowser()) {
    if (prepareNativeVideo(video)) video.play().catch(() => {});
    return;
  }
  if (await prepareBlobVideo(video)) video.play().catch(() => {});
}

function setLoading(button, loading, label = '处理中…') {
  if (!button) return;
  if (loading) { button.dataset.label = button.innerHTML; button.disabled = true; button.innerHTML = `<span class="spinner spinner-small"></span>${label}`; }
  else { button.disabled = false; if (button.dataset.label) button.innerHTML = button.dataset.label; }
}

function clearErrors(form) {
  $$('.field-error', form).forEach((node) => { node.textContent = ''; });
  $$('.invalid', form).forEach((node) => node.classList.remove('invalid'));
}

function showErrors(form, fields = {}) {
  const first = Object.entries(fields)[0];
  for (const [name, message] of Object.entries(fields)) {
    const input = form.elements[name];
    const visualInput = form.querySelector(`[data-markdown-name="${CSS.escape(name)}"]`);
    if (visualInput) visualInput.classList.add('invalid');
    else if (input?.classList) input.classList.add('invalid');
    const error = form.querySelector(`[data-error="${CSS.escape(name)}"]`);
    if (error) error.textContent = message;
  }
  if (first) (form.querySelector(`[data-markdown-name="${CSS.escape(first[0])}"]`) || form.elements[first[0]])?.focus();
}

function formObject(form) { return Object.fromEntries(new FormData(form).entries()); }

function field(name, label, value = '', options = {}) {
  const type = options.type || 'text';
  const requiredMark = options.required ? '<span class="required" aria-hidden="true">*</span>' : '';
  const attrs = [options.required ? 'required' : '', options.autocomplete ? `autocomplete="${options.autocomplete}"` : '', options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : '', options.inputmode ? `inputmode="${options.inputmode}"` : '', options.minlength ? `minlength="${options.minlength}"` : '', options.maxlength ? `maxlength="${options.maxlength}"` : '', options.min !== undefined ? `min="${escapeHtml(options.min)}"` : '', options.max !== undefined ? `max="${escapeHtml(options.max)}"` : '', options.step !== undefined ? `step="${escapeHtml(options.step)}"` : '', options.readonly ? 'readonly aria-readonly="true"' : '', options.pattern ? `pattern="${escapeHtml(options.pattern)}"` : ''].filter(Boolean).join(' ');
  let control;
  if (type === 'textarea') control = `<textarea class="form-control" id="${name}" name="${name}" ${attrs}>${escapeHtml(value)}</textarea>`;
  else if (type === 'select') control = `<select class="form-control" id="${name}" name="${name}" ${attrs}>${(options.choices || []).map(([key, text]) => `<option value="${escapeHtml(key)}" ${String(value) === String(key) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select>`;
  else control = `<input class="form-control" id="${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${attrs}>`;
  return `<div class="form-field ${options.full ? 'full' : ''}"><label for="${name}">${escapeHtml(label)}${requiredMark}</label>${control}${options.helper ? `<p class="helper">${escapeHtml(options.helper)}</p>` : ''}<p class="field-error" data-error="${name}" role="alert"></p></div>`;
}

function eventActivitySettings(event = {}) {
  const option = (name, title, description, checked) => `<label class="event-toggle-card"><input type="checkbox" name="${name}" value="1" ${checked?'checked':''}><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span></label>`;
  return `<div class="form-field full"><span class="field-label">前台附加报名入口</span><div class="event-toggle-grid">${option('allow_volunteer','允许志愿者报名','启用后，前台显示志愿者报名入口，并允许用户向本赛事提交申请。',event.allow_volunteer)}${option('allow_spectator','允许观赛报名','启用后，前台显示观赛报名入口，并允许用户向本赛事提交申请。',event.allow_spectator)}</div><p class="helper">未勾选的报名类型会从前台隐藏，直链和接口也无法提交。</p></div>`;
}

function markdownField(name, label, value = '', isRequired = true) {
  const requiredMark = isRequired ? '<span class="required" aria-hidden="true">*</span>' : '';
  const content = String(value || '');
  const tools = [
    ['h1', '一级标题', '<span class="markdown-heading-icon" aria-hidden="true">H1</span>'],
    ['h2', '二级标题', '<span class="markdown-heading-icon" aria-hidden="true">H2</span>'],
    ['bold', '加粗', icon('bold', 18), 'Control+B'],
    ['italic', '斜体', icon('italic', 18), 'Control+I'],
    ['ul', '无序列表', icon('list', 18)],
    ['ol', '有序列表', icon('orderedList', 18)],
    ['quote', '引用', icon('quote', 18)],
    ['link', '插入链接', icon('link', 18)],
    ['image', '插入图片', icon('image', 18)],
    ['table', '插入表格', icon('table', 18)],
    ['code', '代码块', icon('code', 18)],
  ];
  const toggleFormats = new Set(['h1', 'h2', 'bold', 'italic', 'ul', 'ol', 'quote']);
  const toolbar = tools.map(([format, toolLabel, toolIcon, shortcut]) => `<button class="markdown-tool" type="button" data-action="markdown-format" data-format="${format}" aria-label="${toolLabel}" title="${toolLabel}" ${toggleFormats.has(format) ? 'aria-pressed="false"' : ''} ${shortcut ? `aria-keyshortcuts="${shortcut}"` : ''}>${toolIcon}</button>`).join('');
  const visualContent = content.trim() ? renderMarkdown(content) : '';
  return `<div class="form-field full markdown-editor"><span class="field-label" id="${name}-label">${escapeHtml(label)}${requiredMark}</span><div class="markdown-compose"><div class="markdown-toolbar" role="toolbar" aria-label="通知格式工具栏">${toolbar}</div><input class="sr-only markdown-image-input" id="${name}-image-file" type="file" accept="image/jpeg,image/png,image/webp" data-markdown-image-input data-kind="notice_image" aria-label="选择通知正文图片"><div class="markdown-body markdown-visual-editor" id="${name}-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="${name}-label" aria-required="${String(isRequired)}" spellcheck="true" data-markdown-visual data-markdown-name="${name}" data-required="${String(isRequired)}" data-placeholder="直接输入办赛通知内容……">${visualContent}</div><textarea id="${name}" name="${name}" maxlength="50000" data-markdown-source hidden>${escapeHtml(content)}</textarea></div><p class="helper">直接在排版内容上编辑；选中文字后可设置标题、加粗、列表、引用、链接、图片、表格或代码块；也可以直接粘贴截图或付款码图片。</p><p class="field-error" data-error="${name}" role="alert"></p></div>`;
}

function editorInlineMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return String(node.nodeValue || '').replace(/\u00a0/g, ' ').replace(/\u200b/g, '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = node.tagName.toLowerCase();
  const content = [...node.childNodes].map(editorInlineMarkdown).join('');
  if (tag === 'br') return '\n';
  if (tag === 'strong' || tag === 'b') return content ? `**${content}**` : '';
  if (tag === 'em' || tag === 'i') return content ? `*${content}*` : '';
  if (tag === 'del' || tag === 's' || tag === 'strike') return content ? `~~${content}~~` : '';
  if (tag === 'a') {
    const href = safeMarkdownHref(node.getAttribute('href'));
    return href ? `[${content || href}](${href})` : content;
  }
  if (tag === 'img') {
    const src = safeMarkdownImageSrc(node.getAttribute('src'));
    const alt = String(node.getAttribute('alt') || '通知图片').replace(/[\[\]\r\n]/g, ' ').trim().slice(0, 80) || '通知图片';
    return src ? `![${alt}](${src})` : '';
  }
  if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') return content ? `\`${content}\`` : '';
  return content;
}

function editorListMarkdown(list, depth = 0) {
  const ordered = list.tagName.toLowerCase() === 'ol';
  const items = [...list.children].filter((child) => child.tagName?.toLowerCase() === 'li');
  return items.map((item, index) => {
    const inline = [...item.childNodes].filter((child) => !['ul', 'ol'].includes(child.tagName?.toLowerCase())).map(editorInlineMarkdown).join('').trim();
    const prefix = ordered ? `${index + 1}. ` : '- ';
    const nested = [...item.children].filter((child) => ['ul', 'ol'].includes(child.tagName.toLowerCase())).map((child) => `\n${editorListMarkdown(child, depth + 1)}`).join('');
    return `${'  '.repeat(depth)}${prefix}${inline}${nested}`;
  }).join('\n');
}

function editorBlockMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = editorInlineMarkdown(node).trim();
    return value ? `${value}\n\n` : '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = node.tagName.toLowerCase();
  const inline = () => [...node.childNodes].map(editorInlineMarkdown).join('').trim();
  if (/^h[1-4]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${inline()}\n\n`;
  if (tag === 'p') return inline() ? `${inline()}\n\n` : '';
  if (tag === 'img') return editorInlineMarkdown(node) ? `${editorInlineMarkdown(node)}\n\n` : '';
  if (tag === 'ul' || tag === 'ol') return `${editorListMarkdown(node)}\n\n`;
  if (tag === 'blockquote') {
    const content = [...node.childNodes].map(editorBlockMarkdown).join('').trim() || inline();
    return content ? `${content.split('\n').map((line) => `> ${line}`).join('\n')}\n\n` : '';
  }
  if (tag === 'pre') return `\`\`\`\n${String(node.textContent || '').trim()}\n\`\`\`\n\n`;
  if (tag === 'hr') return '---\n\n';
  if (tag === 'table') {
    const rows = [...node.rows].map((row) => [...row.cells].map((cell) => [...cell.childNodes].map(editorInlineMarkdown).join('').trim().replace(/\|/g, '\\|')));
    if (!rows.length) return '';
    const width = Math.max(...rows.map((row) => row.length), 1);
    const rowText = (row) => `| ${Array.from({ length: width }, (_, index) => row[index] || '').join(' | ')} |`;
    return `${rowText(rows[0])}\n${rowText(Array(width).fill('---'))}\n${rows.slice(1).map(rowText).join('\n')}\n\n`;
  }
  if (tag === 'div') {
    const hasBlock = [...node.children].some((child) => /^(h[1-4]|p|div|ul|ol|blockquote|pre|table|hr)$/i.test(child.tagName));
    return hasBlock ? [...node.childNodes].map(editorBlockMarkdown).join('') : (inline() ? `${inline()}\n\n` : '');
  }
  return inline() ? `${inline()}\n\n` : '';
}

function visualEditorToMarkdown(editor) {
  return [...editor.childNodes].map(editorBlockMarkdown).join('').replace(/\n{3,}/g, '\n\n').trim();
}

function syncVisualMarkdown(editor) {
  const source = editor.closest('.markdown-editor')?.querySelector('[data-markdown-source]');
  if (source) source.value = visualEditorToMarkdown(editor);
  updateVisualToolbar(editor);
  return source?.value || '';
}

function ensureVisualSelection(editor) {
  const selection = window.getSelection();
  if (selection?.rangeCount && editor.contains(selection.anchorNode)) return selection;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

function rememberVisualSelection(editor) {
  const selection = ensureVisualSelection(editor);
  if (!selection?.rangeCount) return;
  state.markdownSelection = { editor, range: selection.getRangeAt(0).cloneRange() };
}

function restoreVisualSelection(editor) {
  const selection = window.getSelection();
  const saved = state.markdownSelection;
  if (saved?.editor === editor) {
    try {
      selection.removeAllRanges();
      selection.addRange(saved.range);
      return selection;
    } catch {}
  }
  return ensureVisualSelection(editor);
}

function updateVisualToolbar(editor) {
  const toolbar = editor?.closest('.markdown-compose')?.querySelector('.markdown-toolbar');
  if (!toolbar) return;
  const selection = window.getSelection();
  const anchor = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection?.anchorNode?.parentElement;
  const block = anchor?.closest?.('h1,h2,blockquote');
  const active = {
    h1: block?.tagName === 'H1',
    h2: block?.tagName === 'H2',
    quote: block?.tagName === 'BLOCKQUOTE',
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    ul: document.queryCommandState('insertUnorderedList'),
    ol: document.queryCommandState('insertOrderedList'),
  };
  $$('[aria-pressed]', toolbar).forEach((button) => button.setAttribute('aria-pressed', String(Boolean(active[button.dataset.format]))));
}

function insertVisualHtml(editor, html) {
  restoreVisualSelection(editor);
  document.execCommand('insertHTML', false, html);
  syncVisualMarkdown(editor);
}

function applyMarkdownFormat(button) {
  const editor = button.closest('.markdown-editor')?.querySelector('[data-markdown-visual]');
  if (!editor) return;
  ensureVisualSelection(editor);
  editor.focus();
  const format = button.dataset.format;
  if (format === 'bold' || format === 'italic') document.execCommand(format, false);
  else if (format === 'ul') document.execCommand('insertUnorderedList', false);
  else if (format === 'ol') document.execCommand('insertOrderedList', false);
  else if (format === 'h1' || format === 'h2' || format === 'quote') {
    const selection = window.getSelection();
    const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode?.parentElement;
    const current = anchor?.closest?.('h1,h2,blockquote');
    const tag = format === 'quote' ? 'blockquote' : format;
    document.execCommand('formatBlock', false, current?.tagName.toLowerCase() === tag ? 'p' : tag);
  }
  if (format === 'link') {
    const requested = window.prompt('请输入链接地址', 'https://');
    if (requested === null) return;
    const href = safeMarkdownHref(requested);
    if (!href) { toast('请输入有效的 http、https 或站内链接', 'error'); return; }
    const selection = window.getSelection();
    if (selection.isCollapsed) insertVisualHtml(editor, `<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>`);
    else document.execCommand('createLink', false, href);
  }
  if (format === 'image') {
    rememberVisualSelection(editor);
    const input = button.closest('.markdown-editor')?.querySelector('[data-markdown-image-input]');
    if (input) {
      input.dataset.useSavedSelection = 'true';
      input.click();
    }
    return;
  }
  if (format === 'table') insertVisualHtml(editor, '<table><thead><tr><th>项目</th><th>内容</th></tr></thead><tbody><tr><td>示例</td><td>请填写</td></tr></tbody></table><p><br></p>');
  if (format === 'code') insertVisualHtml(editor, '<pre><code>在这里输入代码</code></pre><p><br></p>');
  syncVisualMarkdown(editor);
}

function uploadPreviewHtml(value = '', kind = 'image') {
  const url = safeUrl(value);
  if (!url) return `${icon('upload', 34)}<span>尚未上传</span>`;
  if (kind === 'notice') return `<a class="pdf-preview" href="${url}" target="_blank" rel="noopener noreferrer">${icon('file', 32)}<span><strong>已上传办赛通知 PDF</strong><small>点击打开当前文件</small></span></a>`;
  return `<img src="${url}" alt="已上传文件预览">`;
}

function filePicker(name, label, value = '', kind = 'image', isRequired = true) {
  const isNotice = kind === 'notice';
  const inputId = `${name}-file`;
  const accept = isNotice ? 'application/pdf' : 'image/jpeg,image/png,image/webp';
  const input = `<input class="upload-input ${isNotice ? 'sr-only' : ''}" id="${inputId}" type="file" data-target="${name}" data-kind="${kind}" data-max-mb="${isNotice ? 20 : 4}" accept="${accept}" aria-describedby="${name}-upload-help">`;
  const controls = isNotice
    ? `<div class="upload-actions">${input}<label class="button button-secondary" for="${inputId}">${icon('upload',17)}${value ? '重新上传 PDF' : '选择 PDF 文件'}</label><button class="button button-danger-ghost" type="button" data-action="clear-upload" data-target="${name}" data-kind="${kind}" ${value ? '' : 'hidden'}>${icon('trash',17)}移除 PDF</button></div>`
    : input;
  return `<div class="form-field full"><label class="field-label" for="${inputId}">${escapeHtml(label)}${isRequired ? '<span class="required" aria-hidden="true">*</span>' : ''}</label><div class="file-picker ${isNotice ? 'notice-file-picker' : ''}"><div class="file-preview" data-preview="${name}">${uploadPreviewHtml(value, kind)}</div><div class="file-picker-controls"><input type="hidden" name="${name}" value="${escapeHtml(value)}" ${isRequired ? 'required' : ''}>${controls}<p class="helper" id="${name}-upload-help">${isNotice ? '仅支持 PDF，文件不超过 20MB。重新上传后，保存赛事即可替换当前文件。' : '支持 JPG、PNG、WebP，文件不超过 4MB。'}</p><p class="field-error" data-error="${name}" role="alert"></p></div></div></div>`;
}

function openModal(title, content, footer = '', size = '') {
  state.lastFocus = document.activeElement;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><h2 id="modal-title">${escapeHtml(title)}</h2><button class="icon-button" type="button" data-action="close-modal" aria-label="关闭对话框">${icon('close')}</button></header><div class="modal-body">${content}</div>${footer ? `<footer class="modal-footer">${footer}</footer>` : ''}</section></div>`;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => $('.modal [autofocus], .modal button, .modal input, .modal select', modalRoot)?.focus());
}

function closeModal() {
  const resolve=state.confirmResolver;state.confirmResolver=null;
  modalRoot.innerHTML = ''; document.body.classList.remove('modal-open'); state.lastFocus?.focus?.();resolve?.(false);
}

function confirmAction(title, message, confirmLabel = '确认删除') {
  return new Promise((resolve) => {
    openModal(title, `<p>${escapeHtml(message)}</p><div class="danger-banner info-banner">${icon('alert')}<div>此操作可能无法撤销，请确认目标无误。</div></div>`, `<button class="button button-secondary" type="button" data-action="confirm-cancel">取消</button><button class="button button-danger" type="button" data-action="confirm-ok">${escapeHtml(confirmLabel)}</button>`, 'small');
    state.confirmResolver = resolve;
  });
}

function teamDeletionStatusMeta(registration) {
  const original = reviewStatusMeta(registration.status);
  if (registration.cancelled_at) return { label: `已取消（原${original.label}）`, className: 'badge-ended' };
  if (registration.status === 'pending') return original;
  if (registration.status === 'rejected') return { ...original, label: '审核驳回' };
  return { ...original, label: `审核${original.label}` };
}

function confirmTeamCascadeDelete(registrations = []) {
  return new Promise((resolve) => {
    const rows = registrations.map((registration) => `<li><strong>${escapeHtml(registration.event_title || '未命名赛事')}</strong>${badge(teamDeletionStatusMeta(registration))}</li>`).join('');
    const content = `<div class="danger-banner info-banner">${icon('alert')}<div><strong>检测到该战队正在参与下列赛项：</strong></div></div><ul class="team-delete-impact-list">${rows}</ul><p class="team-delete-final-warning">删除战队将导致该战队信息全部丢失，同时自动取消并删除上述所有赛事报名。确认删除战队吗？</p>`;
    const footer = `<button class="button button-danger" type="button" data-action="confirm-ok" data-delayed-confirm disabled>确认删除战队</button><button class="button button-secondary" type="button" data-action="confirm-cancel" autofocus>取消</button>`;
    openModal('战队仍有关联赛事报名', content, footer, 'small');
    state.confirmResolver = resolve;
    const confirmButton = $('[data-delayed-confirm]', modalRoot);
    window.setTimeout(() => { if (confirmButton?.isConnected) confirmButton.disabled = false; }, 1200);
  });
}

function confirmTeamNumber(number) {
  return new Promise((resolve) => {
    openModal('确认战队编号', `<div class="info-banner">${icon('info')}<div>请确定你的战队编号：<strong class="team-number-confirm-value">${escapeHtml(number)}</strong> 无误</div></div><p class="helper gap-top-sm">提交后仍可在战队管理中编辑；修改战队资料会使相关报名重新进入审核。</p>`, `<button class="button button-secondary" type="button" data-action="confirm-cancel">返回修改</button><button class="button button-primary" type="button" data-action="confirm-ok">确认提交</button>`, 'small');
    state.confirmResolver = resolve;
  });
}

function teamNumberConflictModal() {
  openModal('战队编号已被占用', `<div class="danger-banner info-banner">${icon('alert')}<div><strong>该战队编号已被其他队伍注册（已被占用）</strong></div></div><p class="gap-top">如果您输入的确实是 RECF 官方分配给您的战队编号，但系统提示已被占用，请联系组委会协助核实处理：</p><address class="committee-contact conflict-contact"><span><strong>组委会邮箱</strong><a href="mailto:654849662@qq.com">654849662@qq.com</a></span><span><strong>咨询电话</strong><a href="tel:13761393714">13761393714（小周老师）</a></span></address>`, `<button class="button button-primary" type="button" data-action="close-modal">我知道了</button>`, 'small');
}

function setActivityAvailability(events = []) {
  state.events = events;
  state.activityAvailability = {
    volunteer: events.some((event) => event.allow_volunteer),
    spectator: events.some((event) => event.allow_spectator),
  };
  $$('[data-activity-link]').forEach((link) => {
    link.hidden = !state.activityAvailability[link.dataset.activityLink];
  });
}

async function refreshActivityAvailability() {
  try {
    const { events } = await apiFetch('/api/events');
    setActivityAvailability(events);
  } catch {
    setActivityAvailability([]);
  }
}

function renderHeader() {
  const { path } = routeInfo();
  const user = state.user;
  const active = (prefix) => path.startsWith(prefix) ? 'active' : '';
  const homeActive = path === '/home' || path === '/';
  const available = state.activityAvailability;
  const activityActive = path.startsWith('/events') || (available.volunteer && path.startsWith('/volunteer')) || (available.spectator && path.startsWith('/spectator'));
  const desktopActivityLinks = `<a class="${active('/events')}" role="menuitem" href="#/events"${path.startsWith('/events') ? ' aria-current="page"' : ''}>赛事报名</a>${available.volunteer?`<a class="${active('/volunteer')}" role="menuitem" href="#/volunteer"${path.startsWith('/volunteer') ? ' aria-current="page"' : ''}>志愿者报名</a>`:''}${available.spectator?`<a class="${active('/spectator')}" role="menuitem" href="#/spectator"${path.startsWith('/spectator') ? ' aria-current="page"' : ''}>观赛报名</a>`:''}`;
  const mobileActivityLinks = `<a class="${active('/events')}" href="#/events"${path.startsWith('/events') ? ' aria-current="page"' : ''}>${icon('calendar')}赛事报名</a>${available.volunteer?`<a class="${active('/volunteer')}" href="#/volunteer"${path.startsWith('/volunteer') ? ' aria-current="page"' : ''}>${icon('users')}志愿者报名</a>`:''}${available.spectator?`<a class="${active('/spectator')}" href="#/spectator"${path.startsWith('/spectator') ? ' aria-current="page"' : ''}>${icon('eye')}观赛报名</a>`:''}`;
  const accountLinks = user ? `
    <a href="#/account/profile" class="${active('/account/profile')}">${icon('user')}个人中心</a>
    <a href="#/account/teams" class="${active('/account/teams')}">${icon('users')}战队管理</a>
    <a href="#/account/registrations" class="${active('/account/registrations')}">${icon('trophy')}我的比赛</a>
    ${user.role === 'admin' ? `<a href="#/admin" class="${active('/admin')}">${icon('dashboard')}管理后台</a>` : ''}` : '';
  header.innerHTML = `<div class="container header-inner">
        <a class="site-brand" href="#/home" aria-label="上海瑞卜德教育与 RECF 联合赛事报名首页"><span class="site-brand-logos" aria-hidden="true"><img class="site-brand-primary-logo" src="/assets/ruibude-logo.jpg" alt="" width="50" height="50"><span class="brand-logo-divider"></span><img class="site-brand-partner-logo" src="/assets/recf-header-logo.png" alt="" width="60" height="50"></span><span class="site-brand-name">上海瑞卜德教育</span></a>
    <nav class="desktop-nav" aria-label="主导航"><a class="${homeActive ? 'active' : ''}" href="#/home"${homeActive ? ' aria-current="page"' : ''}>首页</a><div class="nav-menu activity-menu"><button class="nav-menu-button ${activityActive ? 'active' : ''}" type="button" data-action="toggle-activity-menu" aria-haspopup="true" aria-expanded="false" aria-controls="activity-registration-menu">活动报名${icon('chevron', 14)}</button><div class="nav-dropdown" id="activity-registration-menu" role="menu" aria-label="活动报名">${desktopActivityLinks}</div></div><a class="${active('/team-number')}" href="#/team-number"${path.startsWith('/team-number') ? ' aria-current="page"' : ''}>如何注册队号</a><a class="${active('/rules')}" href="#/rules"${path.startsWith('/rules') ? ' aria-current="page"' : ''}>赛事规则</a><a class="${active('/about')}" href="#/about"${path.startsWith('/about') ? ' aria-current="page"' : ''}>关于我们</a>${user?.role === 'admin' ? `<a class="${active('/admin')}" href="#/admin">${icon('dashboard')}管理后台</a>` : ''}</nav>
    <div class="header-actions">${user ? `<div class="user-menu"><button class="user-menu-button" type="button" data-action="toggle-user-menu" aria-expanded="false"><span class="user-avatar">${user.avatar_url ? `<img src="${safeUrl(user.avatar_url)}" alt="">` : escapeHtml((user.nickname || user.email)[0].toUpperCase())}</span><span>${escapeHtml(user.nickname || '我的账户')}</span>${icon('chevron', 16)}</button><div class="user-dropdown"><div class="dropdown-account"><strong>${escapeHtml(user.nickname || '报名用户')}</strong><small>${escapeHtml(user.email)}</small></div>${accountLinks}<button class="logout" type="button" data-action="logout">${icon('logout')}退出登录</button></div></div>` : `<a href="#/login">登录</a><a class="button button-primary" href="#/register">注册</a>`}<button class="mobile-toggle" type="button" data-action="toggle-mobile-menu" aria-expanded="false" aria-label="打开导航菜单">${icon('menu')}</button></div>
  </div><nav class="mobile-drawer" aria-label="移动端导航"><a class="${homeActive ? 'active' : ''}" href="#/home"${homeActive ? ' aria-current="page"' : ''}>${icon('home')}首页</a><div class="mobile-nav-group"><strong class="mobile-nav-title">活动报名</strong>${mobileActivityLinks}</div><a class="${active('/team-number')}" href="#/team-number"${path.startsWith('/team-number') ? ' aria-current="page"' : ''}>${icon('flag')}如何注册队号</a><a class="${active('/rules')}" href="#/rules"${path.startsWith('/rules') ? ' aria-current="page"' : ''}>${icon('file')}赛事规则</a><a class="${active('/about')}" href="#/about"${path.startsWith('/about') ? ' aria-current="page"' : ''}>${icon('info')}关于我们</a>${accountLinks}${user ? `<button class="logout" type="button" data-action="logout">${icon('logout')}退出登录</button>` : `<a href="#/login">${icon('user')}登录</a><a href="#/register">${icon('mail')}注册</a>`}</nav>`;
}

function loadingPage() { app.innerHTML = '<div class="loading-page"><div><div class="spinner" aria-hidden="true"></div><span class="muted">正在加载…</span></div></div>'; }

function stopHomeCarousel() {
  if (!state.homeCarouselTimer) return;
  clearInterval(state.homeCarouselTimer);
  state.homeCarouselTimer = null;
}

function setHomeSlide(index) {
  const root = $('.home-hero', app);
  if (!root) return;
  const slides = $$('.home-hero-slide', root);
  const dots = $$('[data-action="home-slide"]', root);
  if (!slides.length) return;
  const active = ((Number(index) || 0) % slides.length + slides.length) % slides.length;
  root.dataset.activeSlide = String(active);
  slides.forEach((slide, slideIndex) => {
    const selected = slideIndex === active;
    slide.classList.toggle('is-active', selected);
    slide.setAttribute('aria-hidden', String(!selected));
    const link = $('a', slide);
    if (link) link.tabIndex = selected ? 0 : -1;
  });
  dots.forEach((dot, dotIndex) => {
    const selected = dotIndex === active;
    dot.classList.toggle('active', selected);
    dot.setAttribute('aria-current', selected ? 'true' : 'false');
  });
  root.classList.toggle('is-logo-slide-active', slides[active].classList.contains('is-logo-only'));
}

function startHomeCarousel() {
  stopHomeCarousel();
  const root = $('.home-hero', app);
  if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  state.homeCarouselTimer = setInterval(() => {
    setHomeSlide(Number(root.dataset.activeSlide || 0) + 1);
  }, 5000);
}

function homePage() {
  const droneVideoUrl = '/assets/home/drone-competition.mp4';
  const announcementVideoUrl = '/assets/home/recf-tarek-shraibati-congratulations.mp4';
  const announcementVideoPoster = '/assets/home/recf-tarek-shraibati-congratulations-poster.jpg';
  const announcementVideoTitle = '美国RECF国际副总裁Tarek Shraibati致贺词：正式确认上海瑞卜德教育科技有限公司为中国官方国际代表';
  const recfPartnerUrl = 'https://recf.org/about-us/our-partners/';
  const robotVexBannerUrl = 'http://robotvex.com/';
  const robotVexUrl = 'http://www.robotvex.com/';
  const codingUrl = 'https://coding.qq.com/home/';
  const externalLinkAttrs = (href) => `href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"`;
  const heroLinkAttrs = (slide) => slide.scrollTarget
    ? `href="#${escapeHtml(slide.scrollTarget)}" data-action="scroll-home-programs" data-target="${escapeHtml(slide.scrollTarget)}"`
    : externalLinkAttrs(slide.href);
  const heroSlides = [
    { file: 'hero-recf.png', alt: 'RECF 赛事品牌展示', href: recfPartnerUrl },
    { file: 'hero-vex.jpg', alt: '机器人竞赛现场展示', scrollTarget: 'home-programs' },
    { src: '/assets/ruibude-logo.jpg', alt: '上海瑞卜德教育商标', href: robotVexBannerUrl, logoOnly: true },
    { file: 'hero-robots-1.jpg', alt: '无人机竞赛视频展示', href: droneVideoUrl },
    { file: 'hero-robots-2.jpg', alt: '无人机竞赛视频展示', href: droneVideoUrl },
  ];
  const programLogos = [
    ['program-engage.png', 'RECF Engage Robotics Competition'],
    ['program-achieve.png', 'RECF Achieve Robotics Competition'],
    ['program-inspire.png', 'RECF Inspire Robotics Competition'],
  ];
  const platformLogos = [
    ['program-vex-iq.png', 'Aerial Drone Competition'],
    ['program-vex-v5.png', 'Aerial Drone Competition PRO'],
  ];
  const partnerCards = [
    { src: '/assets/recf-header-logo.png', alt: 'RECF 合作伙伴展示', href: recfPartnerUrl },
    { src: '/assets/home/partner-coding-logo.png', alt: '腾讯扣叮合作伙伴展示', href: codingUrl },
    { src: '/assets/ruibude-logo.jpg', alt: '上海瑞卜德合作伙伴展示', href: robotVexUrl },
  ];
  app.innerHTML = `<section class="home-page" aria-label="上海瑞卜德教育首页">
    <div class="home-hero" aria-label="首页轮播图">
      <div class="home-hero-slides">${heroSlides.map((slide, index) => `<figure class="home-hero-slide ${index === 0 ? 'is-active' : ''}${slide.logoOnly ? ' is-logo-only' : ''}" aria-hidden="${index === 0 ? 'false' : 'true'}"><a class="home-hero-link" ${heroLinkAttrs(slide)} aria-label="${escapeHtml(slide.alt)}"><img src="${escapeHtml(slide.src || `/assets/home/${slide.file}`)}" alt="${escapeHtml(slide.alt)}" width="1920" height="720"${index === 0 ? ' loading="eager"' : ' loading="lazy"'}></a></figure>`).join('')}</div>
      <div class="home-hero-dots" aria-label="首页轮播图切换">${heroSlides.map((_, index) => `<button class="${index === 0 ? 'active' : ''}" type="button" data-action="home-slide" data-slide-index="${index}" aria-label="显示第 ${index + 1} 张首页轮播图" aria-current="${index === 0 ? 'true' : 'false'}"></button>`).join('')}</div>
    </div>
    <div class="home-block home-featured-video-block">
      <div class="container">
        <article class="home-blue-panel home-featured-video" aria-labelledby="home-announcement-video-title">
          <header class="home-featured-video-head">
            <span>官方视频</span>
            <h2 id="home-announcement-video-title">${escapeHtml(announcementVideoTitle)}</h2>
          </header>
          <div class="home-featured-video-frame">
            <video controls controlslist="nodownload" disablepictureinpicture playsinline preload="none" poster="${announcementVideoPoster}" aria-label="${escapeHtml(announcementVideoTitle)}" data-protected-media data-video-src="${announcementVideoUrl}" width="1280" height="720">
              您的浏览器暂不支持视频播放。
            </video>
          </div>
        </article>
      </div>
    </div>
    <div class="home-block home-intro-block">
      <div class="container">
        <div class="home-blue-panel home-intro-panel">
          <div class="home-intro-copy">
            <h1>准备好开启你的机器人竞技之旅了吗？</h1>
            <p>美国机器人教育与竞赛基金会（RECF）携手上海瑞卜德教育科技，面向小学至大学全学龄段倾力打造国际化机器人项目，在中国已累计赋能数十万名学子。项目精准对接科技前沿与未来产业人才需求，通过实践性极强的跨学科竞技，深度激发青少年在科学、技术、工程和数学（STEM）领域的潜能、创新志向与终身学习热情。</p>
            <a class="home-apply-button" href="#/events">立刻开始报名</a>
          </div>
        </div>
      </div>
    </div>
    <div class="home-block">
      <div class="container">
        <div class="home-blue-panel home-program-panel" id="home-programs">
          <h2>竞赛类目</h2>
          <div class="home-program-logos">${programLogos.map(([file, alt]) => `<a href="#/rules" aria-label="查看 ${escapeHtml(alt)} 规则"><img src="/assets/home/${file}" alt="${escapeHtml(alt)}" width="272" height="88" loading="lazy"></a>`).join('')}</div>
          <div class="home-platform-logos">${platformLogos.map(([file, alt]) => `<a ${externalLinkAttrs(droneVideoUrl)} aria-label="打开 ${escapeHtml(alt)} 视频"><img src="/assets/home/${file}" alt="${escapeHtml(alt)}" width="444" height="116" loading="lazy"></a>`).join('')}</div>
        </div>
      </div>
    </div>
    <div class="home-block home-partner-block">
      <div class="container">
        <div class="home-partner-head"><h2>合作伙伴</h2></div>
        <div class="home-partner-grid">${partnerCards.map(({ src, alt, href }) => `<a ${externalLinkAttrs(href)} aria-label="访问 ${escapeHtml(alt)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="320" height="260" loading="lazy"></a>`).join('')}</div>
      </div>
    </div>
    <div class="home-link-band">
      <div class="container home-link-band-inner">
        <a class="home-link-logo-link" ${externalLinkAttrs(recfPartnerUrl)} aria-label="访问 RECF 合作伙伴页面"><img class="home-link-logo" src="/assets/home/partner-recf.png" alt="RECF" width="267" height="217"></a>
        <nav class="home-link-list" aria-label="首页快捷入口">
          <a href="#/about">关于我们</a>
          <a href="#/about">团队</a>
          <a href="#/about">合作伙伴</a>
          <a href="#/volunteer">志愿者</a>
          <a href="#/rules">资源库</a>
        </nav>
        <a class="home-link-logo-link" ${externalLinkAttrs(robotVexUrl)} aria-label="访问 Robot VEX 官网"><img class="home-link-logo home-link-logo-round" src="/assets/home/partner-robotvex.jpg" alt="Robot VEX" width="282" height="282"></a>
      </div>
    </div>
  </section>`;
  setHomeSlide(0);
  startHomeCarousel();
}

function aboutPage() {
  const programs = [
    {
      image: 'recf.png',
      title: 'RECF',
      english: `The Robotics Education & Competition Foundation (RECF) sparks interest in science, technology, engineering, and math (STEM) by engaging students in hands-on, sustainable, and affordable curriculum-based robotics programs. The RECF's global mission is to provide every educator with competition, education, and workforce readiness programs to increase student engagement in STEM and computer science. We see a future where every student designs and innovates as part of a team, overcomes failure, perseveres, and emerges confident in their ability to meet global challenges. We are pleased to announce that Shanghai Robot Education technology co.LTD has been officially designated as the representative for RECF in China.`,
      chinese: 'RECF基金会通过让学生参与实践性强、可持续且高性价比的课程化机器人项目，激发他们对科学、技术、工程和数学（STEM）的兴趣。RECF的全球使命是为每位教育者提供竞赛、教育与职业准备项目，从而提升学生在STEM和计算机科学领域的参与度。我们憧憬这样一个未来：每一位学生都能作为团队的一员去设计与创新，战胜挫折、坚韧不拔，并充满自信地迎战全球挑战。',
    },
    {
      image: 'recf-robotics.png',
      title: 'RECF Robotics',
      english: `The Robotics Education & Competition Foundation's (RECF) robotics programs for elementary school through college students include 1.1 million students in 70 countries. These engaging programs offer a direct response to workforce and industry needs, with participants more likely to consider studying science, technology, engineering, and math (STEM) beyond high school. We are pleased to announce that Shanghai Robot Education technology co.LTD has been officially designated as the representative for RECF Robotics in China.`,
      chinese: 'RECF机器人教育项目面向从小学到大学的学生，目前已覆盖全球70个国家，惠及110万名学生。这些极具吸引力的项目直接响应了劳动力市场与行业发展的需求，使得参与者在高中毕业后更有意愿选择科学、技术、工程和数学（STEM）领域继续深造。',
    },
    {
      image: 'recf-drone.png',
      title: 'RECF Drone',
      english: `The Robotics Education & Competition Foundation's (RECF) Aerial Drone Competition provides a unique hands-on learning experience, fostering crucial STEM skills including drone piloting, programming, and problem-solving. The competition environment mirrors the real world, requiring teamwork, critical thinking, and innovation to navigate mission challenges. Students learn to collaborate effectively, hone their communication skills, and build the resilience to tackle future challenges. This fosters a deep understanding of flight principles, documentation, and interpersonal skills, all while igniting a passion for drone-related careers. We are pleased to announce that Shanghai Robot Education technology co.LTD has been officially designated as the representative for RECF Aerial Drone Competition in China.`,
      chinese: 'RECF无人机竞赛提供了一种独特的实践学习体验，旨在培养至关重要的STEM技能，包括无人机驾驶、编程和问题解决能力。竞赛环境模拟真实世界，要求参赛者运用团队合作、批判性思维和创新能力来应对各项任务挑战。学生们将学习如何高效协作，磨炼沟通技巧，并培养应对未来挑战的韧性。这不仅能加深学生对飞行原理、文档记录和人际交往技能的理解，同时也能激发他们对无人机相关职业的热情。',
    },
  ];
  app.innerHTML = `<section class="about-page" aria-label="关于我们">
    <div class="about-title-band">
      <h1>上海瑞卜德教育科技有限公司<br>RECF中国地区正式官方代表！</h1>
    </div>
    <section class="about-programs" aria-label="RECF 项目介绍">
      <div class="about-program-grid">
        ${programs.map((program) => `<article class="about-program-card">
          <a class="about-program-logo" href="https://recf.org/about-us/our-partners/" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(program.title)}">
            <img src="/assets/about/${program.image}" alt="${escapeHtml(program.title)}" width="400" height="400">
          </a>
          <h2>${escapeHtml(program.title)}</h2>
          <div class="about-program-copy">
            <p>${escapeHtml(program.english)}</p>
            <p>${escapeHtml(program.chinese)}</p>
          </div>
        </article>`).join('')}
      </div>
    </section>
    <section class="about-company-band" aria-label="公司介绍">
      <div class="about-company-heading">
        <span>ABOUT US</span>
        <h2>关于我们</h2>
      </div>
    </section>
    <section class="about-company-panel" aria-label="上海瑞卜德教育科技有限公司">
      <img class="about-company-photo" src="/assets/about/company.jpg" alt="上海瑞卜德教育活动现场" width="471" height="393" loading="eager">
      <div class="about-company-copy">
        <p class="about-company-name">上海瑞卜德教育科技有限公司</p>
        <p>上海瑞卜德教育科技有限公司是一家专注于青少年机器人教育、专业为青少年提供VEX 金属机器人竞赛服务的公司，为追求青少年机器人梦想和不断超越自我而努力！</p>
      </div>
      <img class="about-quote about-quote-left" src="/assets/about/quote.png" alt="" aria-hidden="true" width="38" height="29">
      <img class="about-quote about-quote-right" src="/assets/about/quote.png" alt="" aria-hidden="true" width="38" height="29">
      <h3>上海瑞卜德教育科技有限公司RECF中国地区正式官方代表！</h3>
    </section>
  </section>`;
}

function eventCard(event) {
  const status = eventStatusMeta(event.time_status);
  return `<article class="event-card"><div class="event-cover"><img src="${safeUrl(event.image_url) || '/assets/event-shenzhen.svg'}" alt="${escapeHtml(event.title)}赛事海报" width="1200" height="675" loading="lazy">${badge(status)}</div><div class="event-body"><h2>${escapeHtml(event.title)}</h2><div class="event-meta"><div class="meta-line">${icon('calendar', 18)}<span>${formatDate(event.starts_at)} — ${formatDate(event.ends_at)}</span></div><div class="meta-line">${icon('map', 18)}<span>${escapeHtml(event.location)}</span></div></div><a class="button ${event.registration_open ? 'button-accent' : 'button-secondary'}" href="#/events/${event.id}">${event.registration_open ? '立即报名' : '查看详情'}${icon('arrow', 18)}</a></div></article>`;
}

async function eventsPage() {
  const data = await apiFetch('/api/events'); state.events = data.events;
  app.innerHTML = `<section id="events-list" class="page-section"><div class="container"><div class="page-head"><div><h1>赛事报名</h1><p class="lead">未开始的赛事优先展示，并按开赛时间排序。</p></div></div>${data.events.length ? `<div class="event-grid">${data.events.map(eventCard).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">${icon('calendar',30)}</div><h2>暂无已发布赛事</h2><p>管理员发布赛事后会显示在这里。</p></div>`}</div></section>`;
}

function rulesPage() {
  const tabs=RULE_PROGRAMS.map((program)=>`<a href="#/rules" data-action="scroll-rule" data-target="${program.id}">${escapeHtml(program.shortName)}</a>`).join('');
  const programs=RULE_PROGRAMS.map((program,index)=>`<article class="rule-program" id="${program.id}"><div class="rule-program-copy"><span class="record-label">赛项 ${index+1} / ${RULE_PROGRAMS.length}</span><h2>${escapeHtml(program.title)}</h2><p class="rule-game-name">${escapeHtml(program.game)}</p><p>${escapeHtml(program.description)}</p><ul class="rule-highlights">${program.highlights.map((item)=>`<li><span aria-hidden="true">${icon('check',18)}</span><span>${escapeHtml(item)}</span></li>`).join('')}</ul><div class="rule-actions"><a class="button button-primary" href="${program.pdf}" target="_blank" rel="noopener noreferrer">${icon('file',18)}在线查看规则</a><a class="button button-secondary" href="${program.pdf}" download>${icon('download',18)}下载 PDF</a></div><p class="rule-version">${escapeHtml(program.version)} · PDF 原文件</p></div><a class="rule-cover" href="${program.pdf}" target="_blank" rel="noopener noreferrer" aria-label="在线查看 ${escapeHtml(program.title)} 规则手册"><img src="${program.cover}" alt="${escapeHtml(program.title)} ${escapeHtml(program.version)}封面" width="850" height="1100" loading="${index===0?'eager':'lazy'}"></a></article>`).join('');
  app.innerHTML=`<section class="page-section rules-page"><div class="container"><nav class="breadcrumb"><a href="#/events">赛事报名</a>${icon('chevron',14)}<span>赛事规则</span></nav><div class="page-head rules-head"><div><h1>RECF 三大赛项规则</h1><p class="lead">查阅 RECF Engage、Achieve 与 Inspire 的赛项说明及 2026–2027 赛季中文规则手册。</p></div><a class="button button-secondary" href="https://games.recf.org/" target="_blank" rel="noopener noreferrer">访问 RECF 官方规则中心${icon('arrow',18)}</a></div><nav class="rules-tabs" aria-label="赛项规则页内导航">${tabs}</nav><div class="info-banner rules-notice">${icon('info',22)}<div><strong>规则更新提示</strong><br>本页暂按现有中文手册版本发布；如赛事通知与后续官方版本有调整，请以赛事组委会最终公告及 RECF 官方规则为准。</div></div><div class="rule-programs">${programs}</div></div></section>`;
}

const activityConfigs = {
  volunteer: {
    path: '/volunteer',
    title: '志愿者报名',
    description: '报名赛事现场服务岗位，提交个人信息、可服务时间与相关经验，审核通过后由组委会联系。',
    noun: '志愿者',
    icon: 'users',
  },
  spectator: {
    path: '/spectator',
    title: '观赛报名',
    description: '提前登记观赛人员信息与同行人数，审核通过后凭报名信息按现场安排入场。',
    noun: '观赛',
    icon: 'eye',
  },
};

function maskIdNumber(value) {
  const text = String(value || '');
  if (text.length < 7) return text.replace(/.(?=..)/g, '*');
  return `${text.slice(0, 3)}${'*'.repeat(Math.min(8, text.length - 7))}${text.slice(-4)}`;
}

function activityApplicationActions(application, config, eventOpen) {
  return `<div class="cell-actions"><button class="button button-secondary button-small" type="button" data-action="view-activity-application" data-id="${application.id}">${icon('eye',16)}查看</button>${application.status!=='approved'&&eventOpen?`<a class="button button-secondary button-small" href="#${config.path}/${application.event_id}?edit=${application.id}">${icon('edit',16)}编辑</a>`:''}${application.status!=='approved'?`<button class="button button-danger-ghost button-small" type="button" data-action="delete-activity-application" data-id="${application.id}">${icon('trash',16)}删除</button>`:''}</div>`;
}

function activityEventCard(event, config) {
  const status = eventStatusMeta(event.time_status);
  return `<article class="event-card"><div class="event-cover"><img src="${safeUrl(event.image_url) || '/assets/event-shenzhen.svg'}" alt="${escapeHtml(event.title)}赛事海报" width="1200" height="675" loading="lazy">${badge(status)}</div><div class="event-body"><h2>${escapeHtml(event.title)}</h2><div class="event-meta"><div class="meta-line">${icon('calendar',18)}<span>${formatDate(event.starts_at)} — ${formatDate(event.ends_at)}</span></div><div class="meta-line">${icon('map',18)}<span>${escapeHtml(event.location)}</span></div></div><a class="button ${event.registration_open?'button-accent':'button-secondary'}" href="#${config.path}/${event.id}">${event.registration_open?'立即报名':'查看详情'}${icon('arrow',18)}</a></div></article>`;
}

function activityApplicationForm(type, application, profile, events, selectedEventId = events[0]?.id, lockEvent = false) {
  const config = activityConfigs[type];
  const data = application || {
    event_id: selectedEventId || '',
    name: profile.contact_name || profile.nickname || '',
    gender: '男',
    id_number: profile.id_number || '',
    phone: profile.phone || '',
    email: profile.email || '',
    organization: profile.org_name || '',
    volunteer_role: '服从分配',
    attendee_count: 1,
  };
  const eventChoices = events.map((event) => [event.id, `${event.title} · ${formatDate(event.starts_at)}`]);
  const eventField = lockEvent ? '' : field('event_id','报名赛事',data.event_id,{type:'select',required:true,choices:eventChoices,helper:'仅显示当前处于报名时间内的赛事。'});
  const common = `${eventField}${field('name','姓名',data.name,{required:true,autocomplete:'name'})}${field('gender','性别',data.gender,{type:'select',required:true,choices:[['男','男'],['女','女'],['其他','其他']]})}${field('id_number','身份证号 / 证件号',data.id_number,{required:true,maxlength:40,helper:'仅用于身份核验，普通页面会脱敏显示。'})}${field('phone','联系电话',data.phone,{type:'tel',required:true,inputmode:'tel',autocomplete:'tel'})}${field('email','联系邮箱',data.email,{type:'email',required:true,autocomplete:'email'})}${field('organization','学校 / 单位',data.organization,{required:type==='volunteer',full:true})}`;
  const specific = type === 'volunteer'
    ? `${field('volunteer_role','意向岗位',data.volunteer_role,{type:'select',required:true,choices:['赛事服务','检录协助','场地协助','秩序引导','摄影宣传','服从分配'].map((value)=>[value,value])})}${field('availability','可服务时间',data.availability,{type:'textarea',required:true,helper:'请写明可到场的日期与时间段。'})}${field('experience','相关经验',data.experience,{type:'textarea',full:true,helper:'可填写赛事、教育、急救、摄影等相关经历；无经验可留空。'})}`
    : `<div class="form-field"><label for="attendee_count">观赛人数<span class="required" aria-hidden="true">*</span></label><select class="form-control" id="attendee_count" name="attendee_count" required>${Array.from({length:6},(_,index)=>index+1).map((count)=>`<option value="${count}" ${Number(data.attendee_count)===count?'selected':''}>${count} 人</option>`).join('')}</select><p class="field-error" data-error="attendee_count" role="alert"></p></div>${field('companion_names','同行观众姓名',data.companion_names,{required:Number(data.attendee_count)>1,full:true,helper:'观赛人数大于 1 人时必填，请用顿号或换行分隔。'})}${field('notes','观赛备注',data.notes,{type:'textarea',full:true,helper:'可填写无障碍通行、儿童陪同等需要组委会提前了解的信息。'})}`;
  return `<div class="card activity-form-card"><div class="card-header"><div><h2>${application?`编辑${config.noun}报名`:`提交${config.noun}报名`}</h2><p class="muted">带星号的信息必须填写完整。</p></div>${application?badge(reviewStatusMeta(application.status)):''}</div><div class="card-body"><div class="info-banner gap-bottom">${icon('shield')}<div><strong>隐私提示</strong><br>证件号码仅用于身份与入场核验，只对本人和管理员开放。</div></div><form data-form="activity-application" data-type="${type}" data-id="${application?.id || ''}" novalidate><input type="hidden" name="type" value="${type}">${lockEvent?`<input type="hidden" name="event_id" value="${Number(data.event_id)}">`:''}<div class="form-grid">${common}${specific}</div><div class="form-actions">${application?`<a class="button button-secondary" href="#${config.path}/${data.event_id}">取消编辑</a>`:''}<button class="button button-accent" type="submit">${application?'保存并重新提交':'立即提交'}</button></div></form></div></div>`;
}

function activityApplicationRecords(type, applications, events) {
  const config = activityConfigs[type];
  if (!applications.length) return `<div class="card activity-records"><div class="card-body"><div class="empty-state"><div class="empty-icon">${icon(config.icon,30)}</div><h3>还没有${config.noun}报名记录</h3><p>从上方选择赛事并提交后，可在这里查看审核进度。</p></div></div></div>`;
  const desktopRows = applications.map((item) => {
    const eventOpen = events.find((event) => event.id === item.event_id)?.registration_open;
    const summary = type === 'volunteer' ? item.volunteer_role : `${item.attendee_count} 人`;
    return `<tr><td><strong>${escapeHtml(item.event_title)}</strong><br><small class="muted">${formatDate(item.starts_at)} · ${escapeHtml(item.location)}</small></td><td>${escapeHtml(item.name)}<br><small class="muted">${escapeHtml(maskIdNumber(item.id_number))}</small></td><td>${escapeHtml(summary)}</td><td class="status-cell">${badge(reviewStatusMeta(item.status))}${item.rejection_reason?`<small class="status-reason">${escapeHtml(item.rejection_reason)}</small>`:''}</td><td>${formatDate(item.created_at,true)}</td><td>${activityApplicationActions(item,config,eventOpen)}</td></tr>`;
  }).join('');
  const mobileCards = applications.map((item) => {
    const eventOpen = events.find((event) => event.id === item.event_id)?.registration_open;
    return `<article class="entity-card"><div class="entity-card-head"><h3>${escapeHtml(item.event_title)}</h3>${badge(reviewStatusMeta(item.status))}</div><dl><div><dt>报名人</dt><dd>${escapeHtml(item.name)}</dd></div><div><dt>${type==='volunteer'?'意向岗位':'观赛人数'}</dt><dd>${type==='volunteer'?escapeHtml(item.volunteer_role):`${item.attendee_count} 人`}</dd></div><div><dt>提交时间</dt><dd>${formatDate(item.created_at,true)}</dd></div>${item.rejection_reason?`<div><dt>驳回原因</dt><dd>${escapeHtml(item.rejection_reason)}</dd></div>`:''}</dl>${activityApplicationActions(item,config,eventOpen)}</article>`;
  }).join('');
  return `<div class="card activity-records"><div class="card-header"><h2>我的${config.noun}报名</h2><span class="muted">${applications.length} 条记录</span></div><div class="card-body"><div class="desktop-table data-table-wrap"><table class="data-table"><thead><tr><th>赛事</th><th>报名人</th><th>申请内容</th><th class="status-cell">状态</th><th>提交时间</th><th>操作</th></tr></thead><tbody>${desktopRows}</tbody></table></div><div class="mobile-list">${mobileCards}</div></div></div>`;
}

async function activityApplicationPage(type) {
  const config = activityConfigs[type];
  const { events } = await apiFetch('/api/events');
  const applications = state.user ? (await apiFetch(`/api/activity-applications?type=${type}`)).applications : [];
  const availabilityKey=type==='volunteer'?'allow_volunteer':'allow_spectator';
  const availableEvents=events.filter((event)=>event[availabilityKey]);
  const openCount = availableEvents.filter((event) => event.registration_open).length;
  const eventContent = availableEvents.length ? `<div class="event-grid">${availableEvents.map((event)=>activityEventCard(event,config)).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">${icon('calendar',30)}</div><h2>暂未开放${config.title}</h2><p>管理员为赛事开启后，才会在这里显示可报名场次。</p><a class="button button-primary" href="#/events">返回赛事报名</a></div>`;
  const records = state.user ? activityApplicationRecords(type,applications,events) : '';
  app.innerHTML = `<section class="page-section activity-page"><div class="container"><div class="page-head"><div><h1>${config.title}</h1><p class="lead">先选择赛事卡片，进入详情页确认时间、地点和通知后再填写${config.noun}资料。</p></div><div class="activity-list-count"><strong>${openCount}</strong><span>场赛事正在报名</span></div></div>${eventContent}${records}</div></section>`;
}

async function activityEventDetailPage(type, id) {
  const config = activityConfigs[type];
  const [{ event }, applicationData, profileData] = await Promise.all([
    apiFetch(`/api/events/${id}`),
    state.user ? apiFetch(`/api/activity-applications?type=${type}`) : Promise.resolve({ applications: [] }),
    state.user ? apiFetch('/api/profile') : Promise.resolve({ profile: null }),
  ]);
  const availabilityKey=type==='volunteer'?'allow_volunteer':'allow_spectator';
  if(!event[availabilityKey]){activityUnavailablePage(type);return;}
  const status = eventStatusMeta(event.time_status);
  const applications = applicationData.applications;
  const editId = Number(routeInfo().query.get('edit'));
  const editing = editId ? applications.find((item) => item.id === editId && item.event_id === event.id) : null;
  if (editId && !editing) throw new Error('未找到该赛事可编辑的活动报名记录');
  const currentApplication = applications.find((item) => item.event_id === event.id);
  let registrationContent;
  if (!state.user) {
    registrationContent = `<div class="card"><div class="card-body"><div class="empty-state"><div class="empty-icon">${icon('lock',30)}</div><h2>登录后填写${config.noun}报名</h2><p>登录后将直接返回本赛事详情页继续提交资料。</p><div class="button-row center"><a class="button button-primary" href="#/login?next=${encodeURIComponent(`${config.path}/${event.id}`)}">登录并继续</a><a class="button button-secondary" href="#/register">注册账号</a></div></div></div></div>`;
  } else if (editing) {
    registrationContent = activityApplicationForm(type,editing,profileData.profile,[event],event.id,true);
  } else if (currentApplication) {
    const summaryRows = type === 'volunteer'
      ? [['报名人',currentApplication.name],['意向岗位',currentApplication.volunteer_role],['可服务时间',currentApplication.availability],['提交时间',formatDate(currentApplication.created_at,true)]]
      : [['报名人',currentApplication.name],['观赛人数',`${currentApplication.attendee_count} 人`],['同行观众',currentApplication.companion_names||'—'],['提交时间',formatDate(currentApplication.created_at,true)]];
    registrationContent = `<div class="card activity-current-application"><div class="card-header"><div><h2>您已提交本赛事${config.noun}报名</h2><p class="muted">审核结果会在此处持续更新。</p></div>${badge(reviewStatusMeta(currentApplication.status))}</div><div class="card-body">${currentApplication.rejection_reason?`<div class="danger-banner info-banner gap-bottom">${icon('alert')}<div><strong>驳回原因</strong><br>${escapeHtml(currentApplication.rejection_reason)}</div></div>`:''}${detailRows(summaryRows)}<div class="form-actions">${activityApplicationActions(currentApplication,config,event.registration_open)}</div></div></div>`;
  } else if (event.registration_open) {
    registrationContent = activityApplicationForm(type,null,profileData.profile,[event],event.id,true);
  } else {
    registrationContent = `<div class="card"><div class="card-body"><div class="empty-state"><div class="empty-icon">${icon('calendar',30)}</div><h2>当前不可报名</h2><p>报名时间为 ${formatDate(event.registration_start,true)} — ${formatDate(event.registration_end,true)}。</p><a class="button button-secondary" href="#${config.path}">返回赛事列表</a></div></div></div>`;
  }
const notice = noticeMarkdown(event);
  app.innerHTML = `<section class="detail-hero"><div class="container"><nav class="breadcrumb"><a href="#${config.path}">${config.title}</a>${icon('chevron',14)}<span>赛事详情</span></nav><div class="detail-grid"><div class="detail-cover"><img src="${safeUrl(event.image_url) || '/assets/event-shenzhen.svg'}" alt="${escapeHtml(event.title)}赛事海报" width="1200" height="675"></div><div class="detail-info">${badge(status)}<h1>${escapeHtml(event.title)}</h1><p class="detail-description">${escapeHtml(event.description)}</p><div class="event-facts"><div class="fact"><span>发布时间</span><strong>${formatDate(event.published_at,true)}</strong></div><div class="fact"><span>赛事时间</span><strong>${formatDate(event.starts_at)} — ${formatDate(event.ends_at)}</strong></div><div class="fact"><span>比赛地点</span><strong>${escapeHtml(event.location)}</strong></div><div class="fact"><span>联系人</span><strong>${escapeHtml(event.contact_name)} · ${escapeHtml(event.contact_phone)}</strong></div><div class="fact"><span>报名时间</span><strong>${formatDate(event.registration_start,true)} — ${formatDate(event.registration_end,true)}</strong></div></div></div></div></div></section><section class="registration-area activity-detail-registration"><div class="container"><div class="activity-layout"><article class="activity-guide card"><div class="card-body"><div class="activity-icon">${icon(config.icon,30)}</div><h2>${config.title}须知</h2><ul><li>本页提交的资料只对应当前赛事。</li><li>请使用报名人本人的真实身份与联系方式。</li><li>待审核或已驳回记录可修改；已通过记录将锁定。</li></ul><p><strong>联系人：</strong>小周老师<br><strong>电话：</strong>13761393714<br><strong>邮箱：</strong>654849662@qq.com</p></div></article>${registrationContent}</div></div></section><section class="notice-section"><div class="container"><article class="notice-card"><h2>赛事举办通知</h2>${notice}</article></div></section>`;
}

function activityUnavailablePage(type) {
  const config=activityConfigs[type];
  app.innerHTML=`<section class="page-section"><div class="container"><div class="empty-state"><div class="empty-icon">${icon(config.icon,30)}</div><h1>${config.title}暂未开放</h1><p>当前没有赛事开放此报名入口，请关注后续赛事通知。</p><a class="button button-primary" href="#/events">返回赛事报名</a></div></div></section>`;
}

async function viewActivityApplication(id, admin = false) {
  const { application } = await apiFetch(`${admin?'/api/admin':''}/activity-applications/${id}`);
  const config = activityConfigs[application.type];
  const common = [['报名类别',config.title],['赛事',application.event_title],['赛事时间',`${formatDate(application.starts_at)} — ${formatDate(application.ends_at)}`],['比赛地点',application.location],['审核状态',reviewStatusMeta(application.status).label],['驳回原因',application.rejection_reason||'—'],['姓名',application.name],['性别',application.gender],['证件号码',application.id_number],['联系电话',application.phone],['联系邮箱',application.email],['学校 / 单位',application.organization||'—']];
  const specific = application.type==='volunteer' ? [['意向岗位',application.volunteer_role],['可服务时间',application.availability],['相关经验',application.experience||'—'],['备注',application.notes||'—']] : [['观赛人数',`${application.attendee_count} 人`],['同行观众姓名',application.companion_names||'—'],['观赛备注',application.notes||'—']];
  const footer = admin ? adminReviewFooter('activity',application.id,application.status) : `<button class="button button-primary" type="button" data-action="close-modal">关闭</button>`;
  openModal(`${config.title}详情`,`<div class="detail-section"><h3>申请信息</h3>${detailRows([...common,...specific])}</div>`,footer,'wide');
}

async function refreshCaptcha(root = document, clearAnswer = true) {
  state.captcha = await apiFetch('/api/captcha');
  const img = $('[data-captcha-image]', root); if (img) img.src = state.captcha.svg;
  const id = $('[name=captchaId]', root); if (id) id.value = state.captcha.id;
  const answer = $('[name=captcha]', root); if (answer && clearAnswer) answer.value = '';
}

function passwordField(name, label, autocomplete) {
  return `<div class="form-field"><label for="${name}">${label}<span class="required" aria-hidden="true">*</span></label><div class="password-wrap"><input class="form-control" id="${name}" name="${name}" type="password" required autocomplete="${autocomplete}"><button class="password-toggle" type="button" data-action="toggle-password" data-target="${name}" aria-label="显示密码">${icon('eye')}</button></div><p class="field-error" data-error="${name}" role="alert"></p></div>`;
}

function captchaField() {
  return `<div class="form-field" data-captcha-field><label for="captcha">图形验证码<span class="required" aria-hidden="true">*</span></label><input type="hidden" name="captchaId"><div class="input-combo"><input class="form-control" id="captcha" name="captcha" required maxlength="4" autocomplete="off" placeholder="请输入 4 位验证码"><img class="captcha-image" data-captcha-image data-action="refresh-captcha" src="" alt="图形验证码，点击可刷新" title="点击刷新"></div><p class="helper">图形验证码有效期 10 分钟，点击图片可刷新。</p><p class="field-error" data-error="captcha" role="alert"></p></div>`;
}

function readRegistrationDraft() {
  try {
    const draft=JSON.parse(sessionStorage.getItem(REGISTRATION_DRAFT_KEY)||'{}');
    if(draft.codeSentAt && Date.now()-Number(draft.codeSentAt)>=AUTH_VERIFICATION_TTL_MS){delete draft.code;delete draft.codeSentAt;delete draft.codeSentEmail;sessionStorage.setItem(REGISTRATION_DRAFT_KEY,JSON.stringify(draft));}
    return draft;
  } catch { return {}; }
}

function saveRegistrationDraft(form) {
  if(!form?.matches('[data-form="register"]'))return;
  const draft={username:form.elements.username.value,nickname:form.elements.nickname.value,phone:form.elements.phone.value,email:form.elements.email.value,code:form.elements.code.value,codeSentAt:form.dataset.codeSentAt||'',codeSentEmail:form.dataset.codeSentEmail||''};
  sessionStorage.setItem(REGISTRATION_DRAFT_KEY,JSON.stringify(draft));
}

function setRegistrationCodeSent(form,email,sentAt=Date.now()) {
  form.dataset.codeSentEmail=email;form.dataset.codeSentAt=String(sentAt);
  const captcha=$('[data-captcha-field]',form);if(captcha)captcha.hidden=true;
  if(form.elements.captcha){form.elements.captcha.required=false;form.elements.captcha.disabled=true;}
  if(form.elements.captchaId)form.elements.captchaId.disabled=true;
  const notice=$('[data-registration-code-status]',form);if(notice){notice.hidden=false;notice.innerHTML=`${icon('mail',20)}<div>邮件验证码已发送至 <strong>${escapeHtml(email)}</strong><small>10 分钟内有效。切换到邮箱再返回时，当前填写内容会自动保留。</small></div>`;}
  saveRegistrationDraft(form);
}

async function loginPage() {
  if (state.user) return go('/events');
  app.innerHTML = `<section class="auth-page"><div class="auth-shell"><form class="auth-card" data-form="login" novalidate><div class="auth-heading"><img class="auth-logo" src="/assets/ruibude-logo.jpg" alt="上海瑞卜德教育" width="84" height="84"><h1>用户登录</h1><p>使用用户名或注册邮箱直接登录</p></div><div class="form-grid">${field('account','用户名或邮箱','',{required:true,autocomplete:'username',placeholder:'请输入用户名或注册邮箱'})}${passwordField('password','密码','current-password')}<div class="form-field"><button class="button button-primary" type="submit">登录</button></div></div><p class="auth-footer"><a href="#/forgot-password">忘记密码</a><span aria-hidden="true"> · </span>还没有账号？<a href="#/register">立即注册</a></p></form></div></section>`;
}

async function registerPage() {
  if (state.user) return go('/events');
  const draft=readRegistrationDraft();
  app.innerHTML = `<section class="auth-page"><div class="auth-shell"><form class="auth-card" data-form="register" novalidate><div class="auth-heading"><img class="auth-logo" src="/assets/ruibude-logo.jpg" alt="上海瑞卜德教育" width="84" height="84"><h1>创建报名账号</h1><p>通过邮箱验证码完成身份验证</p></div><div class="form-grid">${field('username','用户名',draft.username||'',{required:true,autocomplete:'username',minlength:2,maxlength:32,pattern:'[\\p{L}\\p{N}_-]{2,32}',placeholder:'用于识别账号，注册后不可修改',helper:'2–32 位中文、字母、数字、下划线或连字符'})}${field('nickname','昵称',draft.nickname||'',{autocomplete:'nickname',maxlength:50,placeholder:'便于页面显示，可选'})}${field('phone','手机号',draft.phone||'',{type:'tel',required:true,autocomplete:'tel',inputmode:'tel',maxlength:24,placeholder:'仅作为注册信息，不用于验证'})}${field('email','邮箱',draft.email||'',{type:'email',required:true,autocomplete:'email',placeholder:'name@example.com'})}${captchaField()}<div class="info-banner auth-code-notice" data-registration-code-status role="status" hidden></div><div class="form-field"><label for="code">邮箱验证码<span class="required" aria-hidden="true">*</span></label><div class="input-combo"><input class="form-control" id="code" name="code" value="${escapeHtml(draft.code||'')}" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="6 位验证码"><button class="button button-secondary" type="button" data-action="send-code">获取验证码</button></div><p class="helper">邮件验证码有效期 10 分钟。</p><p class="field-error" data-error="code" role="alert"></p></div>${passwordField('password','设置密码','new-password')}<div class="form-field"><button class="button button-primary" type="submit">注册</button></div></div><p class="helper">除密码外，注册信息会暂存在当前标签页。密码至少 8 位，且需同时包含字母和数字。</p><p class="auth-footer">已有账号？<a href="#/login">返回登录</a></p></form></div></section>`;
  const form=$('[data-form="register"]');
  const active=Boolean(draft.codeSentAt&&draft.codeSentEmail&&draft.codeSentEmail===draft.email&&Date.now()-Number(draft.codeSentAt)<AUTH_VERIFICATION_TTL_MS);
  if(active)setRegistrationCodeSent(form,draft.codeSentEmail,draft.codeSentAt);else await refreshCaptcha(form);
}

async function forgotPasswordPage() {
  if (state.user) return go('/events');
  state.passwordResetChallenge = null;
  app.innerHTML = `<section class="auth-page"><div class="auth-shell"><form class="auth-card" data-form="password-reset-request" novalidate><div class="auth-heading"><img class="auth-logo" src="/assets/ruibude-logo.jpg" alt="上海瑞卜德教育" width="84" height="84"><span class="auth-step-label">第 1 步，共 2 步</span><h1>找回账户密码</h1><p>输入注册邮箱，获取密码重置验证码</p></div><div class="form-grid">${field('email','注册邮箱','',{type:'email',required:true,autocomplete:'email',placeholder:'name@example.com'})}${captchaField()}<div class="form-field"><button class="button button-primary" type="submit">发送重置验证码</button></div></div><p class="auth-footer"><a href="#/login">返回登录</a></p></form></div></section>`;
  await refreshCaptcha();
}

function passwordResetVerificationPage(result) {
  state.passwordResetChallenge = { id: result.challengeId, maskedEmail: result.maskedEmail };
  app.innerHTML = `<section class="auth-page"><div class="auth-shell"><form class="auth-card" data-form="password-reset-confirm" novalidate><input type="hidden" name="challengeId" value="${escapeHtml(result.challengeId)}"><div class="auth-heading"><img class="auth-logo" src="/assets/ruibude-logo.jpg" alt="上海瑞卜德教育" width="84" height="84"><span class="auth-step-label">第 2 步，共 2 步</span><h1>设置新密码</h1><p>使用邮箱验证码确认本次密码重置</p></div><div class="info-banner auth-code-notice" role="status">${icon('mail',22)}<div>如果该邮箱已注册，验证码将发送至<br><strong>${escapeHtml(result.maskedEmail)}</strong><small>验证码 10 分钟有效，最多可尝试 5 次。</small></div></div><div class="form-grid"><div class="form-field"><label for="reset-code">邮箱验证码<span class="required" aria-hidden="true">*</span></label><input class="form-control auth-code-input" id="reset-code" name="code" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="请输入 6 位验证码"><p class="field-error" data-error="code" role="alert"></p></div>${passwordField('password','新密码','new-password')}${passwordField('confirm_password','确认新密码','new-password')}<div class="form-field auth-verify-actions"><button class="button button-primary" type="submit">确认重置密码</button><button class="button button-secondary" type="button" data-action="restart-password-reset">返回重新获取</button></div></div><p class="helper">新密码至少 8 位，且需同时包含字母和数字。</p></form></div></section>`;
  const codeInput = $('#reset-code');
  if (result.devCode) {
    codeInput.value = result.devCode;
    toast(`开发环境验证码已自动填入：${result.devCode}`);
  }
  codeInput.focus();
}

function requireUser() {
  if (!state.user) { go(`/login?next=${encodeURIComponent(location.hash.slice(1))}`); return false; }
  return true;
}

function requireAdmin() {
  if (!state.user) { go('/login'); return false; }
  if (state.user.role !== 'admin') { toast('当前账号没有管理员权限', 'error'); go('/events'); return false; }
  return true;
}

function sidebarLink(path, iconName, label, current) {
  const selected = current === path || (path !== '/admin' && current.startsWith(`${path}/`));
  return `<a href="#${path}" class="${selected ? 'active' : ''}">${icon(iconName)}${label}</a>`;
}

function portalShell(title, description, content, action = '') {
  const current = routeInfo().path;
  return `<section class="portal"><div class="container portal-layout"><aside class="sidebar"><div class="sidebar-head"><strong>${escapeHtml(state.user.nickname || '报名用户')}</strong><small>${escapeHtml(state.user.email)}</small></div><nav class="sidebar-nav" aria-label="个人中心导航">${sidebarLink('/account/profile','user','个人信息',current)}${sidebarLink('/account/members','users','队员信息',current)}${sidebarLink('/account/coaches','shield','教练信息',current)}${sidebarLink('/account/teams','users','战队管理',current)}${sidebarLink('/account/registrations','trophy','我的比赛',current)}</nav></aside><div class="portal-main"><div class="portal-head"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${action}</div>${content}</div></div></section>`;
}

function adminShell(title, description, content, action = '') {
  const current = routeInfo().path;
  return `<section class="portal admin-portal"><div class="container portal-layout"><aside class="sidebar"><div class="sidebar-head"><strong>赛事管理后台</strong><small>${escapeHtml(state.user.email)}</small></div><nav class="sidebar-nav" aria-label="管理后台导航">${sidebarLink('/admin','dashboard','管理概览',current)}${sidebarLink('/admin/events','calendar','赛事管理',current)}${sidebarLink('/admin/users','user','管理用户',current)}${sidebarLink('/admin/teams','flag','已有战队管理',current)}${sidebarLink('/admin/reviews','shield','赛事报名审核',current)}${sidebarLink('/admin/activity-applications','users','活动报名审核',current)}</nav></aside><div class="portal-main"><div class="portal-head"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${action}</div>${content}</div></div></section>`;
}

function adminSearchForm(value, placeholder) {
  const {path,query}=routeInfo();
  const clearQuery=new URLSearchParams(query);clearQuery.delete('q');
  const clearHref=`#${path}${clearQuery.size?`?${clearQuery}`:''}`;
  return `<form class="admin-search" data-admin-search role="search"><label class="sr-only" for="admin-search-query">搜索</label><div class="admin-search-control">${icon('search',18)}<input class="form-control" id="admin-search-query" name="q" value="${escapeHtml(value||'')}" maxlength="120" autocomplete="off" placeholder="${escapeHtml(placeholder)}"><button class="button button-primary button-small" type="submit">搜索</button>${value?`<a class="button button-secondary button-small" href="${clearHref}">清除</a>`:''}</div></form>`;
}

function teamSummaryModal(team) {
  const row = (label, value) => `<div class="detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '—')}</strong></div>`;
  openModal(team.owner_email?'战队完整资料':'确认参赛战队信息', `<div class="detail-section"><h3>战队信息</h3><div class="detail-list">${team.owner_email?row('所属账号',team.owner_email):''}${team.owner_nickname?row('账号称呼',team.owner_nickname):''}${row('战队编号',team.number)}${row('战队名称',team.name)}${row('参赛组别',team.group_name)}${row('学校/机构',team.school_name)}${row('所在地区',[team.province,team.city].filter(Boolean).join(' '))}${row('国籍',team.nationality)}${team.registration_count!==undefined?row('累计报名',`${team.registration_count} 次`):''}</div></div><div class="detail-section"><h3>教练信息</h3><div class="data-table-wrap"><table class="data-table"><thead><tr><th>姓名</th><th>电话</th><th>单位</th><th>邮箱</th></tr></thead><tbody>${team.coaches.map((coach)=>`<tr><td>${escapeHtml(coach.name)}${coach.id===team.contact_coach_id?' <span class="badge badge-approved">联系人</span>':''}</td><td>${escapeHtml(coach.phone)}</td><td>${escapeHtml(coach.org_name)}</td><td>${escapeHtml(coach.email)}</td></tr>`).join('')}</tbody></table></div></div><div class="detail-section"><h3>队员信息</h3><div class="data-table-wrap"><table class="data-table"><thead><tr><th>姓名</th><th>性别</th><th>年级</th><th>学校</th><th>身份证号</th><th>电话</th></tr></thead><tbody>${team.members.map((member)=>`<tr><td>${escapeHtml(member.name)}</td><td>${escapeHtml(member.gender)}</td><td>${escapeHtml(member.grade)}</td><td>${escapeHtml(member.school)}</td><td>${escapeHtml(member.id_number)}</td><td>${escapeHtml(member.phone)}</td></tr>`).join('')}</tbody></table></div></div>`, `<button type="button" class="button button-primary" data-action="close-modal">${team.owner_email?'关闭':'信息无误'}</button>`, 'wide');
}

async function eventDetailPage(id) {
  const [{ event }, teamsData] = await Promise.all([apiFetch(`/api/events/${id}`), state.user ? apiFetch('/api/teams') : Promise.resolve({ teams: [] })]);
  const status = eventStatusMeta(event.time_status);
  const teamOptions = teamsData.teams.map((team) => `<option value="${team.id}" data-group="${escapeHtml(team.group_name)}">${escapeHtml(team.number)} · ${escapeHtml(team.name)}</option>`).join('');
  const registrationContent = !state.user ? `<div class="registration-title"><h2>在线报名</h2><p>登录后可选择已创建的战队并提交付款凭证。</p></div><div class="card-body"><div class="info-banner">${icon('info')}<div><strong>请先登录或注册</strong><br>报名之前，请先在个人中心创建教练、队员和战队信息。</div></div><div class="button-row gap-top"><a class="button button-primary" href="#/login?next=${encodeURIComponent(`/events/${event.id}`)}">登录</a><a class="button button-secondary" href="#/register">注册账号</a></div></div>`
  : `<div class="registration-title"><h2>在线报名</h2><p>提交前请核对参赛组别、战队信息和支付凭证。</p></div><div class="payment-strip"><div class="payment-item"><span>付款户名</span><strong>${escapeHtml(event.payee)}</strong></div><div class="payment-item"><span>收款账号</span><strong>${escapeHtml(event.account_no)}</strong></div><div class="payment-item"><span>开户行代码</span><strong>${escapeHtml(event.bank_code || '—')}</strong></div><div class="payment-item"><span>开户行</span><strong>${escapeHtml(event.bank_name)}</strong></div></div><form class="registration-form" data-form="registration" novalidate><input type="hidden" name="event_id" value="${event.id}"><div class="form-grid">${field('group_name','参赛组别','',{type:'select',required:true,choices:[['','请选择参赛组别'],...event.groups.map((group)=>[group,group])]})}<div class="form-field"><label for="team_id">参赛战队<span class="required" aria-hidden="true">*</span></label><select class="form-control" id="team_id" name="team_id" required disabled><option value="">请先选择参赛组别</option>${teamOptions}</select><p class="helper">选项结构为“战队编号 · 战队名称”；选择后会弹出确认信息。</p><p class="field-error" data-error="team_id" role="alert"></p></div>${filePicker('payment_proof_url','参赛费支付凭证','', 'payment', true)}</div>${!teamsData.teams.length?`<div class="warning-banner info-banner">${icon('alert')}<div><strong>尚无可选战队</strong><br>请先添加教练和队员，再创建完整战队。<div class="button-row gap-top-sm"><a class="button button-secondary button-small" href="#/account/coaches">添加教练</a><a class="button button-secondary button-small" href="#/account/members">添加队员</a><a class="button button-primary button-small" href="#/account/teams/new">创建战队</a></div></div></div>`:''}<div class="form-actions"><button type="submit" class="button button-accent" ${!event.registration_open?'disabled':''}>${event.registration_open?'立即提交':'当前不可报名'}</button></div></form>`;
const notice = noticeMarkdown(event);
  const refundDeadlineText = refundDeadlineLabel(event.registration_end,event.refund_deadline_days);
  app.innerHTML = `<section class="detail-hero"><div class="container"><nav class="breadcrumb"><a href="#/events">赛事报名</a>${icon('chevron',14)}<span>赛事详情</span></nav><div class="detail-grid"><div class="detail-cover"><img src="${safeUrl(event.image_url) || '/assets/event-shenzhen.svg'}" alt="${escapeHtml(event.title)}赛事海报" width="1200" height="675"></div><div class="detail-info">${badge(status)}<h1>${escapeHtml(event.title)}</h1><p class="detail-description">${escapeHtml(event.description)}</p><div class="event-facts"><div class="fact"><span>发布时间</span><strong>${formatDate(event.published_at,true)}</strong></div><div class="fact"><span>赛事时间</span><strong>${formatDate(event.starts_at)} — ${formatDate(event.ends_at)}</strong></div><div class="fact"><span>比赛地点</span><strong>${escapeHtml(event.location)}</strong></div><div class="fact"><span>联系人</span><strong>${escapeHtml(event.contact_name)} · ${escapeHtml(event.contact_phone)}</strong></div><div class="fact"><span>报名时间</span><strong>${formatDate(event.registration_start,true)} — ${formatDate(event.registration_end,true)}</strong></div><div class="fact"><span>截止提交退费申请日期</span><strong>${escapeHtml(refundDeadlineText)}</strong></div></div></div></div></div></section><section class="registration-area"><div class="container"><div class="registration-panel">${registrationContent}</div></div></section><section class="notice-section"><div class="container"><article class="notice-card"><h2>赛事举办通知</h2>${notice}</article></div></section>`;
}

async function profilePage() {
  if (!requireUser()) return;
  const { profile } = await apiFetch('/api/profile');
  const avatar = profile.avatar_url ? `<img src="${safeUrl(profile.avatar_url)}" alt="用户头像">` : icon('user', 58);
  const content = `<div class="card"><div class="card-header"><h2>账户概览</h2><button class="button button-secondary button-small" type="button" data-action="profile-edit">${icon('edit',17)}编辑信息</button></div><div class="card-body"><div class="profile-summary"><div class="profile-avatar">${avatar}</div><div class="profile-facts"><div class="profile-fact"><span>用户名</span><strong>${escapeHtml(profile.username)}</strong></div><div class="profile-fact"><span>昵称</span><strong>${escapeHtml(profile.nickname || '未填写')}</strong></div><div class="profile-fact"><span>用户邮箱</span><strong>${escapeHtml(profile.email)}</strong></div><div class="profile-fact"><span>联系人</span><strong>${escapeHtml(profile.contact_name || '未填写')}</strong></div><div class="profile-fact"><span>联系电话</span><strong>${escapeHtml(profile.phone || '未填写')}</strong></div><div class="profile-fact"><span>身份证号码</span><strong>${escapeHtml(profile.id_number || '未填写')}</strong></div><div class="profile-fact"><span>单位名称</span><strong>${escapeHtml(profile.org_name || '未填写')}</strong></div><div class="profile-fact"><span>单位地址</span><strong>${escapeHtml(profile.org_address || '未填写')}</strong></div><div class="profile-fact"><span>单位简介</span><strong>${escapeHtml(profile.org_intro || '未填写')}</strong></div></div></div></div></div><div class="card card-stack"><div class="card-header"><h2>账户安全</h2></div><div class="card-body"><form data-form="password" novalidate><div class="form-grid">${passwordField('current_password','当前密码','current-password')}${passwordField('new_password','新密码','new-password')}<div class="form-field full"><div class="form-actions"><button class="button button-primary" type="submit">修改密码</button></div></div></div></form></div></div>`;
  app.innerHTML = portalShell('个人中心','查看与维护报名账户的基础信息。',content);
}

async function profileEditModal() {
  const { profile } = await apiFetch('/api/profile');
  openModal('编辑个人信息', `<form data-form="profile" novalidate><div class="form-grid">${field('nickname','昵称',profile.nickname,{autocomplete:'nickname'})}${field('contact_name','联系人',profile.contact_name,{autocomplete:'name'})}${field('phone','联系电话',profile.phone,{type:'tel',autocomplete:'tel',inputmode:'tel'})}${field('id_number','身份证号码',profile.id_number,{maxlength:40})}${field('org_name','单位名称',profile.org_name,{full:true})}${field('org_address','单位地址',profile.org_address,{full:true})}${field('org_intro','单位简介',profile.org_intro,{type:'textarea',full:true})}${filePicker('avatar_url','用户头像',profile.avatar_url,'avatar',false)}</div><div class="form-actions"><button class="button button-secondary" type="button" data-action="close-modal">取消</button><button class="button button-primary" type="submit">保存信息</button></div></form>`, '', 'wide');
}

function entityActions(type, id) {
  return `<div class="cell-actions"><a class="button button-secondary button-small" href="#/account/${type}/${id}/edit">${icon('edit',16)}编辑</a><button class="button button-danger-ghost button-small" type="button" data-action="delete-entity" data-entity="${type}" data-id="${id}">${icon('trash',16)}删除</button></div>`;
}

async function membersPage() {
  if (!requireUser()) return;
  const { members } = await apiFetch('/api/members');
  const content = members.length ? `<div class="desktop-table data-table-wrap"><table class="data-table"><thead><tr><th>姓名</th><th>性别</th><th>年级</th><th>学校</th><th>身份证号</th><th>电话</th><th>操作</th></tr></thead><tbody>${members.map((m)=>`<tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.gender)}</td><td>${escapeHtml(m.grade)}</td><td>${escapeHtml(m.school)}</td><td>${escapeHtml(m.id_number)}</td><td>${escapeHtml(m.phone)}</td><td>${entityActions('members',m.id)}</td></tr>`).join('')}</tbody></table></div><div class="mobile-list">${members.map((m)=>`<article class="entity-card"><div class="entity-card-head"><h3>${escapeHtml(m.name)}</h3><span class="badge badge-ongoing">${escapeHtml(m.grade)}</span></div><dl><div><dt>学校</dt><dd>${escapeHtml(m.school)}</dd></div><div><dt>电话</dt><dd>${escapeHtml(m.phone)}</dd></div><div><dt>身份证号</dt><dd>${escapeHtml(m.id_number)}</dd></div><div><dt>国籍</dt><dd>${escapeHtml(m.nationality)}</dd></div></dl>${entityActions('members',m.id)}</article>`).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">${icon('users',30)}</div><h3>还没有队员信息</h3><p>先添加队员，创建战队时即可从列表中多选。</p><a class="button button-primary" href="#/account/members/new">添加第一名队员</a></div>`;
  app.innerHTML = portalShell('队员信息','队员须完整填写身份、学校与照片资料。',content,`<a class="button button-primary" href="#/account/members/new">${icon('plus')}添加队员</a>`);
}

async function memberFormPage(id) {
  if (!requireUser()) return;
  let member = { gender:'男', grade:'小学', nationality:'中国' };
  if (id) { const data=await apiFetch('/api/members'); member=data.members.find((item)=>item.id===Number(id)); if(!member) throw new Error('未找到该队员'); }
  const gradeChoices=['小学','初中','高中','大学','其他'].map((v)=>[v,v]);
  const content=`<div class="card"><div class="card-body"><form data-form="member" data-id="${id||''}" novalidate><div class="form-grid">${field('name','姓名',member.name,{required:true,autocomplete:'name'})}${field('gender','性别',member.gender,{type:'select',required:true,choices:[['男','男'],['女','女'],['其他','其他']]})}${field('grade','年级',member.grade,{type:'select',required:true,choices:gradeChoices})}${field('school','学校',member.school,{required:true})}${field('id_number','身份证号',member.id_number,{required:true,maxlength:40,helper:'用于参赛资格审核，请确保与证件一致。'})}${field('phone','联系电话',member.phone,{type:'tel',required:true,inputmode:'tel',autocomplete:'tel'})}${field('province','省/直辖市',member.province)}${field('city','城市',member.city)}${field('nationality','国籍',member.nationality,{required:true})}${filePicker('photo_url','队员照片',member.photo_url,'member',true)}</div><div class="form-actions"><a class="button button-secondary" href="#/account/members">取消</a><button class="button button-primary" type="submit">${id?'保存修改':'添加队员'}</button></div></form></div></div>`;
  const actions=`<nav class="button-row portal-workflow-actions" aria-label="人员与战队创建快捷入口"><a class="button button-secondary" href="#/account/coaches/new">${icon('plus',17)}添加教练信息</a><a class="button button-secondary" href="#/account/teams/new">${icon('arrow',17)}前往创建战队信息</a></nav>`;
  app.innerHTML=portalShell(id?'编辑队员':'添加队员','带星号项目必须完整填写后才能保存。',content,actions);
}

async function coachesPage() {
  if(!requireUser()) return; const {coaches}=await apiFetch('/api/coaches');
  const content=coaches.length?`<div class="desktop-table data-table-wrap"><table class="data-table"><thead><tr><th>姓名</th><th>性别</th><th>电话</th><th>单位</th><th>邮箱</th><th>所在地区</th><th>操作</th></tr></thead><tbody>${coaches.map((c)=>`<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.gender)}</td><td>${escapeHtml(c.phone)}</td><td>${escapeHtml(c.org_name)}</td><td>${escapeHtml(c.email)}</td><td>${escapeHtml([c.province,c.city].filter(Boolean).join(' '))}</td><td>${entityActions('coaches',c.id)}</td></tr>`).join('')}</tbody></table></div><div class="mobile-list">${coaches.map((c)=>`<article class="entity-card"><div class="entity-card-head"><h3>${escapeHtml(c.name)}</h3><span class="badge badge-approved">教练</span></div><dl><div><dt>单位</dt><dd>${escapeHtml(c.org_name)}</dd></div><div><dt>电话</dt><dd>${escapeHtml(c.phone)}</dd></div><div><dt>邮箱</dt><dd>${escapeHtml(c.email)}</dd></div><div><dt>国籍</dt><dd>${escapeHtml(c.nationality)}</dd></div></dl>${entityActions('coaches',c.id)}</article>`).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">${icon('shield',30)}</div><h3>还没有教练信息</h3><p>战队联系人只能从教练信息中单选，请先添加至少一名教练。</p><a class="button button-primary" href="#/account/coaches/new">添加第一名教练</a></div>`;
  app.innerHTML=portalShell('教练信息','教练可加入多个战队，其中一人可被指定为战队联系人。',content,`<a class="button button-primary" href="#/account/coaches/new">${icon('plus')}添加教练</a>`);
}

async function coachFormPage(id) {
  if(!requireUser()) return; let coach={gender:'男',nationality:'中国'}; if(id){const data=await apiFetch('/api/coaches');coach=data.coaches.find((item)=>item.id===Number(id));if(!coach)throw new Error('未找到该教练');}
  const content=`<div class="card"><div class="card-body"><form data-form="coach" data-id="${id||''}" novalidate><div class="form-grid">${field('name','姓名',coach.name,{required:true,autocomplete:'name'})}${field('gender','性别',coach.gender,{type:'select',required:true,choices:[['男','男'],['女','女'],['其他','其他']]})}${field('phone','电话',coach.phone,{type:'tel',required:true,inputmode:'tel',autocomplete:'tel'})}${field('email','邮箱',coach.email,{type:'email',required:true,autocomplete:'email'})}${field('org_name','单位名称',coach.org_name,{required:true,full:true})}${field('province','省/直辖市',coach.province)}${field('city','城市',coach.city)}${field('nationality','国籍',coach.nationality,{required:true})}</div><div class="form-actions"><a class="button button-secondary" href="#/account/coaches">取消</a><button class="button button-primary" type="submit">${id?'保存修改':'添加教练'}</button></div></form></div></div>`;
  const actions=`<nav class="button-row portal-workflow-actions" aria-label="人员与战队创建快捷入口"><a class="button button-secondary" href="#/account/members/new">${icon('plus',17)}添加队员信息</a><a class="button button-secondary" href="#/account/teams/new">${icon('arrow',17)}前往创建战队信息</a></nav>`;
  app.innerHTML=portalShell(id?'编辑教练':'添加教练','教练无需上传照片或身份证件。',content,actions);
}

function teamActions(id) {
  return `<div class="cell-actions"><button class="button button-secondary button-small" type="button" data-action="view-team" data-id="${id}">${icon('eye',16)}查看</button><a class="button button-secondary button-small" href="#/account/teams/${id}/edit">${icon('edit',16)}编辑</a><button class="button button-danger-ghost button-small" type="button" data-action="delete-entity" data-entity="teams" data-id="${id}">${icon('trash',16)}删除</button></div>`;
}

async function teamsPage() {
  if(!requireUser())return; const {teams}=await apiFetch('/api/teams');
  const content=teams.length?`<div class="desktop-table data-table-wrap"><table class="data-table"><thead><tr><th>战队编号</th><th>战队名称</th><th>组别</th><th>学校/机构</th><th>教练</th><th>队员</th><th>操作</th></tr></thead><tbody>${teams.map((t)=>`<tr><td><strong>${escapeHtml(t.number)}</strong></td><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.group_name)}</td><td>${escapeHtml(t.school_name)}</td><td>${t.coaches.length}</td><td>${t.members.length}</td><td>${teamActions(t.id)}</td></tr>`).join('')}</tbody></table></div><div class="mobile-list">${teams.map((t)=>`<article class="entity-card"><div class="entity-card-head"><div><span class="record-label">${escapeHtml(t.number)}</span><h3>${escapeHtml(t.name)}</h3></div><span class="badge badge-ongoing">${escapeHtml(t.group_name)}</span></div><dl><div><dt>学校/机构</dt><dd>${escapeHtml(t.school_name)}</dd></div><div><dt>成员构成</dt><dd>${t.coaches.length} 名教练 · ${t.members.length} 名队员</dd></div></dl>${teamActions(t.id)}</article>`).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">${icon('users',30)}</div><h3>还没有战队</h3><p>战队需要关联至少一名教练和一名队员，联系人必须从教练中选择。</p><a class="button button-primary" href="#/account/teams/new">创建第一支战队</a></div>`;
  app.innerHTML=portalShell('战队管理','创建、查看和维护名下多支参赛战队。',content,`<a class="button button-primary" href="#/account/teams/new">${icon('plus')}添加战队</a>`);
}

function choiceCards(items,name,selected,subtitle) {
  return items.length?`<div class="check-grid">${items.map((item)=>`<label class="choice-card"><input type="checkbox" name="${name}" value="${item.id}" ${selected.includes(item.id)?'checked':''}><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(subtitle(item))}</small></span></label>`).join('')}</div>`:`<div class="warning-banner info-banner">${icon('alert')}<div>暂无可选信息，请先完成添加。</div></div>`;
}

function teamNumberSuffix(number, groupName) {
  const raw=String(number||'').trim();
  const knownPrefix=Object.values(INNOVATION_GROUP_PREFIXES).find((prefix)=>raw.toUpperCase().startsWith(prefix));
  return INNOVATION_GROUP_PREFIXES[groupName]&&knownPrefix?raw.slice(knownPrefix.length):raw;
}

function teamNumberSuffixMaxLength(prefix = '') {
  return Math.max(1, TEAM_NUMBER_MAX_LENGTH - prefix.length);
}

function teamGroupChoices(events = [], selectedGroup = '') {
  const groups = new Set(DEFAULT_TEAM_GROUPS);
  events.forEach((event) => (event.groups || []).forEach((group) => { if (group) groups.add(group); }));
  if (selectedGroup) groups.add(selectedGroup);
  return [...groups].map((value) => [value, value]);
}

function syncTeamNumberField(form) {
  if(!form)return;
  const group=form.elements.group_name?.value||'';
  const input=form.elements.number;
  const prefix=INNOVATION_GROUP_PREFIXES[group]||'';
  const control=form.querySelector('.team-number-control');
  const prefixNode=form.querySelector('[data-team-number-prefix]');
  const helper=form.querySelector('[data-team-number-helper]');
  if(!input||!prefixNode||!helper)return;
  if(prefix)input.value=teamNumberSuffix(input.value,group);
  prefixNode.textContent=prefix;
  prefixNode.hidden=!prefix;
  control?.classList.toggle('has-prefix',Boolean(prefix));
  input.maxLength=prefix?teamNumberSuffixMaxLength(prefix):TEAM_NUMBER_MAX_LENGTH;
  input.placeholder=prefix?'填写自定义后缀':'填写 RECF 官方战队编号';
  input.inputMode=prefix?'text':'';
  helper.innerHTML=prefix
    ? `系统将自动添加 <strong>${prefix}</strong> 前缀；最终编号限 1–30 个 ASCII 字符，不可包含空格或中文。最终编号：<strong data-team-number-preview>${prefix}${escapeHtml(input.value.trim())}</strong>`
    : '请填写 RECF 官方战队编号，限 1–30 个 ASCII 字符；如尚未取得编号，可查看右侧“如何获取？”。';
}

function syncCoachChoiceLimit(form) {
  const boxes=$$('[name="coach_ids"]',form);
  const selected=boxes.filter((box)=>box.checked).length;
  const atLimit=selected>=2;
  boxes.forEach((box)=>{
    const disabled=atLimit&&!box.checked;
    box.disabled=disabled;
    box.closest('.choice-card')?.classList.toggle('is-disabled',disabled);
  });
  const count=form.querySelector('[data-coach-count]');
  if(count)count.textContent=`已选择 ${selected} / 2 名教练${atLimit?'，其余选项已锁定':''}`;
}

async function teamFormPage(id) {
  if(!requireUser())return;
  const [{coaches},{members},teamsData,{events}]=await Promise.all([apiFetch('/api/coaches'),apiFetch('/api/members'),id?apiFetch('/api/teams'):Promise.resolve({teams:[]}),apiFetch('/api/events')]);
  let team={group_name:DEFAULT_TEAM_GROUPS[0],nationality:'中国',coaches:[],members:[]}; if(id){team=teamsData.teams.find((item)=>item.id===Number(id));if(!team)throw new Error('未找到该战队');}
  const selectedCoaches=team.coaches.map((c)=>c.id),selectedMembers=team.members.map((m)=>m.id);
  const groupChoices=teamGroupChoices(events,team.group_name);
  const numberPrefix=INNOVATION_GROUP_PREFIXES[team.group_name]||'';
  const numberMaxLength=numberPrefix?teamNumberSuffixMaxLength(numberPrefix):TEAM_NUMBER_MAX_LENGTH;
  const numberValue=teamNumberSuffix(team.number,team.group_name);
  const content=`<div class="info-banner gap-bottom">${icon('info')}<div>先选择教练和队员，再从已选教练中指定一名联系人。每个战队最多选择两名教练。创建后，赛事报名下拉项将显示“战队编号 · 战队名称”。</div></div><div class="card"><div class="card-body"><form data-form="team" data-id="${id||''}" novalidate><div class="form-grid"><div class="form-field"><label for="number">战队编号<span class="required">*</span> <a href="#/team-number" class="team-number-link">如何获取？</a></label><div class="team-number-control"><span class="team-number-prefix" data-team-number-prefix ${numberPrefix?'':'hidden'}>${escapeHtml(numberPrefix)}</span><input class="form-control" id="number" name="number" required maxlength="${numberMaxLength}" value="${escapeHtml(numberValue)}" placeholder="${numberPrefix?'填写自定义后缀':'填写 RECF 官方战队编号'}" aria-describedby="number-helper number-error"></div><p class="helper" id="number-helper" data-team-number-helper>${numberPrefix?`系统将自动添加 <strong>${escapeHtml(numberPrefix)}</strong> 前缀；最终编号限 1–30 个 ASCII 字符，不可包含空格或中文。最终编号：<strong data-team-number-preview>${escapeHtml(numberPrefix+numberValue)}</strong>`:'请填写 RECF 官方战队编号，限 1–30 个 ASCII 字符；如尚未取得编号，可查看右侧“如何获取？”。'}</p><p class="field-error" id="number-error" data-error="number" role="alert"></p></div>${field('name','战队名称',team.name,{required:true})}${field('group_name','战队组别',team.group_name,{type:'select',required:true,choices:groupChoices})}${field('school_name','学校/机构名称',team.school_name,{required:true})}${field('school_name_en','学校/机构名称（英文）',team.school_name_en,{full:true})}<div class="form-field full"><div class="field-label-row"><span class="field-label">教练信息（最多选择两名）<span class="required">*</span></span><a class="button button-secondary field-management-link" href="#/account/coaches">${icon('shield',17)}教练管理</a></div>${choiceCards(coaches,'coach_ids',selectedCoaches,(c)=>`${c.phone} · ${c.org_name}`)}<p class="helper" data-coach-count aria-live="polite"></p><p class="field-error" data-error="coach_ids" role="alert"></p></div><div class="form-field full"><div class="field-label-row"><span class="field-label">队员信息（多选）<span class="required">*</span></span><a class="button button-secondary field-management-link" href="#/account/members">${icon('users',17)}队员管理</a></div>${choiceCards(members,'member_ids',selectedMembers,(m)=>`${m.grade} · ${m.school}`)}<p class="field-error" data-error="member_ids" role="alert"></p></div><div class="form-field full"><label for="contact_coach_id">联系人（从已选教练中单选）<span class="required">*</span></label><select class="form-control" id="contact_coach_id" name="contact_coach_id" required><option value="">请先勾选教练</option>${coaches.filter((c)=>selectedCoaches.includes(c.id)).map((c)=>`<option value="${c.id}" ${c.id===team.contact_coach_id?'selected':''}>${escapeHtml(c.name)} · ${escapeHtml(c.phone)}</option>`).join('')}</select><p class="field-error" data-error="contact_coach_id" role="alert"></p></div>${field('address','单位地址',team.address,{full:true})}${field('address_en','单位地址（英文）',team.address_en,{full:true})}${field('province','省/直辖市',team.province)}${field('city','城市',team.city)}${field('nationality','国籍',team.nationality,{required:true})}</div><div class="form-actions"><a class="button button-secondary" href="#/account/teams">取消</a><button class="button button-primary" type="submit">${id?'保存战队':'创建战队'}</button></div></form></div></div>`;
  const actions=`<nav class="button-row portal-workflow-actions" aria-label="人员与战队创建快捷入口"><a class="button button-secondary" href="#/account/members/new">${icon('plus',17)}添加队员信息</a><a class="button button-secondary" href="#/account/coaches/new">${icon('plus',17)}添加教练信息</a></nav>`;
  app.innerHTML=portalShell(id?'编辑战队':'添加战队','战队资料会在报名确认与管理员审核时完整展示。',content,actions);
  const form=$('form[data-form="team"]');syncTeamNumberField(form);syncCoachChoiceLimit(form);
}

async function viewTeam(id) {
  const {team}=await apiFetch(`/api/teams/${id}`); teamSummaryModal(team);
}

async function viewAdminTeam(id) {
  const {team}=await apiFetch(`/api/admin/teams/${id}`); teamSummaryModal(team);
}

function adminTeamEditorFields(team, groupChoices) {
  const coaches=team.available_coaches||team.coaches||[];
  const members=team.available_members||team.members||[];
  const selectedCoaches=(team.coaches||[]).map((coach)=>coach.id);
  const selectedMembers=(team.members||[]).map((member)=>member.id);
  const numberPrefix=INNOVATION_GROUP_PREFIXES[team.group_name]||'';
  const numberMaxLength=numberPrefix?teamNumberSuffixMaxLength(numberPrefix):TEAM_NUMBER_MAX_LENGTH;
  const numberValue=teamNumberSuffix(team.number,team.group_name);
  return `<div class="form-grid"><div class="form-field"><label for="number">战队编号<span class="required">*</span> <a href="#/team-number" class="team-number-link">如何获取？</a></label><div class="team-number-control"><span class="team-number-prefix" data-team-number-prefix ${numberPrefix?'':'hidden'}>${escapeHtml(numberPrefix)}</span><input class="form-control" id="number" name="number" required maxlength="${numberMaxLength}" value="${escapeHtml(numberValue)}" placeholder="${numberPrefix?'填写自定义后缀':'填写 RECF 官方战队编号'}" aria-describedby="number-helper number-error"></div><p class="helper" id="number-helper" data-team-number-helper>${numberPrefix?`系统将自动添加 <strong>${escapeHtml(numberPrefix)}</strong> 前缀；最终编号限 1–30 个 ASCII 字符，不可包含空格或中文。最终编号：<strong data-team-number-preview>${escapeHtml(numberPrefix+numberValue)}</strong>`:'请填写 RECF 官方战队编号，限 1–30 个 ASCII 字符；如尚未取得编号，可查看右侧“如何获取？”。'}</p><p class="field-error" id="number-error" data-error="number" role="alert"></p></div>${field('name','战队名称',team.name,{required:true})}${field('group_name','战队组别',team.group_name,{type:'select',required:true,choices:groupChoices})}${field('school_name','学校/机构名称',team.school_name,{required:true})}${field('school_name_en','学校/机构名称（英文）',team.school_name_en,{full:true})}<div class="form-field full"><span class="field-label">教练信息（最多选择两名）<span class="required">*</span></span>${choiceCards(coaches,'coach_ids',selectedCoaches,(coach)=>`${coach.phone} · ${coach.org_name}`)}<p class="helper" data-coach-count aria-live="polite"></p><p class="field-error" data-error="coach_ids" role="alert"></p></div><div class="form-field full"><span class="field-label">队员信息（多选）<span class="required">*</span></span>${choiceCards(members,'member_ids',selectedMembers,(member)=>`${member.grade} · ${member.school}`)}<p class="field-error" data-error="member_ids" role="alert"></p></div><div class="form-field full"><label for="contact_coach_id">联系人（从已选教练中单选）<span class="required">*</span></label><select class="form-control" id="contact_coach_id" name="contact_coach_id" required><option value="">请先勾选教练</option>${coaches.filter((coach)=>selectedCoaches.includes(coach.id)).map((coach)=>`<option value="${coach.id}" ${coach.id===team.contact_coach_id?'selected':''}>${escapeHtml(coach.name)} · ${escapeHtml(coach.phone)}</option>`).join('')}</select><p class="field-error" data-error="contact_coach_id" role="alert"></p></div>${field('address','单位地址',team.address,{full:true})}${field('address_en','单位地址（英文）',team.address_en,{full:true})}${field('province','省/直辖市',team.province)}${field('city','城市',team.city)}${field('nationality','国籍',team.nationality,{required:true})}</div>`;
}

async function adminTeamFormPage(id) {
  if(!requireAdmin())return;
  const [{team},{events}]=await Promise.all([apiFetch(`/api/admin/teams/${id}`),apiFetch('/api/admin/events')]);
  const query=routeInfo().query.get('q')||'';
  const backHref=`#/admin/teams${query?`?q=${encodeURIComponent(query)}`:''}`;
  const groupChoices=teamGroupChoices(events,team.group_name);
  const content=`<div class="info-banner gap-bottom">${icon('info')}<div><strong>正在编辑 ${escapeHtml(team.owner_email)} 创建的战队。</strong><br>所属账号不会改变；修改后，相关已审核报名会重新进入待审核。</div></div><div class="card"><div class="card-body"><form data-form="admin-team" data-id="${team.id}" data-return-query="${escapeHtml(query)}" novalidate>${adminTeamEditorFields(team,groupChoices)}<div class="form-actions"><a class="button button-secondary" href="${backHref}">取消</a><button class="button button-primary" type="submit">保存战队</button></div></form></div></div>`;
  app.innerHTML=adminShell('编辑已有战队','管理员可修正战队编号、组别、学校及关联人员。',content);
  const form=$('form[data-form="admin-team"]');syncTeamNumberField(form);syncCoachChoiceLimit(form);
}

function teamNumberHelpPage() {
  app.innerHTML=`<section class="page-section team-number-guide-page"><div class="container"><nav class="breadcrumb"><a href="#/account/teams/new">创建战队</a>${icon('chevron',14)}<span>获取战队编号</span></nav><div class="page-head"><div><h1>如何获取战队编号？</h1><p class="lead">请根据您目前的战队编号情况选择对应方式。</p></div><a class="button button-secondary" href="#/account/teams/new">${icon('arrow',17)}返回创建战队</a></div><div class="team-number-help" aria-label="战队编号获取方式"><article class="help-path"><span class="step-num" aria-hidden="true">1</span><h2>已有官方编号</h2><p>已经取得 RECF 官方战队编号，可直接返回战队创建页面填写编号并完善战队资料。</p><a class="button button-primary" href="#/account/teams/new">填写战队编号${icon('arrow',17)}</a></article><article class="help-path"><span class="step-num" aria-hidden="true">2</span><h2>尚无官方战队编号</h2><p>按照 RECFEvents 官方流程注册机构和战队编号。本站已整理完整中文图文步骤，可在站内继续查看。</p><a class="button button-secondary" href="#/team-number/guide">查看图文注册教程${icon('arrow',17)}</a></article><article class="help-path"><span class="step-num" aria-hidden="true">3</span><h2>无官方战队编号注册条件</h2><p>无官方战队编号注册条件的战队，请联系赛事组委会提交学校/机构、教练和参赛组别信息，由组委会协助完成编号申请。</p><address class="committee-contact"><span><strong>联系人</strong>小周老师</span><span><strong>组委会邮箱</strong><a href="mailto:654849662@qq.com">654849662@qq.com</a></span><span><strong>咨询电话</strong><a href="tel:13761393714">13761393714</a></span></address></article></div></div></section>`;
}

async function teamNumberGuidePage() {
  const response = await fetch('/content/recf-team-registration-guide.md', { cache: 'no-store' });
  if (!response.ok) throw new Error('战队编号获取指南加载失败');
  const guideMarkdown = await response.text();
  app.innerHTML=`<section class="page-section team-number-guide-page"><div class="container"><nav class="breadcrumb"><a href="#/team-number">如何获取战队编号</a>${icon('chevron',14)}<span>图文注册教程</span></nav><div class="page-head"><div><h1>RECFEvents 图文注册教程</h1><p class="lead">按步骤创建账号、机构与战队编号，完成后返回本平台填写。</p></div><a class="button button-secondary" href="#/team-number">${icon('arrow',17)}返回获取方式</a></div><article class="team-number-guide-document"><div class="markdown-body guide-markdown">${renderMarkdown(guideMarkdown)}</div></article></div></section>`;
}

function registrationActions(r) {
  const refundStatus=r.refund_status||'none';
  const canEdit=r.status!=='approved'&&!r.cancelled_at&&!['requested','approved'].includes(refundStatus);
  const canDelete=canEdit&&refundStatus==='none';
  return `<div class="cell-actions"><button class="button button-secondary button-small" type="button" data-action="view-registration" data-id="${r.id}">${icon('eye',16)}查看</button>${canEdit?`<button class="button button-secondary button-small" type="button" data-action="edit-registration" data-id="${r.id}">${icon('edit',16)}编辑</button>`:''}${canDelete?`<button class="button button-danger-ghost button-small" type="button" data-action="delete-registration" data-id="${r.id}">${icon('trash',16)}删除</button>`:''}${r.can_reapply?`<button class="button button-secondary button-small" type="button" data-action="reapply-registration" data-id="${r.id}">${icon('arrow',16)}重新申请参赛</button>`:''}${r.can_request_refund?`<button class="button button-secondary button-small" type="button" data-action="request-refund" data-id="${r.id}">${icon('wallet',16)}${refundStatus==='rejected'?'重新申请退费':'申请退费'}</button>`:''}${r.can_cancel?`<button class="button button-danger-ghost button-small" type="button" data-action="cancel-registration" data-id="${r.id}">${icon('close',16)}取消比赛</button>`:''}</div>`;
}

async function registrationsPage() {
  if(!requireUser())return;
  const {registrations}=await apiFetch('/api/registrations');
  if(!registrations.length){const content=`<div class="empty-state"><div class="empty-icon">${icon('trophy',30)}</div><h3>还没有参赛记录</h3><p>完成战队创建后，在赛事详情页选择战队并上传付款凭证。</p><a class="button button-primary" href="#/events">浏览赛事</a></div>`;app.innerHTML=portalShell('我的比赛','按赛事查看名下所有参赛战队及审核状态。',content,`<a class="button button-primary" href="#/events">${icon('plus')}比赛报名</a>`);return;}
  const grouped=[...registrations.reduce((map,r)=>{if(!map.has(r.event_id))map.set(r.event_id,{event_id:r.event_id,title:r.event_title,starts_at:r.starts_at,ends_at:r.ends_at,time_status:r.event_time_status,rows:[]});map.get(r.event_id).rows.push(r);return map;},new Map()).values()];
  const selectedId=Number(routeInfo().query.get('event'));
  const selected=grouped.find((item)=>item.event_id===selectedId);
  if(selected){
    const desktop=`<div class="desktop-table data-table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>参赛组别</th><th>参赛战队</th><th class="status-cell">报名状态</th><th class="status-cell">退费状态</th><th>操作</th></tr></thead><tbody>${selected.rows.map((r)=>`<tr><td class="number">${r.id}</td><td>${escapeHtml(r.group_name)}</td><td>${escapeHtml(r.team_number)} · ${escapeHtml(r.team_name)}</td><td class="status-cell">${badge(registrationStatusMeta(r))}</td><td class="status-cell">${badge(refundStatusMeta(r.refund_status))}</td><td>${registrationActions(r)}</td></tr>`).join('')}</tbody></table></div>`;
    const mobile=`<div class="mobile-list">${selected.rows.map((r)=>`<article class="entity-card"><div class="entity-card-head"><h3>${escapeHtml(r.team_number)} · ${escapeHtml(r.team_name)}</h3>${badge(registrationStatusMeta(r))}</div><dl><div><dt>参赛组别</dt><dd>${escapeHtml(r.group_name)}</dd></div><div><dt>报名编号</dt><dd>${r.id}</dd></div><div><dt>退费状态</dt><dd>${badge(refundStatusMeta(r.refund_status))}</dd></div></dl>${registrationActions(r)}</article>`).join('')}</div>`;
    const heading=`<div class="card card-stack"><div class="card-header"><div><h2>${escapeHtml(selected.title)}</h2><p class="muted">${formatDate(selected.starts_at)} — ${formatDate(selected.ends_at)}</p></div>${badge(eventStatusMeta(selected.time_status))}</div><div class="card-body">${desktop}${mobile}</div></div>`;
    app.innerHTML=portalShell('参赛战队列表','查看同一赛事下提交的多支战队与各自审核状态。',heading,`<a class="button button-secondary" href="#/account/registrations">${icon('arrow')}返回赛事列表</a>`);return;
  }
  const content=`<div class="desktop-table data-table-wrap"><table class="data-table"><thead><tr><th>赛事 ID</th><th>比赛项目</th><th>参赛时间</th><th class="status-cell">赛事状态</th><th>报名战队</th><th>操作</th></tr></thead><tbody>${grouped.map((event)=>`<tr><td class="number">${event.event_id}</td><td><a href="#/events/${event.event_id}">${escapeHtml(event.title)}</a></td><td>${formatDate(event.starts_at)} — ${formatDate(event.ends_at)}</td><td class="status-cell">${badge(eventStatusMeta(event.time_status))}</td><td>${event.rows.length} 支</td><td><a class="button button-secondary button-small" href="#/account/registrations?event=${event.event_id}">打开列表</a></td></tr>`).join('')}</tbody></table></div><div class="mobile-list">${grouped.map((event)=>`<article class="entity-card"><div class="entity-card-head"><h3>${escapeHtml(event.title)}</h3>${badge(eventStatusMeta(event.time_status))}</div><dl><div><dt>参赛时间</dt><dd>${formatDate(event.starts_at)} — ${formatDate(event.ends_at)}</dd></div><div><dt>报名战队</dt><dd>${event.rows.length} 支</dd></div></dl><a class="button button-secondary button-small" href="#/account/registrations?event=${event.event_id}">打开列表</a></article>`).join('')}</div>`;
  app.innerHTML=portalShell('我的比赛','未开始赛事优先，其次按开赛时间与赛事 ID 排序。',content,`<a class="button button-primary" href="#/events">${icon('plus')}比赛报名</a>`);
}

function detailRows(items) { return `<div class="detail-list">${items.map(([label,value])=>`<div class="detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value||'—')}</strong></div>`).join('')}</div>`; }

function adminReviewFooter(kind,id,status) {
  const action=kind==='activity'?'activity-review-open':'review-open';
  const reject=status==='approved'?`<button class="button button-danger-ghost" type="button" data-action="${action}" data-status="rejected" data-id="${id}">改为驳回</button>`:status==='pending'?`<button class="button button-danger-ghost" type="button" data-action="${action}" data-status="rejected" data-id="${id}">驳回</button>`:'';
  const approve=status==='rejected'?`<button class="button button-accent" type="button" data-action="${action}" data-status="approved" data-id="${id}">改为通过</button>`:status==='pending'?`<button class="button button-accent" type="button" data-action="${action}" data-status="approved" data-id="${id}">通过</button>`:'';
  return `<button class="button button-secondary" type="button" data-action="close-modal">关闭</button>${reject}${approve}`;
}

function userRegistrationFooter(registration) {
  return `<button class="button button-secondary" type="button" data-action="close-modal">关闭</button>${registration.can_reapply?`<button class="button button-secondary" type="button" data-action="reapply-registration" data-id="${registration.id}">${icon('arrow',17)}重新申请参赛</button>`:''}${registration.can_request_refund?`<button class="button button-secondary" type="button" data-action="request-refund" data-id="${registration.id}">${icon('wallet',17)}${registration.refund_status==='rejected'?'重新申请退费':'申请退费'}</button>`:''}${registration.can_cancel?`<button class="button button-danger-ghost" type="button" data-action="cancel-registration" data-id="${registration.id}">${icon('close',17)}取消比赛</button>`:''}`;
}

function adminRegistrationFooter(registration) {
  const refundStatus=registration.refund_status||'none';
  const normalReview=registration.cancelled_at||refundStatus==='approved'?'':adminReviewFooter('registration',registration.id,registration.status).replace('<button class="button button-secondary" type="button" data-action="close-modal">关闭</button>','');
  const rejectRefund=['requested','approved'].includes(refundStatus)?`<button class="button button-danger-ghost" type="button" data-action="refund-review-open" data-status="rejected" data-id="${registration.id}">${refundStatus==='approved'?'改为拒绝退费':'拒绝退费'}</button>`:'';
  const approveRefund=['requested','rejected'].includes(refundStatus)?`<button class="button button-accent" type="button" data-action="refund-review-open" data-status="approved" data-id="${registration.id}">${refundStatus==='rejected'?'改为同意退费':'同意退费'}</button>`:'';
  return `<button class="button button-secondary" type="button" data-action="close-modal">关闭</button>${normalReview}${rejectRefund}${approveRefund}`;
}

async function viewRegistration(id, admin=false) {
  const {registration:r}=await apiFetch(admin ? `/api/admin/registrations/${id}` : `/api/registrations/${id}`);
  const status=registrationStatusMeta(r);
  const team=r.team;
  const processRows=[['报名状态',status.label],['原审核状态',reviewStatusMeta(r.status).label],['报名截止',formatDate(r.event.registration_end,true)],['截止提交退费申请日期',refundDeadlineLabel(r.event.registration_end,r.event.refund_deadline_days)],['驳回原因',r.rejection_reason||'—'],['报名取消状态',r.cancelled_at?'已取消':'未取消'],['报名取消时间',r.cancelled_at?formatDate(r.cancelled_at,true):'—'],['报名取消原因',r.cancellation_reason||'—'],['退费状态',refundStatusMeta(r.refund_status).label],['退费原因',r.refund_reason||'—'],['退费申请时间',r.refund_requested_at?formatDate(r.refund_requested_at,true):'—'],['退费处理说明',r.refund_note||'—'],['退费处理时间',r.refund_reviewed_at?formatDate(r.refund_reviewed_at,true):'—']];
  openModal('报名详细信息',`<div class="detail-section"><h3>赛项与办理状态</h3>${detailRows([['比赛项目',r.event.title],['参赛组别',r.group_name],...processRows])}<img class="proof-image" src="${safeUrl(r.payment_proof_url)}" alt="参赛费支付凭证"></div><div class="detail-section"><h3>战队信息</h3>${detailRows([['战队名称',team.name],['战队编号',team.number],['战队组别',team.group_name],['学校/机构',team.school_name],['国籍',team.nationality]])}</div><div class="detail-section"><h3>教练信息</h3><div class="data-table-wrap"><table class="data-table"><thead><tr><th>姓名</th><th>电话</th><th>单位</th><th>邮箱</th></tr></thead><tbody>${team.coaches.map((c)=>`<tr><td>${escapeHtml(c.name)} ${c.id===team.contact_coach_id?'<span class="badge badge-approved">联系人</span>':''}</td><td>${escapeHtml(c.phone)}</td><td>${escapeHtml(c.org_name)}</td><td>${escapeHtml(c.email)}</td></tr>`).join('')}</tbody></table></div></div><div class="detail-section"><h3>队员信息</h3><div class="data-table-wrap"><table class="data-table"><thead><tr><th>照片</th><th>姓名</th><th>性别</th><th>年级</th><th>学校</th><th>身份证号</th><th>电话</th></tr></thead><tbody>${team.members.map((m)=>`<tr><td><img class="table-photo" src="${safeUrl(m.photo_url)}" alt="${escapeHtml(m.name)}照片"></td><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.gender)}</td><td>${escapeHtml(m.grade)}</td><td>${escapeHtml(m.school)}</td><td>${escapeHtml(m.id_number)}</td><td>${escapeHtml(m.phone)}</td></tr>`).join('')}</tbody></table></div></div>`,admin?adminRegistrationFooter(r):userRegistrationFooter(r),'wide');
}

async function editRegistration(id) {
  const [{registration:r},{teams}]=await Promise.all([apiFetch(`/api/registrations/${id}`),apiFetch('/api/teams')]);
  const teamOptions=teams.map((team)=>`<option value="${team.id}" data-group="${escapeHtml(team.group_name)}" ${team.id===r.team_id?'selected':''} ${team.group_name!==r.group_name?'hidden disabled':''}>${escapeHtml(team.number)} · ${escapeHtml(team.name)}</option>`).join('');
  openModal('编辑报名信息',`<form data-form="registration-edit" data-id="${id}" novalidate><div class="info-banner">${icon('info')}<div>修改参赛组别、战队或付款凭证后，报名状态将重新变为“待审核”。</div></div><div class="form-grid gap-top">${field('group_name','参赛组别',r.group_name,{type:'select',required:true,choices:r.event.groups.map((group)=>[group,group])})}<div class="form-field"><label for="edit_team_id">参赛战队<span class="required" aria-hidden="true">*</span></label><select class="form-control" id="edit_team_id" name="team_id" required><option value="">请选择参赛战队</option>${teamOptions}</select><p class="helper">战队组别必须与参赛组别一致。</p><p class="field-error" data-error="team_id" role="alert"></p></div>${filePicker('payment_proof_url','参赛费支付凭证',r.payment_proof_url,'payment',true)}</div><div class="form-actions"><button class="button button-secondary" type="button" data-action="close-modal">取消</button><button class="button button-primary" type="submit">保存并重新提交</button></div></form>`,'','wide');
}

async function reapplyRegistrationModal(id) {
  const [{registration:r},{teams}]=await Promise.all([apiFetch(`/api/registrations/${id}`),apiFetch('/api/teams')]);
  const teamOptions=teams.map((team)=>`<option value="${team.id}" data-group="${escapeHtml(team.group_name)}" ${team.id===r.team_id?'selected':''} ${team.group_name!==r.group_name?'hidden disabled':''}>${escapeHtml(team.number)} · ${escapeHtml(team.name)}</option>`).join('');
  const refunded=r.refund_status==='approved';
  const proofValue=refunded?'':r.payment_proof_url;
  const note=refunded
    ? '<strong>该报名退费已同意。</strong><br>重新申请参赛需要重新上传参赛费支付凭证。'
    : '<strong>重新申请后将恢复为待审核。</strong><br>可沿用当前付款凭证，也可以重新上传替换。';
  openModal('重新申请参赛',`<form data-form="registration-reapply" data-id="${id}" novalidate><div class="${refunded?'warning-banner ':''}info-banner">${icon(refunded?'alert':'info')}<div>${note}</div></div><div class="form-grid gap-top">${field('group_name','参赛组别',r.group_name,{type:'select',required:true,choices:r.event.groups.map((group)=>[group,group])})}<div class="form-field"><label for="reapply_team_id">参赛战队<span class="required" aria-hidden="true">*</span></label><select class="form-control" id="reapply_team_id" name="team_id" required><option value="">请选择参赛战队</option>${teamOptions}</select><p class="helper">战队组别必须与参赛组别一致。</p><p class="field-error" data-error="team_id" role="alert"></p></div>${filePicker('payment_proof_url','参赛费支付凭证',proofValue,'payment',true)}</div><div class="form-actions"><button class="button button-secondary" type="button" data-action="close-modal">取消</button><button class="button button-primary" type="submit">确认重新申请参赛</button></div></form>`,'','wide');
}

async function adminDashboardPage() {
  if(!requireAdmin())return; const [{summary},{registrations}]=await Promise.all([apiFetch('/api/admin/summary'),apiFetch('/api/admin/registrations?status=pending')]);
  const recent=registrations.slice(0,5);
  const content=`<div class="summary-grid"><div class="summary-card primary"><span>赛事总数</span><strong>${summary.events}</strong></div><div class="summary-card warning"><span>赛事报名待审</span><strong>${summary.pending}</strong></div><div class="summary-card accent"><span>活动报名待审</span><strong>${summary.activity_pending}</strong></div><a class="summary-card summary-card-link" href="#/admin/users"><span>注册用户</span><strong>${summary.users}</strong></a><a class="summary-card summary-card-link" href="#/admin/teams"><span>已有战队</span><strong>${summary.teams}</strong></a></div><div class="card"><div class="card-header"><h2>待审核队伍</h2><div class="button-row"><a class="button button-secondary button-small" href="#/admin/activity-applications?status=pending">活动报名审核</a><a class="button button-secondary button-small" href="#/admin/reviews">查看队伍报名</a></div></div><div class="card-body">${recent.length?`<div class="data-table-wrap"><table class="data-table"><thead><tr><th>赛事</th><th>战队</th><th>报名用户</th><th>提交时间</th><th>操作</th></tr></thead><tbody>${recent.map((r)=>`<tr><td>${escapeHtml(r.event_title)}</td><td>${escapeHtml(r.team_number)} · ${escapeHtml(r.team_name)}</td><td>${escapeHtml(r.user_email)}</td><td>${formatDate(r.created_at,true)}</td><td><button class="button button-primary button-small" type="button" data-action="admin-view-registration" data-id="${r.id}">审核</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty-state"><div class="empty-icon">${icon('check',30)}</div><h3>暂无待审核队伍</h3><p>新的赛事报名提交后会出现在这里。</p></div>`}</div></div>`;
  app.innerHTML=adminShell('管理概览','掌握赛事管理、队伍与活动报名审核及用户规模。',content,`<a class="button button-primary" href="#/admin/events/new">${icon('plus')}发布赛事</a>`);
}

function adminEventActions(event) {
  return `<div class="cell-actions"><a class="button button-secondary button-small" href="#/events/${event.id}" target="_blank">${icon('eye',16)}前台</a><a class="button button-secondary button-small" href="/api/admin/events/${event.id}/export" download title="按参赛组别导出全部报名">${icon('download',16)}导出全部</a><a class="button button-secondary button-small" href="/api/admin/events/${event.id}/export?scope=approved" download title="按参赛组别导出审核通过赛队">${icon('download',16)}导出已通过</a><a class="button button-secondary button-small" href="/api/admin/events/${event.id}/export?scope=cancelled" download title="按参赛组别导出已驳回或已取消参赛赛队">${icon('download',16)}导出取消参赛</a><a class="button button-secondary button-small" href="#/admin/events/${event.id}/edit">${icon('edit',16)}编辑</a><button class="button button-danger-ghost button-small" type="button" data-action="delete-admin-event" data-id="${event.id}" data-label="${escapeHtml(event.title)}">${icon('trash',16)}删除赛事</button></div>`;
}

async function adminEventsPage() {
  if(!requireAdmin())return; const {events}=await apiFetch('/api/admin/events');
  const content=events.length?`<div class="desktop-table data-table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>赛事名称</th><th>发布时间</th><th>比赛时间</th><th>状态</th><th>操作</th></tr></thead><tbody>${events.map((e)=>`<tr><td>${e.id}</td><td><strong>${escapeHtml(e.title)}</strong></td><td>${formatDate(e.published_at,true)}</td><td>${formatDate(e.starts_at)} — ${formatDate(e.ends_at)}</td><td>${e.status==='draft'?badge({label:'草稿',className:'badge-draft'}):badge(eventStatusMeta(e.time_status))}</td><td>${adminEventActions(e)}</td></tr>`).join('')}</tbody></table></div><div class="mobile-list">${events.map((e)=>`<article class="entity-card"><div class="entity-card-head"><h3>${escapeHtml(e.title)}</h3>${e.status==='draft'?badge({label:'草稿',className:'badge-draft'}):badge(eventStatusMeta(e.time_status))}</div><dl><div><dt>发布时间</dt><dd>${formatDate(e.published_at,true)}</dd></div><div><dt>比赛时间</dt><dd>${formatDate(e.starts_at)} — ${formatDate(e.ends_at)}</dd></div></dl>${adminEventActions(e)}</article>`).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">${icon('calendar',30)}</div><h3>暂无赛事</h3><p>创建赛事并发布后，用户即可在前台浏览与报名。</p></div>`;
  app.innerHTML=adminShell('赛事管理','未开始赛事优先展示，再按比赛开始时间、赛事名称和 ID 升序排列。',content,`<a class="button button-primary" href="#/admin/events/new">${icon('plus')}发布赛事</a>`);
}

function adminTeamActions(team,query='') {
  const suffix=query?`?q=${encodeURIComponent(query)}`:'';
  return `<div class="cell-actions"><button class="button button-secondary button-small" type="button" data-action="admin-view-team" data-id="${team.id}">${icon('eye',16)}查看</button><a class="button button-secondary button-small" href="#/admin/teams/${team.id}/edit${suffix}">${icon('edit',16)}编辑</a><button class="button button-danger-ghost button-small" type="button" data-action="delete-admin-team" data-id="${team.id}" data-label="${escapeHtml(`${team.number} · ${team.name}`)}">${icon('trash',16)}删除</button></div>`;
}

async function adminTeamsPage() {
  if(!requireAdmin())return;
  const query=routeInfo().query.get('q')||'';
  const params=new URLSearchParams();if(query)params.set('q',query);
  const {teams}=await apiFetch(`/api/admin/teams${params.size?`?${params}`:''}`);
  const search=adminSearchForm(query,'按战队编号、名称、学校、账号、教练或队员搜索');
  const resultNote=`<div class="result-note" aria-live="polite"><span>${query?`找到 ${teams.length} 支匹配战队`:`共 ${teams.length} 支已创建战队`}</span><small>显示所有报名账号创建的战队资料</small></div>`;
  const content=`${search}${resultNote}${teams.length?`<div class="desktop-table data-table-wrap"><table class="data-table admin-team-table"><thead><tr><th>战队</th><th>组别</th><th>学校/机构</th><th>所属账号</th><th>人员与报名</th><th>操作</th></tr></thead><tbody>${teams.map((team)=>`<tr><td><strong class="nowrap">${escapeHtml(team.number)}</strong><br><small class="muted">${escapeHtml(team.name)}</small></td><td>${escapeHtml(team.group_name)}</td><td>${escapeHtml(team.school_name)}</td><td>${escapeHtml(team.owner_email)}</td><td><span class="nowrap">${team.coach_count} 教练 / ${team.member_count} 队员</span><br><small class="muted">${team.registration_count} 次报名</small></td><td>${adminTeamActions(team,query)}</td></tr>`).join('')}</tbody></table></div><div class="mobile-list">${teams.map((team)=>`<article class="entity-card"><div class="entity-card-head"><div><span class="record-label">${escapeHtml(team.number)}</span><h3>${escapeHtml(team.name)}</h3></div><span class="badge badge-upcoming">${escapeHtml(team.group_name)}</span></div><dl><div><dt>学校/机构</dt><dd>${escapeHtml(team.school_name)}</dd></div><div><dt>所属账号</dt><dd>${escapeHtml(team.owner_email)}</dd></div><div><dt>人员</dt><dd>${team.coach_count} 名教练 / ${team.member_count} 名队员</dd></div><div><dt>累计报名</dt><dd>${team.registration_count} 次</dd></div></dl>${adminTeamActions(team,query)}</article>`).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">${icon('flag',30)}</div><h3>${query?'没有匹配的战队':'尚无已创建战队'}</h3><p>${query?'请尝试搜索战队编号、名称、学校或人员姓名。':'用户创建战队后会自动显示在这里。'}</p></div>`}`;
  app.innerHTML=adminShell('已有战队管理','跨报名账号查询战队、教练、队员与累计报名资料。',content);
}

function adminUserActions(user, query = '') {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
  const canDelete = Number(user.id) !== Number(state.user?.id) && normalizedAdminLevel(user) !== 'super';
  return `<a class="button button-secondary button-small" href="#/admin/users/${user.id}${suffix}">${icon('eye',16)}查看完整资料</a>${canDelete ? `<button class="button button-danger-ghost button-small" type="button" data-action="delete-admin-user" data-id="${user.id}" data-label="${escapeHtml(user.username)}">${icon('trash',16)}删除用户</button>` : ''}`;
}

function normalizedAdminLevel(user) {
  return user?.role === 'admin' ? (user.admin_level === 'super' ? 'super' : 'mid') : 'none';
}

function userRoleLabel(user) {
  const level = normalizedAdminLevel(user);
  return level === 'super' ? '最高管理员' : level === 'mid' ? '中级管理员' : '普通用户';
}

function userRoleBadge(user) {
  const level = normalizedAdminLevel(user);
  const className = level === 'super' ? 'badge-super-admin' : level === 'mid' ? 'badge-admin' : 'badge-user';
  return `<span class="badge ${className}">${userRoleLabel(user)}</span>`;
}

function adminUserRoleAction(user) {
  const targetLevel = normalizedAdminLevel(user);
  const actorLevel = normalizedAdminLevel(state.user);
  if (Number(user.id) === Number(state.user?.id)) {
    return '<span class="muted current-admin-note">当前登录账号不能修改自己的权限</span>';
  }
  if (targetLevel === 'super' && actorLevel !== 'super') {
    return '<span class="muted current-admin-note">最高管理员权限受保护</span>';
  }
  const button = (level,label,className='button-secondary') => `<button class="button ${className}" type="button" data-action="change-user-role" data-id="${user.id}" data-admin-level="${level}" data-username="${escapeHtml(user.username)}">${icon('shield',17)}${label}</button>`;
  if (targetLevel === 'none') return button('mid','添加为中级管理员','button-primary');
  if (targetLevel === 'mid') {
    const promote = actorLevel === 'super' ? button('super','提升为最高管理员','button-primary') : '';
    return `${promote}${button('none','撤销管理员','button-danger-ghost')}`;
  }
  return button('mid','降为中级管理员','button-danger-ghost');
}

function adminUserRolePanel(user) {
  const level = normalizedAdminLevel(user);
  const description = level === 'super'
    ? '该账号拥有最高管理员权限；中级管理员不能撤销其权限。'
    : level === 'mid'
      ? '该账号拥有现有管理后台权限；最高管理员可以将其提升为最高管理员。'
      : '添加后，该账号将获得中级管理员权限，可使用现有管理后台功能。';
  const canDelete = Number(user.id) !== Number(state.user?.id) && normalizedAdminLevel(user) !== 'super';
  const deleteButton = canDelete ? `<button class="button button-danger-ghost" type="button" data-action="delete-admin-user" data-id="${user.id}" data-label="${escapeHtml(user.username)}">${icon('trash',17)}删除用户</button>` : '';
  return `<section class="user-role-panel" aria-label="管理员权限操作"><div class="user-role-panel-copy"><strong>账号权限：${userRoleLabel(user)}</strong><p>${description}</p></div><div class="user-role-actions">${adminUserRoleAction(user)}${deleteButton}</div></section>`;
}

async function adminUsersPage() {
  if (!requireAdmin()) return;
  const query = routeInfo().query.get('q') || '';
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  const { users } = await apiFetch(`/api/admin/users${params.size ? `?${params}` : ''}`);
  const search = adminSearchForm(query, '搜索用户名、昵称、邮箱、战队编号/名称、教练员或学生姓名');
  const resultNote = `<div class="result-note" aria-live="polite"><span>${query ? `找到 ${users.length} 个匹配用户` : `共 ${users.length} 个用户账号`}</span><small>按最高管理员、中级管理员、普通用户排序</small></div>`;
  const content = `${search}${resultNote}${users.length ? `<div class="desktop-table data-table-wrap"><table class="data-table admin-user-table"><thead><tr><th>用户</th><th>权限</th><th>邮箱 / 手机号</th><th>单位</th><th>关联资料</th><th>注册时间</th><th>操作</th></tr></thead><tbody>${users.map((user)=>`<tr><td><strong>${escapeHtml(user.username)}</strong><br><small class="muted">${escapeHtml(user.nickname || '未填写昵称')}</small></td><td>${userRoleBadge(user)}</td><td>${escapeHtml(user.email)}<br><small class="muted">${escapeHtml(user.phone || '未填写手机号')}</small></td><td>${escapeHtml(user.org_name || '未填写')}</td><td><span class="nowrap">${user.team_count} 战队 / ${user.coach_count} 教练 / ${user.member_count} 学生</span><br><small class="muted">${user.registration_count} 条参赛报名</small></td><td>${formatDate(user.created_at,true)}</td><td>${adminUserActions(user,query)}</td></tr>`).join('')}</tbody></table></div><div class="mobile-list">${users.map((user)=>`<article class="entity-card"><div class="entity-card-head"><div><span class="record-label">${escapeHtml(user.username)}</span><h3>${escapeHtml(user.nickname || '未填写昵称')}</h3></div>${userRoleBadge(user)}</div><dl><div><dt>邮箱</dt><dd>${escapeHtml(user.email)}</dd></div><div><dt>手机号</dt><dd>${escapeHtml(user.phone || '未填写')}</dd></div><div><dt>战队</dt><dd>${user.team_count} 支</dd></div><div><dt>关联人员</dt><dd>${user.coach_count} 名教练 / ${user.member_count} 名学生</dd></div><div><dt>参赛报名</dt><dd>${user.registration_count} 条</dd></div><div><dt>注册时间</dt><dd>${formatDate(user.created_at,true)}</dd></div></dl>${adminUserActions(user,query)}</article>`).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">${icon('user',30)}</div><h3>${query ? '没有匹配的用户' : '尚无用户账号'}</h3><p>${query ? '可搜索用户名、昵称、邮箱、战队、教练员或学生姓名。' : '用户完成注册后会显示在这里。'}</p></div>`}`;
  app.innerHTML = adminShell('管理用户','查询用户权限及其战队、赛事、教练员和学生资料。',content);
}

async function adminUserDetailPage(id) {
  if (!requireAdmin()) return;
  const { user } = await apiFetch(`/api/admin/users/${id}`);
  const query = routeInfo().query.get('q') || '';
  const backHref = `#/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`;
  const names = (items) => items.length ? items.map((item)=>escapeHtml(item.name)).join('、') : '—';
  const metrics = `<div class="summary-grid user-detail-metrics"><div class="summary-card"><span>战队</span><strong>${user.teams.length}</strong></div><div class="summary-card"><span>教练员</span><strong>${user.coaches.length}</strong></div><div class="summary-card"><span>学生</span><strong>${user.members.length}</strong></div><div class="summary-card"><span>参赛报名</span><strong>${user.registrations.length}</strong></div></div>`;
  const account = `<div class="card"><div class="card-header"><h2>注册与账户信息</h2><span class="record-label">用户 ID ${user.id}</span></div><div class="card-body">${detailRows([['用户名',user.username],['昵称',user.nickname],['账号权限',userRoleLabel(user)],['邮箱',user.email],['注册手机号',user.phone],['联系人',user.contact_name],['身份证号码',user.id_number],['单位名称',user.org_name],['单位地址',user.org_address],['单位简介',user.org_intro],['注册时间',formatDate(user.created_at,true)]])}${adminUserRolePanel(user)}</div></div>`;
  const teams = `<div class="card card-stack"><div class="card-header"><h2>注册战队</h2><span class="muted">${user.teams.length} 支</span></div><div class="card-body">${user.teams.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>战队</th><th>组别</th><th>学校/机构</th><th>教练员</th><th>学生</th></tr></thead><tbody>${user.teams.map((team)=>`<tr><td><strong>${escapeHtml(team.number)}</strong><br><small class="muted">${escapeHtml(team.name)}</small></td><td>${escapeHtml(team.group_name)}</td><td>${escapeHtml(team.school_name)}</td><td>${names(team.coaches)}</td><td>${names(team.members)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">该用户尚未创建战队。</p>'}</div></div>`;
  const registrations = `<div class="card card-stack"><div class="card-header"><h2>参赛赛项</h2><span class="muted">${user.registrations.length} 条</span></div><div class="card-body">${user.registrations.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>赛事</th><th>参赛战队</th><th>组别</th><th>状态</th><th>提交时间</th></tr></thead><tbody>${user.registrations.map((registration)=>`<tr><td><a href="#/events/${registration.event_id}">${escapeHtml(registration.event_title)}</a><br><small class="muted">${formatDate(registration.starts_at)} — ${formatDate(registration.ends_at)}</small></td><td>${escapeHtml(registration.team_number)} · ${escapeHtml(registration.team_name)}</td><td>${escapeHtml(registration.group_name)}</td><td>${badge(reviewStatusMeta(registration.status))}</td><td>${formatDate(registration.created_at,true)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">该用户尚无参赛报名。</p>'}</div></div>`;
  const coaches = `<div class="card card-stack"><div class="card-header"><h2>教练员</h2><span class="muted">${user.coaches.length} 名</span></div><div class="card-body">${user.coaches.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>姓名</th><th>性别</th><th>电话</th><th>单位</th><th>邮箱</th><th>地区 / 国籍</th></tr></thead><tbody>${user.coaches.map((coach)=>`<tr><td>${escapeHtml(coach.name)}</td><td>${escapeHtml(coach.gender)}</td><td>${escapeHtml(coach.phone)}</td><td>${escapeHtml(coach.org_name)}</td><td>${escapeHtml(coach.email)}</td><td>${escapeHtml([coach.province,coach.city,coach.nationality].filter(Boolean).join(' / '))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">该用户尚未添加教练员。</p>'}</div></div>`;
  const members = `<div class="card card-stack"><div class="card-header"><h2>学生 / 队员</h2><span class="muted">${user.members.length} 名</span></div><div class="card-body">${user.members.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>姓名</th><th>性别</th><th>年级</th><th>学校</th><th>身份证号</th><th>电话</th><th>地区 / 国籍</th></tr></thead><tbody>${user.members.map((member)=>`<tr><td>${escapeHtml(member.name)}</td><td>${escapeHtml(member.gender)}</td><td>${escapeHtml(member.grade)}</td><td>${escapeHtml(member.school)}</td><td>${escapeHtml(member.id_number)}</td><td>${escapeHtml(member.phone)}</td><td>${escapeHtml([member.province,member.city,member.nationality].filter(Boolean).join(' / '))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">该用户尚未添加学生。</p>'}</div></div>`;
  app.innerHTML = adminShell(`用户：${user.username}`,'查看该账号关联的完整业务资料与权限。',`${metrics}${account}${teams}${registrations}${coaches}${members}`,`<a class="button button-secondary" href="${backHref}">${icon('arrow',17)}返回用户列表</a>`);
}

async function adminEventFormPage(id) {
  if(!requireAdmin())return; let event={groups:[...DEFAULT_TEAM_GROUPS],status:'published',published_at:new Date().toISOString(),contact_name:'小周老师',contact_phone:'13761393714',payee:'上海瑞卜德教育科技有限公司',account_no:'153189255',bank_code:'',bank_name:'中国民生银行股份有限公司上海凯旋支行',allow_volunteer:false,allow_spectator:false,refund_deadline_days:10};
  if(id){const data=await apiFetch('/api/admin/events');event=data.events.find((item)=>item.id===Number(id));if(!event)throw new Error('未找到赛事');}
  const groupValue=(event.groups||[]).join('\n');
  const content=`<div class="card"><div class="card-header"><h2>赛事基本信息</h2></div><div class="card-body"><form data-form="admin-event" data-id="${id||''}" novalidate><div class="form-grid">${field('title','赛事名称',event.title,{required:true,full:true,maxlength:200})}${field('published_at','发布时间',toInputDate(event.published_at),{type:'datetime-local',required:true})}${field('status','发布状态',event.status,{type:'select',required:true,choices:[['published','立即发布'],['draft','保存为草稿']]})}${filePicker('image_url','赛事图片',event.image_url,'event',false)}${field('description','赛事介绍',event.description,{type:'textarea',required:true,full:true})}${field('starts_at','赛事开始时间',toInputDate(event.starts_at),{type:'datetime-local',required:true})}${field('ends_at','赛事结束时间',toInputDate(event.ends_at),{type:'datetime-local',required:true})}${field('contact_name','联系人',event.contact_name,{required:true})}${field('contact_phone','电话',event.contact_phone,{type:'tel',required:true,inputmode:'tel'})}${field('location','比赛地点',event.location,{required:true,full:true})}${field('registration_start','报名开始时间',toInputDate(event.registration_start),{type:'datetime-local',required:true})}${field('registration_end','报名结束时间',toInputDate(event.registration_end),{type:'datetime-local',required:true})}${field('refund_deadline_days','报名截止前多少天停止退费申请',event.refund_deadline_days??10,{type:'number',required:true,min:0,max:365,step:1,inputmode:'numeric',helper:'默认 10 天；按报名截止日期向前计算，并允许提交至该日 24:00。'})}<div class="form-field"><label for="refund_deadline_preview">截止提交退费申请日期</label><input class="form-control refund-deadline-preview" id="refund_deadline_preview" type="text" readonly aria-readonly="true" data-refund-deadline-preview><p class="helper" aria-live="polite" data-refund-deadline-helper>系统将根据报名截止日期与提前天数自动计算。</p></div>${field('groups_text','参赛组别（每行一个）',groupValue,{type:'textarea',required:true,full:true,helper:'可在默认组别基础上新增未来赛季组别；每行填写一个组别。'})}${eventActivitySettings(event)}</div><hr class="divider"><h2>收款信息</h2><div class="form-grid">${field('payee','付款户名',event.payee,{required:true})}${field('account_no','收款账号',event.account_no,{required:true})}${field('bank_code','开户行代码',event.bank_code)}${field('bank_name','开户行',event.bank_name,{required:true})}</div><hr class="divider"><h2>办赛通知</h2><div class="info-banner notice-compose-info">${icon('info',22)}<div><strong>正文和 PDF 均为选填</strong><br>填写正文时可用图片按钮或直接粘贴付款码照片；上传 PDF 后，PDF 内容会自动显示在正文下方。正文为空时，前台只显示 PDF。</div></div><div class="form-grid notice-compose-grid">${markdownField('notice_markdown','通知正文（选填）',event.notice_markdown,false)}${filePicker('notice_url','办赛通知 PDF（选填）',event.notice_url,'notice',false)}</div><div class="form-actions"><a class="button button-secondary" href="#/admin/events">取消</a><button class="button button-primary" type="submit">${id?'保存赛事':'创建赛事'}</button></div></form></div></div>`;
  app.innerHTML=adminShell(id?'编辑赛事':'发布赛事','填写赛事详情与报名时段，并可发布通知正文和 PDF 文件。',content);
  syncAdminRefundDeadline($('form[data-form="admin-event"]'));
}

function adminRegistrationActionLabel(registration) {
  if(registration.refund_status==='requested')return '处理退费';
  if(registration.cancelled_at)return '查看记录';
  return registration.status==='pending'?'审核':'修改审核';
}

function adminReviewEventPicker(events, records, { basePath, activity = false, searchQuery = '' }) {
  const counts = new Map();
  records.forEach((record) => {
    const current = counts.get(record.event_id) || { total: 0, approved: 0, pending: 0, refunds: 0, volunteer: 0, spectator: 0 };
    current.total += 1;
    if (record.status === 'approved' && !record.cancelled_at) current.approved += 1;
    if (record.status === 'pending' && !record.cancelled_at) current.pending += 1;
    if (record.refund_status === 'requested') current.refunds += 1;
    if (record.type === 'volunteer') current.volunteer += 1;
    if (record.type === 'spectator') current.spectator += 1;
    counts.set(record.event_id, current);
  });
  const keyword = String(searchQuery || '').trim().toLowerCase();
  const baseEvents = events.filter((event) => event.status === 'published' && event.time_status !== 'ended' && (!activity || event.allow_volunteer || event.allow_spectator || counts.has(event.id)));
  const available = keyword ? baseEvents.filter((event) => String(event.title || '').toLowerCase().includes(keyword)) : baseEvents;
  const search = adminSearchForm(searchQuery, activity ? '搜索赛事名称' : '搜索比赛名称');
  if (!available.length) {
    const title = keyword ? '没有匹配的赛事' : '暂无可审核赛事';
    const message = keyword ? '请更换比赛名称关键词，或清除搜索后查看全部可审核赛事。' : (activity ? '开放志愿者或观赛报名后，对应赛事会显示在这里。' : '发布且尚未结束的赛事会显示在这里。');
    return `${search}<div class="empty-state"><div class="empty-icon">${icon('calendar',30)}</div><h3>${title}</h3><p>${message}</p></div>`;
  }
  return `${search}<div class="review-event-grid" data-review-event-picker>${available.map((event) => {
    const count = counts.get(event.id) || { total: 0, approved: 0, pending: 0, refunds: 0, volunteer: 0, spectator: 0 };
    const stats = activity
      ? `<span><strong>${count.total}</strong> 条报名</span><span><strong>${count.volunteer}</strong> 志愿者</span><span><strong>${count.spectator}</strong> 观赛</span>`
      : `<span><strong>${count.approved}</strong> 支已通过战队</span><span><strong>${count.pending}</strong> 待审核</span><span><strong>${count.refunds}</strong> 待处理退费</span>`;
    return `<article class="review-event-card"><div class="review-event-card-head"><span class="record-label">赛事 ID ${event.id}</span>${badge(eventStatusMeta(event.time_status))}</div><h2>${escapeHtml(event.title)}</h2><div class="review-event-meta"><div>${icon('calendar',17)}<span>${formatDate(event.starts_at)} — ${formatDate(event.ends_at)}</span></div><div>${icon('map',17)}<span>${escapeHtml(event.location)}</span></div></div><div class="review-event-stats" aria-label="报名统计">${stats}</div><a class="button button-primary" href="#${basePath}?event=${event.id}">进入审核${icon('arrow',17)}</a></article>`;
  }).join('')}</div>`;
}

function adminReviewContext(event, basePath) {
  return `<section class="review-context" aria-labelledby="review-context-title"><div class="review-context-main"><span class="record-label">当前审核赛事</span><h2 id="review-context-title">${escapeHtml(event.title)}</h2><p>${formatDate(event.starts_at)} — ${formatDate(event.ends_at)} · ${escapeHtml(event.location)}</p></div><a class="button button-secondary" href="#${basePath}">${icon('arrow',17)}切换赛事</a></section>`;
}

function adminRegistrationGroupSelector(event, selectedGroup = '') {
  return `<div class="review-group-panel"><div><label for="admin-review-group">参赛组别</label><p id="admin-review-group-help">选择后仅显示该赛事对应组别的战队审核情况。</p></div><select class="form-control" id="admin-review-group" data-admin-review-group aria-describedby="admin-review-group-help"><option value="">请选择参赛组别</option>${event.groups.map((group)=>`<option value="${escapeHtml(group)}" ${group===selectedGroup?'selected':''}>${escapeHtml(group)}</option>`).join('')}</select></div>`;
}

async function adminReviewsPage() {
  if(!requireAdmin())return;
  const query=routeInfo().query;const eventId=Number(query.get('event')||0);const requestedGroup=query.get('group')||'';const status=query.get('status')||'';const searchQuery=query.get('q')||'';
  const {events}=await apiFetch('/api/admin/events');
  if(!eventId){
    const {registrations}=await apiFetch('/api/admin/registrations');
    app.innerHTML=adminShell('赛事报名审核','请先选择需要审核的赛事。',adminReviewEventPicker(events,registrations,{basePath:'/admin/reviews',searchQuery}));
    return;
  }
  const selectedEvent=events.find((event)=>event.id===eventId&&event.status==='published'&&event.time_status!=='ended');
  if(!selectedEvent){
    app.innerHTML=adminShell('赛事报名审核','所选赛事已结束、未发布或不存在。',`<div class="empty-state"><div class="empty-icon">${icon('alert',30)}</div><h3>无法进入该赛事审核</h3><p>请返回赛事选择页，重新选择尚未结束且已发布的赛事。</p><a class="button button-primary" href="#/admin/reviews">返回选择赛事</a></div>`);
    return;
  }
  const groupName=selectedEvent.groups.includes(requestedGroup)?requestedGroup:'';
  const context=`${adminReviewContext(selectedEvent,'/admin/reviews')}${adminRegistrationGroupSelector(selectedEvent,groupName)}`;
  if(!groupName){
    app.innerHTML=adminShell('赛事报名审核','先选择参赛组别，再审核该组别的报名队伍。',`${context}<div class="review-stage-placeholder"><div class="empty-icon">${icon('flag',30)}</div><h3>请选择参赛组别</h3><p>选定组别后，系统会自动加载该赛事对应组别的队伍审核情况。</p></div>`);
    return;
  }
  const params=new URLSearchParams({event_id:String(eventId),group:groupName});if(status)params.set('status',status);if(searchQuery)params.set('q',searchQuery);
  const {registrations}=await apiFetch(`/api/admin/registrations${params.size?`?${params}`:''}`);
  const filters=[['','全部'],['pending','待审核'],['approved','已通过'],['rejected','已驳回']];
  const filterHref=(nextStatus)=>{const next=new URLSearchParams({event:String(eventId),group:groupName});if(nextStatus)next.set('status',nextStatus);if(searchQuery)next.set('q',searchQuery);return `#/admin/reviews?${next}`;};
  const filtersHtml=`<div class="tab-bar" role="tablist" aria-label="审核状态筛选">${filters.map(([key,label])=>`<a href="${filterHref(key)}" class="${status===key?'active':''}">${label}</a>`).join('')}</div>`;
  const content=`${context}${adminSearchForm(searchQuery,'搜索战队编号、战队名称或报名邮箱')}<div class="workbench-note">${icon('info',18)}<span>当前仅显示“${escapeHtml(groupName)}”；原审核排序逻辑保持不变。</span></div>${filtersHtml}${registrations.length?`<div class="desktop-table data-table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>参赛组别</th><th>战队</th><th>报名用户</th><th>报名状态</th><th>退费状态</th><th>提交时间</th><th>操作</th></tr></thead><tbody>${registrations.map((r)=>`<tr><td>${r.id}</td><td>${escapeHtml(r.group_name)}</td><td>${escapeHtml(r.team_number)} · ${escapeHtml(r.team_name)}</td><td>${escapeHtml(r.user_email)}</td><td>${badge(registrationStatusMeta(r))}</td><td>${badge(refundStatusMeta(r.refund_status))}</td><td>${formatDate(r.created_at,true)}</td><td><button class="button ${r.status==='pending'&&!r.cancelled_at?'button-primary':'button-secondary'} button-small" type="button" data-action="admin-view-registration" data-id="${r.id}">${adminRegistrationActionLabel(r)}</button></td></tr>`).join('')}</tbody></table></div><div class="mobile-list">${registrations.map((r)=>`<article class="entity-card"><div class="entity-card-head"><h3>${escapeHtml(r.team_number)} · ${escapeHtml(r.team_name)}</h3>${badge(registrationStatusMeta(r))}</div><dl><div><dt>参赛组别</dt><dd>${escapeHtml(r.group_name)}</dd></div><div><dt>报名用户</dt><dd>${escapeHtml(r.user_email)}</dd></div><div><dt>退费状态</dt><dd>${badge(refundStatusMeta(r.refund_status))}</dd></div></dl><button class="button button-secondary button-small" type="button" data-action="admin-view-registration" data-id="${r.id}">${adminRegistrationActionLabel(r)}</button></article>`).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">${icon('shield',30)}</div><h3>${searchQuery?'没有匹配的报名':'该组别暂无报名'}</h3><p>${searchQuery?'请更换关键词或清除搜索后查看该组别全部记录。':'可切换参赛组别或审核状态查看其他记录。'}</p></div>`}`;
  app.innerHTML=adminShell('赛事报名审核','核对所选赛事与组别的战队、成员资料、付款凭证和退费申请。',content);
}

async function adminActivityApplicationsPage() {
  if(!requireAdmin())return;
  const query = routeInfo().query;
  const eventId = Number(query.get('event') || 0);
  const type = query.get('type') || '';
  const status = query.get('status') || '';
  const searchQuery = query.get('q') || '';
  const { events } = await apiFetch('/api/admin/events');
  if (!eventId) {
    const { applications } = await apiFetch('/api/admin/activity-applications');
    app.innerHTML = adminShell('活动报名审核','请先选择需要审核的赛事。',adminReviewEventPicker(events,applications,{basePath:'/admin/activity-applications',activity:true,searchQuery}));
    return;
  }
  const selectedEvent=events.find((event)=>event.id===eventId&&event.status==='published'&&event.time_status!=='ended');
  if(!selectedEvent){
    app.innerHTML=adminShell('活动报名审核','所选赛事已结束、未发布或不存在。',`<div class="empty-state"><div class="empty-icon">${icon('alert',30)}</div><h3>无法进入该赛事审核</h3><p>请返回赛事选择页，重新选择尚未结束且已发布的赛事。</p><a class="button button-primary" href="#/admin/activity-applications">返回选择赛事</a></div>`);
    return;
  }
  const params = new URLSearchParams();
  params.set('event_id',String(eventId));
  if(type)params.set('type',type);
  if(status)params.set('status',status);
  if(searchQuery)params.set('q',searchQuery);
  const { applications } = await apiFetch(`/api/admin/activity-applications${params.size?`?${params}`:''}`);
  const typeFilters=[['','全部类别'],['volunteer','志愿者'],['spectator','观赛']];
  const statusFilters=[['','全部状态'],['pending','待审核'],['approved','已通过'],['rejected','已驳回']];
  const filterHref=(nextType,nextStatus)=>{const next=new URLSearchParams({event:String(eventId)});if(nextType)next.set('type',nextType);if(nextStatus)next.set('status',nextStatus);if(searchQuery)next.set('q',searchQuery);return `#/admin/activity-applications?${next}`;};
  const filterBars=`<div class="filter-stack"><div class="tab-bar" role="tablist" aria-label="报名类别筛选">${typeFilters.map(([key,label])=>`<a href="${filterHref(key,status)}" class="${type===key?'active':''}">${label}</a>`).join('')}</div><div class="tab-bar" role="tablist" aria-label="审核状态筛选">${statusFilters.map(([key,label])=>`<a href="${filterHref(type,key)}" class="${status===key?'active':''}">${label}</a>`).join('')}</div></div>`;
  const content = `${adminReviewContext(selectedEvent,'/admin/activity-applications')}${adminSearchForm(searchQuery,'搜索申请人、电话、邮箱或单位')}<div class="workbench-note">${icon('info',18)}<span>当前仅显示该赛事的活动报名，原审核排序逻辑保持不变。</span></div>${filterBars}${applications.length?`<div class="desktop-table data-table-wrap"><table class="data-table"><thead><tr><th>ID</th><th class="type-cell">类别</th><th>申请人</th><th class="content-cell">报名内容</th><th class="status-cell">状态</th><th>提交时间</th><th>操作</th></tr></thead><tbody>${applications.map((item)=>`<tr><td>${item.id}</td><td class="type-cell">${escapeHtml(activityConfigs[item.type].title)}</td><td><strong>${escapeHtml(item.name)}</strong><br><small class="muted">${escapeHtml(item.phone)}</small></td><td class="content-cell">${item.type==='volunteer'?escapeHtml(item.volunteer_role):`${item.attendee_count} 人`}</td><td class="status-cell">${badge(reviewStatusMeta(item.status))}</td><td>${formatDate(item.created_at,true)}</td><td><button class="button ${item.status==='pending'?'button-primary':'button-secondary'} button-small" type="button" data-action="admin-view-activity-application" data-id="${item.id}">${item.status==='pending'?'审核':'修改审核'}</button></td></tr>`).join('')}</tbody></table></div><div class="mobile-list">${applications.map((item)=>`<article class="entity-card"><div class="entity-card-head"><div><span class="record-label">${escapeHtml(activityConfigs[item.type].title)}</span><h3>${escapeHtml(item.name)}</h3></div>${badge(reviewStatusMeta(item.status))}</div><dl><div><dt>报名内容</dt><dd>${item.type==='volunteer'?escapeHtml(item.volunteer_role):`${item.attendee_count} 人`}</dd></div><div><dt>提交时间</dt><dd>${formatDate(item.created_at,true)}</dd></div></dl><button class="button button-secondary button-small" type="button" data-action="admin-view-activity-application" data-id="${item.id}">${item.status==='pending'?'审核':'修改审核'}</button></article>`).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">${icon('check',30)}</div><h3>${searchQuery?'没有匹配的报名':'该筛选条件下暂无报名'}</h3><p>${searchQuery?'请更换关键词或清除搜索。':'新的志愿者或观赛申请提交后会显示在这里。'}</p></div>`}`;
  app.innerHTML=adminShell('活动报名审核','审核所选赛事的志愿者与观赛人员资料。',content);
}

function activityReviewModal(id,status) {
  if(status==='approved') {
    openModal('确认通过活动报名',`<form data-form="activity-review" data-id="${id}"><input type="hidden" name="status" value="approved"><div class="success-banner info-banner">${icon('check')}<div>确认申请人资料与赛事安排匹配后通过。用户端状态会立即更新。</div></div><div class="form-actions"><button class="button button-secondary" type="button" data-action="close-modal">取消</button><button class="button button-accent" type="submit">确认通过</button></div></form>`,'','small');
  } else {
    openModal('驳回活动报名',`<form data-form="activity-review" data-id="${id}" novalidate><input type="hidden" name="status" value="rejected"><div class="danger-banner info-banner">${icon('alert')}<div>请说明需要修改的资料，申请人可编辑后重新提交。</div></div><div class="gap-top">${field('reason','驳回原因','',{type:'textarea',required:true,full:true,placeholder:'例如：证件号码或可服务时间不完整，请补充后重新提交。'})}</div><div class="form-actions"><button class="button button-secondary" type="button" data-action="close-modal">取消</button><button class="button button-danger" type="submit">确认驳回</button></div></form>`,'','small');
  }
}

function reviewModal(id,status) {
  if(status==='approved') {
    openModal('确认通过报名',`<form data-form="review" data-id="${id}"><input type="hidden" name="status" value="approved"><div class="success-banner info-banner">${icon('check')}<div>确认资料与付款凭证均合规后通过。用户端状态会立即更新为“已通过”。</div></div><div class="form-actions"><button class="button button-secondary" type="button" data-action="close-modal">取消</button><button class="button button-accent" type="submit">确认通过</button></div></form>`,'','small');
  } else {
    openModal('驳回报名',`<form data-form="review" data-id="${id}" novalidate><input type="hidden" name="status" value="rejected"><div class="danger-banner info-banner">${icon('alert')}<div>请清楚说明需要修改的内容，用户可编辑后重新提交审核。</div></div><div class="gap-top">${field('reason','驳回原因','',{type:'textarea',required:true,full:true,placeholder:'例如：付款凭证金额或收款账户不清晰，请重新上传。'})}</div><div class="form-actions"><button class="button button-secondary" type="button" data-action="close-modal">取消</button><button class="button button-danger" type="submit">确认驳回</button></div></form>`,'','small');
  }
}

function cancelRegistrationModal(id) {
  openModal('取消比赛',`<form data-form="cancel-registration" data-id="${id}" novalidate><div class="danger-banner info-banner">${icon('alert')}<div><strong>取消后报名记录会保留。</strong><br>若需重新参赛，可在报名截止前回到“我的比赛”的对应赛事列表中重新申请参赛；您也可单独申请退费。</div></div><div class="gap-top">${field('reason','取消原因','',{type:'textarea',full:true,placeholder:'可简要说明取消原因（选填）'})}</div><div class="form-actions"><button class="button button-secondary" type="button" data-action="close-modal">暂不取消</button><button class="button button-danger" type="submit">确认取消比赛</button></div></form>`,'','small');
}

async function refundRequestModal(id) {
  const {registration}=await apiFetch(`/api/registrations/${id}`);
  const deadline=refundDeadlineLabel(registration.event.registration_end,registration.event.refund_deadline_days);
  openModal('申请退费',`<form data-form="refund-registration" data-id="${id}" novalidate><div class="info-banner">${icon('info')}<div><strong>截止提交退费申请日期：${escapeHtml(deadline)}</strong><br>提交后由赛事组委会核实付款及报名状态。申请结果和处理说明会显示在“我的比赛”中。</div></div><div class="gap-top">${field('reason','退费原因','',{type:'textarea',required:true,full:true,placeholder:'请说明申请退费的原因，便于组委会核实处理。'})}</div><div class="form-actions"><button class="button button-secondary" type="button" data-action="close-modal">取消</button><button class="button button-primary" type="submit">提交退费申请</button></div></form>`,'','small');
}

function refundReviewModal(id,status) {
  const rejected=status==='rejected';
  openModal(rejected?'拒绝退费申请':'同意退费申请',`<form data-form="refund-review" data-id="${id}" novalidate><input type="hidden" name="status" value="${status}"><div class="${rejected?'danger-banner':'success-banner'} info-banner">${icon(rejected?'alert':'check')}<div>${rejected?'请向报名用户说明本次退费申请无法通过的原因。':'确认付款和报名信息后同意退费；实际退款仍需按组委会财务流程完成。'}</div></div><div class="gap-top">${field('note',rejected?'拒绝原因':'处理说明','',{type:'textarea',required:rejected,full:true,placeholder:rejected?'请填写拒绝退费的原因。':'可填写退款方式、预计到账时间等说明（选填）。'})}</div><div class="form-actions"><button class="button button-secondary" type="button" data-action="close-modal">取消</button><button class="button ${rejected?'button-danger':'button-accent'}" type="submit">${rejected?'确认拒绝':'确认同意'}</button></div></form>`,'','small');
}

async function handleSubmit(event) {
  const form=event.target.closest('form[data-form]'); if(!form)return; event.preventDefault(); clearErrors(form);
  const visualEditors=$$('[data-markdown-visual]',form);visualEditors.forEach(syncVisualMarkdown);
  const missingVisual=visualEditors.find((editor)=>editor.dataset.required==='true'&&!form.elements[editor.dataset.markdownName]?.value.trim());
  if(missingVisual){showErrors(form,{[missingVisual.dataset.markdownName]:'请填写通知正文'});return;}
  if(['team','admin-team'].includes(form.dataset.form)){
    syncTeamNumberField(form);
    const prefix=INNOVATION_GROUP_PREFIXES[form.elements.group_name.value];
    const suffix=form.elements.number.value.trim();
    const finalNumber=`${prefix||''}${suffix}`;
    if((prefix&&!suffix)||!/^[\x21-\x7E]{1,30}$/.test(finalNumber)){showErrors(form,{number:TEAM_NUMBER_FORMAT_MESSAGE});toast(TEAM_NUMBER_FORMAT_MESSAGE,'error');return;}
  }
  if(!form.reportValidity())return;
  if(['team','admin-team'].includes(form.dataset.form)){
    const prefix=INNOVATION_GROUP_PREFIXES[form.elements.group_name.value]||'';
    const finalNumber=`${prefix}${form.elements.number.value.trim()}`;
    if(!await confirmTeamNumber(finalNumber))return;
  }
  const button=form.querySelector('[type=submit]'); setLoading(button,true);
  try {
    const type=form.dataset.form; const data=formObject(form);
    if(type==='login') {
      const result=await apiFetch('/api/auth/login',{method:'POST',body:JSON.stringify(data)});state.user=result.user;state.csrfToken=result.csrfToken;renderHeader();toast(result.message);const next=routeInfo().query.get('next');go(next||(result.user.role==='admin'?'/admin':'/events'));return;
    }
    if(type==='password-reset-request') {
      const result=await apiFetch('/api/auth/password-reset/send-code',{method:'POST',body:JSON.stringify(data)});passwordResetVerificationPage(result);toast(result.message);return;
    }
    if(type==='password-reset-confirm') {
      const result=await apiFetch('/api/auth/password-reset/confirm',{method:'POST',body:JSON.stringify(data)});state.passwordResetChallenge=null;toast(result.message);go('/login');return;
    }
    if(type==='register') { const result=await apiFetch('/api/auth/register',{method:'POST',body:JSON.stringify(data)}); sessionStorage.removeItem(REGISTRATION_DRAFT_KEY);toast(result.message); go('/login'); return; }
    if(type==='profile') { const result=await apiFetch('/api/profile',{method:'PUT',body:JSON.stringify(data)}); const me=await apiFetch('/api/auth/me');state.user=me.user;state.csrfToken=me.csrfToken;renderHeader();closeModal();toast(result.message);await render();return; }
    if(type==='password') { const result=await apiFetch('/api/profile/password',{method:'PUT',body:JSON.stringify(data)}); form.reset();toast(result.message);return; }
    if(type==='member') { const id=form.dataset.id; const result=await apiFetch(id?`/api/members/${id}`:'/api/members',{method:id?'PUT':'POST',body:JSON.stringify(data)});toast(result.message);go('/account/members');return; }
    if(type==='coach') { const id=form.dataset.id; const result=await apiFetch(id?`/api/coaches/${id}`:'/api/coaches',{method:id?'PUT':'POST',body:JSON.stringify(data)});toast(result.message);go('/account/coaches');return; }
    if(type==='team') { const id=form.dataset.id; data.coach_ids=new FormData(form).getAll('coach_ids').map(Number);data.member_ids=new FormData(form).getAll('member_ids').map(Number);const result=await apiFetch(id?`/api/teams/${id}`:'/api/teams',{method:id?'PUT':'POST',body:JSON.stringify(data)});toast(result.message);go('/account/teams');return; }
    if(type==='admin-team') { const id=form.dataset.id;data.coach_ids=new FormData(form).getAll('coach_ids').map(Number);data.member_ids=new FormData(form).getAll('member_ids').map(Number);const result=await apiFetch(`/api/admin/teams/${id}`,{method:'PUT',body:JSON.stringify(data)});toast(result.message);const query=form.dataset.returnQuery||'';go(`/admin/teams${query?`?q=${encodeURIComponent(query)}`:''}`);return; }
    if(type==='registration') { const result=await apiFetch('/api/registrations',{method:'POST',body:JSON.stringify(data)});toast(result.message);go('/account/registrations');return; }
    if(type==='registration-edit') { const result=await apiFetch(`/api/registrations/${form.dataset.id}`,{method:'PUT',body:JSON.stringify(data)});closeModal();toast(result.message);await render();return; }
    if(type==='registration-reapply') { const result=await apiFetch(`/api/registrations/${form.dataset.id}/reapply`,{method:'POST',body:JSON.stringify(data)});closeModal();toast(result.message);await render();return; }
    if(type==='cancel-registration') { const result=await apiFetch(`/api/registrations/${form.dataset.id}/cancel`,{method:'POST',body:JSON.stringify(data)});closeModal();toast(result.message);await render();return; }
    if(type==='refund-registration') { const result=await apiFetch(`/api/registrations/${form.dataset.id}/refund`,{method:'POST',body:JSON.stringify(data)});closeModal();toast(result.message);await render();return; }
    if(type==='activity-application') { const id=form.dataset.id;const applicationType=form.dataset.type;const result=await apiFetch(id?`/api/activity-applications/${id}`:'/api/activity-applications',{method:id?'PUT':'POST',body:JSON.stringify(data)});toast(result.message);if(id)go(`${activityConfigs[applicationType].path}/${data.event_id}`);else await render();return; }
    if(type==='admin-event') { const id=form.dataset.id;data.groups=String(data.groups_text||'').split(/\r?\n|[,，]/).map((v)=>v.trim()).filter(Boolean);data.allow_volunteer=form.elements.allow_volunteer.checked;data.allow_spectator=form.elements.allow_spectator.checked;delete data.groups_text;const result=await apiFetch(id?`/api/admin/events/${id}`:'/api/admin/events',{method:id?'PUT':'POST',body:JSON.stringify(data)});toast(result.message);go('/admin/events');return; }
    if(type==='review') { const result=await apiFetch(`/api/admin/registrations/${form.dataset.id}/review`,{method:'POST',body:JSON.stringify(data)});closeModal();toast(result.message);await render();return; }
    if(type==='refund-review') { const result=await apiFetch(`/api/admin/registrations/${form.dataset.id}/refund-review`,{method:'POST',body:JSON.stringify(data)});closeModal();toast(result.message);await render();return; }
    if(type==='activity-review') { const result=await apiFetch(`/api/admin/activity-applications/${form.dataset.id}/review`,{method:'POST',body:JSON.stringify(data)});closeModal();toast(result.message);await render();return; }
  } catch(error) {
    showErrors(form,error.fields);
    const duplicateTeamNumber=['team','admin-team'].includes(form.dataset.form)&&error.status===409&&(error.fields?.number===DUPLICATE_TEAM_NUMBER_MESSAGE||error.message===DUPLICATE_TEAM_NUMBER_MESSAGE);
    if(duplicateTeamNumber)teamNumberConflictModal();else toast(error.message,'error');
    if(form.dataset.form==='password-reset-request') await refreshCaptcha(form).catch(()=>{});
  } finally { setLoading(button,false); }
}

async function sendCode(button) {
  const form=button.closest('form'); clearErrors(form);
  const captchaFieldElement=$('[data-captcha-field]',form);
  if(captchaFieldElement?.hidden){captchaFieldElement.hidden=false;form.elements.captcha.disabled=false;form.elements.captcha.required=true;form.elements.captchaId.disabled=false;await refreshCaptcha(form);toast('请填写新的图形验证码，然后再次点击“重新获取”');form.elements.captcha.focus();return;}
  const email=form.elements.email.value; const captcha=form.elements.captcha.value; const captchaId=form.elements.captchaId.value;
  if(!email||!captcha){showErrors(form,{email:email?'':'请填写邮箱',captcha:captcha?'':'请填写图形验证码'});return;}
  setLoading(button,true,'正在发送…');
  try{const result=await apiFetch('/api/auth/send-code',{method:'POST',body:JSON.stringify({email,captcha,captchaId})});toast(result.message);if(result.devCode){form.elements.code.value=result.devCode;toast(`开发环境验证码已自动填入：${result.devCode}`);}setRegistrationCodeSent(form,email);let seconds=60;button.disabled=true;button.textContent=`${seconds} 秒后重试`;const timer=setInterval(()=>{seconds-=1;button.textContent=`${seconds} 秒后重试`;if(seconds<=0){clearInterval(timer);button.disabled=false;button.textContent='重新获取';}},1000);}catch(error){showErrors(form,error.fields);toast(error.message,'error');setLoading(button,false);await refreshCaptcha(form).catch(()=>{});}
}

function markdownImageAlt(file) {
  return String(file?.name || '通知图片').replace(/\.[^.]+$/, '').replace(/[\[\]\r\n]/g, ' ').trim().slice(0, 80) || '通知图片';
}

async function uploadMarkdownImageFile(editor, file) {
  if (!file) return;
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { toast('正文图片仅支持 JPG、PNG、WebP', 'error'); return; }
  if (file.size > 4 * 1024 * 1024) { toast('正文图片不能超过 4MB', 'error'); return; }
  editor.classList.add('uploading');
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const result = await apiFetch('/api/uploads', { method: 'POST', body: JSON.stringify({ kind: 'notice_image', dataUrl }) });
    insertVisualHtml(editor, `<p><img src="${safeUrl(result.url)}" alt="${escapeHtml(markdownImageAlt(file))}"></p><p><br></p>`);
    toast('图片已插入正文');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    editor.classList.remove('uploading');
  }
}

async function uploadMarkdownImage(input) {
  const editor = input.closest('.markdown-editor')?.querySelector('[data-markdown-visual]');
  const file = input.files?.[0];
  if (editor && input.dataset.useSavedSelection !== 'true') rememberVisualSelection(editor);
  delete input.dataset.useSavedSelection;
  if (editor && file) await uploadMarkdownImageFile(editor, file);
  input.value = '';
}

async function uploadFile(input) {
  const file=input.files?.[0];if(!file)return;const form=input.closest('form');const target=input.dataset.target;const hidden=form.elements[target];const preview=form.querySelector(`[data-preview="${CSS.escape(target)}"]`);
  const maxMb=Number(input.dataset.maxMb||4);const previousValue=hidden.value;const previousPreview=preview?.innerHTML||'';const clearButton=form.querySelector(`[data-action="clear-upload"][data-target="${CSS.escape(target)}"]`);
  if(input.dataset.kind==='notice'&&file.type!=='application/pdf'){toast('办赛通知仅支持 PDF 文件','error');input.value='';return;}
  if(file.size>maxMb*1024*1024){toast(`文件不能超过 ${maxMb}MB`,'error');input.value='';return;}
  input.disabled=true; if(preview)preview.innerHTML='<div class="spinner" aria-label="正在上传"></div>';
  try{const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});const result=await apiFetch('/api/uploads',{method:'POST',body:JSON.stringify({kind:input.dataset.kind,dataUrl})});hidden.value=result.url;if(preview)preview.innerHTML=uploadPreviewHtml(result.url,input.dataset.kind);if(clearButton)clearButton.hidden=false;const selectLabel=form.querySelector(`label[for="${CSS.escape(input.id)}"]`);if(selectLabel&&input.dataset.kind==='notice')selectLabel.innerHTML=`${icon('upload',17)}重新上传 PDF`;toast('文件上传成功');}catch(error){hidden.value=previousValue;if(preview)preview.innerHTML=previousPreview;if(clearButton)clearButton.hidden=!previousValue;toast(error.message,'error');}finally{input.disabled=false;input.value='';}
}

function clearUpload(button) {
  const form=button.closest('form');const target=button.dataset.target;const hidden=form?.elements[target];const preview=form?.querySelector(`[data-preview="${CSS.escape(target)}"]`);const input=form?.querySelector(`.upload-input[data-target="${CSS.escape(target)}"]`);
  if(!hidden)return;hidden.value='';if(preview)preview.innerHTML=uploadPreviewHtml('',button.dataset.kind);if(input)input.value='';const selectLabel=input?form.querySelector(`label[for="${CSS.escape(input.id)}"]`):null;if(selectLabel&&button.dataset.kind==='notice')selectLabel.innerHTML=`${icon('upload',17)}选择 PDF 文件`;button.hidden=true;toast('已从表单移除 PDF，保存赛事后生效');
}

async function deleteEntity(type,id) {
  const labels={members:'队员',coaches:'教练',teams:'战队'};const ok=await confirmAction(`删除${labels[type]}`,`确定要删除这条${labels[type]}信息吗？`);if(!ok)return;
  try{const result=await apiFetch(`/api/${type}/${id}`,{method:'DELETE'});toast(result.message);await render();}catch(error){
    if(type==='teams'&&error.status===409&&error.fields?.requires_force){
      const confirmed=await confirmTeamCascadeDelete(error.fields.registrations||[]);if(!confirmed)return;
      try{const result=await apiFetch(`/api/teams/${id}?force=1`,{method:'DELETE'});toast(result.message);await render();}catch(forceError){toast(forceError.message,'error');}
      return;
    }
    toast(error.message,'error');
  }
}

async function deleteRegistration(id) { const ok=await confirmAction('删除报名记录','确定删除这条未通过的报名记录吗？');if(!ok)return;try{const result=await apiFetch(`/api/registrations/${id}`,{method:'DELETE'});toast(result.message);await render();}catch(error){toast(error.message,'error');} }

async function deleteActivityApplication(id) { const ok=await confirmAction('删除活动报名','确定删除这条未通过的活动报名吗？');if(!ok)return;try{const result=await apiFetch(`/api/activity-applications/${id}`,{method:'DELETE'});toast(result.message);await render();}catch(error){toast(error.message,'error');} }

async function deleteAdminEvent(id,label='该赛事') { const ok=await confirmAction('确认删除赛事',`确定删除“${label}”吗？删除后将同时移除该赛事的队伍报名、志愿者报名、观赛报名和审核记录，且无法恢复。`,'确认删除赛事');if(!ok)return;try{const result=await apiFetch(`/api/admin/events/${id}`,{method:'DELETE'});toast(result.message);await render();}catch(error){toast(error.message,'error');} }

async function deleteAdminTeam(id,label) { const ok=await confirmAction('删除已有战队',`仅没有参赛记录的战队可删除。确定删除“${label}”吗？此操作不可恢复。`);if(!ok)return;try{const result=await apiFetch(`/api/admin/teams/${id}`,{method:'DELETE'});toast(result.message);await render();}catch(error){toast(error.message,'error');} }

async function deleteAdminUser(id,label) { const ok=await confirmAction('删除用户',`确定删除“${label}”及其关联的战队、教练、学生和报名记录吗？此操作不可恢复。`,'确认删除用户');if(!ok)return;try{const result=await apiFetch(`/api/admin/users/${id}`,{method:'DELETE'});toast(result.message);go('/admin/users');}catch(error){toast(error.message,'error');} }

function confirmUserRoleChange(username, nextLevel) {
  const promoting = nextLevel !== 'none';
  const levelLabel = nextLevel === 'super' ? '最高管理员' : nextLevel === 'mid' ? '中级管理员' : '普通用户';
  const title = nextLevel === 'none' ? '撤销管理员' : `设为${levelLabel}`;
  const message = nextLevel === 'none'
    ? `撤销后，“${username}”将失去管理后台权限，但原有报名资料会保留。`
    : nextLevel === 'super'
      ? `提升后，“${username}”可以设置或撤销其他最高管理员权限。`
      : `变更后，“${username}”将拥有现有管理后台权限，但不能操作最高管理员权限。`;
  return new Promise((resolve) => {
    const bannerClass = promoting ? 'warning-banner' : 'danger-banner';
    const buttonClass = promoting ? 'button-primary' : 'button-danger';
    openModal(title, `<div class="${bannerClass} info-banner">${icon(promoting ? 'shield' : 'alert')}<div><strong>请确认权限变更</strong><br>${escapeHtml(message)}权限变更后，该账号需要重新登录。</div></div>`, `<button class="button button-secondary" type="button" data-action="confirm-cancel">取消</button><button class="button ${buttonClass}" type="button" data-action="confirm-ok">确认变更</button>`, 'small');
    state.confirmResolver = resolve;
  });
}

async function changeUserRole(button) {
  const id = Number(button.dataset.id);
  const adminLevel = button.dataset.adminLevel;
  const username = button.dataset.username || '该用户';
  const confirmed = await confirmUserRoleChange(username, adminLevel);
  if (!confirmed) return;
  button.disabled = true;
  try {
    const result = await apiFetch(`/api/admin/users/${id}/role`, { method: 'POST', body: JSON.stringify({ admin_level: adminLevel }) });
    toast(result.message);
    await render();
  } catch (error) {
    button.disabled = false;
    toast(error.message, 'error');
  }
}

document.addEventListener('input',(event)=>{const editor=event.target.closest('[data-markdown-visual]');if(editor)syncVisualMarkdown(editor);const registerForm=event.target.closest('[data-form="register"]');if(registerForm){if(event.target.name==='email'&&registerForm.dataset.codeSentEmail&&event.target.value!==registerForm.dataset.codeSentEmail){delete registerForm.dataset.codeSentEmail;delete registerForm.dataset.codeSentAt;registerForm.elements.code.value='';const captcha=$('[data-captcha-field]',registerForm);if(captcha)captcha.hidden=false;registerForm.elements.captcha.disabled=false;registerForm.elements.captcha.required=true;registerForm.elements.captchaId.disabled=false;const notice=$('[data-registration-code-status]',registerForm);if(notice)notice.hidden=true;refreshCaptcha(registerForm).catch(()=>{});}saveRegistrationDraft(registerForm);}if(event.target.name==='number'&&event.target.closest('[data-form="team"],[data-form="admin-team"]'))syncTeamNumberField(event.target.form);if(['registration_end','refund_deadline_days'].includes(event.target.name)&&event.target.closest('[data-form="admin-event"]'))syncAdminRefundDeadline(event.target.form);});
document.addEventListener('keydown',(event)=>{const editor=event.target.closest('[data-markdown-visual]');if(!editor||!(event.ctrlKey||event.metaKey))return;const format=event.key.toLowerCase()==='b'?'bold':event.key.toLowerCase()==='i'?'italic':'';if(!format)return;event.preventDefault();applyMarkdownFormat(editor.closest('.markdown-editor').querySelector(`[data-format="${format}"]`));});
document.addEventListener('pointerdown',(event)=>{if(event.target.closest('.markdown-tool'))event.preventDefault();});
document.addEventListener('contextmenu',(event)=>{if(event.target.closest('[data-protected-media]'))event.preventDefault();});
document.addEventListener('pointerdown',(event)=>{const video=event.target;if(!(video instanceof HTMLVideoElement)||!video.matches('[data-protected-media][data-video-src]')||video.dataset.blobReady==='true'||video.dataset.nativeReady==='true')return;startProtectedVideo(video);},true);
document.addEventListener('play',(event)=>{const video=event.target;if(!(video instanceof HTMLVideoElement)||!video.matches('[data-protected-media][data-video-src]')||video.dataset.blobReady==='true'||video.dataset.nativeReady==='true')return;video.pause();startProtectedVideo(video);},true);
document.addEventListener('paste',async(event)=>{const editor=event.target.closest('[data-markdown-visual]');if(!editor)return;const items=[...(event.clipboardData?.items||[])];const imageFiles=items.filter((item)=>item.kind==='file'&&item.type.startsWith('image/')).map((item)=>item.getAsFile()).filter(Boolean);event.preventDefault();if(imageFiles.length){rememberVisualSelection(editor);for(const file of imageFiles)await uploadMarkdownImageFile(editor,file);return;}document.execCommand('insertText',false,event.clipboardData?.getData('text/plain')||'');syncVisualMarkdown(editor);});
document.addEventListener('selectionchange',()=>{const selection=window.getSelection();const anchor=selection?.anchorNode?.nodeType===Node.ELEMENT_NODE?selection.anchorNode:selection?.anchorNode?.parentElement;const editor=anchor?.closest?.('[data-markdown-visual]');if(editor){rememberVisualSelection(editor);updateVisualToolbar(editor);}});
document.addEventListener('submit',(event)=>{
  const form=event.target.closest('form[data-admin-search]');if(!form)return;
  event.preventDefault();
  const {path,query}=routeInfo();const value=form.elements.q.value.trim();
  if(value)query.set('q',value);else query.delete('q');
  go(`${path}${query.size?`?${query}`:''}`);
});
document.addEventListener('submit',handleSubmit);
document.addEventListener('change',async(event)=>{
  const input=event.target;
  if(input.matches('[data-markdown-image-input]'))return uploadMarkdownImage(input);
  if(input.matches('.upload-input'))return uploadFile(input);
  if(input.matches('[data-admin-review-group]')){
    const {path,query}=routeInfo();const group=input.value;
    if(group)query.set('group',group);else query.delete('group');
    query.delete('status');query.delete('q');go(`${path}?${query}`);return;
  }
  if(input.name==='group_name'&&input.closest('[data-form=registration],[data-form=registration-edit],[data-form=registration-reapply]')){
    const teamSelect=input.form.elements.team_id;const group=input.value;let count=0;[...teamSelect.options].forEach((option,index)=>{if(index===0)return;const visible=option.dataset.group===group;option.hidden=!visible;option.disabled=!visible;if(visible)count+=1;});teamSelect.value='';teamSelect.disabled=!group;teamSelect.options[0].textContent=!group?'请先选择参赛组别':count?'请选择参赛战队':'该组别暂无可用战队';
  }
  if(input.name==='group_name'&&input.closest('[data-form="team"],[data-form="admin-team"]'))syncTeamNumberField(input.form);
  if(input.name==='attendee_count'&&input.closest('[data-form=activity-application]')){
    const companion=input.form.elements.companion_names;const required=Number(input.value)>1;companion.required=required;const label=input.form.querySelector('label[for="companion_names"]');const mark=label?.querySelector('.required');if(required&&!mark)label?.insertAdjacentHTML('beforeend','<span class="required" aria-hidden="true">*</span>');if(!required)mark?.remove();
  }
  if(input.name==='team_id'&&input.value){try{const {team}=await apiFetch(`/api/teams/${input.value}`);teamSummaryModal(team);}catch(error){toast(error.message,'error');}}
  if(input.name==='coach_ids'&&input.closest('[data-form="team"],[data-form="admin-team"]')){
    const form=input.form;syncCoachChoiceLimit(form);const selected=new FormData(form).getAll('coach_ids').map(Number);const contact=form.elements.contact_coach_id;const current=Number(contact.value);const coachLabels=Object.fromEntries($$('[name=coach_ids]',form).map((box)=>[Number(box.value),$('strong',box.closest('label')).textContent]));contact.innerHTML=`<option value="">请选择联系人</option>${selected.map((id)=>`<option value="${id}" ${id===current?'selected':''}>${escapeHtml(coachLabels[id])}</option>`).join('')}`;
  }
});

window.addEventListener('pagehide',()=>saveRegistrationDraft($('[data-form="register"]')));
document.addEventListener('click',async(event)=>{
  const target=event.target.closest('[data-action]');if(!target)return;const action=target.dataset.action;
  if(action==='skip-content'){event.preventDefault();app.focus({preventScroll:false});}
  if(action==='back-to-top'){window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  if(action==='toggle-mobile-menu'){const drawer=$('.mobile-drawer',header);drawer.classList.toggle('open');const open=drawer.classList.contains('open');target.setAttribute('aria-expanded',String(open));target.setAttribute('aria-label',open?'关闭导航菜单':'打开导航菜单');}
  if(action==='home-slide'){event.preventDefault();setHomeSlide(Number(target.dataset.slideIndex));startHomeCarousel();}
  if(action==='scroll-home-programs'){event.preventDefault();document.getElementById(target.dataset.target)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
  if(action==='toggle-activity-menu'){const menu=target.closest('.activity-menu');const open=!menu.classList.contains('open');const userMenu=$('.user-menu',header);userMenu?.classList.remove('open');userMenu?.querySelector('.user-menu-button')?.setAttribute('aria-expanded','false');menu.classList.toggle('open',open);menu.classList.toggle('suppress-hover',!open);target.setAttribute('aria-expanded',String(open));}
  if(action==='toggle-user-menu'){const menu=target.closest('.user-menu');menu.classList.toggle('open');target.setAttribute('aria-expanded',String(menu.classList.contains('open')));}
  if(action==='scroll-rule'){event.preventDefault();document.getElementById(target.dataset.target)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
  if(action==='logout'){try{await apiFetch('/api/auth/logout',{method:'POST'});}catch{}state.user=null;state.csrfToken=null;renderHeader();toast('已退出登录');go('/events');}
  if(action==='refresh-captcha'){await refreshCaptcha(target.closest('form')||document);}
  if(action==='restart-password-reset'){await forgotPasswordPage();}
  if(action==='toggle-password'){const input=document.getElementById(target.dataset.target);const visible=input.type==='text';input.type=visible?'password':'text';target.innerHTML=icon(visible?'eye':'eyeOff');target.setAttribute('aria-label',visible?'显示密码':'隐藏密码');}
  if(action==='markdown-format'){event.preventDefault();applyMarkdownFormat(target);}
  if(action==='send-code')await sendCode(target);
  if(action==='close-modal')closeModal();
  if(action==='backdrop-close'&&event.target===target)closeModal();
  if(action==='confirm-ok'){const resolve=state.confirmResolver;state.confirmResolver=null;closeModal();resolve?.(true);}
  if(action==='confirm-cancel'){const resolve=state.confirmResolver;state.confirmResolver=null;closeModal();resolve?.(false);}
  if(action==='profile-edit')await profileEditModal();
  if(action==='delete-entity')await deleteEntity(target.dataset.entity,Number(target.dataset.id));
  if(action==='view-team')await viewTeam(Number(target.dataset.id));
  if(action==='admin-view-team')await viewAdminTeam(Number(target.dataset.id));
  if(action==='view-registration')await viewRegistration(Number(target.dataset.id));
  if(action==='admin-view-registration')await viewRegistration(Number(target.dataset.id),true);
  if(action==='edit-registration')await editRegistration(Number(target.dataset.id));
  if(action==='reapply-registration')await reapplyRegistrationModal(Number(target.dataset.id));
  if(action==='delete-registration')await deleteRegistration(Number(target.dataset.id));
  if(action==='cancel-registration')cancelRegistrationModal(Number(target.dataset.id));
  if(action==='request-refund')await refundRequestModal(Number(target.dataset.id));
  if(action==='view-activity-application')await viewActivityApplication(Number(target.dataset.id));
  if(action==='admin-view-activity-application')await viewActivityApplication(Number(target.dataset.id),true);
  if(action==='delete-activity-application')await deleteActivityApplication(Number(target.dataset.id));
  if(action==='delete-admin-event')await deleteAdminEvent(Number(target.dataset.id),target.dataset.label);
  if(action==='delete-admin-team')await deleteAdminTeam(Number(target.dataset.id),target.dataset.label||'该战队');
  if(action==='delete-admin-user')await deleteAdminUser(Number(target.dataset.id),target.dataset.label||'该用户');
  if(action==='change-user-role')await changeUserRole(target);
  if(action==='clear-upload')clearUpload(target);
  if(action==='review-open')reviewModal(Number(target.dataset.id),target.dataset.status);
  if(action==='refund-review-open')refundReviewModal(Number(target.dataset.id),target.dataset.status);
  if(action==='activity-review-open')activityReviewModal(Number(target.dataset.id),target.dataset.status);
  if(action==='reload-page')location.reload();
});

document.addEventListener('keydown',(event)=>{if(event.key!=='Escape')return;if($('.modal-backdrop')){if(state.confirmResolver){state.confirmResolver(false);state.confirmResolver=null;}closeModal();return;}const activityButton=$('[data-action="toggle-activity-menu"]',header);const activityMenu=$('.activity-menu',header);if(activityMenu?.classList.contains('open')){activityMenu.classList.remove('open');activityMenu.classList.add('suppress-hover');activityButton?.setAttribute('aria-expanded','false');activityButton?.focus();}const userMenu=$('.user-menu',header);userMenu?.classList.remove('open');userMenu?.querySelector('.user-menu-button')?.setAttribute('aria-expanded','false');});
document.addEventListener('click',(event)=>{if(!event.target.closest('.user-menu')){const userMenu=$('.user-menu',header);userMenu?.classList.remove('open');userMenu?.querySelector('.user-menu-button')?.setAttribute('aria-expanded','false');}if(!event.target.closest('.activity-menu')){const activityMenu=$('.activity-menu',header);activityMenu?.classList.remove('open');activityMenu?.querySelector('[data-action="toggle-activity-menu"]')?.setAttribute('aria-expanded','false');}if(event.target.closest('.nav-dropdown a')){const activityMenu=$('.activity-menu',header);activityMenu?.classList.remove('open');activityMenu?.querySelector('[data-action="toggle-activity-menu"]')?.setAttribute('aria-expanded','false');}if(event.target.closest('a[href^="#/"]')){$('.mobile-drawer',header)?.classList.remove('open');const mobileToggle=$('.mobile-toggle',header);mobileToggle?.setAttribute('aria-expanded','false');mobileToggle?.setAttribute('aria-label','打开导航菜单');}});
header.addEventListener('pointerover',(event)=>{const menu=event.target.closest('.activity-menu');if(menu&&!menu.contains(event.relatedTarget))menu.classList.remove('suppress-hover');});

async function render() {
  const renderId=++state.renderId;stopHomeCarousel();closeModal();loadingPage();await refreshActivityAvailability();if(renderId!==state.renderId)return;renderHeader();const {path}=routeInfo();
  try{
    if(path==='/home'||path==='/')homePage();
    else if(path==='/events')await eventsPage();
    else if(path==='/rules')rulesPage();
    else if(path==='/about')aboutPage();
    else if(/^\/events\/\d+$/.test(path))await eventDetailPage(Number(path.split('/').pop()));
    else if(path==='/volunteer')state.activityAvailability.volunteer?await activityApplicationPage('volunteer'):activityUnavailablePage('volunteer');
    else if(/^\/volunteer\/\d+$/.test(path))state.activityAvailability.volunteer?await activityEventDetailPage('volunteer',Number(path.split('/').pop())):activityUnavailablePage('volunteer');
    else if(path==='/spectator')state.activityAvailability.spectator?await activityApplicationPage('spectator'):activityUnavailablePage('spectator');
    else if(/^\/spectator\/\d+$/.test(path))state.activityAvailability.spectator?await activityEventDetailPage('spectator',Number(path.split('/').pop())):activityUnavailablePage('spectator');
    else if(path==='/login')await loginPage();
    else if(path==='/register')await registerPage();
    else if(path==='/forgot-password')await forgotPasswordPage();
    else if(path==='/team-number')teamNumberHelpPage();
    else if(path==='/team-number/guide')await teamNumberGuidePage();
    else if(path==='/account/profile')await profilePage();
    else if(path==='/account/members')await membersPage();
    else if(path==='/account/members/new')await memberFormPage();
    else if(/^\/account\/members\/\d+\/edit$/.test(path))await memberFormPage(path.split('/')[3]);
    else if(path==='/account/coaches')await coachesPage();
    else if(path==='/account/coaches/new')await coachFormPage();
    else if(/^\/account\/coaches\/\d+\/edit$/.test(path))await coachFormPage(path.split('/')[3]);
    else if(path==='/account/teams')await teamsPage();
    else if(path==='/account/teams/new')await teamFormPage();
    else if(/^\/account\/teams\/\d+\/edit$/.test(path))await teamFormPage(path.split('/')[3]);
    else if(path==='/account/registrations')await registrationsPage();
    else if(path==='/admin')await adminDashboardPage();
    else if(path==='/admin/events')await adminEventsPage();
    else if(path==='/admin/users')await adminUsersPage();
    else if(/^\/admin\/users\/\d+$/.test(path))await adminUserDetailPage(Number(path.split('/')[3]));
    else if(path==='/admin/teams')await adminTeamsPage();
    else if(/^\/admin\/teams\/\d+\/edit$/.test(path))await adminTeamFormPage(Number(path.split('/')[3]));
    else if(path==='/admin/events/new')await adminEventFormPage();
    else if(/^\/admin\/events\/\d+\/edit$/.test(path))await adminEventFormPage(path.split('/')[3]);
    else if(path==='/admin/reviews')await adminReviewsPage();
    else if(path==='/admin/activity-applications')await adminActivityApplicationsPage();
    else {app.innerHTML=`<section class="page-section"><div class="container"><div class="empty-state"><div class="empty-icon">${icon('search',30)}</div><h1>页面不存在</h1><p>地址可能已变更，请返回赛事列表。</p><a class="button button-primary" href="#/events">返回赛事报名</a></div></div></section>`;}
    if(renderId!==state.renderId)return;window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});app.focus({preventScroll:true});
  }catch(error){if(renderId!==state.renderId)return;app.innerHTML=`<section class="page-section"><div class="container"><div class="empty-state"><div class="empty-icon">${icon('alert',30)}</div><h1>页面加载失败</h1><p>${escapeHtml(error.message)}</p><button class="button button-primary" type="button" data-action="reload-page">重新加载</button></div></div></section>`;}
}

async function init(){try{const me=await apiFetch('/api/auth/me');state.user=me.user;state.csrfToken=me.csrfToken;}catch{}renderHeader();await render();}
window.addEventListener('hashchange',render);
init();
