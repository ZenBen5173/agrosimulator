# AgroSim 2.0 — Product Specification

> Status: locked, May 2026. Source of truth for finals build and pitch.
> Authors: Teo Zen Ben (dev), Jeanette Tan En Jie (pitch).

---

## 1. Thesis

**Stop farming alone.**

AgroSim 2.0 turns every Malaysian smallholder into part of an invisible co-op — without him having to organise one. It is a silent business partner that lives in the farmer's phone (and his existing WhatsApp), with three deeply integrated layers: **Care** (protect the crop), **Books** (make the business legible), **Pact** (collective power against the middleman).

The conceptual leap from 1.0: we stop treating each farmer as an isolated user with a fancy assistant. We treat him as a node in a network he didn't have to build.

### One-line positioning
*"AgroSim is a silent business partner for the Malaysian smallholder — it watches over your crops, keeps your books, and connects you with neighbours so you stop getting squeezed by middlemen."*

### Why rebuilding for finals
- **Qualifier round** shipped 7 broad feature areas to demonstrate AI breadth. It worked — we made finals.
- **Finals round** rewards focused product thinking, real user value, and a defensible moat. Breadth becomes a liability.
- We are cutting the SME-style features (sales pipeline, equipment depreciation, worker scheduling) that target the wrong user, and concentrating on the three layers that actually change a smallholder's life.

---

## 2. The user

A Malaysian smallholder farmer (~600–700k of them). Typically:
- 2–10 hectares, often paddy, chilli, kangkung, banana, corn, sweet potato
- Solo or family-run; hires 2–3 day-labourers in planting season
- Already on WhatsApp; uses it to message agri shop and middleman
- Speaks BM, often Tamil/Mandarin/English mixed
- Notebook + receipt-box + memory is the current "system"
- Burned by failed gov apps; trust is earned slowly

### The three economic forces ruining his life
1. **Middleman tax on both ends** — agri shop overcharges for inputs; taukeh underpays for output. He has no leverage because he's one farm.
2. **Catastrophic single-event risk** — one disease outbreak, one bad week of weather, one price crash, season is gone. No buffer.
3. **No institutional memory** — what worked last year? What did this plot yield? He doesn't really know — nothing recorded it.

Every feature in 2.0 traces back to one of these three. If a feature doesn't, it gets cut.

---

## 3. Architecture: three layers

| Layer | Purpose | Job-to-be-done |
|---|---|---|
| **Care** | Protect what's planted | "Don't lose this season to disease or bad weather" |
| **Books** | Know what's actually working | "Tell me what to grow more of next season" |
| **Pact** | Collective power | "Stop letting the middleman set my price" |

The layers are deeply integrated. The diagnosis log feeds the network early-warning. The receipt scan feeds the inventory which feeds the group-buy match. The end-of-season verdict feeds the planting decision next season. No layer stands alone.

---

## 4. Layer detail

### 4.1 CARE — Doctor-style diagnosis as the marquee

The diagnosis flow is the hero feature and the demo centerpiece. Other crop disease apps act like a vending machine: insert leaf, get answer. AgroSim works like a doctor: it considers, rules out, tests, explains, treats — and follows up.

#### Locked features

**1. Doctor-style disease diagnosis (8-step flow)**

The flow is grounded in the canonical expert protocol (Ohio State 20 Questions, CABI Plantwise, IRRI Rice Doctor) and adds the unique-to-AgroSim differentiators (pattern-question first, differential ladder, smell input, physical confirmation tests, ruling-out reasoning).

