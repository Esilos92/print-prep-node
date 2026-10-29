const OpenAI = require('openai');
const config = require('./config');

/**
 * One place for every OpenAI chat call.
 *
 * Newer OpenAI models reason before they answer, and that reasoning counts
 * toward the output limit. The old call sites capped replies at 5-10 tokens,
 * which on a reasoning model leaves nothing for the answer and comes back
 * empty. They also reject `temperature` and `max_tokens`. This helper sends
 * the right parameters for whichever model is configured.
 */

let client = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/** gpt-4o, gpt-4.1 and older take the classic parameters. */
function isLegacyModel(model) {
  return /^gpt-(3|4)/i.test(model);
}

// Room for the model's reasoning on top of the answer itself.
const REASONING_HEADROOM = 4000;

/**
 * @param {object} opts
 * @param {string} opts.model
 * @param {Array}  opts.messages
 * @param {number} opts.maxTokens  length of the answer itself
 * @param {number} [opts.temperature]  used only by legacy models
 * @param {string} [opts.effort]  reasoning effort override
 * @param {object} [opts.schema]  JSON schema; the reply is then parsed and returned as an object
 * @returns {Promise<string|object>} the reply text, trimmed (or the parsed object with `schema`)
 */
async function chat({ model, messages, maxTokens = 500, temperature = 0, effort, schema }) {
  const openai = getClient();
  if (!openai) throw new Error('OPENAI_API_KEY is not set');

  const params = { model, messages };
  if (schema) {
    params.response_format = {
      type: 'json_schema',
      json_schema: { name: schema.name || 'reply', strict: true, schema: schema.schema }
    };
  }

  if (isLegacyModel(model)) {
    params.max_tokens = maxTokens;
    params.temperature = temperature;
  } else {
    params.max_completion_tokens = maxTokens + REASONING_HEADROOM;
    params.reasoning_effort = effort || config.models.reasoningEffort;
  }

  let completion;
  try {
    completion = await openai.chat.completions.create(params);
  } catch (error) {
    // Not every model accepts every effort level; retry once without it.
    if (params.reasoning_effort && /reasoning_effort|reasoning\.effort/i.test(error.message || '')) {
      delete params.reasoning_effort;
      completion = await openai.chat.completions.create(params);
    } else {
      throw new Error(`OpenAI ${model}: ${error.message}`);
    }
  }

  const text = completion.choices?.[0]?.message?.content;
  if (!text || !text.trim()) {
    const reason = completion.choices?.[0]?.finish_reason;
    throw new Error(`OpenAI ${model} returned an empty reply (finish_reason: ${reason})`);
  }
  if (!schema) return text.trim();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`OpenAI ${model} returned invalid JSON: ${text.slice(0, 120)}`);
  }
}

module.exports = { chat, getClient, isLegacyModel };
