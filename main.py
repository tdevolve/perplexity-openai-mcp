import os
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI

app = Flask(__name__)
CORS(app)

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
CONNECTOR_KEY = os.environ.get("CONNECTOR_API_KEY")
DEFAULT_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")

BASE_DIR = Path(__file__).resolve().parent
SYSTEM_PROMPT_PATH = BASE_DIR / "prompts" / "system-prompt.txt"


def load_system_prompt():
    try:
        return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return ""


SYSTEM_PROMPT = load_system_prompt()


def authorized(req):
    if not CONNECTOR_KEY:
        return True
    header = req.headers.get("Authorization", "")
    return header == f"Bearer {CONNECTOR_KEY}"


@app.get("/")
def home():
    return jsonify({
        "name": "perplexity-openai-mcp-starter",
        "status": "ok",
        "message": "Set OPENAI_API_KEY and CONNECTOR_API_KEY, then connect this URL in Perplexity.",
        "system_prompt_loaded": bool(SYSTEM_PROMPT),
        "system_prompt_path": str(SYSTEM_PROMPT_PATH)
    })


@app.post("/ask_openai")
def ask_openai():
    if not authorized(request):
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    model = (data.get("model") or DEFAULT_MODEL).strip()

    if not prompt:
        return jsonify({"error": "prompt is required"}), 400

    request_kwargs = {
        "model": model,
        "input": prompt,
    }

    if SYSTEM_PROMPT:
        request_kwargs["instructions"] = SYSTEM_PROMPT

    response = client.responses.create(**request_kwargs)

    return jsonify({
        "ok": True,
        "model": model,
        "system_prompt_loaded": bool(SYSTEM_PROMPT),
        "output_text": response.output_text
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)
