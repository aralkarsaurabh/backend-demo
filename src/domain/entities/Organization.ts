export interface Organization {
  id: string;
  name: string;
  /** Unique, server-generated, URL-safe. */
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}