| Step | What happens | Why it matters |
|---|---|---|
| 1. Context auto-loaded | App knows crop, plot, age from onboarding | Zero friction, mirrors expert "establish baseline" |
| 2. Pattern question first | "One plant / few / whole plot / other crops too?" | **Splits biotic from abiotic in one tap** — no other app asks this first |
| 3. Photo with healthy comparison | Camera overlay: frame sick + healthy leaf in one shot | Enables delta detection, mirrors expert "look at multiple plants" |
| 4. Differential ladder visible | AI shows top 5 candidates, crosses out 2-3 with explicit reasoning | Educational; transparent; reduces hallucination |
| 5. Adaptive history (max 3 questions) | Onset, weather, recent sprays | Prioritised by what discriminates remaining candidates |
| 6. Physical confirmation test | One discriminating test the farmer does with their hands: cut, smell, scratch, look at underside | **Smell input is novel — no app does this**; stem-ooze test is 97% accurate for bacterial wilt |
| 7. Diagnosis with full transparency | Names diagnosis + WHY sure + WHAT ruled out + WHAT still uncertain | Per Ohio State Q18: "list what you did NOT find" |
| 8. Two-part prescription (Plantwise model) | Control now + Prevent recurrence; with local brand prices at nearest kedai | Real value, real specificity |

**The pattern-question example:**

> *"Is this happening to: just one plant 🟢 / a few plants 🟡 / the whole plot 🔴 / other crops too 🟣?"*

If 🟣, it's almost certainly abiotic (drainage, herbicide drift, weather damage) — the AI doesn't even need a photo to start ruling out diseases.

**The differential ladder example (chilli leaf spot case):**

> *"5 possibilities. Ruling out 3 from the photo:"*
>
> ❌ Bacterial wilt — *plant isn't drooping; bacterial wilt would show that first*
> ❌ Iron deficiency — *iron affects new leaves; yours started in old leaves*
> ❌ Cercospora — *would have frog-eye rings; yours doesn't*
>
> *Most likely: Anthracnose (62%) or Phosphorus deficiency (28%). One test to confirm.*

**The smell test example:**

> *"Cut a fruit, smell the inside: sour like vinegar 🍋 / earthy like soil 🍄 / nothing 🤷"*
>
> Sour confirms anthracnose (acetic compounds from fungal breakdown).

**2. Treatment monitoring loop**

5-day push notification: *"How are the chilli plants? Better / Same / Worse"*
- Better → close case, log success in plot history (feeds future pattern recognition)
- Same → AI adjusts dose/frequency; recheck in 3 days
- Worse → auto-escalate to Tier-3, with full case package attached

**3. Tier-3 expert escalation**

When AI confidence < 70%, AgroSim refuses to guess. It bundles photos + history + AI reasoning into one package and offers:
- **DOA Diagnostic Service** (Perkhidmatan Diagnostik Perosak Tanaman — official lab, free, slow)
- **WhatsApp a MARDI extension officer** (faster, partnership-dependent — pitch this as a roadmap relationship)
- **Anonymous neighbour ask** (only works at Pact-layer density)

**4. Plot-specific risk alerts**

Tied to *your specific crops at your specific growth stage*, not generic district weather:
> *"4 rainy days in a row + your chilli is in fruiting stage = 70% anthracnose risk. Inspect Plot B today."*

**5. Plot diagnosis history**

Every diagnosis logged per plot. AI uses it for pattern recognition next time:
> *"This is the third time this plot got anthracnose in rainy season. Root cause is drainage, not the fungus. Fix the drainage and it stops."*

#### What's NOT in Care
- Generic "ask AgroBot anything" chat (hallucination liability — wrong agricultural advice can kill a crop)
- Risk scoring on every app open with pulsing tiles (alert fatigue)
- Multi-state weather animations (visual fluff)

#### Honest about what's hard in Care
- Reliable counterfactual reasoning from Gemini requires structured output schema + 2–3 days of prompt engineering with real test images
- Smell adjective set must be scoped to crops where smell *is* discriminating (anthracnose, bacterial soft rot, fusarium yes; most leaf spots no)
- Rule-out explanations must be grounded in a Malaysia-specific differential rules table for the top 20 crop diseases — otherwise the LLM hallucinates plausible-sounding but wrong reasoning

