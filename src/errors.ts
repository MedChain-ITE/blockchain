export class MiniLedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MiniLedgerError";
  }
}

export class ChainError extends MiniLedgerError {
  constructor(message: string) {
    super(message);
    this.name = "ChainError";
  }
}

export class ValidationError extends MiniLedgerError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class StorageError extends MiniLedgerError {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

export class ConsensusError extends MiniLedgerError {
  constructor(message: string) {
    super(message);
    this.name = "ConsensusError";
  }
}

export class NetworkError extends MiniLedgerError {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export class IdentityError extends MiniLedgerError {
  constructor(message: string) {
    super(message);
    this.name = "IdentityError";
  }
}

export class ConfigError extends MiniLedgerError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
