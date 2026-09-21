# AI AGENT ORCHESTRATION SPECIFICATION
# AI LOCATION BUSINESS INTELLIGENCE

**Version:** 1.0

## 1. PURPOSE
AI agents menjalankan sebagian besar operational workflow, tetapi:
> AI agents are operators, not owners.

Owner tetap memiliki keputusan final.

## 2. AGENT ARCHITECTURE
```text
                    ORCHESTRATOR AGENT
                           |
       +-------------------+-------------------+
       |                   |                   |
       v                   v                   v
 INTAKE AGENT       RESEARCH AGENT       CUSTOMER AGENT
       |                   |
       |          +--------+---------+
       |          |        |         |
       |          v        v         v
       |       MAPS      BPS      TRENDS
       |          |
       |          v
       |      COMPETITION
       |          |
       |          v
       |       MARKET GAP
       +----------+----------+
                  |
                  v
          SCORING ENGINE
                  |
                  v
          FINANCIAL ENGINE
                  |
                  v
            REPORT AGENT
                  |
                  v
              QA AGENT
                  |
                  v
          OWNER APPROVAL
                  |
                  v
         CUSTOMER DELIVERY
```

## 3. ORCHESTRATOR AGENT
Responsibilities:
- create task;
- determine workflow;
- assign agent;
- monitor status;
- retry/failure handling;
- enforce budget;
- enforce permissions.

Must not invent business conclusions.

## 4. INTAKE AGENT
Natural-language customer brief → structured Business Brief.

Example:
```json
{
  "business_category": "",
  "target_area": "",
  "target_customer": {},
  "budget": {},
  "property_requirements": {},
  "business_objective": "",
  "missing_information": []
}
```

Responsibilities:
- normalize;
- validate;
- identify missing information;
- ask clarification when required.

## 5. RESEARCH PLANNER AGENT
Determines:
- geographic scope;
- competitor categories;
- demand data;
- APIs;
- estimated cost;
- analysis depth.

## 6. MAPS AGENT
Handles:
- geocoding;
- POI discovery;
- competitor discovery;
- place qualification;
- routes;
- accessibility.

Must use `LocationProvider`, not direct Google calls throughout application code.

## 7. BPS AGENT
Finds relevant indicators, retrieves applicable data, normalizes geographic scope, attaches source and retrieval date.

## 8. TRENDS AGENT
Identifies relevant terms, analyzes relative interest, compares areas where supported, and produces demand signal.

Must state:
> Search interest is a proxy signal, not direct customer count.

## 9. PROPERTY AGENT
Uses permitted property sources and normalizes:
- rent;
- size;
- location;
- property type;
- availability.

If reliable data is unavailable:
`PROPERTY_DATA_INSUFFICIENT`

Never fabricate.

## 10. COMPETITION AGENT
Input: BusinessBrief + LocationData.

Output:
- Direct competitors;
- Indirect competitors;
- Density;
- Distance;
- Positioning;
- Competition risks.

## 11. MARKET GAP AGENT
Produces hypotheses. Each includes:
- evidence;
- confidence;
- validation_required.

## 12. FINANCIAL AGENT
Calls deterministic financial functions.

Output:
- Conservative;
- Base;
- Upside.

## 13. SCORING AGENT
Uses deterministic scoring engine. LLM explains scores; it does not arbitrarily assign scores without evidence.

## 14. REPORT AGENT
Input:
- BusinessBrief;
- Research;
- Analysis;
- Scoring;
- Financials;
- Risks.

Output: Structured Report JSON.

Renderer creates HTML and PDF.

## 15. QA AGENT
Checks:
- traceability of numbers;
- calculations;
- assumptions;
- sources;
- unsupported claims;
- candidate validity;
- hallucinations;
- disclaimers;
- confidence.

Failure state:
`REPORT_REJECTED`

## 16. CUSTOMER SUCCESS AGENT
After delivery:
- request feedback;
- ask whether field validation occurred;
- collect actual rent;
- collect selected location;
- collect objections;
- identify monitoring opportunities.

Must not spam.

## 17. SALES AGENT
Can:
- identify prospects;
- research business;
- personalize outreach;
- track leads;
- follow up.

Outbound communication requires applicable consent/legal basis, frequency limits, unsubscribe handling, and owner controls.

No mass autonomous spam.

## 18. FINANCE AGENT
Monitors:
- revenue;
- API cost;
- report cost;
- gross margin per project;
- budget alerts.

## 19. AGENT MEMORY
Store structured references:
- project_id;
- task_id;
- agent_id;
- input_reference;
- output_reference;
- source_reference;
- timestamp;
- model;
- prompt_version;
- status;
- confidence.

Do not rely only on conversational memory.

## 20. AGENT STATUS
- PENDING
- RUNNING
- WAITING
- COMPLETED
- FAILED
- RETRYING
- REQUIRES_HUMAN
- CANCELLED

## 21. HUMAN ESCALATION
Escalate for:
- source conflict;
- insufficient data;
- excessive API cost;
- legal uncertainty;
- unusual business;
- low confidence;
- destructive action;
- customer-specific commitment;
- major unresolved uncertainty.

## 22. AGENT COST CONTROL
Every research workflow estimates:
- API cost;
- AI token cost;
- compute cost.

before execution.

## 23. AGENT QUALITY PRINCIPLE
Prefer:
> "I don't have sufficient evidence."

over confident unsupported conclusions.

## 24. FUTURE AGENTS
Later:
- Market Monitoring Agent;
- Expansion Opportunity Agent;
- Property Watch Agent;
- Competitor Change Agent;
- Local News Signal Agent;
- Customer Benchmark Agent;
- Business Performance Agent;
- Pricing Agent.

Not MVP requirements.

## 25. ORCHESTRATION PRINCIPLE
The system should behave like a virtual consulting company:

```text
Client
↓
Consultant / Intake
↓
Research Team
↓
Data Team
↓
Market Analyst
↓
Financial Analyst
↓
Consulting Analyst
↓
QA Reviewer
↓
Partner / Owner Approval
↓
Client
```

All agents remain controlled by software policies and the human owner.

**END OF AGENT ORCHESTRATION SPECIFICATION**
