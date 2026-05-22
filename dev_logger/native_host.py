import json
import os
import struct
import sys
from datetime import datetime, timezone
from pathlib import Path


LOG_DIR = Path(os.environ.get("LOCALAPPDATA", ".")) / "AutoRe" / "dev_logger"
LOG_FILE = LOG_DIR / "events.ndjson"


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    message_length = struct.unpack("<I", raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode("utf-8")
    return json.loads(message)


def send_message(payload):
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def append_log(record):
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def main():
    while True:
        msg = read_message()
        if msg is None:
            break
        now = datetime.now(timezone.utc).isoformat()
        entry = {
            "receivedAt": now,
            "type": msg.get("type", ""),
            "source": msg.get("source", ""),
            "entry": msg.get("entry", {}),
        }
        append_log(entry)
        send_message({"ok": True, "ts": now, "path": str(LOG_FILE)})


if __name__ == "__main__":
    main()
