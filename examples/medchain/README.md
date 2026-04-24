# Supply Chain Tracking Example

Demonstrates tracking products from creation through multiple waypoints to delivery using MiniLedger smart contracts.

## Run

```bash
# Terminal 1: Start a node
miniledger init
miniledger start

# Terminal 2: Run the demo
npx tsx examples/medchain/client.ts
```

Then open http://localhost:4441/dashboard to see the product data in the state explorer.

## Query

```sql
SELECT * FROM world_state WHERE key LIKE 'product:%'
```
