/**
 * Public marketing site with one-click app downloads
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
  windowsExe: string;
  androidApk: string;
  androidPlayStore: string | null;
};

/** Always-available paths — server also verifies files exist via /api/downloads */
const DOWNLOADS: DownloadLinks = {
  windowsZip: "/downloads/interview-helper-windows.zip",
  windowsExe: "/downloads/InterviewHelperCapture.exe",
  androidApk: "/downloads/interview-helper.apk",
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
  const [downloads, setDownloads] = useState<DownloadLinks>(DOWNLOADS);

  useEffect(() => {
    fetch("/api/downloads")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.downloads) {
          setDownloads({
            windowsZip: data.downloads.windowsZip || DOWNLOADS.windowsZip,
            windowsExe: data.downloads.windowsExe || DOWNLOADS.windowsExe,
            androidApk: data.downloads.androidApk || DOWNLOADS.androidApk,
            androidPlayStore: data.downloads.androidPlayStore || null,
          });
        }
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
              setMessage("Payment successful! Download the apps below and open Android to start.");
              document.getElementById("downloads")?.scrollIntoView({ behavior: "smooth" });
              return;
            }
          }
          const statusRes = await fetch(`/api/stripe/status?email=${encodeURIComponent(redirectEmail)}`);
          const statusData = await statusRes.json();
          if (statusData.success) setSubscription(statusData);
          setMessage("Payment received. Download the apps below.");
        } catch {
          setMessage("Payment received. Download the apps below.");
        }
      })();
    } else if (stripeResult === "cancel") {
      setMessage("Checkout canceled. You can still download the apps below.");
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />
            <span className="font-bold font-display truncate">The Interview Helper</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-sm shrink-0">
            <DownloadButton href={downloads.androidApk} filename="interview-helper.apk" compact label="Android" />
            <DownloadButton href={downloads.windowsZip} filename="interview-helper-windows.zip" compact label="Windows" />
            <a href="#pricing" className="text-indigo-400 hover:text-indigo-300 font-semibold hidden sm:inline">€20/mo</a>
          </div>
        </div>
      </nav>

      <header className="max-w-6xl mx-auto px-6 pt-14 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 rounded-full px-4 py-1.5 text-xs text-indigo-300 mb-6">
          <Shield className="w-3.5 h-3.5" /> Stealth mode · Real-time AI · Mobile answers
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold font-display leading-tight mb-6">
          Ace your interview with
          <span className="text-indigo-400"> invisible AI assistance</span>
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
          Download the Android and Windows apps, subscribe, and get personalized STAR-format answers during live interviews.
        </p>

        {/* Primary download buttons — hero */}
        <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto mb-6">
          <DownloadButton
            href={downloads.androidApk}
            filename="interview-helper.apk"
            label="Download Android App"
            sublabel="APK · Install on your phone"
            icon={<Smartphone className="w-5 h-5" />}
            large
          />
          <DownloadButton
            href={downloads.windowsZip}
            filename="interview-helper-windows.zip"
            label="Download Windows App"
            sublabel="ZIP · Stealth screen capture"
            icon={<Laptop className="w-5 h-5" />}
            large
          />
        </div>
        <p className="text-xs text-slate-500 mb-8">
          Free to download · Subscription required to start pairing (€20/month)
        </p>
        <a
          href="#pricing"
          className="inline-flex items-center justify-center gap-2 border border-slate-700 hover:border-indigo-500 rounded-xl px-8 py-3 font-semibold text-sm"
        >
          Subscribe €20/month <ArrowRight className="w-4 h-4" />
        </a>
      </header>

      <section id="how" className="max-w-6xl mx-auto px-6 py-16 border-t border-slate-800/50">
        <h2 className="text-2xl font-bold text-center mb-12 font-display">How it works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <Step n="1" icon={<Download className="w-6 h-6 text-indigo-400" />} title="Download both apps" desc="Click Download above — Android APK on phone, Windows ZIP on interview laptop." />
          <Step n="2" icon={<Smartphone className="w-6 h-6 text-indigo-400" />} title="Set up Android" desc="Enter email, add your CV & job description, start session — get a 6-digit code." />
          <Step n="3" icon={<Laptop className="w-6 h-6 text-indigo-400" />} title="Run Windows stealth" desc="Unzip, run RUN-STEALTH.bat with your code. Ctrl+Shift+Space captures questions." />
        </div>
        <div className="mt-12 grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <Feature icon={<Mic className="w-5 h-5" />} title="Voice listening" desc="Phone hears interviewer questions from laptop speakers." />
          <Feature icon={<Camera className="w-5 h-5" />} title="Screen capture" desc="Windows sends coding questions to your phone invisibly." />
        </div>
      </section>

      <section id="downloads" className="max-w-6xl mx-auto px-6 py-16 border-t border-slate-800/50">
        <h2 className="text-2xl font-bold text-center mb-3 font-display">Install the apps</h2>
        <p className="text-center text-slate-400 text-sm mb-10 max-w-xl mx-auto">
          Click to download, then follow the install steps below. No app store required.
        </p>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <InstallCard
            platform="Android"
            icon={<Smartphone className="w-8 h-8 text-indigo-400" />}
            title="Interview Helper — Android"
            downloadHref={downloads.androidApk}
            downloadFilename="interview-helper.apk"
            downloadLabel="Download Android APK"
            steps={[
              "Tap the button — file saves as interview-helper.apk",
              "Open the file on your phone (enable Install unknown apps if asked)",
              "Open app → enter billing email → fill profile → Start session",
            ]}
          />
          <InstallCard
            platform="Windows"
            icon={<Laptop className="w-8 h-8 text-indigo-400" />}
            title="Interview Helper — Windows"
            downloadHref={downloads.windowsZip}
            downloadFilename="interview-helper-windows.zip"
            downloadLabel="Download Windows ZIP"
            altHref={downloads.windowsExe}
            altLabel="Or download .exe only"
            steps={[
              "Unzip the downloaded file on your interview laptop",
              "Double-click RUN-STEALTH.bat → enter 6-digit code from Android",
              "If SmartScreen appears: More info → Run anyway",
              "Hotkey during interview: Ctrl+Shift+Space",
            ]}
          />
        </div>
      </section>

      <section id="pricing" className="max-w-6xl mx-auto px-6 py-16 border-t border-slate-800/50">
        <div className="max-w-lg mx-auto bg-slate-900/60 border border-slate-800 rounded-2xl p-8">
          <p className="text-xs uppercase tracking-widest text-indigo-400 font-bold mb-2">Platinum Access</p>
          <div className="flex items-end gap-2 mb-6">
            <span className="text-5xl font-bold">€20</span>
            <span className="text-slate-400 mb-2">/ month</span>
          </div>
          <ul className="space-y-2.5 mb-6 text-sm text-slate-300">
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> Active pairing & AI answers</li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> STAR-format personalized responses</li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> Windows stealth + Android voice</li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> Full-screen coding capture</li>
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

          {isActive && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-sm text-emerald-200 mb-4">
              ✓ Active for <strong>{subscription.email}</strong>. Open Android → enter email → Start session.
            </div>
          )}

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
            <Lock className="w-3 h-3" /> Secure Stripe checkout. Pairing starts after payment.
          </p>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-500">
        <div className="flex flex-wrap justify-center gap-4 mb-3">
          <a href={downloads.androidApk} download="interview-helper.apk" className="text-indigo-400 hover:underline">Android APK</a>
          <a href={downloads.windowsZip} download="interview-helper-windows.zip" className="text-indigo-400 hover:underline">Windows ZIP</a>
          <a href="/dashboard" className="text-slate-400 hover:underline">Developer dashboard</a>
        </div>
        The Interview Helper
      </footer>
    </div>
  );
}

