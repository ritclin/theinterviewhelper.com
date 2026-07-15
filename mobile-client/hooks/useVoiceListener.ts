import { useCallback, useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

type Options = {
  enabled: boolean;
  email: string;
  roomCode: string;
  serverUrl: string;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  chunkSeconds?: number;
};

export function useVoiceListener({
  enabled,
  email,
  roomCode,
  serverUrl,
  onTranscript,
  onError,
  chunkSeconds = 7,
}: Options) {
  const [isListening, setIsListening] = useState(false);
  const loopRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

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
          mimeType: "audio/mp4",
          audioBase64,
        }),
      });
      const data = await res.json();
      if (data.success && data.transcript?.trim()) {
        onTranscript(data.transcript.trim());
      } else if (!data.success && data.error) {
        onError?.(data.error);
      }
    },
    [email, roomCode, serverUrl, onTranscript, onError]
  );

  const recordLoop = useCallback(async () => {
    while (loopRef.current) {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync({
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          android: {
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
            extension: ".m4a",
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
          },
          ios: {
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
            extension: ".m4a",
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          },
        });
        recordingRef.current = recording;
        await recording.startAsync();
        setIsListening(true);

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
      } catch (err) {
        setIsListening(false);
        onError?.("Microphone access failed. Keep phone near laptop speakers.");
        loopRef.current = false;
        break;
      }
    }
    setIsListening(false);
  }, [chunkSeconds, transcribeFile, onError]);

  useEffect(() => {
    if (enabled && email && roomCode) {
      loopRef.current = true;
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
