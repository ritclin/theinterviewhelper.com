import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Clipboard,
  Platform,
  SafeAreaView,
  StatusBar,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useKeepAwake } from "expo-keep-awake";
import { io, Socket } from "socket.io-client";

const DEFAULT_SERVER_URL = "https://theinterviewhelpercom-production.up.railway.app";
const STORAGE_SERVER_URL = "tih_mobile_server_url";
const STORAGE_ROOM_CODE = "tih_mobile_room_code";

const Icons = {
  Sparkles: () => <Text style={{ fontSize: 18, color: "#818cf8" }}>✨</Text>,
  Code: () => <Text style={{ fontSize: 14, color: "#818cf8" }}>💻</Text>,
  Check: () => <Text style={{ fontSize: 14, color: "#34d399" }}>✅</Text>,
  Copy: () => <Text style={{ fontSize: 14, color: "#94a3b8" }}>📋</Text>,
  Lock: () => <Text style={{ fontSize: 16, color: "#f43f5e" }}>🔒</Text>,
};

type HistoryItem = { role: string; content: string; timestamp: string };

export default function App() {
  useKeepAwake();

  const socketRef = useRef<Socket | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [roomCode, setRoomCode] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isPaired, setIsPaired] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");

  const [screenshotText, setScreenshotText] = useState("");
  const [screenshotName, setScreenshotName] = useState("");
  const [speechTranscript, setSpeechTranscript] = useState("");

  const [suggestionStream, setSuggestionStream] = useState("");
  const [isAiStreaming, setIsAiStreaming] = useState(false);
  const [aiError, setAiError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const scrollToLatest = useCallback(() => {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [savedUrl, savedRoom] = await Promise.all([
          AsyncStorage.getItem(STORAGE_SERVER_URL),
          AsyncStorage.getItem(STORAGE_ROOM_CODE),
        ]);
        if (cancelled) return;
        if (savedUrl?.trim()) setServerUrl(savedUrl.trim());
        if (savedRoom?.trim()) setRoomCode(savedRoom.trim());
      } catch {
        // Non-fatal; defaults are fine.
      } finally {
        if (!cancelled) setPrefsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    AsyncStorage.setItem(STORAGE_SERVER_URL, serverUrl.trim()).catch(() => {});
  }, [serverUrl, prefsLoaded]);

  useEffect(() => {
    if (!prefsLoaded) return;
    AsyncStorage.setItem(STORAGE_ROOM_CODE, roomCode.trim()).catch(() => {});
  }, [roomCode, prefsLoaded]);

  const teardownSocket = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.removeAllListeners();
    socket.disconnect();
    socketRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      teardownSocket();
    };
  }, [teardownSocket]);

  useEffect(() => {
    scrollToLatest();
  }, [suggestionStream, history, scrollToLatest]);

  const resetSessionState = useCallback(() => {
    setIsPaired(false);
    setIsConnected(false);
    setIsConnecting(false);
    setIsAiStreaming(false);
    setSuggestionStream("");
    setHistory([]);
    setScreenshotText("");
    setSpeechTranscript("");
    setScreenshotName("");
    setAiError("");
    setConnectionError("");
  }, []);

  const handleDisconnect = useCallback(() => {
    teardownSocket();
    resetSessionState();
  }, [resetSessionState, teardownSocket]);

  const registerSocketListeners = useCallback(
    (socket: Socket) => {
      socket.on("connect", () => {
        setIsConnected(true);
        setConnectionError("");
        console.log("Connected to relay server:", socket.id);

        socket.emit("join-room", { roomCode }, (response: { success?: boolean; error?: string; history?: HistoryItem[] }) => {
          setIsConnecting(false);
          if (response?.success) {
            setIsPaired(true);
            setHistory(response.history || []);
            setSuggestionStream("");
            setAiError("");
            setScreenshotText("");
            setSpeechTranscript("");
            setScreenshotName("");
          } else {
            const message = response?.error || "Could not join room.";
            setConnectionError(message);
            Alert.alert("Pairing Failed", message);
            teardownSocket();
            setIsConnected(false);
          }
        });
      });

      socket.on("disconnect", () => {
        setIsConnected(false);
        setIsPaired(false);
        setIsConnecting(false);
        setIsAiStreaming(false);
      });

      socket.on("connect_error", (err: Error) => {
        setIsConnecting(false);
        setConnectionError(err.message || "Connection failed.");
      });

      socket.on("paired", () => {
        setIsPaired(true);
      });

      socket.on("stream-feed", (payload: { imageText?: string; imageName?: string; audioTranscript?: string }) => {
        if (payload.imageText) setScreenshotText(payload.imageText);
        if (payload.imageName) setScreenshotName(payload.imageName);
        if (payload.audioTranscript) setSpeechTranscript(payload.audioTranscript);
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
            {
              role: "assistant",
              content: fullText,
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
        }
        setSuggestionStream("");
      });

      socket.on("ai-error", (data: { error?: string }) => {
        setIsAiStreaming(false);
        setSuggestionStream("");
        const message = data.error || "AI suggestion failed.";
        setAiError(message);
      });

      socket.on("room-closed", () => {
        Alert.alert("Session Ended", "Host client disconnected. Pairing ended.");
        handleDisconnect();
      });

      socket.on("room-expired", () => {
        Alert.alert("Session Expired", "This room session has expired.");
        handleDisconnect();
      });
    },
    [roomCode, teardownSocket, handleDisconnect]
  );

  const handleConnectAndJoin = () => {
    const trimmedUrl = serverUrl.trim();
    const trimmedCode = roomCode.trim();

    if (!trimmedUrl) {
      Alert.alert("Server URL Required", "Enter the relay server URL.");
      return;
    }
    if (trimmedCode.length !== 6) {
      Alert.alert("Invalid Code", "Please enter a valid 6-digit active room code.");
      return;
    }

    teardownSocket();
    setIsConnecting(true);
    setConnectionError("");
    setAiError("");
    setIsPaired(false);

    const socket = io(trimmedUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      timeout: 15000,
    });

    socketRef.current = socket;
    registerSocketListeners(socket);
  };

  const handleCopyToClipboard = (text: string, index: number) => {
    Clipboard.setString(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const renderMarkdownBlocks = (markdownText: string, keyPrefix: string) => {
    const blocks: Array<{ type: string; value: string; language?: string; isIncomplete?: boolean }> = [];
    let currentIndex = 0;

    while (true) {
      const startIndex = markdownText.indexOf("```", currentIndex);
      if (startIndex === -1) {
        if (currentIndex < markdownText.length) {
          blocks.push({ type: "text", value: markdownText.substring(currentIndex) });
        }
        break;
      }

      if (startIndex > currentIndex) {
        blocks.push({ type: "text", value: markdownText.substring(currentIndex, startIndex) });
      }

      const endIndex = markdownText.indexOf("```", startIndex + 3);
      if (endIndex === -1) {
        const blockContent = markdownText.substring(startIndex + 3);
        const newlineIdx = blockContent.indexOf("\n");
        const lang = newlineIdx !== -1 ? blockContent.substring(0, newlineIdx).trim() : "";
        const code = newlineIdx !== -1 ? blockContent.substring(newlineIdx + 1) : blockContent;
        blocks.push({ type: "code", language: lang, value: code, isIncomplete: true });
        break;
      }

      const blockContent = markdownText.substring(startIndex + 3, endIndex);
      const newlineIdx = blockContent.indexOf("\n");
      const lang = newlineIdx !== -1 ? blockContent.substring(0, newlineIdx).trim() : "";
      const code = newlineIdx !== -1 ? blockContent.substring(newlineIdx + 1) : blockContent;
      blocks.push({ type: "code", language: lang, value: code, isIncomplete: false });
      currentIndex = endIndex + 3;
    }

    return blocks.map((block, idx) => {
      const blockKey = `${keyPrefix}-${idx}`;
      if (block.type === "code") {
        return (
          <View key={blockKey} style={styles.codeContainer}>
            <View style={styles.codeHeader}>
              <View style={styles.row}>
                <Icons.Code />
                <Text style={styles.codeHeaderText}>
                  {(block.language || "CODE").toUpperCase()} {block.isIncomplete ? "(streaming)" : ""}
                </Text>
              </View>
              <TouchableOpacity onPress={() => handleCopyToClipboard(block.value, idx)} style={styles.copyBtn}>
                {copiedIndex === idx ? <Icons.Check /> : <Icons.Copy />}
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.codeScroll}>
              <Text style={styles.codeText}>{block.value}</Text>
            </ScrollView>
          </View>
        );
      }

      const lines = block.value.split("\n");
      return lines.map((line: string, lineIdx: number) => {
        const lineKey = `${blockKey}-${lineIdx}`;
        const trimmed = line.trim();
        if (!trimmed) return <View key={lineKey} style={{ height: 6 }} />;

        if (trimmed.startsWith("### ")) {
          return (
            <View key={lineKey} style={styles.header3Container}>
              <View style={styles.headerDot} />
              <Text style={styles.header3Text}>{trimmed.replace("### ", "")}</Text>
            </View>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <Text key={lineKey} style={styles.header2Text}>
              {trimmed.replace("## ", "")}
            </Text>
          );
        }
        if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
          return (
            <View key={lineKey} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{trimmed.substring(2)}</Text>
            </View>
          );
        }

        return (
          <Text key={lineKey} style={styles.bodyText}>
            {line}
          </Text>
        );
      });
    });
  };

  const hasAnswers = Boolean(suggestionStream) || history.length > 0;
  const latestHistoryIndex = history.length - 1;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#020617" />

      <View style={styles.headerBar}>
        <View style={styles.row}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoEmoji}>✨</Text>
          </View>
          <View>
            <Text style={styles.logoTitle}>The Interview Helper</Text>
            <Text style={styles.logoSubtitle}>
              {isPaired ? `Room ${roomCode} · ${isConnected ? "Live" : "Reconnecting…"}` : "Android Companion"}
            </Text>
          </View>
        </View>

        {isPaired && (
          <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBadge}>
            <Text style={styles.disconnectBadgeText}>Unpair</Text>
          </TouchableOpacity>
        )}
      </View>

      {!isPaired ? (
        <ScrollView contentContainerStyle={styles.pairingContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.pairingCard}>
            <Text style={styles.pairingEmoji}>📱</Text>
            <Text style={styles.pairingTitle}>Connect Companion Device</Text>
            <Text style={styles.pairingSubtitle}>
              Enter the same 6-digit room code shown on your web dashboard. AI answers will stream here in real time.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>RELAY SERVER URL</Text>
              <TextInput
                value={serverUrl}
                onChangeText={setServerUrl}
                style={styles.inputField}
                placeholder={DEFAULT_SERVER_URL}
                placeholderTextColor="#475569"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>6-DIGIT PAIRING CODE</Text>
              <TextInput
                value={roomCode}
                onChangeText={(val) => setRoomCode(val.replace(/\D/g, ""))}
                maxLength={6}
                keyboardType="number-pad"
                style={styles.codeInputField}
                placeholder="e.g. 512039"
                placeholderTextColor="#334155"
              />
            </View>

            {connectionError ? <Text style={styles.errorText}>{connectionError}</Text> : null}

            <TouchableOpacity onPress={handleConnectAndJoin} style={styles.pairButton} disabled={isConnecting || !prefsLoaded}>
              {isConnecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.pairButtonText}>Link Session</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.specCard}>
            <Icons.Lock />
            <Text style={styles.specDesc}>
              Uses the production relay by default. Generate a room code on the web app, then link this phone with the same code.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.activeContainer}>
          <View style={styles.telemetryBar}>
            <View style={[styles.telemetryCard, { marginRight: 8 }]}>
              <Text style={styles.telemetryLabel}>SCREEN CAPTURE</Text>
              <Text style={styles.telemetryValue} numberOfLines={1}>
                {screenshotName ? `📷 ${screenshotName}` : screenshotText ? "📷 Screen text received" : "Awaiting screen…"}
              </Text>
            </View>
            <View style={styles.telemetryCard}>
              <Text style={styles.telemetryLabel}>SPEECH INPUT</Text>
              <Text style={styles.telemetryValue} numberOfLines={2}>
                {speechTranscript ? `🎙️ "${speechTranscript}"` : "Awaiting interviewer voice…"}
              </Text>
            </View>
          </View>

          <ScrollView ref={scrollViewRef} contentContainerStyle={styles.suggestionContent} style={styles.suggestionScrollView}>
            {isAiStreaming && !suggestionStream ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={styles.loaderText}>GENERATING ANSWER…</Text>
                <Text style={styles.loaderSub}>Streaming will appear here momentarily.</Text>
              </View>
            ) : null}

            {!isAiStreaming && !hasAnswers && !aiError ? (
              <View style={styles.emptyContainer}>
                <Icons.Sparkles />
                <Text style={styles.emptyTitle}>Waiting for Answers</Text>
                <Text style={styles.emptySubtitle}>
                  Trigger AI assist from the web dashboard or Windows capture client. Answers appear here automatically.
                </Text>
              </View>
            ) : null}

            {aiError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerTitle}>AI Error</Text>
                <Text style={styles.errorBannerText}>{aiError}</Text>
              </View>
            ) : null}

            {history.map((item, index) => {
              const isLatest = index === latestHistoryIndex && !suggestionStream && !isAiStreaming;
              return (
                <View
                  key={`history-${index}-${item.timestamp}`}
                  style={[styles.historyBlock, isLatest && styles.latestHistoryBlock]}
                >
                  <View style={styles.historyMetaRow}>
                    <Text style={[styles.historyMetaText, isLatest && styles.latestHistoryMetaText]}>
                      {isLatest ? "LATEST ANSWER" : `ANSWER #${index + 1}`}
                    </Text>
                    <Text style={styles.historyMetaText}>{item.timestamp}</Text>
                  </View>
                  {renderMarkdownBlocks(item.content, `history-${index}`)}
                </View>
              );
            })}

            {suggestionStream ? (
              <View style={styles.streamingBlock}>
                <View style={styles.activeStreamBadge}>
                  <Icons.Sparkles />
                  <Text style={styles.activeStreamBadgeText}>LIVE ANSWER STREAMING</Text>
                </View>
                {renderMarkdownBlocks(suggestionStream, "stream")}
              </View>
            ) : null}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#020617",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerBar: {
    minHeight: 60,
    backgroundColor: "#090d16",
    borderBottomWidth: 1,
    borderColor: "#1e293b",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#1e1b4b",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  logoEmoji: {
    fontSize: 16,
  },
  logoTitle: {
    fontFamily: Platform.OS === "ios" ? "Helvetica Neue" : "sans-serif-medium",
    fontWeight: "bold",
    fontSize: 14,
    color: "#fff",
  },
  logoSubtitle: {
    fontSize: 9,
    color: "#475569",
    marginTop: 2,
  },
  disconnectBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#1e293b",
  },
  disconnectBadgeText: {
    color: "#ef4444",
    fontSize: 11,
    fontWeight: "bold",
  },
  pairingContainer: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  pairingCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#0b1329",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#1e293b",
    alignItems: "center",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
  pairingEmoji: {
    fontSize: 42,
    marginBottom: 12,
  },
  pairingTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f8fafc",
    marginBottom: 6,
    textAlign: "center",
  },
  pairingSubtitle: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 24,
  },
  inputGroup: {
    width: "100%",
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#6366f1",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  inputField: {
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#f8fafc",
    fontSize: 13,
  },
  codeInputField: {
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#818cf8",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    letterSpacing: 4,
  },
  pairButton: {
    width: "100%",
    backgroundColor: "#4f46e5",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  pairButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
  },
  errorText: {
    color: "#f87171",
    fontSize: 11,
    textAlign: "center",
    marginBottom: 8,
  },
  specCard: {
    marginTop: 24,
    maxWidth: 380,
    backgroundColor: "#090d16",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#111827",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  specDesc: {
    color: "#475569",
    fontSize: 10,
    flex: 1,
    marginLeft: 12,
    lineHeight: 14,
  },
  activeContainer: {
    flex: 1,
  },
  telemetryBar: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: "#090d16",
    borderBottomWidth: 1,
    borderColor: "#1e293b",
  },
  telemetryCard: {
    flex: 1,
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#111827",
    borderRadius: 8,
    padding: 8,
  },
  telemetryLabel: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#6366f1",
    letterSpacing: 1,
  },
  telemetryValue: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 2,
  },
  suggestionScrollView: {
    flex: 1,
  },
  suggestionContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loaderContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  loaderText: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1.5,
    marginTop: 12,
  },
  loaderSub: {
    color: "#475569",
    fontSize: 10,
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 30,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
    marginTop: 12,
  },
  emptySubtitle: {
    color: "#475569",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 6,
  },
  errorBanner: {
    backgroundColor: "#450a0a",
    borderWidth: 1,
    borderColor: "#991b1b",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerTitle: {
    color: "#fecaca",
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 4,
  },
  errorBannerText: {
    color: "#fca5a5",
    fontSize: 11,
    lineHeight: 16,
  },
  activeStreamBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e1b4b",
    borderWidth: 1,
    borderColor: "#312e81",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  activeStreamBadgeText: {
    color: "#818cf8",
    fontSize: 9,
    fontWeight: "bold",
    letterSpacing: 1,
    marginLeft: 6,
  },
  streamingBlock: {
    marginTop: 8,
    borderTopWidth: 1,
    borderColor: "#312e81",
    paddingTop: 16,
  },
  historyBlock: {
    borderBottomWidth: 1,
    borderColor: "#1e293b",
    paddingBottom: 24,
    marginBottom: 24,
  },
  latestHistoryBlock: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#312e81",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  historyMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  historyMetaText: {
    fontSize: 9,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    color: "#475569",
  },
  latestHistoryMetaText: {
    color: "#818cf8",
    fontWeight: "bold",
  },
  codeContainer: {
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 12,
    overflow: "hidden",
    marginVertical: 12,
  },
  codeHeader: {
    height: 36,
    backgroundColor: "#090d16",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: "#1e293b",
  },
  codeHeaderText: {
    color: "#94a3b8",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 10,
    fontWeight: "bold",
    marginLeft: 6,
  },
  copyBtn: {
    padding: 4,
  },
  codeScroll: {
    padding: 12,
  },
  codeText: {
    color: "#cbd5e1",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 12,
    lineHeight: 18,
  },
  header3Container: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderColor: "#0f172a",
    paddingBottom: 4,
  },
  headerDot: {
    width: 6,
    height: 14,
    backgroundColor: "#4f46e5",
    borderRadius: 2,
    marginRight: 8,
  },
  header3Text: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  header2Text: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 22,
    marginBottom: 10,
  },
  bulletRow: {
    flexDirection: "row",
    marginLeft: 8,
    marginBottom: 6,
    alignItems: "flex-start",
  },
  bulletDot: {
    color: "#6366f1",
    fontSize: 14,
    marginRight: 6,
    fontWeight: "bold",
  },
  bulletText: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  bodyText: {
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
});
