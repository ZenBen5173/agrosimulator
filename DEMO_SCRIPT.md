# AgroSim — 3-Minute Demo Script

## Opening (0:00–0:20)

"Every year, Malaysian smallholder farmers lose millions to crop diseases they could have caught earlier. AgroSim gives every farmer — no matter how small their land — a world-class AI advisor in their pocket."

## Setup (0:20–0:40)

Show the onboarding: sign in, find farm on satellite map, draw the boundary.

"The farmer draws their actual farm on a real satellite image. Our AI instantly researches the soil type — in this case, clay soil near the MADA irrigation scheme in Kedah — and recommends the best crops for each plot."

## The Farm (0:40–1:10)

Show the home screen: isometric farm, weather animation, warning icons pulsing.

"This is the farmer's digital twin — a living replica of their farm. It updates with real weather data. See those orange warning icons? The AI detected elevated disease risk after consecutive rainy days and high humidity."

## Hero Moment (1:10–2:00) — MOST IMPORTANT

"Let's do an inspection."

1. Tap the warning tile → bottom sheet opens → tap "Start Inspection"
2. Show briefing screen with AI-generated tips
3. Take 3 photos (use gallery for demo)
4. AI analyses → follow-up questions appear
5. Answer the questions
6. Show diagnosis result

"The AI asked 3 follow-up questions to be sure. It came back with high confidence: Chilli Anthracnose. Here are step-by-step treatment instructions."

"But here's what makes this special — if the AI isn't sure, it says so. It never guesses. Below 85% confidence, it connects the farmer with a real expert at MARDI instead."

## Daily Tasks (2:00–2:30)

Swipe up the drawer → show today's task list.

"Every morning, the AI generates a personalised to-do list. It knows rain is coming tomorrow — so it prioritises drainage checks over watering. It knows chilli prices are up 15% — so it flags the harvest opportunity."

## Planting Planner (2:30–2:45)

Quick flash: tap a harvested plot → "Plan next crop" → show the AI recommendation with weekly schedule.

"When a crop is harvested, the AI recommends what to plant next — considering crop rotation, soil health, and market prices. It generates a complete week-by-week care schedule."

## Close (2:45–3:00)

"AgroSim isn't just an app. It's a step toward Malaysian technological sovereignty — where our farmers are empowered by AI built for them, in their context, for their crops. This is AI that speaks Bahasa Paddy."

---

## Demo Prep Checklist

- [ ] Phone charged, screen brightness max
- [ ] Pre-signed in with test account (skip OTP during demo)
- [ ] Farm already onboarded with 4 plots (Paddy, Chilli, Tomato, Kangkung)
- [ ] At least one plot with orange/red warning for inspection demo
- [ ] 3 crop photos saved to phone gallery (download from internet: chilli leaf spot, healthy plant)
- [ ] WiFi/4G stable — test all API calls 10 minutes before
- [ ] If Gemini quota exhausted: mock fallbacks still work, demo still shows the flow
- [ ] Backup: screen recording of full flow saved on laptop (in case live demo fails)

## Fallback: If Something Breaks Live

- Weather not loading? → "The weather module uses real OpenWeatherMap data — it works perfectly in normal conditions."
- AI tasks empty? → Swipe drawer still shows weather + market prices. Move on.
- Inspection fails? → Show the result screen from a previous session (screenshot on phone).
- The app is designed with graceful degradation — every AI feature has a mock fallback.
