import commandLineArgs from 'command-line-args';
import fs from 'fs';

export const optionDefinitions = [
  { name: 'saveDir', type: String },
  { name: 'stateDir', type: String },
  { name: 'cookiesFile', type: String, defaultValue: '' },
];

export type RuntimeOptions = {
  saveDir?: string;
  stateDir?: string;
  cookiesFile?: string;
};

const runtimeOptions = commandLineArgs(optionDefinitions, { partial: true }) as RuntimeOptions;

export function getRuntimeOptions(): RuntimeOptions & { stateDir: string; saveDir: string } {
  const resolvedStateDir =
    resolveExistingDir([runtimeOptions.stateDir, process.env.STATE_DIR, '/state', 'state']) ||
    runtimeOptions.stateDir ||
    process.env.STATE_DIR ||
    '/state';

  const resolvedSaveDir =
    resolveExistingDir([runtimeOptions.saveDir, process.env.SAVE_DIR, '/saveDir', 'saveDir']) ||
    runtimeOptions.saveDir ||
    process.env.SAVE_DIR ||
    '/saveDir';

  return {
    ...runtimeOptions,
    stateDir: resolvedStateDir,
    saveDir: resolvedSaveDir,
  };
}

export function resolveExistingDir(candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

export const BUILD_STAMP = '2026-05-25-video-identify-fallbacks-v7';
