/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RoomState {
  roomCode: string;
  hostSocketId: string;
  clientSocketIds: string[];
  created: number;
}

export interface SocketPayload {
  image?: string; // base64 screenshot
  audioTranscript?: string; // speech-to-text text
  prompt?: string; // manual candidate input
  timestamp: number;
}

export interface InterviewScenario {
  id: string;
  title: string;
  role: string;
  company: string;
  transcript: string;
  imageName: string; // descriptive placeholder or simulation category
  mockImageText: string; // The code shown in the screenshot simulation
}

export interface SuggestionHistoryItem {
  role: "assistant" | "system";
  content: string;
  timestamp: string;
}