function DownloadButton({
  href,
  filename,
  label,
  sublabel,
  icon,
  large,
  compact,
}: {
  href: string;
  filename: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  large?: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <a
        href={href}
        download={filename}
        className="inline-flex items-center gap-1.5 bg-indigo-600/80 hover:bg-indigo-500 rounded-lg px-3 py-1.5 text-xs font-semibold"
      >
        <Download className="w-3 h-3" />
        {label}
      </a>
    );
  }

  return (
    <a
      href={href}
      download={filename}
      className={`flex flex-col items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-semibold transition-colors ${
        large ? "px-6 py-5 text-base" : "px-4 py-3 text-sm"
      }`}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      {sublabel && <span className="text-indigo-200 text-xs font-normal">{sublabel}</span>}
    </a>
  );
}

function InstallCard({
  platform,
  icon,
  title,
  downloadHref,
  downloadFilename,
  downloadLabel,
  altHref,
  altLabel,
  steps,
}: {
  platform: string;
  icon: React.ReactNode;
  title: string;
  downloadHref: string;
  downloadFilename: string;
  downloadLabel: string;
  altHref?: string;
  altLabel?: string;
  steps: string[];
}) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <div>
          <p className="text-xs text-indigo-400 font-bold uppercase">{platform}</p>
          <p className="font-bold">{title}</p>
        </div>
      </div>

      <a
        href={downloadHref}
        download={downloadFilename}
        className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-500 rounded-xl py-4 font-bold text-base mb-2 shadow-lg shadow-indigo-900/30"
      >
        <Download className="w-5 h-5" />
        {downloadLabel}
      </a>

      {altHref && altLabel && (
        <a
          href={altHref}
          download="InterviewHelperCapture.exe"
          className="block text-center text-xs text-indigo-400 hover:text-indigo-300 mb-4"
        >
          {altLabel}
        </a>
      )}

      <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 mt-2">Install steps</p>
      <ol className="space-y-2 text-sm text-slate-400 flex-1 list-decimal list-inside">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
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
