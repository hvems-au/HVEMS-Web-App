# Interpretations and assumptions register

The companion *Development Scope and Functional Specification v2.2* was not available. These are the points where the Client Scope of Work (SoW) is implicit. Each one is implemented as stated and is easy to change; **please confirm or correct** (approval AP-6).

| ID | Topic | SoW basis | Interpretation implemented | Label |
|---|---|---|---|---|
| I-01 | "Fleet Manager or above" | §3.4 | Owner ⊇ Administrator ⊇ Fleet Manager for operational capabilities (triage, holds, Minor clearance, work orders, workforce). Administrators still have no billing or closure | Recommended |
| I-02 | Who edits the register | §2.4 (Administrator "manages … sites and assets") | Owner and Administrator create, edit, archive and import assets, clients and sites. Fleet Managers view them | Recommended — confirm whether Fleet Managers should also add assets |
| I-03 | Viewer and costs | §2.4 "read-only access to assets, records and reports"; §3.1 "costs (for permitted roles)" | Viewers see reports but not cost columns (`assets.costs.view`: Owner, Administrator, Fleet Manager, Finance) | Recommended |
| I-04 | Mandatory fields by class | §3.1 | Vehicles: make, model, registration, state, VIN. Plant: make, model, serial. Portable/fixed: make, model. Stored as data (`asset_classes.required_fields`) | Recommended (setting) |
| I-05 | Duplicate checks | §3.1 | Asset numbers unique per company (case-insensitive, including archived). VIN/serial/registration duplicates checked among *current* assets; a reason allows saving | Recommended |
| I-06 | Implausible meter jump | §3.1 | More than 2,000 km/day or 24 h/day since the last accepted reading (settings) | Recommended (setting) |
| I-07 | Grant eligibility | §2.4 | Clearance Authority: Administrator, Fleet Manager, Technician. Approval Limit: Owner, Administrator, Fleet Manager, Technician, Finance. Marketplace Buyer: Administrator, Fleet Manager, Finance | Recommended |
| I-08 | Owner role changes | §2.4 | Ownership can't be changed by a role edit or invitation; an ownership-transfer workflow is needed (2D, account closure) | Recommended |
| I-09 | Support access length | §2.3 "time-limited" | Up to 240 minutes per session (setting) | Recommended (setting) |
| I-10 | Password policy | §2.5 "password checks" | At least 10 characters including a number or symbol; Supabase leaked-password protection to be enabled | Recommended |
| I-11 | Job Manager acceptance | §2.4 "post and manage jobs" | Job Managers can accept proposals (the Account Owner's saved card is used) | To be confirmed |
| I-12 | Company account approval | Not in SoW (Figma F-04) | Company and marketplace-only accounts are self-serve; only providers need HVEMS verification | To be confirmed by HVEMS |
| I-13 | Out-of-sequence readings | §7.2 "kept and flagged" | Kept as "awaiting manager" and flagged; never overwrite the current reading | Recommended |
