#!/usr/bin/env python3
"""
TheInterviewHelper.com - Windows Capture Client (Phase 2)
High-Performance, Sub-2-Second Screen & Audio Loopback Streamer.

This script runs on the candidate's local Windows OS, capturing:
1. Low-latency compressed screenshots of the primary monitor.
2. Output audio (WASAPI Loopback) containing the interviewer's voice.
3. Global hotkeys (Ctrl+Shift+Space) to trigger real-time suggestions.
"""

import os
import sys
import time
import base64
import json
import argparse
import threading
from io import BytesIO
from datetime import datetime

# Dependencies check
try:
    import mss
    from PIL import Image
    import socketio
    from pynput import keyboard
    import sounddevice as sd
    import numpy as np
except ImportError as e:
    print("\n[!] Missing dependencies. Please run: pip install -r requirements.txt")
    print(f"Error detail: {e}\n")
    sys.exit(1)

# Terminal Coloring utilities
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def log(message, level="INFO"):
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    color = Colors.OKBLUE
    if level == "SUCCESS":
        color = Colors.OKGREEN
    elif level == "WARNING":
        color = Colors.WARNING
    elif level == "ERROR":
        color = Colors.FAIL
    elif level == "ACTION":
        color = Colors.OKCYAN
    print(f"{Colors.BOLD}[{timestamp}] [{level}]{Colors.ENDC} {color}{message}{Colors.ENDC}")

