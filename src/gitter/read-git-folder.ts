import { promises as fs } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { inflate } from 'zlib';
import execify from './execify';
import { fillGitInfo } from './fill-git-info';
import { GitInfo, GitType } from './types';


// ls in the .git folder
export async function readGitFolder(repoPath: string): Promise<GitInfo[]> {
  const files = await getAllUnpackedCommits(repoPath);
  const commits = await Promise.all(files.map(async hash => {
    const info = await unzipFile(repoPath, hash);
    return await fillGitInfo(repoPath, info);
  }));
  return commits.filter(c => c) as GitInfo[];
}

const inflator = promisify(inflate);

async function getAllUnpackedCommits(repoPath: string): Promise<string[]> {

  const gitDir = join(repoPath, '.git/objects');
  let dirs = await fs.readdir(gitDir);
  dirs = dirs.filter(d => d.length === 2);
  if (!dirs.length) {
    return [];
  }
  const files = await Promise.all(dirs.map(async (d) => {
    const filesInDir = await fs.readdir(join(gitDir, d));
    return filesInDir.filter(f => !f.endsWith('.idx') && !f.endsWith('.pack')).map(f => d + f);
  }));
  return (files ?? []).flat();
}

// FRAGILE: similar to read-ref-log#getPackedHash, TODO: centralize duplication
async function unzipFile(repoPath: string, hash: string): Promise<GitInfo> {

  const first = hash.substring(0, 2);
  const last = hash.substring(2);
  const filename = join(repoPath, '.git/objects', first, last);

  const zipped = await fs.readFile(filename);

  const uncompressedBuffer = await inflator(zipped) as Buffer;

  const content = uncompressedBuffer.toString();

  const firstLine = content.split('\n')[0] || '';

  const pieces = firstLine.split(' ');

  const type = pieces[0] as GitType;
  const length = parseInt(pieces[1], 10);

  let catContent: string[] | undefined;

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
