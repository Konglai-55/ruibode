import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { PLATFORM_NAME, activityApplicationReviewEmailPayload, createApplication, registrationReviewEmailPayload, verificationCodeEmailPayload } from '../server.mjs';

process.env.NODE_ENV = 'test';

const expectedGroups = [
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
];
const duplicateTeamNumberMessage = '该战队编号已被其他队伍注册（已被占用）\n\n如果您输入的确实是 RECF 官方分配给您的战队编号，但系统提示已被占用，请联系组委会协助核实处理：\n\n组委会邮箱：654849662@qq.com\n\n咨询电话：13761393714（小周老师）';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'ruibude-registration-'));
  const { server, db } = await createApplication({
    dbPath: join(dir, 'test.db'),
    uploadDir: join(dir, 'uploads'),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    db,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      db.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

function client(base) {
  let cookie = '';
  let csrf = '';
  return {
    get csrf() { return csrf; },
    async request(path, options = {}) {
      const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf && !['GET', 'HEAD'].includes(options.method || 'GET') ? { 'X-CSRF-Token': csrf } : {}), ...(options.headers || {}) };
      const response = await fetch(`${base}${path}`, { ...options, headers, redirect: 'manual' });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json()
        : contentType.includes('application/zip')
          ? Buffer.from(await response.arrayBuffer())
          : await response.text();
      if (payload?.csrfToken) csrf = payload.csrfToken;
      return { response, payload };
    },
    async captcha() {
      const { payload } = await this.request('/api/captcha');
      assert.ok(payload.devCode, '测试环境应提供不可用于生产的验证码辅助值');
      assert.equal(payload.expiresInSeconds, 600, '图形验证码应有 10 分钟有效期');
      return { captchaId: payload.id, captcha: payload.devCode };
    },
    async login(email, password) {
      const loggedIn = await this.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ account: email, password }) });
      assert.equal(loggedIn.response.status, 200);
      assert.ok(loggedIn.payload.user);
      assert.ok(loggedIn.payload.csrfToken);
      assert.ok(loggedIn.response.headers.get('set-cookie'));
      csrf = loggedIn.payload.csrfToken;
      return loggedIn.payload;
    },
  };
}

function readZipEntries(archive) {
  assert.ok(Buffer.isBuffer(archive), 'ZIP 响应应为二进制 Buffer');
  const entries = new Map();
  let offset = 0;
  while (offset + 4 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const uncompressedSize = archive.readUInt32LE(offset + 22);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = archive.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const compressed = archive.subarray(dataStart, dataEnd);
    const data = method === 8 ? inflateRawSync(compressed) : method === 0 ? Buffer.from(compressed) : null;
    assert.ok(data, `测试解包器不支持 ZIP 压缩方式 ${method}`);
    assert.equal(data.length, uncompressedSize, `${name} 解压后大小应与 ZIP 元数据一致`);
    entries.set(name, data);
    offset = dataEnd;
  }
  return entries;
}

test('验证码邮件正文使用中英文自动邮箱提示', () => {
  const mail = verificationCodeEmailPayload('12345');
  assert.equal(mail.text, '您的验证码为12345，有效期为10分钟。发送邮箱为自动邮箱，请勿回复。\nYour verification code is 12345 and is valid for ten minutes. This email is sent from an automated mailbox, please do not reply.');
  assert.ok(mail.html.includes('您的验证码为<strong>12345</strong>，有效期为10分钟。发送邮箱为自动邮箱，请勿回复。'));
  assert.ok(mail.html.includes('Your verification code is <strong>12345</strong> and is valid for ten minutes. This email is sent from an automated mailbox, please do not reply.'));
});

test('用户名或邮箱与密码正确后直接登录且无需验证码', async () => {
  const app = await setup();
  const user = client(app.base);
  try {
    const byUsername = await user.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ account: 'demo', password: 'Demo123!' }) });
    assert.equal(byUsername.response.status, 200);
    assert.equal(byUsername.payload.user.username, 'demo');
    assert.ok(byUsername.payload.csrfToken);
    assert.ok(byUsername.response.headers.get('set-cookie'));

    const byEmail = await client(app.base).request('/api/auth/login', { method: 'POST', body: JSON.stringify({ account: 'demo@ruibude.local', password: 'Demo123!' }) });
    assert.equal(byEmail.response.status, 200);
    assert.equal(byEmail.payload.user.email, 'demo@ruibude.local');

    const wrong = await client(app.base).request('/api/auth/login', { method: 'POST', body: JSON.stringify({ account: 'demo', password: 'wrong-password' }) });
    assert.equal(wrong.response.status, 401);
    assert.equal(wrong.payload.error, '账号或密码不正确');
  } finally { await app.close(); }
});

test('可通过邮箱验证码重置密码并注销旧会话', async () => {
  const app = await setup();
  const activeSession = client(app.base);
  const recovery = client(app.base);
  const freshLogin = client(app.base);
  try {
    await activeSession.login('demo@ruibude.local', 'Demo123!');
    const captcha = await recovery.captcha();
    const sent = await recovery.request('/api/auth/password-reset/send-code', { method: 'POST', body: JSON.stringify({ email: 'demo@ruibude.local', ...captcha }) });
    assert.equal(sent.response.status, 200);
    assert.ok(sent.payload.challengeId);
    assert.match(sent.payload.devCode, /^\d{6}$/);
    assert.equal(sent.payload.expiresInSeconds, 600, '密码找回邮箱验证码应有 10 分钟有效期');

    const wrong = await recovery.request('/api/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ challengeId: sent.payload.challengeId, code: '000000', password: 'Changed123', confirm_password: 'Changed123' }) });
    assert.equal(wrong.response.status, 422);
    assert.match(wrong.payload.fields.code, /还可尝试 4 次/);

    const mismatch = await recovery.request('/api/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ challengeId: sent.payload.challengeId, code: sent.payload.devCode, password: 'Changed123', confirm_password: 'Different123' }) });
    assert.equal(mismatch.response.status, 422);
    assert.equal(mismatch.payload.fields.confirm_password, '请再次输入相同的新密码');

    const changed = await recovery.request('/api/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ challengeId: sent.payload.challengeId, code: sent.payload.devCode, password: 'Changed123', confirm_password: 'Changed123' }) });
    assert.equal(changed.response.status, 200);
    const oldSession = await activeSession.request('/api/profile');
    assert.equal(oldSession.response.status, 401, '重置密码后旧会话必须立即失效');
    const reused = await recovery.request('/api/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ challengeId: sent.payload.challengeId, code: sent.payload.devCode, password: 'Again1234', confirm_password: 'Again1234' }) });
    assert.equal(reused.response.status, 422);

    const oldCaptcha = await freshLogin.captcha();
    const oldPassword = await freshLogin.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'demo@ruibude.local', password: 'Demo123!', ...oldCaptcha }) });
    assert.equal(oldPassword.response.status, 401);
    const loggedIn = await freshLogin.login('demo@ruibude.local', 'Changed123');
    assert.equal(loggedIn.user.username, 'demo');
  } finally { await app.close(); }
});

