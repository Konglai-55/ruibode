import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../server.mjs';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || join(homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright'));
const testDir = await mkdtemp(join(tmpdir(), 'ruibude-team-delete-'));
const { server, db } = await createApplication({
  dbPath: join(testDir, 'team-delete.db'),
  uploadDir: join(testDir, 'uploads'),
});
let browser;

try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const loginResponse = await context.request.post(`${base}/api/auth/login`, { data: { account: 'demo@ruibude.local', password: 'Demo123!' } });
  assert.equal(loginResponse.status(), 200);
  const auth = await loginResponse.json();
  const teamsResponse = await context.request.get(`${base}/api/teams`);
  const { teams } = await teamsResponse.json();
  const team = teams[0];
  assert.ok(team, '需要一支测试战队');

  db.prepare('DELETE FROM registrations WHERE team_id=?').run(team.id);
  const events = db.prepare('SELECT id,title FROM events ORDER BY id LIMIT 3').all();
  assert.equal(events.length, 3, '需要三项测试赛事');
  const now = new Date().toISOString();
  const insertRegistration = db.prepare(`INSERT INTO registrations(event_id,team_id,user_id,group_name,payment_proof_url,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?)`);
  for (const [index, status] of ['approved', 'pending', 'rejected'].entries()) {
    insertRegistration.run(events[index].id, team.id, auth.user.id, team.group_name, '/uploads/team-delete-check.png', status, now, now);
  }

  const page = await context.newPage();
  await page.goto(`${base}/#/account/teams`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '删除', exact: true }).first().click();
  const firstDialog = page.locator('.modal').last();
  await firstDialog.waitFor({ state: 'visible' });
  const firstConfirm = firstDialog.getByRole('button', { name: '确认删除', exact: true });
  const firstBox = await firstConfirm.boundingBox();
  await firstConfirm.click();

  const secondDialog = page.locator('.modal').last();
  await secondDialog.waitFor({ state: 'visible' });
  const secondText = await secondDialog.innerText();
  assert.match(secondText, /检测到该战队正在参与下列赛项/);
  for (const event of events) assert.ok(secondText.includes(event.title), `第二次确认应列出赛事：${event.title}`);
  for (const label of ['审核已通过', '待审核', '审核驳回']) assert.ok(secondText.includes(label), `第二次确认应列出状态：${label}`);
  assert.equal(await page.getByText('该战队已有参赛记录，无法删除').count(), 0, '不得再显示旧的阻断提示');

  const secondConfirm = secondDialog.getByRole('button', { name: /确认删除/ }).last();
  const secondBox = await secondConfirm.boundingBox();
  assert.ok(firstBox && secondBox && Math.abs(firstBox.x - secondBox.x) >= 40, '两次确认按钮应错位，避免连续误触');
  await secondConfirm.click();
  await secondDialog.waitFor({ state: 'hidden' });

  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM registrations WHERE team_id=?').get(team.id).count, 0, '二次确认后应删除全部参赛记录');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM teams WHERE id=?').get(team.id).count, 0, '二次确认后应删除战队');
  console.log('PASS: 二次确认会列出全部参赛记录，并级联删除报名与战队。');
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  db.close();
  await rm(testDir, { recursive: true, force: true });
}
