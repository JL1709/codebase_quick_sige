import AxeBuilder from "@axe-core/playwright";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "quicksige.database.v3";

test.beforeEach(async ({ page }) => {
  await page.goto("/settings");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /English/ }).click();
});

async function logoFixture(page: Page, width = 240, height = 80): Promise<Buffer> {
  const dataUrl = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#245d4c"; context.fillRect(0, 0, width, height);
    context.fillStyle = "#d5ff3f"; context.font = "bold 30px sans-serif"; context.fillText("QUICK", 16, 50);
    return canvas.toDataURL("image/png");
  }, { width, height });
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

test("organization details persist, stay independent of the account, and fit desktop and mobile", async ({ page }, testInfo) => {
  await page.getByLabel("Organization name").fill("Example Engineering GmbH");
  await page.getByLabel("Street", { exact: true }).fill("Example Street");
  await page.getByLabel("House number").fill("12a");
  await page.getByLabel("Address addition").fill("2nd floor");
  await page.getByLabel("Postal code").fill("01234");
  await page.getByLabel("City", { exact: true }).fill("Berlin");
  await page.getByLabel("State / region").fill("Berlin");
  await page.getByLabel("Country", { exact: true }).selectOption("DE");
  await page.getByLabel("Phone", { exact: true }).fill("030 123456");
  await page.getByLabel("Extension", { exact: true }).fill("42");
  await page.getByLabel("Mobile phone", { exact: true }).fill("0151 23456789");
  await page.getByLabel("Fax", { exact: true }).fill("030 654321");
  await page.getByLabel("Fax extension").fill("003");
  await page.getByLabel("Organization email").fill("office@example.test");
  await page.getByLabel("Website").fill("example.com");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Organization details saved.");
  await page.reload();
  await expect(page.getByLabel("Organization name")).toHaveValue("Example Engineering GmbH");
  await expect(page.getByLabel("Postal code")).toHaveValue("01234");
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue("30 123456");
  await expect(page.getByLabel("Mobile phone", { exact: true })).toHaveValue("1512 3456789");
  await expect(page.getByLabel("Fax", { exact: true })).toHaveValue("30 654321");
  await expect(page.getByLabel("Website")).toHaveValue("https://example.com/");
  await expect(page.getByText("max@example.test", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("organization-desktop.png"), fullPage: true });
  expect((await new AxeBuilder({ page }).include(".organization-profile").analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Organization name")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("organization-mobile.png"), fullPage: true });
});

test("calling codes are searchable, independent, keyboard accessible, and preserved on reload", async ({ page }, testInfo) => {
  await page.getByLabel("Country", { exact: true }).selectOption("DE");
  await expect(page.getByRole("button", { name: /^Phone country calling code:/ })).toHaveText(/\+49/);
  await expect(page.getByRole("button", { name: /^Mobile phone country calling code:/ })).toHaveText(/\+49/);
  await expect(page.getByRole("button", { name: /^Fax country calling code:/ })).toHaveText(/\+49/);
  await expect(page.getByText("Use + for international numbers, or select the appropriate country for national numbers.")).toHaveCount(0);
  await page.getByLabel("Phone", { exact: true }).fill("030 123456");
  await page.getByRole("button", { name: /^Mobile phone country calling code:/ }).click();
  const search = page.getByRole("combobox", { name: "Search country or calling code" });
  await search.fill("United Kingdom");
  await search.press("Enter");
  await page.getByLabel("Mobile phone", { exact: true }).fill("07400 123456");
  await page.getByRole("button", { name: /^Fax country calling code:/ }).click();
  await search.fill("+33");
  await page.getByRole("dialog", { name: "Fax country calling code" }).getByRole("option", { name: /France/ }).click();
  await page.getByLabel("Fax", { exact: true }).fill("01 42 68 53 00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const stored = await page.evaluate((key) => {
    const { phone, mobilePhone, fax, address } = JSON.parse(localStorage.getItem(key)!).organization;
    return { phone, mobilePhone, fax, country: address.countryCode };
  }, STORAGE_KEY);
  expect(stored).toEqual({ phone: "+4930123456", mobilePhone: "+447400123456", fax: "+33142685300", country: "DE" });
  await page.reload();
  await expect(page.getByRole("button", { name: /^Mobile phone country calling code:/ })).toHaveText(/\+44/);
  await expect(page.getByRole("button", { name: /^Fax country calling code:/ })).toHaveText(/\+33/);
  await page.getByLabel("Phone", { exact: true }).fill("+44 20 7946 0018");
  await expect(page.getByRole("button", { name: /^Phone country calling code:/ })).toHaveText(/\+44/);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).organization.phone, STORAGE_KEY)).toBe("+442079460018");
  await page.getByRole("button", { name: /^Phone country calling code:/ }).click();
  await search.fill("no-such-country");
  await expect(page.getByText("No matching countries.")).toBeVisible();
  await search.press("Escape");
  await expect(page.getByRole("dialog", { name: "Phone country calling code" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^Mobile phone country calling code:/ }).click();
  await search.fill("+44");
  expect((await new AxeBuilder({ page }).include(".organization-profile").analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("calling-code-mobile.png"), fullPage: true });
});