---

### 4.2 BOOKS — Know what's actually working

The single output that matters: *"Your chilli made RM 3.40/kg net, your kangkung made 80 sen. Grow more chilli."* Everything else exists to make that line accurate.

#### Locked features

**1. WhatsApp receipt scanning**

Farmer forwards an agri-shop receipt photo (BM, English, handwritten, thermal, screenshot — all handled by Gemini Vision) to AgroSim's WhatsApp number. ~8 seconds later: confirmation message + inventory updated. **No app needed.**

Demo moment for finals: judge takes a real Malaysian agri receipt out of his wallet, photographs it, WhatsApps the demo number, watches inventory update live in the app behind him.

**2. WhatsApp voice activity logging**

Farmer sends a voice note: *"I sprayed Plot B with mancozeb today"* → AI parses → logs to plot history + deducts from inventory. Voice in BM, Tamil, Mandarin, English. Hands-free for the muddy-boots moment.

**3. Inventory tracking (auto-built, never manually entered)**

- *In* = receipt scans (automatic)
- *Out* = voice notes + treatment confirmations (semi-automatic)
- Farmer never opens a spreadsheet
- Drift-tolerant: when balance gets weird, AgroSim asks "do a quick stock check?" rather than failing silently

**4. Subsidy claim tracking**

Subsidi Baja, MySUBSIDI, district-specific schemes. *"You've claimed RM 240 this season, you're eligible for another RM 180 by 30 June. Tap to start the form."* Real money on the table that farmers leave behind.

**5. Loan tracking**

Agrobank, TEKUN. Repayment schedule, interest, next payment due. Tied to seasonal cash flow projection.

**6. End-of-season verdict (the killer output)**

Per-crop, per-plot:
- Total cost in (inputs + labour + equipment wear)
- Total yield out
- Net RM/kg
- Comparison to last season
- Comparison to anonymous district median (powered by Pact layer)
- One-screen summary the farmer can screenshot and send to his wife

#### What's NOT in Books
- SME-style sales pipeline (SO/DO/Invoice/customer payment scoring) — wrong scale entirely
- Worker registry + AI labour scheduling — wrong scale, friction > value
- Equipment depreciation tracking — subsistence farmers don't think in book-value terms
- Daily prep list with exact gram quantities — overconfident, breaks trust on first error
- Stock-market-style price charts with sparklines — farmer wants buy/sell signal, not MACD
- Activity log, data export, crop calendar — open-once-then-forgotten

#### Honest about what's hard in Books
- Receipt OCR accuracy on real-world handwritten/thermal receipts varies 70–95%; need a "looks right? confirm" step with confidence-tiered UI (green = auto, amber = verify, red = manual)
- Voice in dialect-heavy BM and Tamil is harder than standard variants; Whisper/Gemini may need fine-tuning samples
- Inventory drift is the silent killer of any tracking system — needs gentle reconciliation prompts, not punishment

---

### 4.3 PACT — Collective power against the middleman

The new layer. The conceptual leap. A single farmer using AgroSim is no better off than before; ten farmers in one kampung change the local economy.

**Pact compounds with density.** That's both the moat and the go-to-market problem.

#### Locked features

**1. Group buying**

> *"5 farmers in Kg. Padang Lalang want NPK 15-15-15 this month. Bulk price from Kedai Ah Kow: RM 78/sack (vs RM 95 individual). Tap to join — closes Friday."*

AgroSim aggregates the order, sends one combined message to the supplier, splits delivery. No human coordinator.

**2. Group selling**

> *"You + 3 neighbours have chilli ready in 4 days. Restoran Setapak wants 50 kg. Your share: 12 kg @ RM 4.50/kg. Tap to commit."*

AgroSim does the matchmaking. Logistics start as farmer-organised pickups; later evolve into a mini delivery network if it works.

**3. Anonymous price benchmark (the highest-value feature in the whole app)**

