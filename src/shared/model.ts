/**
 * The model seam in one place (DESIGN.md §4.3 — "model-agnosticism is one string").
 *
 * Change OPEN_TAG_MODEL (or this default) to swap the model every agent uses.
 * The provider prefix selects the connection path wired in `app.ts`:
 *
 *   ollama/gpt-oss:120b            Ollama Cloud   (default)
 *   ollama/qwen3-coder:480b        Ollama Cloud
 *   ollama/deepseek-v3.1:671b      Ollama Cloud
 *   anthropic/claude-sonnet-4-6    via AI Gateway
 *   openai/gpt-5.5                 via AI Gateway
 *
 * Full Ollama Cloud catalog: https://ollama.com/search?c=cloud
 */
export const DEFAULT_MODEL = process.env.OPEN_TAG_MODEL ?? 'ollama/gpt-oss:120b';
