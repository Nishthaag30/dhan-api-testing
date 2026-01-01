# Dhan WebSocket Subscription Format

## Connection URL

```
wss://api-feed.dhan.co?version=2&token={ACCESS_TOKEN}&clientId={CLIENT_ID}&authType=2
```

## Subscription Message

To subscribe to stock instruments, send a JSON message with the following format:

```json
{
  "t": "sub",
  "s": [
    {
      "exchangeSegment": "NSE_EQ",
      "securityId": "2885"
    },
    {
      "exchangeSegment": "NSE_EQ",
      "securityId": "11536"
    },
    ...
  ]
}
```

**Fields:**
- `t`: Message type, must be `"sub"` for subscription
- `s`: Array of instrument objects, each containing:
  - `exchangeSegment`: Exchange segment (`"NSE_EQ"` for equity stocks, `"NSE_FNO"` for futures & options)
  - `securityId`: Security ID from Dhan (required, obtained from Dhan instruments CSV)

## Example Subscription Payload

```json
{
  "t": "sub",
  "s": [
    {
      "exchangeSegment": "NSE_EQ",
      "securityId": "1270"
    },
    {
      "exchangeSegment": "NSE_EQ",
      "securityId": "7852"
    },
    {
      "exchangeSegment": "NSE_EQ",
      "securityId": "1624"
    },
    {
      "exchangeSegment": "NSE_EQ",
      "securityId": "13611"
    },
    {
      "exchangeSegment": "NSE_EQ",
      "securityId": "2885"
    },
    {
      "exchangeSegment": "NSE_EQ",
      "securityId": "11536"
    }
  ]
}
```

**Note:** The `securityId` values are mapped from the Dhan instruments CSV file. Each stock symbol is enriched with its corresponding `securityId` before subscription.

## Price Update Messages

When subscribed, you'll receive messages in the following format:

### LTP (Last Traded Price) Message

```json
{
  "t": "ltp",
  "securityId": "2885",
  "ltp": 2456.50
}
```

**Fields:**
- `t`: Message type, `"ltp"` for Last Traded Price
- `securityId`: Security ID of the instrument (may also include `s` field with symbol)
- `ltp`: Last traded price (number)

### Other Message Types

Dhan WebSocket may also send:
- `ohlc`: Open, High, Low, Close data
- `quote`: Quote data
- `depth`: Market depth data

## Implementation in this Project

The subscription is handled in `lib/dhanSocket.ts`:

```typescript
const subscriptionInstruments = STOCK_INSTRUMENTS.map(inst => ({
  exchangeSegment: inst.exchange, // 'NSE_EQ' or 'NSE_FNO'
  securityId: inst.securityId,
}));

const subscriptionMessage = {
  t: 'sub',
  s: subscriptionInstruments, // Array of { exchangeSegment, securityId }
};

ws.send(JSON.stringify(subscriptionMessage));
```

The `STOCK_INSTRUMENTS` array contains enriched instruments with `symbol`, `exchange`, and `securityId` defined in `stockCodes.ts`. Each instrument is mapped to include `exchangeSegment` and `securityId` for the subscription.

