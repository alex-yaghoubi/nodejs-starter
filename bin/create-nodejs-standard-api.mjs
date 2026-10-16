#!/usr/bin/env node
import {cp, mkdir, readFile, readdir, rm, writeFile, realpath} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const template = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../template/backend');
const usage = `Usage: create-nodejs-standard-api <project-name> [--pm npm|pnpm|yarn] [--skip-install] [--no-git]

Options:
  --pm <name>      Package manager (npm, pnpm, yarn; default npm)
  --skip-install    Only create the files
  --no-git          Skip git init
  --help            Show help
  --version         Print version`;

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return {help: true};
  if (args.includes('--version') || args.includes('-v')) return {version: true};
  const result = {name: undefined, pm: 'npm', skipInstall: false, git: true};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--pm') result.pm = args[++i];
    else if (arg === '--skip-install') result.skipInstall = true;
    else if (arg === '--no-git') result.git = false;
    else if (arg.startsWith('-') || result.name !== undefined) throw new Error(`Unknown option or extra argument: ${arg}`);
    else result.name = arg;
  }
  if (typeof result.name !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(result.name) ||
      result.name.endsWith('.') || result.name.length > 120 ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result.name)) {
    throw new Error('Provide one safe project name (letters, digits, hyphens, dots, underscores).');
  }
  if (!['npm', 'pnpm', 'yarn'].includes(result.pm)) throw new Error('Choose --pm npm, pnpm or yarn.');
  return result;
}

export async function generate(args, cwd = process.cwd(), install = true) {
  const options = parseArgs(args);
  if (options.help) return {message: usage};
  if (options.version) return {message: JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version};
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 20 || (major === 20 && minor < 9)) throw new Error('Node.js >=20.9 required');
  const destination = path.resolve(cwd, options.name);
  // Atomic reservation: never modify an existing project directory.
  try { await mkdir(destination); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Directory ${options.name} already exists; refusing to overwrite.`);
    throw error;
  }
  try {
    for (const entry of await readdir(template)) {
      await cp(path.join(template, entry), path.join(destination, entry), {
        recursive: true, force: false, errorOnExist: true,
      });
    }
    // npm tarballs omit .gitignore files, so ship its contents as a normal template.
    await writeFile(path.join(destination, '.gitignore'), await readFile(path.join(destination, 'gitignore.template'), 'utf8'));
    await rm(path.join(destination, 'gitignore.template'));
    const pkgPath = path.join(destination, 'package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    pkg.name = options.name.toLowerCase();
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    const example = await readFile(path.join(destination, '.env.example'), 'utf8');
    await writeFile(path.join(destination, '.env'), example.replace(
      'replace-with-a-long-random-secret-before-starting', randomBytes(48).toString('hex')
    ), {mode: 0o600, flag: 'wx'});
  } catch (error) {
    await rm(destination, {recursive: true, force: true});
    throw error;
  }
  const run = (command, commandArgs, label) => {
    const status = spawnSync(command, commandArgs, {cwd: destination, stdio: 'inherit', shell: process.platform === 'win32'});
    if (status.error || status.status !== 0) throw new Error(`${label} failed. Generated files are preserved at ${destination}`);
  };
  if (install && !options.skipInstall) run(options.pm, ['install'], 'Dependency installation');
  if (install && options.git) {
    const status = spawnSync('git', ['init'], {cwd: destination, stdio: 'ignore'});
    if (status.error || status.status !== 0) console.warn('Git was not initialized; you can run git init later.');
  }
  return {message: `Created ${destination}\n\nNext steps:\n  cd ${options.name}\n  docker compose up -d db\n  ${options.skipInstall ? options.pm + ' install\n  ' : ''}${options.pm} run db:generate\n  ${options.pm} run db:migrate\n  ${options.pm} run dev\n\nDocs: http://localhost:4000/docs (development only)\nHealth: http://localhost:4000/health`};
}

// Resolve npm's node_modules/.bin symlink: compare the invoked realpath, not its link.
const invokedPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => path.resolve(process.argv[1])) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  generate(process.argv.slice(2)).then(({message}) => console.log(message)).catch((error) => {
    console.error('Error:', error.message); console.error(usage); process.exitCode = 1;
  });
}
