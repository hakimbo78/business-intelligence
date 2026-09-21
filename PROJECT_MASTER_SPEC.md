# PROJECT MASTER SPECIFICATION
# AI LOCATION BUSINESS INTELLIGENCE

**Version:** 1.0  
**Status:** MASTER SPECIFICATION  
**Project Type:** AI-powered Location Decision Intelligence Platform  
**Business Model:** One-Person Company / AI-Agent Operated Business  
**Primary Market:** UMKM dan bisnis lokal di Indonesia  

## 1. PROJECT VISION

Platform AI Location Business Intelligence membantu pemilik bisnis menentukan area dan kandidat lokasi yang layak untuk ekspansi berdasarkan data, analisis AI, competition intelligence, demand signals, accessibility, financial scenarios, risk analysis, dan field validation.

Produk menjual **Location Decision Intelligence**, bukan sekadar data.

Output harus membantu customer memahami:
- peluang pasar;
- target customer;
- kompetisi;
- market gap hypothesis;
- accessibility;
- location cost;
- revenue scenarios;
- risks;
- hal yang harus diverifikasi di lapangan.

Platform tidak boleh menjamin keberhasilan lokasi.

Gunakan istilah:
- recommended candidate;
- candidate for field validation;
- estimated;
- scenario;
- hypothesis;
- requires verification.

Hindari:
- pasti berhasil;
- dijamin laris;
- 100% profitable;
- lokasi terbaik;
- pasti ramai;
- pasti balik modal.

## 2. TARGET CUSTOMER

### UMKM Existing
Bisnis dengan minimal satu lokasi yang ingin membuka cabang.

Contoh:
coffee shop, restoran, laundry, barbershop, salon, klinik, minimarket, retail, bakery, gym, pet shop, automotive service, education, specialty food, beauty business.

### New Business
Orang yang ingin membuka bisnis pertama tetapi belum menentukan lokasi.

### Multi-Branch Business
Bisnis yang ingin ekspansi regional.

## 3. CORE PRODUCT

**AI Location Intelligence Report**

Input Business Brief → Research → Analysis → Candidate Shortlist → Financial Scenarios → QA → Owner Approval → Customer Delivery.

Target report: 15–20 halaman.

## 4. CUSTOMER INPUT

### Business
- business_name
- business_category
- business_subcategory
- current_branch_count
- existing_branch_locations
- current_average_transaction
- estimated_daily_customers
- operating_days
- gross_margin

### Expansion
- target_city
- target_area
- preferred_radius
- expansion_reason
- target_customer
- business_positioning

### Location
- target_property_size
- minimum_property_size
- maximum_property_size
- maximum_monthly_rent
- maximum_initial_investment
- preferred_road_type
- parking_requirement
- visibility_requirement
- accessibility_requirement

### Customer Profile
- target_age
- target_gender
- target_income
- occupation
- lifestyle
- vehicle_usage
- expected_spending

### Economics
- average_transaction_value
- estimated_customers_per_day
- gross_margin
- estimated_operating_cost
- target_payback_period

System harus membedakan user-provided, estimated, external, dan AI inference.

## 5. END-TO-END FLOW

```text
CUSTOMER
  ↓
BUSINESS BRIEF
  ↓
AI INTAKE AGENT
  ↓
RESEARCH PLAN
  ↓
GOOGLE MAPS + EXTERNAL DATA + PROPRIETARY DATA
  ↓
LOCATION DATA LAYER
  ↓
AI ANALYSIS
  ├─ Competition
  ├─ Market Gap
  └─ Financial
  ↓
SCORING ENGINE
  ↓
CANDIDATE LOCATIONS
  ↓
REPORT ENGINE
  ↓
QA AGENT
  ↓
OWNER APPROVAL
  ↓
CUSTOMER
  ↓
FIELD VALIDATION
```

## 6. LOCATION FUNNEL

```text
1000+ POIs / locations
↓
100–200 relevant
↓
50 qualified
↓
20 micro-locations
↓
10 property candidates
↓
5 report candidates
↓
2–3 field-validation candidates
```

Numbers must be configurable.

## 7. DATA SOURCES

### Google Maps Platform
Primary geospatial provider:
- Places API
- Geocoding API
- Routes API
- Places Aggregate API
- Maps visualization
- Roads API when required

Use provider terms and storage restrictions correctly. Do not build a prohibited permanent copy of Google Maps data. Use `place_id` as permitted.

### BPS
Potential indicators:
- population;
- density;
- demographics;
- expenditure;
- employment;
- regional economic statistics.

Record source, dataset, retrieval date, geographic scope, and usage/license status.

