export const TEXT_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tier: 'premium', rpdLimit: 20 },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', tier: 'premium', rpdLimit: 20 },
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite', tier: 'lite', rpdLimit: 500 },
];

// ── Option 3: Image-to-Image (I2I / Inpainting) ───
export const I2I_MODELS = [
  { id: 'fal-ai/flux/dev', name: 'Fal.ai (Flux Dev)', provider: 'fal-ai', tier: 'premium' },
];

// ── Option 4: Text-to-Image (T2I / Hallucination) ──
export const T2I_MODELS = [
  { id: 'gemini-2.5-flash-image', name: 'Nanobana', tier: 'fast', provider: 'google' },
  { id: 'gemini-3-pro-image-preview', name: 'Nanobana Pro', tier: 'ultra', provider: 'google' },
  { id: 'black-forest-labs/FLUX.1-schnell', name: 'FLUX.1 [schnell]', tier: 'fast', provider: 'huggingface' },
  { id: 'imagen-4.0-fast-generate-001', name: 'Imagen 4 Fast', tier: 'fast', provider: 'google' },
  { id: 'imagen-4.0-generate-001', name: 'Imagen 4', tier: 'standard', provider: 'google' },
  { id: 'imagen-4.0-ultra-generate-001', name: 'Imagen 4 Ultra', tier: 'ultra', provider: 'google' },
];

// ── Option 5: Direct AI Transformation ────────────────
export const DIRECT_AI_MODELS = [
  { id: 'gemini-2.5-flash-image', name: 'Nanobana', internalId: 'nanobana-basic', provider: 'google' },
  { id: 'gemini-3-pro-image-preview', name: 'Nanobana Pro', internalId: 'nanobana-pro', provider: 'google' },
  { id: 'fal-ai/flux/dev', name: 'Fal.ai (Flux Dev)', internalId: 'flux', provider: 'fal-ai' },
];

/**
 * Returns model chains with optional .env overrides
 */
export function getTextChain() {
  return reorder(TEXT_MODELS, process.env.PREFERRED_TEXT_MODEL);
}

export function getT2IChain() {
  return reorder(T2I_MODELS, process.env.PREFERRED_IMAGE_MODEL);
}

export function getI2IChain() {
  return [...I2I_MODELS];
}

export function getDirectAiChain() {
  return [...DIRECT_AI_MODELS];
}

function reorder(models, preferredId) {
  if (!preferredId) return [...models];
  const preferred = models.find(m => m.id === preferredId);
  if (!preferred) return [...models];
  return [preferred, ...models.filter(m => m.id !== preferredId)];
}
