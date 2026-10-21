# Legal Knowledge Base

Place reviewed legal source files in `data/legal/` and add a JSON sidecar next to each source when metadata is known.

For `document.pdf`, either of these names is accepted:

- `document.pdf.meta.json`
- `document.meta.json`

Example structure (use only values verified from the real source):

```json
{
  "document_title": "...",
  "document_type": "law",
  "law_number": "...",
  "law_year": "...",
  "source_name": "...",
  "source_url": "https://...",
  "effective_from": "YYYY-MM-DD",
  "effective_to": null,
  "version": "...",
  "is_current": true,
  "source_status": "official"
}
```

Never mark a document `official` or `verified` unless that status has actually been reviewed. Missing dates, article numbers, source URLs, and amendment data should be omitted rather than guessed.

## Extraction behavior

- TXT/Markdown/CSV keep original extracted text.
- PDF extraction keeps per-page units and page numbers.
- Very low-text PDFs are rejected as likely scanned documents and require an external OCR step.
- Corrupted extraction with excessive replacement characters is rejected rather than silently indexed.
- `pageContent`/`originalText` remains authoritative text; `normalizedText` exists separately for retrieval.

## Re-index

A normal `pnpm ingest` rebuilds only the derived Chroma/BM25 indexes from files in `data/legal`; it does not delete legal source files.
