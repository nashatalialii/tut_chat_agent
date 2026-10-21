from __future__ import annotations

import asyncio
import io
import math
import os
import subprocess
import sys
import tempfile
import threading
import wave
from pathlib import Path

import edge_tts
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from faster_whisper import WhisperModel
from piper import PiperVoice
from pydantic import BaseModel

from domain_context import build_hotwords, build_initial_prompt, load_domain_terms, load_faq_phrases
from egyptian_speech import to_egyptian_spoken
from transcript_correction import CorrectionResult, correct_transcript

APP_PORT = int(os.getenv("VOICE_SERVICE_PORT", "5005"))
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
WHISPER_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "ar")
WHISPER_CPU_THREADS = max(1, int(os.getenv("WHISPER_CPU_THREADS", "4")))
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
WHISPER_BEAM_SIZE = max(1, int(os.getenv("WHISPER_BEAM_SIZE", "5")))
WHISPER_BEST_OF = max(1, int(os.getenv("WHISPER_BEST_OF", "5")))
WHISPER_PATIENCE = max(1.0, float(os.getenv("WHISPER_PATIENCE", "1.0")))
WHISPER_VAD_MIN_SILENCE_MS = max(200, int(os.getenv("WHISPER_VAD_MIN_SILENCE_MS", "550")))
WHISPER_VAD_SPEECH_PAD_MS = max(0, int(os.getenv("WHISPER_VAD_SPEECH_PAD_MS", "450")))
WHISPER_HOTWORDS_MAX_CHARS = max(200, int(os.getenv("WHISPER_HOTWORDS_MAX_CHARS", "1200")))
WHISPER_PROMPT_MAX_CHARS = max(50, int(os.getenv("WHISPER_PROMPT_MAX_CHARS", "100")))
WHISPER_RETRY_LOW_CONFIDENCE = os.getenv("WHISPER_RETRY_LOW_CONFIDENCE", "true").lower() not in {"0", "false", "no"}
WHISPER_RETRY_CONFIDENCE_THRESHOLD = float(os.getenv("WHISPER_RETRY_CONFIDENCE_THRESHOLD", "0.46"))
WHISPER_RETRY_BEAM_SIZE = max(WHISPER_BEAM_SIZE, int(os.getenv("WHISPER_RETRY_BEAM_SIZE", "7")))
STT_CORRECTION_ENABLED = os.getenv("STT_CORRECTION_ENABLED", "true").lower() not in {"0", "false", "no"}
STT_CORRECTION_MIN_SCORE = float(os.getenv("STT_CORRECTION_MIN_SCORE", "78"))
STT_CORRECTION_MIN_MARGIN = float(os.getenv("STT_CORRECTION_MIN_MARGIN", "4"))
WHISPER_CACHE = Path(os.getenv("WHISPER_CACHE", "/models/whisper"))
VOICE_KB_DIR = Path(os.getenv("VOICE_KB_DIR", "/app/data"))

TTS_PROVIDER = os.getenv("TTS_PROVIDER", "edge").strip().lower()
EDGE_TTS_VOICE = os.getenv("EDGE_TTS_VOICE", "ar-EG-ShakirNeural").strip()
EDGE_TTS_RATE = os.getenv("EDGE_TTS_RATE", "-4%").strip()
EDGE_TTS_VOLUME = os.getenv("EDGE_TTS_VOLUME", "+0%").strip()
EDGE_TTS_PITCH = os.getenv("EDGE_TTS_PITCH", "+0Hz").strip()
EDGE_TTS_FALLBACK_PIPER = os.getenv("EDGE_TTS_FALLBACK_PIPER", "true").lower() not in {"0", "false", "no"}
EGYPTIAN_SPOKEN_STYLE = os.getenv("EGYPTIAN_SPOKEN_STYLE", "true").lower() not in {"0", "false", "no"}

PIPER_DATA_DIR = Path(os.getenv("PIPER_DATA_DIR", "/models/piper"))
PIPER_VOICE = os.getenv("PIPER_VOICE", "ar_JO-kareem-medium")
MAX_AUDIO_BYTES = int(os.getenv("VOICE_MAX_AUDIO_BYTES", str(10 * 1024 * 1024)))
MAX_TTS_CHARS = int(os.getenv("VOICE_MAX_TTS_CHARS", "5000"))

SUPPORTED_EGYPTIAN_VOICES = {
    "ar-EG-ShakirNeural",
    "ar-EG-SalmaNeural",
}