test("international display accepts national typing, pasted country codes, and caret editing", async ({ page }, testInfo) => {
  await page.getByLabel("Country", { exact: true }).selectOption("DE");
  const mobile = page.getByLabel("Mobile phone", { exact: true });
  await mobile.pressSequentially("015237894561");
  await expect(mobile).toHaveValue("1523 7894561");
  await expect(page.getByRole("button", { name: /^Mobile phone country calling code:/ })).toHaveText(/\+49/);
  await mobile.locator("..").screenshot({ path: testInfo.outputPath("mobile-phone-international-display.png") });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).organization.mobilePhone, STORAGE_KEY)).toBe("+4915237894561");
  await page.reload();
  await expect(mobile).toHaveValue("1523 7894561");

  await mobile.fill("+44 7400 123456");
  await expect(mobile).toHaveValue("7400 123456");
  await expect(page.getByRole("button", { name: /^Mobile phone country calling code:/ })).toHaveText(/\+44/);
  await mobile.fill("01523 7894561");
  await page.getByRole("button", { name: /^Mobile phone country calling code:/ }).click();
  await page.getByRole("combobox", { name: "Search country or calling code" }).fill("Germany");
  await page.getByRole("dialog", { name: "Mobile phone country calling code" }).getByRole("option", { name: /Germany/ }).click();
  await mobile.fill("+49 1523 7894561");
  await mobile.focus();
  await mobile.evaluate((input) => (input as HTMLInputElement).setSelectionRange(2, 2));
  await mobile.pressSequentially("9");
  expect((await mobile.inputValue()).replace(/\D/g, "")).toMatch(/^15923/);
  expect(await mobile.evaluate((input) => (input as HTMLInputElement).selectionStart)).toBe(3);
  await mobile.press("Backspace");
  await expect(mobile).toHaveValue("1523 7894561");
  await mobile.fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).organization.mobilePhone, STORAGE_KEY)).toBe("");
});

test("logos can be uploaded, replaced, cancelled, and removed without deleting historical bytes", async ({ page }) => {
  const input = page.getByLabel("Choose logo file");
  await input.setInputFiles({ name: "company.png", mimeType: "image/png", buffer: await logoFixture(page) });
  await expect(page.getByRole("img", { name: "Sicher Planen Ingenieure logo" })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const originalLogoId = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).organization.logo.blobId as string, STORAGE_KEY);
  await page.reload();
  await expect(page.getByRole("img", { name: "Sicher Planen Ingenieure logo" })).toBeVisible();
  await input.setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: await logoFixture(page, 120, 120) });
  await expect(page.getByText("replacement.png", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("company.png", { exact: true })).toBeVisible();
  await input.setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: await logoFixture(page, 120, 120) });
  await expect(page.getByText("replacement.png", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Remove logo", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("img", { name: "Sicher Planen Ingenieure logo" })).toHaveCount(0);
  const preserved = await page.evaluate(async (blobId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("quicksige-files"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    return new Promise<boolean>((resolve) => {
      const request = database.transaction("blobs").objectStore("blobs").get(blobId);
      request.onsuccess = () => { resolve(Boolean(request.result)); database.close(); };
    });
  }, originalLogoId);
  expect(preserved).toBe(true);
});

test("invalid logos and contact values are rejected without overwriting the saved profile", async ({ page }) => {
  await page.getByLabel("Choose logo file").setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("<svg onload='alert(1)'/>") });
  await expect(page.getByRole("alert")).toContainText("Choose a valid PNG or JPG");
  await page.getByLabel("Organization email").fill("invalid-email");
  await page.getByLabel("Website").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("Enter a valid website using http or https.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Organization email")).toHaveValue("");
});

test("editors and viewers can read the company profile but cannot edit it", async ({ page }) => {
  for (const role of ["editor", "viewer"]) {
    await page.evaluate(({ key, role }) => {
      const database = JSON.parse(localStorage.getItem(key)!); database.user.role = role;
      database.organization.email = "office@example.test"; localStorage.setItem(key, JSON.stringify(database));
    }, { key: STORAGE_KEY, role });
    await page.reload();
    await expect(page.getByLabel("Organization name")).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Phone country calling code:/ })).toBeDisabled();
    await expect(page.getByLabel("Organization email")).toHaveValue("office@example.test");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Upload logo", exact: true })).toHaveCount(0);
  }
});

test("published Word exports preserve the organization and logo used at publication", async ({ page }, testInfo) => {
  await page.getByLabel("Organization name").fill("Original Engineering");
  await page.getByLabel("Organization email").fill("original@example.test");
  await page.getByLabel("Choose logo file").setInputFiles({ name: "original.png", mimeType: "image/png", buffer: await logoFixture(page) });
  await expect(page.getByRole("img", { name: "Original Engineering logo" })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.goto("/projects/project-logistics-center/plan");
  await page.getByRole("button", { name: "Publish revision" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish revision" });
  await dialog.getByLabel("Professionally reviewed by").fill("Profile test reviewer");
  await dialog.getByLabel("Change summary").fill("Original organization profile");
  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText(/Revision B was published/)).toBeVisible();
  await page.goto("/settings");
  await page.getByLabel("Organization name").fill("Renamed Engineering");
  await page.getByLabel("Organization email").fill("new@example.test");
  await page.getByRole("button", { name: "Remove logo", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.goto("/projects/project-logistics-center/revisions");
  const revision = page.locator(".revision-item").filter({ hasText: "Original organization profile" });
  const [download] = await Promise.all([page.waitForEvent("download"), revision.getByRole("button", { name: "A4 Word" }).click()]);
  const path = testInfo.outputPath("published-company.docx");
  await download.saveAs(path);
  const archive = await JSZip.loadAsync(await readFile(path));
  const xml = await archive.file("word/document.xml")!.async("string");
  expect(xml).toContain("Original Engineering"); expect(xml).toContain("original@example.test");
  expect(xml).not.toContain("Renamed Engineering"); expect(xml).not.toContain("new@example.test");
  expect(Object.keys(archive.files).some((name) => name.startsWith("word/media/") && !archive.files[name].dir)).toBe(true);
});
