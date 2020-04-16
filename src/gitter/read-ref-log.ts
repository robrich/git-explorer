import execify from './execify';
import { fillGitInfo } from './fill-git-info';
import { getPackedHash } from './get-packed-hash';
import { getUnique } from './get-unique';
import { GitInfo } from './types';


export async function readRefLog(repoPath: string, existingCommits: GitInfo[]): Promise<GitInfo[]> {
  const packedHashes = await getAllRefs(repoPath);
  const uniquePackedHashes = getUnique(existingCommits, packedHashes);
  const packedCommits = await Promise.all(uniquePackedHashes.map(async hash => {
    const info = await getPackedHash(repoPath, hash);
    return fillGitInfo(repoPath, info);
  }));
  return packedCommits.filter(p => p) as GitInfo[];
}

// git reflog --all --no-abbrev
async function getAllRefs(repoPath: string): Promise<string[]> {
  const catFile = await execify('git reflog --all --no-abbrev', repoPath);
  const results = catFile
    .split('\n')
    .filter(l => l)
    .map(l => l.split(' ')[0]);

  return results;
}
