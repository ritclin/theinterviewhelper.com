import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Clipboard,
  Dimensions,
  Platform,
  SafeAreaView,
  StatusBar
} from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import { io, Socket } from "socket.io-client";

// Simple custom inline SVG replacements using Unicode to keep the Expo code 100% stable without external native icon compilation requirements
const Icons = {
  Sparkles: () => <Text style={{ fontSize: 18, color: "#818cf8" }}>✨</Text>,
  Code: () => <Text style={{ fontSize: 14, color: "#818cf8" }}>💻</Text>,
  Clock: () => <Text style={{ fontSize: 12, color: "#94a3b8" }}>⏱️</Text>,
  Check: () => <Text style={{ fontSize: 14, color: "#34d399" }}>✅</Text>,
  Copy: () => <Text style={{ fontSize: 14, color: "#94a3b8" }}>📋</Text>,
  Wifi: () => <Text style={{ fontSize: 14, color: "#10b981" }}>📶</Text>,
  Lock: () => <Text style={{ fontSize: 16, color: "#f43f5e" }}>🔒</Text>
};

export default function App() {
  // Keeps the mobile screen alive for persistent, hands-free interview guidelines
  useKeepAwake();

  // Socket and Session Management
  const socketRef = useRef<Socket | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [serverUrl, setServerUrl] = useState("http://localhost:3000"); // Can be replaced with your deployed Cloud Run relay URL
  const [roomCode, setRoomCode] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isPaired, setIsPaired] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Live Telemetry states
  const [screenshotText, setScreenshotText] = useState("");
  const [screenshotName, setScreenshotName] = useState("");
  const [speechTranscript, setSpeechTranscript] = useState("");
  
  // Suggestion states
  const [suggestionStream, setSuggestionStream] = useState("");
  const [isAiStreaming, setIsAiStreaming] = useState(false);
  const [history, setHistory] = useState<Array<{ role: string; content: string; timestamp: string }>>([]);

  // Copy success indicator
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const handleConnectAndJoin = () => {
    if (!roomCode || roomCode.length !== 6) {
      alert("Please enter a valid 6-digit active room code.");
      return;
    }

    setIsConnecting(true);
    
    // Initialize Socket Connection with wide fallback support
    const socket = io(serverUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      console.log("Connected to Relay Server:", socket.id);
      
      // Submit pairing code
      socket.emit("join-room", { roomCode }, (response: any) => {
        setIsConnecting(false);
        if (response.success) {
          setIsPaired(true);
          setHistory(response.history || []);
          setScreenshotText("");
          setSpeechTranscript("");
          setScreenshotName("");
        } else {
          alert(`Pairing Failed: ${response.error}`);
          socket.disconnect();
        }
      });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      setIsPaired(false);
      setIsConnecting(false);
    });

    // Handle universal casting signals
    socket.on("paired", (data) => {
      console.log("Room paired confirmation received.");
      setIsPaired(true);
    });

    socket.on("stream-feed", (payload) => {
      if (payload.imageText) setScreenshotText(payload.imageText);
      if (payload.imageName) setScreenshotName(payload.imageName);
      if (payload.audioTranscript) setSpeechTranscript(payload.audioTranscript);
    });

    socket.on("ai-start", () => {
      setIsAiStreaming(true);
      setSuggestionStream("");
    });

    socket.on("ai-chunk", (data) => {
      setIsAiStreaming(false);
      setSuggestionStream((prev) => prev + data.text);
      // Automatically scroll to bottom of suggestions for seamless hands-free scanning
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollToEnd({ animated: true });
      }
    });

    socket.on("ai-end", (data) => {
      setIsAiStreaming(false);
      setHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.fullText,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
      setSuggestionStream("");
    });

    socket.on("room-closed", () => {
      alert("Host client disconnected. Pairing ended.");
      handleDisconnect();
    });

    socket.on("room-expired", () => {
      alert("This room session has expired.");
      handleDisconnect();
    });
  };

  const handleDisconnect = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setIsPaired(false);
    setIsConnected(false);
    setSuggestionStream("");
    setHistory([]);
    setScreenshotText("");
    setSpeechTranscript("");
  };

  const handleCopyToClipboard = (text: string, index: number) => {
    Clipboard.setString(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // High-performance streaming markdown rendering engine tailored for mobile layouts
  const renderMarkdownBlocks = (markdownText: string) => {
    const blocks: any[] = [];
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
        // Safe open block segment during live server streaming
        const blockContent = markdownText.substring(startIndex + 3);
        const newlineIdx = blockContent.indexOf("\n");
        const lang = newlineIdx !== -1 ? blockContent.substring(0, newlineIdx).trim() : "";
        const code = newlineIdx !== -1 ? blockContent.substring(newlineIdx + 1) : blockContent;
        blocks.push({ type: "code", language: lang, value: code, isIncomplete: true });
        break;
      } else {
        const blockContent = markdownText.substring(startIndex + 3, endIndex);
        const newlineIdx = blockContent.indexOf("\n");
        const lang = newlineIdx !== -1 ? blockContent.substring(0, newlineIdx).trim() : "";
        const code = newlineIdx !== -1 ? blockContent.substring(newlineIdx + 1) : blockContent;
        blocks.push({ type: "code", language: lang, value: code, isIncomplete: false });
        currentIndex = endIndex + 3;
      }
    }

    return blocks.map((block, idx) => {
      if (block.type === "code") {
        return (
          <View key={idx} style={styles.codeContainer}>
            <View style={styles.codeHeader}>
              <View style={styles.row}>
                <Icons.Code />
                <Text style={styles.codeHeaderText}>
                  {block.language.toUpperCase() || "CODE"} {block.isIncomplete && "(streaming)"}
                </Text>
              </View>
              <TouchableOpacity 
                onPress={() => handleCopyToClipboard(block.value, idx)}
                style={styles.copyBtn}
              >
                {copiedIndex === idx ? <Icons.Check /> : <Icons.Copy />}
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.codeScroll}>
              <Text style={styles.codeText}>{block.value}</Text>
            </ScrollView>
          </View>
        );
      } else {
        const lines = block.value.split("\n");
        return lines.map((line: string, lineIdx: number) => {
          const trimmed = line.trim();
          if (!trimmed) return <View key={`${idx}-${lineIdx}`} style={{ height: 6 }} />;

          // Header structures
          if (trimmed.startsWith("### ")) {
            return (
              <View key={`${idx}-${lineIdx}`} style={styles.header3Container}>
                <View style={styles.headerDot} />
                <Text style={styles.header3Text}>{trimmed.replace("### ", "")}</Text>
              </View>
            );
          }
          if (trimmed.startsWith("## ")) {
            return (
              <Text key={`${idx}-${lineIdx}`} style={styles.header2Text}>
                {trimmed.replace("## ", "")}
              </Text>
            );
          }

          // Bullet points
          if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
            return (
              <View key={`${idx}-${lineIdx}`} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{trimmed.substring(2)}</Text>
              </View>
            );
          }

          return (
            <Text key={`${idx}-${lineIdx}`} style={styles.bodyText}>
              {line}
            </Text>
          );
        });
      }
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#020617" />
      
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <View style={styles.row}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoEmoji}>✨</Text>
          </View>
          <View>
            <Text style={styles.logoTitle}>TheInterviewHelper</Text>
            <Text style={styles.logoSubtitle}>Companion App - Sub-2s Latency</Text>
          </View>
        </View>
        
        {isPaired && (
          <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBadge}>
            <Text style={styles.disconnectBadgeText}>Unpair</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* PAIRING SETUP VIEW */}
      {!isPaired ? (
        <ScrollView contentContainerStyle={styles.pairingContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.pairingCard}>
            <Text style={styles.pairingEmoji}>📱</Text>
            <Text style={styles.pairingTitle}>Connect Companion Device</Text>
            <Text style={styles.pairingSubtitle}>
              Link your mobile screen instantly to cast suggestions hands-free during active technical rounds.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>RELAY SERVER URL</Text>
              <TextInput
                value={serverUrl}
                onChangeText={setServerUrl}
                style={styles.inputField}
                placeholder="e.g. http://192.168.1.100:3000"
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

            <TouchableOpacity 
              onPress={handleConnectAndJoin} 
              style={styles.pairButton}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.pairButtonText}>Link Session</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.specCard}>
            <Icons.Lock />
            <Text style={styles.specTitle}>Secure Local Pipeline</Text>
            <Text style={styles.specDesc}>
              This mobile connection establishes high-performance websocket sync channels with zero diagnostic storage footprint.
            </Text>
          </View>
        </ScrollView>
      ) : (
        // ACTIVE INTERVIEW GUIDE PANEL
        <View style={styles.activeContainer}>
          
          {/* Incoming Screen & Transcript Mirror Sub-Feed */}
          <View style={styles.telemetryBar}>
            <View style={[styles.telemetryCard, { marginRight: 8 }]}>
              <Text style={styles.telemetryLabel}>SCREENSHOT CAPTURE</Text>
              <Text style={styles.telemetryValue} numberOfLines={1}>
                {screenshotName ? `📷 ${screenshotName}` : "Awaiting screen frame..."}
              </Text>
            </View>
            <View style={styles.telemetryCard}>
              <Text style={styles.telemetryLabel}>SPEECH INPUT</Text>
              <Text style={styles.telemetryValue} numberOfLines={1}>
                {speechTranscript ? `🎙️ "${speechTranscript}"` : "Awaiting interviewer voice..."}
              </Text>
            </View>
          </View>

          {/* Core Streaming Suggestions Frame */}
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.suggestionContent}
            style={styles.suggestionScrollView}
          >
            {isAiStreaming && (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={styles.loaderText}>SYNTESIZING RESPONSES...</Text>
                <Text style={styles.loaderSub}>Optimizing time & space bounds...</Text>
              </View>
            )}

            {!isAiStreaming && !suggestionStream && history.length === 0 && (
              <View style={styles.emptyContainer}>
                <Icons.Sparkles />
                <Text style={styles.emptyTitle}>Ready for Live Rounds</Text>
                <Text style={styles.emptySubtitle}>
                  Trigger suggestions from your desktop capture client. Real-time cheat sheets will stream here instantly.
                </Text>
              </View>
            )}

            {/* Currently streaming suggestions */}
            {suggestionStream ? (
              <View>
                <View style={styles.activeStreamBadge}>
                  <Icons.Sparkles />
                  <Text style={styles.activeStreamBadgeText}>OPTIMIZATION FLOW STREAMING</Text>
                </View>
                {renderMarkdownBlocks(suggestionStream)}
              </View>
            ) : null}

            {/* Render suggestion logs/history */}
            {!suggestionStream && history.length > 0 ? (
              <View>
                {history.map((item, index) => (
                  <View key={index} style={styles.historyBlock}>
                    <View style={styles.historyMetaRow}>
                      <Text style={styles.historyMetaText}>SUGGESTION CARD #{index + 1}</Text>
                      <Text style={styles.historyMetaText}>{item.timestamp}</Text>
                    </View>
                    {renderMarkdownBlocks(item.content)}
                  </View>
                ))}
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
    backgroundColor: "#020617"
  },
  row: {
    flexDirection: "row",
    alignItems: "center"
  },
  headerBar: {
    height: 60,
    backgroundColor: "#090d16",
    borderBottomWidth: 1,
    borderColor: "#1e293b",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "between",
    paddingHorizontal: 16
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#1e1b4b",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10
  },
  logoEmoji: {
    fontSize: 16
  },
  logoTitle: {
    fontFamily: Platform.OS === "ios" ? "Helvetica Neue" : "sans-serif-condensed",
    fontWeight: "bold",
    fontSize: 14,
    color: "#fff"
  },
  logoSubtitle: {
    fontSize: 9,
    color: "#475569"
  },
  disconnectBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#1e293b"
  },
  disconnectBadgeText: {
    color: "#ef4444",
    fontSize: 11,
    fontWeight: "bold"
  },
  pairingContainer: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1
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
    elevation: 8
  },
  pairingEmoji: {
    fontSize: 42,
    marginBottom: 12
  },
  pairingTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f8fafc",
    marginBottom: 6,
    textAlign: "center"
  },
  pairingSubtitle: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 24
  },
  inputGroup: {
    width: "100%",
    marginBottom: 16
  },
  inputLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#6366f1",
    letterSpacing: 1.5,
    marginBottom: 6
  },
  inputField: {
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#f8fafc",
    fontSize: 13
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
    letterSpacing: 4
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
    elevation: 4
  },
  pairButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold"
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
    alignItems: "center"
  },
  specTitle: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "bold",
    marginLeft: 12,
    marginRight: 4
  },
  specDesc: {
    color: "#475569",
    fontSize: 10,
    flex: 1,
    marginLeft: 12,
    lineHeight: 14
  },
  activeContainer: {
    flex: 1
  },
  telemetryBar: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: "#090d16",
    borderBottomWidth: 1,
    borderColor: "#1e293b"
  },
  telemetryCard: {
    flex: 1,
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#111827",
    borderRadius: 8,
    padding: 8
  },
  telemetryLabel: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#6366f1",
    letterSpacing: 1
  },
  telemetryValue: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 2
  },
  suggestionScrollView: {
    flex: 1
  },
  suggestionContent: {
    padding: 16,
    paddingBottom: 40
  },
  loaderContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60
  },
  loaderText: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1.5,
    marginTop: 12
  },
  loaderSub: {
    color: "#475569",
    fontSize: 10,
    marginTop: 4
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 30
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
    marginTop: 12
  },
  emptySubtitle: {
    color: "#475569",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 6
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
    marginBottom: 16
  },
  activeStreamBadgeText: {
    color: "#818cf8",
    fontSize: 9,
    fontWeight: "bold",
    letterSpacing: 1,
    marginLeft: 6
  },
  historyBlock: {
    borderBottomWidth: 1,
    borderColor: "#1e293b",
    paddingBottom: 24,
    marginBottom: 24
  },
  historyMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12
  },
  historyMetaText: {
    fontSize: 9,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    color: "#475569"
  },
  codeContainer: {
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 12,
    overflow: "hidden",
    marginVertical: 12
  },
  codeHeader: {
    height: 36,
    backgroundColor: "#090d16",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: "#1e293b"
  },
  codeHeaderText: {
    color: "#94a3b8",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 10,
    fontWeight: "bold",
    marginLeft: 6
  },
  copyBtn: {
    padding: 4
  },
  codeScroll: {
    padding: 12
  },
  codeText: {
    color: "#cbd5e1",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 12,
    lineHeight: 18
  },
  header3Container: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderColor: "#0f172a",
    paddingBottom: 4
  },
  headerDot: {
    width: 6,
    height: 14,
    backgroundColor: "#4f46e5",
    borderRadius: 2,
    marginRight: 8
  },
  header3Text: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold"
  },
  header2Text: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 22,
    marginBottom: 10
  },
  bulletRow: {
    flexDirection: "row",
    marginLeft: 8,
    marginBottom: 6,
    alignItems: "flex-start"
  },
  bulletDot: {
    color: "#6366f1",
    fontSize: 14,
    marginRight: 6,
    fontWeight: "bold"
  },
  bulletText: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18,
    flex: 1
  },
  bodyText: {
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10
  }
});
