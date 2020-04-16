import { injectRefs } from './inject-refs';
import { readDanglingHashes } from './read-dangling-hashes';
import { readGitFolder } from './read-git-folder';
import { readRefLog } from './read-ref-log';
import { GitInfo } from './types';


// repoPath: path to the directory with git repo (not to the .git folder, to the parent dir)
export async function getNodes(repoPath: string) {
  const commits = await readGitFolder(repoPath); // ls in the .git folder
  const packedCommits = await readRefLog(repoPath, commits); // git ref-log --all
  addCommits(commits, packedCommits); // put them together
  const danglingCommits = await readDanglingHashes(repoPath, commits); // get children of packed commits
  addCommits(commits, danglingCommits);
  await injectRefs(commits, repoPath); // add branches
  // the final results
  return commits;
}

function addCommits(commits: GitInfo[], newCommits: GitInfo[]) {
  commits.push(...newCommits);
}
