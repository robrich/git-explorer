import { DateTime } from 'luxon';
import { GitInfo, GitType, NameAndDate, NestedNode } from './types';


export async function fillGitInfo(repoPath: string, info: GitInfo|undefined): Promise<GitInfo|undefined> {
  if (!info) {
    return info;
  }
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

async function getTree(repoPath: string, info: GitInfo): Promise<NestedNode[] | undefined> {
  if (!info.catfile) {
    return undefined;
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
    date: date?.toISO()
  };
}

async function getBlob(repoPath: string, info: GitInfo) {
  // nothing to do
}
