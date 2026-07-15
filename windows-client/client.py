#!/usr/bin/env python3
"""
TheInterviewHelper.com - Windows Stealth Capture Client
Runs hidden in the system tray. Captures full-screen screenshots and relays
them to the paired Android app via the cloud relay server.

Hotkey: Ctrl+Shift+Space — capture screen and send to Android
"""

from __future__ import annotations

import argparse
import base64
import io
import logging
import os
import sys
import threading
import time
from datetime import datetime
from typing import Optional

try:
    import mss
    from PIL import Image
    import socketio
    from pynput import keyboard
except ImportError as exc:
    print("Missing dependencies. Run: pip install -r requirements.txt")
    print(exc)
    sys.exit(1)

DEFAULT_SERVER = "https://theinterviewhelpercom-production.up.railway.app"
MAX_PAYLOAD_BYTES = 5 * 1024 * 1024
LOG_FILE = os.path.join(os.environ.get("LOCALAPPDATA", "."), "InterviewHelper", "capture.log")


def setup_logging(stealth: bool) -> None:
    handlers: list[logging.Handler] = [logging.FileHandler(LOG_FILE, encoding="utf-8")]
    if not stealth:
        handlers.append(logging.StreamHandler(sys.stdout))
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=handlers,
    )


class WindowsCaptureClient:
    def __init__(self, server_url: str, room_code: str, stealth: bool = False):
        self.server_url = server_url.rstrip("/")
        self.room_code = room_code
        self.stealth = stealth
        self.is_running = True
        self.connected = False
        self.sio = socketio.Client(reconnection=True, reconnection_attempts=20, reconnection_delay=1)
        self.sct = mss.mss()
        self.monitor = self.sct.monitors[1]
        self.keyboard_listener: Optional[keyboard.Listener] = None
        self._setup_socket_events()

    def _setup_socket_events(self) -> None:
        @self.sio.event
        def connect():
            self.connected = True
            logging.info("Connected to relay: %s", self.server_url)
            self.sio.emit("join-room", {"roomCode": self.room_code}, callback=self._on_room_joined)

        @self.sio.event
        def disconnect():
            self.connected = False
            logging.warning("Disconnected from relay")

        @self.sio.on("paired")
        def on_paired(data):
            logging.info("Paired with room %s (%s clients)", self.room_code, data.get("clientsCount", 1))

        @self.sio.on("stream-error")
        def on_stream_error(data):
            logging.error("Stream error: %s", data.get("error"))

    def _on_room_joined(self, response) -> None:
        if response and response.get("success"):
            logging.info("Joined room %s — hotkey Ctrl+Shift+Space active", self.room_code)
        else:
            logging.error("Join failed: %s", (response or {}).get("error", "unknown"))
            self.stop()

    def capture_screenshot_base64(self) -> Optional[str]:
        """Capture primary monitor at full resolution, compress to fit relay limit."""
        try:
            shot = self.sct.grab(self.monitor)
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")

            quality = 88
            while quality >= 40:
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=quality, optimize=True)
                raw = buf.getvalue()
                if len(raw) <= MAX_PAYLOAD_BYTES - 256 * 1024:
                    encoded = base64.b64encode(raw).decode("utf-8")
                    logging.info("Screenshot captured %sx%s (%d KB, q=%d)", img.width, img.height, len(raw) // 1024, quality)
                    return f"data:image/jpeg;base64,{encoded}"
                quality -= 8

            # Last resort: scale down if still too large
            scale = 0.75
            while scale >= 0.35:
                resized = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
                buf = io.BytesIO()
                resized.save(buf, format="JPEG", quality=72, optimize=True)
                raw = buf.getvalue()
                if len(raw) <= MAX_PAYLOAD_BYTES - 256 * 1024:
                    encoded = base64.b64encode(raw).decode("utf-8")
                    logging.info("Screenshot scaled to %sx%s (%d KB)", resized.width, resized.height, len(raw) // 1024)
                    return f"data:image/jpeg;base64,{encoded}"
                scale -= 0.1

            logging.error("Screenshot too large after compression")
            return None
        except Exception as exc:
            logging.exception("Screenshot failed: %s", exc)
            return None

    def send_screenshot_to_android(self) -> None:
        if not self.connected:
            logging.warning("Not connected — cannot send screenshot")
            return

        image_b64 = self.capture_screenshot_base64()
        if not image_b64:
            return

        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        payload = {
            "image": image_b64,
            "imageName": f"screen-{timestamp}.jpg",
            "imageText": "Full-screen capture from Windows client",
            "source": "windows-stealth",
            "timestamp": time.time(),
        }
        self.sio.emit("stream-data", payload)
        logging.info("Screenshot sent to Android via room %s", self.room_code)

    def _run_hotkey_listener(self) -> None:
        combo = {keyboard.Key.ctrl_l, keyboard.Key.shift_l, keyboard.Key.space}
        pressed: set = set()

        def normalize(key):
            if key in (keyboard.Key.ctrl_l, keyboard.Key.ctrl_r):
                return keyboard.Key.ctrl_l
            if key in (keyboard.Key.shift_l, keyboard.Key.shift_r):
                return keyboard.Key.shift_l
            if key == keyboard.Key.space:
                return keyboard.Key.space
            return key

        def on_press(key):
            pressed.add(normalize(key))
            if combo.issubset(pressed):
                threading.Thread(target=self.send_screenshot_to_android, daemon=True).start()

        def on_release(key):
            pressed.discard(normalize(key))

        self.keyboard_listener = keyboard.Listener(on_press=on_press, on_release=on_release)
        self.keyboard_listener.start()

    def connect_and_run(self) -> None:
        logging.info("Connecting to %s …", self.server_url)
        self.sio.connect(self.server_url, transports=["websocket", "polling"])
        self._run_hotkey_listener()
        while self.is_running:
            time.sleep(0.5)

    def stop(self) -> None:
        self.is_running = False
        if self.keyboard_listener:
            try:
                self.keyboard_listener.stop()
            except Exception:
                pass
        if self.sio.connected:
            self.sio.disconnect()


def run_stealth_tray(client: WindowsCaptureClient) -> None:
    try:
        import pystray
        from PIL import ImageDraw
    except ImportError:
        logging.error("pystray not installed. Run: pip install pystray")
        client.connect_and_run()
        return

    def create_icon_image():
        img = Image.new("RGB", (64, 64), color=(79, 70, 229))
        draw = ImageDraw.Draw(img)
        draw.rectangle((16, 16, 48, 48), fill=(129, 140, 248))
        return img

    def on_capture(icon, _item):
        threading.Thread(target=client.send_screenshot_to_android, daemon=True).start()

    def on_quit(icon, _item):
        client.stop()
        icon.stop()

    menu = pystray.Menu(
        pystray.MenuItem("Capture & send to phone", on_capture),
        pystray.MenuItem("Quit", on_quit),
    )
    icon = pystray.Icon(
        "InterviewHelperCapture",
        create_icon_image(),
        f"Interview Helper — Room {client.room_code}",
        menu,
    )

    worker = threading.Thread(target=client.connect_and_run, daemon=True)
    worker.start()
    icon.run()


def parse_args():
    parser = argparse.ArgumentParser(description="Interview Helper — Windows stealth capture client")
    parser.add_argument("--server", default=DEFAULT_SERVER, help="Relay server URL")
    parser.add_argument("--room", required=True, help="6-digit pairing code from Android app")
    parser.add_argument("--stealth", action="store_true", help="Run hidden in system tray (no console)")
    return parser.parse_args()


def main():
    args = parse_args()
    if len(args.room) != 6 or not args.room.isdigit():
        print("Error: --room must be a 6-digit code from the Android app")
        sys.exit(1)

    setup_logging(args.stealth)
    client = WindowsCaptureClient(args.server, args.room, stealth=args.stealth)

    if args.stealth:
        run_stealth_tray(client)
    else:
        try:
            client.connect_and_run()
        except KeyboardInterrupt:
            pass
        finally:
            client.stop()


if __name__ == "__main__":
    main()
