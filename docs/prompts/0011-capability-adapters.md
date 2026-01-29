# Prompt — Capability Adapters (Safe, High-Signal)

```text
You are working in https://github.com/prime-builds/prime-cli.git

Goal:
Add a small set of safe, passive, high-signal adapters that deepen value without risky active operations.

DO NOT:
- add exploit logic or payload generation
- add free-form shell adapter
- add UI work here

A) Artifact Schemas (packages/core)
Ensure strict minimal schemas exist for:
- web_headers.json
- robots_sitemap.json
- link_graph.json
- report_export.json (metadata for report.html)

B) Implement builtin adapters
1) web.headers.capture -> web_headers.json
2) web.robots_sitemap.fetch -> robots_sitemap.json
3) web.linkgraph.build (from web_surface.json) -> link_graph.json
4) findings.enrich.kb_refs (from findings_*.json) -> enriched findings artifact (or same type if supported)
5) report.export.html (from report.md/report.json) -> report_export.json + write report.html

C) Conformance + fixtures + tests
Each adapter must include fixtures + tests and pass schema validation.

Commit in logical chunks.
```
