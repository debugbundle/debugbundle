import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

export type InteractiveLoginSelection =
  | { kind: "github" }
  | { kind: "github-device" }
  | { kind: "member-token"; bearerToken: string }
  | { kind: "cancel" };

export function isInteractiveTerminal(): boolean {
  return stdin.isTTY === true && stdout.isTTY === true;
}

export async function promptForInteractiveLoginSelection(): Promise<InteractiveLoginSelection> {
  const readlineInterface = createInterface({
    input: stdin,
    output: stdout
  });

  try {
    stdout.write(
      [
        "Choose an authentication method:",
        "1. GitHub (auto: use gh if available, otherwise device flow)",
        "2. GitHub device flow",
        "3. Existing member token",
        "4. Cancel"
      ].join("\n") + "\n"
    );

    for (;;) {
      const selection = (await readlineInterface.question("Selection [1-4]: ")).trim();
      if (selection === "1") {
        return { kind: "github" };
      }
      if (selection === "2") {
        return { kind: "github-device" };
      }
      if (selection === "3") {
        const bearerToken = (await readlineInterface.question("Paste your member token: ")).trim();
        if (bearerToken.length > 0) {
          return {
            kind: "member-token",
            bearerToken
          };
        }

        stdout.write("Member token cannot be empty.\n");
        continue;
      }
      if (selection === "4") {
        return { kind: "cancel" };
      }

      stdout.write("Enter 1, 2, 3, or 4.\n");
    }
  } finally {
    readlineInterface.close();
  }
}
