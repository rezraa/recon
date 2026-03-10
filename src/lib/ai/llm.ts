import fs from 'fs'
import path from 'path'

// ─── Types ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LlamaModel = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LlamaContext = any

interface LLMSession {
  prompt: (text: string, opts?: { maxTokens?: number; temperature?: number }) => Promise<string>
}

export interface LLMInstance {
  model: LlamaModel
  createSession: (context: LlamaContext) => LLMSession
  createContext: () => Promise<LlamaContext>
  disposeContext: (context: LlamaContext) => Promise<void>
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(process.cwd())
const MODELS_DIR = path.join(PROJECT_ROOT, 'models')

const DEFAULT_MODEL = {
  file: 'Qwen3.5-2B-Q4_K_M.gguf',
  label: 'Qwen 3.5 2B',
  url: 'https://huggingface.co/Qwen/Qwen3.5-2B-GGUF/resolve/main/qwen3.5-2b-q4_k_m.gguf',
}

// ─── Lazy Singleton (Promise-Based Lock) ────────────────────────────────────

let llmPromise: Promise<LLMInstance | null> | null = null

/**
 * Get the model file path. Checks for user-specified model via LLM_MODEL_PATH
 * env var, then falls back to the default bundled model in /models/.
 */
export function getModelPath(): string {
  if (process.env.LLM_MODEL_PATH) {
    return path.resolve(process.env.LLM_MODEL_PATH)
  }
  return path.join(MODELS_DIR, DEFAULT_MODEL.file)
}

/**
 * Check if the LLM model file exists on disk.
 */
export function isModelAvailable(): boolean {
  return fs.existsSync(getModelPath())
}

/**
 * Lazy-load the LLM model via node-llama-cpp with Metal GPU acceleration.
 * Race-safe: concurrent calls share the same loading promise.
 *
 * Returns null if model file is not on disk. Callers (e.g. scoreJob)
 * should check isModelAvailable() first and throw if required.
 */
export function getLLMModel(): Promise<LLMInstance | null> {
  if (!llmPromise) {
    llmPromise = loadModel().catch((err) => {
      llmPromise = null
      throw err
    })
  }
  return llmPromise
}

async function loadModel(): Promise<LLMInstance | null> {
  const modelPath = getModelPath()

  if (!fs.existsSync(modelPath)) {
    return null
  }

  const { getLlama, LlamaChatSession } = await import('node-llama-cpp')
  const llama = await getLlama()
  const model = await llama.loadModel({ modelPath })

  return {
    model,
    createContext: async () => {
      return await model.createContext({
        flashAttention: true,
        contextSize: 2048,
        ignoreMemorySafetyChecks: true,
      })
    },
    createSession: (context: LlamaContext) => {
      const sequence = context.getSequence()
      return new LlamaChatSession({ contextSequence: sequence }) as unknown as LLMSession
    },
    disposeContext: async (context: LlamaContext) => {
      await context.dispose()
    },
  }
}

/**
 * Reset the cached model (used for testing).
 */
export function resetLLMModel(): void {
  llmPromise = null
}

export { DEFAULT_MODEL, MODELS_DIR }
