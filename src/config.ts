import commandLineArgs from 'command-line-args';
import fs from 'fs';

export const optionDefinitions = [
  { name: 'saveDir', type: String },
  { name: 'stateDir', type: String },
  { name: 'cookiesFile', type: String, defaultValue: '' },
];

export type RuntimeOptions = {
  saveDir: string;
  stateDir: string;
  cookiesFile: string;
};

const runtimeOptions = commandLineArgs(optionDefinitions, { partial: true }) as RuntimeOptions;

export function getRuntimeOptions(): RuntimeOptions {
  // if /data/config.json exists, load it as runtimeOptions. If runtimeOptions are provided via command line, throw exception if /data/config.json exists.
  const configFilePath = '/data/config.json';
  let result;
  let stateDir;
  let saveDir;
  if (fs.existsSync(configFilePath)) {
    console.log(`Loading runtime options from ${configFilePath}. Ignoring command line options if provided.`);
    const configFileContent = fs.readFileSync(configFilePath, 'utf-8');
    const configFileOptions = JSON.parse(configFileContent) as RuntimeOptions;
    result = configFileOptions;
    stateDir = resolveExistingDir(configFileOptions.stateDir);
    saveDir = resolveExistingDir(configFileOptions.saveDir);
  } else {
    result = runtimeOptions;
    stateDir = resolveExistingDir(runtimeOptions.stateDir);
    saveDir = resolveExistingDir(runtimeOptions.saveDir);
  }
  if (!stateDir || !saveDir) {
    if (!result.stateDir) {
      throw new Error('Missing or invalid stateDir');
    }
    if (!result.saveDir) {
      throw new Error('Missing or invalid saveDir');
    }
  }
  return result;
}

export function resolveExistingDir(candidate: string | undefined) {
  if (candidate && fs.existsSync(candidate)) return candidate;
  return null;
}
