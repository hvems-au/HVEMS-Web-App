# Pre-start checklists: draft for HVEMS review (P-01)

**Status:** draft, 10 Nov 2026. Not in the product. The equipment page shows a disabled **Pre-start (Coming soon)** button until HVEMS approves this content.

**Before release:** a competent person at HVEMS (for example Jaimie or a workshop supervisor) reviews every item and its severity. These become HVEMS's standard templates, so HVEMS owns their content.

**Sources:** original wording based on public Australian guidance: the NHVR daily check guidance for heavy vehicles, Safe Work Australia and WorkSafe QLD guidance on mobile plant, earthmoving and quick hitches, and AS 2550 for cranes. Nothing is copied from any commercial checklist product. Model-specific items come from each machine's operator's manual and are added by the company.

---

## 1. How a pre-start works

1. The driver scans the machine's QR label (or opens it in the app) and signs in with their Driver ID and PIN.
2. HVEMS builds the checklist from three parts:
   - the **generic and safety sections** that apply to every machine;
   - the **class section**, for example Excavator;
   - any **add-ons** ticked for that machine, for example a quick hitch, plus any items the company has added.
3. The driver answers each item:
   - ✅ **OK**
   - ❌ **Fault**: a note is always required. A photo is **recommended** (the app prompts for one), but never mandatory: where a photo isn't appropriate or possible, the note is enough (HVEMS, 10 Nov 2026).
   - **N/A**: only allowed on items marked "N/A allowed".
4. The driver enters the current odometer or hours reading. It's checked against the last reading in the same way as meter readings are now.
5. **General notes and photos** can be added at the end.
6. The driver ticks the declaration and signs.
7. HVEMS works out the result:

| Result | When | What happens |
|---|---|---|
| **Pass** | No faults | The machine stays in its current condition |
| **Pass with faults** | Only Minor or Major faults | A defect is raised for each fault. A Major fault makes the machine **Needs attention** and notifies the **Owner and Fleet Managers** (HVEMS, 10 Nov 2026) |
| **Fail: do not operate** | Any Critical fault | A Critical defect is raised, the machine goes **Out of service**, the driver sees "Do not operate this machine", and the Owner and Fleet Managers get a critical alert (O-07) |

Severity labels used below:
- **C** = Critical (out of service)
- **M** = Major (needs attention)
- **m** = Minor (defect only)

---

## 2. Header (filled in automatically)

The driver sees these fields but can't edit them. If any is wrong, they can report it as a note.

| Field | Source |
|---|---|
| Company | Organisation |
| Equipment ID | Asset number |
| Class | Asset class, for example Excavator |
| Make / Model / Year | Equipment record |
| Rego and state | Equipment record (vehicles) |
| VIN or serial number | Equipment record |
| Site / Client | Current site and client of the equipment |
| **Last odometer** | Latest accepted km reading, with its date |
| **Last hours** | Latest accepted hours reading, with its date |
| Open defects and holds | A list of what is already reported, so the driver doesn't report it twice |
| Operator | The signed-in driver: name and Driver ID |
| Date and time | Now, in the company's timezone |
| Checklist version | For example "Excavator v3": stored with the result |

The driver enters:
- **Current odometer / hours** (required when the machine has that meter);
- **Shift**: day or night (optional);
- **Fit for work**: see item S-01.

---

## 3. Safety section (every heavy machine and vehicle)

| # | Item | Sev. |
|---|---|---|
| S-01 | I am fit for work: not fatigued, not affected by alcohol, drugs or medication | C |
| S-02 | I hold the licence or competency for this machine | C |
| S-03 | Seatbelt is fitted, latches and retracts; not cut or frayed | C |
| S-04 | ROPS/FOPS (cab protection) is undamaged, with no cracks, bends or missing bolts | C |
| S-05 | Service brakes work | C |
| S-06 | Park brake holds | C |
| S-07 | Steering works normally, with no excessive free play | C |
| S-08 | Horn works | M |
| S-09 | Reversing alarm or travel alarm works | C |
| S-10 | Flashing beacon works (N/A allowed if not fitted) | M |
| S-11 | Emergency stop works (N/A allowed if not fitted) | C |
| S-12 | Hydraulic isolation / lockout lever locks the controls | C |
| S-13 | Controls return to neutral; no unintended movement | C |
| S-14 | No warning lights or alarms after start-up; gauges read normal | M |
| S-15 | Mirrors and reversing camera are clean, adjusted and working | M |
| S-16 | Windscreen and windows are not cracked so as to block vision; wipers work | M |
| S-17 | Steps, handrails and grab handles are secure, clean and not slippery | M |
| S-18 | Fire extinguisher is present, in date and charged | M |
| S-19 | Fire suppression system is armed and in date (N/A allowed if not fitted) | M |
| S-20 | Emergency exit is clear and works (N/A allowed if not fitted) | M |
| S-21 | No fluid leaks that create a fire or slip risk | C |

