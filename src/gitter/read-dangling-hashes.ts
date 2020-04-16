import { fillGitInfo } from './fill-git-info';
import { getPackedHash } from './get-packed-hash';
import { getUnique } from './get-unique';
import { GitInfo } from './types';


// recursively get children of packed commits
export async function readDanglingHashes(repoPath: string, existingCommits: GitInfo[]): Promise<GitInfo[]> {
  const newCommits: GitInfo[] = [];

  while (true) {
    const allCommits = [...newCommits, ...existingCommits]; // both new and existing
    const hashes = getDanglingHashes(allCommits);
    const uniqueHashes = getUnique(allCommits, hashes);
    if (!uniqueHashes.length) {
      break;
    }
    const commitsStep = (await Promise.all(uniqueHashes.map(async hash => {
      const info = await getPackedHash(repoPath, hash);
      if (!info) {
        return undefined;
      }
      return fillGitInfo(repoPath, info);
    }))).filter(i => i) as GitInfo[];
    if (commitsStep.length) {
      newCommits.push(...commitsStep);
    } else {
      break;
    }
  }

  return newCommits;
}

function getDanglingHashes(commits: GitInfo[]) {
  const hashes = commits
    .map(c => [...(c.parentNodes || []), ...c.nestedNodes.map(n => n.hash)])
    .filter(c => c)
    .flat();
  return Array.from(new Set(hashes)); // remove duplicates
}
