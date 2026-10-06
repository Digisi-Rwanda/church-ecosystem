import { mergeLetters } from '../shared/accessMatrix.js';
import {
  BLOCK_MODULE,
  MODULE_LETTERS,
  SHARED_BLOCKS,
  type AccessLetter,
  type ModuleKey,
  type SharedBlock,
} from '../shared/vocabulary.js';

/**
 * The six shared blocks of a system, drawn from the letters engine's answer for it.
 * (Slice 1.3: the engine decides the letters; this only names the block each belongs to.)
 * Anyone who may enter a system can see its Home, so Home always carries at least R.
 */
export function blocksFromModules(
  modules: Record<ModuleKey, AccessLetter[]>,
): Record<SharedBlock, AccessLetter[]> {
  const result = {} as Record<SharedBlock, AccessLetter[]>;
  for (const block of SHARED_BLOCKS) {
    const module = BLOCK_MODULE[block];
    const letters = block === 'home' ? mergeLetters(['R'], modules[module]) : modules[module];
    const allowed: readonly AccessLetter[] = MODULE_LETTERS[module];
    result[block] = letters.filter((l) => allowed.includes(l));
  }
  return result;
}
