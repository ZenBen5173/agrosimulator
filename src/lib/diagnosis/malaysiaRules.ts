/**
 * Malaysia-specific differential diagnosis rules table.
 *
 * Grounded in MARDI guidelines + IRRI Rice Doctor fact sheets + peer-reviewed
 * Malaysian crop pathology research (Colletotrichum spp. peninsular Malaysia
 * survey, etc.). This table is what keeps the LLM honest — every rule-out
 * reason and physical-test recommendation must reference this data, not the
 * model's general training.
 *
 * To extend: add a new MalaysiaDiseaseRule object to MALAYSIA_RULES and the
 * differential ladder for that crop will pick it up automatically.
 */

import type { CropName, PhysicalTestType, SmellAdjective } from "./types";

export interface MalaysiaDiseaseRule {
  id: string;
  crop: CropName;
  name: string; // human-friendly
  scientificName: string;
  category:
    | "fungal"
    | "oomycete" // Phytophthora & Pythium — water moulds, behave like fungi clinically
    | "bacterial"
    | "viral"
    | "insect_pest"
    | "nematode" // root-knot, cyst — animal pathogens, treated separately
    | "nutrient_deficiency"
    | "abiotic_water"
    | "abiotic_heat"
    | "abiotic_chemical"
    | "abiotic";

  /** What you DO see if it's this. Used in vision prompt grounding. */
  signsPositive: string[];

  /** Tells the model what to look for to RULE OUT other diagnoses
   *  in favour of this one. */
  ruleOutClauses: { ifAbsent: string; thereforeNot: string }[];

  /** Discriminating physical test the farmer can do */
  bestTest: {
    test: PhysicalTestType;
    instruction: string;
    expectedResult: string;
    smellExpected?: SmellAdjective; // if test is cut_fruit_inspect_smell
  };

  /** Two-part prescription (Plantwise model) */
  treatment: {
    chemical?: {
      name: string;
      brandLocal?: string; // e.g. "Antracol" — what farmer asks for at kedai
      dose: string;
      frequency: string;
      estCostRm?: { brand: number; generic: number };
    };
    cultural: string[];
    preventRecurrence: string[];
  };

  /** Weather pattern that elevates risk for this disease */
  weatherTrigger?: {
    description: string;
    consecutiveRainyDays?: number;
    minHumidity?: number;
    minConsecutiveHotDays?: number;
  };
}

// ─── CHILLI DISEASES ────────────────────────────────────────────

