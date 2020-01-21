import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { DateTime } from 'luxon';
import { join } from 'path';
import { promisify } from 'util';
import { inflate } from 'zlib';

const inflator = promisify(inflate);
const execify = promisify(exec);


// repoPath: path to the directory with git repo (not to the .git folder, to the parent dir)
export async function getNodes(repoPath: string) {
  const files = await getAllUnpackedCommits(repoPath);
  const fileInfo = await Promise.all(files.map(async f => await getHash(repoPath, f)));
  return fileInfo;
}

export async function getBlobContents(repoPath: string, hash: string) {
  const catFile = await execify(`git cat-file -p ${hash}`, {cwd: repoPath});
  if (catFile.stderr) {
    throw catFile.stderr;
  }
  const catContent = catFile.stdout;
  return catContent;
}

async function getAllUnpackedCommits(repoPath: string) {

  const gitDir = join(repoPath, '.git/objects');
  let dirs = await fs.readdir(gitDir);
  dirs = dirs.filter(d => d !== 'info' && d !== 'pack');
  const fileA = await Promise.all(dirs.map(async (d) => {
    const filesInDir = await fs.readdir(join(gitDir, d));
    return filesInDir.map(f => d + f);
  }));
  const files = [].concat(...fileA);

  return files;
}

type GitType = 'tree' | 'commit' | 'blob';
interface GitInfo {
  hash: string;
  type: GitType;
  length: number;
  nestedNodes: NestedNode[];
  parentNodes?: string[];
  author?: NameAndDate;
  committer?: NameAndDate;
  // blank for blobs just to save space
  catfile: string[] | undefined;
  content: string | undefined;
}

interface NestedNode {
  hash: string;
  type: GitType;
  filename?: string;
  permissions?: string;
}

interface NameAndDate {
  name: string | undefined;
  email: string | undefined;
  date: string | undefined;
}

async function getHash(repoPath: string, hash: string): Promise<GitInfo> {
  const info = await unzipFile(repoPath, hash);
  switch (info.type) {
    case 'tree':
      await getTree(repoPath, info);
      break;
    case 'commit':
      await getCommit(repoPath, info);
      break;
    case 'blob':
      await getBlob(repoPath, info);
      break;
    default:
      throw new Error(`don't know how to ${info.type}`);
  }
  return info;
}

async function unzipFile(repoPath: string, hash: string): Promise<GitInfo> {

  const first = hash.substring(0, 2);
  const last = hash.substring(2);
  const filename = join(repoPath, '.git/objects', first, last);

  const zipped = await fs.readFile(filename);

  const uncompressedBuffer = await inflator(zipped);

  const content = uncompressedBuffer.toString();

  const firstLine = content.split('\n')[0] || '';

  const pieces = firstLine.split(' ');

  const type = pieces[0] as GitType;
  const length = parseInt(pieces[1], 10);

  let catContent: string[] | undefined;

  if (type !== 'blob') {
    // because there's weird characters in content like nulls and non-ascii chars
    const catFile = await execify(`git cat-file -p ${hash}`, {cwd: repoPath});
    if (catFile.stderr) {
      throw catFile.stderr;
    }
    catContent = catFile.stdout.split('\n');
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

async function getTree(repoPath: string, info: GitInfo): Promise<NestedNode[]> {
  if (!info.catfile) {
    return;
  }

  const children = info.catfile.filter(l => l).map(f => f.split(/[\t ]/)).map(f => {
    const child: NestedNode = {
      permissions: f[0],
      type: f[1] as GitType,
      hash: f[2],
      filename: f[3]
    };
    return child;
  });

  info.nestedNodes = children;
}

async function getCommit(repoPath: string, info: GitInfo) {
  if (!info.catfile) {
    return;
  }

  const parents = info.catfile.filter(l => l.startsWith('parent '));
  const tree = info.catfile.find(l => l.startsWith('tree ')); // TODO: Are there ever more than one?
  const author = info.catfile.find(l => l.startsWith('author '));
  const committer = info.catfile.find(l => l.startsWith('committer '));

  if (parents) {
    info.parentNodes = parents.map(p => p.split(' ')[1]);
  }
  if (tree) {
    info.nestedNodes.push({
      type: 'tree',
      hash: tree.split(' ')[1]
    });
  }
  if (author) {
    info.author = getNameAndDate(author.substr('author '.length));
  }
  if (committer) {
    info.committer = getNameAndDate(committer.substr('commiter '.length));
  }
}

function getNameAndDate(content: string): NameAndDate | undefined {
  // title first and last <email> time -tz
  if (!content) {
    return undefined;
  }
  const pieces = content.split(/[<>]/).map(t => (t || '').trim());

  const datestrs = pieces[2].split(' ');
  let date; // = undefined
  if (datestrs.length) {
    const secs = parseInt(datestrs[0], 10);
    const tz = datestrs[1];
    const plus = (tz[0] === '-' || tz[0] === '+') ? '' : '+';
    const zone = `utc${plus}${tz.substr(0, tz.length - 2)}:${tz.substr(tz.length - 2)}`;
    date = DateTime.fromSeconds(secs, {zone});
    // date.invalid? then date.toISO() will be null
  }

  return {
    name: pieces[0],
    email: pieces[1],
    date: date.toISO()
  };
}

async function getBlob(repoPath: string, info: GitInfo) {
  // nothing to do
}
