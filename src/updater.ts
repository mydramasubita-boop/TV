// ── Auto-updater per GitHub Releases (TV) ────────────────────────────
const GITHUB_API = 'https://api.github.com/repos/mydramasubita-boop/appmydramatv/releases/latest';
const CURRENT_VERSION = '1.0.0';

interface GithubRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
  body: string;
}

const compareVersions = (a: string, b: string): number => {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i]||0) > (pb[i]||0)) return 1;
    if ((pa[i]||0) < (pb[i]||0)) return -1;
  }
  return 0;
};

export const checkForUpdate = async (): Promise<{
  hasUpdate: boolean;
  version?: string;
  downloadUrl?: string;
  notes?: string;
}> => {
  try {
    const res = await fetch(GITHUB_API, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) return { hasUpdate: false };
    const release: GithubRelease = await res.json();
    const newVersion = release.tag_name.replace(/^v/, '');
    if (compareVersions(newVersion, CURRENT_VERSION) <= 0) return { hasUpdate: false };
    const apk = release.assets.find(a => a.name.endsWith('.apk'));
    if (!apk) return { hasUpdate: false };
    return {
      hasUpdate: true,
      version: newVersion,
      downloadUrl: apk.browser_download_url,
      notes: release.body,
    };
  } catch {
    return { hasUpdate: false };
  }
};
