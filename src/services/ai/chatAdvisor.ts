/**
 * Chat advisor service — retrofitted to use Genkit.
 */
import { ai, DEFAULT_MODEL } from "@/lib/genkit";

const SYSTEM_PROMPT = `You are AgroBot, an AI farming advisor for Malaysian smallholder farmers. Give practical, specific advice in simple English. Reference specific plots by label when relevant. Keep answers concise (2-3 short paragraphs max). The farmer's current farm state is provided below.`;

export async function chatWithAdvisor(
  systemContext: string,
  history: { role: string; content: string }[],
  userMessage: string
): Promise<string> {
  try {
    const chatHistory = history.map((msg) => ({
      role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
      content: [{ text: msg.content }],
    }));

    const { text } = await ai.generate({
      model: DEFAULT_MODEL,
      system: `${SYSTEM_PROMPT}\n\n--- FARM STATE ---\n${systemContext}`,
      messages: [
        ...chatHistory,
        { role: "user" as const, content: [{ text: userMessage }] },
      ],
      config: { temperature: 0.5 },
    });

    return text || "I'm not sure how to respond to that. Could you rephrase your question?";
  } catch (err) {
    console.error("Chat advisor error:", err);

    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("429") || errMsg.includes("quota")) {
      return "The AI service has reached its daily limit. Please try again tomorrow.";
    }

    return "I'm having trouble connecting right now. Please try again in a moment.";
  }
}
