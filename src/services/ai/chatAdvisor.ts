import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_PROMPT = `You are AgroBot, an AI farming advisor for Malaysian smallholder farmers. Give practical, specific advice in simple English. Reference specific plots by label when relevant. Keep answers concise (2-3 short paragraphs max). The farmer's current farm state is provided below.`;

export async function chatWithAdvisor(
  systemContext: string,
  history: { role: string; content: string }[],
  userMessage: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return "I'm sorry, the AI advisor is not configured yet. Please set up the GEMINI_API_KEY environment variable.";
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    systemInstruction: `${SYSTEM_PROMPT}\n\n--- FARM STATE ---\n${systemContext}`,
  });

  // Build conversation history for multi-turn chat
  const chatHistory = history.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  try {
    const chat = model.startChat({ history: chatHistory });
    const result = await chat.sendMessage(userMessage);
    const text = result.response.text().trim();
    return text || "I'm not sure how to respond to that. Could you rephrase your question?";
  } catch (err) {
    console.error("Chat advisor error:", err);

    const errMsg = err instanceof Error ? err.message : String(err);
    const is429 = errMsg.includes("429") || errMsg.includes("quota");

    if (is429) {
      // Retry once after delay
      console.warn("Gemini 429 rate limit on chat, retrying in 3s...");
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const chat = model.startChat({ history: chatHistory });
        const result = await chat.sendMessage(userMessage);
        return result.response.text().trim();
      } catch (retryErr) {
        console.error("Chat advisor retry failed:", retryErr);
        return "⚠️ The AI service has reached its daily limit. Please try again tomorrow, or try sending a shorter question. The free tier allows limited requests per day.";
      }
    }

    return "I'm having trouble connecting right now. Please try again in a moment.";
  }
}
