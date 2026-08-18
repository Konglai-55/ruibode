import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApplication } from '../server.mjs';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || join(homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright'));
let base = process.env.TEST_BASE_URL;
let ownedApp;
if (!base) {
const dir = await mkdtemp(join(tmpdir(), 'ruibude-visual-check-'));
  const { server, db } = await createApplication({
    dbPath: join(dir, 'visual.db'),
    uploadDir: join(dir, 'uploads'),
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  base = `http://127.0.0.1:${server.address().port}`;
  ownedApp = { dir, server, db };
}
const output = resolve('artifacts/visual-check');
await mkdir(output, { recursive: true });

function makePdfBuffer(label) {
  const text = String(label).replace(/[\\()]/g, '\\$&');
  const stream = `BT\n/F1 28 Tf\n72 760 Td\n(${text}) Tj\n0 -44 Td\n/F1 16 Tf\n(This is a generated notice PDF preview.) Tj\nET`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, 'ascii'));
    body += object;
  }
  const xrefOffset = Buffer.byteLength(body, 'ascii');
  body += `xref\n0 ${offsets.length}\n`;
  body += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'ascii');
}

async function login(context, email, password) {
  const response = await context.request.post(`${base}/api/auth/login`, { data: { account: email, password } });
  if (!response.ok()) throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
  return response.json();
}

let browser;
const errors = [];
const checks = [];

try {
browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });

for (const profile of [
  { name: 'desktop-home', viewport: { width: 1440, height: 1000 } },
  { name: 'mobile-home', viewport: { width: 375, height: 812 } },
]) {
  const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${profile.name}: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`${profile.name}: ${error.message}`));
  await page.goto(`${base}/#/home`, { waitUntil: 'networkidle' });
  await page.locator('.home-page').waitFor({ state: 'visible' });
  await page.locator('.home-hero-dots button').nth(2).click();
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${output}/${profile.name}.png`, fullPage: true });
  const homeInfo = await page.evaluate(() => {
    const heroRect = document.querySelector('.home-hero').getBoundingClientRect();
    const introRect = document.querySelector('.home-intro-panel').getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      title: document.querySelector('.home-intro-copy h1')?.textContent?.trim(),
      programCount: document.querySelectorAll('.home-program-logos img').length,
      dotCount: document.querySelectorAll('.home-hero-dots button').length,
      activeDot: document.querySelector('.home-hero-dots button.active')?.dataset.slideIndex,
      activeHero: document.querySelector('.home-hero-slide.is-active img')?.getAttribute('src'),
      heroRatio: Number((heroRect.width / heroRect.height).toFixed(2)),
      heroWidth: Math.round(heroRect.width),
      introWidth: Math.round(introRect.width),
      heroAligned: Math.abs(heroRect.left - introRect.left) <= 1 && Math.abs(heroRect.width - introRect.width) <= 1,
      firstHeroLoaded: document.querySelector('.home-hero-slide:first-child img')?.naturalWidth > 0,
      programImagesLoaded: [...document.querySelectorAll('.home-program-logos img')].every((image) => image.naturalWidth > 0),
      heroHrefs: [...document.querySelectorAll('.home-hero-link')].map((link) => link.getAttribute('href')),
      heroActions: [...document.querySelectorAll('.home-hero-link')].map((link) => link.dataset.action || ''),
      partnerHrefs: [...document.querySelectorAll('.home-partner-grid a')].map((link) => link.getAttribute('href')),
      partnerImageSrcs: [...document.querySelectorAll('.home-partner-grid img')].map((image) => image.getAttribute('src')),
      platformHrefs: [...document.querySelectorAll('.home-platform-logos a')].map((link) => link.getAttribute('href')),
      logoHrefs: [...document.querySelectorAll('.home-link-logo-link')].map((link) => link.getAttribute('href')),
      homeHref: document.querySelector('.desktop-nav a[href="#/home"], .mobile-drawer a[href="#/home"]')?.getAttribute('href'),
    };
  });
  const ratioValid = profile.name === 'desktop-home' ? homeInfo.heroRatio >= 2.78 && homeInfo.heroRatio <= 2.92 : homeInfo.heroRatio >= 1.7;
  const expectedHeroHrefs = ['https://recf.org/about-us/our-partners/', '#home-programs', 'http://robotvex.com/', '/assets/home/drone-competition.mp4', '/assets/home/drone-competition.mp4'];
  const expectedHeroActions = ['', 'scroll-home-programs', '', '', ''];
  const expectedPartnerHrefs = ['https://recf.org/about-us/our-partners/', 'https://coding.qq.com/home/', 'http://www.robotvex.com/'];
  const expectedPartnerImageSrcs = ['/assets/recf-header-logo.png', '/assets/home/partner-coding-logo.png', '/assets/ruibude-logo.jpg'];
  const expectedPlatformHrefs = ['/assets/home/drone-competition.mp4', '/assets/home/drone-competition.mp4'];
  const expectedLogoHrefs = ['https://recf.org/about-us/our-partners/', 'http://www.robotvex.com/'];
  checks.push({ profile: profile.name, ...homeInfo, overflow: homeInfo.scrollWidth > homeInfo.clientWidth + 1, valid: homeInfo.title === '准备好开启你的机器人竞技之旅了吗？' && homeInfo.programCount === 3 && homeInfo.dotCount === 5 && homeInfo.activeDot === '2' && homeInfo.activeHero === '/assets/home/hero-robotvex.png' && ratioValid && homeInfo.heroAligned && homeInfo.firstHeroLoaded && homeInfo.programImagesLoaded && homeInfo.homeHref === '#/home' && homeInfo.heroHrefs.join('|') === expectedHeroHrefs.join('|') && homeInfo.heroActions.join('|') === expectedHeroActions.join('|') && homeInfo.partnerHrefs.join('|') === expectedPartnerHrefs.join('|') && homeInfo.partnerImageSrcs.join('|') === expectedPartnerImageSrcs.join('|') && homeInfo.platformHrefs.join('|') === expectedPlatformHrefs.join('|') && homeInfo.logoHrefs.join('|') === expectedLogoHrefs.join('|') && homeInfo.scrollWidth <= homeInfo.clientWidth + 1 });
  await context.close();
}

for (const profile of [
  { name: 'desktop-about', viewport: { width: 1440, height: 1200 } },
  { name: 'mobile-about', viewport: { width: 375, height: 812 } },
]) {
  const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${profile.name}: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`${profile.name}: ${error.message}`));
  await page.goto(`${base}/#/about`, { waitUntil: 'networkidle' });
  await page.locator('.about-page').waitFor({ state: 'visible' });
  await page.screenshot({ path: `${output}/${profile.name}.png`, fullPage: true });
  const aboutInfo = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    title: document.querySelector('.about-title-band h1')?.textContent?.replace(/\s+/g, ''),
    programCount: document.querySelectorAll('.about-program-card').length,
    programImagesLoaded: [...document.querySelectorAll('.about-program-logo img')].every((image) => image.naturalWidth > 0),
    companyPhotoLoaded: document.querySelector('.about-company-photo')?.naturalWidth > 0,
    companyHeading: document.querySelector('.about-company-heading h2')?.textContent?.trim(),
    desktopAboutHref: document.querySelector('.desktop-nav a[href="#/about"]')?.getAttribute('href'),
    mobileAboutHref: document.querySelector('.mobile-drawer a[href="#/about"]')?.getAttribute('href'),
  }));
  checks.push({ profile: profile.name, ...aboutInfo, overflow: aboutInfo.scrollWidth > aboutInfo.clientWidth + 1, valid: aboutInfo.title === '上海瑞卜德教育科技有限公司RECF中国地区正式官方代表！' && aboutInfo.programCount === 3 && aboutInfo.programImagesLoaded && aboutInfo.companyPhotoLoaded && aboutInfo.companyHeading === '关于我们' && (aboutInfo.desktopAboutHref === '#/about' || aboutInfo.mobileAboutHref === '#/about') && aboutInfo.scrollWidth <= aboutInfo.clientWidth + 1 });
  await context.close();
}

