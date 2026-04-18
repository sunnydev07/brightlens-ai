import sys
from faster_whisper import WhisperModel

model = WhisperModel("base")

audio_path = sys.argv[1]

segments, _ = model.transcribe(audio_path)
text = " ".join([seg.text for seg in segments])

print(text)