WHISPER_CACHE.mkdir(parents=True, exist_ok=True)
PIPER_DATA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Egypt Traffic Local Voice Service", version="1.4.0-egyptian")
_whisper: WhisperModel | None = None
_piper: PiperVoice | None = None
_stt_lock = threading.Lock()
_piper_lock = threading.Lock()
_domain_terms: list[str] = []
_faq_phrases = []
_hotwords = ""
_initial_prompt = ""


def _piper_model_path() -> Path:
    return PIPER_DATA_DIR / f"{PIPER_VOICE}.onnx"


def _ensure_piper_voice() -> Path:
    model_path = _piper_model_path()
    config_path = Path(f"{model_path}.json")
    if model_path.exists() and config_path.exists():
        return model_path
    subprocess.run(
        [sys.executable, "-m", "piper.download_voices", "--data-dir", str(PIPER_DATA_DIR), PIPER_VOICE],
        check=True,
    )
    if not model_path.exists():
        raise RuntimeError(f"Piper voice was downloaded but model was not found at {model_path}")
    return model_path


def _ensure_piper_loaded() -> PiperVoice:
    global _piper
    if _piper is not None:
        return _piper
    with _piper_lock:
        if _piper is None:
            _piper = PiperVoice.load(str(_ensure_piper_voice()))
    return _piper


def _load_models() -> None:
    global _whisper, _domain_terms, _faq_phrases, _hotwords, _initial_prompt
    _domain_terms = load_domain_terms(VOICE_KB_DIR)
    _faq_phrases = load_faq_phrases(VOICE_KB_DIR)
    _hotwords = build_hotwords(_domain_terms, WHISPER_HOTWORDS_MAX_CHARS)
    _initial_prompt = build_initial_prompt(_domain_terms, WHISPER_PROMPT_MAX_CHARS)

    if _whisper is None:
        _whisper = WhisperModel(
            WHISPER_MODEL,
            device="cpu",
            compute_type=WHISPER_COMPUTE_TYPE,
            cpu_threads=WHISPER_CPU_THREADS,
            download_root=str(WHISPER_CACHE),
        )

    # Edge TTS is online and needs no model preload. Piper stays lazy and is
    # loaded only if selected explicitly or if the Edge service is unavailable.
    if TTS_PROVIDER == "piper":
        _ensure_piper_loaded()


@app.on_event("startup")
def startup() -> None:
    _load_models()


@app.get("/healthz")
def healthz() -> dict[str, object]:
    tts_ready = TTS_PROVIDER == "edge" or (TTS_PROVIDER == "piper" and _piper is not None)
    return {
        "ok": _whisper is not None and tts_ready,
        "stt": "faster-whisper",
        "stt_model": WHISPER_MODEL,
        "stt_beam_size": WHISPER_BEAM_SIZE,
        "stt_retry_low_confidence": WHISPER_RETRY_LOW_CONFIDENCE,
        "stt_domain_terms": len(_domain_terms),
        "stt_faq_phrases": len(_faq_phrases),
        "stt_post_correction": STT_CORRECTION_ENABLED,
        "stt_domain_prompt": bool(_initial_prompt),
        "tts": "edge-tts" if TTS_PROVIDER == "edge" else "piper",
        "tts_voice": EDGE_TTS_VOICE if TTS_PROVIDER == "edge" else PIPER_VOICE,
        "tts_locale": "ar-EG" if TTS_PROVIDER == "edge" else "ar-JO",
        "tts_free_no_api_key": TTS_PROVIDER == "edge",
        "tts_requires_internet": TTS_PROVIDER == "edge",
        "tts_fallback_piper": EDGE_TTS_FALLBACK_PIPER,
        "egyptian_spoken_style": EGYPTIAN_SPOKEN_STYLE,
        "language": WHISPER_LANGUAGE,
    }


@app.get("/tts-info")
def tts_info() -> dict[str, object]:
    return {
        "provider": TTS_PROVIDER,
        "default_voice": EDGE_TTS_VOICE if TTS_PROVIDER == "edge" else PIPER_VOICE,
        "egyptian_voices": sorted(SUPPORTED_EGYPTIAN_VOICES),
        "egyptian_spoken_style": EGYPTIAN_SPOKEN_STYLE,
        "fallback_piper": EDGE_TTS_FALLBACK_PIPER,
    }


def _suffix_for_content_type(content_type: str) -> str:
    ct = content_type.lower()
    if "webm" in ct:
        return ".webm"
    if "ogg" in ct:
        return ".ogg"
    if "wav" in ct:
        return ".wav"
    if "mpeg" in ct or "mp3" in ct:
        return ".mp3"
    if "mp4" in ct or "m4a" in ct:
        return ".m4a"
    return ".audio"