const CHILLI_RULES: MalaysiaDiseaseRule[] = [
  {
    id: "chilli_anthracnose",
    crop: "chilli",
    name: "Anthracnose",
    scientificName: "Colletotrichum truncatum",
    category: "fungal",
    signsPositive: [
      "sunken dark lesions on fruit, often with concentric rings",
      "pinkish-orange spore masses inside lesions in wet conditions",
      "leaf spots starting on older leaves",
      "fruit may rot from the tip inward",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any fruit lesions",
        thereforeNot: "anthracnose typically affects fruit; leaf-only symptoms point elsewhere",
      },
      {
        ifAbsent: "concentric rings or sunken lesion centres",
        thereforeNot: "Cercospora produces frog-eye rings, anthracnose produces sunken concentric rings",
      },
    ],
    bestTest: {
      test: "cut_fruit_inspect_smell",
      instruction: "Pick an affected fruit and cut it open. Smell the inside.",
      expectedResult: "sour smell + dark concentric internal lesions + sometimes pinkish spore mass",
      smellExpected: "sour",
    },
    treatment: {
      chemical: {
        name: "Mancozeb 80% WP",
        brandLocal: "Dithane M-45 / generic Mancozeb",
        dose: "2.5 g per litre water",
        frequency: "every 7 days, 3 applications",
        estCostRm: { brand: 28, generic: 12 },
      },
      cultural: [
        "remove and burn infected fruit (do NOT compost — spores survive)",
        "stake plants for airflow",
      ],
      preventRecurrence: [
        "switch from overhead to drip irrigation",
        "prune lower leaves for canopy airflow",
        "plant resistant variety next season (MC11, MC12 series)",
        "rotate to non-Solanaceae crop next season",
      ],
    },
    weatherTrigger: {
      description: "fungal pressure rises sharply after consecutive rainy days with high humidity",
      consecutiveRainyDays: 3,
      minHumidity: 80,
    },
  },

  {
    id: "chilli_cercospora",
    crop: "chilli",
    name: "Cercospora Leaf Spot",
    scientificName: "Cercospora capsici",
    category: "fungal",
    signsPositive: [
      "circular leaf spots with light grey/white centres",
      "dark reddish-brown margin with characteristic 'frog-eye' concentric ring",
      "yellow halo around spots",
      "lesions up to 1.5 cm",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any frog-eye or concentric ring on leaves",
        thereforeNot: "Cercospora's signature is the frog-eye ring; without it, look elsewhere",
      },
    ],
    bestTest: {
      test: "lesion_margin_check",
      instruction: "Examine a leaf spot closely. Is there a clear ring with a pale centre?",
      expectedResult: "frog-eye pattern: pale centre, dark ring, yellow halo",
    },
    treatment: {
      chemical: {
        name: "Chlorothalonil 50% SC",
        brandLocal: "Daconil / generic chlorothalonil",
        dose: "2 ml per litre water",
        frequency: "every 10 days, 3 applications",
        estCostRm: { brand: 35, generic: 18 },
      },
      cultural: ["remove badly infected leaves", "improve airflow"],
      preventRecurrence: [
        "avoid overhead watering in late afternoon",
        "rotate fungicide chemistry next season to prevent resistance",
      ],
    },
    weatherTrigger: {
      description: "extended leaf wetness from rain or dew",
      consecutiveRainyDays: 4,
      minHumidity: 75,
    },
  },

  {
    id: "chilli_bacterial_wilt",
    crop: "chilli",
    name: "Bacterial Wilt",
    scientificName: "Ralstonia solanacearum",
    category: "bacterial",
    signsPositive: [
      "sudden wilting of whole plant or branch WITHOUT leaf yellowing",
      "wilt does not recover at night",
      "brown slimy ooze when stem is cut",
      "vascular tissue brown when stem cross-section examined",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "sudden plant-wide wilt",
        thereforeNot: "bacterial wilt's signature is the sudden flop; gradual decline points elsewhere",
      },
      {
        ifAbsent: "milky bacterial ooze in water-glass test",
        thereforeNot: "stem-ooze test is 97% accurate; negative result rules out bacterial wilt",
      },
    ],
    bestTest: {
      test: "stem_ooze_water_glass",
      instruction:
        "Cut a wilted stem near the base. Suspend the cut end in a clear glass of water. Wait 2–5 minutes.",
      expectedResult: "milky white slimy stream of bacteria flowing down from the cut",
    },
    treatment: {
      chemical: undefined, // no effective chemical control
      cultural: [
        "remove and burn infected plants immediately (do NOT pull through clean rows)",
        "disinfect tools with 70% alcohol or 10% bleach between plants",
      ],
      preventRecurrence: [
        "do not replant Solanaceae (chilli, tomato, eggplant, potato) in this plot for 3 years",
        "improve drainage — bacterial wilt thrives in waterlogged soil",
        "test soil pH and adjust to 6.0–6.5 (bacteria less aggressive)",
        "consider grafted seedlings on resistant rootstock for next season",
      ],
    },
    weatherTrigger: {
      description: "warm + waterlogged soil after heavy rain",
      consecutiveRainyDays: 2,
      minConsecutiveHotDays: 3,
    },
  },

  {
    id: "chilli_phosphorus_deficiency",
    crop: "chilli",
    name: "Phosphorus Deficiency",
    scientificName: "P deficiency",
    category: "nutrient_deficiency",
    signsPositive: [
      "older leaves develop dull dark green to purplish/bronze tinge",
      "stunted growth, thin stems",
      "delayed flowering, poor fruit set",
      "no lesions, no spore masses, no ooze",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any sour or earthy smell when fruit cut",
        thereforeNot: "deficiencies are odourless; sour/earthy smell points to anthracnose or soft rot",
      },
      {
        ifAbsent: "any visible lesion or spot pattern",
        thereforeNot: "P deficiency is a colour/growth pattern, not a lesion pattern",
      },
    ],
    bestTest: {
      test: "leaf_age_pattern",
      instruction:
        "Look at where the discolouration STARTED. Old (lower) leaves first, or new (top) leaves first?",
      expectedResult: "P deficiency starts in OLDER leaves (P is mobile, plant moves it to new growth)",
    },
    treatment: {
      chemical: {
        name: "Triple Super Phosphate (TSP) or NPK 12-24-12",
        brandLocal: "available at kedai pertanian as TSP or compound NPK",
        dose: "30 g per plant base, water in well",
        frequency: "single application, repeat in 4 weeks if no improvement",
        estCostRm: { brand: 8, generic: 5 },
      },
      cultural: [
        "check soil pH — P availability drops below pH 5.5 and above pH 7",
        "apply organic matter (compost) to improve P availability",
      ],
      preventRecurrence: [
        "soil test before next season's planting",
        "apply base P fertiliser at transplanting, not just side-dressing",
      ],
    },
  },

  {
    id: "chilli_water_stress",
    crop: "chilli",
    name: "Water Stress (Drought / Under-watering)",
    scientificName: "Abiotic — water deficit",
    category: "abiotic_water",
    signsPositive: [
      "wilting of leaves and stems, often most severe in the hottest part of the day",
      "leaves recover (turgor returns) when watered or after dusk",
      "soil at root zone is dry to the touch",
      "older leaves may yellow and drop if stress is prolonged",
      "no lesions, no spore masses, no ooze when stem is cut",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "uniform plant-wide wilting that recovers with watering",
        thereforeNot: "water stress wilts the whole plant uniformly and reverses with water — localised lesions point elsewhere",
      },
      {
        ifAbsent: "dry soil at root zone",
        thereforeNot: "if the soil is moist or wet but the plant still wilts, suspect bacterial wilt or root rot instead",
      },
    ],
    bestTest: {
      test: "scratch_stem_alive",
      instruction:
        "Push a finger 5 cm into the soil near the root zone. Then cut a wilted stem near the base. Note both: is the soil dry? Does anything ooze from the stem in clear water?",
      expectedResult: "DRY soil + NO bacterial ooze in water-glass test = water stress",
    },
    treatment: {
      chemical: undefined,
      cultural: [
        "water deeply now — soak the root zone, not just the surface",
        "water in early morning or late afternoon (not midday)",
        "mulch around the plant base to reduce evaporation",
        "shade cloth during the hottest hours if the day is exceptional",
      ],
      preventRecurrence: [
        "set a watering schedule based on weather (more in hot dry weeks, less in rainy)",
        "install drip irrigation if you can — uses 30-50% less water and keeps roots evenly moist",
        "improve soil organic matter (compost) so it holds water longer",
        "monitor with a finger-test or moisture meter weekly",
      ],
    },
    weatherTrigger: {
      description: "consecutive hot dry days with no rain",
      minConsecutiveHotDays: 4,
    },
  },

  {
    id: "chilli_waterlogging",
    crop: "chilli",
    name: "Waterlogging (Root Suffocation)",
    scientificName: "Abiotic — excess water / poor drainage",
    category: "abiotic_water",
    signsPositive: [
      "wilting even though the soil is wet (looks like a water-stressed plant but soil is muddy or saturated)",
      "yellowing of older leaves",
      "rotten smell or grey roots when dug up",
      "stunted growth following heavy rain",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "wet or saturated soil at root zone",
        thereforeNot: "waterlogging requires actually wet soil — dry soil + wilting points to drought stress instead",
      },
    ],
    bestTest: {
      test: "dig_root_inspect",
      instruction:
        "Carefully dig 10 cm down near the root zone. Look at root colour and smell.",
      expectedResult: "grey/dark soft roots + sour or rotten smell = root suffocation from waterlogging",
    },
    treatment: {
      chemical: undefined,
      cultural: [
        "improve drainage immediately — dig channels, raise beds if you can",
        "stop watering until soil dries out somewhat",
        "remove dead plants to prevent secondary bacterial wilt",
      ],
      preventRecurrence: [
        "raised beds for the next planting cycle",
        "amend heavy clay soil with sand + organic matter",
        "avoid planting in low-lying spots that pool water",
      ],
    },
    weatherTrigger: {
      description: "consecutive heavy rain days",
      consecutiveRainyDays: 3,
    },
  },

  {
    id: "chilli_bacterial_leaf_spot",
    crop: "chilli",
    name: "Bacterial Leaf Spot",
    scientificName: "Xanthomonas euvesicatoria / X. campestris pv. vesicatoria",
    category: "bacterial",
    signsPositive: [
      "small (1-5 mm) round to angular spots on leaves",
      "spot centres turn dark brown to black, sometimes with a paler grey/tan centre",
      "yellow halo around each spot",
      "spots often constrained by leaf veins (angular shape)",
      "infected leaves yellow and drop prematurely",
      "young fruit may show raised scab-like spots that crack open",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any leaf spotting at all",
        thereforeNot: "bacterial leaf spot's signature is the leaf spot itself; pure wilting or fruit rot points elsewhere",
      },
      {
        ifAbsent: "yellow halo around spots",
        thereforeNot:
          "Cercospora and bacterial leaf spot both make small spots, but bacterial usually has a stronger yellow halo + angular margins limited by veins; Cercospora has rounder spots with paler grey centres",
      },
    ],
    bestTest: {
      test: "lesion_margin_check",
      instruction:
        "Look closely at a single spot. Is it a perfect circle (Cercospora) or angular/irregular following the leaf veins (bacterial)? Is the centre dark almost throughout, or does it have a pale grey/white centre?",
      expectedResult:
        "angular spots with dark centres + strong yellow halo = bacterial leaf spot; perfectly round 'frog-eye' with pale centre = Cercospora",
    },
    treatment: {
      chemical: {
        name: "Copper hydroxide (Kocide / Champion) + mancozeb tank-mix",
        brandLocal: "Kocide 3000 / generic copper",
        dose: "2 g per litre + mancozeb 2 g per litre",
        frequency: "every 7 days, 3 applications, alternate with mancozeb-only sprays to prevent copper resistance",
        estCostRm: { brand: 32, generic: 18 },
      },
      cultural: [
        "remove and BURN infected leaves (do NOT compost — bacteria survive)",
        "stop overhead watering — water at the base only, never wet the leaves",
        "disinfect pruning tools with 70% alcohol or 10% bleach between plants",
        "do not work in the field when plants are wet (you'll spread the bacteria)",
      ],
      preventRecurrence: [
        "use certified disease-free seed; if uncertain, hot-water seed treatment (50°C for 25 minutes)",
        "rotate crops — don't replant chilli, tomato, or capsicum in this plot for 2 years",
        "drip irrigation instead of overhead",
        "wider plant spacing for better airflow",
      ],
    },
    weatherTrigger: {
      description: "warm + wet conditions, especially after splashing rain",
      consecutiveRainyDays: 3,
      minHumidity: 80,
    },
  },

  {
    id: "chilli_powdery_mildew",
    crop: "chilli",
    name: "Powdery Mildew",
    scientificName: "Leveillula taurica",
    category: "fungal",
    signsPositive: [
      "white to pale grey powdery growth on the UNDERSIDE of leaves (unusual — most powdery mildews are top-side)",
      "yellow patches on the top side of the leaf, corresponding to the powdery growth underneath",
      "older leaves drop prematurely",
      "severe infections can defoliate the plant",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any white powdery growth on leaf undersides",
        thereforeNot: "powdery mildew's diagnostic sign is the white underside growth; no fungal mat means look elsewhere",
      },
    ],
    bestTest: {
      test: "check_leaf_underside",
      instruction:
        "Turn an affected leaf upside down. Look at the underside, especially around any yellow patches you see on top.",
      expectedResult: "white-to-grey powdery patches on the underside = powdery mildew confirmed",
    },
    treatment: {
      chemical: {
        name: "Sulfur 80% WG or potassium bicarbonate spray",
        brandLocal: "Sulfur (Belerang) / generic potassium bicarbonate",
        dose: "2-3 g per litre water",
        frequency: "every 7-10 days, 2-3 applications",
        estCostRm: { brand: 20, generic: 10 },
      },
      cultural: [
        "improve airflow — prune crowded branches, wider spacing next planting",
        "avoid overhead irrigation in late afternoon (extends leaf wetness)",
      ],
      preventRecurrence: [
        "plant resistant varieties where available",
        "rotate fungicide chemistry to prevent resistance",
        "sulphur burns hot at >32°C — apply early morning",
      ],
    },
    weatherTrigger: {
      description: "warm dry weather + cooler nights with dew",
      minHumidity: 60,
    },
  },

  {
    id: "chilli_chivmv",
    crop: "chilli",
    name: "Chilli Veinal Mottle Virus (ChiVMV)",
    scientificName: "Chilli veinal mottle virus (Potyvirus)",
    category: "viral",
    signsPositive: [
      "DARK-GREEN BANDS that hug the leaf veins on a lighter-green leaf (vein-banding) — pattern strictly follows the venation",
      "leaves often NARROW and strap-like, sometimes puckered (rugose)",
      "stunted overall growth, shortened internodes",
      "fruit set reduced; fruit may be smaller, narrow or distorted",
      "no bright yellow blotches between veins (that would suggest AMV instead); no concentric ring-spots (that would suggest TSWV instead)",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "tight vein-banding where colour change FOLLOWS the vein lines as narrow bands",
        thereforeNot:
          "ChiVMV's diagnostic feature is colour change BOUND TO the veins. Random yellow patches BETWEEN veins point to AMV; ring-spots point to TSWV; uniform interveinal yellowing points to nutrient issues",
      },
      {
        ifAbsent: "narrow/strap-like leaves OR pronounced rugose puckering",
        thereforeNot:
          "ChiVMV almost always distorts leaf shape (narrow, strap, puckered). If leaves keep normal broad shape with just colour change, suspect AMV / CMV / nutrient issue first",
      },
      {
        ifAbsent: "any sign of mottling at all in new growth",
        thereforeNot:
          "viral colour patterns appear in new growth; if only old leaves are affected, suspect mobile-nutrient deficiency (Mg/N/K) not virus",
      },
    ],
    bestTest: {
      test: "leaf_age_pattern",
      instruction:
        "Look at the new (top) leaves. Do they show vein mottling AND any distortion (narrow, puckered, asymmetric)?",
      expectedResult: "vein-band mottling + leaf distortion in new growth = viral infection (ChiVMV likely)",
    },
    treatment: {
      chemical: undefined,
      cultural: [
        "REMOVE and BURN infected plants (no cure)",
        "control aphid vectors aggressively (insecticidal soap, imidacloprid, neem oil)",
        "disinfect tools after touching infected plants — virus spreads by sap",
        "do not save seed from infected plants",
      ],
      preventRecurrence: [
        "use ChiVMV-tolerant varieties (MC11, MC12 series have some tolerance)",
        "control aphids early — they spread the virus before symptoms appear",
        "use reflective mulch (silver) — disorients aphids, reduces transmission",
        "isolate new seedlings from older infected plots",
      ],
    },
  },

  {
    id: "chilli_amv",
    crop: "chilli",
    name: "Alfalfa Mosaic Virus (AMV)",
    scientificName: "Alfalfa mosaic virus (Alfamovirus)",
    category: "viral",
    signsPositive: [
      "BRIGHT YELLOW or near-WHITE blotches/patches on leaves — striking 'calico' look",
      "patches sit RANDOMLY on the lamina, do NOT follow the vein pattern",
      "patch shapes are irregular (puddles/flakes), not narrow bands",
      "leaves often keep normal broad shape (less narrowing/strapping than ChiVMV)",
      "may show ring-like white discoloration on FRUIT in some strains",
      "transmitted by aphids, often near alfalfa or legume cover crops",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any bright yellow or near-white blotches that sit between (not along) the veins",
        thereforeNot:
          "AMV's calico/yellow-blotch pattern is its signature. Vein-bound colour change means ChiVMV; ring-spots mean TSWV",
      },
      {
        ifAbsent: "blotches large/irregular enough to read as patches (not pinprick spots)",
        thereforeNot:
          "AMV produces large, painterly yellow patches; tiny dot-spots point to insect feeding, nutrient flecking or fungal early lesions",
      },
    ],
    bestTest: {
      test: "leaf_age_pattern",
      instruction:
        "Look at a leaf with bright yellow patches. Trace one yellow patch — does it stop AT the small veins, or does the colour run THROUGH them? Also: did this start in NEW leaves first?",
      expectedResult:
        "yellow patches stop at major veins but sit independently of small vein pattern + appear in new growth = AMV",
    },
    treatment: {
      chemical: undefined,
      cultural: [
        "REMOVE and BURN affected plants — there is no chemical cure",
        "control aphid vectors aggressively (insecticidal soap, imidacloprid, neem oil)",
        "do NOT plant chilli adjacent to alfalfa, lucerne or legume cover crops (main reservoir)",
        "disinfect tools (10% bleach) after touching infected plants",
      ],
      preventRecurrence: [
        "use certified virus-free seedlings — AMV can be seedborne in chilli",
        "reflective silver mulch confuses aphids and reduces spread",
        "rogue volunteer pepper/tomato plants (alternate hosts)",
        "for confirmation, send sample to MARDI virology — symptoms ALONE cannot separate AMV from CMV reliably",
      ],
    },
  },

  {
    id: "chilli_cmv",
    crop: "chilli",
    name: "Cucumber Mosaic Virus (CMV)",
    scientificName: "Cucumber mosaic virus (Cucumovirus)",
    category: "viral",
    signsPositive: [
      "light-and-dark green MOSAIC on leaves (patchy, like camouflage)",
      "leaves often distorted, CRINKLED, narrowed or fern-like ('shoestring' in severe cases)",
      "yellowish patches and fine dark-green islands together",
      "fruit may show greasy spots, ringspots or warty bumps",
      "stunted plant, internodes shortened",
      "wide host range — usually arrives via aphids from cucurbits or weeds nearby",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "patchy mosaic / mottling AND any leaf shape distortion",
        thereforeNot:
          "CMV almost always combines mosaic colour with leaf-shape distortion. Pure colour change without distortion suggests AMV or nutrient cause",
      },
      {
        ifAbsent: "any cucurbit/weed host nearby OR aphid populations",
        thereforeNot:
          "CMV spread requires aphid vectors and an alternate host reservoir; in their absence ChiVMV/AMV/PMMoV are more likely",
      },
    ],
    bestTest: {
      test: "leaf_age_pattern",
      instruction:
        "Pick a young leaf. Is the green colour patchy AND the leaf shape narrowed/crinkled/fern-like compared to a healthy leaf?",
      expectedResult:
        "patchy mosaic + clear shape distortion in new growth = likely CMV",
    },
    treatment: {
      chemical: undefined,
      cultural: [
        "REMOVE and BURN infected plants",
        "weed aggressively — CMV survives in many common weeds (chickweed, milkweed, plantain)",
        "control aphids with insecticidal soap or neem oil weekly",
        "do not plant chilli next to cucurbits (cucumber, gourd, pumpkin)",
      ],
      preventRecurrence: [
        "use CMV-tolerant cultivars where available",
        "reflective silver mulch to repel aphids",
        "lab confirmation (ELISA / RT-PCR) at MARDI — CMV vs ChiVMV vs AMV cannot be told apart by eye alone",
        "rotate planting bed; clear all crop debris between seasons",
      ],
    },
  },

  {
    id: "chilli_tswv",
    crop: "chilli",
    name: "Tomato Spotted Wilt Virus (TSWV)",
    scientificName: "Tomato spotted wilt orthotospovirus",
    category: "viral",
    signsPositive: [
      "CONCENTRIC RING-SPOTS on leaves (chlorotic or necrotic rings — look like targets)",
      "small brown necrotic spots on foliage, often together with the rings",
      "ring-spots and brown sunken patches on FRUIT (most distinctive sign)",
      "tip dieback, one-sided wilting or sudden bronzing of new growth",
      "thrips (tiny dark insects in flowers) usually present — they are the vector",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any concentric ring-spot or target pattern on leaves OR fruit",
        thereforeNot:
          "TSWV's signature is the ring-spot. Plain mosaic without rings points to ChiVMV / AMV / CMV instead",
      },
      {
        ifAbsent: "thrips activity OR silvery feeding scars on leaves",
        thereforeNot:
          "TSWV needs thrips vectors. If no thrips at all, the chance drops sharply (still possible from infected transplants)",
      },
    ],
    bestTest: {
      test: "check_leaf_underside",
      instruction:
        "Look at the leaf underside AND open a flower. Are there tiny slender dark insects (thrips)? Also check fruit and leaves for ring-shaped spots.",
      expectedResult:
        "thrips visible + concentric ring-spots on fruit/leaves = TSWV likely",
    },
    treatment: {
      chemical: {
        name: "Spinosad (for thrips control — does NOT cure the virus)",
        brandLocal: "Tracer / Success / generic spinosad",
        dose: "0.5 ml per litre water",
        frequency: "every 7 days while thrips present, max 3 applications",
        estCostRm: { brand: 55, generic: 30 },
      },
      cultural: [
        "REMOVE and BURN infected plants — virus is incurable",
        "kill thrips early with spinosad or blue sticky traps",
        "remove flowering weeds within 5 m (thrips reservoir)",
        "do NOT plant chilli, tomato, eggplant or capsicum together",
      ],
      preventRecurrence: [
        "use TSWV-resistant varieties (carry the Tsw gene where available)",
        "UV-reflective silver mulch reduces thrips landing",
        "blue or yellow sticky cards as thrips early-warning",
        "lab confirmation (ELISA) at MARDI — symptoms overlap with other viruses",
      ],
    },
  },

  {
    id: "chilli_pmmov",
    crop: "chilli",
    name: "Pepper Mild Mottle Virus (PMMoV)",
    scientificName: "Pepper mild mottle virus (Tobamovirus)",
    category: "viral",
    signsPositive: [
      "MILD light-and-dark green mottle on leaves (subtle, easy to miss)",
      "leaves slightly puckered or with small bubbles, but mostly normal-shaped",
      "fruit lumpy, distorted or with brown/yellow streaks (more striking than the foliage)",
      "spreads by handling/tools and infected seed (NOT by insects)",
      "smokers/handlers can carry it on hands (related to TMV)",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "fruit distortion AND mild leaf mottle together",
        thereforeNot:
          "PMMoV's signature is mild leaf mottle WITH lumpy/streaked fruit. Severe leaf colour without fruit signs points elsewhere",
      },
      {
        ifAbsent: "any history of contact spread (worker handling, infected seed lot, tobacco contact)",
        thereforeNot:
          "PMMoV is mechanically spread; without a contact pathway it is less likely than aphid-borne viruses (CMV/AMV/ChiVMV)",
      },
    ],
    bestTest: {
      test: "no_test_needed",
      instruction:
        "Compare leaves AND fruit. Is the leaf mottle MILD but the FRUIT clearly distorted/streaked?",
      expectedResult: "subtle leaf mottle + obviously deformed fruit = consistent with PMMoV (lab confirmation needed)",
    },
    treatment: {
      chemical: undefined,
      cultural: [
        "REMOVE and BURN infected plants — virus is incurable and very persistent in soil/debris",
        "wash hands and disinfect tools (skim milk or 10% trisodium phosphate) between plants",
        "do NOT touch chilli plants right after handling tobacco",
        "use ONLY certified virus-free seed — PMMoV is highly seed-transmitted",
      ],
      preventRecurrence: [
        "plant PMMoV-resistant cultivars (carry L-gene resistance, e.g. L3 or L4)",
        "soak seeds in 10% trisodium phosphate for 15 min before sowing",
        "rotate plot away from solanaceous crops for 2 seasons",
        "lab confirmation (ELISA) at MARDI before destroying — easily confused with mild CMV",
      ],
    },
  },

  {
    id: "chilli_tmv",
    crop: "chilli",
    name: "Tobacco Mosaic Virus (TMV)",
    scientificName: "Tobacco mosaic virus (Tobamovirus)",
    category: "viral",
    signsPositive: [
      "LIGHT-AND-DARK GREEN MOSAIC pattern on leaves — patchy, like camouflage (more pronounced than PMMoV's mild mottle)",
      "leaves DISTORTED, sometimes 'fern-like' or 'shoestring' (severe strap-shaped narrowing) in advanced cases",
      "stunted plant growth, shortened internodes",
      "fruit usually unaffected and safe to eat (KEY DIFFERENCE from PMMoV which deforms fruit)",
      "spreads by HANDLING / TOOLS — tobacco contact is the classic route (smoker's hands transfer it)",
      "extremely persistent — survives for years on dried plant debris and tobacco products",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any mosaic / mottle / patchy chlorosis on leaves",
        thereforeNot:
          "TMV's signature is the leaf mosaic. Leaves with no patchy colour change are not TMV",
      },
      {
        ifAbsent: "history of tobacco handling OR contact-transmission pathway",
        thereforeNot:
          "TMV is mechanically spread (no insect vector). Without a contact pathway, aphid-borne viruses (CMV / AMV / ChiVMV) are more likely",
      },
      {
        ifAbsent: "leaves still mostly normal-shaped",
        thereforeNot:
          "if leaves are NOT distorted at all, suspect early CMV or AMV instead — TMV usually distorts leaf shape",
      },
    ],
    bestTest: {
      test: "no_test_needed",
      instruction:
        "Compare leaves AND fruit. Is the leaf mosaic pronounced AND fruit looks normal? Did anyone handle tobacco before touching the plants?",
      expectedResult:
        "leaf mosaic + leaf distortion + normal fruit + tobacco-contact history = consistent with TMV (lab confirmation needed)",
    },
    treatment: {
      chemical: undefined,
      cultural: [
        "REMOVE and BURN infected plants — virus is incurable and very persistent",
        "wash hands and disinfect tools (skim milk or 10% trisodium phosphate) between plants",
        "smokers must wash hands BEFORE touching chilli — tobacco products carry TMV",
        "do NOT use tobacco mulch or tobacco-derived pesticides near chilli",
      ],
      preventRecurrence: [
        "plant TMV-resistant cultivars (carry L-gene resistance like L1 or higher)",
        "isolate workers who handle tobacco from chilli operations",
        "soak seeds in 10% trisodium phosphate for 15 min before sowing",
        "rotate plot away from solanaceae for 2 seasons",
        "lab confirmation (ELISA) at MARDI — TMV vs PMMoV vs mild CMV cannot be told apart by eye alone",
      ],
    },
  },

  {
    id: "chilli_calcium_def_blossom_end_rot",
    crop: "chilli",
    name: "Blossom End Rot (Calcium Deficiency)",
    scientificName: "Ca deficiency / inconsistent water uptake",
    category: "nutrient_deficiency",
    signsPositive: [
      "dark sunken patch on the BLOSSOM end (bottom tip) of fruit, NOT on the leaves",
      "patch starts small and water-soaked, expands to a leathery dark scab",
      "no spots on leaves; the plant itself looks healthy",
      "first fruit of the season often most affected",
      "common after a hot dry spell or inconsistent watering",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any rot on the blossom end (bottom) of fruit",
        thereforeNot: "blossom end rot is named for its location — if the rot is at the stem end or anywhere else, look elsewhere",
      },
      {
        ifAbsent: "fruit at all",
        thereforeNot: "BER affects fruit only; foliage symptoms point to a different cause",
      },
    ],
    bestTest: {
      test: "no_test_needed",
      instruction:
        "Pick an affected fruit. Look at the BOTTOM (blossom) end. Is there a dark sunken patch there?",
      expectedResult: "yes = blossom end rot, calcium uptake issue (NOT a disease)",
    },
    treatment: {
      chemical: {
        name: "Calcium nitrate foliar spray (NOT a chemical disease treatment)",
        brandLocal: "Ca(NO3)2 — Mardi Direct or any kedai pertanian",
        dose: "5 g per litre water",
        frequency: "weekly foliar spray for 4 weeks",
        estCostRm: { brand: 12, generic: 8 },
      },
      cultural: [
        "WATER CONSISTENTLY — never let soil dry out completely between waterings",
        "mulch heavily around plants to keep soil moisture even",
        "avoid excess nitrogen fertiliser (it competes with calcium uptake)",
      ],
      preventRecurrence: [
        "drip irrigation instead of hand-watering — keeps moisture even",
        "soil test before next season — adjust calcium if low (lime if pH < 6.0)",
        "balanced fertiliser (NPK 12-12-17 or similar) instead of high-N",
      ],
    },
  },

  {
    id: "chilli_magnesium_deficiency",
    crop: "chilli",
    name: "Magnesium Deficiency",
    scientificName: "Mg deficiency",
    category: "nutrient_deficiency",
    signsPositive: [
      "yellowing BETWEEN the veins of OLDER (bottom) leaves",
      "leaf veins themselves stay green",
      "leaves may turn reddish or purple before yellowing in some varieties",
      "older leaves affected first because Mg is mobile (plant pulls it to new growth)",
      "common in sandy soils or after heavy rain leaches the soil",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "interveinal yellowing in old leaves first",
        thereforeNot:
          "Mg deficiency starts in OLD leaves; if new leaves are yellow first, suspect iron or sulphur instead",
      },
    ],
    bestTest: {
      test: "leaf_age_pattern",
      instruction:
        "Look at where the yellowing started. OLD (bottom) leaves first, with green veins still showing?",
      expectedResult: "yes = magnesium deficiency (Mg is mobile, depletes from old leaves first)",
    },
    treatment: {
      chemical: {
        name: "Epsom salt (magnesium sulphate) foliar spray",
        brandLocal: "Epsom salt — pharmacy or kedai pertanian",
        dose: "10 g per litre water",
        frequency: "every 14 days, 2-3 applications",
        estCostRm: { brand: 8, generic: 5 },
      },
      cultural: ["check soil pH — Mg locks up below pH 5.5; lime if too acidic"],
      preventRecurrence: [
        "annual dolomite lime application keeps soil Mg topped up",
        "compost / organic matter holds nutrients against leaching",
      ],
    },
  },

  {
    id: "chilli_aphid_damage",
    crop: "chilli",
    name: "Aphid Damage",
    scientificName: "Aphis gossypii / Myzus persicae",
    category: "insect_pest",
    signsPositive: [
      "small soft-bodied insects (green, yellow, or black) clustered on the underside of leaves and on tender new growth",
      "sticky honeydew coating on leaves below colonies",
      "black sooty mould growing on the honeydew",
      "curled, distorted, or stunted new leaves",
      "ants farming the aphids (often a giveaway)",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any visible insects under leaves or on new growth",
        thereforeNot: "aphid damage requires aphids — no insects means look at fungal, bacterial, or abiotic causes",
      },
    ],
    bestTest: {
      test: "check_leaf_underside",
      instruction:
        "Turn a curled or wilted new leaf upside down. Look for tiny soft insects in clusters, sticky residue, or sooty mould.",
      expectedResult: "visible insect colony on underside or sticky/black coating = aphids",
    },
    treatment: {
      chemical: {
        name: "Imidacloprid 17.8% SL (systemic) or insecticidal soap (contact)",
        brandLocal: "Confidor / generic imidacloprid; or DIY soap spray (1 tbsp dish soap per litre water)",
        dose: "0.5 ml imidacloprid per litre, OR DIY soap solution",
        frequency: "imidacloprid every 14 days max 2x; soap spray every 3 days as needed",
        estCostRm: { brand: 25, generic: 2 },
      },
      cultural: [
        "spray plants with strong jet of water to dislodge aphids (free, often enough)",
        "release ladybugs or lacewings if available — they eat 50+ aphids/day",
        "remove badly infested leaves",
      ],
      preventRecurrence: [
        "weekly inspection of new growth — catch them early",
        "reflective silver mulch disorients aphids",
        "avoid excess nitrogen (lush growth attracts aphids)",
        "interplant marigolds or coriander — repels aphids",
      ],
    },
  },

  {
    id: "chilli_thrips_damage",
    crop: "chilli",
    name: "Thrips Damage",
    scientificName: "Thrips palmi / Scirtothrips dorsalis",
    category: "insect_pest",
    signsPositive: [
      "tiny silver streaks or scars on leaves (rasping damage)",
      "leaves curl upward at the edges, forming a 'boat' shape",
      "tiny black specks (thrips faeces) on leaf surface",
      "stunted growth in young plants; flower drop in fruiting plants",
      "thrips themselves are tiny (1-2 mm) and very fast — shake plant over white paper to see them",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "silver-streak rasping damage on leaves",
        thereforeNot: "thrips damage signature is the silver streaks; spots or yellowing without streaks point elsewhere",
      },
    ],
    bestTest: {
      test: "check_leaf_underside",
      instruction:
        "Hold a white sheet of paper under a leaf and shake the plant gently. Watch for tiny insects falling onto the paper. Look at leaves for silver streaks and black specks.",
      expectedResult: "tiny moving specks on paper + silver streaks on leaf = thrips",
    },
    treatment: {
      chemical: {
        name: "Spinosad 12% SC",
        brandLocal: "Tracer / generic spinosad",
        dose: "0.4 ml per litre water",
        frequency: "every 7 days, 2-3 applications",
        estCostRm: { brand: 38, generic: 22 },
      },
      cultural: [
        "blue sticky traps catch adults",
        "remove badly damaged leaves",
        "reflective mulch reduces incoming flights",
      ],
      preventRecurrence: [
        "monitor weekly — populations explode in 7-10 days under hot dry conditions",
        "avoid broad-spectrum insecticides that kill thrip predators",
      ],
    },
  },

  {
    id: "chilli_spider_mite_damage",
    crop: "chilli",
    name: "Spider Mite Damage",
    scientificName: "Tetranychus urticae",
    category: "insect_pest",
    signsPositive: [
      "tiny pin-prick yellow or white spots on leaves (stippling)",
      "fine silk webbing on the underside of leaves and at branch junctions",
      "leaves look dusty or bronzed in severe cases",
      "leaves dry out and fall off if untreated",
      "mites themselves are extremely small — look like moving dust under a magnifying glass",
      "hot dry weather makes infestations explode within days",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "fine webbing on leaf undersides or branches",
        thereforeNot: "the webbing is the smoking gun for spider mites; pin-prick yellowing without webbing could be early viral or nutrient",
      },
    ],
    bestTest: {
      test: "check_leaf_underside",
      instruction:
        "Look at the underside of an affected leaf, ideally with a magnifying glass. Tiny moving specks and fine silk webbing?",
      expectedResult: "moving specks + webbing = spider mites",
    },
    treatment: {
      chemical: {
        name: "Abamectin 1.8% EC",
        brandLocal: "Vertimec / generic abamectin",
        dose: "0.5 ml per litre water + sticker",
        frequency: "every 7 days, 2 applications",
        estCostRm: { brand: 35, generic: 18 },
      },
      cultural: [
        "spray underside of leaves with strong water jet (mites hate moisture)",
        "increase humidity around plants — misting deters mites",
        "remove badly infested leaves",
      ],
      preventRecurrence: [
        "monitor weekly during hot dry weather — that's when mites explode",
        "avoid pyrethroid insecticides — they kill mite predators and make infestations worse",
        "release predatory mites (Phytoseiulus persimilis) for biological control",
      ],
    },
    weatherTrigger: {
      description: "hot dry weather (mites thrive in low humidity)",
      minConsecutiveHotDays: 5,
    },
  },

  {
    id: "chilli_fusarium_wilt",
    crop: "chilli",
    name: "Fusarium Wilt",
    scientificName: "Fusarium oxysporum f.sp. capsici",
    category: "fungal",
    signsPositive: [
      // PHOTO-VISIBLE signs:
      "gradual wilting of one branch or one side of the plant first, then spreading symmetrically",
      "leaves yellow and die from the BOTTOM UP — older leaves first, advancing upward",
      "wilted leaves often DROP off cleanly (Verticillium tends to leave them hanging)",
      "wilt does not recover overnight (unlike water stress)",
      "scattered diseased plants in patches; common in lowland warm-soil chilli plots",
      // STEM-CUT confirmation (NOT a photo sign — stays in bestTest):
      "vascular tissue inside stem turns DARK CHOCOLATE BROWN when cut crosswise, browning concentrated at the crown",
      "no milky bacterial ooze when cut stem suspended in water (DIFFERENT from bacterial wilt)",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "gradual wilt + lower-leaf yellowing first",
        thereforeNot: "Fusarium causes a slow progressive wilt that ascends from old leaves up. Sudden whole-plant collapse points to bacterial wilt; top-only yellowing points to nutrient issues",
      },
      {
        ifAbsent: "any wilt or leaf decline in OLDER leaves",
        thereforeNot:
          "Fusarium's signature is bottom-up wilt. If only fruit lesions or top-leaf changes are visible, look at anthracnose / nutrient causes instead",
      },
      // NOTE: separating Fusarium from Verticillium / bacterial wilt requires a stem-cut
      // (vascular colour + ooze) — that's the bestTest, not a photo rule-out. From a leaf
      // photo all three vascular wilts look similar; we surface them all and let the test resolve.
    ],
    bestTest: {
      test: "stem_ooze_water_glass",
      instruction:
        "Cut a wilted stem near the base. (1) Look at the cross-section: vascular ring brown? Where does the discoloration stop? (2) Suspend the cut end in clear water 3 minutes — does milky stream of bacteria flow out?",
      expectedResult:
        "dark chocolate-brown vascular ring at base + NO milky ooze = Fusarium wilt; lighter tan streak extending higher up stem = Verticillium; brown + milky ooze = bacterial wilt instead",
    },
    treatment: {
      chemical: undefined,
      cultural: [
        "REMOVE and BURN infected plants completely (do NOT compost)",
        "do not replant chilli/tomato/eggplant in this spot for 4-5 years (Fusarium spores survive long)",
        "disinfect tools with 70% alcohol between plants",
      ],
      preventRecurrence: [
        "use Fusarium-resistant varieties next planting (check seed labels for FOL or Fol resistance)",
        "improve drainage — Fusarium loves wet feet",
        "raise soil pH to 6.5-7.0 with lime (Fusarium less aggressive in alkaline soils)",
        "biological soil drench with Trichoderma at planting",
      ],
    },
  },

  {
    id: "chilli_verticillium_wilt",
    crop: "chilli",
    name: "Verticillium Wilt",
    scientificName: "Verticillium dahliae",
    category: "fungal",
    signsPositive: [
      // PHOTO-VISIBLE signs (what the vision model can actually see):
      "WILTING with leaves drooping despite plant being upright (not collapsed flat like bacterial wilt)",
      "ONE-SIDED progression — one branch or half of plant wilts and browns BEFORE the other side",
      "INTERVEINAL yellowing on leaves: green veins remain, tissue between turns yellow then brown",
      "V-SHAPED chlorotic / necrotic patches on leaves, often pointing inward from leaf margin",
      "lower / older leaves affected first; upper leaves stay greener until late stages",
      "leaves curl, dry up and HANG ON the plant (do not drop cleanly like Fusarium often does)",
      "scattered patches of dying plants in the field, not a uniform sweep — soil-borne, builds outward over seasons",
      // CONTEXT signs (history-question / location, not photo):
      "more common in highlands (Cameron, Lojing) where soils stay cooler; less common in lowland heat",
      "huge soilborne host range (200+ species) — persists for years on weeds, tomato, sunflower, eggplant",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any wilting OR yellowing OR browning of leaves",
        thereforeNot:
          "Verticillium presents as wilt + leaf decline. Healthy-looking plants without these symptoms are not Verticillium",
      },
      {
        ifAbsent: "lower / older leaves affected at all (only top leaves yellow)",
        thereforeNot:
          "Verticillium ascends from roots through the vascular system, hitting older leaves first. Top-leaf-only yellowing points to iron / sulphur deficiency or upper-canopy diseases instead",
      },
      // NOTE: the stem-cut differentiator (vascular streaking, ooze test) belongs in the
      // bestTest below, NOT here — the photo step never sees a stem cross-section, so
      // rule-outs that require that info would force false negatives.
    ],
    bestTest: {
      test: "stem_ooze_water_glass",
      instruction:
        "Cut a wilting stem 10-15 cm above the soil. Look at the cross-section. Then suspend the cut end in clear water for 3 minutes — does milky bacterial stream flow out?",
      expectedResult:
        "tan/grey-brown vascular streak extending up the stem + NO milky ooze = Verticillium wilt likely; chocolate-brown ring concentrated at base + no ooze = Fusarium; brown + milky ooze = bacterial wilt",
    },
    treatment: {
      chemical: undefined,
      cultural: [
        "REMOVE and BURN affected plants WITH 30 cm soil ball — Verticillium microsclerotia survive 10+ years in soil",
        "no rescue chemical treatment — focus on preventing spread to healthy plants",
        "disinfect tools (70% alcohol or 10% bleach) between plants",
        "irrigate evenly — drought stress amplifies Verticillium symptoms",
      ],
      preventRecurrence: [
        "send symptomatic stem to MARDI for lab confirmation — only culture/PCR reliably separates Verticillium from Fusarium",
        "ROTATE away from solanaceae (chilli/tomato/eggplant/potato) AND cucurbits AND sunflower for 4-6 seasons — wide host range",
        "plant cereals (paddy, maize) or alliums in rotation — they're poor Verticillium hosts",
        "soil solarisation (clear plastic, 6-8 weeks dry season) reduces microsclerotia population",
        "use grafted seedlings on resistant rootstock where available",
        "weed control — Verticillium hosts on solanaceous and composite weeds",
      ],
    },
    weatherTrigger: {
      description:
        "cooler soil (highlands, post-rain dips) favours Verticillium over Fusarium",
      consecutiveRainyDays: 3,
    },
  },

  {
    id: "chilli_damping_off",
    crop: "chilli",
    name: "Damping-off (Seedling Collapse)",
    scientificName: "Pythium / Rhizoctonia / Fusarium spp.",
    category: "fungal",
    signsPositive: [
      "young seedlings collapse at soil line and die within hours",
      "stem at soil line looks water-soaked, brown, or pinched (thinned)",
      "pre-emergence: seeds planted but never sprout (rotted in soil)",
      "post-emergence: seedlings tip over with healthy-looking tops",
      "happens in patches in seed trays, often spreading outward",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "young seedlings (less than 3 weeks old)",
        thereforeNot: "damping-off only affects very young seedlings; established plants don't get this",
      },
    ],
    bestTest: {
      test: "scratch_stem_alive",
      instruction:
        "Pull up a wilted seedling. Is the stem at soil line water-soaked, dark, and pinched / thin?",
      expectedResult: "yes = damping-off; healthy stem with green underneath = something else",
    },
    treatment: {
      chemical: {
        name: "Trichoderma drench OR Metalaxyl seed treatment",
        brandLocal: "Trichoderma (organic) or Apron 35 SD (Metalaxyl seed coat)",
        dose: "Trichoderma 2-3g per litre water as drench, or treated seed at planting",
        frequency: "single application at planting; monitor germination",
        estCostRm: { brand: 22, generic: 12 },
      },
      cultural: [
        "throw out infected trays and start fresh — try not to save seedlings",
        "use sterile seedling mix (not garden soil)",
        "don't overwater — keep mix barely moist, not wet",
        "good airflow over trays — overcrowding is the enemy",
      ],
      preventRecurrence: [
        "always use Trichoderma-treated mix for nursery trays",
        "sterilize trays with bleach between batches",
        "sow seed thinly (overcrowding traps moisture)",
        "morning watering only so trays dry out by night",
      ],
    },
    weatherTrigger: {
      description: "cool wet conditions in nursery",
      consecutiveRainyDays: 2,
      minHumidity: 85,
    },
  },

  {
    id: "chilli_phytophthora_blight",
    crop: "chilli",
    name: "Phytophthora Blight (Foot/Crown/Fruit Rot)",
    scientificName: "Phytophthora capsici",
    category: "oomycete",
    signsPositive: [
      "DARK water-soaked LESION encircling the stem at SOIL LINE — stem looks like it has a wet black belt",
      "plant suddenly WILTS top-down despite wet soil (root and crown can't move water through girdled stem)",
      "roots brown and MUSHY when dug up — fall apart between fingers",
      "on fruit: water-soaked patches that turn TAN/BROWN with white cottony growth in humid weather",
      "spreads explosively after heavy rain or flooding — new plants collapse in waves",
      "leaves above the lesion may show tan, cracking spots that started water-soaked",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any dark wet lesion AT the soil line OR mushy roots when dug",
        thereforeNot:
          "Phytophthora's signature is the soil-line stem girdle + brown mushy roots. If stem base looks normal, suspect bacterial wilt or fusarium instead",
      },
      {
        ifAbsent: "history of heavy rain, flooding or poor drainage in last 1-2 weeks",
        thereforeNot:
          "Phytophthora needs free water to spread (zoospores swim). Without recent rain/waterlogging, fusarium wilt is more likely",
      },
    ],
    bestTest: {
      test: "dig_root_inspect",
      instruction:
        "Pull up an affected plant. Look at the stem RIGHT AT the soil line — is there a dark wet ring? Squeeze a root — does it crumble into mush?",
      expectedResult:
        "dark water-soaked stem ring at soil + mushy brown roots = Phytophthora blight",
    },
    treatment: {
      chemical: {
        name: "Metalaxyl + Mancozeb (e.g. Ridomil Gold MZ)",
        brandLocal: "Ridomil Gold MZ / generic metalaxyl-mancozeb",
        dose: "2.5 g per litre water — soil drench around base, NOT foliar",
        frequency: "drench every 10 days, max 3 applications",
        estCostRm: { brand: 60, generic: 35 },
      },
      cultural: [
        "REMOVE and BURN affected plants WITH a 30 cm soil ball — do not compost",
        "STOP irrigation for 3-5 days to dry the soil surface",
        "raise the bed / dig drainage trenches — Phytophthora needs standing water",
        "do NOT walk from infected to healthy plots — zoospores ride on boots",
      ],
      preventRecurrence: [
        "PERMANENT raised beds (20-30 cm) with mulch — single biggest preventive",
        "drip irrigation, never overhead — keep crowns dry",
        "rotate plot away from solanaceae and cucurbits for 3 years (P. capsici has wide host range)",
        "plant on the contour, never in low spots that pond after rain",
        "use Phytophthora-tolerant rootstock or grafted plants where available",
      ],
    },
    weatherTrigger: {
      description: "warm + wet — saturated soil within 10 days of an outbreak elsewhere is the classic trigger",
      consecutiveRainyDays: 2,
      minHumidity: 85,
    },
  },

  {
    id: "chilli_choanephora_wet_rot",
    crop: "chilli",
    name: "Choanephora Wet Rot (Blossom Blight)",
    scientificName: "Choanephora cucurbitarum",
    category: "fungal",
    signsPositive: [
      "rapid SOFT WET ROT of flowers and young fruit — turn brown and slimy in 24-48 hrs",
      "BLACK 'WHISKERS' (sporangia on long hairs) growing OUT of the rotted tissue — diagnostic feature",
      "rot starts at the BLOSSOM end, advances quickly upward",
      "no smell or only mild fermenting smell (not the foul fishy smell of bacterial soft rot)",
      "appears in flushes after consecutive rainy days",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "black hair-like whiskers growing OUT of the rot",
        thereforeNot:
          "Choanephora's diagnostic feature is the black sporangial whiskers. Without them, suspect anthracnose (sunken concentric lesion) or bacterial soft rot (foul smell)",
      },
      {
        ifAbsent: "very rapid (24-48 hr) wet collapse of flower or young fruit",
        thereforeNot:
          "Choanephora destroys tissue extremely fast in wet weather. Slow lesion development points to anthracnose, fast dry rot points to BER",
      },
    ],
    bestTest: {
      test: "cut_fruit_inspect_smell",
      instruction:
        "Pick an affected flower or young fruit. Look closely at the rot — do you see tiny BLACK PINHEADS on long thread-like stalks growing out of it?",
      expectedResult:
        "black whisker-like sporangia + soft slimy rot + mild smell = Choanephora wet rot",
      smellExpected: "none",
    },
    treatment: {
      chemical: {
        name: "Mancozeb 80% WP",
        brandLocal: "Dithane M-45 / generic mancozeb",
        dose: "2.5 g per litre water",
        frequency: "preventive spray at flowering, repeat every 7 days during wet spells",
        estCostRm: { brand: 28, generic: 12 },
      },
      cultural: [
        "REMOVE and BURY all rotted flowers/fruit deep — do not leave on soil",
        "thin the canopy — open it up so flowers dry quickly after rain",
        "stop overhead watering immediately, switch to base watering",
      ],
      preventRecurrence: [
        "wider plant spacing (50-60 cm) for airflow",
        "stake plants UP, away from soil splash",
        "harvest fruit promptly — overripe fruit invites the fungus",
        "use mulch to reduce splash from soil to flowers",
      ],
    },
    weatherTrigger: {
      description: "consecutive rainy days during flowering — explosive in 1-2 days",
      consecutiveRainyDays: 2,
      minHumidity: 90,
    },
  },

  {
    id: "chilli_bacterial_soft_rot",
    crop: "chilli",
    name: "Bacterial Soft Rot",
    scientificName: "Pectobacterium carotovorum (formerly Erwinia carotovora)",
    category: "bacterial",
    signsPositive: [
      "watery, mushy collapse of fruit or stem — squishes between fingers",
      "STRONG FOUL / FISHY smell from the rot — distinctive and unmistakable",
      "rot interior is cream to light brown slime, not dry",
      "starts at a wound (insect feeding hole, hail damage, harvest cut)",
      "advances fast in hot humid weather; whole fruit liquefies in 2-3 days",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "the foul fishy smell when you cut the rotten fruit",
        thereforeNot:
          "the smell IS the diagnosis for bacterial soft rot. No smell points to Choanephora wet rot or anthracnose",
      },
      {
        ifAbsent: "any prior wound (insect entry, hail, cut) on the affected fruit/stem",
        thereforeNot:
          "soft rot needs a wound to enter. Pristine intact fruit with rot is more likely fungal (anthracnose, Choanephora)",
      },
    ],
    bestTest: {
      test: "cut_fruit_inspect_smell",
      instruction:
        "Cut open a rotten fruit. Smell it. Is it strongly foul / fishy / sewage-like?",
      expectedResult:
        "strong foul/fishy smell + cream-coloured slimy interior = bacterial soft rot",
      smellExpected: "fishy",
    },
    treatment: {
      chemical: {
        name: "Copper hydroxide (e.g. Kocide) — limits bacterial spread, NOT a cure",
        brandLocal: "Kocide 3000 / generic copper hydroxide",
        dose: "2 g per litre water",
        frequency: "every 7 days during outbreak, max 4 applications",
        estCostRm: { brand: 40, generic: 22 },
      },
      cultural: [
        "REMOVE and BURY infected fruit deep — never compost (bacteria persist)",
        "control insect pests aggressively — they create entry wounds",
        "harvest dry, never in rain; handle gently to avoid bruising",
        "wash and disinfect harvest tools (10% bleach) between plots",
      ],
      preventRecurrence: [
        "control fruit borer + thrips pre-emptively (insect wounds = entry points)",
        "improve drainage; bacteria thrive in waterlogged soil",
        "never harvest after rain — surface water carries bacteria into wounds",
        "store harvested fruit cool and dry, not piled up",
      ],
    },
  },

  {
    id: "chilli_whitefly_damage",
    crop: "chilli",
    name: "Whitefly Damage",
    scientificName: "Bemisia tabaci",
    category: "insect_pest",
    signsPositive: [
      "tiny WHITE moth-like insects fly up in clouds when leaves are disturbed",
      "leaves turn YELLOW from below upward; mottled with chlorotic spots",
      "shiny STICKY honeydew on lower leaves",
      "BLACK SOOTY MOLD growing on the honeydew layer (most diagnostic late sign)",
      "tiny scale-like nymphs on leaf UNDERSIDE (look like flat oval dots)",
      "transmits Pepper Yellow Leaf Curl Virus and other begomoviruses — leaves curl + yellow if viral co-infection",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "tiny white flies AND/OR sticky honeydew AND/OR black sooty mold",
        thereforeNot:
          "whitefly damage requires you to actually see the insects, the honeydew, or its sooty mold consequence. Without any of these, yellowing has another cause",
      },
      {
        ifAbsent: "scale-like nymphs on leaf underside",
        thereforeNot:
          "even if adults flew off, the sessile nymphs stay glued to leaf underside. No nymphs means no current infestation",
      },
    ],
    bestTest: {
      test: "check_leaf_underside",
      instruction:
        "Tap the plant — do white flies fly up? Then turn a yellowing leaf over — do you see tiny pale oval scales (nymphs) stuck to the underside?",
      expectedResult:
        "white flies fly up + nymph scales on leaf underside + sticky/sooty residue = whitefly infestation",
    },
    treatment: {
      chemical: {
        name: "Pymetrozine (Plenum) OR Spirotetramat (Movento) — IRAC Group 9 / 23, less harmful to pollinators",
        brandLocal: "Plenum / Movento / generic pymetrozine",
        dose: "0.5 g per litre water",
        frequency: "every 10 days, max 3 applications, ROTATE chemistry — whitefly resists fast",
        estCostRm: { brand: 75, generic: 40 },
      },
      cultural: [
        "yellow sticky traps at canopy height — kills 60-70% of adults",
        "spray water + insecticidal soap on leaf UNDERSIDE every 3 days for 2 weeks",
        "remove heavily infested lower leaves and bury",
      ],
      preventRecurrence: [
        "REFLECTIVE SILVER MULCH disorients whiteflies and reduces landings 50-80%",
        "remove weeds within 5 m — alternate hosts",
        "don't plant chilli next to tomato, eggplant, okra, sweet potato, cotton (shared whitefly hosts)",
        "scout twice weekly — yellow sticky cards as early warning before damage builds",
      ],
    },
    weatherTrigger: {
      description: "hot dry weather favours rapid whitefly buildup",
      minConsecutiveHotDays: 5,
    },
  },

  {
    id: "chilli_fruit_borer",
    crop: "chilli",
    name: "Chilli Fruit Borer (Helicoverpa)",
    scientificName: "Helicoverpa armigera",
    category: "insect_pest",
    signsPositive: [
      "round HOLE bored INTO the fruit, usually at the STALK end (calyx)",
      "frass (dark insect droppings) at the entry hole or inside the fruit",
      "creamy-white to greenish CATERPILLAR (up to 3-4 cm) inside the fruit when opened",
      "fruit may be partially HOLLOWED inside; rots secondarily after caterpillar exits",
      "small holes / chewing damage on young leaves earlier in the cycle (first instar feeding)",
      "infested fruit drops off the plant prematurely",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "entry hole in the fruit OR caterpillar inside when opened OR frass",
        thereforeNot:
          "Helicoverpa damage is identified by the visible bore hole + caterpillar + frass. No hole = look elsewhere (anthracnose, soft rot)",
      },
      {
        ifAbsent: "the entry hole at the stalk/calyx end specifically",
        thereforeNot:
          "Helicoverpa enters at the stalk end. Random midshaft holes more likely from another borer (e.g. Spodoptera) or hail damage",
      },
    ],
    bestTest: {
      test: "cut_fruit_inspect_smell",
      instruction:
        "Pick an affected fruit. Find the hole at the stalk end. Cut the fruit lengthwise. See the caterpillar and dark droppings inside?",
      expectedResult:
        "stalk-end hole + creamy-green caterpillar + frass = Helicoverpa fruit borer",
      smellExpected: "none",
    },
    treatment: {
      chemical: {
        name: "Emamectin benzoate 5% SG (or Spinosad 45 SC)",
        brandLocal: "Proclaim / Volax / Tracer",
        dose: "0.4 g per litre water (emamectin) or 0.3 ml/L (spinosad)",
        frequency: "every 7 days at FRUITING, max 3 applications, rotate with another mode of action",
        estCostRm: { brand: 65, generic: 35 },
      },
      cultural: [
        "HAND-PICK and crush visible caterpillars at dawn (they hide inside fruit during day)",
        "REMOVE and DESTROY infested fruit immediately — do not leave on ground",
        "pheromone traps (Helilure) at 5 traps/ha as early warning + mass trapping",
        "encourage natural enemies (Trichogramma wasps) — avoid broad-spectrum sprays",
      ],
      preventRecurrence: [
        "intercrop with marigold / coriander border — repels and traps moths",
        "scout for eggs (small white pearls on flower buds and young leaves) twice weekly",
        "rotate away from tomato/cotton/maize (shared Helicoverpa hosts) for 1 season",
        "Bt (Bacillus thuringiensis) preventive spray at flowering — kills young larvae before they enter fruit",
      ],
    },
  },

  {
    id: "chilli_mealybug_damage",
    crop: "chilli",
    name: "Mealybug Damage",
    scientificName: "Phenacoccus solenopsis (and other mealybug spp.)",
    category: "insect_pest",
    signsPositive: [
      "WHITE COTTONY MASSES in leaf axils, on fruit calyx, and on stems",
      "soft pink-orange insects under the white wax",
      "leaves crinkled, twisted, stunted; growing tips deformed",
      "sticky honeydew + black sooty mold on lower leaves",
      "ANTS climbing up the plant tending the mealybugs (mutualism — diagnostic)",
      "infestation usually starts on ONE plant and spreads outward",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "white cottony tufts in leaf axils or on calyx",
        thereforeNot:
          "mealybugs are identified by their white wax cover. Without it, look at whitefly (white moth-like adults instead) or aphid (no wax)",
      },
      {
        ifAbsent: "ants tending the colony OR honeydew",
        thereforeNot:
          "active mealybug colonies almost always have ant attendance and visible honeydew. Their absence makes mealybug less likely",
      },
    ],
    bestTest: {
      test: "check_leaf_underside",
      instruction:
        "Look in the leaf axils (where leaf meets stem) and at the fruit calyx. See white cottony tufts? Push the wax aside — pink-orange soft insects underneath?",
      expectedResult:
        "white cottony tufts + pink soft insects under the wax + ants nearby = mealybug",
    },
    treatment: {
      chemical: {
        name: "Buprofezin OR Acetamiprid (systemic — penetrates wax cover)",
        brandLocal: "Applaud / Mospilan / generic acetamiprid",
        dose: "0.4 g per litre water",
        frequency: "every 14 days, max 3 applications",
        estCostRm: { brand: 50, generic: 25 },
      },
      cultural: [
        "wipe colonies off with a cloth dipped in dilute dish soap (1%) — physical removal",
        "control ants — bait stations or sticky band on stem prevents re-establishment",
        "prune and burn heavily infested branches",
      ],
      preventRecurrence: [
        "scout new transplants carefully — mealybugs ride in on seedlings",
        "release predator beetles (Cryptolaemus montrouzieri) where available",
        "weed control — mealybugs harbour on grass and broadleaf weeds",
      ],
    },
  },

  {
    id: "chilli_root_knot_nematode",
    crop: "chilli",
    name: "Root-Knot Nematode",
    scientificName: "Meloidogyne incognita",
    category: "nematode",
    signsPositive: [
      "irregular round GALLS / SWELLINGS on roots when plant dug up — diagnostic feature",
      "root system shortened, thickened, malformed; few feeder roots",
      "above ground: stunted growth, pale yellowing, midday wilting that recovers at night",
      "wilting WORSE on hot days, despite adequate watering — galled roots can't move water",
      "patches of poor plants in roughly circular spread (nematode population builds outward)",
      "common in sandy soil; worse on second/third successive solanaceous crop on same plot",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any galls / swellings on roots when you actually dig the plant up",
        thereforeNot:
          "ROOT GALLS are the only definitive sign of nematode. Above-ground stunting alone could be 100 other things — if no galls when dug, it's not nematode",
      },
      {
        ifAbsent: "history of solanaceous crops (chilli/tomato/eggplant) on this plot for 2+ seasons",
        thereforeNot:
          "Meloidogyne builds populations over multiple successive susceptible crops. First-year planting is unlikely to have damaging populations",
      },
    ],
    bestTest: {
      test: "dig_root_inspect",
      instruction:
        "Dig up an affected plant CAREFULLY (don't snap roots). Wash soil off the roots with water. Are there round bumpy GALLS / swellings on the roots?",
      expectedResult:
        "irregular round galls of various sizes scattered along roots = root-knot nematode confirmed",
    },
    treatment: {
      chemical: {
        name: "Carbofuran 3G OR neem cake (organic) — incorporate into soil at planting only, NOT for established plants",
        brandLocal: "Furadan / generic carbofuran (regulated; check current restrictions in Malaysia)",
        dose: "follow label — typically 25 kg/ha pre-plant soil incorporation",
        frequency: "ONE application at land preparation, NEVER during cropping",
        estCostRm: { brand: 80, generic: 45 },
      },
      cultural: [
        "no rescue treatment for already-galled roots — focus on preventing next crop loss",
        "remove and burn infested plants WITH root ball at end of season",
        "deep tillage + summer fallow + soil solarisation (clear plastic for 4-6 weeks) reduces population",
      ],
      preventRecurrence: [
        "ROTATE to non-host: paddy, maize, kangkung, sweet potato (skip solanaceae) for 2-3 seasons",
        "plant cover crop of marigold (Tagetes) — releases nematicidal alpha-terthienyl",
        "use grafted seedlings on nematode-resistant rootstock where available",
        "add high-organic-matter compost — encourages predatory soil fungi/bacteria",
        "soil test for nematode counts before re-planting solanaceae",
      ],
    },
  },

  {
    id: "chilli_nitrogen_deficiency",
    crop: "chilli",
    name: "Nitrogen Deficiency",
    scientificName: "N deficiency",
    category: "nutrient_deficiency",
    signsPositive: [
      "uniform pale GREEN to YELLOW colour on OLDER (lower) leaves first",
      "yellowing is even across the whole leaf — NOT interveinal, NOT mottled, NOT vein-bound",
      "older leaves may drop off; whole plant looks pale and stunted",
      "growth slow; new leaves smaller than usual",
      "common after heavy rain (N leached out) or in unfertilised plots",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "uniform yellowing in OLDER leaves first (not new ones)",
        thereforeNot:
          "N is mobile — plant moves it from old to new leaves. New leaves yellow first means iron/sulphur, not nitrogen",
      },
      {
        ifAbsent: "yellow that is uniform/even across the leaf",
        thereforeNot:
          "interveinal pattern points to Mg, vein-bound to ChiVMV, mottled to virus. N deficiency gives a flat even pale colour",
      },
    ],
    bestTest: {
      test: "leaf_age_pattern",
      instruction:
        "Look at the OLDEST (bottom) leaves. Are they EVENLY pale yellow with no patterns? Are NEW leaves still green?",
      expectedResult:
        "old leaves uniform yellow + new leaves still green + small new growth = nitrogen deficiency",
    },
    treatment: {
      chemical: {
        name: "Urea (46-0-0) OR ammonium sulphate (21-0-0)",
        brandLocal: "any kedai pertanian — Urea is cheapest",
        dose: "10-15 g urea dissolved in 10 L water, side-dress around base",
        frequency: "single application; foliar 1% urea solution gives faster (3-day) green-up",
        estCostRm: { brand: 8, generic: 4 },
      },
      cultural: [
        "side-dress with composted manure (1 kg / m²) for slow release",
        "if monsoon-related leaching: split future N applications into 3 smaller doses",
      ],
      preventRecurrence: [
        "split nitrogen — never one big dose, always 3 doses through the season",
        "use mulch to reduce leaching",
        "soil test for organic matter; raise OM with compost over seasons",
      ],
    },
  },

  {
    id: "chilli_potassium_deficiency",
    crop: "chilli",
    name: "Potassium Deficiency",
    scientificName: "K deficiency",
    category: "nutrient_deficiency",
    signsPositive: [
      "leaf MARGINS / TIPS scorched yellow then brown ('marginal scorch')",
      "starts on OLDER (lower) leaves first (K is mobile)",
      "interveinal yellowing follows the scorch as it progresses inward",
      "fruit may be SMALL, soft, with poor colour and short shelf life",
      "weak stems; plant flops easily; fewer fruit set",
      "common in sandy soil and after heavy fruit set drains the plant",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "scorched margins / tips on older leaves",
        thereforeNot:
          "K deficiency's signature is the scorched leaf MARGIN. Uniform yellowing without marginal scorch points to N; interveinal without scorch points to Mg",
      },
      {
        ifAbsent: "marginal scorch starting OLDER leaves first",
        thereforeNot:
          "K is mobile, depletes from old leaves first. New-leaf scorch points to Ca deficiency or salt damage instead",
      },
    ],
    bestTest: {
      test: "leaf_age_pattern",
      instruction:
        "Look at the OLDER (bottom) leaves. Are the EDGES yellow-brown and crispy while the centre is still green?",
      expectedResult:
        "scorched/crispy leaf margins on older leaves with green centres = potassium deficiency",
    },
    treatment: {
      chemical: {
        name: "Muriate of Potash (MoP, 0-0-60) OR Sulphate of Potash (SoP, 0-0-50)",
        brandLocal: "any kedai pertanian — MoP is cheaper, SoP better for sensitive crops",
        dose: "10 g MoP per plant, side-dress",
        frequency: "single side-dress + 1% K2SO4 foliar spray weekly for 3 weeks",
        estCostRm: { brand: 18, generic: 10 },
      },
      cultural: [
        "mulch with banana stem or palm fronds — both rich in K as they decompose",
        "do not over-apply N at the same time (N suppresses K uptake at root)",
      ],
      preventRecurrence: [
        "use balanced NPK like 12-12-17 instead of high-N straights",
        "apply K in 2 splits — at planting and at first flowering",
        "soil test every 2 seasons — sandy soils need K every season",
      ],
    },
  },

  {
    id: "chilli_boron_deficiency",
    crop: "chilli",
    name: "Boron Deficiency",
    scientificName: "B deficiency",
    category: "nutrient_deficiency",
    signsPositive: [
      "GROWING TIP DEATH (terminal bud blackens and dies) — most diagnostic sign",
      "young leaves DISTORTED, brittle, may show corky raised areas",
      "stems and petioles brittle, may crack or develop corky longitudinal splits",
      "fruit: corky russeting on the surface, sometimes hollow centre",
      "plant produces side-shoots in clusters because the main tip died ('witches broom' look)",
      "common in sandy / heavily limed / very dry soils — B is locked up",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "death of the growing tip OR brittle distorted new leaves",
        thereforeNot:
          "Boron deficiency's signature is growing-tip death + brittle distortion. Healthy growing tips rule out B",
      },
      {
        ifAbsent: "stem/petiole brittleness or cracking",
        thereforeNot:
          "B-deficient tissue is famously brittle. Tissue that bends without snapping is unlikely B",
      },
    ],
    bestTest: {
      test: "scratch_stem_alive",
      instruction:
        "Look at the very tip of a main stem. Is it BLACKENED / dead? Try to bend a young petiole — does it snap clean instead of flexing?",
      expectedResult:
        "dead growing tip + brittle snap-not-bend petiole = boron deficiency",
    },
    treatment: {
      chemical: {
        name: "Borax (sodium tetraborate) foliar spray",
        brandLocal: "Borax / Solubor — kedai pertanian",
        dose: "1 g per litre water — DO NOT exceed (B is toxic at high doses)",
        frequency: "single foliar application; repeat after 14 days if symptoms persist",
        estCostRm: { brand: 15, generic: 8 },
      },
      cultural: [
        "irrigate evenly — B uptake fails when soil dries out",
        "do NOT add lime if pH is already > 6.5 — high pH locks up B",
      ],
      preventRecurrence: [
        "apply 1 kg borax / 1000 m² as soil amendment at land preparation, ONCE every 2 years",
        "maintain soil moisture (mulch, drip irrigation)",
        "soil test before each season — easy to over-apply B and toxify the soil",
      ],
    },
  },

  {
    id: "chilli_sunscald",
    crop: "chilli",
    name: "Sunscald (Sunburn)",
    scientificName: "Heat / UV physiological damage",
    category: "abiotic_heat",
    signsPositive: [
      "PALE WHITISH or papery TAN patch on the SUN-EXPOSED side of fruit only",
      "patch is dry, leathery, slightly sunken — NOT wet or rotting",
      "patches face the same direction (south/west — wherever the sun hits)",
      "leaves above the affected fruit may have been pruned away or wilted (lost shade)",
      "no insects, no spores, no smell — purely a discoloured dry patch",
      "common on plants that lost foliage to disease, pruning, or transplant shock",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "the damage strictly on the sun-facing side of fruit",
        thereforeNot:
          "sunscald is a one-sided lesion facing the sun. Damage all around the fruit or on shaded side points to disease, not sun",
      },
      {
        ifAbsent: "dry / leathery feel",
        thereforeNot:
          "sunscald is dry. Wet/mushy/oozing damage is bacterial soft rot or Phytophthora, not sunscald",
      },
    ],
    bestTest: {
      test: "no_test_needed",
      instruction:
        "Look at affected fruit. Is the pale patch ONLY on the side facing the sun, and is the patch DRY (not wet/rotting)?",
      expectedResult:
        "one-sided dry pale patch facing the sun = sunscald (no pathogen)",
    },
    treatment: {
      chemical: undefined,
      cultural: [
        "do NOT prune more leaves — let canopy regrow to shade the fruit",
        "shade cloth (30-50%) over exposed plants during peak heat (12-3 pm)",
        "harvest sun-damaged fruit early before secondary rot sets in",
      ],
      preventRecurrence: [
        "avoid heavy late-season pruning that exposes fruit",
        "kaolin clay spray (e.g. Surround WP) on fruit reflects sun",
        "plant slightly closer (40 cm spacing instead of 60 cm) for mutual shading",
        "mulch to keep soil cooler — heat-stressed plants lose leaves",
      ],
    },
    weatherTrigger: {
      description: "consecutive hot days with intense midday sun",
      minConsecutiveHotDays: 3,
    },
  },

  {
    id: "chilli_herbicide_drift",
    crop: "chilli",
    name: "Herbicide Drift Damage",
    scientificName: "Phytotoxicity (paraquat / glyphosate / 2,4-D drift)",
    category: "abiotic_chemical",
    signsPositive: [
      "leaves DISTORTED — cupped, twisted, fan-shaped or strap-like (esp. 2,4-D drift)",
      "OR yellow / white papery dead patches between veins (paraquat contact damage)",
      "OR uniform yellowing then bleaching on new growth (glyphosate systemic uptake)",
      "damage shows on ONE SIDE of plant or one side of plot — wind direction tells the story",
      "OFTEN AFFECTS DIFFERENT CROP SPECIES TOO — a key cross-check for abiotic cause",
      "no insects, no spores, no progressive lesion — symptoms appeared suddenly after spray event",
      "history: someone (you, neighbour, council) sprayed weeds within ~1 week",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any distortion / cupping / strapping in new growth",
        thereforeNot:
          "herbicide drift's signature is leaf distortion (esp. growth-regulator herbicides). Symptoms with normal leaf shape are unlikely drift",
      },
      {
        ifAbsent: "history of spraying nearby in the last 7-10 days OR damage on other crop species",
        thereforeNot:
          "drift requires an actual spray event upwind. With no spray history AND only chilli affected, suspect viral/nutrient causes",
      },
    ],
    bestTest: {
      test: "no_test_needed",
      instruction:
        "Walk the plot. Is damage worse on ONE SIDE (the upwind side)? Are nearby weeds or other crops also affected? Did you or anyone spray weeds in the last week?",
      expectedResult:
        "one-sided pattern + nearby crops also affected + recent spray event = herbicide drift",
    },
    treatment: {
      chemical: undefined,
      cultural: [
        "NO chemical antidote — wait and watch",
        "remove and destroy worst-affected leaves to direct energy to recovery",
        "irrigate gently to flush systemic herbicides from root zone (modest effect)",
        "foliar feed (1% urea + 0.2% K2SO4) helps recovery for mild cases",
      ],
      preventRecurrence: [
        "talk to whoever sprayed — request 25 m buffer from chilli plots",
        "spray weeds ONLY in calm wind (< 5 km/h) and never in midday heat updraft",
        "use shielded sprayer or wick applicator for in-row weeds, not broadcast",
        "windbreak hedge (lemongrass, banana) on the upwind side reduces drift 50-80%",
        "switch to less drift-prone formulations (granules instead of sprays for 2,4-D)",
      ],
    },
  },

  {
    id: "chilli_iron_deficiency",
    crop: "chilli",
    name: "Iron Deficiency",
    scientificName: "Fe deficiency",
    category: "nutrient_deficiency",
    signsPositive: [
      "yellowing between leaf veins (interveinal chlorosis)",
      "veins themselves stay green",
      "starts in NEW (top) leaves, not old leaves",
      "no lesions, no ooze",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "yellowing in NEW leaves first",
        thereforeNot:
          "iron is immobile — Fe deficiency always shows in new growth first; if old leaves first, suspect N or K instead",
      },
    ],
    bestTest: {
      test: "leaf_age_pattern",
      instruction:
        "Look at where the yellowing STARTED. Top (new) leaves or bottom (old) leaves?",
      expectedResult: "Fe deficiency starts in NEW leaves (Fe is immobile in plant)",
    },
    treatment: {
      chemical: {
        name: "Iron chelate (Fe-EDTA or Fe-DTPA) foliar spray",
        brandLocal: "Sequestrene 138 / generic Fe chelate",
        dose: "1 g per litre water, foliar spray",
        frequency: "every 7 days, 2–3 applications",
        estCostRm: { brand: 22, generic: 14 },
      },
      cultural: [
        "check soil pH — high pH (>7) locks up iron",
        "lower pH with sulphur if alkaline",
      ],
      preventRecurrence: [
        "maintain soil pH 6.0–6.5",
        "avoid over-liming",
      ],
    },
  },
];

