import execify from './execify';
import { GitInfo, GitType } from './types';

// FRAGILE: similar to read-git-folder#unzipFile, TODO: centralize duplication
export async function getPackedHash(repoPath: string, hash: string): Promise<GitInfo | undefined> {

  let res: string | undefined;
  try {
    res = await execify(`git cat-file -t ${hash}`, repoPath);
  } catch (err) {
    // hash doesn't exist, likely a shallow clone
    return undefined;
  }

  const type = (res || '').trim() as GitType;
  if (!type) {
    return undefined;
  }
  const length = parseInt(await execify(`git cat-file -s ${hash}`, repoPath), 10);

  let catContent: string[] | undefined;
  const content: string | undefined = undefined; // because we have no file

  if (type !== 'blob') {
    // because there's weird characters in content like nulls and non-ascii chars
    const catFile = await execify(`git cat-file -p ${hash}`, repoPath);
    catContent = (catFile || '').split('\n');
  }

  const info: GitInfo = {
    hash,
    type,
    length,
    catfile: catContent,
    content: type === 'blob' ? undefined : content,
    nestedNodes: []
  };

  return info;
}
