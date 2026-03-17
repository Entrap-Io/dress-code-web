// ── Model Configuration ─────────────────────────────────────────
// Add new models here. Order = fallback priority (best first).
// Set preferred models in .env to override the default first pick.
//
// To add a new model: just append it to the relevant chain.
// To change the default: set PREFERRED_TEXT_MODEL or PREFERRED_IMAGE_MODEL in .env.

export const TEXT_MODELS = [
  { id: 'gemini-2.5-flash',                name: 'Gemini 2.5 Flash',        tier: 'premium', rpdLimit: 20   },
  { id: 'gemini-3-flash-preview',          name: 'Gemini 3 Flash',          tier: 'premium', rpdLimit: 20   },
  { id: 'gemini-3.1-flash-lite-preview',   name: 'Gemini 3.1 Flash Lite',   tier: 'lite',    rpdLimit: 500  },
];

export const IMAGE_MODELS = [
  { id: 'black-forest-labs/FLUX.1-schnell', name: 'FLUX.1 [schnell]',        tier: 'fast',     rpdLimit: 0,  provider: 'huggingface' },
  { id: 'sd3',                             name: 'Stable Diffusion 3',      tier: 'standard', rpdLimit: 25, provider: 'stability'   },
  { id: 'imagen-4.0-fast-generate-001',    name: 'Imagen 4 Fast',           tier: 'fast',     rpdLimit: 25, provider: 'google'      },
  { id: 'imagen-4.0-generate-001',         name: 'Imagen 4',                tier: 'standard', rpdLimit: 25, provider: 'google'      },
  { id: 'imagen-4.0-ultra-generate-001',   name: 'Imagen 4 Ultra',          tier: 'ultra',    rpdLimit: 25, provider: 'google'      },
];

/**
 * Returns the model chain with the preferred model first.
 * If PREFERRED_*_MODEL doesn't match any known model, chain is unchanged.
 */
export function getTextChain() {
  return reorder(TEXT_MODELS, process.env.PREFERRED_TEXT_MODEL);
}

export function getImageChain() {
  return reorder(IMAGE_MODELS, process.env.PREFERRED_IMAGE_MODEL);
}

function reorder(models, preferredId) {
  if (!preferredId) return [...models];
  const preferred = models.find(m => m.id === preferredId);
  if (!preferred) return [...models];
  return [preferred, ...models.filter(m => m.id !== preferredId)];
}
