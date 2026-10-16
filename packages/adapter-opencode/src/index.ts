import { handleHook, findRoot } from "@tdd-sdd/cli";

interface PluginContext {
  directory: string;
}

interface Part {
  type: string;
  text?: string;
}

export const TddSddPlugin = async ({ directory }: PluginContext) => {
  const rootFor = () => findRoot(directory) ?? directory;

  return {
    /** Bloquea la acción lanzando un error con el motivo del harness. */
    "tool.execute.before": async (
      input: { tool: string },
      output: { args?: Record<string, unknown> },
    ): Promise<void> => {
      const args = (output.args ?? {}) as Record<string, string | undefined>;
      const result = handleHook(
        {
          hook_event_name: "PreToolUse",
          tool_name: input.tool,
          tool_input: { filePath: args.filePath ?? args.file_path, command: args.command },
          cwd: directory,
        },
        rootFor(),
      );
      if (result.exitCode === 2) throw new Error(result.stderr);
    },

    /** Los comandos humanos (/approve, /override, /refactor) llegan en el mensaje del usuario. */
    "chat.message": async (_input: unknown, output: { parts: Part[] }): Promise<void> => {
      for (const part of output.parts) {
        if (part.type !== "text" || !part.text) continue;
        handleHook({ hook_event_name: "UserPromptSubmit", prompt: part.text, cwd: directory }, rootFor());
      }
    },
  };
};

export default TddSddPlugin;