---

## 4. Generic section (every machine and vehicle)

| # | Item | Sev. |
|---|---|---|
| G-01 | Walk-around: no new damage to body, panels, guards or attachments | m |
| G-02 | Guards and covers are fitted and secure | M |
| G-03 | Engine oil level OK | M |
| G-04 | Coolant level OK | M |
| G-05 | Hydraulic oil level OK (N/A allowed) | M |
| G-06 | Fuel level enough for the shift | m |
| G-07 | AdBlue/DEF level OK (N/A allowed) | m |
| G-08 | No small leaks: oil, coolant, fuel, hydraulic | m |
| G-09 | Hoses and fittings: no rubbing, cracks or bulges | M |
| G-10 | Belts and fan: no visible damage | M |
| G-11 | Air filter restriction indicator OK (N/A allowed) | m |
| G-12 | Battery secure; isolator works | M |
| G-13 | Lights work: head, tail, work and indicator lights | M |
| G-14 | Cab clean; no loose items that could jam controls | m |
| G-15 | Seat secure and adjusts | m |
| G-16 | Air conditioning / demister works | m |
| G-17 | First aid kit present | m |
| G-18 | Operator's manual and any load chart in the cab | m |
| G-19 | Grease points greased as the manual requires (N/A allowed) | m |
| G-20 | Machine is clean enough to inspect: mud and debris not hiding damage | m |

---

## 5. Class sections

### Excavator
| # | Item | Sev. |
|---|---|---|
| EX-01 | **Quick hitch**: safety pin or latch is engaged; the bucket is test-pulled against the ground before work | C |
| EX-02 | Quick hitch warning light or alarm works (N/A allowed) | C |
| EX-03 | Boom, stick and bucket pins and keepers are in place | C |
| EX-04 | Boom and stick: no cracks in welds or structure | C |
| EX-05 | Hydraulic rams: no leaks; rods not scored | M |
| EX-06 | Bucket teeth and side cutters are secure | m |
| EX-07 | Tracks: tension OK; no broken pads; rollers and idlers OK | M |
| EX-08 | Slew lock and slew brake work | M |
| EX-09 | Counterweight secure | C |
| EX-10 | Hose burst / load-holding valves fitted if the machine is used for lifting (N/A allowed) | C |
| EX-11 | Rated capacity chart in the cab if used for lifting (N/A allowed) | M |

### Dozer
| # | Item | Sev. |
|---|---|---|
| DZ-01 | Blade, push arms and tilt rams: no cracks; pins secure | C |
| DZ-02 | Cutting edges and end bits secure | m |
| DZ-03 | Ripper shank, tip and pin secure (N/A allowed) | M |
| DZ-04 | Tracks: tension OK; no broken shoes; undercarriage OK | M |
| DZ-05 | Final drives: no leaks | M |
| DZ-06 | Winch rope and controls OK (N/A allowed) | C |

### Loader (wheel loader, skid steer, backhoe loader)
| # | Item | Sev. |
|---|---|---|
| LD-01 | Articulation lock pin is **stowed** for operation | C |
| LD-02 | Bucket or forks are secure; coupler pin engaged | C |
| LD-03 | Lift arms and linkages: no cracks; pins secure | C |
| LD-04 | Tyres: no cuts or bulges; pressure looks right; wheel nuts tight | M |
| LD-05 | Skid steer: seat bar and lap bar interlock works (N/A allowed) | C |
| LD-06 | Backhoe: stabilisers and boom lock work (N/A allowed) | M |

