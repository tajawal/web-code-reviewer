/**
 * LLM Provider configurations for different AI services
 * CRITICAL: System prompts are identical and explicit for determinism
 */

const CORE_CONFIG = require('./core');

// Unified system prompt for all providers
// Ensures consistent behavior across Claude and OpenAI
const SYSTEM_PROMPT = `You are an expert code reviewer with 10+ years of experience.

YOUR ROLE:
- Perform detailed, deterministic code reviews
- Focus on Security, Performance, Maintainability, and Best Practices
- Provide actionable, specific feedback with code examples
- Return results in strict JSON format

CRITICAL INSTRUCTIONS FOR OUTPUT:
1. You MUST respond with EXACTLY these two sections, in order, with NO extra prose:
   - <JSON>...</JSON> containing the review results
   - <SUMMARY>...</SUMMARY> containing a brief summary

2. Return ONLY valid JSON inside <JSON> tags. No markdown code fences.

3. The JSON must be a single object with:
   - "summary": brief overall assessment
   - "issues": array of identified issues (max 10)
   - "metrics": {critical_count, suggestion_count, by_category}
   - "final_recommendation": "do_not_merge" or "safe_to_merge"

4. For each issue, provide ALL required fields:
   - id, category, severity_proposed, severity_score
   - risk_factors (object with impact, exploitability, likelihood, blast_radius, evidence_strength)
   - confidence, file, lines, snippet
   - why_it_matters, fix_summary, fix_code_patch, tests, occurrences

5. SEVERITY RULES (deterministic):
   - CRITICAL only if: severity_score >= 3.60 AND evidence_strength >= 4 AND confidence >= 0.7
   - If evidence_strength <= 2 OR confidence <= 0.5: ALWAYS suggestion
   - Otherwise: suggestion

6. SORT issues by severity_score (highest first)
   - Ties: by category (security > performance > maintainability > best_practices)
   - Then by id, file, lines[0]

7. Temperature is 0: Be deterministic and consistent`;

const LLM_PROVIDERS = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    headers: apiKey => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    }),
    body: (prompt, diff) => ({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: `${prompt}\n\n${diff}`
        }
      ],
      max_tokens: CORE_CONFIG.MAX_TOKENS,
      temperature: CORE_CONFIG.TEMPERATURE
    }),
    extractResponse: data => data.choices[0].message.content
  },
  claude: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-5-20250929',
    headers: apiKey => ({
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }),
    body: (prompt, diff) => ({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: CORE_CONFIG.MAX_TOKENS,
      temperature: CORE_CONFIG.TEMPERATURE,
      messages: [
        {
          role: 'user',
          content: `${SYSTEM_PROMPT}\n\n---\n\n${prompt}\n\n${diff}`
        }
      ]
    }),
    extractResponse: data => data.content[0].text
  }
};

module.exports = LLM_PROVIDERS;
