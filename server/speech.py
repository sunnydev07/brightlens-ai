import os
import sys
from faster_whisper import WhisperModel

# Use int8 by default for CPU to avoid float16 fallback warnings.
model = WhisperModel("base", compute_type="int8")


def main() -> int:
	if len(sys.argv) < 2:
		print("")
		return 0

	audio_path = sys.argv[1]

	if not os.path.exists(audio_path) or os.path.getsize(audio_path) < 1024:
		print("")
		return 0

	try:
		segments, _ = model.transcribe(audio_path)
		text = " ".join(seg.text for seg in segments).strip()
		print(text)
		return 0
	except Exception as exc:
		# Invalid/truncated uploads can fail decoding; treat as empty transcript.
		print("")
		print(f"[speech.py] decode/transcribe error: {exc}", file=sys.stderr)
		return 0


if __name__ == "__main__":
	raise SystemExit(main())