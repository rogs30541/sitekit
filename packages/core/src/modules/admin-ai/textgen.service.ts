import { BadRequestException, Injectable } from '../../compat';
import { SETTING_KEYS } from '@sitekit/shared';
import { SettingsService } from '../settings/settings.service';

/**
 * 純文字生成（無工具）：與指令台共用同一組供應商／模型／金鑰設定（ai.commandProvider／ai.commandModel／各家 apiKey）。
 * 給「擬回覆草稿」這類單次生成用；provider=mock 或未設金鑰時回 mock=true、text=''，由呼叫端用規則產生替代文字。
 */
export type TextGenProvider = 'mock' | 'anthropic' | 'openai' | 'gemini';

@Injectable()
export class TextGenService {
  constructor(private readonly settings: SettingsService) {}

  async config(): Promise<{ provider: TextGenProvider; model: string; key: string; ready: boolean }> {
    const [prov, model, anthropicKey, openaiKey, geminiKey] = await Promise.all([
      this.settings.get(SETTING_KEYS.aiCommandProvider, 'AI_COMMAND_PROVIDER'),
      this.settings.get(SETTING_KEYS.aiCommandModel, 'AI_COMMAND_MODEL'),
      this.settings.get(SETTING_KEYS.anthropicApiKey, 'ANTHROPIC_API_KEY'),
      this.settings.get(SETTING_KEYS.openaiApiKey, 'OPENAI_API_KEY'),
      this.settings.get(SETTING_KEYS.geminiApiKey, 'GEMINI_API_KEY'),
    ]);
    const provider = (prov || (anthropicKey ? 'anthropic' : openaiKey ? 'openai' : geminiKey ? 'gemini' : 'mock')) as TextGenProvider;
    const key = provider === 'anthropic' ? anthropicKey : provider === 'openai' ? openaiKey : provider === 'gemini' ? geminiKey : '';
    return { provider, model: model || (provider === 'anthropic' ? 'claude-sonnet-5' : provider === 'openai' ? 'gpt-4.1' : provider === 'gemini' ? 'gemini-2.5-pro' : 'rules'), key, ready: provider === 'mock' || !!key };
  }

  async complete(input: { system: string; user: string; maxTokens?: number }): Promise<{ text: string; provider: TextGenProvider; model: string; mock: boolean }> {
    const cfg = await this.config();
    if (cfg.provider === 'mock' || !cfg.ready) return { text: '', provider: cfg.provider, model: cfg.model, mock: true };
    const maxTokens = Math.min(Math.max(input.maxTokens ?? 1024, 64), 4096);
    if (cfg.provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system: input.system, messages: [{ role: 'user', content: input.user }] }), signal: AbortSignal.timeout(90_000) });
      const j = (await res.json()) as { content?: { type: string; text?: string }[]; error?: { message?: string } };
      if (!res.ok) throw new BadRequestException(`Anthropic ${res.status}：${j.error?.message ?? 'request failed'}`);
      return { text: (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim(), provider: cfg.provider, model: cfg.model, mock: false };
    }
    if (cfg.provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.key)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: input.system }] }, contents: [{ role: 'user', parts: [{ text: input.user }] }], generationConfig: { maxOutputTokens: maxTokens } }), signal: AbortSignal.timeout(90_000) });
      const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
      if (!res.ok) throw new BadRequestException(`Gemini ${res.status}：${j.error?.message ?? 'request failed'}`);
      return { text: (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('\n').trim(), provider: cfg.provider, model: cfg.model, mock: false };
    }
    const res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }], max_completion_tokens: maxTokens }), signal: AbortSignal.timeout(90_000) });
    const j = (await res.json()) as { choices?: { message?: { content?: string | null } }[]; error?: { message?: string } };
    if (!res.ok) throw new BadRequestException(`OpenAI ${res.status}：${j.error?.message ?? 'request failed'}`);
    return { text: (j.choices?.[0]?.message?.content ?? '').trim(), provider: cfg.provider, model: cfg.model, mock: false };
  }
}
