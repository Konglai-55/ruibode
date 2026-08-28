import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

const rulesDir = resolve('public/assets/rules');
const tempRoot = resolve('tmp/pdfs');
const programs = [
  {
    program: 'RECF Engage',
    pdf: 'RECF·飞跃巅峰·小初塑料·1.1.pdf',
    cover: 'recf-engage-cover.png',
  },
  {
    program: 'RECF Achieve',
    pdf: 'RECF·高瞻远瞩·初高金属·1.2.pdf',
    cover: 'recf-achieve-cover.png',
  },
  {
    program: 'RECF Inspire',
    pdf: 'RECF·高瞻远瞩·大学金属·1.2.pdf',
    cover: 'recf-inspire-cover.png',
  },
];

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true });
    child.once('error', rejectRun);
    child.once('exit', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

await mkdir(tempRoot, { recursive: true });
const tempDir = await mkdtemp(join(tempRoot, 'rule-covers-'));

try {
  const manifest = [];
  for (const item of programs) {
    const pdfPath = join(rulesDir, item.pdf);
    const outputPath = join(rulesDir, item.cover);
    const outputPrefix = join(tempDir, item.cover.replace(/\.png$/i, ''));
    await run(process.env.PDFTOPPM_BIN || 'pdftoppm', [
      '-f', '1',
      '-l', '1',
      '-singlefile',
      '-png',
      '-r', '100',
      pdfPath,
      outputPrefix,
    ]);
    await mkdir(dirname(outputPath), { recursive: true });
    await copyFile(`${outputPrefix}.png`, outputPath);
    manifest.push({ ...item, pdfSha256: await sha256(pdfPath) });
    process.stdout.write(`Synced ${item.cover} from ${item.pdf}\n`);
  }
  await writeFile(join(rulesDir, 'cover-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
