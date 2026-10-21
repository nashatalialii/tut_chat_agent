# Accuracy Fix v3

Fixes cross-violation evidence mixing (for example a speeding question being answered with traffic-obstruction penalties).

Changes:
- exact violation/topic matching before evidence reaches the LLM
- stronger topic-aware reranking
- broader Egyptian Arabic violation recognition
- prompt rule preventing penalty mixing
- regression test for speeding vs traffic obstruction

Apply over the project root, rebuild backend, replace old summary records with Atomic RAG v4, then run a full ingest.
