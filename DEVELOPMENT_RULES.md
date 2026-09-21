# DEVELOPMENT RULES
# AI LOCATION BUSINESS INTELLIGENCE

**Version:** 1.0

## 1. ROLE
AI developer bertindak sebagai Software Architect, Senior Full-Stack Engineer, Data Engineer, AI Engineer, QA Engineer, dan DevOps Engineer. AI developer bukan pemilik bisnis.

## 2. READ BEFORE CODE
WAJIB membaca:
- PROJECT_MASTER_SPEC.md
- DEVELOPMENT_RULES.md
- BUILD_ROADMAP.md
- AGENT_ORCHESTRATION_SPEC.md

Jika ada konflik, jangan menebak. Laporkan kepada owner.

## 3. BUILD IN PHASES
Jangan membangun seluruh platform sekaligus.

Workflow:
READ → PLAN → IMPLEMENT → TEST → VERIFY → REPORT

## 4. ARCHITECTURE FIRST
Untuk perubahan besar, buat architecture diagram, modules, interfaces, database entities, integrations, dan testing strategy sebelum coding.

## 5. PROVIDER ABSTRACTION
External provider harus melalui interface/adapter:
```text
LocationProvider
├─ MockLocationProvider
└─ GoogleMapsProvider
```

## 6. MOCK FIRST
Development default:
```text
MAP_PROVIDER=mock
```

Mock harus mendukung search, details, geocoding, routes, competitors, dan candidate locations.

## 7. REAL API SECOND
Google API digunakan setelah adapter siap untuk staging/integration/production. API keys harus secret, restricted, dan environment-specific.

## 8. NO SECRETS
Jangan commit API key, password, token, credential, atau secret. Gunakan environment variables/secret manager.

## 9. NO HALLUCINATION
Dilarang membuat data bisnis, competitor, property listing, API response production, atau provider pricing palsu. Mock data harus jelas ditandai.

## 10. SOURCE TRACEABILITY
Data eksternal harus memiliki:
- source;
- retrieved_at;
- geographic_scope;
- data_type;
- confidence.

Jika tidak diketahui gunakan `UNKNOWN`.

## 11. ASSUMPTIONS
Tandai angka sebagai:
- USER_PROVIDED;
- EXTERNAL_SOURCE;
- ESTIMATED;
- ASSUMPTION;
- AI_INFERENCE.

## 12. FINANCIAL CALCULATIONS
Financial engine deterministic. Code menangani revenue, margin, operating costs, break-even, dan payback. LLM hanya menjelaskan/menafsirkan.

## 13. SCORING
Scoring deterministic dan versioned, misalnya:
```text
scoring_version = "1.0"
```

## 14. TESTING
Minimal:
- Unit Test
- Integration Test
- API Adapter Test
- Financial Calculation Test
- Report Validation Test

Critical calculations harus memiliki beberapa test case.

## 15. ACCEPTANCE CRITERIA
Phase selesai hanya jika requirements, tests, acceptance criteria, error handling, dan documentation terpenuhi.

## 16. DATABASE
Migration versioned. Jangan ubah production DB manual tanpa migration.

## 17. ERROR HANDLING
Tangani API unavailable, rate limit, timeout, invalid location, missing property data, dan insufficient competition data.

## 18. COST CONTROL
Sebelum request mahal:
- cek apakah dapat dihindari;
- gunakan permitted reference bila memungkinkan;
- minimalkan field mask;
- filter candidate sebelum enrichment.

## 19. LOGGING
Log request ID, project ID, agent, operation, duration, status, error, dan estimated cost. Jangan log secret/password/sensitive customer data.

## 20. AI AGENT SAFETY
Destructive action memerlukan approval:
- delete customer/report;
- production deploy;
- large API spend;
- mass outbound.

## 21. HUMAN-IN-THE-LOOP
Owner approval diperlukan untuk production deployment, final report release, major pricing/architecture changes, high-cost research, customer-sensitive decisions, dan mass external communication.

## 22. CODE QUALITY
Prefer small modules, clear interfaces, typed data, meaningful names, useful comments, no unnecessary abstraction, no premature optimization.

## 23. DOCUMENTATION
Major module harus memiliki README, architecture, API contract, environment variables, dan testing instructions.

## 24. GIT
Recommended:
```text
main
develop
feature/*
fix/*
```

Meaningful commits:
```text
feat: add location provider interface
feat: add mock places provider
test: add financial scenario tests
fix: handle routes API timeout
```

## 25. AI CODING WORKFLOW
```text
READ
↓
PLAN
↓
IMPLEMENT
↓
TEST
↓
VERIFY
↓
REPORT
```

Report:
- What changed
- Why
- Files changed
- Tests executed
- Known limitations
- Next step

## 26. STOP CONDITION
Jika requirement ambigu dan dapat mengubah architecture/business logic: STOP dan ask owner.

## 27. GOLDEN RULE
> Build the smallest correct system first.

**END OF DEVELOPMENT RULES**