test('公开赛事按未开始优先排序并提供安全响应头', async () => {
  const app = await setup();
  try {
    const index = await fetch(`${app.base}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-security-policy'), /default-src 'self'/);
    const { response, payload } = await client(app.base).request('/api/events');
    assert.equal(response.status, 200);
    assert.equal(payload.events.length, 3);
    assert.notEqual(payload.events[0].time_status, 'ended');
    assert.equal(payload.events.at(-1).time_status, 'ended');
    assert.ok(Array.isArray(payload.events[0].groups));
    assert.match(payload.events[0].notice_markdown, /^# 关于举办 /);
    assert.equal(payload.events[0].notice_url, '');
    assert.ok(payload.events.every((event) => event.allow_volunteer === false && event.allow_spectator === false), '附加报名默认关闭');
    const hangzhou = payload.events.find((event) => event.title.includes('杭州'));
    assert.equal(hangzhou.refund_deadline_days, 10);
    assert.equal(hangzhou.refund_deadline_label, '2026年11月20日 24:00');
  } finally { await app.close(); }
});

test('管理员赛事管理按未开始、开赛时间、名称与 ID 升序排列', async () => {
  const app = await setup();
  const admin = client(app.base);
  try {
    await admin.login('admin@ruibude.local', 'Admin123!');
    const initial = await admin.request('/api/admin/events');
    const template = initial.payload.events[0];
    const future = {
      ...template,
      starts_at: '2099-02-01T09:00:00+08:00',
      ends_at: '2099-02-02T18:00:00+08:00',
      registration_start: '2098-01-01T09:00:00+08:00',
      registration_end: '2098-12-31T18:00:00+08:00',
      refund_deadline_days: 15,
      status: 'published',
    };
    const created = [];
    for (const [index, title] of ['排序-B', '排序-A', '排序-A'].entries()) {
      const body = index === 0 ? { ...future, title, groups: [...future.groups, 'RECF-Achieve 成年组'] } : { ...future, title };
      const result = await admin.request('/api/admin/events', { method: 'POST', body: JSON.stringify(body) });
      assert.equal(result.response.status, 201);
      created.push(result.payload.id);
    }
    const started = await admin.request('/api/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        ...future,
        title: '排序-已开始',
        starts_at: '2000-02-01T09:00:00+08:00',
        ends_at: '2000-02-02T18:00:00+08:00',
        registration_start: '1999-01-01T09:00:00+08:00',
        registration_end: '1999-12-31T18:00:00+08:00',
      }),
    });
    assert.equal(started.response.status, 201);

    const sorted = await admin.request('/api/admin/events');
    const relevantIds = sorted.payload.events.filter((event) => event.title.startsWith('排序-')).map((event) => event.id);
    assert.deepEqual(relevantIds, [created[1], created[2], created[0], started.payload.id]);
    const createdEvent = sorted.payload.events.find((event) => event.id === created[0]);
    assert.equal(createdEvent.refund_deadline_days, 15);
    assert.equal(createdEvent.refund_deadline_label, '2098年12月16日 24:00');
    assert.ok(createdEvent.groups.includes('RECF-Achieve 成年组'), '管理员应可新增未来赛季参赛组别');
  } finally { await app.close(); }
});

test('管理员可发布办赛通知正文图片、替换和移除 PDF，通知正文允许为空', async () => {
  const app = await setup();
  const admin = client(app.base);
  const anonymous = client(app.base);
  try {
    await admin.login('admin@ruibude.local', 'Admin123!');
    const pdfData = (label) => `data:application/pdf;base64,${Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF`).toString('base64')}`;
    const tinyPngData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const firstUpload = await admin.request('/api/uploads', { method: 'POST', body: JSON.stringify({ kind: 'notice', dataUrl: pdfData('first notice') }) });
    assert.equal(firstUpload.response.status, 201);
    assert.match(firstUpload.payload.url, /\.pdf$/);
    const noticeImage = await admin.request('/api/uploads', { method: 'POST', body: JSON.stringify({ kind: 'notice_image', dataUrl: tinyPngData }) });
    assert.equal(noticeImage.response.status, 201);
    assert.match(noticeImage.payload.url, /\.png$/);

    const privateNoticeImage = await anonymous.request(noticeImage.payload.url);
    assert.equal(privateNoticeImage.response.status, 403, '未被发布赛事正文引用的通知图片不应公开访问');
    const wrongType = await admin.request('/api/uploads', { method: 'POST', body: JSON.stringify({ kind: 'notice', dataUrl: tinyPngData }) });
    assert.equal(wrongType.response.status, 422);
    assert.match(wrongType.payload.error, /仅支持 PDF/);
    const pdfAsNoticeImage = await admin.request('/api/uploads', { method: 'POST', body: JSON.stringify({ kind: 'notice_image', dataUrl: pdfData('wrong notice image') }) });
    assert.equal(pdfAsNoticeImage.response.status, 422);
    assert.match(pdfAsNoticeImage.payload.error, /只能上传图片/);

    const current = await admin.request('/api/admin/events');
    const template = current.payload.events[0];
    const created = await admin.request('/api/admin/events', {
      method: 'POST',
      body: JSON.stringify({ ...template, title: '仅 PDF 办赛通知测试赛事', notice_markdown: '', notice_url: firstUpload.payload.url, status: 'published' }),
    });
    assert.equal(created.response.status, 201, '正文为空但已有 PDF 时应允许创建赛事');

    let publicEvent = await anonymous.request(`/api/events/${created.payload.id}`);
    assert.equal(publicEvent.response.status, 200);
    assert.equal(publicEvent.payload.event.notice_markdown, '');
    assert.equal(publicEvent.payload.event.notice_url, firstUpload.payload.url);
    const publicPdf = await anonymous.request(firstUpload.payload.url);
    assert.equal(publicPdf.response.status, 200);
    assert.match(publicPdf.response.headers.get('content-type'), /application\/pdf/);
    assert.equal(publicPdf.response.headers.get('content-disposition'), 'inline');
    assert.equal(publicPdf.response.headers.get('x-frame-options'), null);
    assert.match(publicPdf.payload, /^%PDF-/);

    const secondUpload = await admin.request('/api/uploads', { method: 'POST', body: JSON.stringify({ kind: 'notice', dataUrl: pdfData('replacement notice') }) });
    assert.equal(secondUpload.response.status, 201);
    const editable = (await admin.request('/api/admin/events')).payload.events.find((event) => event.id === created.payload.id);
    const noticeMarkdownWithImage = `# 补充通知正文\n\n![付款码](${noticeImage.payload.url})`;
    const replaced = await admin.request(`/api/admin/events/${created.payload.id}`, { method: 'PUT', body: JSON.stringify({ ...editable, notice_markdown: noticeMarkdownWithImage, notice_url: secondUpload.payload.url }) });
    assert.equal(replaced.response.status, 200);
    publicEvent = await anonymous.request(`/api/events/${created.payload.id}`);
    assert.equal(publicEvent.payload.event.notice_markdown, noticeMarkdownWithImage);
    assert.equal(publicEvent.payload.event.notice_url, secondUpload.payload.url);
    const publicNoticeImage = await anonymous.request(noticeImage.payload.url);
    assert.equal(publicNoticeImage.response.status, 200);
    assert.match(publicNoticeImage.response.headers.get('content-type'), /image\/png/);

    const removed = await admin.request(`/api/admin/events/${created.payload.id}`, { method: 'PUT', body: JSON.stringify({ ...publicEvent.payload.event, notice_url: '', notice_markdown: '# 仅保留正文' }) });
    assert.equal(removed.response.status, 200);
    publicEvent = await anonymous.request(`/api/events/${created.payload.id}`);
    assert.equal(publicEvent.payload.event.notice_url, '');
    assert.equal(publicEvent.payload.event.notice_markdown, '# 仅保留正文');
    const hiddenAgain = await anonymous.request(noticeImage.payload.url);
    assert.equal(hiddenAgain.response.status, 403, '正文不再引用后通知图片不应继续公开');
  } finally { await app.close(); }
});

test('RECF 创新组自动添加编号前缀并阻止重复或非 ASCII 后缀', async () => {
  const app = await setup();
  const demo = client(app.base);
  try {
    await demo.login('demo@ruibude.local', 'Demo123!');
    const { payload: coaches } = await demo.request('/api/coaches');
    const { payload: members } = await demo.request('/api/members');
    const base = {
      name: '创新测试战队', school_name: '瑞卜德实验学校', nationality: '中国',
      coach_ids: [coaches.coaches[0].id], member_ids: [members.members[0].id], contact_coach_id: coaches.coaches[0].id,
    };
    const mappings = [
      ['RECF-Achieve 创新初中组','RECF-A-CZ'],
      ['RECF-Achieve 创新高中组','RECF-A-GZ'],
      ['RECF-Engage 创新小学组','RECF-E-XX'],
      ['RECF-Engage 创新初中组','RECF-E-CZ'],
      ['RECF-Inspire 创新大学组','RECF-I-DX'],
    ];
    let primaryId;
    for (const [groupName, prefix] of mappings) {
      const created = await demo.request('/api/teams', { method: 'POST', body: JSON.stringify({ ...base, name: `${groupName}测试战队`, group_name: groupName, number: 'A-01' }) });
      assert.equal(created.response.status, 201);
      if (groupName === 'RECF-Achieve 创新初中组') primaryId = created.payload.id;
      const { payload: teams } = await demo.request('/api/teams');
      assert.equal(teams.teams.find((team) => team.id === created.payload.id).number, `${prefix}A-01`);
    }
    const { payload: teams } = await demo.request('/api/teams');
    assert.equal(teams.teams.find((team) => team.id === primaryId).number, 'RECF-A-CZA-01');

    const duplicate = await demo.request('/api/teams', { method: 'POST', body: JSON.stringify({ ...base, group_name: 'RECF-Achieve 创新初中组', name: '重复编号战队', number: 'recf-a-cza-01' }) });
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.payload.error, duplicateTeamNumberMessage);
    assert.equal(duplicate.payload.fields.number, duplicateTeamNumberMessage);

    const nonAscii = await demo.request('/api/teams', { method: 'POST', body: JSON.stringify({ ...base, group_name: 'RECF-Achieve 创新初中组', number: '创新01' }) });
    assert.equal(nonAscii.response.status, 422);
    assert.match(nonAscii.payload.fields.number, /ASCII/);
    const tooLong = await demo.request('/api/teams', { method: 'POST', body: JSON.stringify({ ...base, group_name: 'RECF-Achieve 创新初中组', number: '1234567890123456789012' }) });
    assert.equal(tooLong.response.status, 422);
    assert.match(tooLong.payload.fields.number, /1–30/);
    const customGroup = await demo.request('/api/teams', { method: 'POST', body: JSON.stringify({ ...base, group_name: 'RECF-Achieve 成年组', name: '成年组测试战队', number: 'ADULT-TEAM-2026-01' }) });
    assert.equal(customGroup.response.status, 201, '新赛事组别不应被默认 10 组清单拦截');
    const nonAsciiOfficial = await demo.request('/api/teams', { method: 'POST', body: JSON.stringify({ ...base, group_name: 'RECF-Achieve 初中组', number: '中文01' }) });
    assert.equal(nonAsciiOfficial.response.status, 422);
    assert.match(nonAsciiOfficial.payload.fields.number, /ASCII/);

    const extraCoachA = await demo.request('/api/coaches', { method: 'POST', body: JSON.stringify({ name: '第二教练', gender: '男', phone: '13800000011', org_name: '瑞卜德实验学校', email: 'coach-two@example.com', nationality: '中国' }) });
    const extraCoachB = await demo.request('/api/coaches', { method: 'POST', body: JSON.stringify({ name: '第三教练', gender: '女', phone: '13800000012', org_name: '瑞卜德实验学校', email: 'coach-three@example.com', nationality: '中国' }) });
    assert.equal(extraCoachA.response.status, 201);
    assert.equal(extraCoachB.response.status, 201);
    const tooManyCoaches = await demo.request('/api/teams', { method: 'POST', body: JSON.stringify({ ...base, name: '三教练战队', group_name: 'RECF-Achieve 初中组', number: 'COACH-003', coach_ids: [coaches.coaches[0].id, extraCoachA.payload.id, extraCoachB.payload.id] }) });
    assert.equal(tooManyCoaches.response.status, 422);
    assert.equal(tooManyCoaches.payload.fields.coach_ids, '最多选择两名教练');

    const events = await demo.request('/api/events');
    assert.ok(events.payload.events.every((event) => JSON.stringify(event.groups) === JSON.stringify(expectedGroups)));
  } finally { await app.close(); }
});

test('邮箱验证注册、登录、资料建档、组队和报名流程可贯通', async () => {
  const app = await setup();
  const user = client(app.base);
  try {
    const captcha = await user.captcha();
    const sent = await user.request('/api/auth/send-code', { method: 'POST', body: JSON.stringify({ email: 'new-user@example.com', ...captcha }) });
    assert.equal(sent.response.status, 200);
    assert.match(sent.payload.devCode, /^\d{6}$/);
    assert.equal(sent.payload.expiresInSeconds, 600, '邮箱验证码应有 10 分钟有效期');
    const missingPhone = await user.request('/api/auth/register', { method: 'POST', body: JSON.stringify({ username: 'new-user', email: 'new-user@example.com', password: 'Strong123', nickname: '新用户', code: sent.payload.devCode }) });
    assert.equal(missingPhone.response.status, 422);
    assert.equal(missingPhone.payload.fields.phone, '此项为必填项');
    const registered = await user.request('/api/auth/register', { method: 'POST', body: JSON.stringify({ username: 'new-user', email: 'new-user@example.com', phone: '13761390000', password: 'Strong123', nickname: '新用户', code: sent.payload.devCode }) });
    assert.equal(registered.response.status, 201);
    await user.login('new-user@example.com', 'Strong123');
    const profile = await user.request('/api/profile');
    assert.equal(profile.payload.profile.username, 'new-user');
    assert.equal(profile.payload.profile.phone, '13761390000');

    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const upload = await user.request('/api/uploads', { method: 'POST', body: JSON.stringify({ kind: 'member', dataUrl: tinyPng }) });
    assert.equal(upload.response.status, 201);

  const member = await user.request('/api/members', { method: 'POST', body: JSON.stringify({ name: '王小明', gender: '男', grade: '初中', school: '瑞卜德实验学校', id_number: '440300201201010010', photo_url: upload.payload.url, phone: '13800000008', province: '广东省', city: '深圳市', nationality: '中国' }) });
    assert.equal(member.response.status, 201);
  const coach = await user.request('/api/coaches', { method: 'POST', body: JSON.stringify({ name: '王老师', gender: '女', phone: '13800000009', org_name: '瑞卜德实验学校', email: 'coach-new@example.com', province: '广东省', city: '深圳市', nationality: '中国' }) });
    assert.equal(coach.response.status, 201);
  const team = await user.request('/api/teams', { method: 'POST', body: JSON.stringify({ number: 'TEST-001', name: '测试战队', group_name: 'RECF-Achieve 初中组', school_name: '瑞卜德实验学校', nationality: '中国', coach_ids: [coach.payload.id], member_ids: [member.payload.id], contact_coach_id: coach.payload.id }) });
    assert.equal(team.response.status, 201);

    const events = await user.request('/api/events');
    const event = events.payload.events.find((item) => item.registration_open && item.groups.includes('RECF-Achieve 初中组'));
    assert.ok(event);
    const proof = await user.request('/api/uploads', { method: 'POST', body: JSON.stringify({ kind: 'payment', dataUrl: tinyPng }) });
    const registration = await user.request('/api/registrations', { method: 'POST', body: JSON.stringify({ event_id: event.id, team_id: team.payload.id, group_name: 'RECF-Achieve 初中组', payment_proof_url: proof.payload.url }) });
    assert.equal(registration.response.status, 201);
    const mine = await user.request('/api/registrations');
    assert.equal(mine.payload.registrations[0].status, 'pending');
  } finally { await app.close(); }
});

test('管理员可查看完整报名资料并通过审核', async () => {
  const app = await setup();
  const demo = client(app.base);
  const admin = client(app.base);
  try {
  await demo.login('demo@ruibude.local', 'Demo123!');
    const { payload: teams } = await demo.request('/api/teams');
    const { payload: events } = await demo.request('/api/events');
    const event = events.events.find((item) => item.registration_open && item.groups.includes(teams.teams[0].group_name));
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const proof = await demo.request('/api/uploads', { method: 'POST', body: JSON.stringify({ kind: 'payment', dataUrl: tinyPng }) });
    const created = await demo.request('/api/registrations', { method: 'POST', body: JSON.stringify({ event_id: event.id, team_id: teams.teams[0].id, group_name: teams.teams[0].group_name, payment_proof_url: proof.payload.url }) });
    assert.equal(created.response.status, 201);

  await admin.login('admin@ruibude.local', 'Admin123!');
    const pending = await admin.request('/api/admin/registrations?status=pending');
    assert.equal(pending.payload.registrations.length, 1);
    const detail = await admin.request(`/api/admin/registrations/${created.payload.id}`);
    assert.equal(detail.payload.registration.team.members.length, 1);
    assert.equal(detail.payload.registration.team.coaches.length, 1);
    const reviewed = await admin.request(`/api/admin/registrations/${created.payload.id}/review`, { method: 'POST', body: JSON.stringify({ status: 'approved' }) });
    assert.equal(reviewed.response.status, 200);
    let mine = await demo.request('/api/registrations');
    assert.equal(mine.payload.registrations[0].status, 'approved');
    const approvedMail = registrationReviewEmailPayload({ event_title: event.title, starts_at: event.starts_at, ends_at: event.ends_at, location: event.location, team_number: teams.teams[0].number, team_name: teams.teams[0].name, group_name: teams.teams[0].group_name }, 'approved');
    assert.ok(approvedMail.text.includes(`Your team, ${teams.teams[0].number}, application to the competition ${event.title} has been approved.`));
    assert.ok(approvedMail.html.includes(`Your team, ${teams.teams[0].number}, application to the competition ${event.title} has been approved.`));
    assert.ok(approvedMail.text.includes(PLATFORM_NAME));
    assert.ok(approvedMail.html.includes(PLATFORM_NAME));
    const approvedExport = await admin.request(`/api/admin/events/${event.id}/export?scope=approved`);
    assert.equal(approvedExport.response.status, 200);
    assert.equal(approvedExport.response.headers.get('x-export-scope'), 'approved');
    const approvedWorkbooks = readZipEntries(approvedExport.payload);
    const approvedWorkbookName = [...approvedWorkbooks.keys()].find((name) => name.includes(teams.teams[0].group_name));
    assert.ok(approvedWorkbookName, '已通过导出应按赛事组别生成工作簿');
    const approvedSheet = readZipEntries(approvedWorkbooks.get(approvedWorkbookName)).get('xl/worksheets/sheet1.xml').toString('utf8');
    assert.ok(approvedSheet.includes('审核通过赛队信息'));
    assert.ok(approvedSheet.includes(teams.teams[0].number), '已通过导出应包含审核通过的战队');
    const changedToRejected = await admin.request(`/api/admin/registrations/${created.payload.id}/review`, { method: 'POST', body: JSON.stringify({ status: 'rejected', reason: '复核后发现付款凭证不清晰' }) });
    assert.equal(changedToRejected.response.status, 200);
    mine = await demo.request('/api/registrations');
    assert.equal(mine.payload.registrations[0].status, 'rejected');
    assert.equal(mine.payload.registrations[0].rejection_reason, '复核后发现付款凭证不清晰');
    const rejectedMail = registrationReviewEmailPayload({ event_title: event.title, starts_at: event.starts_at, ends_at: event.ends_at, location: event.location, team_number: teams.teams[0].number, team_name: teams.teams[0].name, group_name: teams.teams[0].group_name, rejection_reason: '复核后发现付款凭证不清晰' }, 'rejected');
    assert.match(rejectedMail.subject, /赛事报名未通过/);
    assert.ok(rejectedMail.text.includes(`Your team, ${teams.teams[0].number}, application to the competition ${event.title} has not been approved.`));
    assert.ok(rejectedMail.text.includes(`Please log in to ${PLATFORM_NAME} to view the status`));
    assert.ok(!rejectedMail.text.includes('复核后发现付款凭证不清晰'), '驳回邮件正文不得包含后台驳回原因');
    assert.ok(!rejectedMail.html.includes('复核后发现付款凭证不清晰'), '驳回邮件 HTML 不得包含后台驳回原因');
    const changedBackToApproved = await admin.request(`/api/admin/registrations/${created.payload.id}/review`, { method: 'POST', body: JSON.stringify({ status: 'approved' }) });
    assert.equal(changedBackToApproved.response.status, 200);
    mine = await demo.request('/api/registrations');
    assert.equal(mine.payload.registrations[0].status, 'approved');
    assert.equal(mine.payload.registrations[0].rejection_reason, '');
    const team = teams.teams[0];
    const updated = await demo.request(`/api/teams/${team.id}`, { method: 'PUT', body: JSON.stringify({ ...team, name: `${team.name}更新`, coach_ids: team.coaches.map((coach) => coach.id), member_ids: team.members.map((member) => member.id), contact_coach_id: team.contact_coach_id }) });
    assert.equal(updated.response.status, 200);
    mine = await demo.request('/api/registrations');
    assert.equal(mine.payload.registrations[0].status, 'pending', '已审核战队资料变化后必须重新审核');
  } finally { await app.close(); }
});

test('管理员可搜索审核与已有战队，已结束赛事自动移出审核工作台但保留历史', async () => {
  const app = await setup();
  const demo = client(app.base);
  const admin = client(app.base);
  try {
    await demo.login('demo@ruibude.local', 'Demo123!');
    const { payload: teamPayload } = await demo.request('/api/teams');
    const { payload: eventPayload } = await demo.request('/api/events');
    const team = teamPayload.teams[0];
    const activeEvent = eventPayload.events.find((item) => item.registration_open && item.groups.includes(team.group_name));
    const endedEvent = eventPayload.events.find((item) => item.time_status === 'ended');
    assert.ok(activeEvent);
    assert.ok(endedEvent);

    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const proof = await demo.request('/api/uploads', { method: 'POST', body: JSON.stringify({ kind: 'payment', dataUrl: tinyPng }) });
    const activeRegistration = await demo.request('/api/registrations', { method: 'POST', body: JSON.stringify({ event_id: activeEvent.id, team_id: team.id, group_name: team.group_name, payment_proof_url: proof.payload.url }) });
    assert.equal(activeRegistration.response.status, 201);

    const timestamp = new Date().toISOString();
    const expiredRegistration = app.db.prepare(`INSERT INTO registrations(event_id,team_id,user_id,group_name,payment_proof_url,status,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?)`)
      .run(endedEvent.id, team.id, team.user_id, team.group_name, proof.payload.url, timestamp, timestamp);
    app.db.prepare(`INSERT INTO activity_applications(event_id,user_id,type,name,gender,id_number,phone,email,organization,volunteer_role,availability,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`)
      .run(endedEvent.id, team.user_id, 'volunteer', '过期志愿者', '女', '310101200001010028', '13761393714', 'expired@example.com', '过期活动单位', '检录协助', '全天', timestamp, timestamp);
    const activeActivity = app.db.prepare(`INSERT INTO activity_applications(event_id,user_id,type,name,gender,id_number,phone,email,organization,volunteer_role,availability,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`)
      .run(activeEvent.id, team.user_id, 'volunteer', '当前志愿者', '女', '310101200001010029', '13761393714', 'active@example.com', '当前活动单位', '赛事服务', '全天', timestamp, timestamp);

    const forbiddenTeams = await demo.request('/api/admin/teams');
    assert.equal(forbiddenTeams.response.status, 403);
    const forbiddenRoleChange = await demo.request(`/api/admin/users/${team.user_id}/role`, { method: 'POST', body: JSON.stringify({ role: 'admin' }) });
    assert.equal(forbiddenRoleChange.response.status, 403);
    await admin.login('admin@ruibude.local', 'Admin123!');

    const searchedRegistration = await admin.request(`/api/admin/registrations?q=${encodeURIComponent(team.number)}`);
    assert.equal(searchedRegistration.payload.registrations.length, 1);
    assert.equal(searchedRegistration.payload.registrations[0].id, activeRegistration.payload.id);
    const eventRegistrations = await admin.request(`/api/admin/registrations?event_id=${activeEvent.id}&group=${encodeURIComponent(team.group_name)}`);
    assert.deepEqual(eventRegistrations.payload.registrations.map((item) => item.id), [activeRegistration.payload.id]);
    const otherGroupRegistrations = await admin.request(`/api/admin/registrations?event_id=${activeEvent.id}&group=${encodeURIComponent('RECF-Engage 小学组')}`);
    assert.equal(otherGroupRegistrations.payload.registrations.length, 0);
    const invalidRegistrationEvent = await admin.request('/api/admin/registrations?event_id=invalid');
    assert.equal(invalidRegistrationEvent.response.status, 422);
    const expiredSearch = await admin.request('/api/admin/registrations?q=%E8%BF%87%E6%9C%9F');
    assert.equal(expiredSearch.payload.registrations.length, 0);

    const mine = await demo.request('/api/registrations');
    assert.ok(mine.payload.registrations.some((item) => item.id === Number(expiredRegistration.lastInsertRowid)), '用户历史仍应包含已结束赛事报名');
    const myActivities = await demo.request('/api/activity-applications');
    assert.ok(myActivities.payload.applications.some((item) => item.name === '过期志愿者'), '用户活动报名历史仍应保留');

    const searchedActivities = await admin.request('/api/admin/activity-applications?q=%E8%BF%87%E6%9C%9F%E5%BF%97%E6%84%BF%E8%80%85');
    assert.equal(searchedActivities.payload.applications.length, 0);
    const eventActivities = await admin.request(`/api/admin/activity-applications?event_id=${activeEvent.id}`);
    assert.deepEqual(eventActivities.payload.applications.map((item) => item.id), [Number(activeActivity.lastInsertRowid)]);
    const invalidActivityEvent = await admin.request('/api/admin/activity-applications?event_id=-1');
    assert.equal(invalidActivityEvent.response.status, 422);
    const summary = await admin.request('/api/admin/summary');
    assert.equal(summary.payload.summary.pending, 1);
    assert.equal(summary.payload.summary.activity_pending, 1);

    const teams = await admin.request(`/api/admin/teams?q=${encodeURIComponent(team.number)}`);
    assert.equal(teams.response.status, 200);
    assert.equal(teams.payload.teams.length, 1);
    assert.equal(teams.payload.teams[0].owner_email, 'demo@ruibude.local');
    assert.equal(teams.payload.teams[0].registration_count, 2);
    const teamDetail = await admin.request(`/api/admin/teams/${team.id}`);
    assert.equal(teamDetail.payload.team.coaches.length, 1);
    assert.equal(teamDetail.payload.team.members.length, 1);
    assert.ok(teamDetail.payload.team.available_coaches.length >= 1);
    assert.ok(teamDetail.payload.team.available_members.length >= 1);
    assert.equal(teamDetail.payload.team.owner_email, 'demo@ruibude.local');

    for (const searchTerm of ['demo', '演示用户', 'demo@ruibude.local', team.number, team.name, team.coaches[0].name, team.members[0].name]) {
      const users = await admin.request(`/api/admin/users?q=${encodeURIComponent(searchTerm)}`);
      assert.equal(users.response.status, 200);
      assert.equal(users.payload.users.length, 1, `应能通过“${searchTerm}”定位用户`);
      assert.equal(users.payload.users[0].username, 'demo');
    }
    const userDetail = await admin.request(`/api/admin/users/${team.user_id}`);
    assert.equal(userDetail.response.status, 200);
    assert.equal(userDetail.payload.user.username, 'demo');
    assert.equal(userDetail.payload.user.role, 'user');
    assert.ok(userDetail.payload.user.teams.some((item) => item.id === team.id));
    assert.ok(userDetail.payload.user.coaches.some((item) => item.name === team.coaches[0].name));
    assert.ok(userDetail.payload.user.members.some((item) => item.name === team.members[0].name));
    assert.ok(userDetail.payload.user.registrations.some((item) => item.id === activeRegistration.payload.id));

    const approved = await admin.request(`/api/admin/registrations/${activeRegistration.payload.id}/review`, { method: 'POST', body: JSON.stringify({ status: 'approved' }) });
    assert.equal(approved.response.status, 200);
    const adminUpdated = await admin.request(`/api/admin/teams/${team.id}`, { method: 'PUT', body: JSON.stringify({ ...team, name: `${team.name}（管理员修订）`, coach_ids: team.coaches.map((coach) => coach.id), member_ids: team.members.map((member) => member.id), contact_coach_id: team.contact_coach_id }) });
    assert.equal(adminUpdated.response.status, 200);
    const updatedDetail = await admin.request(`/api/admin/teams/${team.id}`);
    assert.equal(updatedDetail.payload.team.name, `${team.name}（管理员修订）`);
    const resetRegistration = await admin.request(`/api/admin/registrations?q=${encodeURIComponent(team.number)}`);
    assert.equal(resetRegistration.payload.registrations[0].status, 'pending', '管理员修改战队后已审核报名必须重新审核');

    const blockedDelete = await admin.request(`/api/admin/teams/${team.id}`, { method: 'DELETE' });
    assert.equal(blockedDelete.response.status, 409, '已有报名历史的战队不可删除');
    const disposable = await demo.request('/api/teams', { method: 'POST', body: JSON.stringify({ ...team, number: 'TEMP-ADMIN-01', name: '管理员删除测试战队', coach_ids: team.coaches.map((coach) => coach.id), member_ids: team.members.map((member) => member.id), contact_coach_id: team.contact_coach_id }) });
    assert.equal(disposable.response.status, 201);
    const deleted = await admin.request(`/api/admin/teams/${disposable.payload.id}`, { method: 'DELETE' });
    assert.equal(deleted.response.status, 200);
    const missing = await admin.request(`/api/admin/teams/${disposable.payload.id}`);
    assert.equal(missing.response.status, 404);

    const allUsers = await admin.request('/api/admin/users');
    assert.ok(allUsers.payload.users.some((item) => item.email === 'admin@ruibude.local' && item.role === 'admin'));
    assert.ok(allUsers.payload.users.some((item) => item.email === 'demo@ruibude.local' && item.role === 'user'));
    const currentAdmin = app.db.prepare("SELECT id FROM users WHERE email='admin@ruibude.local'").get();
    const blockedSelfDemotion = await admin.request(`/api/admin/users/${currentAdmin.id}/role`, { method: 'POST', body: JSON.stringify({ role: 'user' }) });
    assert.equal(blockedSelfDemotion.response.status, 409);
    assert.match(blockedSelfDemotion.payload.error, /不能降低当前登录管理员自己的权限/);
    const promoted = await admin.request(`/api/admin/users/${team.user_id}/role`, { method: 'POST', body: JSON.stringify({ role: 'admin' }) });
    assert.equal(promoted.response.status, 200);
    assert.equal(app.db.prepare('SELECT role FROM users WHERE id=?').get(team.user_id).role, 'admin');
    const revokedDemoSession = await demo.request('/api/admin/summary');
    assert.equal(revokedDemoSession.response.status, 401, '权限变化后目标账号的已有会话应失效');
    const promotedDetail = await admin.request(`/api/admin/users/${team.user_id}`);
    assert.equal(promotedDetail.payload.user.role, 'admin');
    const demoted = await admin.request(`/api/admin/users/${team.user_id}/role`, { method: 'POST', body: JSON.stringify({ role: 'user' }) });
    assert.equal(demoted.response.status, 200);
    assert.equal(app.db.prepare('SELECT role FROM users WHERE id=?').get(team.user_id).role, 'user');
    const demotedDetail = await admin.request(`/api/admin/users/${team.user_id}`);
    assert.equal(demotedDetail.payload.user.role, 'user');

    const retainedEvents = await admin.request('/api/admin/events');
    assert.ok(retainedEvents.payload.events.some((item) => item.id === endedEvent.id), '赛事结束后仍应保留，等待管理员决定是否删除');
    const deletedEvent = await admin.request(`/api/admin/events/${endedEvent.id}`, { method: 'DELETE' });
    assert.equal(deletedEvent.response.status, 200);
    assert.equal(app.db.prepare('SELECT COUNT(*) count FROM events WHERE id=?').get(endedEvent.id).count, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) count FROM registrations WHERE event_id=?').get(endedEvent.id).count, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) count FROM activity_applications WHERE event_id=?').get(endedEvent.id).count, 0);
  } finally { await app.close(); }
});

