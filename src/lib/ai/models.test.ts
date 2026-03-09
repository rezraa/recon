import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(),
}))

import { getEmbeddingModel, getNERModel, getZeroShotClassifier, resetModels } from './models'

// Access the mocked pipeline via the mocked module to avoid TS2590 (union type complexity)
async function getMockPipeline() {
  const mod = await import('@huggingface/transformers')
  return mod.pipeline as unknown as ReturnType<typeof vi.fn>
}

let mockPipeline: ReturnType<typeof vi.fn>

describe('models', () => {
  beforeEach(async () => {
    mockPipeline = await getMockPipeline()
  })

  afterEach(() => {
    resetModels()
    mockPipeline.mockReset()
  })

  describe('getEmbeddingModel', () => {
    it('[P1] should load the embedding model on first call', async () => {
      const mockModel = vi.fn()
      mockPipeline.mockResolvedValueOnce(mockModel as never)

      const model = await getEmbeddingModel()
      expect(model).toBe(mockModel)
      expect(mockPipeline).toHaveBeenCalledWith('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
    })

    it('[P1] should return cached model on subsequent calls (singleton)', async () => {
      const mockModel = vi.fn()
      mockPipeline.mockResolvedValueOnce(mockModel as never)

      const first = await getEmbeddingModel()
      const second = await getEmbeddingModel()

      expect(first).toBe(second)
      expect(mockPipeline).toHaveBeenCalledTimes(1)
    })
  })

  describe('getNERModel', () => {
    it('[P1] should load the NER model on first call', async () => {
      const mockModel = vi.fn()
      mockPipeline.mockResolvedValueOnce(mockModel as never)

      const model = await getNERModel()
      expect(model).toBe(mockModel)
      expect(mockPipeline).toHaveBeenCalledWith('token-classification', 'Xenova/bert-base-NER')
    })

    it('[P1] should return cached model on subsequent calls (singleton)', async () => {
      const mockModel = vi.fn()
      mockPipeline.mockResolvedValueOnce(mockModel as never)

      const first = await getNERModel()
      const second = await getNERModel()

      expect(first).toBe(second)
      expect(mockPipeline).toHaveBeenCalledTimes(1)
    })
  })

  describe('getZeroShotClassifier', () => {
    it('[P1] should load the zero-shot classifier on first call', async () => {
      const mockModel = vi.fn()
      mockPipeline.mockResolvedValueOnce(mockModel as never)

      const model = await getZeroShotClassifier()
      expect(model).toBe(mockModel)
      expect(mockPipeline).toHaveBeenCalledWith('zero-shot-classification', 'Xenova/nli-deberta-v3-small')
    })

    it('[P1] should return cached model on subsequent calls (singleton)', async () => {
      const mockModel = vi.fn()
      mockPipeline.mockResolvedValueOnce(mockModel as never)

      const first = await getZeroShotClassifier()
      const second = await getZeroShotClassifier()

      expect(first).toBe(second)
      expect(mockPipeline).toHaveBeenCalledTimes(1)
    })
  })

  describe('resetModels', () => {
    it('[P1] should clear all cached models', async () => {
      const mockModel = vi.fn()
      mockPipeline.mockResolvedValue(mockModel as never)

      await getEmbeddingModel()
      await getNERModel()
      await getZeroShotClassifier()

      expect(mockPipeline).toHaveBeenCalledTimes(3)

      resetModels()

      await getEmbeddingModel()
      expect(mockPipeline).toHaveBeenCalledTimes(4)
    })
  })
})
