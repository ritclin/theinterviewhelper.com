/**
 * Public marketing site — Interview Hammer-style showcase with Stripe + downloads
 */
import React, { useEffect, useState } from "react";
import {
  Sparkles,
  CreditCard,
  Download,
  Smartphone,
  Laptop,
  Mic,
  Camera,
  Lock,
  Check,
  ArrowRight,
  Shield,
} from "lucide-react";

type SubscriptionStatus = {
  status: "active" | "canceled" | "none";
  email: string;
  currentPeriodEnd: number;
};

type DownloadLinks = {
  windowsZip: string;
  windowsExe: string | null;
  androidApk: string | null;
  androidPlayStore: string | null;
};

const DEFAULT_DOWNLOADS: DownloadLinks = {
  windowsZip: "/downloads/interview-helper-windows.zip",
  windowsExe: null,
  androidApk: null,
  androidPlayStore: null,
};

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [subscription, setSubscription] = useState<SubscriptionStatus>({
    status: "none",
    email: "",
    currentPeriodEnd: 0,
  });
  const [downloads, setDownloads] = useState<DownloadLinks>(DEFAULT_DOWNLOADS);

  useEffect(() => {
    fetch("/api/downloads")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.downloads) setDownloads({ ...DEFAULT_DOWNLOADS, ...data.downloads });
      })
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const stripeResult = params.get("stripe");
    const redirectEmail = params.get("email");
    const sessionId = params.get("session_id");
    if (redirectEmail) setEmail(redirectEmail);

    if (stripeResult === "success" && redirectEmail) {
      (async () => {
        try {
          if (sessionId) {
            const res = await fetch("/api/stripe/confirm-session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId, email: redirectEmail }),
            });
            const data = await res.json();
            if (data.success && data.subscription) {
              setSubscription(data.subscription);
              setMessage("Payment successful! Download the apps below and start your session on Android.");
              return;
            }
          }
          const statusRes = await fetch(`/api/stripe/status?email=${encodeURIComponent(redirectEmail)}`);
          const statusData = await statusRes.json();
          if (statusData.success) setSubscription(statusData);
          setMessage("Payment received. Download the apps and open Android to start pairing.");
        } catch {
          setMessage("Payment received. Use the same email in the Android app.");
        }
      })();
    } else if (stripeResult === "cancel") {
      setMessage("Checkout canceled. You can still download the apps and subscribe when ready.");
    }
  }, []);

  useEffect(() => {
    if (!email.trim()) return;
    fetch(`/api/stripe/status?email=${encodeURIComponent(email.trim())}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setSubscription(data);
      })
      .catch(() => {});
  }, [email]);

  const startCheckout = async () => {
    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail) {
      setMessage("Enter your email to subscribe.");
      document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: targetEmail,
          successUrl: `${window.location.origin}/?stripe=success`,
          cancelUrl: `${window.location.origin}/?stripe=cancel`,
        }),
      });
      const data = await res.json();
      if (data.success && data.url) window.location.href = data.url;
      else setMessage(data.error || "Could not start checkout.");
    } catch {
      setMessage("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const syncSubscription = async () => {
    const target = email.trim().toLowerCase();
    if (!target) return;
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/sync-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const data = await res.json();
      if (data.success && data.subscription) {
        setSubscription(data.subscription);
        setMessage("Subscription active!");
      } else {
        setMessage(data.error || "No subscription found.");
      }
    } finally {
      setLoading(false);
    }
  };

  const isActive = subscription.status === "active";
  const windowsUrl = downloads.windowsExe || downloads.windowsZip;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Nav */}
      <nav className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <span className="font-bold font-display">The Interview Helper</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a href="#how" className="text-slate-400 hover:text-white hidden sm:inline">How it works</a>
            <a href="#downloads" className="text-slate-400 hover:text-white hidden sm:inline">Downloads</a>
            <a href="#pricing" className="text-indigo-400 hover:text-indigo-300 font-semibold">€20/mo</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="max-w-6xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 rounded-full px-4 py-1.5 text-xs text-indigo-300 mb-6">
          <Shield className="w-3.5 h-3.5" /> Stealth mode · Real-time AI · Mobile answers
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold font-display leading-tight mb-6">
          Ace your interview with
          <span className="text-indigo-400"> invisible AI assistance</span>
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
          Keep your phone near the laptop — it listens to the interviewer, reads coding questions from your screen,
          and shows personalized answers instantly. Works like Interview Hammer, built for you.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="#downloads"
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl px-8 py-3.5 font-semibold"
          >
            <Download className="w-4 h-4" /> Download apps
          </a>
          <a
            href="#pricing"
            className="inline-flex items-center justify-center gap-2 border border-slate-700 hover:border-slate-500 rounded-xl px-8 py-3.5 font-semibold"
          >
            Subscribe €20/month <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </header>

      {/* How it works */}
      <section id="how" className="max-w-6xl mx-auto px-6 py-16 border-t border-slate-800/50">
        <h2 className="text-2xl font-bold text-center mb-12 font-display">How it works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <Step
            n="1"
            icon={<CreditCard className="w-6 h-6 text-indigo-400" />}
            title="Subscribe on the website"
            desc="Pay €20/month via Stripe. Download Windows + Android apps before or after payment."
          />
          <Step
            n="2"
            icon={<Smartphone className="w-6 h-6 text-indigo-400" />}
            title="Android hosts the session"
            desc="Set your role, job description & CV. Start pairing — get a 6-digit code. Keep phone near laptop to hear the interviewer."
          />
          <Step
            n="3"
            icon={<Laptop className="w-6 h-6 text-indigo-400" />}
            title="Windows captures in stealth"
            desc="Install the stealth .exe with your pairing code. Ctrl+Shift+Space sends full-screen coding questions to your phone."
          />
        </div>
        <div className="mt-12 grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <Feature icon={<Mic className="w-5 h-5" />} title="Voice listening" desc="Phone mic picks up interviewer questions from your laptop speakers." />
          <Feature icon={<Camera className="w-5 h-5" />} title="Screen capture" desc="Stealth Windows client sends coding & MCQ screenshots to Android." />
        </div>
      </section>

      {/* Downloads — available before AND after payment */}
      <section id="downloads" className="max-w-6xl mx-auto px-6 py-16 border-t border-slate-800/50">
        <h2 className="text-2xl font-bold text-center mb-3 font-display">Download the apps</h2>
        <p className="text-center text-slate-400 text-sm mb-10 max-w-xl mx-auto">
          Install both apps first. Active pairing starts after subscription — use the same email everywhere.
        </p>
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <DownloadCard
            platform="Windows"
            icon={<Laptop className="w-8 h-8 text-indigo-400" />}
            title="Stealth Capture Client"
            bullets={[
              "Runs hidden in system tray",
              "Auto-starts on login (install.ps1)",
              "Ctrl+Shift+Space → screenshot to phone",
            ]}
            primaryLabel={downloads.windowsExe ? "Download .exe" : "Download Windows package"}
            primaryHref={windowsUrl}
            secondaryLabel="Build instructions inside ZIP"
          />
          <DownloadCard
            platform="Android"
            icon={<Smartphone className="w-8 h-8 text-indigo-400" />}
            title="Interview Companion"
            bullets={[
              "Personalized AI (role, JD, CV)",
              "Listens to interview voice",
              "Shows answers on your phone",
            ]}
            primaryLabel={downloads.androidApk ? "Download Android APK" : "Get Android app"}
            primaryHref={downloads.androidApk || "#android-install"}
            secondaryLabel={downloads.androidPlayStore ? "Google Play Store" : "Direct APK install (enable Unknown sources)"}
            secondaryHref={downloads.androidPlayStore || undefined}
          />
        </div>
        <div id="android-install" className="mt-8 max-w-2xl mx-auto bg-slate-900/50 border border-slate-800 rounded-xl p-6 text-sm text-slate-400">
          <p className="font-semibold text-white mb-2">Android install options</p>
          <ul className="space-y-1 list-disc list-inside">
            <li><strong className="text-slate-300">Play Store</strong> — link appears here when published</li>
            <li><strong className="text-slate-300">Direct APK</strong> — download from link above when hosted</li>
            <li><strong className="text-slate-300">Developer build</strong> — <code className="text-indigo-300">cd mobile-client && eas build -p android</code></li>
          </ul>
        </div>
      </section>

      {/* Pricing / Stripe */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-16 border-t border-slate-800/50">
        <div className="max-w-lg mx-auto bg-slate-900/60 border border-slate-800 rounded-2xl p-8">
          <p className="text-xs uppercase tracking-widest text-indigo-400 font-bold mb-2">Platinum Access</p>
          <div className="flex items-end gap-2 mb-6">
            <span className="text-5xl font-bold">€20</span>
            <span className="text-slate-400 mb-2">/ month</span>
          </div>
          <ul className="space-y-2.5 mb-6 text-sm text-slate-300">
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> Active pairing & AI answers</li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> Windows stealth + Android voice</li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> Profile-based personalized responses</li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> Full-screen coding question capture</li>
          </ul>

          <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Billing email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm mb-4 outline-none focus:border-indigo-500"
          />

          {message && <p className="text-sm text-amber-300 mb-4">{message}</p>}

          {isActive ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-sm text-emerald-200 mb-4">
              ✓ Active for <strong>{subscription.email}</strong>. Open Android → enter email → Start session.
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            {!isActive && (
              <button
                onClick={startCheckout}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 rounded-xl py-3.5 font-semibold"
              >
                <CreditCard className="w-4 h-4" />
                {loading ? "Redirecting to Stripe…" : "Pay with Stripe — €20/month"}
              </button>
            )}
            <button
              onClick={syncSubscription}
              disabled={loading}
              className="w-full border border-slate-700 hover:border-slate-500 rounded-xl py-3 text-sm"
            >
              Already paid? Refresh subscription
            </button>
          </div>

          <p className="flex items-center gap-2 text-[11px] text-slate-500 mt-5">
            <Lock className="w-3 h-3" /> Secure Stripe checkout. Pairing blocked until payment confirmed.
          </p>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-500">
        <a href="/dashboard" className="text-indigo-400 hover:underline">Developer dashboard</a>
        <span className="mx-2">·</span>
        The Interview Helper
      </footer>
    </div>
  );
}

function Step({ n, icon, title, desc }: { n: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="text-center p-6 rounded-xl bg-slate-900/40 border border-slate-800">
      <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center mx-auto mb-4">{n}</div>
      <div className="flex justify-center mb-3">{icon}</div>
      <h3 className="font-bold mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3 p-4 rounded-lg bg-slate-900/30 border border-slate-800/80">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div>
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function DownloadCard({
  platform,
  icon,
  title,
  bullets,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}: {
  platform: string;
  icon: React.ReactNode;
  title: string;
  bullets: string[];
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref?: string;
}) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <div>
          <p className="text-xs text-indigo-400 font-bold uppercase">{platform}</p>
          <p className="font-bold">{title}</p>
        </div>
      </div>
      <ul className="space-y-2 mb-6 text-sm text-slate-400">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <Check className="w-4 h-4 text-emerald-500 shrink-0" /> {b}
          </li>
        ))}
      </ul>
      <a
        href={primaryHref}
        download={primaryHref.endsWith(".zip") || primaryHref.endsWith(".exe")}
        className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-500 rounded-xl py-3 font-semibold text-sm mb-2"
      >
        <Download className="w-4 h-4" /> {primaryLabel}
      </a>
      {secondaryHref ? (
        <a href={secondaryHref} target="_blank" rel="noopener noreferrer" className="block text-center text-xs text-slate-400 hover:text-indigo-400">
          {secondaryLabel} →
        </a>
      ) : (
        <p className="text-center text-xs text-slate-500">{secondaryLabel}</p>
      )}
    </div>
  );
}
