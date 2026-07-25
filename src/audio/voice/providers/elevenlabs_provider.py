"""
ElevenLabs adapter. Translates the provider-agnostic SynthesisRequest into
an ElevenLabs API call, using eleven_v3 audio tags for emotional direction.

Requires: pip install elevenlabs
Env var:  ELEVENLABS_API_KEY
"""

import os
import time
import hashlib
import yaml

from src.audio.voice.providers.base import TTSProvider, SynthesisRequest, SynthesisResult, VoiceInfo, ProviderError

EMOTION_MAP_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "emotion_map.yaml")


class ElevenLabsProvider(TTSProvider):
    name = "elevenlabs"

    def __init__(self, provider_config: dict, pipeline_config: dict, cache_dir: str = "data/cache"):
        try:
            from elevenlabs.client import ElevenLabs
        except ImportError as e:
            raise ProviderError(
                "elevenlabs package not installed. Run: pip install elevenlabs"
            ) from e

        api_key = os.environ.get("ELEVENLABS_API_KEY")
        if not api_key:
            raise ProviderError("ELEVENLABS_API_KEY environment variable is not set.")

        self.client = ElevenLabs(api_key=api_key)
        self.model_id = provider_config.get("model_id", "eleven_v3")
        self.output_format = provider_config.get("output_format", "mp3_44100_128")
        self.max_chars = provider_config.get("max_chars_per_call", 3000)
        # eleven_v3's bracketed audio tags accept free-form descriptive text,
        # not just emotion words — this is the closest thing ElevenLabs has
        # to a "system prompt" for overall delivery style. Merged into every
        # line's tag alongside the per-emotion tag. Sarvam's API has no
        # equivalent free-text field (see providers/sarvam_provider.py) —
        # its only style levers are the structured `pace`/`temperature`
        # params, so this directive is ElevenLabs-only by nature.
        self.style_directive = provider_config.get("style_directive", "")
        self.cache_dir = cache_dir

        self.retry_attempts = pipeline_config.get("retry", {}).get("max_attempts", 3)
        self.retry_backoff = pipeline_config.get("retry", {}).get("backoff_seconds", 2)

        with open(EMOTION_MAP_PATH, "r", encoding="utf-8") as f:
            self.emotion_map = yaml.safe_load(f)["elevenlabs"]

    def resolve_voice_id(self, character_id: str, casting_config: dict) -> str:
        entry = casting_config.get(character_id)
        if not entry or "elevenlabs" not in entry:
            raise ProviderError(f"No ElevenLabs voice_id cast for character '{character_id}'.")
        voice_id = entry["elevenlabs"]
        if voice_id.startswith("REPLACE"):
            raise ProviderError(
                f"Character '{character_id}' still has a placeholder voice_id in casting.json."
            )
        return voice_id

    def list_voices(self) -> list:
        response = self.client.voices.search(page_size=100)
        voices = []
        for v in response.voices:
            labels = v.labels or {}
            voices.append(VoiceInfo(
                provider=self.name,
                voice_id=v.voice_id,
                name=v.name,
                gender=labels.get("gender", ""),
                age=labels.get("age", ""),
                accent=labels.get("accent", ""),
                description=v.description or labels.get("description", ""),
            ))
        return voices

    def _build_prompted_text(self, request: SynthesisRequest) -> str:
        emotion_tag = self.emotion_map.get(request.emotion, "")
        # Combine the per-emotion tag with the global style directive into
        # one bracketed tag, e.g. "[hurt, sharp tone, conversational, casual
        # everyday pacing]" — eleven_v3 reads bracketed text as delivery
        # instructions, so both compose into a single steering prompt.
        tag_parts = [p for p in (emotion_tag.strip("[]"), self.style_directive) if p]
        tag = f"[{', '.join(tag_parts)}]" if tag_parts else ""

        text = request.text
        if len(text) > self.max_chars:
            raise ProviderError(
                f"Line '{request.line_id}' exceeds {self.max_chars} chars for eleven_v3. "
                f"Split it into multiple lines in the episode script."
            )
        return f"{tag} {text}".strip() if tag else text

    def synthesize(self, request: SynthesisRequest, voice_id: str) -> SynthesisResult:
        prompted_text = self._build_prompted_text(request)

        last_error = None
        for attempt in range(1, self.retry_attempts + 1):
            try:
                audio_stream = self.client.text_to_speech.convert(
                    text=prompted_text,
                    voice_id=voice_id,
                    model_id=self.model_id,
                    output_format=self.output_format,
                )

                fname = hashlib.sha256(
                    f"{voice_id}:{prompted_text}".encode("utf-8")
                ).hexdigest()[:16]
                out_path = os.path.join(self.cache_dir, f"{self.name}_{request.character_id}_{fname}.mp3")
                os.makedirs(self.cache_dir, exist_ok=True)

                with open(out_path, "wb") as f:
                    for chunk in audio_stream:
                        if chunk:
                            f.write(chunk)

                return SynthesisResult(
                    audio_path=out_path,
                    duration_ms=0,  # populated later by audio_post via mutagen/ffprobe
                    provider=self.name,
                    line_id=request.line_id,
                    voice_id=voice_id,
                    raw_meta={"model_id": self.model_id, "emotion_tag": self.emotion_map.get(request.emotion, "")},
                )

            except Exception as e:  # noqa: BLE001 - deliberately broad, we retry then re-raise
                last_error = e
                if attempt < self.retry_attempts:
                    time.sleep(self.retry_backoff * attempt)
                    continue

        raise ProviderError(
            f"ElevenLabs synthesis failed for line '{request.line_id}' after "
            f"{self.retry_attempts} attempts: {last_error}"
        )
