import { NextRequest, NextResponse } from "next/server";

const DEFAULT_TIPS: Record<string, string[]> = {
  paddy: [
    "Check for brown spots or lesions on leaf blades — common sign of blast disease",
    "Look at the base of stems for dark discolouration (sheath blight)",
    "Check water level — too high or stagnant water can stress plants",
  ],
  chilli: [
    "Look for curled or mottled leaves — may indicate viral infection",
    "Check fruit for dark sunken spots (anthracnose)",
    "Inspect underside of leaves for tiny whiteflies or aphids",
  ],
  tomato: [
    "Look for yellow halos around brown spots on lower leaves (early blight)",
    "Check stems for dark cankers near soil level",
    "Inspect fruit for black, sunken lesions at the bottom (blossom end rot)",
  ],
  corn: [
    "Check leaves for long grey-green lesions with wavy margins (northern leaf blight)",
    "Look for rust-coloured pustules on leaf surfaces",
    "Inspect ears for grey or pink mould growth",
  ],
};

const GENERIC_TIPS = [
  "Look for unusual spots, discolouration, or wilting on leaves",
  "Check the underside of leaves for pests or eggs",
  "Compare affected plants with nearby healthy ones for differences",
];

export async function POST(request: NextRequest) {
  try {
    const { crop_name } = await request.json();

    if (!crop_name) {
      return NextResponse.json({ tips: GENERIC_TIPS });
    }

    const cropLower = crop_name.toLowerCase();
    const matched = Object.entries(DEFAULT_TIPS).find(([key]) =>
      cropLower.includes(key)
    );

    return NextResponse.json({ tips: matched ? matched[1] : GENERIC_TIPS });
  } catch {
    return NextResponse.json({ tips: GENERIC_TIPS });
  }
}
