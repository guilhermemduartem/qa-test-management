import type { ApiEndpoint } from '../../types/apis';

export interface FolderNode {
  segment: string;    // last segment name, e.g. "Location"
  fullPath: string;   // e.g. "Sell/Location"
  children: FolderNode[];
  directCount: number;  // endpoints directly in this folder
  totalCount: number;   // endpoints in this folder + all descendants
}

export function buildFolderTree(endpoints: ApiEndpoint[], extraFolders: string[] = []): FolderNode[] {
  const nodeMap = new Map<string, FolderNode>();

  const ensureNode = (folder: string) => {
    const segments = folder.split('/').filter(Boolean);
    let pathSoFar = '';
    segments.forEach((seg) => {
      const parentPath = pathSoFar;
      pathSoFar = parentPath ? `${parentPath}/${seg}` : seg;
      if (!nodeMap.has(pathSoFar)) {
        const node: FolderNode = { segment: seg, fullPath: pathSoFar, children: [], directCount: 0, totalCount: 0 };
        nodeMap.set(pathSoFar, node);
        if (parentPath) nodeMap.get(parentPath)?.children.push(node);
      }
    });
  };

  // Ensure all explicitly created folders exist in the tree
  extraFolders.forEach((f) => { if (f.trim()) ensureNode(f.trim()); });

  // Count endpoints per folder (also ensures nodes exist)
  endpoints.forEach((ep) => {
    const folder = ep.folder?.trim() || '';
    if (!folder) return;
    ensureNode(folder);
    nodeMap.get(folder)!.directCount++;
  });

  // Compute totalCount bottom-up
  const computeTotal = (node: FolderNode): number => {
    const childTotal = node.children.reduce((s, c) => s + computeTotal(c), 0);
    node.totalCount = node.directCount + childTotal;
    return node.totalCount;
  };

  // Root nodes
  const roots: FolderNode[] = [];
  nodeMap.forEach((node, path) => {
    const slashIdx = path.lastIndexOf('/');
    const hasParentInMap = slashIdx > -1 && nodeMap.has(path.slice(0, slashIdx));
    if (!hasParentInMap) roots.push(node);
  });

  roots.forEach(computeTotal);
  roots.sort((a, b) => a.segment.localeCompare(b.segment));
  const sortChildren = (n: FolderNode) => {
    n.children.sort((a, b) => a.segment.localeCompare(b.segment));
    n.children.forEach(sortChildren);
  };
  roots.forEach(sortChildren);

  return roots;
}

/** Returns endpoints whose folder equals `sel` or is a descendant (e.g. "Sell" matches "Sell/Location"). */
export function filterByFolder(endpoints: ApiEndpoint[], sel: 'all' | 'none' | string): ApiEndpoint[] {
  if (sel === 'all') return endpoints;
  if (sel === 'none') return endpoints.filter((ep) => !ep.folder?.trim());
  return endpoints.filter((ep) => {
    const f = ep.folder?.trim() ?? '';
    return f === sel || f.startsWith(sel + '/');
  });
}

export function noFolderCount(endpoints: ApiEndpoint[]): number {
  return endpoints.filter((ep) => !ep.folder?.trim()).length;
}
