export const GITHUB_REPO = 'https://github.com/XenolithEngine/xenolith-graph'
export const GITHUB_BRANCH = 'main'

/** Link to a repo-relative source path on GitHub, e.g. ghUrl('apps/demo-react/src/pages/Mount.tsx'). */
export const ghUrl = (repoPath: string): string => `${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${repoPath}`