for (const profile of [
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, route: '/#/events' },
  { name: 'tablet-landscape', viewport: { width: 1024, height: 768 }, route: '/#/events' },
  { name: 'tablet-portrait', viewport: { width: 768, height: 1024 }, route: '/#/events' },
  { name: 'mobile', viewport: { width: 375, height: 812 }, route: '/#/events' },
]) {
  const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${profile.name}: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`${profile.name}: ${error.message}`));
  await page.goto(`${base}${profile.route}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${output}/${profile.name}-events.png`, fullPage: true });
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, title: document.querySelector('h1')?.textContent?.trim() }));
  checks.push({ profile: profile.name, ...dimensions, overflow: dimensions.scrollWidth > dimensions.clientWidth + 1 });
  if (profile.name === 'desktop') {
    const brandVisible = await page.locator('.site-brand').isVisible();
    const primaryBrandLoaded = await page.locator('.site-brand-primary-logo').evaluate((image) => image.naturalWidth > 0);
    const partnerBrandLoaded = await page.locator('.site-brand-partner-logo').evaluate((image) => image.naturalWidth > 0);
    const brandHref = await page.locator('.site-brand').getAttribute('href');
    const homeHref = await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '首页', exact: true }).getAttribute('href');
    const aboutHref = await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '关于我们', exact: true }).getAttribute('href');
    const footerPrimaryLogoLoaded = await page.locator('.footer-primary-logo').evaluate((image) => image.naturalWidth > 0);
    const footerPartnerLogoLoaded = await page.locator('.footer-partner-logo').evaluate((image) => image.naturalWidth > 0);
    const activityButton = page.getByRole('button', { name: '活动报名' });
    await activityButton.click();
    const dropdown = page.locator('#activity-registration-menu');
    await dropdown.waitFor({ state: 'visible' });
    const activityItems = (await dropdown.locator('a').allTextContents()).map((text) => text.trim());
    const activityHrefs = await dropdown.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    const placeholderActions = await dropdown.locator('[data-action="coming-soon"]').count();
    const expanded = await activityButton.getAttribute('aria-expanded') === 'true';
    await page.screenshot({ path: `${output}/desktop-events-nav-open.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await dropdown.waitFor({ state: 'hidden' });
    const collapsedByEscape = await activityButton.getAttribute('aria-expanded') === 'false' && !(await dropdown.isVisible());
    const expectedItems = ['赛事报名'];
    checks.push({ profile: 'desktop-header', brandVisible, primaryBrandLoaded, partnerBrandLoaded, footerPrimaryLogoLoaded, footerPartnerLogoLoaded, brandHref, homeHref, aboutHref, activityItems, activityHrefs, placeholderActions, expanded, collapsedByEscape, valid: brandVisible && primaryBrandLoaded && partnerBrandLoaded && footerPrimaryLogoLoaded && footerPartnerLogoLoaded && brandHref === '#/home' && homeHref === '#/home' && aboutHref === '#/about' && expanded && collapsedByEscape && placeholderActions === 0 && activityItems.join('|') === expectedItems.join('|') && activityHrefs.join('|') === '#/events' });
  }
  if (profile.name === 'mobile') {
    const mobileToggle = page.locator('.mobile-toggle');
    await mobileToggle.click();
    const mobileDrawer = page.locator('.mobile-drawer');
    const mobileMenuVisible = await mobileDrawer.isVisible();
    const activityItems = (await page.locator('.mobile-nav-group a').allTextContents()).map((text) => text.trim());
    const mobileHomeHref = await mobileDrawer.locator('a', { hasText: '首页' }).getAttribute('href');
    const mobileAboutHref = await mobileDrawer.locator('a', { hasText: '关于我们' }).getAttribute('href');
    await page.screenshot({ path: `${output}/mobile-events-menu-open.png`, fullPage: true });
    await mobileToggle.click();
    const mobileMenuClosed = !(await mobileDrawer.isVisible());
    const expectedItems = ['赛事报名'];
    const primaryBrandVisible = await page.locator('.site-brand-primary-logo').isVisible();
    const partnerBrandVisible = await page.locator('.site-brand-partner-logo').isVisible();
    const primaryBrandLoaded = await page.locator('.site-brand-primary-logo').evaluate((image) => image.naturalWidth > 0);
    const partnerBrandLoaded = await page.locator('.site-brand-partner-logo').evaluate((image) => image.naturalWidth > 0);
    checks.push({ profile: 'mobile-header', primaryBrandVisible, partnerBrandVisible, primaryBrandLoaded, partnerBrandLoaded, activityItems, mobileHomeHref, mobileAboutHref, mobileMenuVisible, mobileMenuClosed, valid: primaryBrandVisible && partnerBrandVisible && primaryBrandLoaded && partnerBrandLoaded && mobileHomeHref === '#/home' && mobileAboutHref === '#/about' && mobileMenuVisible && mobileMenuClosed && activityItems.join('|') === expectedItems.join('|') });
  }
  await page.locator('.event-card a').first().click();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${output}/${profile.name}-event-detail.png`, fullPage: true });
  await context.close();
}