def _segment_confidence(segments: list[object]) -> float | None:
    values: list[float] = []
    for segment in segments:
        avg = getattr(segment, "avg_logprob", None)
        if isinstance(avg, (int, float)) and math.isfinite(float(avg)):
            values.append(max(0.0, min(1.0, math.exp(float(avg)))))
    if not values:
        return None
    return sum(values) / len(values)


def _decode(
    path: str,
    *,
    beam_size: int,
    best_of: int,
    prompt: str | None,
    hotwords: str | None,
    vad_filter: bool = True,
):
    assert _whisper is not None

    # Keep the decoder prompt deliberately short. Large prompt + hotword lists
    # can overflow Whisper's finite text-position context (448 positions).
    # Domain correction is handled after transcription by the FAQ layer.
    safe_prompt = (prompt or "").strip()
    if len(safe_prompt) > 100:
        safe_prompt = safe_prompt[:100].rsplit(" ", 1)[0].strip()

    def run_decode(use_prompt: bool):
        kwargs = dict(
            language=WHISPER_LANGUAGE,
            task="transcribe",
            beam_size=beam_size,
            best_of=best_of,
            patience=WHISPER_PATIENCE,
            temperature=0.0,
            vad_filter=vad_filter,
            condition_on_previous_text=False,
            without_timestamps=True,
            initial_prompt=(safe_prompt or None) if use_prompt else None,
            hotwords=None,
        )
        if vad_filter:
            kwargs["vad_parameters"] = {
                "min_silence_duration_ms": WHISPER_VAD_MIN_SILENCE_MS,
                "speech_pad_ms": WHISPER_VAD_SPEECH_PAD_MS,
                "min_speech_duration_ms": 160,
            }
        return _whisper.transcribe(path, **kwargs)

    try:
        segment_iter, info = run_decode(True)
        segments = list(segment_iter)
    except RuntimeError as exc:
        if "position encodings" not in str(exc):
            raise
        segment_iter, info = run_decode(False)
        segments = list(segment_iter)

    text = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
    return text, info, _segment_confidence(segments)


def _correct(text: str) -> CorrectionResult:
    if not STT_CORRECTION_ENABLED:
        return CorrectionResult(text=text, raw_text=text, applied=False, score=0.0, margin=0.0, reason="disabled")
    return correct_transcript(
        text,
        _faq_phrases,
        min_score=STT_CORRECTION_MIN_SCORE,
        min_margin=STT_CORRECTION_MIN_MARGIN,
    )


def _quality(confidence: float | None, correction: CorrectionResult) -> float:
    asr = confidence if confidence is not None else 0.35
    faq = correction.score / 100.0
    return (0.62 * asr) + (0.38 * faq)


@app.post("/transcribe")
async def transcribe(request: Request) -> dict[str, object]:
    if _whisper is None:
        raise HTTPException(status_code=503, detail="STT model is still loading")

    audio = await request.body()
    if not audio:
        raise HTTPException(status_code=400, detail="No audio received")
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio is too large")

    content_type = request.headers.get("content-type", "application/octet-stream")
    suffix = _suffix_for_content_type(content_type)
    tmp_path: str | None = None

    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio)
            tmp_path = tmp.name

        with _stt_lock:
            raw1, info1, conf1 = _decode(
                tmp_path,
                beam_size=WHISPER_BEAM_SIZE,
                best_of=WHISPER_BEST_OF,
                prompt=_initial_prompt or None,
                hotwords=None,
                vad_filter=True,
            )

            retry_used = False

            # A short/quiet browser recording can occasionally be filtered out
            # completely by VAD. Before returning 422, retry the same audio once
            # without VAD and without a decoder prompt. This preserves the normal
            # fast path while avoiding false "no speech" failures.
            if not raw1:
                retry_used = True
                raw2, info2, conf2 = _decode(
                    tmp_path,
                    beam_size=WHISPER_RETRY_BEAM_SIZE,
                    best_of=WHISPER_RETRY_BEAM_SIZE,
                    prompt=None,
                    hotwords=None,
                    vad_filter=False,
                )
                if not raw2:
                    raise HTTPException(status_code=422, detail="No speech was recognized after VAD retry")
                corr2 = _correct(raw2)
                raw_best, info_best, conf_best, corr_best = raw2, info2, conf2, corr2
            else:
                corr1 = _correct(raw1)
                raw_best, info_best, conf_best, corr_best = raw1, info1, conf1, corr1

                if (
                    WHISPER_RETRY_LOW_CONFIDENCE
                    and (conf1 is None or conf1 < WHISPER_RETRY_CONFIDENCE_THRESHOLD)
                    and corr1.score < max(STT_CORRECTION_MIN_SCORE, 82.0)
                ):
                    retry_used = True
                    raw2, info2, conf2 = _decode(
                        tmp_path,
                        beam_size=WHISPER_RETRY_BEAM_SIZE,
                        best_of=WHISPER_RETRY_BEAM_SIZE,
                        prompt=_initial_prompt or None,
                        hotwords=None,
                        vad_filter=True,
                    )
                    if raw2:
                        corr2 = _correct(raw2)
                        if _quality(conf2, corr2) > _quality(conf1, corr1):
                            raw_best, info_best, conf_best, corr_best = raw2, info2, conf2, corr2

        return {
            "text": corr_best.text,
            "raw_text": raw_best,
            "language": info_best.language,
            "language_probability": info_best.language_probability,
            "confidence": conf_best,
            "model": WHISPER_MODEL,
            "retry_used": retry_used,
            "correction_applied": corr_best.applied,
            "correction_score": round(corr_best.score, 2),
            "correction_margin": round(corr_best.margin, 2),
            "correction_faq_id": corr_best.faq_id,
            "correction_intent": corr_best.intent,
            "correction_references": list(corr_best.references),
            "correction_reason": corr_best.reason,
            "domain_terms": len(_domain_terms),
            "faq_phrases": len(_faq_phrases),
        }
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except FileNotFoundError:
                pass