// ─── PADDY DISEASES ─────────────────────────────────────────────

const PADDY_RULES: MalaysiaDiseaseRule[] = [
  {
    id: "paddy_blast",
    crop: "paddy",
    name: "Rice Blast",
    scientificName: "Magnaporthe oryzae",
    category: "fungal",
    signsPositive: [
      "elliptical or spindle-shaped leaf lesions ('football' shape)",
      "grey or grey-white centres with brown to red-brown margins",
      "lesions on leaf collar, nodes, or panicle neck possible",
      "neck blast can cause whole panicle to break and hang",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "spindle/football-shaped lesions with grey centre",
        thereforeNot:
          "blast's signature lesion is spindle-shaped with grey middle; round or streak lesions point elsewhere",
      },
    ],
    bestTest: {
      test: "lesion_margin_check",
      instruction: "Look at a leaf lesion. Is it spindle-shaped (pointed at both ends)?",
      expectedResult: "spindle/football lesion with grey-white centre, brown margin",
    },
    treatment: {
      chemical: {
        name: "Tricyclazole 75% WP",
        brandLocal: "Beam / generic tricyclazole",
        dose: "0.6 g per litre water",
        frequency: "at boot stage and 50% heading, 2 applications",
        estCostRm: { brand: 45, generic: 22 },
      },
      cultural: [
        "avoid excess nitrogen fertiliser (high N predisposes to blast)",
        "drain field briefly to reduce humidity",
      ],
      preventRecurrence: [
        "split nitrogen application — 3 doses instead of 1 large",
        "plant resistant variety (MR297, MR303 are blast-tolerant)",
        "avoid dense seeding (>120 kg/ha worsens blast)",
      ],
    },
    weatherTrigger: {
      description: "cool nights with heavy dew, extended leaf wetness",
      minHumidity: 90,
    },
  },

  {
    id: "paddy_bacterial_blight",
    crop: "paddy",
    name: "Bacterial Blight",
    scientificName: "Xanthomonas oryzae pv. oryzae",
    category: "bacterial",
    signsPositive: [
      "water-soaked streaks starting from leaf tips and margins",
      "streaks expand into yellowish lesions running along the leaf",
      "milky bacterial ooze visible at lesion edges in early morning, dries to small yellow droplets",
      "lesion margins WAVY (distinguishes from leaf streak which is LINEAR)",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "lesions starting at leaf tip/margin",
        thereforeNot:
          "bacterial blight starts at hydathodes (leaf tip/margin); mid-leaf lesions point to other diseases",
      },
      {
        ifAbsent: "wavy lesion margins",
        thereforeNot:
          "wavy margin distinguishes blight from leaf streak (X. o. oryzicola) which is linear",
      },
    ],
    bestTest: {
      test: "lesion_margin_check",
      instruction:
        "Examine the edge of a yellow lesion. Is it WAVY (irregular curves) or LINEAR (straight)?",
      expectedResult: "wavy margin = bacterial blight; linear margin = leaf streak (different disease)",
    },
    treatment: {
      chemical: undefined,
      cultural: [
        "drain the field to break the bacterial cycle",
        "remove and burn severely infected plants",
      ],
      preventRecurrence: [
        "use certified disease-free seed",
        "balance N fertiliser (avoid over-application)",
        "plant resistant variety (Pongsu Seribu 1, MR253)",
      ],
    },
    weatherTrigger: {
      description: "windy rainy weather spreads bacteria; flooded fields amplify",
      consecutiveRainyDays: 3,
    },
  },
];

