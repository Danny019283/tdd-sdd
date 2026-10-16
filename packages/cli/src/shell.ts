type Token = { kind: "word"; value: string } | { kind: "op"; value: string };

const IGNORED_TARGETS = new Set(["/dev/null", "/dev/stdout", "/dev/stderr", "-"]);

function tokenize(command: string): Token[] {
  const tokens: Token[] = [];
  let word = "";
  let inWord = false;
  const flush = () => {
    if (inWord) tokens.push({ kind: "word", value: word });
    word = "";
    inWord = false;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (c === "'" || c === '"') {
      const end = command.indexOf(c, i + 1);
      const stop = end === -1 ? command.length : end;
      word += command.slice(i + 1, stop);
      inWord = true;
      i = stop;
    } else if (/\s/.test(c)) {
      flush();
    } else if (c === ">") {
      if (inWord && /^\d+$/.test(word)) {
        word = "";
        inWord = false;
      } else flush();
      if (command[i + 1] === "&") {
        // duplicación de descriptor (2>&1): no escribe en un archivo
        i += 1;
        while (/[\d-]/.test(command[i + 1] ?? "")) i += 1;
        continue;
      }
      const op = command[i + 1] === ">" ? ">>" : ">";
      if (op === ">>") i += 1;
      tokens.push({ kind: "op", value: op });
    } else if (c === "&" || c === "|" || c === ";") {
      flush();
      if ((c === "&" || c === "|") && command[i + 1] === c) i += 1;
      tokens.push({ kind: "op", value: ";" });
    } else {
      word += c;
      inWord = true;
    }
  }
  flush();
  return tokens;
}

function splitCommands(tokens: Token[]): Token[][] {
  const commands: Token[][] = [[]];
  for (const token of tokens) {
    if (token.kind === "op" && token.value === ";") commands.push([]);
    else commands[commands.length - 1]!.push(token);
  }
  return commands.filter((c) => c.length > 0);
}

const isFlag = (word: string) => word.startsWith("-");

/** Rutas que un comando de shell escribiría, de forma heurística pero conservadora. */
export function extractWriteTargets(command: string): string[] {
  const targets: string[] = [];
  for (const tokens of splitCommands(tokenize(command))) {
    const words: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.kind === "op") {
        const next = tokens[i + 1];
        if (next?.kind === "word") targets.push(next.value);
        i += 1;
      } else words.push(t.value);
    }
    const [name = "", ...args] = words;
    const positional = args.filter((a) => !isFlag(a));
    switch (name) {
      case "tee":
        targets.push(...positional);
        break;
      case "rm":
        targets.push(...positional);
        break;
      case "cp":
      case "mv":
        if (positional.length >= 2) targets.push(positional[positional.length - 1]!);
        break;
      case "sed":
        if (args.some((a) => /^-[a-zA-Z]*i/.test(a) || a === "--in-place") && positional.length >= 2) {
          targets.push(positional[positional.length - 1]!);
        }
        break;
    }
  }
  return [...new Set(targets)].filter((t) => !IGNORED_TARGETS.has(t));
}