class SynthesisRequest(BaseModel):
    text: str
    voice: str | None = None
    egyptian_style: bool | None = None


def _resolve_edge_voice(requested: str | None) -> str:
    value = (requested or "").strip()
    aliases = {
        "": EDGE_TTS_VOICE,
        "ar_EG": EDGE_TTS_VOICE,
        "ar-EG": EDGE_TTS_VOICE,
        "male": "ar-EG-ShakirNeural",
        "shakir": "ar-EG-ShakirNeural",
        "female": "ar-EG-SalmaNeural",
        "salma": "ar-EG-SalmaNeural",
    }
    voice = aliases.get(value, value)
    if voice not in SUPPORTED_EGYPTIAN_VOICES:
        return EDGE_TTS_VOICE
    return voice


async def _edge_tts_bytes(text: str, voice: str) -> bytes:
    path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            path = tmp.name
        communicate = edge_tts.Communicate(
            text=text,
            voice=voice,
            rate=EDGE_TTS_RATE,
            volume=EDGE_TTS_VOLUME,
            pitch=EDGE_TTS_PITCH,
        )
        await communicate.save(path)
        data = Path(path).read_bytes()
        if not data:
            raise RuntimeError("Edge TTS returned empty audio")
        return data
    finally:
        if path:
            try:
                os.unlink(path)
            except FileNotFoundError:
                pass


def _piper_tts_bytes(text: str) -> bytes:
    voice = _ensure_piper_loaded()
    buffer = io.BytesIO()
    with _piper_lock:
        with wave.open(buffer, "wb") as wav_file:
            voice.synthesize_wav(text, wav_file)
    return buffer.getvalue()


@app.post("/synthesize")
async def synthesize(body: SynthesisRequest) -> Response:
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is empty")
    if len(text) > MAX_TTS_CHARS:
        text = text[:MAX_TTS_CHARS]

    use_egyptian_style = EGYPTIAN_SPOKEN_STYLE if body.egyptian_style is None else body.egyptian_style
    spoken_text = to_egyptian_spoken(text) if use_egyptian_style else text

    if TTS_PROVIDER == "piper":
        audio = await asyncio.to_thread(_piper_tts_bytes, spoken_text)
        return Response(content=audio, media_type="audio/wav")

    if TTS_PROVIDER != "edge":
        raise HTTPException(status_code=500, detail=f"Unsupported TTS provider: {TTS_PROVIDER}")

    voice = _resolve_edge_voice(body.voice)
    try:
        audio = await _edge_tts_bytes(spoken_text, voice)
        return Response(
            content=audio,
            media_type="audio/mpeg",
            headers={"x-tts-provider": "edge-tts", "x-tts-voice": voice},
        )
    except Exception as exc:
        if not EDGE_TTS_FALLBACK_PIPER:
            raise HTTPException(status_code=502, detail=f"Egyptian TTS failed: {exc}") from exc
        try:
            audio = await asyncio.to_thread(_piper_tts_bytes, spoken_text)
            return Response(
                content=audio,
                media_type="audio/wav",
                headers={"x-tts-provider": "piper-fallback", "x-tts-voice": PIPER_VOICE},
            )
        except Exception as fallback_exc:
            raise HTTPException(
                status_code=502,
                detail=f"Egyptian TTS failed and Piper fallback also failed: {fallback_exc}",
            ) from fallback_exc
