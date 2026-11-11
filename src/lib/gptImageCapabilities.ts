import type { GptParams } from '@/types/gallery'

// GPT Image 2 and its 2.x variants/snapshots reject input_fidelity.
// Keep the older/custom-model setting without forwarding it to these models.
export function supportsGptInputFidelity(model: string): boolean {
  return !/^gpt-image-2(?:[.-]|$)/i.test(model.trim())
}

export function gptInputFidelity(model: string, value: GptParams['inputFidelity']): 'high' | 'low' | undefined {
  return value !== 'auto' && supportsGptInputFidelity(model) ? value : undefined
}
