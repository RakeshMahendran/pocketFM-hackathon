"""
Core provider-agnostic interface.

Every TTS vendor adapter (ElevenLabs, Sarvam, Google, Azure, ...) implements
this ABC. The orchestrator and audio-post modules only ever import from
this file — never from a vendor-specific module. That's what makes the
pipeline swappable.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class SynthesisRequest:
    text: str
    character_id: str
    emotion: str
    intensity: float
    language: str
    pace: str = "normal"
    line_id: str = ""


@dataclass
class SynthesisResult:
    audio_path: str
    duration_ms: int
    provider: str
    line_id: str
    voice_id: str = ""
    raw_meta: dict = field(default_factory=dict)


@dataclass
class VoiceInfo:
    """A single castable voice/speaker, as reported by a provider's list_voices()."""
    provider: str
    voice_id: str
    name: str
    gender: str = ""
    age: str = ""
    accent: str = ""
    description: str = ""


class ProviderError(Exception):
    """Raised by adapters on unrecoverable synthesis failure."""


class TTSProvider(ABC):
    """Common interface all vendor adapters must implement."""

    name: str = "base"
    requires_casting: bool = True

    @abstractmethod
    def resolve_voice_id(self, character_id: str, casting_config: dict) -> str:
        """Look up this provider's voice identifier for a given character."""
        raise NotImplementedError

    @abstractmethod
    def synthesize(self, request: SynthesisRequest, voice_id: str) -> SynthesisResult:
        """Generate audio for a single line and return a SynthesisResult."""
        raise NotImplementedError

    @abstractmethod
    def list_voices(self) -> list:
        """Return every castable VoiceInfo this provider offers, for casting_resolver
        to score against character personas. Providers with requires_casting = False
        (e.g. mock) may return an empty list."""
        raise NotImplementedError

    def validate_casting(self, characters: list, casting_config: dict) -> list:
        """Return a list of character_ids missing a voice mapping for this provider.
        Call this before spending any API calls on a full episode."""
        missing = []
        for c in characters:
            cid = c["id"] if isinstance(c, dict) else c
            entry = casting_config.get(cid, {})
            if self.name not in entry or not entry[self.name] or entry[self.name].startswith("REPLACE"):
                missing.append(cid)
        return missing
