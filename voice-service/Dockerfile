# Voice v10.2 incremental build.
# IMPORTANT: install_to_project.sh first snapshots the currently-working
# voice-service image under this local tag. We then add only the Egyptian TTS
# dependencies instead of redownloading Whisper/Piper/FastAPI/uvicorn.
ARG VOICE_BASE_IMAGE=egypt-traffic-rag-voice-base:v9.3
FROM ${VOICE_BASE_IMAGE}

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=300

WORKDIR /app

COPY voice-service/requirements-edge.txt ./requirements-edge.txt

# Exact pins + --no-deps = no dependency-resolver backtracking.
# Only the small Edge-TTS dependency set is downloaded. The large existing
# packages (ctranslate2/faster-whisper/piper/uvicorn/etc.) stay in the base.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install \
      --default-timeout=300 \
      --retries 20 \
      --prefer-binary \
      --only-binary=:all: \
      --no-deps \
      -r requirements-edge.txt \
    && python -c "from typing_extensions import sentinel; import fastapi, anyio, aiohttp, edge_tts; from importlib.metadata import version; print('voice deps OK', 'edge-tts', version('edge-tts'), 'aiohttp', version('aiohttp'), 'typing-extensions', version('typing-extensions'))"

COPY voice-service/app.py ./app.py
COPY voice-service/domain_context.py ./domain_context.py
COPY voice-service/transcript_correction.py ./transcript_correction.py
COPY voice-service/egyptian_speech.py ./egyptian_speech.py

EXPOSE 5005
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5005"]
