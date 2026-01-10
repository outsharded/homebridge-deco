# Homebridge Deco Plugin - AI Coding Instructions

## Project Overview
This is a Homebridge dynamic platform plugin for TP-Link Deco mesh network systems, built with TypeScript using ES modules (`type: "module"` in package.json). The plugin integrates with TP-Link's cloud API to expose your Deco as a native HomeKit Router accessory (default), with optional advanced features including network sensors, guest network control, individual mesh unit status, and device presence tracking.

## Architecture & Key Files

### Entry Point Flow
1. [src/index.ts](src/index.ts) - Exports default function that registers `DecoHomebridgePlatform` with Homebridge API
2. [src/platform.ts](src/platform.ts) - `DecoHomebridgePlatform` implements `DynamicPlatformPlugin` interface
   - Constructor initializes `DecoAPI` client and validates credentials
   - `configureAccessory()` - Restores cached accessories from disk on startup
   - `discoverDevices()` - Authenticates with TP-Link cloud, discovers Deco devices, registers accessories
   - `startPolling()` - Sets up periodic status updates based on `pollingInterval` config
3. [src/decoAPI.ts](src/decoAPI.ts) - Core API client for TP-Link cloud communication
   - `authenticate()` - Obtains and maintains session token (auto-refreshes every hour)
   - `getNetworkStatus()` - Fetches comprehensive network state (devices, clients, internet status)
   - `setGuestNetwork()` - Controls guest network on/off
   - `isDeviceConnected()` - Checks if specific MAC address is online
   - Implements retry logic and error recovery

### Accessory Classes
- [src/decoRouterAccessory.ts](src/decoRouterAccessory.ts) - Native HomeKit Router accessory (default, recommended)
- [src/decoNetworkAccessory.ts](src/decoNetworkAccessory.ts) - Contact sensor for internet connectivity (optional)
- [src/decoGuestNetworkAccessory.ts](src/decoGuestNetworkAccessory.ts) - Switch for guest network control (optional)
- [src/decoDeviceAccessory.ts](src/decoDeviceAccessory.ts) - Contact sensor per Deco mesh unit (optional)
- [src/decoDeviceTrackerAccessory.ts](src/decoDeviceTrackerAccessory.ts) - Occupancy sensor for MAC-based device tracking (optional)

### Configuration Files
- [src/settings.ts](src/settings.ts) - Defines `PLATFORM_NAME: 'TPLinkDeco'` and `PLUGIN_NAME: 'homebridge-deco'`
- [config.schema.json](config.schema.json) - UI schema for Homebridge Config UI X (requires username, password)
- [test/hbConfig/config.json](test/hbConfig/config.json) - Development test configuration

## Development Workflow

### Build & Development
```bash
npm run build      # Compile TypeScript to dist/
npm link           # Link plugin to global Homebridge
npm run watch      # Auto-compile + restart Homebridge on changes
```

**Watch Mode**: [nodemon.json](nodemon.json) runs `homebridge -U ./test/hbConfig -D`:
- Uses test config from `./test/hbConfig/` (not `~/.homebridge`)
- Debug mode (`-D`) for verbose logging
- **IMPORTANT**: Update `test/hbConfig/config.json` with real TP-Link credentials before testing

### Code Style
[eslint.config.js](eslint.config.js) enforces:
- Single quotes, 2-space indent, Unix line endings
- 160 char max line length
- Always use curly braces, trailing commas in multiline
- Arrow functions preferred, no explicit `any` types

## Critical Patterns

### ES Module Import/Export
**Always use `.js` extension in TypeScript imports** (even for `.ts` files):
```typescript
import { DecoHomebridgePlatform } from './platform.js';  // ✓ Correct
import { DecoHomebridgePlatform } from './platform';     // ✗ Wrong
```
Required by `"module": "nodenext"` and `"moduleResolution": "nodenext"` in tsconfig.json.

### TP-Link API Authentication Pattern
```typescript
// API client maintains token and auto-refreshes
const api = new DecoAPI({ username, password, log });
await api.authenticate();  // Gets token, valid for 1 hour

// All subsequent calls check token validity automatically
const status = await api.getNetworkStatus();  // Will re-auth if needed
```

### Accessory Lifecycle
1. **Discovery**: Generate UUID from stable ID: `this.api.hap.uuid.generate('deco-network-status')`
2. **Cache Check**: Check `this.accessories` Map (populated by `configureAccessory()`)
3. **Create or Restore**:
   - Existing: Instantiate handler with cached accessory, call `updatePlatformAccessories()` if context changed
   - New: Create via `new this.api.platformAccessory()`, register with `api.registerPlatformAccessories()`
4. **Cleanup**: Track discovered UUIDs in `discoveredCacheUUIDs`, unregister missing accessories
5. **Polling**: Platform starts interval timer that calls API and updates all accessories

### Reliable Data Fetching
```typescript
// Use Promise.all for parallel requests
const [devices, clients, guestNetwork] = await Promise.all([
  this.getDeviceList(),
  this.getClientList(),
  this.getGuestNetworkStatus(),
]);

// Wrap API calls in try-catch, return safe defaults on error
try {
  const status = await api.getNetworkStatus();
  this.service.updateCharacteristic(Characteristic.ContactSensorState, state);
} catch (error) {
  this.log.error('Error updating status:', error);
  // Don't throw - just log and continue
}
```

### Type Safety for API Responses
TP-Link API returns `Record<string, unknown>`. Always validate structure:
```typescript
if (response.result && typeof response.result === 'object' && 'token' in response.result) {
  this.token = response.result.token as string;
}
```

## Configuration Options

Users must provide in config.json:
- `username`: TP-Link cloud account email (required)
- `password`: TP-Link cloud account password (required)
- `pollinAsRouter`: Expose as native Router accessory (default true, recommended)
- `exposeNetworkSensor`: Show network status contact sensor (default false)
- `exposeGuestNetwork`: Show guest network switch (default false)
- `exposeDecoUnits`: Show individual Deco unit sensors (default fals default 30)
- `exposeGuestNetwork`: Show guest network switch (default true)
- `exposeDeviceTrackers`: Enable MAC-based device tracking (default false)
- `trackedDevices`: Array of `{name, mac}` objects for presence detection

## Common Tasks

### Adding New Accessory Type
1. Create class in `src/deco*.ts` following existing patterns
2. Import and register in [src/platform.ts](src/platform.ts) `discoverDevices()`
3. Add unique UUID generation: `this.api.hap.uuid.generate('deco-new-feature')`
4. Update [config.schema.json](config.schema.json) if new config needed

### Adding New API Endpoint
1. Add method to [src/decoAPI.ts](src/decoAPI.ts)
2. Use `makeRequest()` with proper method name
3. Validate response structure with type guards
4. Return safe default on error (don't throw in accessory handlers)

### Testing Changes
```bash
# 1. Update test/hbConfig/config.json with credentials
# 2. Build and link
npm run build && npm link
# 3. Run with auto-restart
npm run watch
# 4. Check logs for authentication and discovery
```

## Platform Requirements
- Node.js: ^20.18.0 || ^22.10.0 || ^24.0.0
- Homebridge: ^1.8.0 || ^2.0.0-beta.0
- TP-Link cloud account (no 2FA support yet)
- Internet connection (cloud-based API)
