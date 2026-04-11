import { loadContacts, addContact, removeContact } from '../contacts.js';
import { CliError } from '../errors.js';
import { outputSuccess } from '../output.js';
import { formatContacts, formatContactResolved } from '../formatters.js';

export async function contactsAdd(
  name: string,
  agentId: string,
  options: { alias?: string; notes?: string },
): Promise<void> {
  addContact(name, agentId, { alias: options.alias, notes: options.notes });
  outputSuccess({
    name,
    agent_id: agentId,
    alias: options.alias ?? null,
    notes: options.notes ?? null,
    message: `Contact "${name}" saved`,
  });
}

export async function contactsList(): Promise<void> {
  const contacts = loadContacts();
  outputSuccess(contacts as unknown as Record<string, unknown>, formatContacts);
}

export async function contactsResolve(name: string): Promise<void> {
  const contacts = loadContacts();
  if (!contacts[name]) {
    throw new CliError('CONTACT_NOT_FOUND', `Contact "${name}" not found`);
  }
  outputSuccess({ name, agent_id: contacts[name].agent_id }, formatContactResolved);
}

export async function contactsRemove(name: string): Promise<void> {
  removeContact(name);
  outputSuccess({ name, message: `Contact "${name}" removed` });
}