### Grader
| # | Item | Sev. |
|---|---|---|
| GR-01 | Blade, circle and moldboard: secure, no cracks | M |
| GR-02 | Articulation and front wheel lean work | M |
| GR-03 | Scarifier / ripper secure (N/A allowed) | M |
| GR-04 | Tyres and wheel nuts OK | M |
| GR-05 | Tandem drives: no leaks | m |

### Mobile crane (proposed new standard class)
| # | Item | Sev. |
|---|---|---|
| CR-01 | Current periodic inspection / registration is in date | C |
| CR-02 | Load chart for this configuration is in the cab | C |
| CR-03 | Load moment / rated capacity indicator: self-test passed | C |
| CR-04 | Anti-two-block works | C |
| CR-05 | Hook block: safety latch works; hook not deformed | C |
| CR-06 | Wire rope: no broken wires, kinks, crushing or birdcaging | C |
| CR-07 | Outriggers and pads: extend, lock and pads present | C |
| CR-08 | Slew brake and slew lock work | C |
| CR-09 | Boom: no damage; pins and retainers secure | C |
| CR-10 | Wind speed indicator works (N/A allowed) | M |
| CR-11 | Lifting gear (slings, shackles) tagged and in date | C |

### Prime mover / rigid truck (NHVR daily check style)
| # | Item | Sev. |
|---|---|---|
| TR-01 | Wheels and tyres: tread, no damage; wheel nuts tight, with no rust trails | C |
| TR-02 | Air system: builds pressure; no audible leaks; low-air warning works | C |
| TR-03 | Brake test before moving | C |
| TR-04 | Coupling: fifth wheel or tow coupling locked; safety chains fitted | C |
| TR-05 | Lights and reflectors, including trailer lights | M |
| TR-06 | Load restraint: equipment secure and in date | C |
| TR-07 | Mudflaps and guards present | m |
| TR-08 | Rego label / registration current | M |
| TR-09 | Work diary present if required | M |

### Trailer
| # | Item | Sev. |
|---|---|---|
| TL-01 | Coupling, kingpin or drawbar: no cracks; locked | C |
| TL-02 | Brakes connected and working; breakaway system OK | C |
| TL-03 | Wheels, tyres, wheel nuts | C |
| TL-04 | Lights and reflectors | M |
| TL-05 | Ramps and pins secure for travel (N/A allowed) | C |
| TL-06 | Landing legs raised and secure | M |

### Light vehicle
| # | Item | Sev. |
|---|---|---|
| LV-01 | Tyres (including spare), wheel nuts | M |
| LV-02 | Brakes, steering and lights | C |
| LV-03 | Mine-spec items such as a flag, beacon or UHF radio (N/A allowed) | M |
| LV-04 | Registration current | M |

---

## 6. Add-on sections (ticked per machine)

| Add-on | Items |
|---|---|
| **Tipper body** | Body-up prop works; hoist has no leaks; tailgate locks; PTO light off when the body is down |
| **Truck-mounted crane / hiab** | Load chart, stabilisers, hook latch, slings tagged, rated capacity limiter test |
| **Quick hitch** (on any carrier) | As EX-01 / EX-02 |
| **Water cart** | Pump, spray bar, valves and tank secure; baffles OK |
| **Attachments** (rock breaker, auger, grapple, forks) | Attachment pins and locks; hoses; wear |
| **Refrigeration unit** | Fuel, temperature setting, alarms |
| **Fire suppression** | Gauge in the green; tags in date |

---

## 7. End of checklist

- **General notes:** free text.
- **Photos:** up to 10, taken with the phone camera or chosen from the gallery. Photos are compressed and stored privately with the pre-start.
- **Declaration:** "I have completed this check honestly. Faults I found are recorded above."
- **Signature:** the driver signs on screen. The time and the Driver ID are recorded with it.

## 8. Decisions needed from HVEMS

1. Approve or change the items and their severities.
2. Add **Mobile crane** as a standard class (cranes are currently "Other mobile plant").
3. Choose which items allow N/A.
4. ~~Photo rules~~ **Decided 10 Nov 2026:** photos recommended, never mandatory; a note is always required. Still open: the maximum number of photos (draft: 10).
5. ~~Major-fault notification~~ **Decided 10 Nov 2026:** a Major fault notifies the Owner and Fleet Managers.
