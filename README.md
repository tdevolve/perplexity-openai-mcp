# perplexity-openai-mcp

A small, opinionated MCP-style worker for experimenting with Perplexity + OpenAI agents. It includes a configurable system prompt, helper scripts, and a lightweight Flask app that can be deployed to platforms like Railway or Heroku.

## What this repo contains

- `main.py` — the Flask app / worker entry point
- `prompts/system-prompt.txt` — the main system prompt used by the worker
- `scripts/` — helper scripts for replaying FAQs and comparing outputs
- `Procfile` — deployment process definition
- `requirements.txt` — Python dependencies

## Project structure

```text
perplexity-openai-mcp/
├── prompts/
│   └── system-prompt.txt
├── scripts/
├── main.py
├── Procfile
├── requirements.txt
└── README.md
```

## Getting started

### Clone the repo

```bash
git clone git@github.com:tdevolve/perplexity-openai-mcp.git
cd perplexity-openai-mcp
```

### Create a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### Install dependencies

```bash
pip install -r requirements.txt
```

### Run locally

```bash
python main.py
```

## System prompt

The worker’s main behavior is configured through:

```text
prompts/system-prompt.txt
```

You can refine the assistant’s tone, rules, and behavior by editing that file without changing the main application code.

Typical workflow:

```bash
git add prompts/system-prompt.txt
git commit -m "Refine system prompt"
git push origin main
```

## Scripts

The `scripts/` folder is for local utilities and experiments, such as replaying stored FAQ queries or comparing prompt outputs across runs.

Check each script directly for current usage and arguments.

## Deployment

This repo includes a `Procfile`, so it can be deployed to platforms such as Railway or Heroku.

Typical deployment flow:

1. Connect the GitHub repo to your hosting platform.
2. Set required environment variables.
3. Deploy from the `main` branch.
4. Redeploy after prompt or code updates.

## Notes

- Local logs can stay untracked in a `logs/` directory.
- SSH is recommended for Git pushes from your development machine.
- This repo is being used for fast iteration on agent behavior and MCP-style workflows.

## License

Add a LICENSE file when you decide how you want to license the repo.