test('志愿者与观赛报名可提交、查询、修改并由管理员审核', async () => {
  const app = await setup();
  const demo = client(app.base);
  const admin = client(app.base);
  const anonymous = client(app.base);
  try {
    const unauthenticated = await anonymous.request('/api/activity-applications?type=volunteer');
    assert.equal(unauthenticated.response.status, 401);

    await demo.login('demo@ruibude.local', 'Demo123!');
    const { payload: eventPayload } = await demo.request('/api/events');
    const event = eventPayload.events.find((item) => item.registration_open);
    assert.ok(event, '测试数据应包含开放报名的赛事');

    const volunteerData = {
      type: 'volunteer', event_id: event.id, name: '张志愿', gender: '女', id_number: '310101200001010028',
      phone: '13761393714', email: 'volunteer@example.com', organization: '瑞卜德志愿服务队',
      volunteer_role: '检录协助', availability: '赛事两天 08:00-18:00 均可到场', experience: '有校园科技节服务经验', notes: '',
    };
    const disabledVolunteer = await demo.request('/api/activity-applications', { method: 'POST', body: JSON.stringify(volunteerData) });
    assert.equal(disabledVolunteer.response.status, 409);
    assert.match(disabledVolunteer.payload.error, /暂未开放志愿者报名/);

    await admin.login('admin@ruibude.local', 'Admin123!');
    const adminEvents = await admin.request('/api/admin/events');
    const editableEvent = adminEvents.payload.events.find((item) => item.id === event.id);
    const enabled = await admin.request(`/api/admin/events/${event.id}`, { method: 'PUT', body: JSON.stringify({ ...editableEvent, allow_volunteer: true, allow_spectator: true }) });
    assert.equal(enabled.response.status, 200);
    const enabledPublicEvent = await demo.request('/api/events');
    assert.equal(enabledPublicEvent.payload.events.find((item) => item.id === event.id).allow_volunteer, true);
    assert.equal(enabledPublicEvent.payload.events.find((item) => item.id === event.id).allow_spectator, true);

    const volunteer = await demo.request('/api/activity-applications', { method: 'POST', body: JSON.stringify(volunteerData) });
    assert.equal(volunteer.response.status, 201);
    const duplicate = await demo.request('/api/activity-applications', { method: 'POST', body: JSON.stringify(volunteerData) });
    assert.equal(duplicate.response.status, 409);

    const spectatorData = {
      type: 'spectator', event_id: event.id, name: '李观众', gender: '男', id_number: '310101199901010019',
      phone: '13800001234', email: 'spectator@example.com', organization: '瑞卜德实验学校',
      attendee_count: 2, companion_names: '李小观', notes: '携带一名儿童',
    };
    const spectator = await demo.request('/api/activity-applications', { method: 'POST', body: JSON.stringify(spectatorData) });
    assert.equal(spectator.response.status, 201);
    const mine = await demo.request('/api/activity-applications');
    assert.equal(mine.payload.applications.length, 2);
    assert.equal(mine.payload.applications.find((item) => item.type === 'volunteer').id_number, volunteerData.id_number);

    const pending = await admin.request('/api/admin/activity-applications?status=pending');
    assert.equal(pending.payload.applications.length, 2);
    assert.equal(pending.payload.applications.find((item) => item.id === volunteer.payload.id).volunteer_role, '检录协助');
    const approved = await admin.request(`/api/admin/activity-applications/${volunteer.payload.id}/review`, { method: 'POST', body: JSON.stringify({ status: 'approved' }) });
    assert.equal(approved.response.status, 200);
    const volunteerApprovedMail = activityApplicationReviewEmailPayload({ ...volunteerData, event_title: event.title, starts_at: event.starts_at, ends_at: event.ends_at, location: event.location }, 'approved');
    assert.ok(volunteerApprovedMail.text.includes(`Your volunteer registration application to the competition ${event.title} has been approved.`));
    assert.ok(volunteerApprovedMail.text.includes(PLATFORM_NAME));
    const rejected = await admin.request(`/api/admin/activity-applications/${spectator.payload.id}/review`, { method: 'POST', body: JSON.stringify({ status: 'rejected', reason: '请补充同行人员信息' }) });
    assert.equal(rejected.response.status, 200);
    const spectatorRejectMail = activityApplicationReviewEmailPayload({ ...spectatorData, event_title: event.title, starts_at: event.starts_at, ends_at: event.ends_at, location: event.location, rejection_reason: '请补充同行人员信息' }, 'rejected');
    assert.match(spectatorRejectMail.subject, /观赛报名未通过/);
    assert.ok(spectatorRejectMail.text.includes(`Your spectator registration application to the competition ${event.title} has not been approved.`));
    assert.ok(spectatorRejectMail.text.includes(`Please log in to ${PLATFORM_NAME} to view the status`));
    assert.ok(!spectatorRejectMail.text.includes('请补充同行人员信息'), '活动报名驳回邮件正文不得包含后台驳回原因');
    assert.ok(!spectatorRejectMail.html.includes('请补充同行人员信息'), '活动报名驳回邮件 HTML 不得包含后台驳回原因');

    const locked = await demo.request(`/api/activity-applications/${volunteer.payload.id}`, { method: 'PUT', body: JSON.stringify(volunteerData) });
    assert.equal(locked.response.status, 409);
    const volunteerChangedToRejected = await admin.request(`/api/admin/activity-applications/${volunteer.payload.id}/review`, { method: 'POST', body: JSON.stringify({ status: 'rejected', reason: '复核后需要补充服务时间' }) });
    assert.equal(volunteerChangedToRejected.response.status, 200);
    const volunteerRejectedDetail = await demo.request(`/api/activity-applications/${volunteer.payload.id}`);
    assert.equal(volunteerRejectedDetail.payload.application.status, 'rejected');
    assert.equal(volunteerRejectedDetail.payload.application.rejection_reason, '复核后需要补充服务时间');
    const volunteerChangedBackToApproved = await admin.request(`/api/admin/activity-applications/${volunteer.payload.id}/review`, { method: 'POST', body: JSON.stringify({ status: 'approved' }) });
    assert.equal(volunteerChangedBackToApproved.response.status, 200);
    const volunteerApprovedDetail = await demo.request(`/api/activity-applications/${volunteer.payload.id}`);
    assert.equal(volunteerApprovedDetail.payload.application.status, 'approved');
    assert.equal(volunteerApprovedDetail.payload.application.rejection_reason, '');
    const resubmitted = await demo.request(`/api/activity-applications/${spectator.payload.id}`, { method: 'PUT', body: JSON.stringify({ ...spectatorData, companion_names: '李小观（儿童）' }) });
    assert.equal(resubmitted.response.status, 200);
    const spectatorDetail = await demo.request(`/api/activity-applications/${spectator.payload.id}`);
    assert.equal(spectatorDetail.payload.application.status, 'pending');
    assert.equal(spectatorDetail.payload.application.rejection_reason, '');
    const summary = await admin.request('/api/admin/summary');
    assert.equal(summary.payload.summary.activity_pending, 1);

    const disabled = await admin.request(`/api/admin/events/${event.id}`, { method: 'PUT', body: JSON.stringify({ ...editableEvent, allow_volunteer: true, allow_spectator: false }) });
    assert.equal(disabled.response.status, 200);
    const blockedAfterClose = await demo.request(`/api/activity-applications/${spectator.payload.id}`, { method: 'PUT', body: JSON.stringify(spectatorData) });
    assert.equal(blockedAfterClose.response.status, 409);
    assert.match(blockedAfterClose.payload.error, /暂未开放观赛报名/);
  } finally { await app.close(); }
});

