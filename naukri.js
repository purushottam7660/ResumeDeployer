const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const EMAIL = process.env.NAUKRI_EMAIL;
const PASSWORD = process.env.NAUKRI_PASSWORD;

// 👉 Proxy (optional)
const PROXY = process.env.PROXY;

const BASE_DIR = __dirname;
const SOURCE_RESUME = path.join(BASE_DIR, "Purushottam_Kumar_CV.pdf");
const DEST_FOLDER = path.join(BASE_DIR, "Naukri_resume");
const SCREENSHOT_DIR = path.join(BASE_DIR, "screenshots");
const HTML_DIR = path.join(BASE_DIR, "html_dump");

const LOGIN_URL = "https://www.naukri.com/nlogin/login";
const PROFILE_URL = "https://www.naukri.com/mnjuser/profile";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = now.toLocaleString("en-US", { month: "short" });
  const yyyy = now.getFullYear();

  const fileName = `Purushottam_Kumar_Resume_${dd}_${mm}_${yyyy}.pdf`;
  const destination = path.join(DEST_FOLDER, fileName);

  if (fs.existsSync(destination)) {
    fs.unlinkSync(destination);
  }

  fs.copyFileSync(SOURCE_RESUME, destination);

  log(`Resume ready: ${destination}`);

  return destination;
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

async function createBrowser() {
  const launchOptions = {
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      `--user-agent=${USER_AGENT}`
    ]
  };

  // 👉 Proxy logic
  if (PROXY && PROXY.trim() !== "") {
    launchOptions.proxy = {
      server: PROXY
    };
    log(`Proxy enabled: ${PROXY}`);
  } else {
    log("No proxy found → using default network");
  }

  const browser = await chromium.launch(launchOptions);

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: {
      width: 1920,
      height: 1080
    },
    locale: "en-US",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined
    });

    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"]
    });

    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4]
    });
  });

  return { browser, page };
}

async function login(page) {
  await page.goto(LOGIN_URL, {
    waitUntil: "networkidle",
    timeout: 60000
  });

  await screenshot(page, "01_login_page");

  await page.waitForSelector("#usernameField", {
    timeout: 30000
  });

  await page.fill("#usernameField", EMAIL);
  await page.fill("#passwordField", PASSWORD);

  await screenshot(page, "02_credentials_filled");

  await page.evaluate(() => {
    const otp = document.querySelector("button.otpButton");
    if (otp) otp.remove();
  });

  await screenshot(page, "03_otp_removed");

  await wait(2000);

  const loginButton = page.locator(
    "//button[@class='waves-effect waves-light btn-large btn-block btn-bold blue-btn textTransform']"
  );

  await loginButton.scrollIntoViewIfNeeded();
  await wait(1000);

  await loginButton.click();

  log("Login button clicked");

  await screenshot(page, "04_login_clicked");

  await wait(10000);

  const currentUrl = page.url();

  if (
    currentUrl.includes("/mnjuser/homepage") ||
    currentUrl.includes("/mnjuser/profile")
  ) {
    log("Login successful");
    return true;
  }

  await screenshot(page, "05_login_failed");
  await dump(page, "login_failed");

  log(`Login failed: ${currentUrl}`);

  return false;
}

async function uploadResume(page, resumePath) {
  await page.goto(PROFILE_URL, {
    waitUntil: "networkidle",
    timeout: 60000
  });

  await screenshot(page, "06_profile_page");

  const fileInput = page.locator("input[type='file']");

  await fileInput.setInputFiles(resumePath);

  await wait(5000);

  await screenshot(page, "07_resume_uploaded");

  log("Resume uploaded successfully");
}

(async () => {
  if (!EMAIL || !PASSWORD) {
    throw new Error("Missing NAUKRI_EMAIL or NAUKRI_PASSWORD");
  }

  if (!fs.existsSync(SOURCE_RESUME)) {
    throw new Error(`Resume file not found: ${SOURCE_RESUME}`);
  }

  const resumePath = getResumePath();

  const { browser, page } = await createBrowser();

  try {
    const status = await login(page);

    if (status) {
      await uploadResume(page, resumePath);
    } else {
      log("Login failed");
    }
  } catch (err) {
    console.error(err);

    try {
      await screenshot(page, "error");
      await dump(page, "error");
    } catch (_) {}
  } finally {
    await browser.close();
  }
})();
