import { getEmbeddingModel } from './models'

// ─── Embedding Computation ─────────────────────────────────────────────────

/**
 * Compute a 384-dim embedding for the given text using the embedding model.
 * Wraps the model manager for convenient single-text embedding.
 */
export async function computeEmbedding(text: string): Promise<Float32Array> {
  const model = await getEmbeddingModel()
  const output = await model(text, { pooling: 'mean', normalize: true })
  return new Float32Array(output.data as ArrayLike<number>)
}

// ─── Cosine Similarity ─────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (typically 0-1 for normalized embeddings).
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`)
  }
  if (a.length === 0) return 0

  let dot = 0
  let magA = 0
  let magB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB)
  if (magnitude === 0) return 0

  return dot / magnitude
}
