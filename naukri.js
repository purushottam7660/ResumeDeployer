const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const EMAIL = process.env.NAUKRI_EMAIL;
const PASSWORD = process.env.NAUKRI_PASSWORD;

const BASE_DIR = __dirname;
const SOURCE_RESUME = path.join(BASE_DIR, "Purushottam_Kumar_CV.pdf");
const DEST_FOLDER = path.join(BASE_DIR, "Naukri_resume");
const SCREENSHOT_DIR = path.join(BASE_DIR, "screenshots");
const HTML_DIR = path.join(BASE_DIR, "html_dump");

const LOGIN_URL = "https://www.naukri.com/nlogin/login";
const PROFILE_URL = "https://www.naukri.com/mnjuser/profile";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(DEST_FOLDER);
ensureDir(SCREENSHOT_DIR);
ensureDir(HTML_DIR);

function log(msg) {
  console.log(msg);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getResumePath() {
  const date = new Date().toLocaleDateString("en-GB").replace(/\//g, "_");
  const filename = `Purushottam_Kumar_Resume_${date}.pdf`;
  const dest = path.join(DEST_FOLDER, filename);

  if (fs.existsSync(dest)) fs.unlinkSync(dest);

  fs.copyFileSync(SOURCE_RESUME, dest);

  return dest;
}

async function screenshot(page, name) {
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: true
  });
}

async function dump(page, name) {
  const html = await page.content();
  fs.writeFileSync(path.join(HTML_DIR, `${name}.html`), html);
}

async function login(page) {
  await page.goto(LOGIN_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await screenshot(page, "01_login_page");

  await page.waitForSelector("#usernameField", { timeout: 30000 });

  await page.fill("#usernameField", EMAIL);
  await page.fill("#passwordField", PASSWORD);

  await screenshot(page, "02_filled");

  // remove OTP button
  await page.evaluate(() => {
    const otp = document.querySelector(
      "button.otpButton"
    );
    if (otp) otp.remove();
  });

  await screenshot(page, "03_otp_removed");

  await wait(2000);

  const loginButton = page.locator(
    "//button[@class='waves-effect waves-light btn-large btn-block btn-bold blue-btn textTransform']"
  );

  await loginButton.click();

  log("Login button clicked");

  await screenshot(page, "04_clicked");

  await wait(10000);

  const currentUrl = page.url();

  if (
    currentUrl.includes("/mnjuser/homepage") ||
    currentUrl.includes("/mnjuser/profile")
  ) {
    log("Login successful");
    return true;
  }

  await screenshot(page, "05_failed");
  await dump(page, "login_failed");

  log(`Login failed: ${currentUrl}`);
  return false;
}

async function uploadResume(page, resumePath) {
  await page.goto(PROFILE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await screenshot(page, "06_profile");

  const fileInput = page.locator("input[type='file']");
  await fileInput.setInputFiles(resumePath);

  await wait(5000);

  await screenshot(page, "07_uploaded");

  log("Resume uploaded");
}

(async () => {
  if (!EMAIL || !PASSWORD) {
    throw new Error("Missing NAUKRI_EMAIL or NAUKRI_PASSWORD");
  }

  if (!fs.existsSync(SOURCE_RESUME)) {
    throw new Error("Resume file not found");
  }

  const resumePath = getResumePath();

  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
  });

  const page = await context.newPage();

  try {
    const ok = await login(page);

    if (ok) {
      await uploadResume(page, resumePath);
    }
  } catch (e) {
    console.error(e);
    await screenshot(page, "error");
    await dump(page, "error");
  } finally {
    await browser.close();
  }
})();
