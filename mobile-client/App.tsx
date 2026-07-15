import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StatusBar,
  Alert,
  Image,
  Switch,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
import { useKeepAwake } from "expo-keep-awake";
import { io, Socket } from "socket.io-client";
import { InterviewProfileForm, InterviewProfile } from "./components/InterviewProfileForm";
import { useVoiceListener } from "./hooks/useVoiceListener";

const DEFAULT_SERVER_URL = "https://theinterviewhelpercom-production.up.railway.app";
const STORAGE_KEYS = {
  server: "tih_mobile_server_url",
  email: "tih_mobile_email",
  profile: "tih_interview_profile",
  autoAnalyze: "tih_auto_analyze",
  autoAnswerVoice: "tih_auto_answer_voice",
  voiceListen: "tih_voice_listen",
};

const EMPTY_PROFILE: InterviewProfile = {
  targetPosition: "",
  company: "",
  jobDescription: "",
  userCv: "",
  specialInstructions: "",
};

type HistoryItem = { role: string; content: string; timestamp: string };
type SubscriptionStatus = { status: "active" | "canceled" | "none"; email: string; currentPeriodEnd: number };

export default function App() {
  useKeepAwake();

  const socketRef = useRef<Socket | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const pendingImageRef = useRef<string | null>(null);

  // Refs mirror mutable state so long-lived socket handlers (registered once per
  // session) always read the latest values instead of a stale closure snapshot.
  const roomCodeRef = useRef("");
  const sessionPausedRef = useRef(false);
  const autoAnalyzeRef = useRef(true);
  const autoAnswerVoiceRef = useRef(true);
  const profileRef = useRef<InterviewProfile>(EMPTY_PROFILE);
  const liveTranscriptRef = useRef("");
  const isSessionActiveRef = useRef(false);
  const windowsConnectedRef = useRef(false);

  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [email, setEmail] = useState("");
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [checkingSub, setCheckingSub] = useState(false);

  const [profile, setProfile] = useState<InterviewProfile>(EMPTY_PROFILE);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [autoAnswerVoice, setAutoAnswerVoice] = useState(true);
  const [voiceListenEnabled, setVoiceListenEnabled] = useState(true);

  const [roomCode, setRoomCode] = useState("");
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [windowsConnected, setWindowsConnected] = useState(false);
  const [sessionPaused, setSessionPaused] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");

  const [activeTab, setActiveTab] = useState<"setup" | "live">("setup");
  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState("");

  const [suggestionStream, setSuggestionStream] = useState("");
  const [isAiStreaming, setIsAiStreaming] = useState(false);
  const [aiError, setAiError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => { sessionPausedRef.current = sessionPaused; }, [sessionPaused]);
  useEffect(() => { autoAnalyzeRef.current = autoAnalyze; }, [autoAnalyze]);
  useEffect(() => { autoAnswerVoiceRef.current = autoAnswerVoice; }, [autoAnswerVoice]);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { liveTranscriptRef.current = liveTranscript; }, [liveTranscript]);
  useEffect(() => { isSessionActiveRef.current = isSessionActive; }, [isSessionActive]);
  useEffect(() => { windowsConnectedRef.current = windowsConnected; }, [windowsConnected]);

  const scrollToLatest = useCallback(() => {
    requestAnimationFrame(() => scrollViewRef.current?.scrollToEnd({ animated: true }));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [savedUrl, savedEmail, savedProfile, savedAuto, savedVoice, savedListen] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.server),
          AsyncStorage.getItem(STORAGE_KEYS.email),
          AsyncStorage.getItem(STORAGE_KEYS.profile),
          AsyncStorage.getItem(STORAGE_KEYS.autoAnalyze),
          AsyncStorage.getItem(STORAGE_KEYS.autoAnswerVoice),
          AsyncStorage.getItem(STORAGE_KEYS.voiceListen),
        ]);
        if (savedUrl?.trim()) setServerUrl(savedUrl.trim());
        if (savedEmail?.trim()) setEmail(savedEmail.trim());
        if (savedProfile) {
          const parsed = JSON.parse(savedProfile);
          setProfile({ ...EMPTY_PROFILE, ...parsed });
        }
        if (savedAuto === "0") setAutoAnalyze(false);
        if (savedVoice === "0") setAutoAnswerVoice(false);
        if (savedListen === "0") setVoiceListenEnabled(false);
      } finally {
        setPrefsLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    AsyncStorage.multiSet([
      [STORAGE_KEYS.server, serverUrl.trim()],
      [STORAGE_KEYS.email, email.trim()],
      [STORAGE_KEYS.profile, JSON.stringify(profile)],
      [STORAGE_KEYS.autoAnalyze, autoAnalyze ? "1" : "0"],
      [STORAGE_KEYS.autoAnswerVoice, autoAnswerVoice ? "1" : "0"],
      [STORAGE_KEYS.voiceListen, voiceListenEnabled ? "1" : "0"],
    ]).catch(() => {});
  }, [serverUrl, email, profile, autoAnalyze, autoAnswerVoice, voiceListenEnabled, prefsLoaded]);

  const fetchSubscription = async (targetEmail: string): Promise<SubscriptionStatus | null> => {
    try {
      const base = serverUrl.replace(/\/$/, "");
      const res = await fetch(`${base}/api/stripe/status?email=${encodeURIComponent(targetEmail)}`);
      const data = await res.json();
      if (data.success && typeof data.status === "string") {
        return {
          status: data.status,
          email: data.email || targetEmail,
          currentPeriodEnd: data.currentPeriodEnd || 0,
        };
      }
      if (typeof data.status === "string") {
        return data as SubscriptionStatus;
      }
    } catch {
      // ignore
    }
    return null;
  };

  const ensureSubscriptionActive = async (): Promise<boolean> => {
    const target = email.trim().toLowerCase();
    if (!target) {
      Alert.alert("Email required", "Enter the same email you used for payment.");
      return false;
    }
    setCheckingSub(true);
    try {
      const base = serverUrl.replace(/\/$/, "");
      const syncRes = await fetch(`${base}/api/stripe/sync-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const syncData = await syncRes.json();
      if (syncData.success && syncData.subscription) {
        setSubscription(syncData.subscription);
        return true;
      }

      const sub = await fetchSubscription(target);
      if (sub) setSubscription(sub);
      if (sub?.status === "active") return true;

      Alert.alert(
        "Subscription required",
        syncData.error ||
          "No active €20/month subscription found. Subscribe on the website, then tap Refresh from Stripe.",
        [{ text: "OK" }]
      );
      return false;
    } catch {
      Alert.alert("Error", "Could not reach billing server.");
      return false;
    } finally {
      setCheckingSub(false);
    }
  };

  const checkSubscription = async () => ensureSubscriptionActive();

  const syncSubscription = async () => {
    const target = email.trim().toLowerCase();
    if (!target) return;
    setCheckingSub(true);
    try {
      const base = serverUrl.replace(/\/$/, "");
      const res = await fetch(`${base}/api/stripe/sync-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const data = await res.json();
      if (data.success && data.subscription) {
        setSubscription(data.subscription);
        Alert.alert("Success", "Subscription synced from Stripe.");
      } else {
        Alert.alert("Not found", data.error || "No active subscription for this email.");
      }
    } catch {
      Alert.alert("Error", "Could not reach billing server.");
    } finally {
      setCheckingSub(false);
    }
  };

  const openSubscribePage = () => {
    const base = serverUrl.replace(/\/$/, "");
    Alert.alert("Subscribe", `Open ${base} in your browser and tap Subscribe (€20/month).`);
  };

  const teardownSocket = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.removeAllListeners();
    socket.disconnect();
    socketRef.current = null;
  }, []);

  useEffect(() => () => teardownSocket(), [teardownSocket]);

  const requestAiAssist = useCallback((image?: string | null, transcript?: string) => {
    if (sessionPausedRef.current) return;
    const socket = socketRef.current;
    if (!socket?.connected) return;
    const currentProfile = profileRef.current;
    if (!currentProfile.targetPosition.trim()) {
      Alert.alert("Profile required", "Set your target position before requesting AI answers.");
      setActiveTab("setup");
      return;
    }
    socket.emit("request-ai-assist", {
      image: image || undefined,
      audioTranscript: transcript || liveTranscriptRef.current || undefined,
      interviewProfile: currentProfile,
      prompt: "Provide a STAR-format interview answer tailored to this candidate. For coding questions include strategy and code.",
      timestamp: Date.now(),
    });
  }, []);

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      setLiveTranscript(text);
      if (autoAnswerVoiceRef.current && isSessionActiveRef.current && windowsConnectedRef.current && !sessionPausedRef.current) {
        requestAiAssist(pendingImageRef.current, text);
      }
    },
    [requestAiAssist]
  );

  const { isListening } = useVoiceListener({
    enabled:
      isSessionActive &&
      windowsConnected &&
      voiceListenEnabled &&
      !sessionPaused &&
      Boolean(email.trim()) &&
      Boolean(roomCode),
    email,
    roomCode,
    serverUrl,
    onTranscript: handleVoiceTranscript,
    onError: (msg) => setAiError(msg),
  });

  const registerSocketListeners = useCallback(
    (socket: Socket) => {
      const emailNorm = email.trim().toLowerCase();

      const handleCreateResponse = (response: any) => {
        setIsConnecting(false);
        if (response?.success) {
          roomCodeRef.current = response.roomCode;
          setRoomCode(response.roomCode);
          setIsSessionActive(true);
          setWindowsConnected(false);
          setSessionPaused(false);
          setActiveTab("setup");
          setHistory([]);
          setSuggestionStream("");
          setAiError("");
        } else {
          const msg = response?.error || "Could not start session.";
          setConnectionError(msg);
          if (response?.code === "SUBSCRIPTION_REQUIRED") {
            Alert.alert("Subscription required", msg, [
              { text: "Refresh", onPress: syncSubscription },
              { text: "OK" },
            ]);
          } else {
            Alert.alert("Session failed", msg);
          }
          teardownSocket();
        }
      };

      socket.on("connect", () => {
        setConnectionError("");
        setReconnecting(false);
        // On a RECONNECT, reclaim the same room code instead of minting a new one
        // (a new code would silently orphan the already-paired Windows client).
        if (roomCodeRef.current) {
          socket.emit("resume-room", { email: emailNorm, roomCode: roomCodeRef.current }, (response: any) => {
            setIsConnecting(false);
            if (response?.success) {
              setIsSessionActive(true);
              if (Array.isArray(response.history)) setHistory(response.history);
              if ((response.clientsCount || 0) >= 1) setWindowsConnected(true);
            } else {
              // Room expired during the drop — fall back to a fresh session.
              roomCodeRef.current = "";
              socket.emit("create-room", { email: emailNorm }, handleCreateResponse);
            }
          });
        } else {
          socket.emit("create-room", { email: emailNorm }, handleCreateResponse);
        }
      });

      socket.on("disconnect", () => {
        setIsConnecting(false);
        setIsAiStreaming(false);
        // Keep the session alive across transient drops so the connect handler
        // can resume the same room. Only tear down if there is no active room.
        if (roomCodeRef.current) {
          setReconnecting(true);
        } else {
          setIsSessionActive(false);
          setWindowsConnected(false);
        }
      });

      socket.on("paired", (data: { clientsCount?: number; roomCode?: string }) => {
        if ((data?.clientsCount || 0) >= 1) {
          setWindowsConnected(true);
          setSessionPaused(false);
          setActiveTab("live");
          setVoiceListenEnabled(true);
          setAutoAnswerVoice(true);
          setAiError("");
        }
      });

      socket.on("connect_error", (err: Error) => {
        setIsConnecting(false);
        setConnectionError(err.message || "Connection failed.");
      });

      socket.on("stream-feed", (payload: { image?: string; imageName?: string; imageText?: string; audioTranscript?: string }) => {
        if (sessionPausedRef.current) return;
        if (payload.imageName) setScreenshotName(payload.imageName);
        if (payload.audioTranscript) {
          setLiveTranscript(payload.audioTranscript);
          if (autoAnswerVoiceRef.current && !payload.image) {
            requestAiAssist(null, payload.audioTranscript);
          }
        }
        if (payload.image) {
          setScreenshotUri(payload.image);
          pendingImageRef.current = payload.image;
          if (autoAnalyzeRef.current) {
            requestAiAssist(payload.image, payload.audioTranscript || liveTranscriptRef.current);
          }
        }
      });

      // Host (this device) briefly lost connection server-side; keep the session
      // and show a reconnecting hint. The room is held during the grace window.
      socket.on("host-disconnected", () => {
        setReconnecting(true);
      });

      socket.on("ai-start", () => {
        setIsAiStreaming(true);
        setAiError("");
        setSuggestionStream("");
      });

      socket.on("ai-chunk", (data: { text?: string }) => {
        setIsAiStreaming(false);
        setSuggestionStream((prev) => prev + (data.text || ""));
      });

      socket.on("ai-end", (data: { fullText?: string }) => {
        setIsAiStreaming(false);
        const fullText = data.fullText || "";
        if (fullText.trim()) {
          setHistory((prev) => [
            ...prev,
            { role: "assistant", content: fullText, timestamp: new Date().toLocaleTimeString() },
          ]);
        }
        setSuggestionStream("");
      });

      socket.on("ai-error", (data: { error?: string; code?: string }) => {
        setIsAiStreaming(false);
        setSuggestionStream("");
        setAiError(data.error || "AI failed.");
        if (data.code === "SUBSCRIPTION_REQUIRED") {
          Alert.alert("Subscription expired", data.error || "Renew at /subscribe");
        }
      });

      socket.on("room-expired", () => {
        Alert.alert("Session expired", "Start a new session.");
        endSession();
      });
    },
    [email, requestAiAssist, teardownSocket]
  );

  const startSession = async () => {
    if (!(await ensureSubscriptionActive())) return;
    if (!profile.targetPosition.trim()) {
      Alert.alert("Profile", "Enter the position you are interviewing for.");
      setActiveTab("setup");
      return;
    }

    const mic = await Audio.requestPermissionsAsync();
    if (!mic.granted) {
      Alert.alert(
        "Microphone required",
        "Allow microphone access so the phone can hear interview questions from your laptop speakers."
      );
      return;
    }

    teardownSocket();
    roomCodeRef.current = "";
    setReconnecting(false);
    setIsConnecting(true);
    setConnectionError("");

    const socket = io(serverUrl.replace(/\/$/, ""), {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 8,
      timeout: 15000,
    });
    socketRef.current = socket;
    registerSocketListeners(socket);
  };

  const endSession = () => {
    teardownSocket();
    roomCodeRef.current = "";
    setReconnecting(false);
    setIsSessionActive(false);
    setWindowsConnected(false);
    setSessionPaused(false);
    setRoomCode("");
    setScreenshotUri(null);
    setSuggestionStream("");
    setHistory([]);
    setAiError("");
  };

  useEffect(() => {
    scrollToLatest();
  }, [suggestionStream, history, scrollToLatest]);

  const handleCopy = (text: string, index: number) => {
    Clipboard.setStringAsync(text).catch(() => {});
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const renderMarkdown = (markdownText: string, prefix: string) => {
    const blocks: Array<{ type: string; value: string; language?: string }> = [];
    let idx = 0;
    while (idx < markdownText.length) {
      const start = markdownText.indexOf("```", idx);
      if (start === -1) {
        blocks.push({ type: "text", value: markdownText.slice(idx) });
        break;
      }
      if (start > idx) blocks.push({ type: "text", value: markdownText.slice(idx, start) });
      const end = markdownText.indexOf("```", start + 3);
      if (end === -1) {
        blocks.push({ type: "code", value: markdownText.slice(start + 3), language: "" });
        break;
      }
      const inner = markdownText.slice(start + 3, end);
      const nl = inner.indexOf("\n");
      const lang = nl >= 0 ? inner.slice(0, nl).trim() : "";
      const code = nl >= 0 ? inner.slice(nl + 1) : inner;
      blocks.push({ type: "code", value: code, language: lang });
      idx = end + 3;
    }

    return blocks.map((block, bi) => {
      const key = `${prefix}-${bi}`;
      if (block.type === "code") {
        return (
          <View key={key} style={styles.codeBox}>
            <View style={styles.codeHeader}>
              <Text style={styles.codeLang}>{block.language?.toUpperCase() || "CODE"}</Text>
              <TouchableOpacity onPress={() => handleCopy(block.value, bi)}>
                <Text style={styles.copyText}>{copiedIndex === bi ? "Copied" : "Copy"}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal>
              <Text style={styles.codeText}>{block.value}</Text>
            </ScrollView>
          </View>
        );
      }
      return block.value.split("\n").map((line, li) => {
        const t = line.trim();
        if (!t) return <View key={`${key}-${li}`} style={{ height: 6 }} />;
        if (t.startsWith("### ") || t.startsWith("⭐"))
          return (
            <Text key={`${key}-${li}`} style={styles.h3}>
              {t.replace(/^###\s*/, "")}
            </Text>
          );
        if (t.startsWith("**Situation") || t.startsWith("**Task") || t.startsWith("**Action") || t.startsWith("**Result"))
          return (
            <Text key={`${key}-${li}`} style={styles.starLine}>
              {t.replace(/\*\*/g, "")}
            </Text>
          );
        if (t.startsWith("* ") || t.startsWith("- "))
          return (
            <Text key={`${key}-${li}`} style={styles.bullet}>
              • {t.slice(2)}
            </Text>
          );
        return (
          <Text key={`${key}-${li}`} style={styles.body}>
            {line}
          </Text>
        );
      });
    });
  };

  const subActive = subscription?.status === "active";

  const toggleSessionPause = () => {
    setSessionPaused((prev) => {
      const next = !prev;
      if (!next) setAiError("");
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#020617" />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Interview Helper</Text>
          <Text style={styles.headerSub}>
            {isSessionActive
              ? reconnecting
                ? `Room ${roomCode} · Reconnecting…`
                : windowsConnected
                  ? sessionPaused
                    ? `Room ${roomCode} · Paused`
                    : `Room ${roomCode} · Live`
                  : `Room ${roomCode} · Waiting for Windows`
              : subActive
                ? "Ready to start"
                : "Subscribe to pair"}
          </Text>
        </View>
        {isSessionActive && (
          <TouchableOpacity onPress={endSession} style={styles.endBtn}>
            <Text style={styles.endBtnText}>End</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity onPress={() => setActiveTab("setup")} style={[styles.tab, activeTab === "setup" && styles.tabActive]}>
          <Text style={styles.tabText}>Setup</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab("live")}
          style={[styles.tab, activeTab === "live" && styles.tabActive]}
          disabled={!isSessionActive || !windowsConnected}
        >
          <Text style={[styles.tabText, (!isSessionActive || !windowsConnected) && styles.tabDisabled]}>Live answers</Text>
        </TouchableOpacity>
      </View>

      {activeTab === "setup" ? (
        <ScrollView contentContainerStyle={styles.setupPad} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>BILLING EMAIL (same as payment)</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
            placeholderTextColor="#475569"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <View style={styles.row}>
            <TouchableOpacity onPress={checkSubscription} style={styles.secondaryBtn} disabled={checkingSub}>
              <Text style={styles.secondaryBtnText}>{checkingSub ? "…" : "Check subscription"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={syncSubscription} style={styles.secondaryBtn} disabled={checkingSub}>
              <Text style={styles.secondaryBtnText}>Refresh from Stripe</Text>
            </TouchableOpacity>
          </View>
          {!subActive && (
            <TouchableOpacity onPress={openSubscribePage} style={styles.subscribeBtn}>
              <Text style={styles.subscribeBtnText}>Subscribe — €20/month</Text>
            </TouchableOpacity>
          )}
          {subActive && (
            <Text style={styles.activeBadge}>✓ Subscription active for {subscription?.email}</Text>
          )}

          <InterviewProfileForm
            profile={profile}
            onChange={setProfile}
            liveTranscript={liveTranscript}
            onLiveTranscriptChange={setLiveTranscript}
          />

          <View style={styles.autoRow}>
            <Text style={styles.autoLabel}>Auto-analyze when Windows sends screenshot</Text>
            <Switch value={autoAnalyze} onValueChange={setAutoAnalyze} trackColor={{ true: "#4f46e5" }} />
          </View>
          <View style={styles.autoRow}>
            <Text style={styles.autoLabel}>Listen to interview voice (keep phone near laptop)</Text>
            <Switch value={voiceListenEnabled} onValueChange={setVoiceListenEnabled} trackColor={{ true: "#4f46e5" }} />
          </View>
          <View style={styles.autoRow}>
            <Text style={styles.autoLabel}>Auto-answer when voice question detected</Text>
            <Switch value={autoAnswerVoice} onValueChange={setAutoAnswerVoice} trackColor={{ true: "#4f46e5" }} />
          </View>

          {!isSessionActive ? (
            <TouchableOpacity
              onPress={startSession}
              style={[styles.primaryBtn, (!subActive || isConnecting) && styles.primaryBtnDisabled]}
              disabled={!subActive || isConnecting}
            >
              {isConnecting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Start pairing session</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.roomCard}>
              <Text style={styles.roomLabel}>WINDOWS CLIENT ROOM CODE</Text>
              <Text style={styles.roomCode}>{roomCode}</Text>
              <Text style={styles.roomHint}>
                {windowsConnected
                  ? "Windows is connected. Open the Live answers tab — voice listening and AI answers start automatically."
                  : "Waiting for Windows… Run INSTALL.bat on your PC with this code. Live answers open automatically once connected."}
              </Text>
              {windowsConnected ? (
                <TouchableOpacity onPress={() => setActiveTab("live")} style={styles.openLiveBtn}>
                  <Text style={styles.openLiveBtnText}>Open Live answers</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
          {connectionError ? <Text style={styles.error}>{connectionError}</Text> : null}
        </ScrollView>
      ) : (
        <View style={styles.liveWrap}>
          <View style={styles.liveStatusBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.liveStatusText}>
                {sessionPaused
                  ? "⏸ Paused — tap Resume to listen & answer again"
                  : isListening
                    ? "🎙️ Listening to interview…"
                    : voiceListenEnabled
                      ? "Starting microphone…"
                      : "Voice listen off"}
              </Text>
              <Text style={styles.liveStatusSub}>
                Room {roomCode} · Windows: Ctrl+Shift+Space for coding screens
              </Text>
            </View>
            <TouchableOpacity
              onPress={toggleSessionPause}
              style={[styles.pauseBtn, sessionPaused && styles.pauseBtnActive]}
            >
              <Text style={styles.pauseBtnText}>{sessionPaused ? "▶ Resume" : "⏸ Pause"}</Text>
            </TouchableOpacity>
          </View>
          {sessionPaused ? (
            <View style={styles.pausedBanner}>
              <Text style={styles.pausedBannerText}>
                AI answers and voice listening are paused. Tap Resume when the interview continues.
              </Text>
            </View>
          ) : null}
          {liveTranscript ? (
            <View style={styles.transcriptBar}>
              <Text style={styles.transcriptLabel}>Heard:</Text>
              <Text style={styles.transcriptText} numberOfLines={2}>{liveTranscript}</Text>
            </View>
          ) : null}
          {screenshotUri ? (
            <View style={styles.shotWrap}>
              <Text style={styles.shotLabel}>Latest capture {screenshotName ? `· ${screenshotName}` : ""}</Text>
              <Image source={{ uri: screenshotUri }} style={styles.shotImage} resizeMode="contain" />
              <TouchableOpacity
                style={styles.analyzeBtn}
                onPress={() => requestAiAssist(pendingImageRef.current, liveTranscript)}
              >
                <Text style={styles.analyzeBtnText}>Analyze screen with AI</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.waitShot}>Waiting for Windows screenshot (Ctrl+Shift+Space on PC)…</Text>
          )}

          <ScrollView ref={scrollViewRef} style={styles.answerScroll} contentContainerStyle={styles.answerPad}>
            {isAiStreaming && !suggestionStream && (
              <View style={styles.loading}>
                <ActivityIndicator color="#6366f1" size="large" />
                <Text style={styles.loadingText}>Generating personalized answer…</Text>
              </View>
            )}
            {aiError ? <Text style={styles.error}>{aiError}</Text> : null}
            {history.map((item, i) => (
              <View key={`h-${i}`} style={styles.answerCard}>
                <Text style={styles.answerMeta}>Answer #{i + 1} · {item.timestamp}</Text>
                {renderMarkdown(item.content, `h${i}`)}
              </View>
            ))}
            {suggestionStream ? (
              <View style={styles.answerCard}>
                <Text style={styles.answerMeta}>Streaming…</Text>
                {renderMarkdown(suggestionStream, "stream")}
              </View>
            ) : null}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#020617" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#1e293b",
  },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  headerSub: { color: "#64748b", fontSize: 10, marginTop: 2 },
  endBtn: { backgroundColor: "#1e293b", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  endBtnText: { color: "#f87171", fontSize: 11, fontWeight: "bold" },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#1e293b" },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#6366f1" },
  tabText: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  tabDisabled: { opacity: 0.4 },
  setupPad: { padding: 16, paddingBottom: 40 },
  sectionLabel: { color: "#6366f1", fontSize: 9, fontWeight: "bold", letterSpacing: 1.2, marginBottom: 6 },
  input: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 8,
    padding: 12,
    color: "#f8fafc",
    fontSize: 13,
    marginBottom: 10,
  },
  row: { flexDirection: "row", gap: 8, marginBottom: 10 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#1e293b",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#cbd5e1", fontSize: 11, fontWeight: "600" },
  subscribeBtn: {
    backgroundColor: "#4f46e5",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 16,
  },
  subscribeBtnText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  activeBadge: { color: "#34d399", fontSize: 11, marginBottom: 12 },
  autoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 12,
    paddingVertical: 8,
  },
  autoLabel: { color: "#94a3b8", fontSize: 11, flex: 1, marginRight: 8 },
  primaryBtn: {
    backgroundColor: "#4f46e5",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  roomCard: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#312e81",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    alignItems: "center",
  },
  roomLabel: { color: "#818cf8", fontSize: 9, fontWeight: "bold", letterSpacing: 1.5 },
  roomCode: { color: "#fff", fontSize: 36, fontWeight: "bold", letterSpacing: 8, marginVertical: 8 },
  roomHint: { color: "#64748b", fontSize: 10, textAlign: "center", lineHeight: 15 },
  openLiveBtn: {
    marginTop: 12,
    backgroundColor: "#4f46e5",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  openLiveBtnText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  error: { color: "#f87171", fontSize: 11, marginTop: 8 },
  liveWrap: { flex: 1 },
  liveStatusBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#0f172a",
    borderBottomWidth: 1,
    borderColor: "#1e293b",
    gap: 10,
  },
  pauseBtn: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
  },
  pauseBtnActive: { backgroundColor: "#4f46e5", borderColor: "#6366f1" },
  pauseBtnText: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  pausedBanner: {
    backgroundColor: "#422006",
    borderBottomWidth: 1,
    borderColor: "#78350f",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pausedBannerText: { color: "#fcd34d", fontSize: 10, lineHeight: 14 },
  liveStatusText: { color: "#818cf8", fontSize: 11, fontWeight: "bold" },
  liveStatusSub: { color: "#64748b", fontSize: 9, marginTop: 2 },
  transcriptBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#020617",
    borderBottomWidth: 1,
    borderColor: "#111827",
  },
  transcriptLabel: { color: "#6366f1", fontSize: 8, fontWeight: "bold" },
  transcriptText: { color: "#94a3b8", fontSize: 10, marginTop: 2 },
  shotWrap: { padding: 12, borderBottomWidth: 1, borderColor: "#1e293b" },
  shotLabel: { color: "#6366f1", fontSize: 9, fontWeight: "bold", marginBottom: 6 },
  shotImage: { width: "100%", height: 120, backgroundColor: "#0f172a", borderRadius: 8 },
  analyzeBtn: {
    marginTop: 8,
    backgroundColor: "#312e81",
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  analyzeBtnText: { color: "#c7d2fe", fontSize: 11, fontWeight: "bold" },
  waitShot: { color: "#64748b", fontSize: 11, textAlign: "center", padding: 16 },
  answerScroll: { flex: 1 },
  answerPad: { padding: 16, paddingBottom: 40 },
  loading: { alignItems: "center", paddingVertical: 24 },
  loadingText: { color: "#94a3b8", fontSize: 11, marginTop: 8 },
  answerCard: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: "#1e293b",
  },
  answerMeta: { color: "#475569", fontSize: 9, marginBottom: 8, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  codeBox: { backgroundColor: "#0f172a", borderRadius: 8, marginVertical: 8, overflow: "hidden" },
  codeHeader: { flexDirection: "row", justifyContent: "space-between", padding: 8, backgroundColor: "#020617" },
  codeLang: { color: "#94a3b8", fontSize: 9, fontWeight: "bold" },
  copyText: { color: "#818cf8", fontSize: 10 },
  codeText: { color: "#cbd5e1", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", fontSize: 11, padding: 10 },
  h3: { color: "#fff", fontSize: 14, fontWeight: "bold", marginTop: 10, marginBottom: 4 },
  starLine: { color: "#c7d2fe", fontSize: 12, lineHeight: 18, marginBottom: 4, marginLeft: 4 },
  bullet: { color: "#94a3b8", fontSize: 12, lineHeight: 18, marginLeft: 4, marginBottom: 4 },
  body: { color: "#cbd5e1", fontSize: 12, lineHeight: 18, marginBottom: 6 },
});
