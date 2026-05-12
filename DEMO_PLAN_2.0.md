# AgroSim 2.0 — Demo Plan for Finals

> 3-minute live demo. Tested end-to-end against the live Supabase.
> Best presented from a phone (iPhone or Android Chrome).

---

## Pre-flight checklist (do 10 minutes before going on stage)

- [ ] Phone fully charged, brightness max, do-not-disturb on
- [ ] Open `https://agrosimulator.vercel.app` in Chrome
- [ ] Tap the orange **"Reset to baseline + enter"** button — gives you a clean Pak Ali state
- [ ] Wait for `/home` to load — confirm yellow warning on Plot A is visible
- [ ] Have a real Malaysian agri receipt photo saved on phone Photos (or use the test image at `agrosimulator/test-fixtures/receipt-mancozeb.jpg`)
- [ ] Have a chilli plant photo (real or stock) saved on phone Photos
- [ ] Test WiFi/data — load /home once and verify everything renders
- [ ] Backup: have a screen recording of the full flow saved to phone in case live network dies

---

## The 3-minute flow

### 0:00–0:15 — Hook (Jeanette stands, no phone yet)

> *"Imagine you're a chilli farmer in Cameron Highlands. You wake at 5am, you walk to your farm alone, and you make every decision by yourself. No agronomist when your plant gets sick. No accountant when you tally costs. No leverage when the middleman pays you 30% under market. You're the smallest player in a system designed by people much bigger than you."*
>
> *"AgroSim is your silent partner."*

### 0:15–0:30 — Open the app (phone screen on projector)

- Show landing page → headline "Stop farming alone"
- Tap **"Enter the demo"** (or the orange Reset button if you need fresh data)
- Lands on **/home** as Pak Ali
- Brief point at the AI summary, the urgent task, the yellow warning on Plot A

> *"This is Pak Ali, two-acre chilli farmer. AgroSim has flagged Plot A — recent rain, anthracnose risk."*

### 0:30–1:30 — HERO MOMENT 1: Doctor diagnosis (the marquee)

Tap the urgent task **"Inspect Plot A — anthracnose risk"**.

**Step 1 — pattern question (the smart one)**
- Screen shows: *"Is this happening to: just one plant / a few plants / whole plot / other crops too?"*

> *"Before any photo, AgroSim asks the one question every other app skips. If it's affecting other crops too, it's not a disease — it's water or chemicals. This single question saves a lot of wrong diagnoses."*

- Tap 🟡 **"A few plants in a row"**

**Step 2 — photo**
- Tap "Take a photo" → camera opens
- Either snap a real chilli leaf or pick a saved chilli photo

**Step 3 — differential ladder appears LIVE on screen**
- Five candidates appear, three crossed out with reasons

> *"Watch this. The AI doesn't just guess. It considers five possibilities and rules three out — with reasons the farmer can verify himself: it's not bacterial wilt because the plant isn't drooping. Not iron deficiency because iron affects new leaves, not old ones. Not Cercospora because there are no frog-eye rings."*

**Step 4 — physical confirmation test**
- Screen shows: *"Cut a fruit. Smell the inside: sour 🍋 / earthy 🍄 / nothing 🤷"*

> *"And this is what no other app on Earth does. AgroSim asks the farmer to smell the plant. Smell is one of the strongest clues a real plant doctor uses. AgroSim is the first app to use it."*

- Tap 🍋 **"Sour like vinegar"**

**Step 5 — final diagnosis**
- Screen shows: **"Anthracnose, 91% confident"** with full reasoning sections

> *"Confirmed: anthracnose. AgroSim shows why it's sure, what it ruled out, and what it's still not certain about. Then a two-part prescription: spray Mancozeb generic at RM 12 from the nearest kedai, AND fix the drainage so this stops happening every rainy season."*

> *"And in five days, AgroSim will check back in: 'how are the plants? Better, same, or worse?' If worse, it sends the case to a real MARDI extension officer."*

### 1:30–2:15 — HERO MOMENT 2: Pact (the killer line)

Bottom nav → tap **Pact**.

- Screen shows: *"Other chilli farmers in Cameron Highlands averaged RM 4.20/kg this week. You sold at RM 3.80."*

> *"This single line destroys the middleman's biggest weapon: information asymmetry. The middleman knew the price. Pak Ali didn't. Until now. Every farmer's number stays anonymous; only the district median is shown."*

- Scroll to Group Buys section
- Show Pak Hassan's Mancozeb group buy: 1/4 joined, save RM 10/packet
- Tap on it → tap **Join** with quantity 2