// ─── KANGKUNG (water spinach) DISEASES ──────────────────────────

const KANGKUNG_RULES: MalaysiaDiseaseRule[] = [
  {
    id: "kangkung_white_rust",
    crop: "kangkung",
    name: "White Rust",
    scientificName: "Albugo ipomoeae-aquaticae",
    category: "fungal",
    signsPositive: [
      "white powdery pustules on the underside of leaves",
      "yellow patches on the upper leaf surface above the pustules",
      "leaves may become distorted or thickened",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "white powdery pustules on leaf underside",
        thereforeNot: "white rust's signature is the white pustule cluster; without it, suspect anthracnose or abiotic",
      },
    ],
    bestTest: {
      test: "check_leaf_underside",
      instruction: "Turn an affected leaf over and look at the underside.",
      expectedResult: "white powdery pustules clustered, with corresponding yellow patches on the topside",
    },
    treatment: {
      chemical: {
        name: "Mancozeb 80% WP",
        brandLocal: "Dithane M-45 / generic",
        dose: "2 g per litre",
        frequency: "every 7 days, 2 applications",
        estCostRm: { brand: 28, generic: 12 },
      },
      cultural: ["remove and destroy badly infected leaves"],
      preventRecurrence: [
        "harvest more frequently — younger plants resist better",
        "avoid overhead watering, especially late in day",
        "rotate planting bed, do not replant kangkung in same plot for 1 season",
      ],
    },
    weatherTrigger: {
      description: "extended high humidity + leaf wetness",
      consecutiveRainyDays: 2,
      minHumidity: 85,
    },
  },
];

