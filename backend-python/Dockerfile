FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-distutils python3-pip gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN python3.11 -m pip install --upgrade pip
RUN python3.11 -m pip install --no-cache-dir \
    torch==2.4.1 \
    --index-url https://download.pytorch.org/whl/cu121
RUN python3.11 -m pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY adapter/ ./adapter/

EXPOSE 8001

CMD ["python3.11", "main.py"]