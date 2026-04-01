import { loadConfig, saveConfig, getApiUrl, getApiKey } from '../config.js';
import { outputSuccess } from '../output.js';
import { formatConfigSaved } from '../formatters.js';

export async function configSetKey(key: string): Promise<void> {
  const config = loadConfig();
  config.apiKey = key;
  saveConfig(config);
  outputSuccess({ message: 'API key saved' }, formatConfigSaved);
}

export async function configSetUrl(url: string): Promise<void> {
  const config = loadConfig();
  config.apiUrl = url;
  saveConfig(config);
  outputSuccess({ message: 'API URL saved', apiUrl: url }, formatConfigSaved);
}

export async function configShow(): Promise<void> {
  const config = loadConfig();
  const apiUrl = getApiUrl(config);
  const apiKey = getApiKey(config);
  const hasKey = apiKey ? 'yes (saved)' : 'no (env/not set)';
  outputSuccess({
    apiUrl,
    apiKey: hasKey,
    configFile: '~/.config/tokenrip/config.json',
  });
}
