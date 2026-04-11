import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_DIR } from './config.js';
import { CliError } from './errors.js';

const CONTACTS_FILE = path.join(CONFIG_DIR, 'contacts.json');

export interface Contact {
  agent_id: string;
  alias?: string;
  notes?: string;
  [key: string]: unknown;
}

export type Contacts = Record<string, Contact>;

export function loadContacts(): Contacts {
  try {
    const raw = fs.readFileSync(CONTACTS_FILE, 'utf-8');
    return JSON.parse(raw) as Contacts;
  } catch {
    return {};
  }
}

export function saveContacts(contacts: Contacts): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2), 'utf-8');
}

export function addContact(
  name: string,
  agentId: string,
  meta?: { alias?: string; notes?: string },
): void {
  if (!agentId.startsWith('trip1')) {
    throw new CliError('INVALID_AGENT_ID', 'Agent ID must start with trip1');
  }
  const contacts = loadContacts();
  contacts[name] = { agent_id: agentId, ...meta };
  saveContacts(contacts);
}

export function removeContact(name: string): void {
  const contacts = loadContacts();
  if (!contacts[name]) {
    throw new CliError('CONTACT_NOT_FOUND', `Contact "${name}" not found`);
  }
  delete contacts[name];
  saveContacts(contacts);
}

export function resolveRecipient(value: string): string {
  if (value.startsWith('trip1')) return value;
  const contacts = loadContacts();
  if (contacts[value]) return contacts[value].agent_id;
  return value; // pass through to server for alias resolution
}

export function resolveRecipients(values: string[]): string[] {
  const contacts = loadContacts();
  return values.map((v) => {
    if (v.startsWith('trip1')) return v;
    if (contacts[v]) return contacts[v].agent_id;
    return v;
  });
}
