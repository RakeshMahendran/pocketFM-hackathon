"""
Sarvam AI (Bulbul v3) adapter — ACTIVE, primary provider.

Sarvam is India-first and has documented code-mixed text support (English
words embedded in an Indic language keep an Indian accent instead of
switching models), which is why it's the primary provider rather than a
per-line routing hack across vendors.

Speaker-based, not voice-ID-based: `speaker` is a lowercase name from a
fixed roster (see config/voices.json), not a UUID. bulbul:v3 has no
pitch/loudness controls (those are v2-only) — expressiveness is driven by
`temperature` instead, and pace is a 0.5-2.0 float rather than an enum.

Requires: pip install sarvamai
Env var:  SARVAM_API_KEY
"""

import os
import json
import time
import base64
import hashlib
import yaml

from src.audio.voice.providers.base import TTSProvider, SynthesisRequest, SynthesisResult, VoiceInfo, ProviderError

EMOTION_MAP_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "emotion_map.yaml")
VOICES_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "voices.json")


class SarvamProvider(TTSProvider):
    name = "sarvam"

    def __init__(self, provider_config: dict, pipeline_config: dict, cache_dir: str = "data/cache"):
        try:
            from sarvamai import SarvamAI
        except ImportError as e:
            raise ProviderError(
                "sarvamai package not installed. Run: pip install sarvamai"
            ) from e

        api_key = os.environ.get("SARVAM_API_KEY")
        if not api_key:
            raise ProviderError("SARVAM_API_KEY environment variable is not set.")

        self.client = SarvamAI(api_subscription_key=api_key)
        self.model = provider_config.get("model", "bulbul:v3")
        self.pace_map = provider_config.get(
            "pace_map", {"slow": 0.95, "normal": 1.0, "clipped": 1.05, "fast": 1.1}
        )
        self.default_pace = provider_config.get("pace", 1.0)
        self.temperature_spread = provider_config.get("temperature_spread", 0.4)
        self.dict_id = provider_config.get("dict_id") or None
        self.cache_dir = cache_dir

        self.retry_attempts = pipeline_config.get("retry", {}).get("max_attempts", 3)
        self.retry_backoff = pipeline_config.get("retry", {}).get("backoff_seconds", 2)

        with open(EMOTION_MAP_PATH, "r", encoding="utf-8") as f:
            self.emotion_map = yaml.safe_load(f)["sarvam"]

    def resolve_voice_id(self, character_id: str, casting_config: dict) -> str:
        entry = casting_config.get(character_id)
        if not entry or "sarvam" not in entry:
            raise ProviderError(f"No Sarvam speaker cast for character '{character_id}'.")
        speaker = entry["sarvam"]
        if speaker.startswith("REPLACE"):
            raise ProviderError(
                f"Character '{character_id}' still has a placeholder speaker in casting.json."
            )
        return speaker

    def list_voices(self) -> list:
        """Sarvam has no public voice-search endpoint (confirmed against current
        docs) — its speaker roster is a small fixed set. Read it from
        config/voices.json, which the casting resolver scores against character
        personas. `speaker=` must be lowercase, so normalize here."""
        if not os.path.exists(VOICES_PATH):
            return []
        with open(VOICES_PATH, "r", encoding="utf-8") as f:
            roster = json.load(f)
        return [
            VoiceInfo(
                provider=self.name,
                voice_id=v["name"].lower(),
                name=v["name"],
                gender=v.get("gender", ""),
                description=v.get("description", "") + (" (featured)" if v.get("featured") else ""),
            )
            for v in roster
        ]

    @staticmethod
    def _lang_code(language: str) -> str:
        # episode.json uses hi/en/hi-en/ta/ta-en — Sarvam wants BCP-47 style
        # codes. Code-mixed lines still target the Indic language code;
        # bulbul:v3's code-mixed text support is what keeps embedded English
        # words Indian-accented instead of switching models mid-utterance.
        return {
            "hi": "hi-IN", "en": "en-IN", "hi-en": "hi-IN",
            "ta": "ta-IN", "ta-en": "ta-IN",
        }.get(language, "hi-IN")

    def _pace_value(self, pace: str) -> float:
        return self.pace_map.get(pace, self.default_pace)

    def _temperature_value(self, emotion: str, intensity: float) -> float:
        base_temp = self.emotion_map.get(emotion, {"temperature": 0.5}).get("temperature", 0.5)
        temp = base_temp + (intensity - 0.5) * self.temperature_spread
        # Live API rejects temperature > 1.0 (bulbul:v3's actual ceiling —
        # docs at write time said 2.0, but the server-side validator caps
        # at 1.0; confirmed by a real 400 on hurt_anger/urgency at high
        # intensity). Clamp to what the API actually accepts.
        return max(0.01, min(1.0, temp))

    def synthesize(self, request: SynthesisRequest, voice_id: str) -> SynthesisResult:
        pace_value = self._pace_value(request.pace)
        temperature_value = self._temperature_value(request.emotion, request.intensity)

        kwargs = dict(
            model=self.model,
            text=request.text,
            target_language_code=self._lang_code(request.language),
            speaker=voice_id,
            pace=pace_value,
            temperature=temperature_value,
            output_audio_codec="mp3",
        )
        if self.dict_id:
            kwargs["dict_id"] = self.dict_id

        last_error = None
        for attempt in range(1, self.retry_attempts + 1):
            try:
                response = self.client.text_to_speech.convert(**kwargs)

                # Sarvam's REST/SDK response carries audio as base64 text, not
                # raw bytes — decoding is required or the file is corrupt.
                audio_bytes = base64.b64decode(response.audios[0])

                fname = hashlib.sha256(
                    f"{voice_id}:{request.text}:{request.emotion}:"
                    f"{request.intensity}:{request.pace}".encode("utf-8")
                ).hexdigest()[:16]
                out_path = os.path.join(self.cache_dir, f"{self.name}_{request.character_id}_{fname}.mp3")
                os.makedirs(self.cache_dir, exist_ok=True)

                with open(out_path, "wb") as f:
                    f.write(audio_bytes)

                return SynthesisResult(
                    audio_path=out_path,
                    duration_ms=0,  # populated later by audio_post from the decoded clip
                    provider=self.name,
                    line_id=request.line_id,
                    voice_id=voice_id,
                    raw_meta={"model": self.model, "temperature": temperature_value, "pace": pace_value},
                )

            except Exception as e:  # noqa: BLE001 - deliberately broad, we retry then re-raise
                last_error = e
                if attempt < self.retry_attempts:
                    time.sleep(self.retry_backoff * attempt)
                    continue

        raise ProviderError(
            f"Sarvam synthesis failed for line '{request.line_id}' after "
            f"{self.retry_attempts} attempts: {last_error}"
        )
