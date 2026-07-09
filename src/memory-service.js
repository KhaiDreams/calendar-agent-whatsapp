import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import config from './config.js';

const DATA_PATH = new URL('../data/conversations.json', import.meta.url).pathname;
const MAX_STORED_PER_CONVERSATION = 100;

function readStoreFromDisk() {
  if (!existsSync(DATA_PATH)) return {};
  try {
    return JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
  } catch (err) {
    console.error('[Memory] Erro ao ler histórico salvo:', err.message);
    return {};
  }
}

let localStore = readStoreFromDisk();

function persist() {
  try {
    mkdirSync(dirname(DATA_PATH), { recursive: true });
    writeFileSync(DATA_PATH, JSON.stringify(localStore, null, 2));
  } catch (err) {
    console.error('[Memory] Erro ao salvar histórico em disco:', err.message);
  }
}

/**
 * Serviço de memória — histórico de conversa espelhado em disco (data/conversations.json)
 * pra sobreviver a restarts/deploys do PM2.
 */
class MemoryService {
  async saveMessage(from, role, content) {
    const timestamp = Date.now();
    if (!localStore[from]) localStore[from] = [];
    localStore[from].push({ timestamp, role, content });
    if (localStore[from].length > MAX_STORED_PER_CONVERSATION) {
      localStore[from] = localStore[from].slice(-MAX_STORED_PER_CONVERSATION);
    }
    persist();
  }

  async getHistory(from, limit = config.maxHistory) {
    const history = (localStore[from] || []).slice(-limit);
    return history.map((i) => ({ role: i.role, content: i.content }));
  }

  async clearHistory(from) {
    delete localStore[from];
    persist();
  }
}

export const memory = new MemoryService();
