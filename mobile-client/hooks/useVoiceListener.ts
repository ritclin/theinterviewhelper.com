import { useCallback, useEffect, useRef, useState } from "react";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

type Options = {
  enabled: boolean;
  email: string;
  roomCode: string;
  serverUrl: string;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  chunkSeconds?: number;
};

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: false,
  android: {
    extension: ".m4a",
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: ".m4a",
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

async function ensureMicPermission(onError?: (message: string) => void): Promise<boolean> {
  const existing = await Audio.getPermissionsAsync();
  if (existing.granted) return true;

  const requested = await Audio.requestPermissionsAsync();
  if (requested.granted) return true;

  onError?.(
    requested.canAskAgain
      ? "Microphone permission is required. Open Settings → Apps → Interview Helper → Permissions → Microphone → Allow."
      : "Microphone permission denied. Enable it in Android Settings to listen to interview questions."
  );
  return false;
}

async function configureAudioSession() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    // staysActiveInBackground requires a configured Android foreground service and
    // throws on many release builds; the screen is kept awake (useKeepAwake) so we
    // don't need background recording. Keeping this false avoids that failure.
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
  });
}

export function useVoiceListener({
  enabled,
  email,
  roomCode,
  serverUrl,
  onTranscript,
  onError,
  chunkSeconds = 6,
}: Options) {
  const [isListening, setIsListening] = useState(false);
  const loopRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const failCountRef = useRef(0);

  const transcribeFile = useCallback(
    async (uri: string) => {
      const base = serverUrl.replace(/\/$/, "");
      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const res = await fetch(`${base}/api/transcribe-audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          roomCode,
          mimeType: Platform.OS === "android" ? "audio/mp4" : "audio/m4a",
          audioBase64,
        }),
      });
      const data = await res.json();
      if (data.success && data.transcript?.trim()) {
        failCountRef.current = 0;
        onTranscript(data.transcript.trim());
      } else if (!data.success && data.error) {
        onError?.(data.error);
      }
    },
    [email, roomCode, serverUrl, onTranscript, onError]
  );

  const recordLoop = useCallback(async () => {
    if (!(await ensureMicPermission(onError))) {
      loopRef.current = false;
      return;
    }

    // Configuring the audio session is best-effort — recording can still work if
    // it fails, so never abort the whole loop just because this throws.
    try {
      await configureAudioSession();
    } catch {
      // ignore and continue
    }

    while (loopRef.current) {
      let recording: Audio.Recording | null = null;
      try {
        // Release any stale recording first — Android allows only one prepared
        // Recording at a time, so a leftover instance would make the next start throw.
        if (recordingRef.current) {
          try { await recordingRef.current.stopAndUnloadAsync(); } catch { /* ignore */ }
          recordingRef.current = null;
        }

        // createAsync prepares + starts in one call (more robust than the manual
        // new Recording() + prepare + start sequence).
        const created = await Audio.Recording.createAsync(RECORDING_OPTIONS);
        recording = created.recording;
        recordingRef.current = recording;
        setIsListening(true);
        failCountRef.current = 0;

        await new Promise((r) => setTimeout(r, chunkSeconds * 1000));
        if (!loopRef.current) break;

        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        recordingRef.current = null;

        if (uri && loopRef.current) {
          await transcribeFile(uri);
          try {
            await FileSystem.deleteAsync(uri, { idempotent: true });
          } catch {
            // ignore
          }
        }

        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        recordingRef.current = null;
        if (recording) {
          try {
            await recording.stopAndUnloadAsync();
          } catch {
            // ignore
          }
        }
        if (!loopRef.current) break;

        failCountRef.current += 1;
        if (failCountRef.current >= 5) {
          setIsListening(false);
          onError?.(
            "Couldn't access the microphone. Tap Resume to retry — or just use Ctrl+Shift+Space on the PC to send the screen for an answer."
          );
          loopRef.current = false;
          break;
        }

        // Back off and re-affirm the audio session, but never let this throw out
        // of the loop (that would kill listening after a single transient error).
        try { await configureAudioSession(); } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    setIsListening(false);
  }, [chunkSeconds, transcribeFile, onError]);

  useEffect(() => {
    if (enabled && email && roomCode) {
      loopRef.current = true;
      failCountRef.current = 0;
      recordLoop();
    } else {
      loopRef.current = false;
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      setIsListening(false);
    }
    return () => {
      loopRef.current = false;
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, [enabled, email, roomCode, recordLoop]);

  return { isListening };
}