### Google Trends
Use only as a relative demand signal, not an absolute customer count.

### Property Data
Use permitted/licensed providers, agents, owner submissions, customer-provided data, or licensed datasets. Do not scrape marketplaces unless their terms permit commercial use.

### Disaster/Risk
Potential InaRISK/BNPB/licensed sources. Verify commercial/republication rights.

### Proprietary Data
Long-term moat:
- actual rent;
- field footfall;
- field observations;
- chosen location;
- actual business traffic;
- actual revenue;
- actual conversion;
- actual performance.

## 8. DATA CONFIDENCE

Every major conclusion:
- HIGH — multiple reliable sources agree;
- MEDIUM — useful data but assumptions remain;
- LOW — limited data or significant assumptions.

## 9. COMPETITION ENGINE

Classify:
- Direct Competitor;
- Indirect Competitor;
- Substitute.

Where legally/technically available capture:
- name;
- location;
- distance;
- category;
- rating;
- review count;
- positioning;
- price indication;
- opening status;
- proximity.

Configurable radii:
- 500m;
- 1km;
- 3km.

Do not assume fewer competitors automatically means a better market.

## 10. MARKET GAP ENGINE

Market gap is a **hypothesis** based on:
- demand;
- customer fit;
- competition density;
- positioning;
- review/customer pain signals;
- price positioning.

Every hypothesis must show evidence, confidence, and validation requirement.

## 11. ACCESSIBILITY ENGINE

Analyze:
- main-road distance;
- road class where available;
- travel time;
- residential proximity;
- offices;
- schools;
- malls;
- transport nodes;
- parking;
- pedestrian access;
- visibility;
- delivery access.

## 12. LOCATION COST ENGINE

Inputs:
- monthly rent;
- annual rent;
- deposit;
- property size;
- rent/m²;
- renovation;
- service charge;
- utilities;
- signage;
- initial equipment.

Outputs:
- Annual Rent;
- Rent/m²;
- Occupancy Cost Ratio;
- Initial Location Investment;
- Total Initial Investment.

Unknown rent must be shown as an estimated range with confidence and field verification.

## 13. FINANCIAL ENGINE

```text
Revenue =
Customers per Day × Average Transaction Value × Operating Days
```

Generate:
- Conservative;
- Base;
- Upside.

Outputs:
- monthly revenue;
- gross profit;
- operating expense estimate;
- contribution margin;
- break-even;
- estimated payback.

All assumptions must be visible.

## 14. LOCATION SCORING

Component scores:
- Market Fit;
- Customer Fit;
- Demand;
- Competition;
- Market Gap;
- Accessibility;
- Financial Fit;
- Growth;
- Risk;
- Data Confidence.

Scores must be explainable and evidence-backed. Composite score may be used for filtering but must not hide component trade-offs.

## 15. CANDIDATE OUTPUT

Each candidate:
- Candidate ID;
- Location;
- Area;
- Coordinates;
- Business Fit;
- Demand;
- Customer Fit;
- Competition;
- Market Gap;
- Accessibility;
- Cost;
- Financial Scenario;
- Growth;
- Risk;
- Confidence;
- Why Candidate;
- What Must Be Validated.

Preferred label:

**Recommended Candidate for Field Validation**

not "Best Location".

## 16. REPORT STRUCTURE

1. Executive Decision Summary
2. Business Objective
3. Customer & Market Profile
4. Methodology
5. Market Demand
6. Competition Landscape
7. Market Gap Hypotheses
8. Area Analysis
9. Micro-location Analysis
10. Candidate Location Shortlist
11. Candidate #1
12. Candidate #2
13. Candidate #3
14. Candidate #4
15. Candidate #5
16. Financial Scenarios
17. Risk Analysis
18. Field Validation Checklist
19. Data Confidence
20. Sources & Methodology

## 17. FIELD VALIDATION

Customer validates:
- people/hour;
- vehicles/hour;
- peak time;
- weekday/weekend;
- actual rent;
- deposit;
- lease terms;
- property size;
- renovation;
- parking;
- access;
- visibility;
- competitor traffic;
- pricing;
- flood/local conditions;
- security;
- zoning;
- local restrictions.

## 18. SOFTWARE ARCHITECTURE

```text
Frontend
  ↓
API Gateway
  ↓
Application Services
  ├─ Location Service
  ├─ Project Service
  ├─ Report Service
  └─ Customer Service
  ↓
AI Orchestration
  ↓
Maps + External Data + Proprietary Data
  ↓
PostgreSQL + PostGIS
```

## 19. DATABASE

Recommended PostgreSQL + PostGIS.

