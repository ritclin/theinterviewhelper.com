/**
 * Smoke / integration tests for relay server APIs and subscription gating.
 * Run: node scripts/integration-test.mjs
 */
import { io } from "socket.io-client";

const BASE = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const TEST_EMAIL = "integration-test@example.com";
const IS_PROD = process.env.TEST_PRODUCTION === "1";

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  console.error(`  ✗ ${name}: ${detail}`);
}

async function fetchJson(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function run() {
  console.log(`\nIntegration tests → ${BASE}\n`);

  // Health
  const health = await fetchJson("/api/health");
  if (health.status === 200 && health.data.status === "ok") ok("GET /api/health");
  else fail("GET /api/health", JSON.stringify(health));

  // Downloads
  const downloads = await fetchJson("/api/downloads");
  if (downloads.data.success && downloads.data.downloads?.windowsZip) ok("GET /api/downloads");
  else fail("GET /api/downloads", JSON.stringify(downloads));

  // Plan
  const plan = await fetchJson("/api/stripe/plan");
  if (plan.data.plan?.priceEur === 20) ok("GET /api/stripe/plan (€20)");
  else fail("GET /api/stripe/plan", JSON.stringify(plan));

  // Simulate subscription (dev only)
  if (!IS_PROD) {
    const sim = await fetchJson("/api/stripe/simulate-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "checkout.session.completed", email: TEST_EMAIL }),
    });
    if (sim.data.success) ok("POST simulate-webhook activates subscription");
    else fail("POST simulate-webhook", sim.data.error || JSON.stringify(sim));
  } else {
    console.log("  (skip simulate-webhook in production test mode)");
  }

  const status = await fetchJson(`/api/stripe/status?email=${encodeURIComponent(TEST_EMAIL)}`);
  if (IS_PROD || status.data.status === "active") ok("GET /api/stripe/status");
  else fail("GET /api/stripe/status", JSON.stringify(status));

  if (IS_PROD) {
    console.log(`\nResults: ${passed} passed, ${failed} failed (production smoke only)\n`);
    process.exit(failed > 0 ? 1 : 0);
    return;
  }

  // Socket gating
  await new Promise((resolve) => {
    const socket = io(BASE, { transports: ["websocket"], timeout: 8000 });

    socket.on("connect", () => {
      socket.emit("create-room", { email: "" }, (resp) => {
        if (resp?.success === false && String(resp.error).includes("email")) {
          ok("create-room rejects missing email");
        } else fail("create-room missing email", JSON.stringify(resp));

        socket.emit("create-room", { email: TEST_EMAIL }, (resp2) => {
          if (resp2?.success && resp2.roomCode?.length === 6) {
            ok("create-room succeeds with active subscription");
            const code = resp2.roomCode;

            socket.emit("join-room", { roomCode: code }, (joinResp) => {
              if (joinResp?.success) ok("join-room succeeds for paid room");
              else fail("join-room", JSON.stringify(joinResp));

              socket.disconnect();
              resolve(undefined);
            });
          } else {
            fail("create-room with subscription", JSON.stringify(resp2));
            socket.disconnect();
            resolve(undefined);
          }
        });
      });
    });

    socket.on("connect_error", (err) => {
      fail("socket connect", err.message);
      resolve(undefined);
    });

    setTimeout(() => {
      fail("socket connect", "timeout");
      socket.disconnect();
      resolve(undefined);
    }, 12000);
  });

  // create-room without subscription
  await fetchJson("/api/stripe/simulate-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "customer.subscription.deleted", email: TEST_EMAIL }),
  });

  await new Promise((resolve) => {
    const socket = io(BASE, { transports: ["websocket"], timeout: 8000 });
    socket.on("connect", () => {
      socket.emit("create-room", { email: TEST_EMAIL }, (resp) => {
        if (resp?.success === false && resp.code === "SUBSCRIPTION_REQUIRED") {
          ok("create-room blocked without subscription");
        } else fail("create-room subscription gate", JSON.stringify(resp));
        socket.disconnect();
        resolve(undefined);
      });
    });
    socket.on("connect_error", () => {
      fail("socket gate test", "connect error");
      resolve(undefined);
    });
    setTimeout(() => {
      socket.disconnect();
      resolve(undefined);
    }, 8000);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
