"""
Mock provider — generates silent placeholder audio locally, no network
or API key required. Use this to test the orchestrator, caching, schema
validation, and audio stitching end-to-end before spending real TTS
credits, and in CI.

Duration is estimated from character count so stitched episode timing
is roughly realistic even though there's no actual speech.
"""

import os
import hashlib

from src.audio.voice.providers.base import TTSProvider, SynthesisRequest, SynthesisResult, ProviderError

try:
    from pydub import AudioSegment
    from pydub.generators import Sine
except ImportError as e:  # pragma: no cover
    AudioSegment = None


class MockProvider(TTSProvider):
    name = "mock"
    requires_casting = False

    def __init__(self, provider_config: dict, pipeline_config: dict, cache_dir: str = "data/cache"):
        if AudioSegment is None:
            raise ProviderError("pydub not installed. Run: pip install pydub")
        self.chars_per_second = provider_config.get("chars_per_second", 15)
        self.cache_dir = cache_dir

    def resolve_voice_id(self, character_id: str, casting_config: dict) -> str:
        # Mock provider doesn't need real voice IDs — character_id doubles as one.
        return character_id

    def list_voices(self) -> list:
        # No real voice library — casting is a no-op for this provider.
        return []

    def synthesize(self, request: SynthesisRequest, voice_id: str) -> SynthesisResult:
        duration_s = max(0.6, len(request.text) / self.chars_per_second)
        duration_ms = int(duration_s * 1000)

        # A soft tone rather than pure silence, so you can audibly confirm
        # line boundaries and pacing when eyeballing the stitched episode.
        tone = Sine(220).to_audio_segment(duration=duration_ms).apply_gain(-28)

        fname = hashlib.sha256(
            f"{voice_id}:{request.text}:{request.emotion}".encode("utf-8")
        ).hexdigest()[:16]
        os.makedirs(self.cache_dir, exist_ok=True)
        out_path = os.path.join(self.cache_dir, f"{self.name}_{request.character_id}_{fname}.mp3")
        tone.export(out_path, format="mp3")

        return SynthesisResult(
            audio_path=out_path,
            duration_ms=duration_ms,
            provider=self.name,
            line_id=request.line_id,
            voice_id=voice_id,
            raw_meta={"emotion": request.emotion, "note": "MOCK AUDIO — not real speech"},
        )
