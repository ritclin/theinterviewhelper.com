import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Server as SocketIOServer } from "socket.io";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import Stripe from "stripe";
import {
  generateSecureRoomCode,
  getAllowedOrigins,
  isValidRoomCode,
  requireAdminKey,
  sanitizeRedirectUrl,
  estimateBase64Bytes,
  LIMITS,
} from "./security.ts";

dotenv.config();

function isRunningProductionBundle(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  if (process.argv[1]?.endsWith("server.cjs")) return true;
  if (typeof __filename !== "undefined" && __filename.endsWith("server.cjs")) return true;
  return false;
}

// Initialize Gemini SDK with named parameters as instructed
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;

if (apiKey && apiKey !== "MY_GEMINI_API_KEY" && apiKey.trim() !== "") {
  aiClient = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
  console.log("Gemini AI Client successfully initialized.");
} else {
  console.log("No valid GEMINI_API_KEY found in environment. Fallback high-fidelity simulation enabled.");
}

async function startServer() {
  const app = express();
  const isProduction = isRunningProductionBundle();
  console.log(`Runtime mode: ${isProduction ? "production" : "development"} (NODE_ENV=${process.env.NODE_ENV ?? "unset"})`);
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "https:"],
              connectSrc: ["'self'", "wss:", "ws:"],
              fontSrc: ["'self'", "data:"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProduction ? 300 : 1000,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/", apiLimiter);

  const server = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;
  const allowedOrigins = getAllowedOrigins();
  
  const io = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"]
    },
    maxHttpBufferSize: LIMITS.MAX_IMAGE_BYTES + 512 * 1024,
  });

  // Room pairing state
  // roomCode -> { hostSocketId: string; clientSocketIds: string[]; created: number; history: any[] }
  const rooms = new Map<string, {
    hostSocketId: string;
    clientSocketIds: string[];
    created: number;
    history: Array<{ role: string; content: string; timestamp: string }>;
    scenario?: { title: string; company: string; role: string; };
    aiInProgress?: boolean;
  }>();

  const joinAttemptsByIp = new Map<string, { count: number; resetAt: number }>();
  const aiRequestTimestamps = new Map<string, number[]>();

  // Map of socket.id -> roomCode to handle cleanups
  const socketToRoom = new Map<string, string>();

  // --- SaaS Stripe & Subscriptions Engine ---
  let stripeClient: Stripe | null = null;
  function getStripe(): Stripe | null {
    if (!stripeClient) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (key && key !== "MY_STRIPE_SECRET_KEY" && key.trim() !== "") {
        stripeClient = new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
      }
    }
    return stripeClient;
  }

  // In-memory subscription ledger: email -> subscription info
  const subscriptions = new Map<string, {
    status: "active" | "canceled" | "none";
    email: string;
    currentPeriodEnd: number;
    subscriptionId?: string;
  }>();

  function activateSubscription(email: string, subscriptionId?: string) {
    const normalized = email.toLowerCase().trim();
    if (!normalized) return null;
    const sub = {
      status: "active" as const,
      email: normalized,
      currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
      subscriptionId: subscriptionId || "sub_" + Math.random().toString(36).substring(2, 10),
    };
    subscriptions.set(normalized, sub);
    console.log(`[Billing] Subscription activated for: ${normalized}`);
    return sub;
  }

  async function resolveStripeCustomerEmail(stripe: Stripe, customerRef: unknown): Promise<string> {
    if (typeof customerRef === "string") {
      try {
        const customer = await stripe.customers.retrieve(customerRef);
        if (!customer.deleted && "email" in customer && customer.email) {
          return customer.email.toLowerCase().trim();
        }
      } catch (err) {
        console.warn("[Billing] Could not resolve Stripe customer email:", err);
      }
    }
    return "";
  }

  // Webhook event logger
  const webhookLogs: Array<{
    id: string;
    event: string;
    timestamp: string;
    payload: any;
    status: "processed" | "failed";
  }> = [];

  // Completed sessions repository (Phase 5)
  const completedSessions: Array<{
    id: string;
    roomCode: string;
    created: number;
    ended: number;
    status: "Active" | "Completed";
    history: Array<{ role: string; content: string; timestamp: string }>;
    scenario: { title: string; company: string; role: string; };
  }> = [
    {
      id: "sess_google_lru",
      roomCode: "512489",
      created: Date.now() - 2 * 60 * 60 * 1000 - 30 * 60 * 1000,
      ended: Date.now() - 2 * 60 * 60 * 1000,
      status: "Completed",
      scenario: {
        title: "LRU Cache Cache eviction O(1)",
        company: "Google",
        role: "Staff Software Engineer"
      },
      history: [
        {
          role: "assistant",
          content: `### 🎯 IDENTIFIED CHALLENGE: LRU (Least Recently Used) Cache optimization

### 💡 OPTIMAL STRATEGY
* **Data Structure**: Use a combination of a Doubly Linked List (for $O(1)$ updates of eviction order) and a Hash Map (for $O(1)$ lookups of cache items).
* **Time Complexity**: Both \`get\` and \`put\` operations are fully optimized to operate in strict **$O(1)$** average time complexity.
* **Edge Cases**: Empty cache capacity (invalid), overwriting existing keys, and reaching max size (evicting least recently used element).

### 💻 GOLDEN CODE
\`\`\`python
class Node:
    def __init__(self, key, val):
        self.key, self.val = key, val
        self.prev = self.next = None

class LRUCache:
    def __init__(self, capacity: int):
        self.cap = capacity
        self.cache = {}  # key -> Node
        self.left, self.right = Node(0, 0), Node(0, 0)
        self.left.next, self.right.prev = self.right, self.left

    def get(self, key: int) -> int:
        if key in self.cache:
            self.remove(self.cache[key])
            self.insert(self.cache[key])
            return self.cache[key].val
        return -1
\`\`\`

### 🗣️ TALKING POINTS
* "Combining a doubly linked list with a hash map allows us to achieve $O(1)$ bounds for both fetch and insertion."
* "We use dummy head and tail sentinel nodes to eliminate null-pointer checks during node insertions and evictions."`,
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toLocaleTimeString()
        }
      ]
    },
    {
      id: "sess_meta_whatsapp",
      roomCode: "784910",
      created: Date.now() - 24 * 60 * 60 * 1000,
      ended: Date.now() - 23 * 60 * 60 * 1000 - 45 * 60 * 1000,
      status: "Completed",
      scenario: {
        title: "WhatsApp Real-time Message Broker Scalability",
        company: "Meta",
        role: "Senior Front-End Engineer"
      },
      history: [
        {
          role: "assistant",
          content: `### 🎯 IDENTIFIED CHALLENGE: Live Chat Synchronization and WebSockets Scalability

### 💡 OPTIMAL STRATEGY
* **Relay Clusters**: Use a distributed pub-sub model (e.g. Redis Pub/Sub or Kafka) to route socket packets across multiple node server clusters.
* **State Management**: Persist light ephemeral session parameters in memory (Redis), and write deep message logs asynchronously to PostgreSQL.
* **Reliability**: Implement exponential back-off retries and visual reconnecting heartbeats on mobile clients.

### 💻 GOLDEN CODE
\`\`\`typescript
import { io, Socket } from "socket.io-client";

export class SocketClusterManager {
  private socket: Socket;
  
  constructor(serverUrl: string) {
    this.socket = io(serverUrl, {
      transports: ["websocket"],
      reconnectionAttempts: 15,
      reconnectionDelayRate: 1.5
    });
  }

  public sendMessage(roomId: string, payload: any) {
    this.socket.emit("send-msg", { roomId, payload });
  }
}
\`\`\`

### 🗣️ TALKING POINTS
* "I use in-memory pub-sub channels to scale message dispatching to millions of concurrently joined auxiliary client devices."
* "Adding reconnect back-off ensures we don't bring down the cluster with a thundering herd problem during brief server dropouts."`,
          timestamp: new Date(Date.now() - 23 * 60 * 60 * 1000 - 55 * 60 * 1000).toLocaleTimeString()
        }
      ]
    },
    {
      id: "sess_stripe_indexing",
      roomCode: "312054",
      created: Date.now() - 3 * 24 * 60 * 60 * 1000,
      ended: Date.now() - 3 * 24 * 60 * 60 * 1000 + 40 * 60 * 1000,
      status: "Completed",
      scenario: {
        title: "Relational Index Cover queries & Tuning",
        company: "Stripe",
        role: "Senior Backend Architect"
      },
      history: [
        {
          role: "assistant",
          content: `### 🎯 IDENTIFIED CHALLENGE: Relational Database Indexing & Query Tuning

### 💡 OPTIMAL STRATEGY
* **Composite Indexes**: Use composite indexes matching the filter and sort parameters in order. In Postgres: \`(status, created_at DESC)\`.
* **Covering Index**: Add the \`INCLUDE\` block so that attributes in the \`SELECT\` clause can be fetched directly from index files without querying table memory heap.
* **Scan Types**: Shift Postgres EXPLAIN details from a Sequential Scan to a high-speed Index Only Scan.

### 💻 GOLDEN CODE
\`\`\`sql
-- High-Performance Cover Index Setup
CREATE INDEX idx_users_dashboard 
ON users (status, created_at DESC) 
INCLUDE (email, username);

-- Optimized high-speed query
SELECT email, username, created_at 
FROM users 
WHERE status = 'active' 
ORDER BY created_at DESC 
LIMIT 50;
\`\`\`

### 🗣️ TALKING POINTS
* "Creating a composite index matching the exact sort criteria resolves the slow in-memory sort operation, yielding sub-10ms queries."
* "The \`INCLUDE\` clause allows for an Index Only scan, avoiding expensive random page lookups on the heap table itself."`,
          timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 35 * 60 * 1000).toLocaleTimeString()
        }
      ]
    }
  ];

  // Helper to upsert completed or active sessions
  function saveOrUpdateSession(roomCode: string, room: any, isFinished = false) {
    const existingIndex = completedSessions.findIndex(s => s.roomCode === roomCode);
    const scenario = room.scenario || { title: "Custom Coding Session", company: "Technical Practice", role: "Developer" };
    
    const sessionData = {
      id: existingIndex >= 0 ? completedSessions[existingIndex].id : "sess_" + Math.random().toString(36).substring(2, 10),
      roomCode,
      created: room.created,
      ended: isFinished ? Date.now() : room.created,
      status: (isFinished ? "Completed" : "Active") as "Completed" | "Active",
      history: [...room.history],
      scenario
    };

    if (existingIndex >= 0) {
      completedSessions[existingIndex] = sessionData;
    } else {
      completedSessions.unshift(sessionData);
    }
  }

  // Stripe Raw Webhook endpoint - MUST be defined before express.json()
  app.post("/api/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
    const stripe = getStripe();
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event: any;
    const logId = "whl_" + Math.random().toString(36).substring(2, 10);
    
    try {
      if (isProduction && (!stripe || !sig || !webhookSecret)) {
        return res.status(503).json({ error: "Stripe webhooks are not configured." });
      }

      if (stripe && sig && webhookSecret) {
        event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);
      } else if (!isProduction) {
        const bodyString = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
        event = JSON.parse(bodyString);
      } else {
        return res.status(400).send("Webhook Error: Invalid signature.");
      }
    } catch (err: any) {
      console.error(`[Webhook Verification Error]: ${err.message}`);
      webhookLogs.unshift({
        id: logId,
        event: "error",
        timestamp: new Date().toLocaleTimeString(),
        payload: { error: err.message },
        status: "failed"
      });
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      const eventType = event.type;
      const dataObject = event.data.object;
      console.log(`[Stripe Webhook Engine] Event Received: ${eventType}`);

      if (eventType === "checkout.session.completed") {
        const email = (dataObject.customer_email || dataObject.customer_details?.email || dataObject.metadata?.email || "").toLowerCase().trim();
        const subId = dataObject.subscription || "sub_mock_" + Math.random().toString(36).substring(2, 10);
        if (email) {
          activateSubscription(email, subId);
        }
      } else if (eventType === "customer.subscription.deleted") {
        let email = (dataObject.customer_email || dataObject.metadata?.email || "").toLowerCase().trim();
        if (!email && stripe) {
          email = await resolveStripeCustomerEmail(stripe, dataObject.customer);
        }
        if (email) {
          const sub = subscriptions.get(email);
          if (sub) {
            subscriptions.set(email, {
              ...sub,
              status: "none",
              currentPeriodEnd: Date.now()
            });
          }
          console.log(`[Stripe Webhook Engine] Subscription deleted for: ${email}`);
        }
      } else if (eventType === "customer.subscription.updated" || eventType === "customer.subscription.created") {
        let email = (dataObject.customer_email || dataObject.metadata?.email || "").toLowerCase().trim();
        if (!email && stripe) {
          email = await resolveStripeCustomerEmail(stripe, dataObject.customer);
        }
        if (email) {
          if (dataObject.status === "active" || dataObject.status === "trialing") {
            activateSubscription(email, dataObject.id);
          } else {
            const sub = subscriptions.get(email);
            if (sub) {
              subscriptions.set(email, {
                ...sub,
                status: dataObject.status === "active" ? "active" : "canceled"
              });
            }
          }
        }
      }

      webhookLogs.unshift({
        id: logId,
        event: eventType,
        timestamp: new Date().toLocaleTimeString(),
        payload: event,
        status: "processed"
      });

      if (webhookLogs.length > 50) webhookLogs.pop();
      res.json({ received: true, id: logId });
    } catch (err: any) {
      console.error(`[Stripe Webhook Handler Error]:`, err);
      webhookLogs.unshift({
        id: logId,
        event: event?.type || "unknown",
        timestamp: new Date().toLocaleTimeString(),
        payload: event || {},
        status: "failed"
      });
      res.status(500).json({ error: err.message });
    }
  });

  // API middleware for general JSON routes
  app.use(express.json({ limit: LIMITS.JSON_BODY }));
  app.use(express.urlencoded({ limit: LIMITS.JSON_BODY, extended: true }));

  // Stripe Helper Endpoints
  app.get("/api/stripe/status", (req, res) => {
    const email = (req.query.email as string || "").toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ success: false, error: "Email query parameter is required." });
    }
    const sub = subscriptions.get(email) || { status: "none", email, currentPeriodEnd: 0 };
    res.json(sub);
  });

  app.post("/api/stripe/confirm-session", async (req, res) => {
    const { sessionId } = req.body || {};
    const stripe = getStripe();

    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ success: false, error: "sessionId is required." });
    }
    if (!stripe) {
      return res.status(503).json({ success: false, error: "Stripe is not configured." });
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const isPaid = session.payment_status === "paid" || session.status === "complete";

      if (!isPaid) {
        return res.json({ success: false, error: "Checkout session is not paid yet.", status: session.status });
      }

      const email = (
        session.customer_email ||
        session.customer_details?.email ||
        session.metadata?.email ||
        ""
      ).toLowerCase().trim();

      if (!email) {
        return res.status(400).json({ success: false, error: "No customer email found on checkout session." });
      }

      const subscription = activateSubscription(
        email,
        typeof session.subscription === "string" ? session.subscription : undefined
      );

      res.json({ success: true, subscription });
    } catch (err: any) {
      console.error("[Billing] confirm-session error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/stripe/sync-subscription", async (req, res) => {
    const { email } = req.body || {};
    const targetEmail = (email || "").toLowerCase().trim();

    if (!targetEmail) {
      return res.status(400).json({ success: false, error: "A valid billing email is required." });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ success: false, error: "Stripe is not configured." });
    }

    try {
      const customers = await stripe.customers.list({ email: targetEmail, limit: 5 });
      if (customers.data.length === 0) {
        return res.json({
          success: false,
          error: "No Stripe customer found for this email. Use the same email as checkout.",
        });
      }

      for (const customer of customers.data) {
        const activeSubs = await stripe.subscriptions.list({
          customer: customer.id,
          status: "active",
          limit: 1,
        });
        const trialingSubs = await stripe.subscriptions.list({
          customer: customer.id,
          status: "trialing",
          limit: 1,
        });
        const match = activeSubs.data[0] || trialingSubs.data[0];
        if (match) {
          const subscription = activateSubscription(targetEmail, match.id);
          return res.json({ success: true, subscription, source: "stripe-sync" });
        }
      }

      res.json({
        success: false,
        error: "No active Stripe subscription found for this email.",
      });
    } catch (err: any) {
      console.error("[Billing] sync-subscription error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/stripe/webhook-logs", requireAdminKey, (req, res) => {
    res.json({ logs: webhookLogs });
  });

  app.post("/api/stripe/checkout", async (req, res) => {
    const { email, successUrl, cancelUrl } = req.body;
    const targetEmail = (email || "").toLowerCase().trim();
    if (!targetEmail) {
      return res.status(400).json({ success: false, error: "A valid billing email is required." });
    }
    const stripe = getStripe();
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : (process.env.APP_URL || "http://localhost:3000");
    const safeSuccessUrl = sanitizeRedirectUrl(successUrl, origin);
    const safeCancelUrl = sanitizeRedirectUrl(cancelUrl, origin);

    if (stripe) {
      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "eur",
                product_data: {
                  name: "Platinum Access Plan - TheInterviewHelper.com",
                  description: "Sub-2s low-latency screen capture and loopback audio suggestions.",
                },
                unit_amount: 2000, // €20.00
                recurring: {
                  interval: "month",
                },
              },
              quantity: 1,
            },
          ],
          mode: "subscription",
          customer_email: targetEmail,
          metadata: { email: targetEmail },
          success_url: (() => {
            const url = new URL(safeSuccessUrl);
            url.searchParams.set("stripe", "success");
            url.searchParams.set("email", targetEmail);
            url.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
            return url.toString();
          })(),
          cancel_url: (() => {
            const url = new URL(safeCancelUrl);
            url.searchParams.set("stripe", "cancel");
            return url.toString();
          })(),
        });
        res.json({ success: true, url: session.url, mode: "real" });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
      }
    } else {
      const mockSessionId = "cs_test_" + Math.random().toString(36).substring(2, 10);
      const mockUrl = new URL(safeSuccessUrl);
      mockUrl.searchParams.set("stripe_mock_session", mockSessionId);
      mockUrl.searchParams.set("email", targetEmail);
      res.json({
        success: true,
        url: mockUrl.toString(),
        mode: "simulated"
      });
    }
  });

  app.post("/api/stripe/simulate-webhook", (req, res) => {
    if (isProduction) {
      return res.status(403).json({
        success: false,
        error: "Webhook simulation is disabled in production.",
      });
    }
    const { type, email } = req.body;
    const targetEmail = (email || "").toLowerCase().trim();
    if (!targetEmail) {
      return res.status(400).json({ success: false, error: "A valid billing email is required." });
    }
    const logId = "whl_sim_" + Math.random().toString(36).substring(2, 10);
    
    let mockPayload: any = {};
    if (type === "checkout.session.completed") {
      mockPayload = {
        id: "evt_mock_" + Math.random().toString(36).substring(2, 10),
        object: "event",
        type: "checkout.session.completed",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "cs_mock_" + Math.random().toString(36).substring(2, 10),
            object: "checkout.session",
            customer_email: targetEmail,
            customer_details: { email: targetEmail },
            subscription: "sub_mock_" + Math.random().toString(36).substring(2, 10),
            amount_total: 2000,
            currency: "eur",
            payment_status: "paid"
          }
        }
      };
      
      activateSubscription(targetEmail, mockPayload.data.object.subscription);
    } else if (type === "customer.subscription.deleted") {
      mockPayload = {
        id: "evt_mock_" + Math.random().toString(36).substring(2, 10),
        object: "event",
        type: "customer.subscription.deleted",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "sub_mock_active",
            object: "subscription",
            customer_email: targetEmail,
            status: "canceled",
            current_period_end: Math.floor((Date.now() + 5 * 24 * 60 * 60 * 1000) / 1000)
          }
        }
      };
      
      const existing = subscriptions.get(targetEmail);
      if (existing) {
        subscriptions.set(targetEmail, {
          ...existing,
          status: "none",
          currentPeriodEnd: Date.now()
        });
      } else {
        subscriptions.set(targetEmail, {
          status: "none",
          email: targetEmail,
          currentPeriodEnd: Date.now()
        });
      }
    }
    
    webhookLogs.unshift({
      id: logId,
      event: type,
      timestamp: new Date().toLocaleTimeString(),
      payload: mockPayload,
      status: "processed"
    });
    
    if (webhookLogs.length > 50) webhookLogs.pop();
    
    res.json({ success: true, logId, subscription: subscriptions.get(targetEmail) });
  });

  // API endpoints
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      socketConnections: io.engine.clientsCount,
      activeRoomsCount: rooms.size,
      hasGeminiKey: !!aiClient
    });
  });

  app.get("/api/rooms", requireAdminKey, (req, res) => {
    const list = Array.from(rooms.entries()).map(([code, data]) => ({
      roomCode: code,
      clientsCount: data.clientSocketIds.length,
      ageSeconds: Math.floor((Date.now() - data.created) / 1000)
    }));
    res.json({ activeRooms: list });
  });

  // Completed sessions endpoints (Phase 5)
  app.get("/api/sessions", requireAdminKey, (req, res) => {
    res.json({ success: true, sessions: completedSessions });
  });

  app.delete("/api/sessions/:id", requireAdminKey, (req, res) => {
    const { id } = req.params;
    const idx = completedSessions.findIndex(s => s.id === id);
    if (idx >= 0) {
      completedSessions.splice(idx, 1);
      res.json({ success: true, message: "Session deleted from history." });
    } else {
      res.status(404).json({ success: false, error: "Session not found." });
    }
  });

  app.post("/api/sessions/clear", requireAdminKey, (req, res) => {
    completedSessions.length = 0;
    res.json({ success: true, message: "All sessions cleared successfully." });
  });

  // Clean up old rooms (older than 2 hours) to prevent memory leaks
  setInterval(() => {
    const now = Date.now();
    for (const [code, data] of rooms.entries()) {
      if (now - data.created > 2 * 60 * 60 * 1000) {
        io.to(`room-${code}`).emit("room-expired", { message: "Room expired due to inactivity." });
        rooms.delete(code);
        console.log(`Garbage collected inactive room: ${code}`);
      }
    }
  }, 15 * 60 * 1000);

  function generateRoomCode(): string {
    let code = "";
    do {
      code = generateSecureRoomCode();
    } while (rooms.has(code));
    return code;
  }

  function getClientIp(socket: any): string {
    return socket.handshake.headers["x-forwarded-for"]?.split(",")[0]?.trim()
      || socket.handshake.address
      || "unknown";
  }

  function canAttemptRoomJoin(ip: string): boolean {
    const now = Date.now();
    const entry = joinAttemptsByIp.get(ip);
    if (!entry || now > entry.resetAt) {
      joinAttemptsByIp.set(ip, { count: 1, resetAt: now + LIMITS.ROOM_JOIN_WINDOW_MS });
      return true;
    }
    entry.count += 1;
    return entry.count <= LIMITS.ROOM_JOIN_ATTEMPTS_PER_IP;
  }

  function canRequestAi(socketId: string): boolean {
    const now = Date.now();
    const windowStart = now - 60_000;
    const timestamps = (aiRequestTimestamps.get(socketId) || []).filter((t) => t > windowStart);
    if (timestamps.length >= LIMITS.AI_REQUESTS_PER_MINUTE) {
      aiRequestTimestamps.set(socketId, timestamps);
      return false;
    }
    timestamps.push(now);
    aiRequestTimestamps.set(socketId, timestamps);
    return true;
  }

  // Socket.io handlers
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Heartbeat listener
    socket.on("heartbeat", () => {
      socket.emit("heartbeat-ack", { time: Date.now() });
    });

    // 1. Create Room (Host / Windows Client / Desktop Simulator)
    socket.on("create-room", (callback) => {
      try {
        const code = generateRoomCode();
        rooms.set(code, {
          hostSocketId: socket.id,
          clientSocketIds: [],
          created: Date.now(),
          history: []
        });
        socketToRoom.set(socket.id, code);
        socket.join(`room-${code}`);

        console.log(`Room created: ${code} by host ${socket.id}`);
        if (callback) callback({ success: true, roomCode: code });
      } catch (err: any) {
        console.error("Error creating room:", err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 2. Join Room (Mobile / Assistant Client)
    socket.on("join-room", (payload, callback) => {
      try {
        const { roomCode } = payload || {};
        if (!isValidRoomCode(roomCode)) {
          if (callback) callback({ success: false, error: "Valid 6-digit room code required" });
          return;
        }

        if (!canAttemptRoomJoin(getClientIp(socket))) {
          if (callback) callback({ success: false, error: "Too many join attempts. Try again later." });
          return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
          if (callback) callback({ success: false, error: "Room not found or invalid 6-digit code" });
          return;
        }

        // Add client to room
        room.clientSocketIds.push(socket.id);
        socketToRoom.set(socket.id, roomCode);
        socket.join(`room-${roomCode}`);

        console.log(`Client ${socket.id} joined room ${roomCode}`);
        
        // Notify the entire room (Host + other clients) that pairing succeeded
        io.to(`room-${roomCode}`).emit("paired", {
          roomCode,
          clientsCount: room.clientSocketIds.length,
          hostSocketId: room.hostSocketId
        });

        if (callback) {
          callback({
            success: true,
            roomCode,
            history: room.history
          });
        }
      } catch (err: any) {
        console.error("Error joining room:", err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 3. Real-time Stream forwarding (Screenshots, Audio Chunks, Context payload)
    socket.on("stream-data", (payload) => {
      const roomCode = socketToRoom.get(socket.id);
      if (!roomCode) return;

      if (payload?.image && estimateBase64Bytes(String(payload.image)) > LIMITS.MAX_IMAGE_BYTES) {
        socket.emit("stream-error", { error: "Image payload exceeds 5MB limit." });
        return;
      }

      socket.to(`room-${roomCode}`).emit("stream-feed", payload);
    });

    socket.on("request-ai-assist", async (payload) => {
      const roomCode = socketToRoom.get(socket.id);
      if (!roomCode) {
        socket.emit("ai-error", { error: "No active room association found." });
        return;
      }

      if (!canRequestAi(socket.id)) {
        socket.emit("ai-error", { error: "Rate limit exceeded. Wait before requesting another suggestion." });
        return;
      }

      const room = rooms.get(roomCode);
      if (!room) return;

      if (room.aiInProgress) {
        socket.emit("ai-error", { error: "A suggestion is already being generated for this room." });
        return;
      }

      room.aiInProgress = true;

      const { prompt, image, audioTranscript, scenario } = payload || {};
      if (typeof prompt === "string" && prompt.length > LIMITS.MAX_PROMPT_CHARS) {
        room.aiInProgress = false;
        socket.emit("ai-error", { error: "Prompt exceeds maximum length." });
        return;
      }
      if (typeof audioTranscript === "string" && audioTranscript.length > LIMITS.MAX_TRANSCRIPT_CHARS) {
        room.aiInProgress = false;
        socket.emit("ai-error", { error: "Transcript exceeds maximum length." });
        return;
      }
      if (image && estimateBase64Bytes(String(image)) > LIMITS.MAX_IMAGE_BYTES) {
        room.aiInProgress = false;
        socket.emit("ai-error", { error: "Image payload exceeds 5MB limit." });
        return;
      }

      if (scenario && typeof scenario === "object") {
        room.scenario = {
          title: String(scenario.title || "").slice(0, 200),
          company: String(scenario.company || "").slice(0, 100),
          role: String(scenario.role || "").slice(0, 100),
        };
      }
      console.log(`Generating optimization suggestion for room ${roomCode}...`);

      io.to(`room-${roomCode}`).emit("ai-start");

      const systemInstruction = `You are "The Interview Helper", an elite real-time technical interview optimization expert. 
Your target is to help the candidate by analyzing their screen (screenshots of code/question text) and the interviewer's spoken words (audio transcript).
Deliver an ultra-optimized, condensed cheat-sheet in standard Markdown that the candidate can scan in 3-5 seconds.
Always structure your output with these specific, scan-friendly sections:
- **🎯 IDENTIFIED CHALLENGE**: Name of the algorithm, question, or technology concept being discussed.
- **💡 OPTIMAL STRATEGY**: 2-3 bullet points detailing the best Time/Space complexity, data structures, and edge cases to mention.
- **💻 GOLDEN CODE**: An ultra-clean, minimal code snippet (Typescript/Javascript/Python as appropriate) implementing the core logic of the optimal solution.
- **🗣️ TALKING POINTS**: 2 quick bullet points of phrasing or wording to use (e.g., "Mention how we can optimize this from O(N^2) using a Hash Map...").

Do not include greetings, explanations of code details, or long intros. Speed is everything. Keep the total length short and easy to read.`;

      // Build Gemini contents
      let aiResponseStream = null;
      let completedText = "";
      const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

      try {
      if (aiClient) {
        try {
          const contents: any[] = [];
          
          if (image) {
            // Check if base64 contains metadata prefix, strip it if so
            const base64Data = image.includes("base64,") ? image.split("base64,")[1] : image;
            contents.push({
              inlineData: {
                data: base64Data,
                mimeType: "image/png"
              }
            });
          }

          let promptText = "Review the active interview state and suggest the optimal next steps.";
          if (audioTranscript) {
            promptText += `\nInterviewer spoken content (Transcript): "${String(audioTranscript).slice(0, LIMITS.MAX_TRANSCRIPT_CHARS)}"`;
          }
          if (prompt) {
            promptText += `\nDirect Candidate request: "${String(prompt).slice(0, LIMITS.MAX_PROMPT_CHARS)}"`;
          }
          contents.push({ text: promptText });

          aiResponseStream = await aiClient.models.generateContentStream({
            model: geminiModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.2,
            }
          });

          for await (const chunk of aiResponseStream) {
            const text = chunk.text || "";
            completedText += text;
            io.to(`room-${roomCode}`).emit("ai-chunk", { text });
          }

          room.history.push({
            role: "assistant",
            content: completedText,
            timestamp: new Date().toLocaleTimeString()
          });

          saveOrUpdateSession(roomCode, room, false);

          io.to(`room-${roomCode}`).emit("ai-end", { fullText: completedText });
          console.log(`Stream successfully completed for room ${roomCode}.`);

        } catch (err: any) {
          console.error("Gemini API stream error:", err);
          io.to(`room-${roomCode}`).emit("ai-error", { error: "Gemini API error: " + err.message });
          await runSimulationFallback(roomCode, room, prompt, audioTranscript);
        }
      } else {
        await runSimulationFallback(roomCode, room, prompt, audioTranscript);
      }
      } finally {
        room.aiInProgress = false;
      }
    });

    // Disconnect handling
    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
      const roomCode = socketToRoom.get(socket.id);
      
      if (roomCode) {
        const room = rooms.get(roomCode);
        if (room) {
          if (room.hostSocketId === socket.id) {
            // Host left - destroy the room completely
            io.to(`room-${roomCode}`).emit("room-closed", {
              message: "The host capture client disconnected. Pairing terminated."
            });
            
            // Finalize active session in records if suggestions were generated (Phase 5)
            if (room.history.length > 0) {
              saveOrUpdateSession(roomCode, room, true);
            }
            
            rooms.delete(roomCode);
            console.log(`Room ${roomCode} deleted because host disconnected.`);
          } else {
            // Client left - remove client from array and notify
            room.clientSocketIds = room.clientSocketIds.filter(id => id !== socket.id);
            io.to(`room-${roomCode}`).emit("client-disconnected", {
              clientSocketId: socket.id,
              remainingClients: room.clientSocketIds.length
            });
            console.log(`Client ${socket.id} left room ${roomCode}. Remaining clients: ${room.clientSocketIds.length}`);
          }
        }
        socketToRoom.delete(socket.id);
      }
      aiRequestTimestamps.delete(socket.id);
    });
  });

  // Simulated streaming helper for when Gemini is not configured or fails
  async function runSimulationFallback(roomCode: string, room: any, prompt: string, audioTranscript: string) {
    console.log(`Running high-fidelity simulation for room ${roomCode}...`);
    
    // Construct rich simulation text depending on prompt keywords
    const isReact = /react|hook|state|effect/i.test(prompt || audioTranscript);
    const isPython = /python|list|dict|tuple/i.test(prompt || audioTranscript);
    const isSql = /sql|database|query|table/i.test(prompt || audioTranscript);

    let simText = "";

    if (isReact) {
      simText = `### 🎯 IDENTIFIED CHALLENGE: React state updates batching and custom hooks

### 💡 OPTIMAL STRATEGY
* **Stale Closures**: Always capture dependencies in \`useCallback\` and \`useEffect\` arrays. Use functional state updates (e.g., \`setCount(c => c + 1)\`) to avoid referencing stale values.
* **Complexity**: State setting in React is asynchronous. Multiple updates inside the same synchronous tick are batched for high-performance rendering.
* **Edge Cases**: Unmounted components firing state setters can cause warnings; verify lifetime with cleanup functions.

### 💻 GOLDEN CODE
\`\`\`typescript
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
\`\`\`

### 🗣️ TALKING POINTS
* "I leverage custom debouncing hooks to reduce redundant calculations and expensive DOM re-renders."
* "By returning a clean-up handler in \`useEffect\`, I ensure that we cancel pending timers if the component unmounts."`;
    } else if (isPython) {
      simText = `### 🎯 IDENTIFIED CHALLENGE: LRU (Least Recently Used) Cache optimization

### 💡 OPTIMAL STRATEGY
* **Data Structure**: Use a combination of a Doubly Linked List (for $O(1)$ updates of eviction order) and a Hash Map (for $O(1)$ lookups of cache items).
* **Time Complexity**: Both \`get\` and \`put\` operations are fully optimized to operate in strict **$O(1)$** average time complexity.
* **Edge Cases**: Empty cache capacity (invalid), overwriting existing keys, and reaching max size (evicting least recently used element).

### 💻 GOLDEN CODE
\`\`\`python
class Node:
    def __init__(self, key, val):
        self.key, self.val = key, val
        self.prev = self.next = None

class LRUCache:
    def __init__(self, capacity: int):
        self.cap = capacity
        self.cache = {}  # key -> Node
        self.left, self.right = Node(0, 0), Node(0, 0)
        self.left.next, self.right.prev = self.right, self.left

    def get(self, key: int) -> int:
        if key in self.cache:
            self.remove(self.cache[key])
            self.insert(self.cache[key])
            return self.cache[key].val
        return -1
\`\`\`

### 🗣️ TALKING POINTS
* "Combining a doubly linked list with a hash map allows us to achieve $O(1)$ bounds for both fetch and insertion."
* "We use dummy head and tail sentinel nodes to eliminate pesky null-pointer checks during node insertions and evictions."`;
    } else if (isSql) {
      simText = `### 🎯 IDENTIFIED CHALLENGE: Relational Database Indexing & Query Tuning

### 💡 OPTIMAL STRATEGY
* **Indexes**: Use B-Tree indexes for standard equality/range queries, and Hash indexes for exact lookups.
* **Explain Plan**: Run \`EXPLAIN ANALYZE\` to check if queries use Seq Scan (bad) vs Index Scan (good).
* **Joins**: Prefer INNER JOIN with appropriate indexing on primary/foreign keys to maintain sub-10ms response times.

### 💻 GOLDEN CODE
\`\`\`sql
-- Creating composite cover index to optimize filtering and joining
CREATE INDEX idx_users_active_created 
ON users (status, created_at DESC) 
INCLUDE (email, username);

-- Optimized query avoiding sub-queries
SELECT u.email, o.total_price
FROM users u
INNER JOIN orders o ON u.id = o.user_id
WHERE u.status = 'active'
ORDER BY u.created_at DESC
LIMIT 50;
\`\`\`

### 🗣️ TALKING POINTS
* "A composite index should follow the Leftmost Prefix Rule to ensure PostgreSQL can optimize filter ranges correctly."
* "Using covering indexes (with the \`INCLUDE\` clause) lets us retrieve query parameters directly from the index tree without a second heap lookup."`;
    } else {
      simText = `### 🎯 IDENTIFIED CHALLENGE: High-Performance Interview Live Helper Suggestions

### 💡 OPTIMAL STRATEGY
* **Sub-2-Second Pipeline**: Capture loopback WASAPI audio, serialize screens to compressed JPEG/PNG strings, and process over WebSocket relays.
* **Gemini Assistance**: Let the AI analyze coding patterns directly from live screenshots to spot syntax mistakes, logic gaps, or suboptimal algorithmic complexities.
* **State Sync**: Rely on simple 6-digit rooms to link local OS clients to lightweight auxiliary mobile screens.

### 💻 GOLDEN CODE
\`\`\`typescript
// Ultra-fast client streaming socket payload
import { io } from "socket.io-client";
const socket = io("http://localhost:3000");

function streamState(screenshotBase64: string, transcript: string) {
  socket.emit("stream-data", {
    image: screenshotBase64,
    audioTranscript: transcript,
    timestamp: Date.now()
  });
}
\`\`\`

### 🗣️ TALKING POINTS
* "Using lightweight web sockets allows for sub-200ms transport overhead, leaving plenty of room for real-time model analysis."
* "This keeps the candidate's core coding workspace clean, pushing assistive outputs onto a secondary smartphone monitor."`;
    }

    // Split simulation text into small words/sentences and stream them slowly to replicate live stream
    const words = simText.split(/(\s+)/);
    let chunkBuffer = "";

    for (let i = 0; i < words.length; i++) {
      chunkBuffer += words[i];
      // Stream every 3 words or so to keep a highly organic pace
      if (i % 3 === 0 || i === words.length - 1) {
        io.to(`room-${roomCode}`).emit("ai-chunk", { text: chunkBuffer });
        chunkBuffer = "";
        // Sleep 40ms to simulate fast streaming
        await new Promise(resolve => setTimeout(resolve, 45));
      }
    }

    // Save history
    room.history.push({
      role: "assistant",
      content: simText,
      timestamp: new Date().toLocaleTimeString()
    });

    // Update active session records (Phase 5)
    saveOrUpdateSession(roomCode, room, false);

    io.to(`room-${roomCode}`).emit("ai-end", { fullText: simText });
    console.log(`Simulated stream successfully completed for room ${roomCode}.`);
  }

  // Vite development integration (local dev only — production bundle serves /dist)
  if (!isProduction) {
    console.log("Starting development mode with Vite HMR middleware...");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: [".railway.app", "theinterviewhelper.com", "www.theinterviewhelper.com", "localhost"],
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving static production assets from /dist...");
    const distPath = path.join(process.cwd(), "dist");
    if (!fs.existsSync(path.join(distPath, "index.html"))) {
      console.error("Production build missing: dist/index.html not found. Run npm run build.");
      process.exit(1);
    }
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`====================================================`);
    console.log(`  🚀 TheInterviewHelper Relay Server is running!   `);
    console.log(`  🔗 Endpoint: http://localhost:${PORT}             `);
    console.log(`====================================================`);
  });
}

startServer().catch((err) => {
  console.error("Critical server startup error:", err);
});
