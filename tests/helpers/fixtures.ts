import { generateKeyPair, sign } from "../../src/identity";
import { createTransaction, type CreateTxParams } from "../../src/core/transaction";
import { TxType, type Transaction } from "../../src/types";

export function createTestKeyPair() {
  return generateKeyPair();
}

export function createTestTransaction(overrides: Partial<CreateTxParams> = {}): Transaction {
  const kp = createTestKeyPair();
  const params: CreateTxParams = {
    type: TxType.StateSet,
    sender: kp.publicKey,
    nonce: 0,
    payload: { kind: "state:set", key: "test-key", value: "test-value" },
    ...overrides,
    ...(overrides.sender ? {} : { sender: kp.publicKey }),
  };

  const unsigned = createTransaction(params);
  const signature = sign(unsigned.hash, kp.privateKey);
  return { ...unsigned, signature };
}
