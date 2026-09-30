import { expect, test } from "@playwright/test";

interface PreviewObservation { id: string; src: string }
type PreviewWindow = Window & { previewObservations: PreviewObservation[] };

test("PDF pages never flash the cover during cold load, placement, expansion or tab re-entry", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "English" }).click();
  await page.addInitScript(() => {
    const previewWindow = window as PreviewWindow;
    previewWindow.previewObservations = [];
    const capture = () => document.querySelectorAll<HTMLImageElement>(".canvas-asset img, .pdf-page-thumbnail img").forEach((image) => {
      const id = image.closest<HTMLElement>("[data-element-id]")?.dataset.elementId
        ?? image.closest(".pdf-page-item")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const src = image.getAttribute("src") ?? "";
      const previous = previewWindow.previewObservations.filter((entry) => entry.id === id).at(-1);
      if (!previous || previous.src !== src) previewWindow.previewObservations.push({ id, src });
    });
    new MutationObserver(capture).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  });
  let releaseSource!: () => void;
  const sourceGate = new Promise<void>((resolve) => { releaseSource = resolve; });
  let sourceRequests = 0;
  await page.route("**/Infos.pdf", async (route) => { sourceRequests += 1; await sourceGate; await route.continue(); });
  await page.goto("/projects/project-logistics-center/plan", { waitUntil: "domcontentloaded" });
  const pageTwo = page.locator('[data-element-id="layout-logistics-info-page-2"]');
  await expect(pageTwo.locator(".pdf-page-placeholder")).toBeVisible();
  await expect(pageTwo.locator("img")).toHaveCount(0);
  const toggle = page.locator(".pdf-library-document-toggle");
  await toggle.click();
  await page.locator(".pdf-page-list").scrollIntoViewIfNeeded();
  const secondThumbnail = page.locator(".pdf-page-item").nth(1).locator(".pdf-page-thumbnail");
  await expect(secondThumbnail.locator("img")).toHaveCount(0);
  await expect(secondThumbnail).toContainText("2");
  releaseSource();
  await expect(pageTwo.locator("img")).toHaveAttribute("src", /^data:image\/png/);
  await expect(secondThumbnail.locator("img")).toHaveAttribute("src", /^data:image\/png/);
  const canvasPreview = await pageTwo.locator("img").getAttribute("src");
  const thumbnailPreview = await secondThumbnail.locator("img").getAttribute("src");
  const requestsAfterLoading = sourceRequests;
  await toggle.click();
  await toggle.click();
  await page.locator(".pdf-page-list").scrollIntoViewIfNeeded();
  await expect(secondThumbnail.locator("img")).toHaveAttribute("src", thumbnailPreview!);
  expect(sourceRequests).toBe(requestsAfterLoading);
  const canvasCount = await page.locator(".canvas-asset").count();
  await page.locator(".pdf-page-item").nth(1).getByRole("button", { name: /Add page 2|Place page 2/i }).click();
  await expect(page.locator(".canvas-asset")).toHaveCount(canvasCount + 1);
  await expect(page.locator(".canvas-asset").last().locator("img")).toHaveAttribute("src", canvasPreview!);
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  const requestsBeforeReentry = sourceRequests;
  await page.getByRole("link", { name: "Safety plan", exact: true }).click();
  await expect(pageTwo.locator("img")).toHaveAttribute("src", canvasPreview!);
  expect(sourceRequests).toBe(requestsBeforeReentry);
  const observations = await page.evaluate(() => (window as PreviewWindow).previewObservations);
  const laterPages = observations.filter((entry) => /info-page-[234]$|Page [234]/.test(entry.id));
  expect(laterPages.length).toBeGreaterThan(3);
  expect(laterPages.every((entry) => entry.src.startsWith("data:image/png"))).toBe(true);
});

test("a missing PDF source keeps later pages as numbered error placeholders", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "English" }).click();
  await page.route("**/Infos.pdf", (route) => route.fulfill({ status: 404, body: "Missing" }));
  await page.goto("/projects/project-logistics-center/plan");
  const pageThree = page.locator('[data-element-id="layout-logistics-info-page-3"]');
  await expect(pageThree).toContainText("Preview unavailable");
  await expect(pageThree).toContainText(/page 3/i);
  await expect(pageThree.locator("img")).toHaveCount(0);
});
