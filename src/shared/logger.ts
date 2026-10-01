export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

/** One JSON object per line. Callers must never pass passwords, tokens or hashes. */
export const consoleLogger: Logger = {
  info: (event, fields) =>
    console.log(JSON.stringify({ level: "info", time: new Date().toISOString(), event, ...fields })),
  error: (event, fields) =>
    console.error(JSON.stringify({ level: "error", time: new Date().toISOString(), event, ...fields })),
};

export const silentLogger: Logger = { info: () => {}, error: () => {} };
