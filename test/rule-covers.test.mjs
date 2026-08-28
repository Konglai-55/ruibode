import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const rulesDir = resolve('public/assets/rules');

test('规则封面由当前 PDF 第一页同步生成', async () => {
  const manifest = JSON.parse(await readFile(join(rulesDir, 'cover-manifest.json'), 'utf8'));
  assert.equal(manifest.length, 3);

  for (const item of manifest) {
    const pdf = await readFile(join(rulesDir, item.pdf));
    const cover = await readFile(join(rulesDir, item.cover));
    assert.equal(createHash('sha256').update(pdf).digest('hex'), item.pdfSha256, `${item.pdf} 已更新，请运行 npm run sync-rule-covers`);
    assert.deepEqual([...cover.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${item.cover} 不是有效 PNG`);
    assert.equal(cover.readUInt32BE(16), 850, `${item.cover} 宽度应为 850px`);
    assert.equal(cover.readUInt32BE(20), 1100, `${item.cover} 高度应为 1100px`);
  }
});
