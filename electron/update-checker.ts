import https from 'node:https';

const RELEASES_API = 'https://api.github.com/repos/gautham-sai05/Auralis/releases/latest';
const RELEASES_PAGE = 'https://github.com/gautham-sai05/Auralis/releases/latest';

interface GithubRelease {
  tag_name?: string;
}

function fetchLatestTag(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const req = https.get(
      RELEASES_API,
      { headers: { 'User-Agent': 'Auralis-update-checker' }, timeout: 8000 },
      (res) => {
        if (res.statusCode !== 200) {
          resolve(undefined);
          res.resume();
          return;
        }
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf-8');
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body) as GithubRelease;
            resolve(parsed.tag_name);
          } catch {
            resolve(undefined);
          }
        });
      },
    );
    req.on('error', () => resolve(undefined));
    req.on('timeout', () => {
      req.destroy();
      resolve(undefined);
    });
  });
}

function isNewer(latestTag: string, currentVersion: string): boolean {
  const strip = (v: string): string => v.replace(/^v/, '');
  const latest = strip(latestTag).split('.').map(Number);
  const current = strip(currentVersion).split('.').map(Number);
  for (let i = 0; i < Math.max(latest.length, current.length); i++) {
    const l = latest[i] ?? 0;
    const c = current[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

// Best-effort, no telemetry: a single unauthenticated GET to GitHub's public
// releases API. Never blocks startup and never throws — a network failure or
// unparsable response just means no update notice this time.
export async function checkForUpdate(currentVersion: string): Promise<{ available: boolean; url: string } | null> {
  const latestTag = await fetchLatestTag();
  if (!latestTag) return null;
  return { available: isNewer(latestTag, currentVersion), url: RELEASES_PAGE };
}
