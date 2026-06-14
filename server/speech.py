import os
import sys

from faster_whisper import WhisperModel


MODEL_NAME_OR_PATH = os.environ.get("BRIGHTLENS_WHISPER_MODEL", "base")
_model = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        # Runtime transcription is local-only. Model files must already exist.
        _model = WhisperModel(
            MODEL_NAME_OR_PATH,
            compute_type="int8",
            local_files_only=True,
        )
    return _model


def main() -> int:
    if len(sys.argv) < 2:
        print("")
        return 0

    audio_path = sys.argv[1]

    if not os.path.exists(audio_path) or os.path.getsize(audio_path) < 1024:
        print("")
        return 0

    try:
        segments, _ = get_model().transcribe(audio_path)
        text = " ".join(segment.text for segment in segments).strip()
        print(text)
        return 0
    except Exception as exc:
        print(f"[speech.py] local decode/transcribe error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
