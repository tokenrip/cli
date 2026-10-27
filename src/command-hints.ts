import { Command } from 'commander';

type ErrorOptions = Parameters<Command['error']>[1];

/**
 * An unknown subcommand names the group's real commands: commander's `error: unknown command 'x'`
 * (with its "Did you mean …?" when it has one) gains `<group> commands: a, b, c (rip <group> --help)`.
 *
 * Each group (the root included) gets its own `error`, keyed on commander's public
 * `commander.unknownCommand` code, which commander raises on the group the user reached. A group with
 * a default subcommand (`auth keys`, `notify`) never raises it: commander hands the unknown word to the
 * default as an argument, so that subcommand's `commander.excessArguments` gains the group's line too.
 * Only the message changes, so commander still writes and exits as before. Per-group `configureOutput`
 * cannot do this: commander shares one output configuration object across the whole tree.
 */
export function listCommandsOnUnknown(program: Command): void {
  for (const group of groups(program)) {
    const names = group.createHelp().visibleCommands(group).map((cmd) => cmd.name()).filter((name) => name !== 'help');
    const path = commandPath(group);
    const label = path.length > 1 ? path.slice(1).join(' ') : path[0];
    const hint = `${label} commands: ${names.join(', ')} (${[...path, '--help'].join(' ')})`;
    appendOn(group, 'commander.unknownCommand', hint);
    const fallback = group.commands.find((cmd) => cmd.name() === defaultCommandName(group));
    if (fallback) appendOn(fallback, 'commander.excessArguments', hint);
  }
}

/** `cmd`'s errors with commander's `code` gain `hint` on a line of its own; every other error is unchanged. */
function appendOn(cmd: Command, code: string, hint: string): void {
  cmd.error = function (this: Command, message: string, options?: ErrorOptions): never {
    const text = options?.code === code ? `${message}\n${hint}` : message;
    return Command.prototype.error.call(this, text, options);
  };
}

/**
 * The subcommand registered with `{ isDefault: true }`. Commander 12 keeps it only in a private field;
 * `command-hints.test.ts` fails if that ever changes.
 */
function defaultCommandName(group: Command): string | null {
  return (group as unknown as { _defaultCommandName: string | null })._defaultCommandName;
}

/** Every command in the tree that has subcommands. */
function groups(cmd: Command): Command[] {
  if (cmd.commands.length === 0) return [];
  return [cmd, ...cmd.commands.flatMap(groups)];
}

/** Command names from the root down, e.g. `['rip', 'workspace', 'member']`. */
function commandPath(cmd: Command): string[] {
  const names: string[] = [];
  for (let at: Command | null = cmd; at; at = at.parent) names.unshift(at.name());
  return names;
}
