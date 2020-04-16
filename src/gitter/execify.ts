import { exec } from 'child_process';
import { promisify } from 'util';


const execAsPromise = promisify(exec);

// A thin wrapper around child_process.exec that throws on error and is awaitable
export default async function execify(cmd: string, cwd: string): Promise<string> {
  const results = await execAsPromise(cmd, {cwd});
  if (results.stderr) {
    throw results.stderr;
  }
  return results.stdout || '';
}
