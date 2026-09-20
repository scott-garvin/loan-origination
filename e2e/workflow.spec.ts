import { test, expect, type Page } from "@playwright/test";
async function openAlex(p: Page) {
  await p.getByRole("button").filter({ hasText: "OR-2401" }).click();
  await expect(
    p.getByRole("dialog", { name: "Application workbench" }),
  ).toBeVisible();
}
async function live(p: Page) {
  await p.getByRole("button", { name: "Demo access", exact: true }).click();
  await p
    .getByLabel("Demo access key", { exact: true })
    .fill("test-origin-key-not-a-secret");
  await p
    .getByRole("button", { name: "Connect live demo", exact: true })
    .click();
  await expect(p.getByRole("dialog")).toHaveCount(0);
  await expect(p.getByText("Live demo", { exact: true })).toBeVisible();
}
async function facts(p: Page) {
  await p
    .getByLabel("Verified annual income (USD)", { exact: true })
    .fill("48000");
  await p
    .getByLabel("Verified monthly debt (USD)", { exact: true })
    .fill("650");
  await p.getByLabel("Verified employer", { exact: true }).fill("Cedar Works");
  await p
    .getByLabel("Review note", { exact: true })
    .fill(
      "Confirmed the pay statement and resolved the employment-letter discrepancy.",
    );
}
test("guided evidence review requires clarification and separate human decision", async ({
  page,
}) => {
  await page.goto("/");
  await openAlex(page);
  await page.getByRole("button", { name: "AI review", exact: true }).click();
  await page
    .getByRole("button", { name: "Run guided review", exact: true })
    .click();
  await expect(
    page.getByText("Income differs between documents.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm and save facts", exact: true }),
  ).toHaveCount(0);
  await facts(page);
  await page
    .getByRole("button", { name: "Continue to final review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and save facts", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Application workbench" })
      .getByText("Facts confirmed by a reviewer", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page
    .getByRole("button", { name: "Move to decision review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record approval", exact: true })
    .click();
  await page
    .getByLabel("Reason for this action", { exact: true })
    .fill(
      "Reviewer confirmed the fictional application and documented this simulated outcome.",
    );
  await page
    .getByRole("button", { name: "Confirm decision", exact: true })
    .click();
  await expect(page.locator(".detail-title")).toContainText("Approved");
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.locator(".timeline")).toContainText(
    "Simulated approved decision recorded",
  );
});
test("search, new application and manual document review work without AI", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Search applications").fill("not-a-person");
  await expect(page.locator(".application-card")).toHaveCount(0);
  await page.getByLabel("Search applications").fill("");
  await page
    .getByRole("button", { name: "New application", exact: true })
    .click();
  await page
    .getByLabel("Applicant name", { exact: true })
    .fill("Morgan Sample");
  await page
    .getByLabel("Purpose", { exact: true })
    .fill("Fictional home improvement project");
  await page
    .getByRole("button", { name: "Create application", exact: true })
    .click();
  await expect(page.locator(".detail-title")).toContainText("Morgan Sample");
  await page.getByRole("button", { name: /^Documents/ }).click();
  await page
    .getByRole("button", { name: "Load a fictional document set", exact: true })
    .click();
  await expect(page.locator(".source-document")).toHaveCount(3);
  await page.getByRole("button", { name: "AI review", exact: true }).click();
  await page
    .getByRole("button", { name: "Review manually", exact: true })
    .click();
  await facts(page);
  await page
    .getByRole("button", { name: "Confirm and save facts", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Application workbench" })
      .getByText("Facts confirmed by a reviewer", { exact: true }),
  ).toBeVisible();
});
test("live graph resumes across reload without another provider call", async ({
  page,
}) => {
  await page.goto("/");
  await live(page);
  await openAlex(page);
  await page.getByRole("button", { name: "AI review", exact: true }).click();
  await page
    .getByRole("button", { name: "Extract document facts", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Continue to final review", exact: true }),
  ).toBeVisible();
  await facts(page);
  await page
    .getByRole("button", { name: "Continue to final review", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm and save facts", exact: true }),
  ).toBeVisible();
  await page.reload();
  await live(page);
  await openAlex(page);
  await page.getByRole("button", { name: "AI review", exact: true }).click();
  await expect(page.getByLabel("Review note", { exact: true })).toHaveValue(
    /Confirmed the pay statement/,
  );
  await page
    .getByRole("button", { name: "Confirm and save facts", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Application workbench" })
      .getByText("Facts confirmed by a reviewer", { exact: true }),
  ).toBeVisible();
});
test("borrower invitation connects document submission to the staff application", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await live(page);
  await page.getByRole("button").filter({ hasText: "OR-2402" }).click();
  await page.getByRole("button", { name: /^Documents/ }).click();
  await page
    .getByRole("button", { name: "Invite borrower", exact: true })
    .click();
  const href = await page
    .getByRole("link", { name: "Open borrower portal", exact: true })
    .getAttribute("href");
  expect(href).toContain("#invite=");
  const borrower = await context.newPage();
  await borrower.goto(href!);
  await expect(
    borrower.getByRole("heading", { name: "Jamie Ellis", exact: true }),
  ).toBeVisible();
  await expect(borrower).not.toHaveURL(/invite=/);
  for (const label of [
    "Income statement",
    "Employment letter",
    "Debt summary",
  ]) {
    await borrower
      .getByRole("combobox", { name: "Document type", exact: true })
      .selectOption({ label });
    await borrower
      .getByRole("button", { name: "Use fictional example", exact: true })
      .click();
    await borrower
      .getByRole("button", { name: "Save document", exact: true })
      .click();
    await expect(
      borrower.getByRole("button", { name: "Save document", exact: true }),
    ).toBeEnabled();
  }
  await borrower
    .getByRole("button", { name: "Submit documents for review", exact: true })
    .click();
  await expect(borrower.getByRole("status")).toContainText(
    "Documents submitted",
  );
  await page
    .getByRole("dialog", { name: "Borrower access" })
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page
    .getByRole("button", { name: "Refresh application", exact: true })
    .click();
  await expect(page.locator(".detail-title")).toContainText("Document review");
  await expect(page.locator(".check-circle.complete")).toHaveCount(3);
  await borrower.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    borrower.getByRole("heading", { name: "Jamie Ellis", exact: true }),
  ).toHaveCount(0);
  await borrower.close();
});
test("changed documents invalidate pending extraction review", async ({
  page,
}) => {
  await page.goto("/");
  await live(page);
  await openAlex(page);
  await page.getByRole("button", { name: "AI review", exact: true }).click();
  await page
    .getByRole("button", { name: "Extract document facts", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Continue to final review", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Documents/ }).click();
  await page
    .getByRole("button", { name: "Use fictional example", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save document", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "AI review", exact: true }).click();
  await expect(
    page.getByText(
      "The documents changed. This review is a historical snapshot.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to final review", exact: true }),
  ).toHaveCount(0);
});
test("mobile and desktop stay within viewport and protected inputs reject OpenAI keys", async ({
  page,
}) => {
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Demo access", exact: true }).click();
  await page
    .getByLabel("Demo access key", { exact: true })
    .fill("sk-fictional-not-an-api-key");
  await page
    .getByRole("button", { name: "Connect live demo", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Use the Origin demo key",
  );
});
