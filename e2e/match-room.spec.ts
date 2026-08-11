import { expect, test } from '@playwright/test';

function beijingInputInTwoHours() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(Date.now() + 2 * 60 * 60_000));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

test('two anonymous players cannot take the same seat', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await host.goto('/#/create');
  await host.getByLabel('房间标题').fill('Playwright 约战');
  await host.getByLabel('开赛时间（北京时间）').fill(beijingInputInTwoHours());
  await host.getByLabel('游戏昵称').fill('房主');
  await host.getByLabel('QQ').fill('12345678');
  await host.getByRole('checkbox').check();
  await host.getByRole('button', { name: '创建约战' }).click();
  await expect(host.locator('.room-heading')).toContainText('Playwright 约战');
  const roomUrl = host.url().replace(/\?.*$/, '');

  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await Promise.all([first.goto(roomUrl), second.goto(roomUrl)]);
  await Promise.all([
    first.locator('.team-b').getByRole('button', { name: '占这个位置' }).first().click(),
    second.locator('.team-b').getByRole('button', { name: '占这个位置' }).first().click(),
  ]);
  await first.getByLabel('游戏昵称').fill('玩家甲');
  await first.getByLabel('QQ').fill('22345678');
  await first.getByRole('checkbox').check();
  await second.getByLabel('游戏昵称').fill('玩家乙');
  await second.getByLabel('QQ').fill('32345678');
  await second.getByRole('checkbox').check();
  await Promise.all([
    first.getByRole('button', { name: '确认报名' }).click(),
    second.getByRole('button', { name: '确认报名' }).click(),
  ]);

  await expect.poll(async () => {
    const texts = await Promise.all([
      first.locator('.team-b').innerText(),
      second.locator('.team-b').innerText(),
    ]);
    return texts.some((text) => text.includes('玩家甲') || text.includes('玩家乙'));
  }).toBe(true);
  const errors = await Promise.all([
    first.getByText('这个位置刚刚被其他玩家抢走了，请选择其他位置。').count(),
    second.getByText('这个位置刚刚被其他玩家抢走了，请选择其他位置。').count(),
  ]);
  expect(errors[0] + errors[1]).toBe(1);

  await Promise.all([hostContext.close(), firstContext.close(), secondContext.close()]);
});

for (const width of [320, 375, 430]) {
  test(`lobby and create form fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/#/');
    await expect(page.getByRole('heading', { name: '下一场，缺谁？' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto('/#/create');
    await expect(page.getByRole('heading', { name: '创建约战' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
