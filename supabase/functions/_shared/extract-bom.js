// Provider adapters run server-side. Extraction is draft data and must be reviewed before saving.
export async function extractBom(image, { provider, adapters }) {
  if (!provider || typeof adapters?.[provider] !== 'function') throw new Error('BOM extraction provider is not configured');
  return adapters[provider](image);
}
