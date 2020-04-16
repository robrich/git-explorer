import execify from './execify';

// since we strip blobs, this ajax method fills it back in when needed
export async function getBlobContents(repoPath: string, hash: string) {
  return await execify(`git cat-file -p ${hash}`, repoPath);
}
