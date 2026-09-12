import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('赛事报名页面始终显示战队创建提示', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /<strong>若尚无可选参赛战队<\/strong>/);
  assert.match(source, /创建战队完成后即可返回本页面，完成对应战队的赛事报名。/);
  assert.doesNotMatch(source, /!teamsData\.teams\.length\?`<div class="warning-banner info-banner">/);
});
