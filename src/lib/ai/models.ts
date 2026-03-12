import type {
  FeatureExtractionPipeline,
  TokenClassificationPipeline,
  ZeroShotClassificationPipeline,
} from '@huggingface/transformers'

// ─── Lazy Singleton Model Manager (Promise-Based Lock) ─────────────────────

let embeddingPromise: Promise<FeatureExtractionPipeline> | null = null
let nerPromise: Promise<TokenClassificationPipeline> | null = null
let zeroShotPromise: Promise<ZeroShotClassificationPipeline> | null = null

/**
 * Lazy-load the embedding model (Xenova/all-MiniLM-L6-v2, 23MB, 384-dim).
 * Downloads on first call, cached forever after.
 * Race-safe: concurrent calls share the same loading promise.
 */
export function getEmbeddingModel(): Promise<FeatureExtractionPipeline> {
  if (!embeddingPromise) {
    embeddingPromise = import('@huggingface/transformers').then((mod) => {
      const create = mod.pipeline as (task: string, model: string, opts?: Record<string, unknown>) => Promise<FeatureExtractionPipeline>
      return create('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' })
    })
  }
  return embeddingPromise
}

/**
 * Lazy-load the NER model (Xenova/bert-base-NER, ~50MB, token-classification).
 * Downloads on first call, cached forever after.
 * Race-safe: concurrent calls share the same loading promise.
 */
export function getNERModel(): Promise<TokenClassificationPipeline> {
  if (!nerPromise) {
    nerPromise = import('@huggingface/transformers').then((mod) => {
      const create = mod.pipeline as (task: string, model: string) => Promise<TokenClassificationPipeline>
      return create('token-classification', 'Xenova/bert-base-NER')
    })
  }
  return nerPromise
}

/**
 * Lazy-load the zero-shot classifier (Xenova/nli-deberta-v3-small, ~80MB).
 * Downloads on first call, cached forever after.
 * Race-safe: concurrent calls share the same loading promise.
 */
export function getZeroShotClassifier(): Promise<ZeroShotClassificationPipeline> {
  if (!zeroShotPromise) {
    zeroShotPromise = import('@huggingface/transformers').then((mod) => {
      const create = mod.pipeline as (task: string, model: string) => Promise<ZeroShotClassificationPipeline>
      return create('zero-shot-classification', 'Xenova/nli-deberta-v3-small')
    })
  }
  return zeroShotPromise
}

/** Reset all cached models (used for testing) */
export function resetModels(): void {
  embeddingPromise = null
  nerPromise = null
  zeroShotPromise = null
}
