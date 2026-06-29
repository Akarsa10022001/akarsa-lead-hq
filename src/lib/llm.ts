export type LLMProvider = 'groq' | 'gemini' | 'ollama';

export interface CallLLMOptions {
  task: string;
  prompt: string;
  schema?: any; // JSON schema if applicable
  preferredProvider?: LLMProvider;
  temperature?: number;
}

// A defensive JSON parser
export function extractJSON(text: string): any {
  try {
    // Attempt direct parse
    return JSON.parse(text);
  } catch (e) {
    // Look for JSON blocks
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]);
      } catch (err) {
        // Fall back to greedy `{...}` or `[...]` match
        const greedyMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (greedyMatch && greedyMatch[1]) {
          try {
            return JSON.parse(greedyMatch[1]);
          } catch (err2) {
            throw new Error("Failed to parse JSON defensively.");
          }
        }
      }
    }
    // Attempt greedy match without codeblocks
    const greedyMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (greedyMatch && greedyMatch[1]) {
      try {
        return JSON.parse(greedyMatch[1]);
      } catch (err2) {
        throw new Error("Failed to parse JSON defensively.");
      }
    }
    throw new Error("Could not extract any JSON structure from the response.");
  }
}

async function callGroq(prompt: string, temperature: number = 0.3): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set.");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGemini(prompt: string, temperature: number = 0.3): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  // Using Gemini 2.5 Flash via REST API
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

async function callOllama(prompt: string, temperature: number = 0.3): Promise<string> {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3", // Assuming llama3 as the default local model
      prompt,
      stream: false,
      options: { temperature }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama API Error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.response;
}

export async function callLLM(options: CallLLMOptions): Promise<any> {
  const fullPrompt = `${options.task}\n\nPROMPT:\n${options.prompt}\n\nIMPORTANT: Return ONLY valid JSON. Do not include markdown formatting or conversational text.`;
  
  const providers: LLMProvider[] = ['groq', 'gemini', 'ollama'];
  if (options.preferredProvider) {
    // Move preferred provider to the front
    providers.sort((x, y) => x === options.preferredProvider ? -1 : y === options.preferredProvider ? 1 : 0);
  }

  let lastError = null;

  for (const provider of providers) {
    try {
      console.log(`[callLLM] Attempting ${provider}...`);
      let resultText = "";

      if (provider === 'groq') {
        resultText = await callGroq(fullPrompt, options.temperature);
      } else if (provider === 'gemini') {
        resultText = await callGemini(fullPrompt, options.temperature);
      } else if (provider === 'ollama') {
        resultText = await callOllama(fullPrompt, options.temperature);
      }

      // If the task expects JSON (implied by our prompt instruction), parse it
      const parsedData = extractJSON(resultText);
      console.log(`[callLLM] Success with ${provider}`);
      return parsedData;

    } catch (err: any) {
      console.error(`[callLLM] Error with ${provider}: ${err.message}`);
      lastError = err;
      // Continue to next provider on failure
    }
  }

  throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`);
}
