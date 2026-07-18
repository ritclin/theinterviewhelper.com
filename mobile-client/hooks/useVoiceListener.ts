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
    staysActiveInBackground: true,
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

    try {
      await configureAudioSession();
    } catch {
      onError?.("Could not configure audio. Close other apps using the microphone and try again.");
      loopRef.current = false;
      return;
    }

    while (loopRef.current) {
      let recording: Audio.Recording | null = null;
      try {
        recording = new Audio.Recording();
        await recording.prepareToRecordAsync(RECORDING_OPTIONS);
        recordingRef.current = recording;
        await recording.startAsync();
        setIsListening(true);
        failCountRef.current = 0;

        await new Promise((r) => setTimeout(r, chunkSeconds * 1000));
        if (!loopRef.current) break;

        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        recordingRef.current = null;
        setIsListening(false);

        if (uri && loopRef.current) {
          await transcribeFile(uri);
          try {
            await FileSystem.deleteAsync(uri, { idempotent: true });
          } catch {
            // ignore
          }
        }

        await new Promise((r) => setTimeout(r, 400));
      } catch (err) {
        setIsListening(false);
        recordingRef.current = null;
        if (recording) {
          try {
            await recording.stopAndUnloadAsync();
          } catch {
            // ignore
          }
        }

        failCountRef.current += 1;
        if (failCountRef.current >= 3 || !loopRef.current) {
          onError?.(
            "Microphone error. Allow microphone access, keep the phone near laptop speakers, and tap Resume listening."
          );
          loopRef.current = false;
          break;
        }

        await configureAudioSession();
        await new Promise((r) => setTimeout(r, 800));
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
