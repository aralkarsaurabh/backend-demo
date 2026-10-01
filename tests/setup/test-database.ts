/**
 * Integration tests wipe tables, so they must never touch the dev database.
 * The URL comes from TEST_DATABASE_URL, or else from DATABASE_URL with `_test`
 * appended to the database name, and it is refused unless the final database
 * name ends in `_test`.
 */
export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.TEST_DATABASE_URL;
  const base = explicit ?? env.DATABASE_URL;
  if (!base) {
    throw new Error("Set TEST_DATABASE_URL (or DATABASE_URL) to run integration tests.");
  }

  const url = new URL(base);
  if (!explicit) url.pathname = `${url.pathname}_test`;

  const database = url.pathname.replace(/^\//, "");
  if (!database.endsWith("_test")) {
    throw new Error(
      `Refusing to run integration tests against "${database}": the database name must end with "_test".`,
    );
  }
  return url.toString();
}
