import os
from flask import Flask, request, jsonify
from openai import OpenAI

app = Flask(__name__)
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
CONNECTOR_KEY = os.environ.get("CONNECTOR_API_KEY")
DEFAULT_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")


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
        "message": "Set OPENAI_API_KEY and CONNECTOR_API_KEY, then connect this URL in Perplexity."
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

    response = client.responses.create(
        model=model,
        input=prompt
    )

    return jsonify({
        "ok": True,
        "model": model,
        "output_text": response.output_text
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)
