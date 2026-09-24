# Von on CPU: builds a self-contained image from the von-sdk PyPI release.
# Upstream (https://github.com/wfzyx/von) ships no Dockerfile.
FROM python:3.12-slim

ARG TORCH_VERSION=2.14.0
ARG TORCH_INDEX=https://download.pytorch.org/whl/cpu

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# CPU-only torch first, so the von-sdk install does not pull CUDA wheels.
# von-sdk only requires torch>=2.0.0, so this pin is independent of Von releases.
RUN pip install --index-url "${TORCH_INDEX}" "torch==${TORCH_VERSION}"

# VON_VERSION empty = latest release on PyPI. Set it to pin, e.g. 1.2.2.
# VON_REFRESH is a cache-bust: pass a new value (e.g. a timestamp) to force this
# layer to rebuild and pick up a newer von-sdk while keeping the torch layer cached.
ARG VON_VERSION=""
ARG VON_REFRESH=0
RUN echo "von refresh ${VON_REFRESH}" \
 && if [ -n "${VON_VERSION}" ]; then pip install "von-sdk==${VON_VERSION}"; else pip install --upgrade von-sdk; fi

# Non-root runtime user; HF cache lives here and is mounted as a volume.
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin von \
 && mkdir -p /home/von/.cache/huggingface \
 && chown -R von:von /home/von/.cache
USER von
WORKDIR /home/von
ENV HF_HOME=/home/von/.cache/huggingface \
    VON_DEVICE=cpu \
    VON_PORT=8000

EXPOSE 8000
CMD ["sh", "-c", "exec von serve --host 0.0.0.0 --port ${VON_PORT} --device ${VON_DEVICE}"]