> *"And this is how we change the input cost too. Five farmers in the kampung want NPK this month? AgroSim pools the order and gets the bulk price. Pak Ali joins his neighbour Hassan's Mancozeb buy with one tap."*

### 2:15–2:50 — HERO MOMENT 3: Receipt scanning (Books)

- Bottom nav FAB (the + button) → **Scan Receipt**
- Tap **Open camera** → photograph a real Malaysian agri receipt OR upload a saved one
- Wait ~8 seconds for AI to parse
- Show the parsed result with green/amber rows

> *"And the books layer. Snap any receipt — BM, English, handwritten, thermal printed, even a WhatsApp screenshot. AgroSim reads it in eight seconds. Confidence is colour-coded so the farmer knows what to glance over and what's safe to confirm."*

- Tap **"Looks right — Add to inventory"**
- Brief mention WhatsApp version

> *"And once we wire up Twilio's WhatsApp sandbox next week, none of this needs the app. The farmer just forwards the receipt to AgroSim's WhatsApp number. Inventory updates in eight seconds."*

### 2:50–3:00 — Close (Jeanette, phone down)

> *"Three layers, deeply integrated. Care protects the crop. Books makes the business legible. Pact gives the farmer leverage he's never had."*
>
> *"AgroSim is not just another app. It's a silent partner. And quietly, a co-op."*
>
> *"Stop farming alone."*

---

## Q&A prep — the questions judges will ask

| Question | Honest answer |
|---|---|
| "How is your AI different from Plantix?" | The AI itself isn't — it's Gemini Vision, same as anyone could use. The DIFFERENCE is the diagnostic protocol: pattern-question first, differential ladder visible to the farmer, explicit ruling-out, smell as a structured input, physical confirmation tests, honest uncertainty, 5-day follow-up. Plantix names a disease. AgroSim diagnoses one. |
| "Group buying — how many farmers do you have?" | Today: zero in the wild. We're pre-launch. The Pact features work at small scale and unlock fully with district density. Our go-to-market is a partnership with one Cameron Highlands or Kedah co-op to bootstrap — NOT an app store launch. |
| "What if the AI is wrong?" | It refuses to guess below 70% confidence. It bundles photos + history + reasoning and offers three escalation paths: DOA lab, MARDI extension officer, anonymous neighbour vote. Then 5 days later: did the treatment work? If worse, auto-escalate. We trust farmers more than other apps do. |
| "How will farmers actually adopt this?" | WhatsApp. Every Malaysian smallholder is on it. They already message their agri shop on it. Sending a receipt photo to AgroSim's WhatsApp number is exactly the same gesture they already make. Setup: zero. App download: not required. |
| "What's your business model?" | Freemium for individual farmers (Care + Books). Paid tier for co-ops (analytics, group-buy aggregation fee, MARDI partnership integration). Long-term: data partnerships with input suppliers and DOA. |
| "Why now?" | Three things converged: (1) Gemini Vision became cheap enough to run on every photo. (2) Supabase + Vercel let two-person teams ship like enterprises. (3) WhatsApp Business API costs dropped, finally making it the practical farmer channel. |

---

## What to skip if you run short

| If running short on time, skip this | Time saved |
|---|---|
| The Receipt scan demo (mention WhatsApp version verbally instead) | ~35s |
| The "Start a group buy" flow (just show the existing one) | ~20s |
| The plot list / inventory tour | ~30s |

**NEVER skip the doctor flow** — it's the marquee. If anything else fails, this one moment carries the demo.

---

## Failure modes + fallbacks

| If this breaks | Do this |
|---|---|
| WiFi drops mid-demo | Pre-loaded screenshots are in `Photos > AgroSim Demo Backup` album |
| Gemini API quota hits | The flow still works — observations will say "API limit reached, here's the historical case for this plant" — pivot to showing the cached anthracnose case |
| Receipt scan fails to parse | Show a previous successfully-parsed receipt in inventory |
| Live URL is slow | Open the locally-running version from `npm run dev` on your laptop instead |
| Demo data got corrupted from previous tests | Tap **Reset to baseline + enter** on the landing page |

---

## Post-demo follow-up

After the demo, leave a 1-page leave-behind for judges with:
- The doctor-style diagnosis differentiation (the 5-pillar list)
- The Pact moat argument (network effect / cold-start plan)
- Roadmap to launch with one co-op partner
- Contact info: Teo Zen Ben + Jeanette Tan En Jie

The leave-behind PDF is at `agrosimulator/AGROSIM_2.0_PITCH.pdf` (TODO if not built yet).
