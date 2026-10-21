from __future__ import annotations

import asyncio
import io
import logging
import os
import threading
from typing import Any

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from egyptian_speech import to_egyptian_spoken

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("voicetut-service")

MODEL_ID = os.getenv("VOICETUT_MODEL", "mohammedaly22/VoiceTut-TTS").strip()
SPEAKER = os.getenv("VOICETUT_SPEAKER", "Mohamed").strip()
DEVICE = os.getenv("VOICETUT_DEVICE", "cpu").strip()
DTYPE = os.getenv("VOICETUT_DTYPE", "float32").strip()
NUM_STEP = int(os.getenv("VOICETUT_NUM_STEP", "16"))
GUIDANCE = float(os.getenv("VOICETUT_GUIDANCE_SCALE", "2.0"))
SPEED = float(os.getenv("VOICETUT_SPEED", "1.0"))
NORMALIZE = os.getenv("VOICETUT_NORMALIZE", "true").lower() not in {"0", "false", "no"}
EGYPTIAN_STYLE = os.getenv("EGYPTIAN_SPOKEN_STYLE", "true").lower() not in {"0", "false", "no"}
AUTO_PRELOAD = os.getenv("VOICETUT_AUTO_PRELOAD", "true").lower() not in {"0", "false", "no"}
MAX_TTS_CHARS = int(os.getenv("VOICE_MAX_TTS_CHARS", "5000"))

app = FastAPI(title="Egypt Traffic VoiceTut TTS", version="11.0")

_tts: Any | None = None
_load_lock = threading.Lock()
_synth_lock = threading.Lock()
_loading = False
_load_error: str | None = None


class SynthesisRequest(BaseModel):
    text: str
    voice: str | None = None


def _ensure_loaded():
    global _tts, _loading, _load_error
    if _tts is not None:
        return _tts
    with _load_lock:
        if _tts is not None:
            return _tts
        _loading = True
        _load_error = None
        try:
            from voicetut_tts import VoiceTutTTS

            log.info("Loading VoiceTut model=%s device=%s dtype=%s", MODEL_ID, DEVICE, DTYPE)
            _tts = VoiceTutTTS.from_pretrained(
                MODEL_ID,
                device=DEVICE,
                dtype=DTYPE,
                language="arz",
            )
            speakers = [s.speaker_name for s in _tts.list_speakers()]
            log.info("VoiceTut loaded. speakers=%s", ",".join(speakers))
            return _tts
        except Exception as exc:
            _load_error = f"{type(exc).__name__}: {exc}"
            log.exception("VoiceTut model load failed")
            raise
        finally:
            _loading = False


def _background_preload() -> None:
    try:
        _ensure_loaded()
    except Exception:
        # Health stays available; the backend will use the stable Edge/Piper
        # fallback until VoiceTut can load successfully.
        pass


@app.on_event("startup")
async def startup() -> None:
    if AUTO_PRELOAD:
        threading.Thread(target=_background_preload, name="voicetut-preload", daemon=True).start()


@app.get("/healthz")
def healthz():
    return {
        "ok": True,
        "provider": "voicetut",
        "model": MODEL_ID,
        "model_loaded": _tts is not None,
        "model_loading": _loading,
        "load_error": _load_error,
        "speaker": SPEAKER,
        "device": DEVICE,
        "dtype": DTYPE,
        "num_step": NUM_STEP,
        "guidance_scale": GUIDANCE,
        "speed": SPEED,
        "normalize": NORMALIZE,
        "egyptian_spoken_style": EGYPTIAN_STYLE,
    }


@app.post("/preload")
async def preload():
    if _tts is not None:
        return {"ok": True, "already_loaded": True}
    if not _loading:
        threading.Thread(target=_background_preload, name="voicetut-preload-manual", daemon=True).start()
    return {"ok": True, "loading": True}


@app.get("/voices")
async def voices():
    if _tts is None:
        return {"loaded": False, "default": SPEAKER, "voices": []}
    return {
        "loaded": True,
        "default": SPEAKER,
        "voices": [
            {
                "name": s.speaker_name,
                "gender": s.gender,
                "tags": s.tags,
            }
            for s in _tts.list_speakers()
        ],
    }


def _resolve_speaker(requested: str | None, tts: Any) -> str:
    names = {s.speaker_name for s in tts.list_speakers()}
    if requested and requested in names:
        return requested
    return SPEAKER if SPEAKER in names else (next(iter(names)) if names else SPEAKER)


def _synthesize_wav_bytes(text: str, requested_speaker: str | None) -> tuple[bytes, str]:
    from voicetut_tts import GenerationParams

    tts = _ensure_loaded()
    speaker = _resolve_speaker(requested_speaker, tts)
    params = GenerationParams(
        num_step=NUM_STEP,
        guidance_scale=GUIDANCE,
        speed=SPEED,
    )
    with _synth_lock:
        wav = tts.synthesize(
            text,
            speaker=speaker,
            language="arz",
            normalize=NORMALIZE,
            params=params,
        )
    arr = np.asarray(wav, dtype=np.float32)
    out = io.BytesIO()
    sf.write(out, arr, tts.sampling_rate, format="WAV", subtype="PCM_16")
    return out.getvalue(), speaker


@app.post("/synthesize")
async def synthesize(body: SynthesisRequest) -> Response:
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if len(text) > MAX_TTS_CHARS:
        text = text[:MAX_TTS_CHARS]

    spoken_text = to_egyptian_spoken(text) if EGYPTIAN_STYLE else text

    # If background preload is still running, return a fast 503. The backend
    # immediately falls back to the already-working Edge/Piper TTS path rather
    # than freezing the whole chat while a ~GB-scale model is downloading.
    if _tts is None and _loading:
        raise HTTPException(status_code=503, detail="VoiceTut is still loading")
    if _tts is None and _load_error:
        raise HTTPException(status_code=503, detail=f"VoiceTut unavailable: {_load_error}")

    try:
        audio, speaker = await asyncio.to_thread(_synthesize_wav_bytes, spoken_text, body.voice)
    except Exception as exc:
        log.exception("VoiceTut synthesis failed")
        raise HTTPException(status_code=503, detail=f"VoiceTut synthesis failed: {exc}") from exc

    return Response(
        content=audio,
        media_type="audio/wav",
        headers={
            "x-tts-provider": "voicetut",
            "x-tts-speaker": speaker,
        },
    )
