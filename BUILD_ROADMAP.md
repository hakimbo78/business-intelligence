# BUILD ROADMAP
# AI LOCATION BUSINESS INTELLIGENCE

**Version:** 1.0

## PHASE 0 — PROJECT FOUNDATION
Objective: repository dan development environment.

Deliverables:
- project structure;
- README;
- .env.example;
- .gitignore;
- Docker if needed;
- DB connection;
- application startup;
- testing framework;
- CI baseline.

Acceptance:
- app starts;
- tests run;
- DB connection works;
- secrets not committed.

## PHASE 1 — DOMAIN MODEL
Entities:
- Client
- Project
- BusinessProfile
- LocationSearch
- LocationCandidate
- Competitor
- FinancialScenario
- Report
- DataSource

Acceptance: migrations, CRUD tests, relationships.

## PHASE 2 — LOCATION PROVIDER
Create:
- LocationProvider
- MockLocationProvider
- GoogleMapsProvider

Implement Mock first.

Capabilities:
- geocode;
- searchPlaces;
- getPlaceDetails;
- calculateRoutes;
- aggregatePlaces.

Acceptance: business logic works with both provider modes.

## PHASE 3 — CUSTOMER BRIEF
Build intake for:
- business;
- target customer;
- target area;
- budget;
- property requirements;
- expansion objective.

AI Intake:
```text
raw input
↓
structured JSON
↓
validation
↓
Project
```

## PHASE 4 — RESEARCH PLANNER
BusinessBrief → ResearchPlan.

ResearchPlan includes:
- geographic scope;
- categories;
- search radius;
- required data;
- APIs;
- expected cost;
- expected output.

## PHASE 5 — COMPETITION ENGINE
Build competitor discovery, classification, distance, density, category analysis.

## PHASE 6 — DEMAND ENGINE
Integrate BPS, Trends, and available signals.

Output:
- DemandSignal;
- CustomerFit;
- Confidence;
- Evidence.

## PHASE 7 — MARKET GAP ENGINE
Build evidence-backed hypotheses with confidence and validation requirements.

## PHASE 8 — ACCESSIBILITY ENGINE
Build distance, travel time, proximity, route analysis, accessibility scoring.

## PHASE 9 — FINANCIAL ENGINE
Inputs:
- rent;
- property size;
- customers/day;
- average transaction;
- operating days;
- gross margin;
- operating cost;
- initial investment.

Outputs:
- revenue;
- gross profit;
- operating profit estimate;
- break-even;
- payback.

Scenarios:
- conservative;
- base;
- upside.

## PHASE 10 — SCORING ENGINE
Components:
- market_fit;
- customer_fit;
- demand;
- competition;
- gap;
- accessibility;
- financial_fit;
- growth;
- risk;
- confidence.

Scores must expose evidence.

## PHASE 11 — LOCATION SHORTLIST
Configurable funnel:
```text
1000+ → 200 → 50 → 20 → 10 → 5
```

## PHASE 12 — REPORT ENGINE
Generate HTML and PDF with:
- charts;
- maps;
- tables;
- methodology;
- assumptions;
- candidates;
- financial scenarios;
- risks;
- validation checklist.

## PHASE 13 — QA AGENT
Check:
- missing/inconsistent data;
- source/timestamp;
- financial calculations;
- unsupported claims;
- hallucinations;
- certainty language;
- attribution;
- disclaimer.

## PHASE 14 — OWNER APPROVAL
Dashboard:
`REPORT READY FOR REVIEW`

Actions:
- Approve;
- Reject;
- Request Revision.

Only approved reports can be delivered.

## PHASE 15 — DELIVERY
Deliver PDF/web report/customer notification. Record delivery metadata.

## PHASE 16 — FEEDBACK
Collect:
- feedback;
- field validation;
- actual rent;
- selected location;
- objections;
- monitoring opportunity.

## PHASE 17 — AUTOMATION
Only after MVP is proven:
```text
Lead → Qualification → Payment → Intake → Research → Analysis → Report → QA → Approval → Delivery → Follow-up
```

## PHASE 18 — SCALE
Later:
- multi-client dashboard;
- subscriptions;
- monitoring;
- lead generation;
- industry templates;
- proprietary benchmarks;
- continuous intelligence.

## ROADMAP RULE
Do not skip directly to Phase 17.

First prove:
```text
Phase 0 → Phase 1 → Phase 2 → ... → Working Report
```

First objective:
> Produce one genuinely useful Location Intelligence Report for one real customer.

**END OF BUILD ROADMAP**
