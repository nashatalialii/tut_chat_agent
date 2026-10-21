# VoiceTut v11 is intentionally isolated from the stable STT/Edge/Piper service.
# The installer snapshots the current working voice-service image to this local
# base tag, so we do not pull another Python base image or disturb the working STT.
ARG VOICETUT_BASE_IMAGE=egypt-traffic-rag-voice-base:v10.3-final
FROM ${VOICETUT_BASE_IMAGE}

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=300 \
    HF_HOME=/models/huggingface \
    HUGGINGFACE_HUB_CACHE=/models/huggingface/hub

WORKDIR /app/voicetut

COPY voicetut-service/requirements.txt ./requirements.txt

# CPU-only PyTorch for the user's CPU-only machine. BuildKit's cache mount
# helps retries resume without embedding pip's cache in the final image.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --default-timeout=300 --retries 20 --prefer-binary \
      --index-url https://download.pytorch.org/whl/cpu \
      torch==2.8.0 torchaudio==2.8.0

# Install only the inference dependencies we need. OmniVoice and VoiceTut are
# pinned and installed with --no-deps to avoid pulling the optional Gradio stack
# or changing the CPU PyTorch build selected above.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --default-timeout=300 --retries 20 --prefer-binary -r requirements.txt \
    && pip install --default-timeout=300 --retries 20 --prefer-binary --no-deps \
         omnivoice==0.2.1 voicetut-tts==0.1.1 \
    && python -c "import torch, torchaudio, transformers, omnivoice, voicetut_tts; print('VoiceTut deps OK', torch.__version__, 'cuda=', torch.cuda.is_available())"

COPY voicetut-service/app.py ./app.py
COPY voicetut-service/egyptian_speech.py ./egyptian_speech.py

EXPOSE 5010
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5010"]
