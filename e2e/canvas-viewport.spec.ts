import { expect, test, type Page } from "@playwright/test";

interface ScreenPoint { x: number; y: number }

async function readViewport(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".editor-canvas-shell")!;
    const canvas = document.querySelector<HTMLElement>(".wysiwyg-page")!;
    const bounds = canvas.getBoundingClientRect();
    const shellBounds = shell.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, zoom: bounds.width / canvas.offsetWidth, shellX: shellBounds.x, shellY: shellBounds.y, shellWidth: shell.clientWidth, shellHeight: shell.clientHeight };
  });
}

async function assertAnchoredPoint(page: Page, pointer: ScreenPoint, documentPoint: ScreenPoint) {
  const viewport = await readViewport(page);
  expect(Math.abs(viewport.x + documentPoint.x * viewport.zoom - pointer.x)).toBeLessThan(1);
  expect(Math.abs(viewport.y + documentPoint.y * viewport.zoom - pointer.y)).toBeLessThan(1);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "English" }).click();
  await page.goto("/projects/project-logistics-center/plan");
  await expect(page.locator(".wysiwyg-page")).toBeVisible();
});

test("wheel zoom keeps an off-center point fixed across fit, deep zoom and zoom-out", async ({ page, browserName }) => {
  for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    await page.getByRole("button", { name: "Fit plan" }).click();
    const initial = await readViewport(page);
    const pointer = { x: Math.floor(initial.x + initial.width * 0.23), y: Math.floor(initial.y + initial.height * 0.37) };
    const documentPoint = { x: (pointer.x - initial.x) / initial.zoom, y: (pointer.y - initial.y) / initial.zoom };
    await page.mouse.move(pointer.x, pointer.y);
    await page.keyboard.down(browserName === "webkit" ? "Meta" : "Control");
    for (const delta of [-100, -600, -600, 600, 600, 100, 600]) {
      const before = await readViewport(page);
      await page.mouse.wheel(0, delta);
      await expect.poll(async () => (await readViewport(page)).zoom).not.toBe(before.zoom);
      await assertAnchoredPoint(page, pointer, documentPoint);
    }
    await page.keyboard.up(browserName === "webkit" ? "Meta" : "Control");
  }
});

test("rapid pinch deltas accumulate proportionally and leave saved plan geometry untouched", async ({ page }) => {
  const initial = await readViewport(page);
  const storedPlan = await page.evaluate(() => JSON.parse(localStorage.getItem("quicksige.database.v3")!).plans);
  const pointer = { x: Math.floor(initial.x + initial.width * 0.8), y: Math.floor(initial.y + initial.height * 0.7) };
  const documentPoint = { x: (pointer.x - initial.x) / initial.zoom, y: (pointer.y - initial.y) / initial.zoom };
  await page.locator(".editor-canvas-shell").evaluate((shell, pointer) => {
    for (let index = 0; index < 30; index += 1) shell.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -1, clientX: pointer.x, clientY: pointer.y }));
  }, pointer);
  await expect.poll(async () => (await readViewport(page)).zoom).toBeCloseTo(initial.zoom * Math.pow(1.15, 0.3), 5);
  await assertAnchoredPoint(page, pointer, documentPoint);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("quicksige.database.v3")!).plans)).toEqual(storedPlan);
});

test("ordinary and shift wheel pan without zooming and fit restores a centered view", async ({ page }) => {
  const initial = await readViewport(page);
  await page.locator(".editor-canvas-shell").hover();
  await page.mouse.wheel(70, 90);
  await expect.poll(async () => (await readViewport(page)).x).toBeCloseTo(initial.x - 70, 2);
  const panned = await readViewport(page);
  expect(panned.y).toBeCloseTo(initial.y - 90, 2);
  expect(panned.zoom).toBe(initial.zoom);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 50);
  await page.keyboard.up("Shift");
  await expect.poll(async () => (await readViewport(page)).x).toBeCloseTo(panned.x - 50, 2);
  await page.getByRole("button", { name: "Fit plan" }).click();
  const fitted = await readViewport(page);
  expect(fitted.x - fitted.shellX).toBeCloseTo((fitted.shellWidth - fitted.width) / 2, 2);
  expect(fitted.y - fitted.shellY).toBeCloseTo((fitted.shellHeight - fitted.height) / 2, 2);
});

test("selection controls follow a selected element during pointer zoom and pan", async ({ page, browserName }) => {
  const block = page.locator(".canvas-block").first();
  await block.evaluate((element) => (element as HTMLElement).click());
  await expect(page.locator(".moveable-control-box")).toBeVisible();
  const bounds = (await block.boundingBox())!;
  await page.mouse.move(Math.floor(bounds.x + bounds.width / 2), Math.floor(bounds.y + bounds.height / 2));
  await page.keyboard.down(browserName === "webkit" ? "Meta" : "Control");
  await page.mouse.wheel(0, -200);
  await page.keyboard.up(browserName === "webkit" ? "Meta" : "Control");
  await page.mouse.wheel(30, 25);
  await expect.poll(async () => {
    const target = (await block.boundingBox())!;
    const handles = await page.locator(".moveable-control-box .moveable-line").evaluateAll((lines) => {
      const boxes = lines.map((line) => line.getBoundingClientRect()).filter((box) => box.width > 0 || box.height > 0);
      return { left: Math.min(...boxes.map((box) => box.left)), right: Math.max(...boxes.map((box) => box.right)), top: Math.min(...boxes.map((box) => box.top)), bottom: Math.max(...boxes.map((box) => box.bottom)) };
    });
    return Math.max(Math.abs((handles.left + handles.right) / 2 - target.x - target.width / 2), Math.abs((handles.top + handles.bottom) / 2 - target.y - target.height / 2));
  }).toBeLessThan(2);
});