test('敏感上传、CSRF 与管理员边界均由服务端强制执行', async () => {
  const app = await setup();
  const demo = client(app.base);
  const anonymous = client(app.base);
  const admin = client(app.base);
  try {
  await demo.login('demo@ruibude.local', 'Demo123!');
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const proof = await demo.request('/api/uploads', { method: 'POST', body: JSON.stringify({ kind: 'payment', dataUrl: tinyPng }) });
    assert.equal(proof.response.status, 201);

    const blocked = await anonymous.request(proof.payload.url);
    assert.equal(blocked.response.status, 403);
    const ownerView = await demo.request(proof.payload.url);
    assert.equal(ownerView.response.status, 200);
    assert.equal(ownerView.response.headers.get('cache-control'), 'private,no-store');

    const notice = await demo.request('/api/uploads', { method: 'POST', body: JSON.stringify({ kind: 'notice', dataUrl: tinyPng }) });
    assert.equal(notice.response.status, 403);
    const adminDenied = await demo.request('/api/admin/summary');
    assert.equal(adminDenied.response.status, 403);
    const csrfDenied = await demo.request('/api/profile', { method: 'PUT', headers: { 'X-CSRF-Token': 'invalid' }, body: JSON.stringify({ nickname: '不应保存' }) });
    assert.equal(csrfDenied.response.status, 403);

    const { payload: teams } = await demo.request('/api/teams');
    const { payload: events } = await demo.request('/api/events');
    const event = events.events.find((item) => item.registration_open && item.groups.includes(teams.teams[0].group_name));
    const fakeProof = await demo.request('/api/registrations', { method: 'POST', body: JSON.stringify({ event_id: event.id, team_id: teams.teams[0].id, group_name: teams.teams[0].group_name, payment_proof_url: '/assets/favicon.svg' }) });
    assert.equal(fakeProof.response.status, 422);

  await admin.login('admin@ruibude.local', 'Admin123!');
    const adminView = await admin.request(proof.payload.url);
    assert.equal(adminView.response.status, 200);
  } finally { await app.close(); }
});

