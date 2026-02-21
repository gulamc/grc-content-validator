import Anthropic from '@anthropic-ai/sdk';

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
  }
  return anthropicClient;
}

export async function callClaude(prompt: string, maxTokens: number = 1000): Promise<string> {
  try {
    const client = getAnthropicClient();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    });
    return message.content[0].type === 'text' ? message.content[0].text : '';
  } catch (error) {
    console.error('Claude API error:', error);
    return '';
  }
}