// ─── BANANA DISEASES ────────────────────────────────────────────

const BANANA_RULES: MalaysiaDiseaseRule[] = [
  {
    id: "banana_sigatoka",
    crop: "banana",
    name: "Black Sigatoka",
    scientificName: "Mycosphaerella fijiensis",
    category: "fungal",
    signsPositive: [
      "small dark brown to black streaks on leaves, parallel to the veins",
      "streaks expand into elongated lesions with grey centres and yellow halos",
      "severe infection causes large patches of necrotic leaf to collapse",
      "starts on lower (older) leaves, spreads upward",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any dark streaks or vein-parallel lesions on leaves",
        thereforeNot: "Sigatoka's signature is the linear streak pattern; without it, suspect Panama wilt or nutrient",
      },
    ],
    bestTest: {
      test: "lesion_margin_check",
      instruction:
        "Look at a leaf lesion. Is it a long streak running with the veins, or a sudden plant-wide wilt?",
      expectedResult: "long parallel streaks → Sigatoka; sudden wilt → Panama disease (different)",
    },
    treatment: {
      chemical: {
        name: "Propiconazole 25% EC",
        brandLocal: "Tilt / generic propiconazole",
        dose: "1 ml per litre water + 0.5% mineral oil",
        frequency: "every 14 days, 3 applications during wet season",
        estCostRm: { brand: 65, generic: 32 },
      },
      cultural: ["cut and burn severely infected leaves", "improve plantation airflow by spacing"],
      preventRecurrence: [
        "remove old leaves regularly (sanitation is the single most effective practice)",
        "avoid planting too dense (>1500 plants/ha worsens Sigatoka)",
        "use disease-free planting material",
      ],
    },
    weatherTrigger: {
      description: "warm humid conditions with regular rain",
      consecutiveRainyDays: 5,
      minHumidity: 80,
    },
  },
  {
    id: "banana_panama_wilt",
    crop: "banana",
    name: "Panama Wilt (Fusarium Wilt)",
    scientificName: "Fusarium oxysporum f.sp. cubense (TR4 in Malaysia)",
    category: "fungal",
    signsPositive: [
      "yellowing of older leaves starting from the margins, progressing inward",
      "leaves wilt and hang down along the stem (skirt of dead leaves)",
      "splitting of the pseudostem at the base",
      "internal vascular discolouration (brown/red) when stem cut crosswise",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "internal vascular browning when stem cut",
        thereforeNot: "Panama wilt's signature is the vascular discolouration; without it, suspect nutrient or nematode",
      },
      {
        ifAbsent: "leaves yellowing from margins inward",
        thereforeNot: "Sigatoka makes streak lesions; Panama yellows the whole leaf from outside in",
      },
    ],
    bestTest: {
      test: "scratch_stem_alive",
      instruction:
        "Cut the pseudostem near the base with a clean knife. Look at the cross-section.",
      expectedResult: "brown/reddish discoloured ring inside the stem = Panama wilt confirmed",
    },
    treatment: {
      chemical: undefined, // no effective chemical control
      cultural: [
        "REMOVE infected mat completely — dig out corm and burn",
        "do NOT replant banana in this spot (TR4 survives in soil for decades)",
        "disinfect tools, boots, and equipment with bleach between plots",
      ],
      preventRecurrence: [
        "switch to TR4-resistant variety (Cavendish is susceptible; consider FHIA-25 or Mas type)",
        "improve drainage — Fusarium thrives in waterlogged soil",
        "report confirmed cases to DOA — TR4 is a notifiable disease in Malaysia",
      ],
    },
  },
];