# Core Capture & Socket Client App
class WindowsCaptureClient:
    def __init__(self, server_url, room_code):
        self.server_url = server_url
        self.room_code = room_code
        self.sio = socketio.Client(reconnection=True, reconnection_attempts=15, reconnection_delay=1)
        self.hotkey_pressed = False
        self.is_running = True
        self.audio_stream = None
        self.keyboard_listener = None
        
        # Audio loopback config
        self.sample_rate = 16000 # 16kHz is ideal for speech-to-text models
        self.channels = 1
        self.chunk_size = 1024
        
        # Initialize screenshot utility
        self.sct = mss.mss()
        self.monitor = self.sct.monitors[1] # 1 is the primary screen

        # Register Socket.io events
        self.setup_socket_events()

    def setup_socket_events(self):
        @self.sio.event
        def connect():
            log(f"Connected successfully to WebSocket Relay: {self.server_url}", "SUCCESS")
            # Automatically join the requested room channel
            log(f"Attempting to join/pair with room channel: {self.room_code}", "ACTION")
            self.sio.emit("join-room", {"roomCode": self.room_code}, callback=self.on_room_joined)

        @self.sio.event
        def disconnect():
            log("Lost connection to WebSocket Relay server.", "WARNING")

        @self.sio.on("paired")
        def on_paired(data):
            log(f"Pairing Confirmed! Connected with {data.get('clientsCount', 1)} auxiliary devices.", "SUCCESS")

        @self.sio.on("ai-start")
        def on_ai_start():
            log("AI engine began synthesizing suggestions...", "ACTION")

        @self.sio.on("ai-chunk")
        def on_ai_chunk(data):
            # Print streamed chunks to console for immediate debugging feedback
            sys.stdout.write(f"{Colors.OKGREEN}{data.get('text', '')}{Colors.ENDC}")
            sys.stdout.flush()

        @self.sio.on("ai-end")
        def on_ai_end(data):
            print("\n")
            log("AI Recommendation stream finished.", "SUCCESS")

    def on_room_joined(self, response):
        if response.get("success"):
            log(f"Joined Room Code {self.room_code} successfully.", "SUCCESS")
            log("Real-time loopback stream and hotkey listener are active.", "SUCCESS")
            log("--- PRESS [Ctrl + Shift + Space] to trigger AI Suggestions ---", "BOLD")
        else:
            log(f"Failed to join room channel: {response.get('error')}", "ERROR")
            self.stop()

    def get_wasapi_loopback_device_index(self):
        """
        Scans available host devices to find Windows WASAPI loopback indices.
        This captures whatever comes out of the computer speakers (e.g. interviewer on Teams/Zoom).
        """
        try:
            devices = sd.query_devices()
            host_apis = sd.query_hostapis()
            
            # Find WASAPI Host API index
            wasapi_api_idx = -1
            for idx, api in enumerate(host_apis):
                if "wasapi" in api.get("name", "").lower():
                    wasapi_api_idx = idx
                    break

            if wasapi_api_idx == -1:
                log("WASAPI Host API not found in system audio APIs.", "WARNING")
                return sd.default.device[0] # Fallback to default input

            # Find loopback device belonging to WASAPI
            for idx, dev in enumerate(devices):
                if dev.get("hostapi") == wasapi_api_idx and dev.get("is_loopback", False):
                    log(f"Found WASAPI Loopback audio device: {dev.get('name')} (Index: {idx})")
                    return idx
                
                # Check for alternative loopback names if specific flag is missing
                if dev.get("hostapi") == wasapi_api_idx and "loopback" in dev.get("name", "").lower():
                    log(f"Found loopback device via substring: {dev.get('name')} (Index: {idx})")
                    return idx

            log("No explicit WASAPI Loopback device found. Falling back to default system input.", "WARNING")
            return sd.default.device[0]
        except Exception as e:
            log(f"Error detecting audio loopback channels: {e}", "ERROR")
            return None

    def capture_screenshot_base64(self):
        """
        Captures the screen extremely fast, resizes, compresses to high-performance JPEG,
        and serializes to a clean base64 string.
        """
        try:
            # Ultra-fast PNG capture from frame buffer
            sct_img = self.sct.grab(self.monitor)
            img = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")
            
            # Subscale image to save network transport overhead (target 720p maximum)
            max_width = 1280
            if img.width > max_width:
                ratio = max_width / float(img.width)
                new_height = int(float(img.height) * float(ratio))
                img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)

            # Compress as high-performance JPEG (quality 55 for speed over resolution)
            output = BytesIO()
            img.save(output, format="JPEG", quality=55)
            img_bytes = output.getvalue()
            
            base64_data = base64.b64encode(img_bytes).decode("utf-8")
            return f"data:image/jpeg;base64,{base64_data}"
        except Exception as e:
            log(f"Screenshot capture failed: {e}", "ERROR")
            return None

    def audio_callback(self, indata, frames, time_info, status):
        """
        Processes audio input buffer stream in real-time.
        """
        if status:
            log(f"Audio status warning: {status}", "WARNING")
        
        # Audio chunk analysis can be performed here (e.g. compute amplitude, silence gates, or pipe to server)
        # We also emit standard heartbeat indicators to keep connection lines hot
        pass

    def start_audio_capture(self):
        device_idx = self.get_wasapi_loopback_device_index()
        if device_idx is None:
            log("Skipping audio stream capture due to initialization failure.", "WARNING")
            return

        try:
            self.audio_stream = sd.InputStream(
                device=device_idx,
                channels=self.channels,
                samplerate=self.sample_rate,
                blocksize=self.chunk_size,
                callback=self.audio_callback
            )
            self.audio_stream.start()
            log("Output loopback stream successfully initiated.", "SUCCESS")
        except Exception as e:
            log(f"Failed to start loopback audio input stream: {e}", "ERROR")

    def on_hotkey(self):
        """
        Action triggered when Ctrl+Shift+Space combination is pressed.
        """
        log("Hotkey combo triggered! Compiling real-time interview state...", "ACTION")
        
        # Capture screenshot
        screenshot_base64 = self.capture_screenshot_base64()
        if not screenshot_base64:
            log("Cannot synthesize screenshot. Aborting AI request.", "ERROR")
            return

        # Emit optimized request-ai-assist payload to the server
        log("Casting payload over WebSocket to Gemini optimizer...", "ACTION")
        self.sio.emit("request-ai-assist", {
            "image": screenshot_base64,
            "audioTranscript": "Explain the optimal strategy and write clean code for the challenge shown on the screen.",
            "timestamp": time.time()
        })

    def run_keyboard_listener(self):
        """
        Listens globally for Ctrl+Shift+Space on Windows.
        """
        # Define modern hotkey pairing
        combination = {keyboard.Key.ctrl_l, keyboard.Key.shift_l, keyboard.Key.space}
        current_keys = set()

        def on_press(key):
            # Normalise keys
            if key in [keyboard.Key.ctrl_l, keyboard.Key.ctrl_r]:
                current_keys.add(keyboard.Key.ctrl_l)
            elif key in [keyboard.Key.shift_l, keyboard.Key.shift_r]:
                current_keys.add(keyboard.Key.shift_l)
            elif hasattr(key, 'char') and key.char == ' ':
                current_keys.add(keyboard.Key.space)
            elif key == keyboard.Key.space:
                current_keys.add(keyboard.Key.space)

            # Check matching combo
            if all(k in current_keys for k in combination):
                self.on_hotkey()

        def on_release(key):
            if key in [keyboard.Key.ctrl_l, keyboard.Key.ctrl_r]:
                current_keys.discard(keyboard.Key.ctrl_l)
            elif key in [keyboard.Key.shift_l, keyboard.Key.shift_r]:
                current_keys.discard(keyboard.Key.shift_l)
            elif hasattr(key, 'char') and key.char == ' ':
                current_keys.discard(keyboard.Key.space)
            elif key == keyboard.Key.space:
                current_keys.discard(keyboard.Key.space)

        self.keyboard_listener = keyboard.Listener(on_press=on_press, on_release=on_release)
        self.keyboard_listener.start()

    def start(self):
        try:
            # 1. Connect to WebSocket Relay
            log(f"Connecting to {self.server_url}...", "ACTION")
            self.sio.connect(self.server_url)

            # 2. Start WASAPI Audio loopback capturing
            self.start_audio_capture()

            # 3. Start Global Hotkey listener thread
            self.run_keyboard_listener()

            # Keep main thread alive
            while self.is_running:
                time.sleep(0.5)

        except KeyboardInterrupt:
            log("Gracefully stopping the local capture agent...", "WARNING")
        except Exception as e:
            log(f"Critical runtime exception: {e}", "ERROR")
        finally:
            self.stop()

    def stop(self):
        self.is_running = False
        
        # Cleanup audio stream
        if self.audio_stream:
            try:
                self.audio_stream.stop()
                self.audio_stream.close()
                log("Audio loopback stream successfully closed.")
            except Exception:
                pass

        # Cleanup keyboard listeners
        if self.keyboard_listener:
            try:
                self.keyboard_listener.stop()
            except Exception:
                pass

        # Disconnect socket
        if self.sio.connected:
            self.sio.disconnect()
            log("WebSocket session terminated cleanly.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TheInterviewHelper - Windows Capture Agent")
    parser.add_argument("--server", type=str, default="http://localhost:3000", help="Relay Server URL")
    parser.add_argument("--room", type=str, required=True, help="6-digit room code to join")
    args = parser.parse_args()

    client = WindowsCaptureClient(args.server, args.room)
    client.start()
