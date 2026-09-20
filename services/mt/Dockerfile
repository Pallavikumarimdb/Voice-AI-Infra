FROM vllm/vllm-openai:latest

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir fastapi uvicorn prometheus-client python-dotenv

COPY . .

EXPOSE 8002
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