test('用户可在报名截止前取消比赛并申请退费，管理员可处理退费和导出分组 Excel ZIP', async () => {
  const app = await setup();
  const demo = client(app.base);
  const admin = client(app.base);
  try {
    await demo.login('demo@ruibude.local', 'Demo123!');
    const { payload: teams } = await demo.request('/api/teams');
    const { payload: events } = await demo.request('/api/events');
    const team = teams.teams[0];
    const event = events.events.find((item) => item.registration_open && item.groups.includes(team.group_name));
    assert.ok(event, '测试数据应存在报名中的赛事');
    assert.equal(event.refund_deadline_days, 10);
    assert.equal(event.refund_deadline_label, '2026年09月10日 24:00');
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const proof = await demo.request('/api/uploads', { method: 'POST', body: JSON.stringify({ kind: 'payment', dataUrl: tinyPng }) });
    const created = await demo.request('/api/registrations', { method: 'POST', body: JSON.stringify({ event_id: event.id, team_id: team.id, group_name: team.group_name, payment_proof_url: proof.payload.url }) });
    assert.equal(created.response.status, 201);

    app.db.prepare('UPDATE events SET refund_deadline_days=365 WHERE id=?').run(event.id);
    let mine = await demo.request('/api/registrations');
    let registration = mine.payload.registrations.find((item) => item.id === created.payload.id);
    assert.equal(registration.can_request_refund, false);
    const lateRefund = await demo.request(`/api/registrations/${created.payload.id}/refund`, { method: 'POST', body: JSON.stringify({ reason: '超过赛事设置的退费申请截止日期' }) });
    assert.equal(lateRefund.response.status, 409);
    assert.match(lateRefund.payload.error, /已超过截止提交退费申请日期/);
    app.db.prepare('UPDATE events SET refund_deadline_days=10 WHERE id=?').run(event.id);

    const requested = await demo.request(`/api/registrations/${created.payload.id}/refund`, { method: 'POST', body: JSON.stringify({ reason: '行程调整，申请原路退回参赛费' }) });
    assert.equal(requested.response.status, 200);
    mine = await demo.request('/api/registrations');
    registration = mine.payload.registrations.find((item) => item.id === created.payload.id);
    assert.equal(registration.refund_status, 'requested');
    assert.equal(registration.refund_request_count, 1);
    assert.equal(registration.can_request_refund, false);
    assert.equal(registration.can_cancel, true);

    await admin.login('admin@ruibude.local', 'Admin123!');
    const exported = await admin.request(`/api/admin/events/${event.id}/export`);
    assert.equal(exported.response.status, 200);
    assert.match(exported.response.headers.get('content-type'), /application\/zip/);
    assert.match(exported.response.headers.get('content-disposition'), /\.zip/);
    assert.equal(Number(exported.response.headers.get('x-export-group-count')), event.groups.length);
    const groupWorkbooks = readZipEntries(exported.payload);
    assert.equal(groupWorkbooks.size, event.groups.length, '每个赛事组别都应生成一个独立 Excel 文件');
    assert.ok([...groupWorkbooks.keys()].every((name) => name.endsWith('.xlsx')), '压缩包内只应包含独立的 XLSX 工作簿');
    const selectedWorkbookName = [...groupWorkbooks.keys()].find((name) => name.includes(team.group_name));
    assert.ok(selectedWorkbookName, `应生成 ${team.group_name} 对应的工作簿`);
    const selectedWorkbook = readZipEntries(groupWorkbooks.get(selectedWorkbookName));
    for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) assert.ok(selectedWorkbook.has(part), `XLSX 应包含 ${part}`);
    const selectedSheet = selectedWorkbook.get('xl/worksheets/sheet1.xml').toString('utf8');
    for (const expectedHeader of ['报名取消状态', '报名取消原因', '报名取消时间']) assert.ok(selectedSheet.includes(expectedHeader), `导出表应明确 ${expectedHeader}`);
    for (const expected of ['XN-2401', '星航战队', '李老师', '13800000001', '张小航', '行程调整']) assert.ok(selectedSheet.includes(expected), `对应组别导出表应包含 ${expected}`);
    assert.match(selectedSheet, /pane ySplit="3"/, '导出表应冻结标题和表头行');
    assert.match(selectedSheet, /autoFilter ref="A3:AF/, '导出表应保留自动筛选');
    const anotherWorkbookName = [...groupWorkbooks.keys()].find((name) => name !== selectedWorkbookName);
    const anotherSheet = readZipEntries(groupWorkbooks.get(anotherWorkbookName)).get('xl/worksheets/sheet1.xml').toString('utf8');
    assert.ok(!anotherSheet.includes('XN-2401'), '报名数据不得泄漏到其他组别的工作簿');

    const approved = await admin.request(`/api/admin/registrations/${created.payload.id}/refund-review`, { method: 'POST', body: JSON.stringify({ status: 'approved', note: '财务将在 5 个工作日内原路退款' }) });
    assert.equal(approved.response.status, 200);
    mine = await demo.request('/api/registrations');
    registration = mine.payload.registrations.find((item) => item.id === created.payload.id);
    assert.equal(registration.refund_status, 'approved');
    assert.equal(registration.status, 'rejected');
    assert.equal(registration.rejection_reason, '退费申请已同意，报名状态已自动驳回');

    const blockedApproval = await admin.request(`/api/admin/registrations/${created.payload.id}/review`, { method: 'POST', body: JSON.stringify({ status: 'approved' }) });
    assert.equal(blockedApproval.response.status, 409);

    const changedToRejected = await admin.request(`/api/admin/registrations/${created.payload.id}/refund-review`, { method: 'POST', body: JSON.stringify({ status: 'rejected', note: '付款记录需重新核实' }) });
    assert.equal(changedToRejected.response.status, 200);
    mine = await demo.request('/api/registrations');
    registration = mine.payload.registrations.find((item) => item.id === created.payload.id);
    assert.equal(registration.refund_status, 'rejected');
    assert.equal(registration.refund_request_count, 1);
    assert.equal(registration.can_request_refund, true);

    const reapplied = await demo.request(`/api/registrations/${created.payload.id}/refund`, { method: 'POST', body: JSON.stringify({ reason: '补充付款信息后再次申请退费' }) });
    assert.equal(reapplied.response.status, 200);
    mine = await demo.request('/api/registrations');
    registration = mine.payload.registrations.find((item) => item.id === created.payload.id);
    assert.equal(registration.refund_status, 'requested');
    assert.equal(registration.refund_request_count, 2);
    assert.equal(registration.can_request_refund, false);

    const secondRejected = await admin.request(`/api/admin/registrations/${created.payload.id}/refund-review`, { method: 'POST', body: JSON.stringify({ status: 'rejected', note: '第二次仍无法核实付款' }) });
    assert.equal(secondRejected.response.status, 200);
    mine = await demo.request('/api/registrations');
    registration = mine.payload.registrations.find((item) => item.id === created.payload.id);
    assert.equal(registration.refund_status, 'rejected');
    assert.equal(registration.can_request_refund, false);
    const thirdRefund = await demo.request(`/api/registrations/${created.payload.id}/refund`, { method: 'POST', body: JSON.stringify({ reason: '第三次申请退费' }) });
    assert.equal(thirdRefund.response.status, 409);
    assert.match(thirdRefund.payload.error, /最多可提交 2 次退费申请/);

    const cancelled = await demo.request(`/api/registrations/${created.payload.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: '确定无法参赛' }) });
    assert.equal(cancelled.response.status, 200);
    mine = await demo.request('/api/registrations');
    registration = mine.payload.registrations.find((item) => item.id === created.payload.id);
    assert.ok(registration.cancelled_at);
    assert.equal(registration.cancellation_reason, '确定无法参赛');
    assert.equal(registration.can_cancel, false);
    assert.equal(registration.can_reapply, true);

    const duplicateAfterCancel = await demo.request('/api/registrations', { method: 'POST', body: JSON.stringify({ event_id: event.id, team_id: team.id, group_name: team.group_name, payment_proof_url: proof.payload.url }) });
    assert.equal(duplicateAfterCancel.response.status, 409);
    assert.match(duplicateAfterCancel.payload.error, /右上角下拉栏 -> 我的比赛 -> 对应比赛打开列表 -> 重新申请参赛/);

    app.db.prepare("UPDATE events SET registration_end='2026-08-01T00:00:00.000Z' WHERE id=?").run(event.id);
    mine = await demo.request('/api/registrations');
    registration = mine.payload.registrations.find((item) => item.id === created.payload.id);
    assert.equal(registration.can_reapply, false, '超过报名截止日期后不应显示重新申请参赛');
    const expiredReapply = await demo.request(`/api/registrations/${created.payload.id}/reapply`, { method: 'POST', body: JSON.stringify({ team_id: team.id, group_name: team.group_name, payment_proof_url: proof.payload.url }) });
    assert.equal(expiredReapply.response.status, 409);
    app.db.prepare('UPDATE events SET registration_end=? WHERE id=?').run(event.registration_end, event.id);

    app.db.prepare("UPDATE events SET starts_at='2026-08-01T00:00:00.000Z' WHERE id=?").run(event.id);
    mine = await demo.request('/api/registrations');
    registration = mine.payload.registrations.find((item) => item.id === created.payload.id);
    assert.equal(registration.can_reapply, false, '比赛开始后不应显示重新申请参赛');
    const startedReapply = await demo.request(`/api/registrations/${created.payload.id}/reapply`, { method: 'POST', body: JSON.stringify({ team_id: team.id, group_name: team.group_name, payment_proof_url: proof.payload.url }) });
    assert.equal(startedReapply.response.status, 409);
    assert.match(startedReapply.payload.error, /比赛已开始/);
    app.db.prepare('UPDATE events SET starts_at=? WHERE id=?').run(event.starts_at, event.id);

    const pending = await admin.request('/api/admin/registrations?status=pending');
    assert.ok(!pending.payload.registrations.some((item) => item.id === created.payload.id), '已取消报名不应继续出现在待审核列表');
    const blockedReview = await admin.request(`/api/admin/registrations/${created.payload.id}/review`, { method: 'POST', body: JSON.stringify({ status: 'approved' }) });
    assert.equal(blockedReview.response.status, 409);
    const retained = app.db.prepare('SELECT cancelled_at,refund_status FROM registrations WHERE id=?').get(created.payload.id);
    assert.ok(retained.cancelled_at, '取消后应保留报名历史');
    assert.equal(retained.refund_status, 'rejected');

    const cancelledExport = await admin.request(`/api/admin/events/${event.id}/export?scope=cancelled`);
    assert.equal(cancelledExport.response.status, 200);
    assert.equal(cancelledExport.response.headers.get('x-export-scope'), 'cancelled');
    const cancelledWorkbooks = readZipEntries(cancelledExport.payload);
    const cancelledWorkbookName = [...cancelledWorkbooks.keys()].find((name) => name.includes(team.group_name));
    assert.ok(cancelledWorkbookName, '取消参赛导出应按赛事组别生成工作簿');
    const cancelledSheet = readZipEntries(cancelledWorkbooks.get(cancelledWorkbookName)).get('xl/worksheets/sheet1.xml').toString('utf8');
    assert.ok(cancelledSheet.includes('取消参赛赛队信息'));
    assert.ok(cancelledSheet.includes('XN-2401'), '取消参赛导出应包含已取消或已驳回的战队');
    assert.ok(cancelledSheet.includes('确定无法参赛'));

    const participationReapplied = await demo.request(`/api/registrations/${created.payload.id}/reapply`, { method: 'POST', body: JSON.stringify({ team_id: team.id, group_name: team.group_name, payment_proof_url: proof.payload.url }) });
    assert.equal(participationReapplied.response.status, 200);
    mine = await demo.request('/api/registrations');
    registration = mine.payload.registrations.find((item) => item.id === created.payload.id);
    assert.equal(registration.status, 'pending');
    assert.equal(registration.cancelled_at, null);
    assert.equal(registration.cancellation_reason, '');
    assert.equal(registration.refund_status, 'none');
    assert.equal(registration.refund_request_count, 2, '重新申请参赛不应重置退费申请次数');
    assert.equal(registration.can_reapply, false);
    const pendingAgain = await admin.request('/api/admin/registrations?status=pending');
    assert.ok(pendingAgain.payload.registrations.some((item) => item.id === created.payload.id), '重新申请参赛后应重新进入待审核列表');
  } finally { await app.close(); }
});
