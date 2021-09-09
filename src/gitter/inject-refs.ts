import { promises as fs } from 'fs';
import { join, relative } from 'path';
import execify from './execify';
import { GitInfo, Ref } from './types';


// add branches & tags
export async function injectRefs(commits: GitInfo[], repoPath: string) {
  const lsRefs = await findRefsInFolder(repoPath);
  const packedRefs = await gitShowRefs(repoPath);
  const refs = getUniqueRefs(lsRefs, packedRefs);
  addRefsToCommits(commits, refs);
  // the final results
  return commits;
}

// get refs from refs folder, doesn't walk pack files
async function findRefsInFolder(repoPath: string): Promise<Ref[]> {
  const gitDir = join(repoPath, '.git');
  const files = await walk(join(gitDir, 'refs'));
  const localFiles = files.map(f => relative(gitDir, f));
  // ASSUME: they exist
  localFiles.push('HEAD');

  const refs = (await Promise.all(localFiles.map(async f => {
    let content: string;
    try {
      content = await fs.readFile(join(gitDir, f), 'utf-8');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        content = '';
      } else {
        throw err;
      }
    }
    if (!content) {
      return undefined;
    }
    let target = content.split('\n')[0];
    if (target.indexOf('ref: ') > -1) {
      target = target.replace('ref: ', '');
    }
    return {
      label: f.replace(/\\/g, '/'),
      target
    } as Ref;
  }))).filter(f => f) as Ref[];
  return refs;
}

async function gitShowRefs(repoPath: string): Promise<Ref[]> {
  const content = await execify('git show-ref --head', repoPath);
  const refs: string[] = content.split('\n');
  return refs.map(r => {
    const pieces = (r || '').split(' ');
    if (pieces.length !== 2) {
      return undefined;
    }
    return {
      label: pieces[1],
      target: pieces[0]
    } as Ref;
  }).filter(f => f) as Ref[];
}

function addRefsToCommits(commits: GitInfo[], refs: Ref[]) {
  if (!commits || !refs) {
    return;
  }

  refs.forEach(ref => {

    let target = ref.target;

    if (ref.target.indexOf('refs') > -1) {
      const t = refs.find(r => r.label === ref.target);
      if (t) {
        target = t.target;
      }
    }

    const commit = commits.find(c => c.hash === target);
    if (commit) {
      if (!commit.refs) {
        commit.refs = [];
      }
      commit.refs.push(ref.label);
    }
  });
}

function getUniqueRefs(lsRefs: Ref[], packedRefs: Ref[]) {
  const refs = [...lsRefs];
  const uniqPack = packedRefs.filter(p => !lsRefs.filter(l => p.label === l.label).length);
  refs.push(...uniqPack);
  return refs;
}

// https://gist.github.com/kethinov/6658166
async function walk(dir: string, filelist: string[] = []): Promise<string[]> {
  const files = await fs.readdir(dir);

  for (const file of files) {
    const filepath = join(dir, file);
    const stat = await fs.stat(filepath);

    if (stat.isDirectory()) {
      filelist = await walk(filepath, filelist);
    } else {
      filelist.push(filepath);
    }
  }

  return filelist;
}
