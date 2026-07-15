/**
 * Standalone subscription landing page at /subscribe
 */
import React, { useEffect, useState } from "react";
import { Check, CreditCard, Lock, Sparkles, Smartphone, Laptop } from "lucide-react";

type SubscriptionStatus = {
  status: "active" | "canceled" | "none";
  email: string;
  currentPeriodEnd: number;
};

export default function SubscribePage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionStatus>({
    status: "none",
    email: "",
    currentPeriodEnd: 0,
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
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
              setMessage("Payment successful. You can now start pairing on Android or the web dashboard.");
              return;
            }
          }
          const statusRes = await fetch(`/api/stripe/status?email=${encodeURIComponent(redirectEmail)}`);
          const statusData = await statusRes.json();
          if (statusData.success) setSubscription(statusData);
          setMessage("Payment received. Subscription is activating — refresh if status does not update.");
        } catch {
          setMessage("Payment received. Open the Android app and sign in with the same email.");
        }
      })();
    } else if (stripeResult === "cancel") {
      setMessage("Checkout canceled. You can try again when ready.");
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
      setMessage("Enter your billing email first.");
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
          successUrl: `${window.location.origin}/subscribe`,
          cancelUrl: `${window.location.origin}/subscribe?stripe=cancel`,
        }),
      });
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setMessage(data.error || "Could not start checkout.");
      }
    } catch {
      setMessage("Network error starting checkout.");
    } finally {
      setLoading(false);
    }
  };

  const syncFromStripe = async () => {
    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail) return;
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/sync-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json();
      if (data.success && data.subscription) {
        setSubscription(data.subscription);
        setMessage("Subscription synced from Stripe.");
      } else {
        setMessage(data.error || "No active subscription found for this email.");
      }
    } catch {
      setMessage("Could not sync subscription.");
    } finally {
      setLoading(false);
    }
  };

  const isActive = subscription.status === "active";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">The Interview Helper</h1>
            <p className="text-sm text-slate-400">Subscribe to unlock live pairing and AI answers</p>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-indigo-400 font-bold mb-2">Platinum Access</p>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold">€20</span>
                <span className="text-slate-400 mb-1">/ month</span>
              </div>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${isActive ? "bg-emerald-500/20 text-emerald-300" : "bg-indigo-500/20 text-indigo-300"}`}>
              {isActive ? "Active" : "Required for pairing"}
            </div>
          </div>

          <ul className="space-y-3 mb-8 text-sm text-slate-300">
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Android app with personalized AI (role, job description, CV)</li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Windows stealth capture client for full-screen interview questions</li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Real-time screenshot relay to your phone during live interviews</li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Pairing and AI answers only after payment is confirmed</li>
          </ul>

          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Billing email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm mb-4 outline-none focus:border-indigo-500"
          />

          {message ? <p className="text-sm text-amber-300 mb-4">{message}</p> : null}

          {isActive ? (
            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-sm text-emerald-200">
                Subscription active for <strong>{subscription.email}</strong>. Open the Android app, enter this email, and start a session.
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-2 bg-slate-950/50 border border-slate-800 rounded-lg p-3">
                  <Smartphone className="w-4 h-4 text-indigo-400" /> Android: create session + view answers
                </div>
                <div className="flex items-center gap-2 bg-slate-950/50 border border-slate-800 rounded-lg p-3">
                  <Laptop className="w-4 h-4 text-indigo-400" /> Windows: stealth capture → phone
                </div>
              </div>
              <a href="/" className="inline-block text-indigo-400 text-sm hover:underline">Open full dashboard →</a>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={startCheckout}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 rounded-xl py-3 font-semibold text-sm"
              >
                <CreditCard className="w-4 h-4" />
                {loading ? "Redirecting…" : "Subscribe — €20/month"}
              </button>
              <button
                onClick={syncFromStripe}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 border border-slate-700 hover:border-slate-500 rounded-xl px-4 py-3 text-sm"
              >
                Already paid? Refresh
              </button>
            </div>
          )}

          <p className="flex items-center gap-2 text-[11px] text-slate-500 mt-6">
            <Lock className="w-3 h-3" /> Secure payments via Stripe. Pairing is blocked until subscription is active.
          </p>
        </div>
      </div>
    </div>
  );
}
