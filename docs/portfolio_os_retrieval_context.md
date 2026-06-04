# Portfolio OS Retrieval Context

GStack can produce an optional bounded retrieval artifact for a Portfolio OS
Hermes task bundle:

```bash
bun run scripts/pos-artifact.ts retrieval-context --bundle path/to/bundle.json
```

The output defaults to the bundle's `gstack.retrieval_context_path`:

```text
data/gstack_results/<run_id>.retrieval_context.json
```

## Contract

The artifact contains:

- cited snippets with source path, source kind, line range, score, source hash,
  snippet hash, and freshness.
- a budget block with max snippets, max chars per snippet, max total chars, and
  estimated tokens.
- sources considered, including task bundle, context pack refs, GStack artifacts,
  Paperclip ledger paths, and Hermes result/log paths when present.
- policy flags proving raw vectors were not included and Hermes system prompts
  were not mutated.

Retrieval is not the first fix and is not a prompt replacement. It is a bounded
evidence lane after pack provenance and Paperclip ledger refs already exist.