for (const profile of [
  { name: 'desktop-rules', viewport: { width: 1440, height: 1000 } },
  { name: 'mobile-rules', viewport: { width: 375, height: 812 } },
]) {
  const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${profile.name}: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`${profile.name}: ${error.message}`));
  await page.goto(`${base}/#/rules`, { waitUntil: 'networkidle' });
  const programs = await page.locator('.rule-program').count();
  await page.locator('.rule-cover img').evaluateAll(async (images) => {
    await Promise.all(images.map((image) => {
      image.loading = 'eager';
      if (image.complete && image.naturalWidth > 0) return Promise.resolve();
      return new Promise((resolve) => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); });
    }));
  });
  const coversLoaded = await page.locator('.rule-cover img').evaluateAll((images) => images.every((image) => image.naturalWidth > 0 && image.naturalHeight > 0));
  const pdfLinks = await page.locator('a[href$=".pdf"]').count();
  const rulesNavHref = await page.locator('.desktop-nav a', { hasText: '赛事规则' }).getAttribute('href');
  await page.screenshot({ path: `${output}/${profile.name}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  checks.push({ profile: profile.name, programs, coversLoaded, pdfLinks, rulesNavHref, overflow, valid: programs === 3 && coversLoaded && pdfLinks === 9 && rulesNavHref === '#/rules' && !overflow });
  await context.close();
}

const authContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
const authPage = await authContext.newPage();
authPage.on('pageerror', (error) => errors.push(`auth: ${error.message}`));
await authPage.goto(`${base}/#/login`, { waitUntil: 'networkidle' });
await authPage.screenshot({ path: `${output}/mobile-login.png`, fullPage: true });
const authLogoLoaded = await authPage.locator('.auth-logo').evaluate((image) => image.naturalWidth > 0);
const loginTitle = await authPage.locator('h1').textContent();
const accountFieldVisible = await authPage.getByLabel('用户名或邮箱').isVisible();
const loginCaptchaCount = await authPage.locator('[data-captcha-image]').count();
const loginEmailCodeCount = await authPage.getByLabel('邮箱验证码').count();
await authPage.getByLabel('用户名或邮箱').fill('demo');
await authPage.locator('input[name="password"]').fill('Demo123!');
await authPage.getByRole('button', { name: '登录', exact: true }).click();
await authPage.waitForURL(/#\/events/);
const sessionAfterLogin = await authContext.request.get(`${base}/api/auth/me`).then((response) => response.json());
const authOverflow = await authPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
const leakedCredentials = (await authPage.locator('body').textContent()).includes('Admin123!');
checks.push({ profile: 'mobile-login', title: loginTitle, logoLoaded: authLogoLoaded, accountFieldVisible, captchaRemoved: loginCaptchaCount === 0, emailCodeRemoved: loginEmailCodeCount === 0, directSessionCreated: Boolean(sessionAfterLogin.user), leakedCredentials, overflow: authOverflow, valid: authLogoLoaded && accountFieldVisible && loginCaptchaCount === 0 && loginEmailCodeCount === 0 && Boolean(sessionAfterLogin.user) && !leakedCredentials && !authOverflow });
await authContext.clearCookies();
await authPage.reload({ waitUntil: 'networkidle' });
await authPage.goto(`${base}/#/forgot-password`, { waitUntil: 'networkidle' });
const resetCaptcha = await authPage.evaluate(async () => (await fetch('/api/captcha')).json());
await authPage.getByLabel('注册邮箱').fill('demo@ruibude.local');
await authPage.getByLabel('图形验证码').fill(resetCaptcha.devCode);
await authPage.locator('[name="captchaId"]').evaluate((input, id) => { input.value = id; }, resetCaptcha.id);
await authPage.getByRole('button', { name: '发送重置验证码' }).click();
await authPage.getByRole('heading', { name: '设置新密码' }).waitFor();
const resetFieldsVisible = await authPage.locator('#reset-code').isVisible()
  && await authPage.locator('#password').isVisible()
  && await authPage.locator('#confirm_password').isVisible();
await authPage.screenshot({ path: `${output}/mobile-password-reset.png`, fullPage: true });
checks.push({ profile: 'mobile-password-reset', resetFieldsVisible, overflow: await authPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: resetFieldsVisible });
await authPage.goto(`${base}/#/register`, { waitUntil: 'networkidle' });
await authPage.getByRole('heading', { name: '创建报名账号' }).waitFor({ state: 'visible' });
const registrationIdentityFields = await authPage.locator('#username').isVisible() && await authPage.locator('#phone').isVisible();
const registrationPhoneRequired = await authPage.locator('#phone').getAttribute('required') !== null;
await authPage.screenshot({ path: `${output}/mobile-register.png`, fullPage: true });
checks.push({ profile: 'mobile-register', registrationIdentityFields, registrationPhoneRequired, overflow: await authPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: registrationIdentityFields && registrationPhoneRequired });
await authContext.close();

const userContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const userAuth = await login(userContext, 'demo@ruibude.local', 'Demo123!');
const userPage = await userContext.newPage();
userPage.on('pageerror', (error) => errors.push(`user: ${error.message}`));
await userPage.goto(`${base}/#/account/teams`, { waitUntil: 'networkidle' });
await userPage.screenshot({ path: `${output}/desktop-teams.png`, fullPage: true });
const desktopNavText = await userPage.locator('.desktop-nav').innerText();
checks.push({ profile: 'user-teams', title: await userPage.locator('h1').first().textContent(), primaryLinksRemoved: !desktopNavText.includes('战队管理') && !desktopNavText.includes('我的比赛'), overflow: await userPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: !desktopNavText.includes('战队管理') && !desktopNavText.includes('我的比赛') });
await userPage.goto(`${base}/#/account/teams/new`, { waitUntil: 'networkidle' });
await userPage.locator('.portal-workflow-actions').waitFor({ state: 'visible' });
const teamWorkflowLinks = await userPage.locator('.portal-workflow-actions a').allTextContents();
const teamFieldManagementLinks = await userPage.locator('.field-management-link').allTextContents();
await userPage.goto(`${base}/#/account/members/new`, { waitUntil: 'networkidle' });
const memberWorkflowLinks = await userPage.locator('.portal-workflow-actions a').allTextContents();
await userPage.goto(`${base}/#/account/coaches/new`, { waitUntil: 'networkidle' });
const coachWorkflowLinks = await userPage.locator('.portal-workflow-actions a').allTextContents();
checks.push({ profile: 'personnel-team-navigation', teamWorkflowLinks, teamFieldManagementLinks, memberWorkflowLinks, coachWorkflowLinks, valid: teamWorkflowLinks.join('|').includes('添加队员信息') && teamWorkflowLinks.join('|').includes('添加教练信息') && teamFieldManagementLinks.join('|').includes('教练管理') && teamFieldManagementLinks.join('|').includes('队员管理') && memberWorkflowLinks.join('|').includes('添加教练信息') && memberWorkflowLinks.join('|').includes('前往创建战队信息') && coachWorkflowLinks.join('|').includes('添加队员信息') && coachWorkflowLinks.join('|').includes('前往创建战队信息') });
await userPage.goto(`${base}/#/account/teams/new`, { waitUntil: 'networkidle' });
const teamNumberGuideLink = userPage.locator('.team-number-link').first();
const teamNumberGuideHref = await teamNumberGuideLink.getAttribute('href');
await teamNumberGuideLink.click();
await userPage.waitForURL(/#\/team-number$/);
await userPage.locator('.team-number-help').waitFor({ state: 'visible' });
const helpPathHeadings = await userPage.locator('.help-path h2').allTextContents();
const internalGuideHref = await userPage.getByRole('link', { name: /查看图文注册教程/ }).getAttribute('href');
const committeeHelpText = await userPage.locator('.help-path').nth(2).innerText();
await userPage.screenshot({ path: `${output}/desktop-team-number-help.png`, fullPage: true });
await userPage.getByRole('link', { name: /查看图文注册教程/ }).click();
await userPage.waitForURL(/#\/team-number\/guide$/);
await userPage.locator('.team-number-guide-document').waitFor({ state: 'visible' });
await userPage.locator('.guide-markdown img').evaluateAll(async (images) => {
  await Promise.all(images.map((image) => {
    image.loading = 'eager';
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); });
  }));
});
const guideTitle = await userPage.locator('.guide-markdown h1').first().textContent();
const guideImageSrcs = await userPage.locator('.guide-markdown img').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
const guideImagesLoaded = await userPage.locator('.guide-markdown img').evaluateAll((images) => images.every((image) => image.naturalWidth > 0 && image.naturalHeight > 0));
const guideRecfEventsLink = userPage.locator('.guide-markdown a[href="https://www.recfevents.org"]').first();
const guideMarkdownResponse = await userContext.request.get(`${base}/content/recf-team-registration-guide.md`);
const guideAssetResponse = await userContext.request.get(`${base}/assets/guides/recf-team-registration/RECFeventsregisternow.png`);
await userPage.screenshot({ path: `${output}/desktop-team-number-guide.png`, fullPage: true });
checks.push({ profile: 'team-number-help', href: teamNumberGuideHref, helpPathHeadings, internalGuideHref, committeeHelpText, guideTitle, imageCount: guideImageSrcs.length, guideImagesLoaded, firstImage: guideImageSrcs[0], markdownContentType: guideMarkdownResponse.headers()['content-type'], firstImageContentType: guideAssetResponse.headers()['content-type'], overflow: await userPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: teamNumberGuideHref === '#/team-number' && helpPathHeadings.join('|') === '已有官方编号|尚无官方战队编号|无官方战队编号注册条件' && internalGuideHref === '#/team-number/guide' && committeeHelpText.includes('654849662@qq.com') && committeeHelpText.includes('13761393714') && guideTitle === '在 RECFEvents 中注册赛队编号' && guideImageSrcs.length === 18 && guideImageSrcs.every((src) => src?.startsWith('/assets/guides/recf-team-registration/')) && guideImagesLoaded && guideMarkdownResponse.ok() && guideMarkdownResponse.headers()['content-type']?.includes('text/markdown') && guideAssetResponse.ok() && guideAssetResponse.headers()['content-type']?.startsWith('image/png') && await guideRecfEventsLink.count() >= 1 && !(await userPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) });
for (const [index, name] of [['02', '视觉第二教练'], ['03', '视觉第三教练']]) {
  const coachResponse = await userContext.request.post(`${base}/api/coaches`, { headers: { 'X-CSRF-Token': userAuth.csrfToken }, data: { name, gender: '男', phone: `138000000${index}`, org_name: '瑞卜德实验学校', email: `visual-coach-${index}@example.com`, nationality: '中国' } });
  if (!coachResponse.ok()) throw new Error(`Coach setup failed: ${coachResponse.status()} ${await coachResponse.text()}`);
}
await userPage.goto(`${base}/#/account/teams/new`, { waitUntil: 'networkidle' });
const teamForm = userPage.locator('form[data-form="team"]');
await teamForm.locator('#group_name option').first().waitFor({ state: 'attached' });
const allGroupOptions = await teamForm.locator('#group_name option').evaluateAll((options) => options.map((option) => option.value));
const innovationOptions = allGroupOptions.filter((value) => value.includes('创新'));
await teamForm.locator('#group_name').selectOption('RECF-Engage 创新小学组');
await teamForm.locator('#number').fill('A-01');
const prefixText = await teamForm.locator('[data-team-number-prefix]').textContent();
const numberMaxLength = await teamForm.locator('#number').getAttribute('maxlength');
const finalNumberText = await teamForm.locator('[data-team-number-preview]').textContent();
await userPage.screenshot({ path: `${output}/desktop-innovation-team-form.png`, fullPage: true });
const expectedGroups = ['RECF-Achieve 初中组','RECF-Achieve 高中组','RECF-Engage 小学组','RECF-Engage 初中组','RECF-Inspire 大学组','RECF-Achieve 创新初中组','RECF-Achieve 创新高中组','RECF-Engage 创新小学组','RECF-Engage 创新初中组','RECF-Inspire 创新大学组'];
checks.push({ profile: 'innovation-team-form', allGroupOptions, innovationOptions, prefixText, numberMaxLength, finalNumberText, valid: allGroupOptions.join('|') === expectedGroups.join('|') && innovationOptions.length === 5 && prefixText === 'RECF-E-XX' && numberMaxLength === '21' && finalNumberText === 'RECF-E-XXA-01' });
await teamForm.locator('#name').fill('视觉验收战队');
await teamForm.locator('#school_name').fill('瑞卜德实验学校');
const coachChoices = teamForm.locator('[name="coach_ids"]');
await coachChoices.nth(0).check();
await coachChoices.nth(1).check();
const thirdCoachLocked = await coachChoices.nth(2).isDisabled();
const selectedCoachCount = await teamForm.locator('[data-coach-count]').textContent();
await userPage.screenshot({ path: `${output}/desktop-two-coach-limit.png`, fullPage: true });
await coachChoices.nth(1).uncheck();
const thirdCoachRestored = await coachChoices.nth(2).isEnabled();
checks.push({ profile: 'two-coach-limit', thirdCoachLocked, thirdCoachRestored, selectedCoachCount, valid: thirdCoachLocked && thirdCoachRestored && selectedCoachCount.includes('已选择 2 / 2') && selectedCoachCount.includes('其余选项已锁定') });
await teamForm.locator('[name="member_ids"]').first().check();
await teamForm.locator('#contact_coach_id').selectOption({ index: 1 });
await teamForm.locator('button[type="submit"]').click();
const teamNumberConfirm = userPage.locator('.modal');
await teamNumberConfirm.waitFor({ state: 'visible' });
const teamNumberConfirmText = await teamNumberConfirm.innerText();
await userPage.screenshot({ path: `${output}/desktop-team-number-confirm.png`, fullPage: true });
checks.push({ profile: 'team-number-confirm', text: teamNumberConfirmText, valid: teamNumberConfirmText.includes('请确定你的战队编号：RECF-E-XXA-01 无误') && teamNumberConfirmText.includes('确认提交') });
await teamNumberConfirm.locator('[data-action="confirm-cancel"]').click();
await teamForm.locator('#group_name').selectOption('RECF-Achieve 初中组');
await teamForm.locator('#number').fill('XN-2401');
await teamForm.locator('button[type="submit"]').click();
await userPage.locator('.modal').waitFor({ state: 'visible' });
await userPage.getByRole('button', { name: '确认提交' }).click();
await userPage.getByRole('heading', { name: '战队编号已被占用' }).waitFor({ state: 'visible' });
const duplicateTeamNumberText = await userPage.locator('.modal').innerText();
await userPage.waitForTimeout(4600);
const duplicateTeamNumberPersistent = await userPage.locator('.modal').isVisible();
const duplicateTeamNumberToastCount = await userPage.locator('.toast.error').count();
await userPage.screenshot({ path: `${output}/desktop-team-number-conflict.png`, fullPage: true });
checks.push({ profile: 'team-number-conflict', persistent: duplicateTeamNumberPersistent, toastCount: duplicateTeamNumberToastCount, text: duplicateTeamNumberText, valid: duplicateTeamNumberPersistent && duplicateTeamNumberToastCount === 0 && duplicateTeamNumberText.includes('该战队编号已被其他队伍注册（已被占用）') && duplicateTeamNumberText.includes('654849662@qq.com') && duplicateTeamNumberText.includes('13761393714（小周老师）') });
await userPage.getByRole('button', { name: '我知道了' }).click();
await userPage.setViewportSize({ width: 375, height: 812 });
await userPage.goto(`${base}/#/team-number`, { waitUntil: 'networkidle' });
await userPage.locator('.team-number-help').waitFor({ state: 'visible' });
const mobileHelpPathCount = await userPage.locator('.help-path').count();
await userPage.screenshot({ path: `${output}/mobile-team-number-help.png`, fullPage: true });
await userPage.getByRole('link', { name: /查看图文注册教程/ }).click();
await userPage.waitForURL(/#\/team-number\/guide$/);
await userPage.locator('.team-number-guide-document').waitFor({ state: 'visible' });
await userPage.screenshot({ path: `${output}/mobile-team-number-guide.png`, fullPage: true });
const mobileGuideImageCount = await userPage.locator('.guide-markdown img').count();
checks.push({ profile: 'mobile-team-number-help', paths: mobileHelpPathCount, imageCount: mobileGuideImageCount, overflow: await userPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: mobileHelpPathCount === 3 && mobileGuideImageCount === 18 && !(await userPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) });
await userPage.setViewportSize({ width: 1440, height: 1000 });
const featureAdminContext = await browser.newContext();
const featureAdminAuth = await login(featureAdminContext, 'admin@ruibude.local', 'Admin123!');
const featureEventsResponse = await featureAdminContext.request.get(`${base}/api/admin/events`);
const featureEvents = await featureEventsResponse.json();
const featureEvent = featureEvents.events.find((event) => event.id === 1) || featureEvents.events.find((event) => event.registration_open);
const featureEnableResponse = await featureAdminContext.request.put(`${base}/api/admin/events/${featureEvent.id}`, { headers: { 'X-CSRF-Token': featureAdminAuth.csrfToken }, data: { ...featureEvent, allow_volunteer: true, allow_spectator: true } });
if (!featureEnableResponse.ok()) throw new Error(`Activity feature enable failed: ${featureEnableResponse.status()} ${await featureEnableResponse.text()}`);
await featureAdminContext.close();
await userPage.goto(`${base}/#/volunteer`, { waitUntil: 'networkidle' });
const enabledActivityButton = userPage.getByRole('button', { name: '活动报名' });
await enabledActivityButton.click();
const enabledActivityItems = (await userPage.locator('#activity-registration-menu a').allTextContents()).map((text) => text.trim());
await userPage.keyboard.press('Escape');
checks.push({ profile: 'activity-links-enabled', items: enabledActivityItems, valid: enabledActivityItems.join('|') === '赛事报名|志愿者报名|观赛报名' });
await userPage.locator('.event-card').first().waitFor({ state: 'visible' });
const volunteerListCards = await userPage.locator('.event-card').count();
const volunteerCardHrefs = await userPage.locator('.event-card a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
await userPage.screenshot({ path: `${output}/desktop-volunteer-list.png`, fullPage: true });
await userPage.locator('.event-card a').first().click();
const volunteerForm = userPage.locator('form[data-form="activity-application"]');
await volunteerForm.waitFor({ state: 'visible' });
const volunteerSelectedEventValue = await volunteerForm.locator('[name="event_id"]').inputValue();
const volunteerDetailPath = new URL(userPage.url()).hash;
await volunteerForm.locator('#name').fill('视觉测试志愿者');
await volunteerForm.locator('#gender').selectOption('女');
await volunteerForm.locator('#id_number').fill('310101200001010028');
await volunteerForm.locator('#phone').fill('13761393714');
await volunteerForm.locator('#email').fill('volunteer-visual@example.com');
await volunteerForm.locator('#organization').fill('瑞卜德志愿服务队');
await volunteerForm.locator('#volunteer_role').selectOption('赛事服务');
await volunteerForm.locator('#availability').fill('赛事期间全天可到场');
await volunteerForm.locator('#experience').fill('校园活动服务经验');
await volunteerForm.getByRole('button', { name: '立即提交' }).click();
await userPage.locator('.activity-current-application').waitFor({ state: 'visible' });
const spectatorResponse = await userContext.request.post(`${base}/api/activity-applications`, { headers: { 'X-CSRF-Token': userAuth.csrfToken }, data: { type: 'spectator', event_id: 1, name: '视觉测试观众', gender: '男', id_number: '310101199901010019', phone: '13800001234', email: 'spectator-visual@example.com', organization: '瑞卜德实验学校', attendee_count: 2, companion_names: '同行观众', notes: '携带儿童' } });
if (!spectatorResponse.ok()) throw new Error(`Spectator setup failed: ${spectatorResponse.status()} ${await spectatorResponse.text()}`);
await userPage.screenshot({ path: `${output}/desktop-volunteer.png`, fullPage: true });
const volunteerCurrentVisible = await userPage.locator('.activity-current-application').isVisible();
checks.push({ profile: 'volunteer', title: await userPage.locator('h1').first().textContent(), listCards: volunteerListCards, cardHrefs: volunteerCardHrefs, detailPath: volunteerDetailPath, selectedEventValue: volunteerSelectedEventValue, currentVisible: volunteerCurrentVisible, overflow: await userPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: volunteerListCards > 0 && volunteerCardHrefs.every((href) => /^#\/volunteer\/\d+$/.test(href)) && /^#\/volunteer\/\d+$/.test(volunteerDetailPath) && Boolean(volunteerSelectedEventValue) && volunteerCurrentVisible });
await userPage.getByRole('link', { name: '编辑' }).click();
await userPage.locator('form[data-form="activity-application"]').waitFor({ state: 'visible' });
const volunteerEditPath = new URL(userPage.url()).hash;
const volunteerEditEventValue = await userPage.locator('form[data-form="activity-application"] [name="event_id"]').inputValue();
checks.push({ profile: 'volunteer-edit', path: volunteerEditPath, eventValue: volunteerEditEventValue, valid: /^#\/volunteer\/\d+\?edit=\d+$/.test(volunteerEditPath) && volunteerEditEventValue === volunteerSelectedEventValue });
await userPage.goto(`${base}/#/spectator`, { waitUntil: 'networkidle' });
await userPage.locator('.event-card').first().waitFor({ state: 'visible' });
const spectatorListCards = await userPage.locator('.event-card').count();
const spectatorCardHrefs = await userPage.locator('.event-card a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
await userPage.screenshot({ path: `${output}/desktop-spectator-list.png`, fullPage: true });
await userPage.locator('.event-card a').first().click();
await userPage.locator('.activity-current-application').waitFor({ state: 'visible' });
await userPage.screenshot({ path: `${output}/desktop-spectator.png`, fullPage: true });
const spectatorDetailPath = new URL(userPage.url()).hash;
const spectatorCurrentVisible = await userPage.locator('.activity-current-application').isVisible();
checks.push({ profile: 'spectator', title: await userPage.locator('h1').first().textContent(), listCards: spectatorListCards, cardHrefs: spectatorCardHrefs, detailPath: spectatorDetailPath, currentVisible: spectatorCurrentVisible, overflow: await userPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: spectatorListCards > 0 && spectatorCardHrefs.every((href) => /^#\/spectator\/\d+$/.test(href)) && /^#\/spectator\/\d+$/.test(spectatorDetailPath) && spectatorCurrentVisible });
await userPage.setViewportSize({ width: 375, height: 812 });
await userPage.screenshot({ path: `${output}/mobile-spectator.png`, fullPage: true });
const mobileSpectatorCurrent = await userPage.locator('.activity-current-application').count();
checks.push({ profile: 'mobile-spectator', currentApplications: mobileSpectatorCurrent, overflow: await userPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: mobileSpectatorCurrent === 1 });
await userPage.setViewportSize({ width: 844, height: 390 });
await userPage.screenshot({ path: `${output}/landscape-spectator.png`, fullPage: true });
checks.push({ profile: 'landscape-spectator', overflow: await userPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) });
await userPage.setViewportSize({ width: 1440, height: 1000 });
await userPage.goto(`${base}/#/events/1`, { waitUntil: 'networkidle' });
await userPage.locator('#group_name').selectOption('RECF-Achieve 初中组');
const firstTeamValue = await userPage.locator('#team_id option:not([value=""]):not([disabled])').first().getAttribute('value');
if (!firstTeamValue) throw new Error('Expected a selectable demo team');
await userPage.locator('#team_id').selectOption(firstTeamValue);
await userPage.locator('.modal').waitFor({ state: 'visible' });
checks.push({ profile: 'team-confirmation', title: await userPage.locator('#modal-title').textContent(), overflow: await userPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) });
await userPage.screenshot({ path: `${output}/desktop-team-confirmation.png`, fullPage: true });
await userPage.getByRole('button', { name: '信息无误' }).click();
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const proofResponse = await userContext.request.post(`${base}/api/uploads`, { headers: { 'X-CSRF-Token': userAuth.csrfToken }, data: { kind: 'payment', dataUrl: tinyPng } });
const proof = await proofResponse.json();
const registrationResponse = await userContext.request.post(`${base}/api/registrations`, { headers: { 'X-CSRF-Token': userAuth.csrfToken }, data: { event_id: 1, team_id: Number(firstTeamValue), group_name: 'RECF-Achieve 初中组', payment_proof_url: proof.url } });
if (!registrationResponse.ok()) throw new Error(`Registration setup failed: ${registrationResponse.status()} ${await registrationResponse.text()}`);
await userPage.goto(`${base}/#/account/registrations`, { waitUntil: 'networkidle' });
await userPage.screenshot({ path: `${output}/desktop-my-events.png`, fullPage: true });
await userPage.setViewportSize({ width: 720, height: 900 });
await userPage.screenshot({ path: `${output}/narrow-my-events.png`, fullPage: true });
const desktopStatusBadges = await userPage.locator('.desktop-table .status-cell .badge').evaluateAll((badges) => badges.map((badge) => {
  const style = getComputedStyle(badge);
  const expectedSingleLineHeight = Number.parseFloat(style.lineHeight)
    + Number.parseFloat(style.paddingTop)
    + Number.parseFloat(style.paddingBottom)
    + Number.parseFloat(style.borderTopWidth)
    + Number.parseFloat(style.borderBottomWidth);
  return {
    text: badge.textContent?.trim(),
    whiteSpace: style.whiteSpace,
    height: badge.getBoundingClientRect().height,
    expectedSingleLineHeight: Math.max(Number.parseFloat(style.minHeight), expectedSingleLineHeight),
  };
}));
const statusBadgesSingleLine = desktopStatusBadges.length > 0 && desktopStatusBadges.every((badge) => badge.whiteSpace === 'nowrap' && badge.height <= badge.expectedSingleLineHeight + 1);
checks.push({ profile: 'my-events-status', badges: desktopStatusBadges, valid: statusBadgesSingleLine });
await userPage.setViewportSize({ width: 1440, height: 1000 });
await userPage.getByRole('link', { name: '打开列表' }).first().click();
await userPage.waitForLoadState('networkidle');
checks.push({ profile: 'my-event-teams', title: await userPage.locator('h1').first().textContent(), overflow: await userPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) });
await userPage.screenshot({ path: `${output}/desktop-my-event-teams.png`, fullPage: true });
await userPage.getByRole('button', { name: '取消比赛', exact: true }).click();
await userPage.locator('form[data-form="cancel-registration"]').waitFor({ state: 'visible' });
const cancelKeepsHistoryCopy = (await userPage.locator('.modal').innerText()).includes('报名记录会保留');
await userPage.getByRole('button', { name: '暂不取消', exact: true }).click();
await userPage.getByRole('button', { name: '申请退费', exact: true }).click();
const refundForm = userPage.locator('form[data-form="refund-registration"]');
await refundForm.waitFor({ state: 'visible' });
await refundForm.locator('#reason').fill('视觉验收：报名截止前申请退费');
await refundForm.getByRole('button', { name: '提交退费申请', exact: true }).click();
await userPage.locator('.modal').waitFor({ state: 'detached' });
await userPage.waitForFunction(() => [...document.querySelectorAll('.badge')].some((element) => element.textContent?.trim() === '退费待处理' && element.getClientRects().length));
const refundPendingVisible = await userPage.locator('.badge').evaluateAll((badges) => badges.some((badge) => badge.textContent?.trim() === '退费待处理' && badge.getClientRects().length));
await userPage.screenshot({ path: `${output}/desktop-my-event-refund-pending.png`, fullPage: true });
checks.push({ profile: 'registration-cancel-refund-actions', cancelKeepsHistoryCopy, refundPendingVisible, valid: cancelKeepsHistoryCopy && refundPendingVisible });
await userContext.close();

const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const adminAuth = await login(adminContext, 'admin@ruibude.local', 'Admin123!');
const adminPage = await adminContext.newPage();
adminPage.on('pageerror', (error) => errors.push(`admin: ${error.message}`));
await adminPage.goto(`${base}/#/admin`, { waitUntil: 'networkidle' });
await adminPage.screenshot({ path: `${output}/desktop-admin.png`, fullPage: true });
const adminTeamNavVisible = await adminPage.getByRole('link', { name: '已有战队管理' }).isVisible();
checks.push({ profile: 'admin', title: await adminPage.locator('h1').first().textContent(), teamNavVisible: adminTeamNavVisible, overflow: await adminPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: adminTeamNavVisible });
await adminPage.goto(`${base}/#/admin/users?q=${encodeURIComponent('张小航')}`, { waitUntil: 'networkidle' });
await adminPage.getByRole('link', { name: '查看完整资料' }).waitFor({ state: 'visible' });
const adminUserRows = await adminPage.locator('.desktop-table tbody tr').count();
const adminUserNavVisible = await adminPage.getByRole('link', { name: '管理用户', exact: true }).isVisible();
await adminPage.screenshot({ path: `${output}/desktop-admin-users.png`, fullPage: true });
await adminPage.getByRole('link', { name: '查看完整资料' }).click();
await adminPage.getByRole('heading', { name: '注册与账户信息' }).waitFor({ state: 'visible' });
const adminUserDetailText = await adminPage.locator('.portal-main').innerText();
const adminUserAccountCard = adminPage.locator('.card').filter({ has: adminPage.getByRole('heading', { name: '注册与账户信息' }) });
const promoteUserButton = adminUserAccountCard.getByRole('button', { name: '提升为管理员', exact: true });
const promoteUserButtonVisible = await promoteUserButton.isVisible();
const roleButtonAtAccountBottomRight = await adminUserAccountCard.evaluate((card) => {
  const button = card.querySelector('[data-action="change-user-role"]');
  if (!button) return false;
  const cardBox = card.getBoundingClientRect();
  const buttonBox = button.getBoundingClientRect();
  return buttonBox.bottom > cardBox.top + cardBox.height * .75 && cardBox.right - buttonBox.right < 48;
});
await adminPage.screenshot({ path: `${output}/desktop-admin-user-detail.png`, fullPage: true });
const adminUserDetailValid = ['注册与账户信息','账号权限','普通用户','注册战队','参赛赛项','教练员','学生 / 队员','demo@ruibude.local','XN-2401'].every((text) => adminUserDetailText.includes(text));
checks.push({ profile: 'admin-users', rows: adminUserRows, navVisible: adminUserNavVisible, detailValid: adminUserDetailValid, roleButtonVisible: promoteUserButtonVisible, roleButtonAtAccountBottomRight, overflow: await adminPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: adminUserRows === 1 && adminUserNavVisible && adminUserDetailValid && promoteUserButtonVisible && roleButtonAtAccountBottomRight });
await adminPage.setViewportSize({ width: 375, height: 812 });
await adminPage.goto(`${base}/#/admin/users?q=${encodeURIComponent('张小航')}`, { waitUntil: 'networkidle' });
await adminPage.getByRole('heading', { name: '管理用户' }).waitFor({ state: 'visible' });
await adminPage.locator('.mobile-list .entity-card').first().waitFor({ state: 'visible' });
const mobileAdminUserCards = await adminPage.locator('.mobile-list .entity-card').count();
await adminPage.screenshot({ path: `${output}/mobile-admin-users.png`, fullPage: true });
checks.push({ profile: 'mobile-admin-users', cards: mobileAdminUserCards, overflow: await adminPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: mobileAdminUserCards === 1 });
await adminPage.setViewportSize({ width: 1440, height: 1000 });
await adminPage.goto(`${base}/#/admin/events`, { waitUntil: 'networkidle' });
const adminEventTitle = await adminPage.locator('h1').first().textContent();
const adminEventNavVisible = await adminPage.getByRole('link', { name: '赛事管理', exact: true }).isVisible();
const adminEventIds = await adminPage.locator('.desktop-table tbody tr td:first-child').allTextContents();
const adminEventDeleteButtons = adminPage.getByRole('button', { name: '删除赛事', exact: true });
const adminEventDeleteButtonCount = await adminEventDeleteButtons.count();
const adminEventExportLinks = adminPage.locator('.desktop-table a[download]');
const adminEventExportLinkCount = await adminEventExportLinks.count();
await adminEventDeleteButtons.first().click();
const adminEventDeleteDialogTitle = await adminPage.locator('.modal h2').textContent();
const adminEventDeleteDialogText = await adminPage.locator('.modal').innerText();
const adminEventDeleteConfirmVisible = await adminPage.getByRole('button', { name: '确认删除赛事', exact: true }).isVisible();
await adminPage.getByRole('button', { name: '取消', exact: true }).click();
await adminPage.screenshot({ path: `${output}/desktop-admin-events.png`, fullPage: true });
checks.push({ profile: 'admin-events', title: adminEventTitle, eventIds: adminEventIds, navVisible: adminEventNavVisible, deleteButtons: adminEventDeleteButtonCount, exportLinks: adminEventExportLinkCount, deleteDialogTitle: adminEventDeleteDialogTitle, deleteDialogText: adminEventDeleteDialogText, deleteConfirmVisible: adminEventDeleteConfirmVisible, overflow: await adminPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: adminEventTitle === '赛事管理' && adminEventNavVisible && adminEventIds.join(',') === '1,2,3' && adminEventDeleteButtonCount === 3 && adminEventExportLinkCount === 9 && adminEventDeleteDialogTitle === '确认删除赛事' && adminEventDeleteDialogText.includes('且无法恢复') && adminEventDeleteConfirmVisible });
await adminPage.goto(`${base}/#/admin/teams?q=XN-2401`, { waitUntil: 'networkidle' });
await adminPage.locator('[data-action="admin-view-team"]').first().waitFor({ state: 'visible' });
const adminTeamRows = await adminPage.locator('.desktop-table tbody tr').count();
const adminTeamSearchValue = await adminPage.locator('[data-admin-search] [name="q"]').inputValue();
const adminActiveSidebarLinks = await adminPage.locator('.sidebar-nav a.active').count();
const adminTeamEditActions = await adminPage.locator('.desktop-table a[href*="/admin/teams/"][href*="/edit"]').count();
const adminTeamDeleteActions = await adminPage.locator('.desktop-table [data-action="delete-admin-team"]').count();
await adminPage.screenshot({ path: `${output}/desktop-admin-teams.png`, fullPage: true });
await adminPage.locator('[data-action="admin-view-team"]').first().click();
await adminPage.locator('.modal').waitFor({ state: 'visible' });
const adminTeamDetailText = await adminPage.locator('.modal').innerText();
await adminPage.screenshot({ path: `${output}/desktop-admin-team-detail.png`, fullPage: true });
checks.push({ profile: 'admin-teams', rows: adminTeamRows, searchValue: adminTeamSearchValue, activeSidebarLinks: adminActiveSidebarLinks, editActions: adminTeamEditActions, deleteActions: adminTeamDeleteActions, detailHasOwner: adminTeamDetailText.includes('demo@ruibude.local'), detailHasSections: adminTeamDetailText.includes('教练信息') && adminTeamDetailText.includes('队员信息'), valid: adminTeamRows === 1 && adminTeamSearchValue === 'XN-2401' && adminActiveSidebarLinks === 1 && adminTeamEditActions === 1 && adminTeamDeleteActions === 1 && adminTeamDetailText.includes('demo@ruibude.local') && adminTeamDetailText.includes('教练信息') && adminTeamDetailText.includes('队员信息') });
await adminPage.getByRole('button', { name: '关闭', exact: true }).click();
await adminPage.locator('.desktop-table a[href*="/admin/teams/"][href*="/edit"]').click();
const adminTeamForm = adminPage.locator('form[data-form="admin-team"]');
await adminTeamForm.waitFor({ state: 'visible' });
const adminEditOwnerNotice = await adminPage.locator('.info-banner').first().innerText();
const adminEditCoachChoices = await adminTeamForm.locator('[name="coach_ids"]').count();
const adminEditMemberChoices = await adminTeamForm.locator('[name="member_ids"]').count();
const adminEditName = adminTeamForm.locator('[name="name"]');
const originalAdminEditName = await adminEditName.inputValue();
await adminEditName.fill(`${originalAdminEditName} 管理修订`);
await adminPage.screenshot({ path: `${output}/desktop-admin-team-edit.png`, fullPage: true });
await adminTeamForm.getByRole('button', { name: '保存战队' }).click();
await adminPage.locator('.modal').waitFor({ state: 'visible' });
await adminPage.getByRole('button', { name: '确认提交' }).click();
await adminPage.locator('[data-admin-search]').waitFor({ state: 'visible' });
const adminEditedTeamText = await adminPage.locator('.desktop-table tbody tr').first().innerText();
checks.push({ profile: 'admin-team-edit', ownerNotice: adminEditOwnerNotice, coachChoices: adminEditCoachChoices, memberChoices: adminEditMemberChoices, updated: adminEditedTeamText.includes('管理修订'), returnedSearch: await adminPage.locator('[data-admin-search] [name="q"]').inputValue(), overflow: await adminPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: adminEditOwnerNotice.includes('demo@ruibude.local') && adminEditCoachChoices >= 1 && adminEditMemberChoices >= 1 && adminEditedTeamText.includes('管理修订') && await adminPage.locator('[data-admin-search] [name="q"]').inputValue() === 'XN-2401' });
await adminPage.setViewportSize({ width: 375, height: 812 });
await adminPage.goto(`${base}/#/admin/teams?q=XN-2401`, { waitUntil: 'networkidle' });
await adminPage.screenshot({ path: `${output}/mobile-admin-teams.png`, fullPage: true });
const mobileAdminTeamCards = await adminPage.locator('.mobile-list .entity-card').count();
const mobileAdminTeamEdit = await adminPage.locator('.mobile-list a[href*="/admin/teams/"][href*="/edit"]').count();
const mobileAdminTeamDelete = await adminPage.locator('.mobile-list [data-action="delete-admin-team"]').count();
checks.push({ profile: 'mobile-admin-teams', cards: mobileAdminTeamCards, editActions: mobileAdminTeamEdit, deleteActions: mobileAdminTeamDelete, overflow: await adminPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: mobileAdminTeamCards === 1 && mobileAdminTeamEdit === 1 && mobileAdminTeamDelete === 1 });
await adminPage.setViewportSize({ width: 1440, height: 1000 });
await adminPage.goto(`${base}/#/admin/reviews`, { waitUntil: 'networkidle' });
await adminPage.locator('.review-event-card').first().waitFor({ state: 'visible' });
const registrationEventCards = await adminPage.locator('.review-event-card').count();
const registrationListHiddenBeforeEvent = await adminPage.locator('[data-action="admin-view-registration"]').count() === 0;
const approvedTeamCountVisible = (await adminPage.locator('.review-event-card .review-event-stats').first().innerText()).includes('支已通过战队');
await adminPage.screenshot({ path: `${output}/desktop-admin-registration-event-picker.png`, fullPage: true });
await adminPage.setViewportSize({ width: 375, height: 812 });
await adminPage.goto(`${base}/#/admin/reviews`, { waitUntil: 'networkidle' });
await adminPage.locator('.review-event-card').first().waitFor({ state: 'visible' });
await adminPage.screenshot({ path: `${output}/mobile-admin-registration-event-picker.png`, fullPage: true });
const mobileRegistrationPickerOverflow = await adminPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
await adminPage.goto(`${base}/#/admin/reviews?event=1`, { waitUntil: 'networkidle' });
await adminPage.locator('[data-admin-review-group]').waitFor({ state: 'visible' });
await adminPage.screenshot({ path: `${output}/mobile-admin-registration-group-picker.png`, fullPage: true });
const mobileRegistrationGroupOverflow = await adminPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
checks.push({ profile: 'mobile-admin-registration-progressive-filter', pickerOverflow: mobileRegistrationPickerOverflow, groupOverflow: mobileRegistrationGroupOverflow, valid: !mobileRegistrationPickerOverflow && !mobileRegistrationGroupOverflow });
await adminPage.setViewportSize({ width: 1440, height: 1000 });
await adminPage.goto(`${base}/#/admin/reviews`, { waitUntil: 'networkidle' });
await adminPage.locator('.review-event-card').first().waitFor({ state: 'visible' });
await adminPage.locator('a[href="#/admin/reviews?event=1"]').click();
await adminPage.locator('[data-admin-review-group]').waitFor({ state: 'visible' });
const registrationListHiddenBeforeGroup = await adminPage.locator('[data-action="admin-view-registration"]').count() === 0;
await adminPage.screenshot({ path: `${output}/desktop-admin-registration-group-picker.png`, fullPage: true });
await adminPage.locator('[data-admin-review-group]').selectOption({ label: 'RECF-Achieve 初中组' });
await adminPage.waitForURL(/event=1.*group=RECF-Achieve/);
const registrationGroupContext = await adminPage.locator('[data-admin-review-group]').inputValue();
checks.push({ profile: 'admin-registration-progressive-filter', eventCards: registrationEventCards, approvedTeamCountVisible, listHiddenBeforeEvent: registrationListHiddenBeforeEvent, listHiddenBeforeGroup: registrationListHiddenBeforeGroup, group: registrationGroupContext, valid: registrationEventCards > 0 && approvedTeamCountVisible && registrationListHiddenBeforeEvent && registrationListHiddenBeforeGroup && registrationGroupContext === 'RECF-Achieve 初中组' });
await adminPage.goto(`${base}/#/admin/reviews?event=1&group=${encodeURIComponent('RECF-Achieve 初中组')}&q=XN-2401`, { waitUntil: 'networkidle' });
await adminPage.locator('[data-action="admin-view-registration"]').first().waitFor({ state: 'visible' });
const registrationSearchRows = await adminPage.locator('.desktop-table tbody tr').count();
const registrationSearchNotice = await adminPage.locator('.workbench-note').innerText();
await adminPage.screenshot({ path: `${output}/desktop-admin-registration-search.png`, fullPage: true });
checks.push({ profile: 'admin-registration-search', rows: registrationSearchRows, notice: registrationSearchNotice, valid: registrationSearchRows === 1 && registrationSearchNotice.includes('原审核排序逻辑保持不变') });
await adminPage.goto(`${base}/#/admin/activity-applications`, { waitUntil: 'networkidle' });
await adminPage.locator('.review-event-card').first().waitFor({ state: 'visible' });
const activityEventCards = await adminPage.locator('.review-event-card').count();
const activityListHiddenBeforeEvent = await adminPage.locator('[data-action="admin-view-activity-application"]').count() === 0;
await adminPage.screenshot({ path: `${output}/desktop-admin-activity-event-picker.png`, fullPage: true });
checks.push({ profile: 'admin-activity-progressive-filter', eventCards: activityEventCards, listHiddenBeforeEvent: activityListHiddenBeforeEvent, valid: activityEventCards > 0 && activityListHiddenBeforeEvent });
await adminPage.goto(`${base}/#/admin/activity-applications?event=1&q=${encodeURIComponent('视觉测试志愿者')}`, { waitUntil: 'networkidle' });
await adminPage.locator('[data-action="admin-view-activity-application"]').first().waitFor({ state: 'visible' });
const activitySearchRows = await adminPage.locator('.desktop-table tbody tr').count();
checks.push({ profile: 'admin-activity-search', rows: activitySearchRows, value: await adminPage.locator('[data-admin-search] [name="q"]').inputValue(), valid: activitySearchRows === 1 });
await adminPage.goto(`${base}/#/admin/events/new`, { waitUntil: 'networkidle' });
await adminPage.locator('form[data-form="admin-event"]').waitFor({ state: 'visible' });
const activityToggleCount = await adminPage.locator('.event-toggle-card input[type="checkbox"]').count();
await adminPage.locator('#registration_end').fill('2026-11-30T18:00');
await adminPage.locator('#refund_deadline_days').fill('10');
const refundDeadlinePreview = await adminPage.locator('[data-refund-deadline-preview]').inputValue();
checks.push({ profile: 'admin-event-form', title: await adminPage.locator('h1').first().textContent(), formFields: await adminPage.locator('form[data-form="admin-event"] input, form[data-form="admin-event"] textarea, form[data-form="admin-event"] select').count(), activityToggleCount, refundDeadlinePreview, overflow: await adminPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: activityToggleCount === 2 && refundDeadlinePreview === '2026年11月20日 24:00' });
const visualEditor = adminPage.locator('[data-markdown-visual]');
await visualEditor.evaluate((editor) => {
  editor.innerHTML = '<h1>办赛通知预览</h1><p>请各参赛单位按时完成报名。</p><ul><li>核对战队资料</li><li>上传支付凭证</li></ul><table><thead><tr><th>项目</th><th>内容</th></tr></thead><tbody><tr><td>地点</td><td>上海</td></tr></tbody></table>';
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  const text = editor.querySelector('p').firstChild;
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 6);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
});
await adminPage.getByRole('button', { name: '加粗' }).click();
await visualEditor.evaluate((editor) => {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
});
const noticeImageInput = adminPage.locator('[data-markdown-image-input]');
await noticeImageInput.setInputFiles({ name: 'payment-code.png', mimeType: 'image/png', buffer: Buffer.from(tinyPng.split(',')[1], 'base64') });
await adminPage.waitForFunction(() => document.querySelector('[data-markdown-visual] img')?.getAttribute('src')?.startsWith('/uploads/notice_image-'));
const storedMarkdown = await adminPage.locator('[data-markdown-source]').inputValue();
const noticeImageUrl = await visualEditor.locator('img').first().getAttribute('src');
const visualEditorValid = await visualEditor.getAttribute('contenteditable') === 'true'
  && await visualEditor.locator('h1').textContent() === '办赛通知预览'
  && await visualEditor.locator('li').count() === 2
  && await visualEditor.locator('table').count() === 1
  && await visualEditor.locator('strong, b').first().textContent() === '请各参赛单位'
  && await visualEditor.locator('img').count() === 1;
const visualEditorImageBorderless = await visualEditor.locator('img').first().evaluate((image) => {
  const style = getComputedStyle(image);
  return style.borderTopWidth === '0px'
    && style.borderRightWidth === '0px'
    && style.borderBottomWidth === '0px'
    && style.borderLeftWidth === '0px'
    && style.boxShadow === 'none';
});
const visualTableStyled = await visualEditor.locator('table').evaluate((table) => {
  const cell = table.querySelector('td');
  return getComputedStyle(table).borderCollapse === 'collapse'
    && cell
    && getComputedStyle(cell).borderTopWidth === '1px';
});
const markdownStorageValid = storedMarkdown.includes('**请各参赛单位**') && storedMarkdown.includes('| 项目 | 内容 |') && storedMarkdown.includes('- 核对战队资料') && storedMarkdown.includes('![payment-code](/uploads/notice_image-');
const sourceEditorRemoved = await adminPage.locator('[data-markdown-input], [data-markdown-preview]').count() === 0;
const markdownWordingRemoved = await adminPage.getByText('通知正文（Markdown）', { exact: true }).count() === 0
  && await adminPage.getByText('Markdown 通知正文', { exact: false }).count() === 0;
const toolbarButtons = await adminPage.locator('.markdown-toolbar .markdown-tool').count();
const noticePdfInput = adminPage.locator('input[data-kind="notice"]');
const noticeBodyOptional = await visualEditor.getAttribute('aria-required') === 'false';
const noticePdfAccept = await noticePdfInput.getAttribute('accept');
await noticePdfInput.setInputFiles({ name: 'visual-notice.pdf', mimeType: 'application/pdf', buffer: makePdfBuffer('Ruibude notice PDF') });
await adminPage.waitForFunction(() => document.querySelector('input[name="notice_url"]')?.value.startsWith('/uploads/'));
const uploadedNoticeUrl = await adminPage.locator('input[name="notice_url"]').inputValue();
const noticePdfPreviewVisible = await adminPage.getByText('已上传办赛通知 PDF', { exact: true }).isVisible();
const noticeRemoveVisible = await adminPage.getByRole('button', { name: '移除 PDF', exact: true }).isVisible();
await adminPage.screenshot({ path: `${output}/desktop-admin-event-markdown.png`, fullPage: true });
checks.push({ profile: 'admin-event-markdown', toolbarButtons, visualEditorValid, visualEditorImageBorderless, visualTableStyled, markdownStorageValid, sourceEditorRemoved, markdownWordingRemoved, noticeBodyOptional, noticePdfAccept, noticePdfPreviewVisible, noticeRemoveVisible, valid: toolbarButtons === 11 && visualEditorValid && visualEditorImageBorderless && visualTableStyled && markdownStorageValid && sourceEditorRemoved && markdownWordingRemoved && noticeBodyOptional && noticePdfAccept === 'application/pdf' && noticePdfPreviewVisible && noticeRemoveVisible });
await adminPage.getByRole('button', { name: '移除 PDF', exact: true }).click();
const noticeRemovalValid = await adminPage.locator('input[name="notice_url"]').inputValue() === ''
  && await adminPage.locator('[data-preview="notice_url"]').getByText('尚未上传', { exact: true }).isVisible();
checks.push({ profile: 'admin-event-pdf-remove', valid: noticeRemovalValid });
const noticeEventsResponse = await adminContext.request.get(`${base}/api/admin/events`);
const noticeEvents = await noticeEventsResponse.json();
const noticeEvent = noticeEvents.events.find((event) => event.id === 1) || noticeEvents.events[0];
const noticeImageAttachResponse = await adminContext.request.put(`${base}/api/admin/events/${noticeEvent.id}`, { headers: { 'X-CSRF-Token': adminAuth.csrfToken }, data: { ...noticeEvent, notice_markdown: storedMarkdown, notice_url: '' } });
if (!noticeImageAttachResponse.ok()) throw new Error(`Notice image attach failed: ${noticeImageAttachResponse.status()} ${await noticeImageAttachResponse.text()}`);
await adminPage.goto(`${base}/#/events/${noticeEvent.id}?notice=image`, { waitUntil: 'networkidle' });
await adminPage.locator('.notice-markdown img').waitFor({ state: 'visible' });
const noticeImageAssetResponse = await adminContext.request.get(`${base}${noticeImageUrl}`);
const noticeImageVisible = await adminPage.locator('.notice-markdown img').first().evaluate((image) => image.complete && image.naturalWidth > 0);
const noticeImageBorderless = await adminPage.locator('.notice-markdown img').first().evaluate((image) => {
  const style = getComputedStyle(image);
  return style.borderTopWidth === '0px'
    && style.borderRightWidth === '0px'
    && style.borderBottomWidth === '0px'
    && style.borderLeftWidth === '0px';
});
const noticeImageOverflow = await adminPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
checks.push({ profile: 'event-notice-image', noticeImageUrl, contentType: noticeImageAssetResponse.headers()['content-type'], visible: noticeImageVisible, borderless: noticeImageBorderless, overflow: noticeImageOverflow, valid: noticeImageUrl?.startsWith('/uploads/notice_image-') && noticeImageAssetResponse.ok() && noticeImageAssetResponse.headers()['content-type']?.startsWith('image/png') && noticeImageVisible && noticeImageBorderless && !noticeImageOverflow });
const noticeAttachResponse = await adminContext.request.put(`${base}/api/admin/events/${noticeEvent.id}`, { headers: { 'X-CSRF-Token': adminAuth.csrfToken }, data: { ...noticeEvent, notice_markdown: '', notice_url: uploadedNoticeUrl } });
if (!noticeAttachResponse.ok()) throw new Error(`Notice PDF attach failed: ${noticeAttachResponse.status()} ${await noticeAttachResponse.text()}`);
const noticePdfAssetResponse = await adminContext.request.get(`${base}${uploadedNoticeUrl}`);
const noticePdfContentType = noticePdfAssetResponse.headers()['content-type'];
const noticePdfDisposition = noticePdfAssetResponse.headers()['content-disposition'];
const noticePdfFrameHeader = noticePdfAssetResponse.headers()['x-frame-options'] || '';
await adminPage.goto(`${base}/#/events/${noticeEvent.id}?notice=pdf`, { waitUntil: 'networkidle' });
await adminPage.locator('.notice-pdf-frame').waitFor({ state: 'visible' });
await adminPage.waitForTimeout(1000);
const pdfOnlyNoticeValid = await adminPage.locator('.notice-markdown').count() === 0
  && (await adminPage.locator('.notice-pdf-frame').getAttribute('src')) === `${uploadedNoticeUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`
  && await adminPage.locator('.notice-pdf-header a').count() === 0
  && (await adminPage.locator('.notice-pdf-frame').getAttribute('sandbox')) === null
  && noticePdfContentType?.startsWith('application/pdf')
  && noticePdfDisposition === 'inline'
  && noticePdfFrameHeader === '';
await adminPage.screenshot({ path: `${output}/desktop-event-pdf-notice.png`, fullPage: true });
checks.push({ profile: 'event-pdf-notice', pdfOnlyNoticeValid, overflow: await adminPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: pdfOnlyNoticeValid });
await adminPage.setViewportSize({ width: 375, height: 812 });
await adminPage.goto(`${base}/#/admin/events/new`, { waitUntil: 'networkidle' });
await adminPage.screenshot({ path: `${output}/mobile-admin-event-markdown.png`, fullPage: true });
checks.push({ profile: 'mobile-admin-event-markdown', toolbarButtons: await adminPage.locator('.markdown-tool').count(), noticePdfVisible: await adminPage.locator('.notice-file-picker').isVisible(), overflow: await adminPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: await adminPage.locator('.markdown-toolbar').isVisible() && await adminPage.locator('.notice-file-picker').isVisible() });
await adminPage.setViewportSize({ width: 1440, height: 1000 });
await adminPage.goto(`${base}/#/admin/activity-applications?event=1&status=pending`, { waitUntil: 'networkidle' });
await adminPage.screenshot({ path: `${output}/desktop-admin-activity-applications.png`, fullPage: true });
const adminActivityRows = await adminPage.locator('.desktop-table tbody tr').count();
checks.push({ profile: 'admin-activity-applications', title: await adminPage.locator('h1').first().textContent(), rows: adminActivityRows, overflow: await adminPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), valid: adminActivityRows === 2 });
await adminPage.getByRole('button', { name: '审核' }).first().click();
await adminPage.locator('.modal').waitFor({ state: 'visible' });
await adminPage.screenshot({ path: `${output}/desktop-admin-activity-detail.png`, fullPage: true });
const activityApproveVisible = await adminPage.getByRole('button', { name: '通过' }).isVisible();
checks.push({ profile: 'admin-activity-detail', title: await adminPage.locator('#modal-title').textContent(), approveVisible: activityApproveVisible, valid: activityApproveVisible });
await adminPage.getByRole('button', { name: '通过' }).click();
await adminPage.locator('form[data-form="activity-review"]').waitFor({ state: 'visible' });
await adminPage.getByRole('button', { name: '确认通过' }).click();
await adminPage.locator('.modal').waitFor({ state: 'detached' });
await adminPage.goto(`${base}/#/admin/activity-applications?event=1&status=approved`, { waitUntil: 'networkidle' });
await adminPage.locator('[data-action="admin-view-activity-application"]').first().click();
await adminPage.locator('.modal').waitFor({ state: 'visible' });
const activityCanChangeToRejected = await adminPage.getByRole('button', { name: '改为驳回' }).isVisible();
await adminPage.screenshot({ path: `${output}/desktop-admin-activity-approved-detail.png`, fullPage: true });
await adminPage.getByRole('button', { name: '改为驳回' }).click();
const activityRejectForm = adminPage.locator('form[data-form="activity-review"]');
await activityRejectForm.waitFor({ state: 'visible' });
await activityRejectForm.locator('#reason').fill('视觉验收：复核后需要补充资料');
await activityRejectForm.getByRole('button', { name: '确认驳回' }).click();
await adminPage.locator('.modal').waitFor({ state: 'detached' });
await adminPage.goto(`${base}/#/admin/activity-applications?event=1&status=rejected`, { waitUntil: 'networkidle' });
await adminPage.locator('[data-action="admin-view-activity-application"]').first().click();
await adminPage.locator('.modal').waitFor({ state: 'visible' });
const activityCanChangeBackToApproved = await adminPage.getByRole('button', { name: '改为通过' }).isVisible();
checks.push({ profile: 'admin-activity-review-reversible', canRejectApproved: activityCanChangeToRejected, canApproveRejected: activityCanChangeBackToApproved, valid: activityCanChangeToRejected && activityCanChangeBackToApproved });
await adminPage.getByRole('button', { name: '关闭', exact: true }).click();

await adminPage.goto(`${base}/#/admin/reviews?event=1&group=${encodeURIComponent('RECF-Achieve 初中组')}&status=pending`, { waitUntil: 'networkidle' });
await adminPage.locator('[data-action="admin-view-registration"]').first().click();
await adminPage.locator('.modal').waitFor({ state: 'visible' });
await adminPage.getByRole('button', { name: '通过' }).click();
await adminPage.locator('form[data-form="review"]').waitFor({ state: 'visible' });
await adminPage.getByRole('button', { name: '确认通过' }).click();
await adminPage.locator('.modal').waitFor({ state: 'detached' });
await adminPage.goto(`${base}/#/admin/reviews?event=1&group=${encodeURIComponent('RECF-Achieve 初中组')}&status=approved`, { waitUntil: 'networkidle' });
await adminPage.locator('[data-action="admin-view-registration"]').first().click();
await adminPage.locator('.modal').waitFor({ state: 'visible' });
const registrationCanChangeToRejected = await adminPage.getByRole('button', { name: '改为驳回' }).isVisible();
await adminPage.getByRole('button', { name: '改为驳回' }).click();
const registrationRejectForm = adminPage.locator('form[data-form="review"]');
await registrationRejectForm.waitFor({ state: 'visible' });
await registrationRejectForm.locator('#reason').fill('视觉验收：付款凭证需要重新核对');
await registrationRejectForm.getByRole('button', { name: '确认驳回' }).click();
await adminPage.locator('.modal').waitFor({ state: 'detached' });
await adminPage.goto(`${base}/#/admin/reviews?event=1&group=${encodeURIComponent('RECF-Achieve 初中组')}&status=rejected`, { waitUntil: 'networkidle' });
await adminPage.locator('[data-action="admin-view-registration"]').first().click();
await adminPage.locator('.modal').waitFor({ state: 'visible' });
const registrationCanChangeBackToApproved = await adminPage.getByRole('button', { name: '改为通过' }).isVisible();
await adminPage.screenshot({ path: `${output}/desktop-admin-registration-rejected-detail.png`, fullPage: true });
checks.push({ profile: 'admin-registration-review-reversible', canRejectApproved: registrationCanChangeToRejected, canApproveRejected: registrationCanChangeBackToApproved, valid: registrationCanChangeToRejected && registrationCanChangeBackToApproved });
const refundRequestVisible = await adminPage.locator('.modal').getByText('退费待处理', { exact: true }).isVisible();
const refundApproveVisible = await adminPage.getByRole('button', { name: '同意退费', exact: true }).isVisible();
await adminPage.getByRole('button', { name: '同意退费', exact: true }).click();
const refundReviewForm = adminPage.locator('form[data-form="refund-review"]');
await refundReviewForm.waitFor({ state: 'visible' });
await refundReviewForm.locator('#note').fill('视觉验收：财务确认可办理');
await refundReviewForm.getByRole('button', { name: '确认同意', exact: true }).click();
await adminPage.locator('.modal').waitFor({ state: 'detached' });
await adminPage.locator('[data-action="admin-view-registration"]').first().click();
await adminPage.locator('.modal').waitFor({ state: 'visible' });
const refundCanChangeToRejected = await adminPage.getByRole('button', { name: '改为拒绝退费', exact: true }).isVisible();
await adminPage.screenshot({ path: `${output}/desktop-admin-refund-approved-detail.png`, fullPage: true });
checks.push({ profile: 'admin-refund-review', requestVisible: refundRequestVisible, approveVisible: refundApproveVisible, canChangeToRejected: refundCanChangeToRejected, valid: refundRequestVisible && refundApproveVisible && refundCanChangeToRejected });
await adminContext.close();

await browser.close();
browser = undefined;
console.log(JSON.stringify({ checks, errors }, null, 2));
if (errors.length || checks.some((check) => check.overflow || check.leakedCredentials || check.captchaLoaded === false || check.valid === false)) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (ownedApp) {
    await new Promise((resolveClose) => ownedApp.server.close(resolveClose));
    ownedApp.db.close();
    await rm(ownedApp.dir, { recursive: true, force: true });
  }
}
