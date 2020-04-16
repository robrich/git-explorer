
export type GitType = 'tree' | 'commit' | 'blob';

export interface GitInfo {
  hash: string;
  type: GitType;
  length: number;
  nestedNodes: NestedNode[];
  parentNodes?: string[];
  refs?: string[];
  author?: NameAndDate;
  committer?: NameAndDate;
  // blank for blobs just to save space
  catfile: string[] | undefined;
  content: string | undefined;
}

export interface NestedNode {
  hash: string;
  type: GitType;
  filename?: string;
  permissions?: string;
}

export interface NameAndDate {
  name: string | undefined;
  email: string | undefined;
  date: string | undefined;
}

export interface Ref {
  label: string;
  target: string;
}
