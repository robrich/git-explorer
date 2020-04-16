import { GitInfo } from './types';

export function getUnique(existingCommits: GitInfo[], newHashes: string[]): string[] {
  const uniqueHashes = newHashes.filter(p => !existingCommits.filter(c => c.hash === p).length);
  return Array.from(new Set(uniqueHashes)); // remove duplicates
}
