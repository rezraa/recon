import { describe, expect, it, vi } from 'vitest'

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(),
}))

vi.mock('./models', () => ({
  getEmbeddingModel: vi.fn(),
}))

import { computeEmbedding,cosineSimilarity } from './embeddings'
import { getEmbeddingModel } from './models'

const mockGetEmbeddingModel = vi.mocked(getEmbeddingModel)

describe('embeddings', () => {
  describe('cosineSimilarity', () => {
    it('[P1] should return 1.0 for identical vectors', () => {
      const a = new Float32Array([1, 2, 3])
      const b = new Float32Array([1, 2, 3])
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0)
    })

    it('[P1] should return 0.0 for orthogonal vectors', () => {
      const a = new Float32Array([1, 0, 0])
      const b = new Float32Array([0, 1, 0])
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0)
    })

    it('[P1] should return -1.0 for opposite vectors', () => {
      const a = new Float32Array([1, 0, 0])
      const b = new Float32Array([-1, 0, 0])
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0)
    })

    it('[P1] should handle normalized vectors correctly', () => {
      // Normalized vectors: dot product is the cosine similarity
      const a = new Float32Array([0.6, 0.8, 0])
      const b = new Float32Array([0.8, 0.6, 0])
      const expected = 0.6 * 0.8 + 0.8 * 0.6 // = 0.96
      expect(cosineSimilarity(a, b)).toBeCloseTo(expected)
    })

    it('[P1] should throw on vector length mismatch', () => {
      const a = new Float32Array([1, 2])
      const b = new Float32Array([1, 2, 3])
      expect(() => cosineSimilarity(a, b)).toThrow('Vector length mismatch')
    })

    it('[P1] should return 0 for zero vectors', () => {
      const a = new Float32Array([0, 0, 0])
      const b = new Float32Array([1, 2, 3])
      expect(cosineSimilarity(a, b)).toBe(0)
    })

    it('[P1] should return 0 for empty vectors', () => {
      const a = new Float32Array([])
      const b = new Float32Array([])
      expect(cosineSimilarity(a, b)).toBe(0)
    })

    it('[P1] should validate 384-dim embedding similarity', () => {
      // Simulate two 384-dim vectors with known similarity
      const a = new Float32Array(384).fill(0.5)
      const b = new Float32Array(384).fill(0.5)
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0)
    })
  })

  describe('computeEmbedding', () => {
    it('[P1] should return a Float32Array of 384 dimensions', async () => {
      const mockData = new Float32Array(384).fill(0.1)
      const mockModel = vi.fn().mockResolvedValue({ data: mockData })
      mockGetEmbeddingModel.mockResolvedValue(mockModel as never)

      const result = await computeEmbedding('test text')

      expect(result).toBeInstanceOf(Float32Array)
      expect(result.length).toBe(384)
      expect(mockModel).toHaveBeenCalledWith('test text', { pooling: 'mean', normalize: true })
    })
  })
})