Initial entities:
- users
- clients
- projects
- business_profiles
- location_searches
- location_candidates
- competitors
- location_analysis
- market_signals
- financial_scenarios
- field_validation
- reports
- report_versions
- data_sources
- agent_runs
- agent_tasks
- audit_logs

Separate source data, derived data, AI analysis, and user data.

## 20. API ABSTRACTION

```text
LocationProvider
  ├─ MockLocationProvider
  └─ GoogleMapsProvider
```

Business logic must not be tightly coupled to Google SDK.

## 21. ENVIRONMENTS

Development:
```text
MAP_PROVIDER=mock
```

Staging:
```text
MAP_PROVIDER=google
ENVIRONMENT=staging
```

Production:
```text
MAP_PROVIDER=google
ENVIRONMENT=production
```

## 22. COST CONTROL

Track:
- API cost estimate;
- daily usage;
- monthly usage;
- project budget;
- provider usage.

Before expensive research:
```text
Estimate Cost
↓
Compare Budget
↓
Within Budget?
YES → Execute
NO → Reduce Scope / Request Approval
```

Use staged enrichment and explicit field masks.

## 23. AI ARCHITECTURE

Capabilities:
- Intake;
- Research Planning;
- Location Analysis;
- Competition;
- Market Gap;
- Financial Analysis;
- Scoring;
- Report Generation;
- QA.

No single prompt should run the entire product.

## 24. AI OUTPUT RULES

AI must:
- distinguish facts and assumptions;
- cite sources;
- show confidence;
- expose assumptions;
- avoid fabricated data;
- avoid fabricated property listings;
- avoid invented competitors;
- avoid unsupported revenue claims;
- identify missing data;
- request field validation.

Prefer `DATA NOT AVAILABLE` over hallucination.

## 25. AUDITABILITY

Where permitted, retain:
- project_id;
- research_plan;
- source references;
- retrieval timestamps;
- AI model/version;
- prompt version;
- analysis version;
- scoring version;
- report version;
- approval timestamp.

## 26. SECURITY

- secrets in environment/secret manager;
- restricted API keys;
- least privilege;
- authentication;
- authorization;
- rate limiting;
- audit logging;
- input/output validation;
- PII minimization;
- encrypted transport;
- secure DB credentials.

Never commit secrets.

## 27. PRIVACY

Minimize customer data, restrict access, define retention, provide privacy notice, and prevent cross-customer data exposure.

## 28. LEGAL / COMPLIANCE

The product must state:

> This report is an analytical decision-support product. It does not constitute a guarantee of business success, investment advice, legal advice, property due diligence, or financial assurance.

Customer independently verifies ownership, rent, lease, zoning, permits, physical conditions, actual traffic, and local regulations.

## 29. BUSINESS MODEL

Potential packages:
- Free Sample;
- Basic;
- Standard;
- Premium;
- Monitoring.

Pricing must be configurable.

## 30. PRODUCT MOAT

```text
Customer Briefs
+
Historical Research
+
Field Survey
+
Actual Rent
+
Actual Footfall
+
Actual Business Outcomes
+
Location Performance
+
Industry Benchmarks
```

## 31. MVP

```text
Customer Brief
↓
Location Search
↓
Competition Research
↓
Basic Demand Analysis
↓
Location Scoring
↓
5 Candidate Locations
↓
Financial Scenarios
↓
PDF Report
```

MVP success means:
1. Create project.
2. Enter business brief.
3. Create research plan.
4. Retrieve/mock location data.
5. Identify competitors.
6. Calculate metrics.
7. Generate shortlist.
8. Generate financial scenarios.
9. Generate report.
10. QA report.
11. Owner review.
12. Delivery.

## 32. MVP NON-GOALS

Do not initially build:
- mobile app;
- complex CRM;
- autonomous outbound sales;
- advanced subscription billing;
- nationwide data warehouse;
- ML prediction model;
- real-time traffic platform;
- property marketplace;
- fully autonomous company.

## 33. LONG-TERM VISION

```text
Location Reports
↓
AI Location Platform
↓
Automated Research Agents
↓
Proprietary Location Dataset
↓
Continuous Location Intelligence
↓
AI Expansion Decision Platform
```

## 34. MASTER PRINCIPLE

Prioritize correctness, compliance, explainability, and customer trust over speed, convenience, flashy UI, automation, or data completeness.

## 35. OWNER AUTHORITY

Owner has final authority over:
- business model;
- pricing;
- product positioning;
- major architecture;
- data providers;
- risk tolerance;
- production deployment;
- customer commitments.

Major changes require owner approval and version documentation.

**END OF PROJECT MASTER SPECIFICATION**