Weekly quiet message:
> *"Other chilli farmers in Cameron Highlands averaged RM 4.20/kg this week. You sold at RM 3.80."*

This single line destroys information asymmetry — the middleman's biggest weapon. Aggregated from end-of-season verdicts and in-season sales logs across the network. Anonymous, district-level only, opt-in for contributing.

**4. Network disease early-warning**

Falls out of Care-layer diagnosis logging for free, as soon as Pact has density:
> *"3 farms within 8 km confirmed anthracnose this week. Your Plot B is the same crop and stage — inspect today."*

**5. Anonymous community second-opinion**

When AI confidence is low and farmer prefers community over MARDI:
> *"3 nearby farmers will see your photo + symptoms (no names). Vote in 2 hours."*

#### What's NOT in Pact (yet)
- Direct-to-consumer marketplace (logistics nightmare; v3 if at all)
- Public farmer-to-farmer chat / forum (moderation cost > value at this stage)

#### Honest about what's hard in Pact
- **Cold start.** Pact is useless until ~10–30 farmers per district join. Solo farmer launch fails. **Go-to-market must start as a partnership** with one Kedah or Cameron Highlands co-op / MARDI district office, NOT as an app store launch.
- For the finals demo: seed Pact features with realistic-looking demo data, be honest that this is roadmap-with-traction-plan, not live network.
- Trust between farmers about price-sharing: framing as **anonymous district aggregate**, never per-farmer, is critical.

---

## 5. Cross-cutting infrastructure

Not "features" but core to everything.

| Component | Choice | Why |
|---|---|---|
| **Primary channel** | WhatsApp (Baileys for finals demo, WhatsApp Business API via 360Dialog/Twilio for production) | Every Malaysian smallholder is already on it, already messages their agri shop on it. Meets them where they are. |
| **Voice input** | Whisper or Gemini audio (BM, Tamil, Mandarin, English) | Typing is a barrier for the demographic; muddy-boots moment is real |
| **Onboarding** | Light: farm boundary draw on satellite (one-time, real value for plot math), crop selection, language pick, WhatsApp number link | One-shot, never asked again |
| **Notifications** | WhatsApp message, NOT app push | The channel they already check |
| **Offline tolerance** | Diagnosis history + last week's prices cached locally; syncs on reconnect | Real conditions in rural Malaysia |
| **Languages** | BM, Tamil, Mandarin, English (auto-detect from voice/text input) | Demographic reality |

---

## 6. What we cut from 1.0 (explicit)

For the finals deck — be open about what we removed and why:

| Cut from 1.0 | Why |
|---|---|
| Isometric PixiJS farm | Beautiful, no user value — judge-bait |
| Equipment depreciation tracking | Wrong mental model for smallholder |
| SME sales pipeline (SO/DO/Invoice) | Wrong scale of business |
| AI plot layout recommendations | Established farmers grow what they grow |
| AI soil research from satellite | Approximate guess; farmer already knows his soil |
| Daily prep list (exact gram quantities) | Overconfident, breaks trust on first error |
| Generic AgroBot AI chat | Hallucination liability for crops |
| Worker registry + labour AI | Wrong scale |
| Stock-market-style price charts | Farmer wants buy/sell signal, not MACD |
| Multi-state weather animations | Decoration |
| Activity log, data export, crop calendar | Open-once-then-forgotten features |

The fact that we *cut* features is itself a pitch point — shows product maturity.

---

## 7. Why we win — the moat per layer

| Layer | Why competitors can't easily copy |
|---|---|
| **Care** | The diagnostic *protocol* (pattern-first + differential ladder + smell + physical tests + rule-out + monitoring) is a system, not a single feature. Each individual element is unremarkable; assembled together, it's the only crop disease app that diagnoses like a doctor. Plus Malaysia-specific rules table grounded in MARDI guidelines. |
| **Books** | WhatsApp-first + voice-first + auto-built inventory removes the discipline barrier that kills every other farm tracking app. The end-of-season verdict only works once we have multi-season data — which compounds. |
| **Pact** | Network effects. A solo-farmer app is a feature anyone can ship. A network of trusting Malaysian smallholders is a moat that compounds with every farmer added. |

