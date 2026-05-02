import { spawn } from 'child_process';

const platformOpener = (): { command: string; args: string[] } => {
  switch (process.platform) {
    case 'darwin':
      return { command: 'open', args: [] };
    case 'win32':
      return { command: 'cmd', args: ['/c', 'start', '""'] };
    default:
      return { command: 'xdg-open', args: [] };
  }
};

export const openBrowser = async (url: string): Promise<boolean> => {
  if (process.env.MCP_PROXY_NO_BROWSER === '1') return false;
  const { command, args } = platformOpener();
  return new Promise((resolve) => {
    try {
      const child = spawn(command, [...args, url], {
        detached: true,
        stdio: 'ignore',
      });
      child.on('error', () => resolve(false));
      child.unref();
      resolve(true);
    } catch {
      resolve(false);
    }
  });
};