// ─── CORN DISEASES ──────────────────────────────────────────────

const CORN_RULES: MalaysiaDiseaseRule[] = [
  {
    id: "corn_downy_mildew",
    crop: "corn",
    name: "Downy Mildew",
    scientificName: "Peronosclerospora maydis",
    category: "fungal",
    signsPositive: [
      "yellowish to whitish striping running parallel to leaf veins",
      "white downy growth on leaf underside in the morning, especially on young leaves",
      "stunted plants with twisted, narrow leaves",
      "may show abnormal tassels (proliferation/leafy)",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "white downy fungal growth on leaf underside",
        thereforeNot: "downy mildew's diagnostic sign is the underside fungal mat; without it, suspect rust or nutrient",
      },
      {
        ifAbsent: "stripes parallel to leaf veins",
        thereforeNot: "stripe pattern is characteristic; if striping crosses veins, look elsewhere",
      },
    ],
    bestTest: {
      test: "check_leaf_underside",
      instruction:
        "In the early morning, turn a striped leaf over. Look for white downy growth on the underside.",
      expectedResult: "white fluffy/downy fungal coating on underside of leaf, especially on young leaves",
    },
    treatment: {
      chemical: {
        name: "Metalaxyl 35% WS (seed treatment) or Mancozeb 80% WP (foliar)",
        brandLocal: "Apron 35 SD / generic mancozeb",
        dose: "Seed treatment: 6 g/kg seed; Foliar: 2 g/litre",
        frequency: "Seed: pre-planting; Foliar: every 7 days from first sign",
        estCostRm: { brand: 40, generic: 18 },
      },
      cultural: [
        "rogue out severely affected plants",
        "weed control — wild grasses host the pathogen",
      ],
      preventRecurrence: [
        "always use treated seed (cheap insurance against this disease)",
        "plant resistant variety (DMR series, Suwan-1)",
        "early planting before wet season peak",
      ],
    },
    weatherTrigger: {
      description: "cool nights with heavy dew + warm humid days",
      minHumidity: 90,
    },
  },
];

