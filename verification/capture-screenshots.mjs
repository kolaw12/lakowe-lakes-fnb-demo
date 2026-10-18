import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const databaseUrl = "file:/tmp/lakowe-final-test.db";
const base = "http://127.0.0.1:3136";
const db = new PrismaClient({ datasourceUrl: databaseUrl });
let server;

async function startServer() {
  server = spawn("node_modules/.bin/next", ["start", "--hostname", "127.0.0.1", "--port", "3136"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: databaseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/api/demo`)).ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("Server failed to start on port 3136");
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await new Promise(resolve => server.once("exit", resolve));
}

async function run() {
  console.log("Starting server on port 3136 with isolated test database...");
  await startServer();

  console.log("Launching Chromium browser via Playwright...");
  const browser = await chromium.launch({ headless: true });

  const viewports = {
    desktop: { width: 1280, height: 800 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 375, height: 812 },
  };

  try {
    // 1. Checkout page (Desktop, Tablet & Mobile)
    console.log("Capturing Dining Checkout...");
    const guestContext = await browser.newContext({ viewport: viewports.desktop });
    const guestPage = await guestContext.newPage();

    // Navigate to menu item and add to cart
    await guestPage.goto(`${base}/dining/menu/jollof`);
    await guestPage.waitForSelector("button:has-text('Add')");
    await guestPage.click("button:has-text('Add')");
    await guestPage.waitForURL(/\/dining\/cart/, { timeout: 10000 });

    await guestPage.click("a:has-text('Continue to checkout')");
    await guestPage.waitForURL(/\/dining\/checkout\?outlet=/, { timeout: 10000 });
    await guestPage.waitForSelector("input[placeholder*='Tunde']");
    await guestPage.fill("input[placeholder*='Tunde']", "Tunde Alabi");
    await guestPage.click("button:has-text('Table delivery')");
    await guestPage.fill("input[placeholder*='Table']", "Table 4");
    await guestPage.waitForTimeout(500);

    await guestPage.screenshot({ path: "verification/artifacts/final-dining-checkout-desktop.png", fullPage: true });

    // Tablet checkout
    await guestPage.setViewportSize(viewports.tablet);
    await guestPage.screenshot({ path: "verification/artifacts/final-dining-checkout-tablet.png", fullPage: true });

    // Mobile checkout
    await guestPage.setViewportSize(viewports.mobile);
    await guestPage.screenshot({ path: "verification/artifacts/final-dining-checkout-mobile.png", fullPage: true });

    // Place the order
    await guestPage.setViewportSize(viewports.desktop);
    await guestPage.click("button:has-text('Place order')");
    await guestPage.waitForURL(/\/dining\/orders\/LL-/, { timeout: 10000 });
    await guestPage.waitForTimeout(1000);

    const orderUrl = guestPage.url();
    const orderRef = orderUrl.split("/").pop();
    console.log(`Placed order with reference: ${orderRef}`);

    // Update order status to "ready" so QR and collection code are eligible for collection
    await db.order.update({
      where: { reference: orderRef },
      data: { status: "ready" }
    });

    await guestPage.reload();
    await guestPage.waitForTimeout(1000);

    // 2. Guest Order Tracking & QR Presentation (Desktop, Tablet, Mobile)
    console.log("Capturing Guest Order Tracking with QR Code...");
    await guestPage.screenshot({ path: "verification/artifacts/final-guest-order-qr-desktop.png", fullPage: true });

    await guestPage.setViewportSize(viewports.tablet);
    await guestPage.screenshot({ path: "verification/artifacts/final-guest-order-qr-tablet.png", fullPage: true });

    await guestPage.setViewportSize(viewports.mobile);
    await guestPage.screenshot({ path: "verification/artifacts/final-guest-order-qr-mobile.png", fullPage: true });

    // Read the generated collection code from the page
    const codeText = await guestPage.locator("text=LLC1-").first().textContent();
    const cleanCode = codeText ? codeText.trim().match(/LLC1-[A-F0-9]{20}/i)?.[0] : null;
    console.log(`Extracted collection code from guest screen: ${cleanCode}`);

    // 3. Staff Verify Page - Scan QR tab (Desktop & Mobile)
    console.log("Capturing Staff Verify Scan UI...");
    const staffContext = await browser.newContext({
      viewport: viewports.desktop,
      extraHTTPHeaders: { Cookie: "lakowe-demo-staff-id=staff-ade" },
    });
    const staffPage = await staffContext.newPage();
    await staffContext.addCookies([
      { name: "lakowe-demo-staff-id", value: "staff-ade", domain: "127.0.0.1", path: "/" }
    ]);
    await staffPage.goto(`${base}/staff/login`);
    await staffPage.evaluate(() => {
      localStorage.setItem("lakowe-staff-session", JSON.stringify({
        id: "staff-ade",
        name: "Adeyemi Vance",
        role: "staff",
        outlets: ["clubhouse", "the_grill"],
      }));
    });

    await staffPage.goto(`${base}/staff/verify`);
    await staffPage.waitForSelector("h1:has-text('Verify order handoff')");
    await staffPage.waitForTimeout(500);

    await staffPage.screenshot({ path: "verification/artifacts/final-staff-verify-scan-desktop.png", fullPage: true });

    await staffPage.setViewportSize(viewports.mobile);
    await staffPage.screenshot({ path: "verification/artifacts/final-staff-verify-scan-mobile.png", fullPage: true });

    // 4. Staff Verify Page - Manual Code & Order Preview Card
    console.log("Capturing Staff Verify Manual Code & Preview Card...");
    await staffPage.setViewportSize(viewports.desktop);
    await staffPage.click("button:has-text('Enter collection code')");
    await staffPage.waitForSelector("input[placeholder*='Enter collection code']");

    if (cleanCode) {
      await staffPage.fill("input[placeholder*='Enter collection code']", cleanCode);
      await staffPage.click("button:has-text('Look up order')");
      await staffPage.waitForSelector("button:has-text('Confirm Received')", { timeout: 8000 });
      await staffPage.waitForTimeout(500);

      await staffPage.screenshot({ path: "verification/artifacts/final-staff-verify-preview-desktop.png", fullPage: true });

      await staffPage.setViewportSize(viewports.mobile);
      await staffPage.screenshot({ path: "verification/artifacts/final-staff-verify-preview-mobile.png", fullPage: true });

      // Click Confirm Received
      await staffPage.setViewportSize(viewports.desktop);
      await staffPage.click("button:has-text('Confirm Received')");
      await staffPage.waitForSelector("h2:has-text('Handoff confirmed')", { timeout: 8000 });
      await staffPage.waitForTimeout(500);

      await staffPage.screenshot({ path: "verification/artifacts/final-staff-verify-success-desktop.png", fullPage: true });
    }

    // 5. Staff Order Detail Page with Supervisor Exception form
    console.log("Capturing Staff Order Detail with Supervisor Exception...");
    const supervisorContext = await browser.newContext({
      viewport: viewports.desktop,
    });
    const supervisorPage = await supervisorContext.newPage();
    await supervisorPage.goto(`${base}/staff/login`);
    await supervisorPage.click("button:has-text('Kemi Okafor')");
    await supervisorPage.click("button:has-text('Open operations workspace')");
    await supervisorPage.waitForURL(/\/staff/, { timeout: 10000 });

    // Create a real ready QR-enabled order via standard API
    const orderRes = await fetch(`${base}/api/demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "createOrder",
        outletId: "clubhouse",
        customerName: "Chief Bolaji",
        items: [{ itemId: "jollof", quantity: 1, choices: [] }],
        handoffMode: "table",
        destination: "Table 8",
      }),
    });
    const orderData = await orderRes.json();
    const excOrderRef = orderData.data.reference;
    console.log(`Created supervisor test order: ${excOrderRef}`);

    await db.order.update({
      where: { reference: excOrderRef },
      data: { status: "ready" },
    });

    await supervisorPage.goto(`${base}/staff/orders/${excOrderRef}`);
    await supervisorPage.waitForSelector("button:has-text('Supervisor exception')", { timeout: 10000 });
    await supervisorPage.click("button:has-text('Supervisor exception')");
    await supervisorPage.waitForSelector("textarea[placeholder*='State the exception reason']");
    await supervisorPage.waitForTimeout(500);

    await supervisorPage.screenshot({ path: "verification/artifacts/final-staff-order-exception-desktop.png", fullPage: true });

    await supervisorPage.setViewportSize(viewports.mobile);
    await supervisorPage.screenshot({ path: "verification/artifacts/final-staff-order-exception-mobile.png", fullPage: true });

    // 6. Wallet Page with Plain Language labels (Desktop & Mobile)
    console.log("Capturing Wallet History UI...");
    const walletContext = await browser.newContext({ viewport: viewports.desktop });
    const walletPage = await walletContext.newPage();
    await walletPage.goto(`${base}/wallet`);
    await walletPage.waitForSelector("h2:has-text('Wallet history')", { timeout: 8000 });
    await walletPage.waitForTimeout(500);

    await walletPage.screenshot({ path: "verification/artifacts/final-wallet-history-desktop.png", fullPage: true });

    await walletPage.setViewportSize(viewports.mobile);
    await walletPage.screenshot({ path: "verification/artifacts/final-wallet-history-mobile.png", fullPage: true });

    // 7. Management Activity Log with Plain Language
    console.log("Capturing Management Activity Log...");
    await supervisorPage.setViewportSize(viewports.desktop);
    await supervisorPage.goto(`${base}/management/audit`);
    await supervisorPage.waitForSelector("text=Activity log", { timeout: 10000 });
    await supervisorPage.waitForTimeout(500);

    await supervisorPage.screenshot({ path: "verification/artifacts/final-management-activity-desktop.png", fullPage: true });

    console.log("\n=================================");
    console.log("ALL SCREENSHOTS CAPTURED SUCCESSFULLY!");
    console.log("=================================\n");

  } finally {
    await browser.close();
    await stopServer();
    await db.$disconnect();
  }
}

run().catch(err => {
  console.error("Screenshot capture failed:", err);
  process.exitCode = 1;
});