---

## 8. Build sequencing for finals

**Foundation (week 1)**
- WhatsApp Baileys bot operational (receive/send text + image + voice)
- Gemini Vision pipeline for receipts and plant photos
- Supabase schema: plots, diagnoses, inventory, transactions, farmers, farms_district_aggregates
- Voice transcription pipeline (Whisper or Gemini audio)

**Care first (week 2)**
- Pattern question + adaptive history flow
- Differential ladder UI + ruling-out reasoning prompt architecture
- Smell/physical-test prompt patterns for top 10 Malaysia crops
- Treatment monitoring 5-day loop
- Tier-3 escalation bundling

**Books second (week 3)**
- WhatsApp receipt scanning end-to-end (the second wow moment)
- Voice activity logging
- Inventory auto-build
- End-of-season verdict UI (can use seeded multi-season data for demo)

**Pact third (week 4 — partial demo)**
- Group buying mock with realistic seed data
- Anonymous price benchmark UI
- Network disease early-warning (works with seeded neighbour data)
- Honest pitch framing: "live at small scale today, unlocks fully with district density — partnership plan with [Kedah co-op / MARDI district office]"

**Polish + demo rehearsal (week 5)**
- The 3-min demo flow rehearsed cold
- Backup recordings if WhatsApp Baileys gets banned mid-demo
- Q&A prep for the obvious judge questions

---

## 9. Pitch line + key messaging

**Headline (one line, locked):**
> *Stop farming alone.*

**Two-sentence elevator:**
> AgroSim is a silent business partner for Malaysia's 700,000 smallholder farmers. It watches over their crops with a doctor-style AI, keeps their books through WhatsApp without typing, and quietly turns every isolated farmer into part of an invisible co-op so they stop getting squeezed by middlemen.

**Three pillar lines:**
- *Care* — "It diagnoses plants the way a MARDI extension officer does — by ruling things out, not by guessing."
- *Books* — "Forward your receipts to our WhatsApp number. We do the spreadsheet."
- *Pact* — "Other farmers in your district got RM 4.20 for chilli this week. You got RM 3.80. Now you know."

**The judge-memorable demo moments (in priority order):**
1. **Diagnosis differential ladder live on stage** — judge sees AI cross out 3 candidates with explicit reasoning, then asks the farmer to smell. No other team's demo will look like this.
2. **WhatsApp receipt scan from a real Malaysian receipt** — judge takes one out of their wallet, photographs it, sends. Inventory updates 8 seconds later.
3. **Anonymous price benchmark message** — quiet, devastating. *"You sold at RM 3.80. Average was RM 4.20."*

**Closing line:**
> *We're not selling another app. We're giving Malaysia's smallholders a silent partner — and quietly, a co-op.*

---

## 10. Open questions / decisions still pending

These are not blockers but worth deciding before week 1:
- **Partnership for Pact bootstrap** — which co-op or MARDI district to approach for the live launch? Kedah (paddy density) or Cameron Highlands (chilli density)?
- **WhatsApp number provisioning** — fresh SIM for Baileys demo; backup SIM ready. Production number registration with Meta to start in parallel (multi-week verification).
- **MARDI partnership pitch** — even an informal "we use your published guidelines and would like to refer cases to your extension officers" relationship would strengthen the pitch.
- **Demo crop** — paddy or chilli? Chilli has more visual disease drama (anthracnose lesions, bacterial wilt sudden flop); paddy has more farmers. Recommend chilli for demo, paddy mentioned in pitch as "and we cover the staple too."

---

*End of spec. Update this doc, not CLAUDE.md, as the source of truth for 2.0 build decisions.*
