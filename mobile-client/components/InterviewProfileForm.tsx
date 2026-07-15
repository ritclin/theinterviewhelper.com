import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";

export type InterviewProfile = {
  targetPosition: string;
  company: string;
  jobDescription: string;
  userCv: string;
};

type Props = {
  profile: InterviewProfile;
  onChange: (profile: InterviewProfile) => void;
  liveTranscript: string;
  onLiveTranscriptChange: (value: string) => void;
};

export function InterviewProfileForm({
  profile,
  onChange,
  liveTranscript,
  onLiveTranscriptChange,
}: Props) {
  const update = (field: keyof InterviewProfile, value: string) => {
    onChange({ ...profile, [field]: value });
  };

  const importCvFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/plain", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.mimeType === "text/plain" || asset.name?.endsWith(".txt")) {
        const text = await FileSystem.readAsStringAsync(asset.uri);
        update("userCv", text.slice(0, 12000));
      } else {
        update(
          "userCv",
          `${profile.userCv}\n\n[Uploaded file: ${asset.name}. Paste CV text manually if PDF.]`.trim()
        );
      }
    } catch {
      // User cancelled or file unreadable
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Your Interview Profile</Text>
      <Text style={styles.subtitle}>
        Position, job description, and CV tailor AI answers to you and the role.
      </Text>

      <Text style={styles.label}>Position interviewing for *</Text>
      <TextInput
        style={styles.input}
        value={profile.targetPosition}
        onChangeText={(v) => update("targetPosition", v)}
        placeholder="e.g. Senior Software Engineer"
        placeholderTextColor="#475569"
      />

      <Text style={styles.label}>Company (optional)</Text>
      <TextInput
        style={styles.input}
        value={profile.company}
        onChangeText={(v) => update("company", v)}
        placeholder="e.g. Google, Stripe"
        placeholderTextColor="#475569"
      />

      <Text style={styles.label}>Job description</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={profile.jobDescription}
        onChangeText={(v) => update("jobDescription", v)}
        placeholder="Paste responsibilities, skills, tech stack..."
        placeholderTextColor="#475569"
        multiline
      />

      <View style={styles.cvHeader}>
        <Text style={styles.label}>Your CV / Resume</Text>
        <TouchableOpacity onPress={importCvFile} style={styles.uploadBtn}>
          <Text style={styles.uploadBtnText}>Upload file</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={profile.userCv}
        onChangeText={(v) => update("userCv", v)}
        placeholder="Paste or upload your CV..."
        placeholderTextColor="#475569"
        multiline
      />

      <Text style={styles.label}>Live interviewer question</Text>
      <TextInput
        style={[styles.input, styles.textAreaSmall]}
        value={liveTranscript}
        onChangeText={onLiveTranscriptChange}
        placeholder="What the interviewer just asked..."
        placeholderTextColor="#475569"
        multiline
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { color: "#f8fafc", fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  subtitle: { color: "#64748b", fontSize: 11, lineHeight: 16, marginBottom: 16 },
  label: {
    color: "#6366f1",
    fontSize: 9,
    fontWeight: "bold",
    letterSpacing: 1.2,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#f8fafc",
    fontSize: 13,
  },
  textArea: { minHeight: 88, textAlignVertical: "top" },
  textAreaSmall: { minHeight: 64, textAlignVertical: "top" },
  cvHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  uploadBtn: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  uploadBtnText: { color: "#818cf8", fontSize: 10, fontWeight: "bold" },
});
