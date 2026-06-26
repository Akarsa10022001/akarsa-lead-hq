import { callLLM, LLMProvider } from '../llm';

export interface SkillContext {
  leadId?: string;
  companyName: string;
  industry: string;
  evidence: any[];
  [key: string]: any;
}

export interface Skill<T = any> {
  name: string;
  description: string;
  execute(context: SkillContext): Promise<T>;
}

// Registry to hold all skills
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  register(skill: Skill) {
    this.skills.set(skill.name, skill);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  async run(name: string, context: SkillContext): Promise<any> {
    const skill = this.skills.get(name);
    if (!skill) throw new Error(`Skill ${name} not found in registry`);
    return await skill.execute(context);
  }
}

export const registry = new SkillRegistry();

// 1. Hook Generator Skill
registry.register({
  name: 'hook_generator',
  description: 'Generates a personalized outreach hook based on evidence and industry.',
  execute: async (context: SkillContext) => {
    const prompt = `
      Target Company: ${context.companyName}
      Industry: ${context.industry}
      Evidence: ${JSON.stringify(context.evidence)}
      
      Write a compelling 1-2 sentence hook for an outreach message (WhatsApp or Email) 
      that references the specific evidence above in a constructive, non-salesy way. 
      Format response as JSON with {"hook": "..."}.
    `;
    
    const result = await callLLM({
      task: 'Generate outreach hook',
      prompt,
      preferredProvider: 'groq'
    });
    
    return result.hook || "We noticed some interesting digital opportunities for your brand.";
  }
});

// 2. Intent Monitor Skill (Analyzes GDELT news for intent signals)
registry.register({
  name: 'intent_monitor',
  description: 'Analyzes recent news articles to determine buy-intent score.',
  execute: async (context: SkillContext) => {
    const prompt = `
      Company: ${context.companyName}
      Recent News/Events: ${JSON.stringify(context.evidence.filter(e => e.signal_type === 'news_mention'))}
      
      Determine if this news indicates business expansion, funding, or new leadership (high intent).
      Return JSON: {"intent_score": <1-10>, "reason": "..."}
    `;
    const result = await callLLM({ task: 'Analyze intent', prompt, preferredProvider: 'gemini' });
    return result;
  }
});

// 3. Competitor Intel Skill
registry.register({
  name: 'competitor_intel',
  description: 'Identifies likely local competitors based on industry and location.',
  execute: async (context: SkillContext) => {
    const prompt = `
      Company: ${context.companyName}
      Industry: ${context.industry}
      Location: ${context.location || 'Unknown'}
      
      Identify 3 likely competitors for this business. Return JSON: {"competitors": ["comp1", "comp2", "comp3"]}
    `;
    const result = await callLLM({ task: 'Find competitors', prompt, preferredProvider: 'groq' });
    return result;
  }
});

// 4. Lookalike Expansion Skill
registry.register({
  name: 'lookalike_expansion',
  description: 'Suggests similar business categories or adjacent industries to target.',
  execute: async (context: SkillContext) => {
    const prompt = `
      We successfully closed: ${context.companyName} in industry: ${context.industry}.
      Suggest 2 adjacent industries or niches to target next. 
      Return JSON: {"adjacent_targets": ["niche1", "niche2"]}
    `;
    const result = await callLLM({ task: 'Lookalike targeting', prompt, preferredProvider: 'groq' });
    return result;
  }
});
