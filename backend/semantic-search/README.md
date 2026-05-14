# DigiVax BioBERT Semantic Search

FastAPI service for real BioBERT embedding search.

The default model is `pritamdeka/S-BioBert-snli-multinli-stsb`, a sentence-transformers BioBERT model that returns 768-dimensional vectors for sentence and paragraph retrieval.

## Local Run

```powershell
cd backend\semantic-search
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:BIOBERT_API_KEY="local-dev-key"
uvicorn server:app --host 127.0.0.1 --port 8090
```

Then set the Next.js environment:

```env
BIOBERT_API_URL=http://127.0.0.1:8090
BIOBERT_API_KEY=local-dev-key
```

## Endpoints

- `GET /health`
- `POST /embed`
- `POST /rank`

`/embed` returns one normalized embedding:

```json
{
  "text": "Patient received Hepa B vaccine on 07-20-21"
}
```

`/rank` compares a query against text or precomputed embeddings:

```json
{
  "query": "hepatitis b vaccination",
  "records": [
    { "id": "record-1", "text": "BCG, Hepa B, OPV" }
  ]
}
```
