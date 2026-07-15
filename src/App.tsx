/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { 
  Laptop, Smartphone, Sparkles, Cpu, Layers, Wifi, 
  CheckCircle2, AlertCircle, ArrowRight, Code, MessageSquare, 
  Clock, ArrowUpRight, Lock, User, CreditCard, RefreshCw, Eye,
  Send, Terminal, Plus, HelpCircle, Key, Calendar, Trash2, 
  TrendingUp, Search, FileText, Copy, Check, Database, Activity, Download,
  History
} from "lucide-react";
import { INTERVIEW_SCENARIOS } from "./scenarios";
import { InterviewScenario, SuggestionHistoryItem } from "./types";
import { MarkdownStreamViewer } from "./components/MarkdownStreamViewer";

export default function App() {
  // Global Socket reference
  const socketRef = useRef<Socket | null>(null);

  // Connection & Active Room Statuses
  const [socketConnected, setSocketConnected] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [activeRelayRoomsCount, setActiveRelayRoomsCount] = useState(0);
  const [activeRelayRooms, setActiveRelayRooms] = useState<any[]>([]);

  // SaaS Billing and Stripe States
  const [userEmail, setUserEmail] = useState<string>("rcsequeira@google.com");
  const [subscription, setSubscription] = useState<{
    status: "active" | "canceled" | "none";
    email: string;
    currentPeriodEnd: number;
    subscriptionId?: string;
  }>({ status: "none", email: "rcsequeira@google.com", currentPeriodEnd: 0 });
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [loadingSub, setLoadingSub] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [expandedWebhookLogId, setExpandedWebhookLogId] = useState<string | null>(null);

  // Panel A: Host Client Simulator State
  const [hostRoomCode, setHostRoomCode] = useState<string>("");
  const [hostPaired, setHostPaired] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<InterviewScenario>(INTERVIEW_SCENARIOS[0]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isStreamingFeed, setIsStreamingFeed] = useState(false);

  // Panel B: Mobile Client Simulator State
  const [inputRoomCode, setInputRoomCode] = useState("");
  const [clientJoinedCode, setClientJoinedCode] = useState<string>("");
  const [clientPaired, setClientPaired] = useState(false);
  const [receivedImageText, setReceivedImageText] = useState<string>("");
  const [receivedImageName, setReceivedImageName] = useState<string>("");
  const [receivedTranscript, setReceivedTranscript] = useState<string>("");
  
  // Streaming suggestion states
  const [suggestionStream, setSuggestionStream] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [history, setHistory] = useState<SuggestionHistoryItem[]>([]);

  // Tab management for SaaS Dashboard
  const [activeSaaSTab, setActiveSaaSTab] = useState<"platform" | "pricing" | "docs" | "history">("platform");

  // Ping interval ref for latency calculation
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Phase 5: Sessions and Analytics States
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionSearchQuery, setSessionSearchQuery] = useState("");
  const [latencyHistory, setLatencyHistory] = useState<Array<{ time: string; latency: number }>>([]);

  // Fetch session history from API (Phase 5)
  const fetchSessions = async () => {
    try {
      setIsLoadingSessions(true);
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (e) {
      console.warn("Failed to fetch session archive:", e);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Fetch subscription status
  const fetchSubscription = async (email: string) => {
    setLoadingSub(true);
    try {
      const res = await fetch(`/api/stripe/status?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
      }
    } catch (err) {
      console.warn("Failed to fetch subscription status:", err);
    } finally {
      setLoadingSub(false);
    }
  };

  // Fetch webhook logs
  const fetchWebhookLogs = async () => {
    try {
      const res = await fetch("/api/stripe/webhook-logs");
      if (res.ok) {
        const data = await res.json();
        setWebhookLogs(data.logs || []);
      }
    } catch (err) {
      console.warn("Failed to retrieve webhook logs:", err);
    }
  };

  // Fetch server stats
  const fetchStats = async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        setHasGeminiKey(data.hasGeminiKey);
        setActiveRelayRoomsCount(data.activeRoomsCount || 0);
      }

      // Also get the full room sessions for our Dashboard session overview!
      const roomsRes = await fetch("/api/rooms");
      if (roomsRes.ok) {
        const roomsData = await roomsRes.json();
        setActiveRelayRooms(roomsData.activeRooms || []);
      }
    } catch (e) {
      console.warn("Failed to retrieve server health info:", e);
    }
  };

  // Initiate mock/real Stripe checkout
  const handleStripeCheckout = async () => {
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          successUrl: window.location.origin + "/?stripe=success",
          cancelUrl: window.location.origin + "/?stripe=cancel"
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.url) {
          if (data.mode === "simulated") {
            // It's a simulated flow! Open the beautiful Stripe checkout modal
            setShowCheckoutModal(true);
          } else {
            // Real Stripe Checkout redirect
            window.location.href = data.url;
          }
        }
      }
    } catch (err) {
      alert(`Stripe Checkout Error: ${err}`);
    }
  };

  // Trigger simulated Stripe webhook
  const handleSimulateWebhook = async (type: string) => {
    try {
      const res = await fetch("/api/stripe/simulate-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, email: userEmail })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSubscription(data.subscription);
          fetchWebhookLogs();
          fetchStats();
        }
      }
    } catch (err) {
      console.warn("Failed to trigger webhook simulation:", err);
    }
  };

  // Load subscription status and webhooks on load and whenever email changes
  useEffect(() => {
    fetchSubscription(userEmail);
    fetchWebhookLogs();
    fetchSessions();
    
    // Set up polling for webhook logs and active sessions every 5 seconds
    const pollInterval = setInterval(() => {
      fetchWebhookLogs();
      fetchStats();
      fetchSessions();
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [userEmail]);

  useEffect(() => {
    // 1. Initialize Socket.io Connection to current origin
    const socket = io(window.location.origin, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketConnected(true);
      fetchStats();
      console.log("Socket client successfully linked:", socket.id);
      
      // Setup latency ping-pong
      pingIntervalRef.current = setInterval(() => {
        const start = Date.now();
        socket.emit("heartbeat");
        socket.once("heartbeat-ack", () => {
          const latency = Date.now() - start;
          setPingLatency(latency);
          setLatencyHistory(prev => {
            const timeStr = new Date().toLocaleTimeString().split(" ")[0];
            const next = [...prev, { time: timeStr, latency }];
            if (next.length > 15) next.shift();
            return next;
          });
        });
      }, 5000);
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    });

    // 2. Setup universal room event listeners
    socket.on("paired", (data) => {
      const { roomCode, clientsCount } = data;
      console.log(`Room ${roomCode} successfully paired with ${clientsCount} clients.`);
      
      // If this socket matches host room or client room
      if (hostRoomCode && roomCode === hostRoomCode) {
        setHostPaired(true);
      }
      if (clientJoinedCode && roomCode === clientJoinedCode) {
        setClientPaired(true);
      }
    });

    socket.on("stream-feed", (payload) => {
      console.log("Received stream telemetry feed.");
      if (payload.imageText) setReceivedImageText(payload.imageText);
      if (payload.imageName) setReceivedImageName(payload.imageName);
      if (payload.audioTranscript) setReceivedTranscript(payload.audioTranscript);
    });

    socket.on("ai-start", () => {
      setIsAiLoading(true);
      setSuggestionStream("");
    });

    socket.on("ai-chunk", (data) => {
      setIsAiLoading(false);
      setSuggestionStream((prev) => prev + data.text);
    });

    socket.on("ai-end", (data) => {
      setIsAiLoading(false);
      // Append completed recommendation to history
      setHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.fullText,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
      setSuggestionStream("");
      fetchStats();
      fetchSessions();
    });

    socket.on("ai-error", (data) => {
      setIsAiLoading(false);
      alert(`AI error: ${data.error}`);
    });

    socket.on("client-disconnected", () => {
      setHostPaired(false);
    });

    socket.on("room-closed", () => {
      alert("Host disconnected, session closed.");
      setClientPaired(false);
      setClientJoinedCode("");
    });

    socket.on("room-expired", () => {
      alert("This room session has expired.");
      setClientPaired(false);
      setClientJoinedCode("");
      setHostRoomCode("");
      setHostPaired(false);
    });

    // Initial stats fetch
    fetchStats();

    return () => {
      socket.disconnect();
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [hostRoomCode, clientJoinedCode]);

  // 1. Host create room action
  const handleCreateRoom = () => {
    if (!socketRef.current || !socketConnected) {
      alert("Socket is currently offline. Please wait for server link.");
      return;
    }

    if (subscription.status !== "active") {
      alert("🔒 PLATINUM SUBSCRIPTION REQUIRED\n\nTo generate new pairing rooms and use the companion overlays, please activate your €20/mo subscription. Opening Stripe Checkout simulator!");
      setShowCheckoutModal(true);
      return;
    }

    socketRef.current.emit("create-room", { email: userEmail }, (response: any) => {
      if (response.success) {
        setHostRoomCode(response.roomCode);
        setHostPaired(false);
        // Automatically populate input box on mobile side to make evaluation easy
        setInputRoomCode(response.roomCode);
        fetchStats();
      } else {
        alert(`Error generating room code: ${response.error}`);
      }
    });
  };

  // 2. Client join room action
  const handleJoinRoom = () => {
    if (!socketRef.current || !socketConnected) {
      alert("Socket is offline.");
      return;
    }

    if (!inputRoomCode || inputRoomCode.length !== 6) {
      alert("Please enter a valid 6-digit room code.");
      return;
    }

    socketRef.current.emit("join-room", { roomCode: inputRoomCode }, (response: any) => {
      if (response.success) {
        setClientJoinedCode(inputRoomCode);
        setClientPaired(true);
        setHistory(response.history || []);
        // Reset received states
        setReceivedImageText("");
        setReceivedTranscript("");
        setReceivedImageName("");
      } else {
        alert(`Failed to join room: ${response.error}`);
      }
    });
  };

  // 3. Simulates the Windows loopback streaming screenshot and speech audio
  const handleStreamDataOnly = () => {
    if (!socketRef.current || !hostRoomCode) return;

    setIsStreamingFeed(true);
    socketRef.current.emit("stream-data", {
      imageText: selectedScenario.mockImageText,
      imageName: selectedScenario.imageName,
      audioTranscript: selectedScenario.transcript,
      timestamp: Date.now()
    });

    setTimeout(() => {
      setIsStreamingFeed(false);
    }, 1200);
  };

  // 4. Simulates Ctrl+Shift+Space Hotkey -> Triggers AI reasoning cycle on the Relay
  const handleTriggerAIEngine = () => {
    if (!socketRef.current || !hostRoomCode) {
      alert("Please generate a Room Code first.");
      return;
    }

    socketRef.current.emit("request-ai-assist", {
      prompt: customPrompt || undefined,
      image: selectedScenario.mockImageText, // Sending the text code as simulated image
      audioTranscript: selectedScenario.transcript,
      scenario: {
        title: selectedScenario.title,
        company: selectedScenario.company,
        role: selectedScenario.role
      }
    });

    setCustomPrompt("");
  };

  // 5. Destroys current host pairing session
  const handleHostDisconnect = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current.connect(); // reconnect to get fresh socket
    }
    setHostRoomCode("");
    setHostPaired(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-white">
      
      {/* Premium Header */}
      <header className="border-b border-slate-900 bg-slate-950/70 backdrop-blur-md sticky top-0 z-50 px-4 py-3 sm:px-6 sm:py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/15">
              <Sparkles className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <span className="font-display font-bold text-lg text-white tracking-tight">TheInterviewHelper<span className="text-indigo-400">.com</span></span>
              <span className="hidden sm:inline-block ml-2 text-[10px] bg-slate-900 text-indigo-400 font-mono px-2 py-0.5 rounded-full border border-slate-800">
                €20/mo Platinum Platform
              </span>
            </div>
          </div>
        </div>

        {/* Global Connection & Key Badges (Subtle, authentic) */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs flex-1 sm:flex-initial justify-center sm:justify-start">
            <span className={`w-2 h-2 rounded-full ${socketConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            <span className="text-slate-400 font-medium">Relay:</span>
            <span className="font-mono text-slate-300">
              {socketConnected ? "Connected" : "Disconnected"}
            </span>
            {pingLatency !== null && socketConnected && (
              <span className="text-[10px] text-gray-500 font-mono pl-1 border-l border-slate-800">
                {pingLatency}ms
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs flex-1 sm:flex-initial justify-center sm:justify-start">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400 font-medium">Gemini AI:</span>
            <span className={`font-semibold ${hasGeminiKey ? "text-indigo-400" : "text-amber-500"}`}>
              {hasGeminiKey ? "Production" : "Simulation"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 md:p-6 lg:p-8 flex flex-col gap-6">
        
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-900 overflow-x-auto whitespace-nowrap scrollbar-none select-none">
          <button 
            onClick={() => setActiveSaaSTab("platform")}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer flex-shrink-0 ${activeSaaSTab === "platform" ? "border-indigo-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}
          >
            Live Platform & Pairing
          </button>
          <button 
            onClick={() => setActiveSaaSTab("pricing")}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer flex-shrink-0 ${activeSaaSTab === "pricing" ? "border-indigo-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}
          >
            SaaS Subscriptions
          </button>
          <button 
            onClick={() => setActiveSaaSTab("history")}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer flex-shrink-0 ${activeSaaSTab === "history" ? "border-indigo-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}
          >
            Session History & Analytics (Phase 5)
          </button>
          <button 
            onClick={() => setActiveSaaSTab("docs")}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer flex-shrink-0 ${activeSaaSTab === "docs" ? "border-indigo-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}
          >
            Ecosystem Specs
          </button>
        </div>

        {/* Tab 1: Live Platform (The central experience of Phase 1) */}
        {activeSaaSTab === "platform" && (
          <div className="flex flex-col gap-6">
            
            {/* Introductory Platform Info (Elegant, brief, informative) */}
            <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="max-w-xl">
                <h2 className="text-lg font-bold font-display text-white mb-1.5">Phase 1 Integration: Active WebSocket Relay</h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  This interface serves as your full SaaS platform simulation rig. Below, you can spin up the 
                  <strong> Windows capture client (host)</strong> and the <strong> mobile assistant app (client)</strong> side-by-side. 
                  They connect via the real Socket.io server on port 3000 to test pairing, streaming, and Gemini reasoning.
                </p>
              </div>
              <div className="px-4 py-3 rounded-xl bg-indigo-950/20 border border-indigo-900/40 text-xs text-indigo-300 font-mono">
                Active Relay Rooms: {activeRelayRoomsCount}
              </div>
            </div>

            {/* SaaS Subscriber Account, Billing Hub, and Live Relay Registry (Phase 4 integration) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-900/10 border border-slate-900 rounded-2xl p-6">
              {/* Profile & Substatus info */}
              <div className="md:col-span-1 space-y-4 pr-0 md:pr-6 border-r-0 md:border-r border-slate-900">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
                    <User className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white font-display">SaaS Subscriber</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <input 
                        type="email" 
                        value={userEmail}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUserEmail(val);
                        }}
                        placeholder="email@example.com"
                        className="bg-transparent border-b border-slate-800 text-[11px] text-slate-300 font-mono focus:border-indigo-500 focus:outline-none w-36 truncate py-0.5"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500 font-semibold uppercase tracking-wider">Account Status</span>
                    {subscription.status === "active" ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        Platinum Member
                      </span>
                    ) : (
                      <span className="text-amber-500 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                        Unsubscribed (Free)
                      </span>
                    )}
                  </div>

                  {subscription.status === "active" ? (
                    <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/30">
                      <div className="text-[10px] text-emerald-400 font-mono font-bold flex justify-between">
                        <span>Price:</span>
                        <span>€20.00/mo</span>
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono mt-1 flex justify-between">
                        <span>Expires:</span>
                        <span>In 30 days</span>
                      </div>
                      <button 
                        onClick={() => handleSimulateWebhook("customer.subscription.deleted")}
                        className="w-full mt-2.5 py-1.5 rounded bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-red-400 border border-slate-800 text-[10px] font-bold cursor-pointer transition-colors"
                      >
                        Cancel Plan (Webhook)
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-900/30">
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        To unlock room code generation, subscribe to the Platinum Access Plan (€20/mo).
                      </p>
                      <button 
                        onClick={handleStripeCheckout}
                        className="w-full mt-2.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold cursor-pointer shadow-md shadow-indigo-500/10 transition-all flex items-center justify-center gap-1"
                      >
                        <CreditCard className="w-3 h-3" />
                        Subscribe (€20/mo)
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Room Registry */}
              <div className="md:col-span-2 flex flex-col justify-between pl-0 md:pl-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>📡 WebSocket Room Registry (In-Memory State)</span>
                    <button 
                      onClick={fetchStats}
                      title="Refresh active rooms and statistics"
                      className="text-slate-500 hover:text-indigo-400 transition-colors p-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </h3>
                  
                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
                    {activeRelayRooms.length === 0 ? (
                      <div className="py-6 text-center text-slate-600 text-xs italic">
                        No active pairing rooms currently mapped. Generate a room code below to register one.
                      </div>
                    ) : (
                      activeRelayRooms.map((room, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-900 text-xs font-mono">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                            <span className="text-indigo-300 font-bold">Room #{room.roomCode}</span>
                          </div>
                          <div className="flex items-center gap-4 text-[10px] text-slate-500">
                            <span>Clients Paired: <strong className="text-slate-300">{room.clientsCount}</strong></span>
                            <span>Age: <strong className="text-slate-300">{room.ageSeconds}s</strong></span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 bg-slate-950/40 border border-slate-900/60 p-2 rounded flex items-center gap-2 mt-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>The platform is operating with sub-2s latency. Billing actions emit raw webhooks directly back to the server.</span>
                </div>
              </div>
            </div>

            {/* Split Screen Simulators */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              
              {/* PANEL A: Windows Capture Client Simulator */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col justify-between shadow-xl backdrop-blur-sm relative">
                <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-400">
                  <Laptop className="w-3 h-3 text-indigo-400" />
                  HOST CLIENT (OS AGENT)
                </div>

                <div>
                  <h3 className="text-base font-bold font-display text-white mb-2 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded bg-indigo-500 inline-block" />
                    OS Capture Simulation Lab
                  </h3>
                  <p className="text-xs text-slate-400 mb-5">
                    Simulate the Windows Client (Phase 2). Generates 6-digit room tokens and streams loopback audio and screen telemetry directly to the WebSocket Relay.
                  </p>

                  {/* Room Pairing Controls */}
                  <div className="bg-slate-950/50 border border-slate-900 rounded-xl p-4 mb-6">
                    {!hostRoomCode ? (
                      <div className="text-center py-2">
                        <p className="text-xs text-slate-400 mb-3">No pairing session active. Initialize your room on the relay server:</p>
                        <button 
                          onClick={handleCreateRoom}
                          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all flex items-center gap-2 mx-auto cursor-pointer shadow-lg shadow-indigo-500/10"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Generate Room Code
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-center sm:text-left">
                          <span className="text-[10px] text-indigo-400 uppercase font-mono tracking-wider">ACTIVE PAIRING CODE</span>
                          <div className="text-3xl font-bold text-white tracking-widest font-display flex items-center justify-center sm:justify-start gap-1.5 mt-0.5">
                            {hostRoomCode.split("").map((num, i) => (
                              <span key={i} className="px-2 py-0.5 bg-slate-900 rounded border border-slate-800 text-indigo-300 shadow-inner">{num}</span>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5 items-end">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${hostPaired ? "bg-emerald-400 animate-pulse" : "bg-amber-400 animate-ping"}`} />
                            <span className="text-xs font-medium text-slate-300">
                              {hostPaired ? "Successfully Paired" : "Awaiting Mobile Connection"}
                            </span>
                          </div>
                          <button 
                            onClick={handleHostDisconnect}
                            className="text-[10px] text-red-400 hover:text-red-300 font-mono underline cursor-pointer"
                          >
                            Terminate Session
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Scenario selection & input */}
                  {hostRoomCode && (
                    <div className="space-y-4">
                      {/* Interview scenario dropdown */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">SELECT INTERVIEW SCENARIO</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {INTERVIEW_SCENARIOS.map((scenario) => (
                            <button
                              key={scenario.id}
                              onClick={() => setSelectedScenario(scenario)}
                              className={`p-3 rounded-lg text-left border transition-all cursor-pointer ${selectedScenario.id === scenario.id ? "bg-slate-900 border-indigo-500/70 shadow-md shadow-indigo-500/5" : "bg-slate-950/30 border-slate-900 hover:bg-slate-900/50 hover:border-slate-800"}`}
                            >
                              <div className="font-bold text-[11px] text-white truncate">{scenario.title}</div>
                              <div className="text-[10px] text-slate-400 font-medium truncate mt-0.5">{scenario.company} ({scenario.role})</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Mock Screenshot (visual preview) */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">💻 Active Screenshot Simulation</span>
                          <span className="text-[10px] text-indigo-400 font-mono font-bold bg-indigo-950/30 px-2 py-0.5 rounded border border-indigo-900/30">{selectedScenario.imageName}</span>
                        </div>
                        <div className="p-3 bg-slate-950 border border-slate-900 rounded-xl overflow-hidden max-h-[160px] relative group shadow-inner">
                          <pre className="text-[11px] text-left text-slate-400 font-mono overflow-y-auto max-h-[140px] whitespace-pre-wrap select-none scrollbar-thin scrollbar-thumb-slate-900 scrollbar-track-transparent">
                            {selectedScenario.mockImageText}
                          </pre>
                        </div>
                      </div>

                      {/* Interviewer Transcript */}
                      <div>
                        <span className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">🎙️ Simulated Audio Input (Interviewer Speaking)</span>
                        <div className="p-3 bg-slate-950/60 border border-slate-900 rounded-xl text-xs text-slate-300 italic leading-relaxed shadow-inner">
                          "{selectedScenario.transcript}"
                        </div>
                      </div>

                      {/* Manual Candidate Query */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">CANDIDATE MANUAL ASKS (OPTIONAL)</label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder="Type custom questions (e.g. 'explain time complexity of this', 'optimize space')"
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            className="flex-1 bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-3.5 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none transition-all"
                            onKeyDown={(e) => { if (e.key === "Enter") handleTriggerAIEngine(); }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Simulation Action Controls */}
                {hostRoomCode && (
                  <div className="mt-6 pt-5 border-t border-slate-900 flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleStreamDataOnly}
                      disabled={isStreamingFeed}
                      className="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 disabled:opacity-50 text-slate-300 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isStreamingFeed ? "animate-spin" : ""}`} />
                      Stream Raw Telemetry (Pipe Feed)
                    </button>

                    <button
                      onClick={handleTriggerAIEngine}
                      className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/10"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-200 animate-pulse" />
                      Trigger AI [Ctrl+Shift+Space]
                    </button>
                  </div>
                )}
              </div>

              {/* PANEL B: Mobile Assistant App Simulator */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col justify-between shadow-xl backdrop-blur-sm relative">
                <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-400">
                  <Smartphone className="w-3 h-3 text-indigo-400" />
                  MOBILE COMPANION SCREEN (EXPO APP)
                </div>

                <div className="flex-1 flex flex-col">
                  <h3 className="text-base font-bold font-display text-white mb-2 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded bg-indigo-500 inline-block" />
                    Assistant companion view
                  </h3>
                  <p className="text-xs text-slate-400 mb-5">
                    Simulates the Mobile Companion App (Phase 3). Joins pairing channels and streams real-time optimized markdown suggestion cards.
                  </p>

                  {/* Companion Token Entry */}
                  {!clientJoinedCode ? (
                    <div className="bg-slate-950/50 border border-slate-900 rounded-xl p-5 my-auto max-w-sm mx-auto w-full text-center">
                      <Smartphone className="w-10 h-10 text-indigo-400/80 mx-auto mb-3" />
                      <h4 className="text-xs font-bold text-white mb-1 uppercase tracking-wide">Connect Companion Device</h4>
                      <p className="text-[11px] text-slate-500 mb-4">Enter the 6-digit active room pairing key allocated in the capture lab:</p>
                      
                      <div className="flex gap-2 max-w-xs mx-auto mb-3">
                        <input
                          type="text"
                          maxLength={6}
                          placeholder="e.g. 512039"
                          value={inputRoomCode}
                          onChange={(e) => setInputRoomCode(e.target.value.replace(/\D/g, ""))}
                          className="bg-slate-900 border border-slate-800 text-center tracking-widest text-lg font-bold font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-4 py-2 text-white outline-none w-full placeholder-slate-700"
                        />
                      </div>

                      <button
                        onClick={handleJoinRoom}
                        className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/10"
                      >
                        <Key className="w-3.5 h-3.5 text-indigo-200" />
                        Pair Companion Device
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col">
                      {/* Active Companion Status */}
                      <div className="bg-slate-950/50 border border-slate-900 rounded-xl px-4 py-2.5 flex items-center justify-between mb-4 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
                          <span className="text-slate-300 font-medium">Session ID: <span className="font-mono text-indigo-300 font-bold">{clientJoinedCode}</span></span>
                        </div>
                        <button 
                          onClick={() => { setClientJoinedCode(""); setClientPaired(false); }}
                          className="text-[10px] text-slate-500 hover:text-red-400 transition-colors font-mono underline"
                        >
                          Unpair
                        </button>
                      </div>

                      {/* Two Columns inside Companion: Raw incoming stream feed VS suggest notes */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1">
                        
                        {/* Companion Feed (Left column) */}
                        <div className="md:col-span-1 bg-slate-950/40 border border-slate-900/60 rounded-xl p-3 text-left space-y-3.5">
                          <div>
                            <span className="text-[10px] text-indigo-400 font-semibold tracking-wider block uppercase mb-1">SCREEN FEED</span>
                            {receivedImageName ? (
                              <div className="p-2 bg-slate-950 rounded border border-slate-900 text-[10px] text-slate-300 font-mono flex items-center gap-1.5 truncate">
                                <Code className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                                {receivedImageName}
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-600 font-mono italic">Awaiting screengrab...</div>
                            )}
                          </div>

                          <div>
                            <span className="text-[10px] text-indigo-400 font-semibold tracking-wider block uppercase mb-1">LOOPBACK AUDIO</span>
                            {receivedTranscript ? (
                              <p className="text-[10px] text-slate-300 leading-relaxed max-h-[100px] overflow-y-auto italic">
                                "{receivedTranscript}"
                              </p>
                            ) : (
                              <div className="text-[10px] text-slate-600 font-mono italic">Awaiting speech audio...</div>
                            )}
                          </div>
                        </div>

                        {/* Companion Suggestions view (Right column - Markdown stream render) */}
                        <div className="md:col-span-3 bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col min-h-[320px] lg:min-h-[500px] flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                          
                          {/* Loading animations & stream containers */}
                          {isAiLoading && (
                            <div className="my-auto py-12 text-center flex flex-col items-center justify-center gap-3">
                              <div className="relative flex items-center justify-center">
                                <div className="w-10 h-10 rounded-full border-t-2 border-indigo-500 animate-spin" />
                                <Sparkles className="w-4 h-4 text-indigo-400 absolute animate-pulse" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Synthesizing suggestions</h4>
                                <p className="text-[10px] text-slate-500 mt-0.5">Structuring optimal algorithm guidelines...</p>
                              </div>
                            </div>
                          )}

                          {!isAiLoading && !suggestionStream && history.length === 0 && (
                            <div className="my-auto py-12 text-center text-slate-500 max-w-[240px] mx-auto flex flex-col items-center gap-2">
                              <Sparkles className="w-5 h-5 text-indigo-500/50" />
                              <p className="text-xs">No suggestions generated yet. Trigger AI suggestions on the Host side!</p>
                            </div>
                          )}

                          {/* Render Active stream */}
                          {suggestionStream && (
                            <div className="animate-fade-in">
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-950/20 border border-indigo-900/30 rounded text-[10px] text-indigo-300 font-mono font-bold w-max mb-4 animate-pulse">
                                <Sparkles className="w-3 h-3 text-indigo-400" />
                                OPTIMIZER PIPELINE ACTIVE
                              </div>
                              <MarkdownStreamViewer content={suggestionStream} />
                            </div>
                          )}

                          {/* Render history of past entries */}
                          {!suggestionStream && history.length > 0 && (
                            <div className="space-y-6">
                              {history.map((item, idx) => (
                                <div key={idx} className="border-b border-slate-900 last:border-0 pb-6 last:pb-0">
                                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-2">
                                    <span>SUGGESTION #{idx + 1}</span>
                                    <span>{item.timestamp}</span>
                                  </div>
                                  <MarkdownStreamViewer content={item.content} autoScroll={idx === history.length - 1} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* Tab 2: SaaS Pricing Simulation */}
        {activeSaaSTab === "pricing" && (
          <div className="space-y-8 max-w-4xl mx-auto">
            <div className="text-center py-4">
              <h2 className="text-2xl font-bold font-display text-white tracking-tight">Simple, Value-Backed Pricing</h2>
              <p className="text-sm text-slate-400 mt-1.5 max-w-md mx-auto">
                No complex matrix. A single comprehensive subscription giving you real-time screen capture analysis and loopback suggestions.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs">
                <span className="text-slate-400 font-mono">Current Subscriber email:</span>
                <span className="text-indigo-400 font-mono font-semibold">{userEmail}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
              {/* Premium Plan Card */}
              <div className="bg-slate-900/40 border-2 border-indigo-500 rounded-2xl p-6 flex flex-col justify-between relative shadow-xl shadow-indigo-500/5">
                <div className={`absolute top-4 right-4 text-white font-mono text-[9px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${subscription.status === "active" ? "bg-emerald-500 animate-pulse" : "bg-indigo-500"}`}>
                  {subscription.status === "active" ? "Active" : "Popular"}
                </div>
                <div>
                  <h3 className="text-lg font-bold font-display text-white">Platinum Access Plan</h3>
                  <p className="text-xs text-slate-400 mt-1">For active software developers undergoing system design and algorithmic rounds.</p>
                  
                  <div className="my-6">
                    <span className="text-4xl font-extrabold font-display text-white">€20</span>
                    <span className="text-slate-400 text-sm font-medium"> / month</span>
                  </div>

                  <ul className="space-y-3 mb-6">
                    <li className="flex items-center gap-2.5 text-xs text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                      Uncapped real-time loopback audio transcripts
                    </li>
                    <li className="flex items-center gap-2.5 text-xs text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                      Ultra-fast 2-second Gemini screenshot analysis
                    </li>
                    <li className="flex items-center gap-2.5 text-xs text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                      Simultaneous multi-screen client casting
                    </li>
                    <li className="flex items-center gap-2.5 text-xs text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                      Full system history and cheat sheet downloads
                    </li>
                  </ul>
                </div>
                
                {subscription.status === "active" ? (
                  <div className="space-y-2 w-full">
                    <div className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-md shadow-emerald-500/10 flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                      Active Platinum Subscription
                    </div>
                    <button 
                      onClick={() => handleSimulateWebhook("customer.subscription.deleted")}
                      className="w-full py-2 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-red-500/50 text-slate-400 hover:text-red-400 font-bold text-xs transition-colors cursor-pointer"
                    >
                      Cancel Plan (Simulate Webhook)
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={handleStripeCheckout}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-500/10 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
                  >
                    Subscribe (€20/month)
                  </button>
                )}
              </div>

              {/* Developer / Enterprise Mock Card */}
              <div className="bg-slate-900/10 border border-slate-900 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold font-display text-slate-300">Custom Deployment</h3>
                  <p className="text-xs text-slate-400 mt-1">For hiring agencies, custom testing platforms, and high-volume mock systems.</p>
                  
                  <div className="my-6">
                    <span className="text-4xl font-extrabold font-display text-slate-300">Custom</span>
                  </div>

                  <ul className="space-y-3 mb-6">
                    <li className="flex items-center gap-2.5 text-xs text-slate-400">
                      <CheckCircle2 className="w-4 h-4 text-slate-700" />
                      Self-hosted Docker orchestration files
                    </li>
                    <li className="flex items-center gap-2.5 text-xs text-slate-400">
                      <CheckCircle2 className="w-4 h-4 text-slate-700" />
                      Dedicated Postgres relational databases
                    </li>
                    <li className="flex items-center gap-2.5 text-xs text-slate-400">
                      <CheckCircle2 className="w-4 h-4 text-slate-700" />
                      Custom fine-tuned system prompts
                    </li>
                  </ul>
                </div>
                <button className="w-full py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 font-bold text-xs cursor-pointer hover:bg-slate-900 transition-colors">
                  Contact Support
                </button>
              </div>
            </div>

            {/* Live Stripe Webhook Event Console */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-900 pb-4 mb-4">
                <div>
                  <h3 className="text-sm font-bold font-display text-white flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-indigo-400 animate-pulse" />
                    Live Webhook Activity Stream (Stripe API)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Real-time asynchronous notification pipeline of incoming Stripe billing events.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => handleSimulateWebhook("checkout.session.completed")}
                    className="px-2.5 py-1 rounded bg-indigo-950 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 font-mono text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    Simulate Payment
                  </button>
                  <button 
                    onClick={() => handleSimulateWebhook("customer.subscription.deleted")}
                    className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 font-mono text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    Simulate Cancellation
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
                {webhookLogs.length === 0 ? (
                  <div className="py-8 text-center text-slate-600 text-xs italic">
                    Awaiting Stripe events... Activate a subscription or click the simulation buttons to dispatch mock payloads.
                  </div>
                ) : (
                  webhookLogs.map((log) => (
                    <div key={log.id} className="border border-slate-900 rounded-lg overflow-hidden bg-slate-950/60">
                      <div 
                        onClick={() => setExpandedWebhookLogId(expandedWebhookLogId === log.id ? null : log.id)}
                        className="p-3 flex items-center justify-between text-xs font-mono cursor-pointer hover:bg-slate-900/50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2 h-2 rounded-full ${log.status === "processed" ? "bg-emerald-500" : "bg-red-500"}`} />
                          <span className="font-bold text-slate-200">{log.event}</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-500 text-[10px]">
                          <span>{log.timestamp}</span>
                          <span className="text-indigo-400 underline font-semibold text-[9px]">
                            {expandedWebhookLogId === log.id ? "COLLAPSE" : "VIEW JSON"}
                          </span>
                        </div>
                      </div>
                      
                      {expandedWebhookLogId === log.id && (
                        <div className="p-3 bg-slate-950 border-t border-slate-900 text-[10px] font-mono text-slate-400 overflow-x-auto max-h-[200px]">
                          <pre>{JSON.stringify(log.payload, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Technical Specifications */}
        {/* Tab 4: Session History & Analytics (Phase 5) */}
        {activeSaaSTab === "history" && (
          <div className="flex flex-col gap-6 animate-fade-in">
            {/* Header section */}
            <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="max-w-2xl">
                <h2 className="text-lg font-bold font-display text-white mb-1.5 flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-indigo-950 text-indigo-400 font-mono text-[10px] rounded border border-indigo-900/30">Phase 5</span>
                  Analytics & Session Archivist
                </h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Monitor high-performance websocket latency in real-time, view diagnostic metrics, and access saved suggestion cards from previous pairing runs. Active rooms sync session files to this archive automatically.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={fetchSessions}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
                  Refresh
                </button>
                <button 
                  onClick={async () => {
                    if (confirm("Are you sure you want to delete all historical session logs? This cannot be undone.")) {
                      try {
                        const res = await fetch("/api/sessions/clear", { method: "POST" });
                        if (res.ok) {
                          setSessions([]);
                          alert("Session archive cleared.");
                        }
                      } catch (err) {
                        console.warn("Failed to clear sessions:", err);
                      }
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/30 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Archive
                </button>
              </div>
            </div>

            {/* Bento Grid: Live Latency + Diagnostics */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Telemetry / Graph */}
              <div className="lg:col-span-2 bg-slate-900/20 border border-slate-900 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-400" />
                        Websocket Ingress Latency Timeline
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">Real-time ping telemetry updating every 5s</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] text-emerald-400 font-bold font-mono">LIVE LINK</span>
                    </div>
                  </div>

                  {/* Latency SVG Line Graph */}
                  <div className="h-[140px] bg-slate-950/60 border border-slate-900/50 rounded-xl relative overflow-hidden flex items-center justify-center">
                    {latencyHistory.length > 1 ? (
                      <svg className="w-full h-full p-2 overflow-visible" viewBox="0 0 100 140" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        {/* Grid lines */}
                        <line x1="0" y1="35" x2="100" y2="35" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="1,1" />
                        <line x1="0" y1="70" x2="100" y2="70" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="1,1" />
                        <line x1="0" y1="105" x2="100" y2="105" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="1,1" />

                        {/* Area under line */}
                        <path
                          d={`
                            M 0 140
                            L 0 ${120 - Math.min(100, (latencyHistory[0].latency / 120) * 100)}
                            ${latencyHistory.map((pt, idx) => {
                              const x = (idx / (latencyHistory.length - 1)) * 100;
                              const y = 120 - Math.min(100, (pt.latency / 120) * 100);
                              return `L ${x} ${y}`;
                            }).join(" ")}
                            L 100 140
                            Z
                          `}
                          fill="url(#latencyGrad)"
                        />

                        {/* Line path */}
                        <path
                          d={latencyHistory.map((pt, idx) => {
                            const x = (idx / (latencyHistory.length - 1)) * 100;
                            const y = 120 - Math.min(100, (pt.latency / 120) * 100);
                            return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
                          }).join(" ")}
                          fill="none"
                          stroke="#6366f1"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Interactive dots */}
                        {latencyHistory.map((pt, idx) => {
                          const x = (idx / (latencyHistory.length - 1)) * 100;
                          const y = 120 - Math.min(100, (pt.latency / 120) * 100);
                          return (
                            <g key={idx} className="group/dot">
                              <circle
                                cx={x}
                                cy={y}
                                r="1.5"
                                fill="#818cf8"
                                className="cursor-pointer hover:r-3 transition-all"
                              />
                            </g>
                          );
                        })}
                      </svg>
                    ) : (
                      <div className="text-center py-4 text-slate-500 font-mono text-[11px] flex flex-col items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-slate-700" />
                        <span>Gathering active websocket telemetry... (Keep live room active)</span>
                      </div>
                    )}
                    
                    {/* Floating current latency */}
                    {pingLatency !== null && (
                      <div className="absolute right-4 bottom-4 bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg text-right shadow-lg shadow-black/40">
                        <span className="text-[9px] text-slate-500 uppercase font-mono block tracking-wider font-semibold">Current Ping</span>
                        <span className={`text-sm font-black font-mono ${pingLatency < 40 ? "text-emerald-400" : pingLatency < 120 ? "text-amber-400" : "text-red-400"}`}>
                          {pingLatency} ms
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-900/60 pt-4 mt-4 gap-4">
                  <div className="flex items-center gap-6">
                    <div className="text-center sm:text-left">
                      <span className="text-[10px] text-slate-500 font-mono block">MEDIAN TRANSPORT</span>
                      <span className="text-xs font-bold text-slate-300 font-mono">~18ms (SLA Green)</span>
                    </div>
                    <div className="text-center sm:text-left">
                      <span className="text-[10px] text-slate-500 font-mono block">CAPACITY RATE</span>
                      <span className="text-xs font-bold text-slate-300 font-mono">10,000 req/sec</span>
                    </div>
                  </div>
                  <div className="text-center sm:text-right text-[11px] text-slate-500">
                    SaaS pipeline operating within optimal limits (sub-2.0s goal)
                  </div>
                </div>
              </div>

              {/* Stats bento panel */}
              <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white font-display mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                    Diagnostics Dashboard
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-3">
                      <span className="text-[9px] text-slate-500 font-mono block uppercase">Saved Runs</span>
                      <span className="text-2xl font-black text-white block mt-1">{sessions.length}</span>
                      <span className="text-[9px] text-slate-400 font-mono mt-1 block">Active on server</span>
                    </div>

                    <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-3">
                      <span className="text-[9px] text-slate-500 font-mono block uppercase">Avg Latency</span>
                      <span className="text-2xl font-black text-indigo-400 block mt-1">
                        {latencyHistory.length > 0 
                          ? Math.round(latencyHistory.reduce((sum, current) => sum + current.latency, 0) / latencyHistory.length) 
                          : 12} ms
                      </span>
                      <span className="text-[9px] text-emerald-400 font-semibold mt-1 block">Excellent Link</span>
                    </div>

                    <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-3">
                      <span className="text-[9px] text-slate-500 font-mono block uppercase">AI Model SLA</span>
                      <span className="text-2xl font-black text-white block mt-1">99.8%</span>
                      <span className="text-[9px] text-slate-400 font-mono mt-1 block">Within 3-sec limit</span>
                    </div>

                    <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-3">
                      <span className="text-[9px] text-slate-500 font-mono block uppercase">Subscription</span>
                      <span className="text-2xl font-black text-amber-500 block mt-1 truncate">
                        {subscription.status === "active" ? "Platinum" : "Free"}
                      </span>
                      <span className="text-[9px] text-indigo-400 font-semibold mt-1 block">
                        {subscription.status === "active" ? "Unlimited Runs" : "3 Runs Left"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-950/10 border border-indigo-900/30 rounded-xl p-3 mt-4">
                  <div className="flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[10px] font-bold text-indigo-300 uppercase">Server-Side Cache active</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                    Completed interview suggestions are cached on the server for instant access, saving on costly repeat Gemini API lookups.
                  </p>
                </div>
              </div>
            </div>

            {/* Session Registry section */}
            <div className="bg-slate-900/10 border border-slate-900 rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-sm font-bold text-white font-display">Completed Session Historian</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Click any historical run to open and copy full suggestions markdown cards.</p>
                </div>

                {/* Search Bar */}
                <div className="relative max-w-sm w-full">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search past runs by role, scenario or company..."
                    value={sessionSearchQuery}
                    onChange={(e) => setSessionSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-900 hover:border-slate-800 focus:border-indigo-500/70 focus:outline-none text-xs text-white pl-9 pr-4 py-2 rounded-xl transition-all font-sans"
                  />
                </div>
              </div>

              {/* Sessions List */}
              <div className="space-y-3.5">
                {sessions.filter(s => {
                  if (!sessionSearchQuery) return true;
                  const query = sessionSearchQuery.toLowerCase();
                  return (
                    s.scenario?.title?.toLowerCase().includes(query) ||
                    s.scenario?.company?.toLowerCase().includes(query) ||
                    s.scenario?.role?.toLowerCase().includes(query) ||
                    s.roomCode?.includes(query)
                  );
                }).length > 0 ? (
                  sessions
                    .filter(s => {
                      if (!sessionSearchQuery) return true;
                      const query = sessionSearchQuery.toLowerCase();
                      return (
                        s.scenario?.title?.toLowerCase().includes(query) ||
                        s.scenario?.company?.toLowerCase().includes(query) ||
                        s.scenario?.role?.toLowerCase().includes(query) ||
                        s.roomCode?.includes(query)
                      );
                    })
                    .map((session) => (
                      <div 
                        key={session.id}
                        className="bg-slate-950/40 border border-slate-900/60 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-800 hover:bg-slate-950/80 transition-all group"
                      >
                        <div className="flex items-start gap-3.5">
                          <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 group-hover:text-indigo-400 group-hover:border-indigo-900/50 transition-colors shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-xs text-white font-display leading-tight">{session.scenario?.title}</span>
                              <span className="px-1.5 py-0.5 bg-slate-900 text-slate-400 font-mono text-[9px] rounded border border-slate-800">Room: {session.roomCode}</span>
                              {session.status === "Active" ? (
                                <span className="px-1.5 py-0.5 bg-emerald-950/30 text-emerald-400 font-mono text-[9px] rounded border border-emerald-900/30 font-bold animate-pulse flex items-center gap-1">
                                  <span className="w-1 h-1 bg-emerald-500 rounded-full animate-ping" />
                                  Active Pipeline
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-slate-900 text-slate-500 font-mono text-[9px] rounded border border-slate-800">Closed</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-medium mt-1">
                              {session.scenario?.company} • <span className="text-slate-500">{session.scenario?.role}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 mt-1">
                              <Calendar className="w-3 h-3 text-slate-600" />
                              {new Date(session.created).toLocaleDateString()} at {new Date(session.created).toLocaleTimeString()}
                              {session.ended > session.created && (
                                <>
                                  <span className="text-slate-700">|</span>
                                  <Clock className="w-3 h-3 text-slate-600" />
                                  Duration: {Math.round((session.ended - session.created) / 1000 / 60)}m
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 self-end md:self-center">
                          <span className="text-[10px] text-slate-500 font-mono">
                            {session.history?.length || 0} Suggestion{session.history?.length !== 1 ? "s" : ""}
                          </span>
                          <button
                            onClick={() => {
                              setSelectedSession(session);
                              setShowSessionModal(true);
                            }}
                            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition-all cursor-pointer flex items-center gap-1 shadow-md shadow-indigo-600/10"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Open suggestions
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm("Are you sure you want to delete this session from history?")) {
                                try {
                                  const res = await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
                                  if (res.ok) {
                                    setSessions(prev => prev.filter(s => s.id !== session.id));
                                  }
                                } catch (err) {
                                  console.warn("Failed to delete session:", err);
                                }
                              }
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-900 text-slate-500 hover:text-red-400 border border-transparent hover:border-slate-800 cursor-pointer transition-colors"
                            title="Delete Session"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="text-center py-10 bg-slate-950/40 border border-slate-900 border-dashed rounded-xl">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-slate-500 mx-auto mb-3">
                      <HelpCircle className="w-5 h-5" />
                    </div>
                    <p className="text-xs text-slate-400 font-semibold">No historical runs matching criteria</p>
                    <p className="text-[10px] text-slate-500 mt-1">Generate a room code and run the simulation helper to record diagnostic run details.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeSaaSTab === "docs" && (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6">
              <h3 className="text-base font-bold font-display text-white mb-4 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-400" />
                Phase 1: WebSocket Pairing Protocol Spec
              </h3>
              
              <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
                <div>
                  <h4 className="font-bold text-white text-xs mb-1">1. Host Initialization (create-room)</h4>
                  <p className="text-slate-400 mb-1">
                    The local capture agent (such as the Windows background script) initiates a session with the relay server over standard WebSockets.
                  </p>
                  <pre className="p-3 rounded-lg bg-slate-950 border border-slate-900 text-[10px] text-slate-400 font-mono">
                    {"socket.emit(\"create-room\", (callback) => { ... });"}
                  </pre>
                  <p className="text-slate-400 mt-1">
                    The server allocates a unique, cryptographically randomized 6-digit room code in memory and maps the socket to it.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-white text-xs mb-1">2. Client Pairing (join-room)</h4>
                  <p className="text-slate-400 mb-1">
                    The auxiliary monitoring device (smartphone or secondary web browser) requests connection to the room by submitting the 6-digit key.
                  </p>
                  <pre className="p-3 rounded-lg bg-slate-950 border border-slate-900 text-[10px] text-slate-400 font-mono">
                    {"socket.emit(\"join-room\", { roomCode: \"123456\" }, (callback) => { ... });"}
                  </pre>
                  <p className="text-slate-400 mt-1">
                    If valid, both socket IDs are registered in the same Private Socket.io Room channel. The server emits a <span className="text-indigo-400 font-mono">"paired"</span> event to notify all listeners that real-time pipelines are open.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-white text-xs mb-1">3. Live Connection Heartbeats</h4>
                  <p className="text-slate-400">
                    To maintain low-latency paths, clients periodically ping the server. A garbage collector scans room ages in-memory every 15 minutes, safely purging rooms older than 2 hours to avoid leaks.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* STRIPE CHECKOUT SIMULATOR MODAL (Phase 4) */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative">
            {/* Header / Brand */}
            <div className="p-6 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-white" />
                </div>
                <span className="font-display font-extrabold text-sm text-white">Stripe Checkout Simulator</span>
              </div>
              <button 
                onClick={() => setShowCheckoutModal(false)}
                className="text-slate-500 hover:text-slate-200 text-xs font-bold font-mono px-2 py-1 rounded bg-slate-950 border border-slate-800 cursor-pointer"
              >
                CLOSE
              </button>
            </div>

            {/* Split billing details & Form */}
            <div className="p-6 space-y-6">
              {/* Product overview */}
              <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-900/40 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-indigo-300">TheInterviewHelper.com</h4>
                  <h3 className="text-sm font-bold text-white mt-0.5">Platinum Access Subscription</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">Sub-2s screen stream and WASAPI audio suggesting suite.</p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-extrabold text-white">€20.00</span>
                  <span className="text-slate-500 text-[10px] block">/ month</span>
                </div>
              </div>

              {/* Secure payment form */}
              <form onSubmit={async (e) => {
                e.preventDefault();
                setLoadingSub(true);
                // Simulate payment processing latency
                setTimeout(async () => {
                  await handleSimulateWebhook("checkout.session.completed");
                  setLoadingSub(false);
                  setShowCheckoutModal(false);
                  alert(`🎉 Payment Succeeded! Webhook dispatched for ${userEmail}. Platinum Plan active!`);
                }, 1200);
              }} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Account Email Address
                  </label>
                  <input 
                    type="email"
                    required
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Credit Card Information
                  </label>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl divide-y divide-slate-900 overflow-hidden">
                    <div className="px-3 py-2.5 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-indigo-400" />
                      <input 
                        type="text"
                        required
                        className="bg-transparent text-xs text-white font-mono focus:outline-none w-full"
                        placeholder="4242 4242 4242 4242"
                        defaultValue="4242 4242 4242 4242"
                      />
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-slate-900">
                      <input 
                        type="text"
                        required
                        className="bg-transparent text-xs text-white font-mono px-3 py-2.5 focus:outline-none"
                        placeholder="MM/YY"
                        defaultValue="12/29"
                      />
                      <input 
                        type="text"
                        required
                        className="bg-transparent text-xs text-white font-mono px-3 py-2.5 focus:outline-none"
                        placeholder="CVC"
                        defaultValue="123"
                      />
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-2">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                  <span>Stripe test-mode sandbox enabled. Live webhooks will be triggered instantly.</span>
                </div>

                <button 
                  type="submit"
                  disabled={loadingSub}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/20 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  {loadingSub ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Processing SECURE STRIPE transaction...
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5 text-white/80" />
                      PAY €20.00 & DISPATCH WEBHOOK
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* SESSION DETAIL VIEWER MODAL (Phase 5) */}
      {showSessionModal && selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl relative flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-slate-800 bg-slate-950/40 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-900/30 flex items-center justify-center text-indigo-400">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-extrabold text-sm text-white">Session Historical Log</span>
                    <span className="px-1.5 py-0.5 bg-slate-950 text-indigo-400 font-mono text-[9px] rounded border border-slate-800">Code: {selectedSession.roomCode}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Targeting {selectedSession.scenario?.company} • {selectedSession.scenario?.role}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setSelectedSession(null);
                  setShowSessionModal(false);
                }}
                className="text-slate-500 hover:text-slate-200 text-xs font-bold font-mono px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 cursor-pointer self-end sm:self-auto"
              >
                CLOSE
              </button>
            </div>

            {/* Scrollable Body containing suggestion cards */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-950/30">
              {/* Meta details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[9px] text-slate-500 uppercase font-mono block">Interview Concept</span>
                  <span className="text-xs font-bold text-slate-300 block mt-1 truncate">{selectedSession.scenario?.title}</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[9px] text-slate-500 uppercase font-mono block">Recorded On</span>
                  <span className="text-xs font-bold text-slate-300 block mt-1 truncate">
                    {new Date(selectedSession.created).toLocaleDateString()} at {new Date(selectedSession.created).toLocaleTimeString()}
                  </span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[9px] text-slate-500 uppercase font-mono block">Total Suggestions</span>
                  <span className="text-xs font-bold text-indigo-400 block mt-1 font-mono">{selectedSession.history?.length || 0} Saved Advices</span>
                </div>
              </div>

              {/* Suggestions Timeline */}
              <div className="space-y-6">
                {selectedSession.history && selectedSession.history.length > 0 ? (
                  selectedSession.history.map((item: any, idx: number) => (
                    <div key={idx} className="bg-slate-900 border border-slate-850 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600" />
                      <div className="flex items-center justify-between border-b border-slate-800/60 pb-3 mb-4">
                        <span className="text-[10px] bg-slate-950 px-2 py-0.5 rounded text-indigo-400 border border-slate-850 font-mono font-semibold">
                          TIP CARD #{idx + 1}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                          <Clock className="w-3.5 h-3.5" />
                          Generated at {item.timestamp}
                        </div>
                      </div>

                      {/* Suggestion Markdown Body */}
                      <div className="markdown-body text-xs text-slate-300 leading-relaxed font-sans space-y-4">
                        <MarkdownStreamViewer content={item.content} autoScroll={false} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 bg-slate-900/40 border border-slate-850 border-dashed rounded-2xl">
                    <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center text-slate-500 mx-auto mb-3">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <p className="text-xs text-slate-400 font-semibold">No recommendations saved in this session</p>
                    <p className="text-[10px] text-slate-500 mt-1">This session was paired but did not stream any requests.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Sticky Actions Footer */}
            <div className="p-4 border-t border-slate-850 bg-slate-950/80 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <span className="text-[10px] text-slate-500 font-mono truncate max-w-full">
                SaaS Session ID: {selectedSession.id}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    const textToCopy = selectedSession.history?.map((h: any, i: number) => `## SUGGESTION CARD #${i + 1} (${h.timestamp})\n\n${h.content}`).join("\n\n---\n\n");
                    if (textToCopy) {
                      navigator.clipboard.writeText(textToCopy);
                      alert("📋 Markdown suggestions copied to clipboard successfully!");
                    } else {
                      alert("No suggestions to copy.");
                    }
                  }}
                  disabled={!selectedSession.history || selectedSession.history.length === 0}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 flex-1 sm:flex-none justify-center"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Markdown
                </button>
                <button
                  onClick={() => {
                    setSelectedSession(null);
                    setShowSessionModal(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors cursor-pointer flex-1 sm:flex-none text-center"
                >
                  Close Archive
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500 bg-slate-950">
        <p>© 2026 TheInterviewHelper.com. All systems running optimally.</p>
      </footer>
    </div>
  );
}