// ─── SWEET POTATO DISEASES ──────────────────────────────────────

const SWEET_POTATO_RULES: MalaysiaDiseaseRule[] = [
  {
    id: "sweet_potato_black_rot",
    crop: "sweet_potato",
    name: "Black Rot",
    scientificName: "Ceratocystis fimbriata",
    category: "fungal",
    signsPositive: [
      "circular dark brown to black sunken lesions on roots (tubers)",
      "internal flesh near lesion is dark and bitter",
      "plant may show wilting and yellowing if infection reaches stem base",
      "sometimes a fruity/yeasty smell from infected tubers",
    ],
    ruleOutClauses: [
      {
        ifAbsent: "any dark sunken lesions on the harvested tuber",
        thereforeNot: "black rot's signature is the tuber lesion; if only above-ground symptoms, suspect stem rot or nematode",
      },
    ],
    bestTest: {
      test: "cut_fruit_inspect_smell",
      instruction:
        "Dig up an affected plant and cut the tuber. Smell the cut surface and look for dark internal flesh.",
      expectedResult: "dark stained internal flesh + slight fruity/yeasty smell (acetate fermentation)",
      smellExpected: "sweet",
    },
    treatment: {
      chemical: {
        name: "Thiabendazole post-harvest dip",
        brandLocal: "Mertect / generic thiabendazole",
        dose: "follow label — typically 1 g per litre dip for 30s",
        frequency: "treat at harvest before storage",
        estCostRm: { brand: 50, generic: 28 },
      },
      cultural: [
        "discard all visibly infected tubers — do NOT store with healthy ones",
        "cure tubers at 28-32°C for 5-7 days before storage to heal harvest wounds",
      ],
      preventRecurrence: [
        "plant disease-free vine cuttings only",
        "rotate plot away from sweet potato for 2 years",
        "avoid harvest wounds — careful digging, dry tubers before stacking",
      ],
    },
  },
];

// ─── EXPORT ─────────────────────────────────────────────────────

export const MALAYSIA_RULES: MalaysiaDiseaseRule[] = [
  ...CHILLI_RULES,
  ...PADDY_RULES,
  ...KANGKUNG_RULES,
  ...BANANA_RULES,
  ...CORN_RULES,
  ...SWEET_POTATO_RULES,
];

export function rulesForCrop(crop: CropName): MalaysiaDiseaseRule[] {
  return MALAYSIA_RULES.filter((r) => r.crop === crop);
}

export function ruleById(id: string): MalaysiaDiseaseRule | undefined {
  return MALAYSIA_RULES.find((r) => r.id === id);
}
