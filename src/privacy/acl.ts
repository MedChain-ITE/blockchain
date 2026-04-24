export interface ACLPolicy {
  /** Public key of the record owner. */
  owner: string;
  /** Public keys that can read this record. Empty = owner only. */
  readers: string[];
  /** Public keys that can write this record. Empty = owner only. */
  writers: string[];
  /** If true, anyone can read (value is unencrypted). */
  public: boolean;
}

export function createACL(
  owner: string,
  opts: { readers?: string[]; writers?: string[]; public?: boolean } = {},
): ACLPolicy {
  return {
    owner,
    readers: opts.readers ?? [],
    writers: opts.writers ?? [],
    public: opts.public ?? false,
  };
}

/** Check if an identity can read a record. */
export function canRead(acl: ACLPolicy, publicKey: string): boolean {
  if (acl.public) return true;
  if (acl.owner === publicKey) return true;
  return acl.readers.includes(publicKey);
}

/** Check if an identity can write/update a record. */
export function canWrite(acl: ACLPolicy, publicKey: string): boolean {
  if (acl.owner === publicKey) return true;
  return acl.writers.includes(publicKey);
}
