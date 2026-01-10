# homebridge-deco

[![npm version](https://badge.fury.io/js/homebridge-deco.svg)](https://badge.fury.io/js/homebridge-deco)

**Homebridge plugin for TP-Link Deco mesh network system**

This plugin exposes your TP-Link Deco mesh network to Apple HomeKit, allowing you to:
- Monitor internet connectivity status
- Control guest network on/off
- Track individual Deco unit status (online/offline)
- Monitor specific devices on your network (presence detection)

## Features

### Router Accessory (Default)
- **Native HomeKit Router**: Your Deco appears as a proper Router in the Home app
- Shows network status and information
- Clean, native HomeKit integration

### Optional Advanced Features (Off by Default)

#### Network Status Sensor
- Contact sensor showing internet connectivity
- Alternative to the router accessory if you prefer sensor-based monitoring

#### Guest Network Control
- Switch to toggle guest network on/off
- Useful for automations (e.g., turn off guest network at night)

#### Individual Deco Unit Monitoring
- Each mesh unit as a contact sensor (online/offline status)
- Monitor mesh health and get offline notifications

#### Device Presence Tracking
- Track specific devices by MAC address
- Appears as occupancy sensors
- Perfect for "someone is home" automations

## Requirements

- **Node.js**: v20.18.0 or higher (v22.10.0+ or v24.0.0+ recommended)
- **Homebridge**: v1.8.0 or higher (v2.0.0+ supported)
- **TP-Link Account**: Your TP-Link cloud account credentials (same as Deco app)
- **TP-Link Deco**: Tested with Deco PX50, should work with all Deco models

## Installation

### Via Homebridge Config UI X (Recommended)

1. Search for "homebridge-deco" in the Plugins tab
2. Click Install
3. Configure your TP-Link account credentials
4. Restart Homebridge

### Via npm

```bash
npm install -g homebridge-deco
```

## Configuration

### Basic Configuration

Add this to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "name": "TP-Link Deco",
      "platform": "TPLinkDeco",
      "username": "your-tplink-email@example.com",
      "password": "your-tplink-password",
      "pollingInterval": 30
    }
  ]
}
```

This will expose your Deco as a native Router in HomeKit. To enable advanced features:

```json
{
  "platforms": [
    {
      "name": "TP-Link Deco",
      "platform": "TPLinkDeco",
      "username": "your-tplink-email@example.com",
      "password": "your-tplink-password",
      "pollingInterval": 30,
      "exposeGuestNetwork": true,
      "exposeDecoUnits": true
    }
  ]
}
```

### Configuration Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `name` | Yes | - | Name of the platform |
| `platform` | Yes | - | Must be "TPLinkDeco" |
| `username` | Yes | - | Your TP-Link cloud account email |
| `password` | Yes | - | Your TP-Link cloud account password |
| `pollingInterval` | No | 30 | How often to check status (10-300 seconds) |
| `exposeAsRouter` | No | true | Expose as native HomeKit Router (recommended) |
| `exposeNetworkSensor` | No | false | Show network status as contact sensor |
| `exposeGuestNetwork` | No | false | Show guest network control switch |
| `exposeDecoUnits` | No | false | Show individual Deco units as sensors |
| `exposeDeviceTrackers` | No | false | Enable device presence tracking |
| `trackedDevices` | No | [] | List of devices to track (see below) |

### Device Tracking Configuration

To track specific devices on your network (requires `exposeDeviceTrackers: true`):

```json
{
  "platforms": [
    {
      "name": "TP-Link Deco",
      "platform": "TPLinkDeco",
      "username": "your-tplink-email@example.com",
      "password": "your-tplink-password",
      "exposeDeviceTrackers": true,
      "trackedDevices": [
        {
          "name": "John's iPhone",
          "mac": "AA:BB:CC:DD:EE:FF"
        },
        {
          "name": "Jane's iPad",
          "mac": "11:22:33:44:55:66"
        }
      ]
    }
  ]
}
```

**Finding MAC Addresses**: Open the Deco app → Clients → Select device → MAC address is displayed

## Usage Examples

### Automation Ideas

1. **Internet Outage Notifications**
   - Trigger: Network Status contact sensor becomes "Not Detected"
   - Action: Send notification to your phone

2. **Automatic Guest Network Schedule**
   - Trigger: Time-based (e.g., 11 PM)
   - Action: Turn off Guest Network switch

3. **Someone Is Home**
   - Trigger: Device Tracker (phone) shows "Occupied"
   - Action: Turn on lights, adjust thermostat

4. **Mesh Health Monitoring**
   - Trigger: Any Deco unit contact sensor becomes "Not Detected"
   - Action: Send alert notification

## Exposed Accessories

### Default Setup

With default settings, you get:

1. **Deco Router** (Router) - Native HomeKit router accessory
   - Shows network information in the Home app
   - Clean, integrated experience

### Optional Accessories (when enabled)

2. **Network Status** (Contact Sensor) - When `exposeNetworkSensor: true`
   - Detected = Internet is online
   - Not Detected = Internet is offline

3. **Guest Network** (Switch) - When `exposeGuestNetwork: true`
   - On = Guest network enabled
   - Off = Guest network disabled

4. **Deco [Unit Name]** (Contact Sensor) - When `exposeDecoUnits: true`
   - One per mesh unit
   - Detected = Unit is online, Not Detected = Unit is offline

5. **[Device Name]** (Occupancy Sensor) - When `exposeDeviceTrackers: true`
   - Per tracked device in config
   - Occupied = Device is connected, Not Occupied = Device is not connected

## Troubleshooting

### Authentication Failures

**Error**: "Failed to authenticate with TP-Link cloud"

- Verify your email and password are correct
- Make sure you can log into the Deco mobile app
- Check if your TP-Link account requires 2FA (not currently supported)

### No Devices Discovered

**Error**: "Successfully discovered 0 Deco devices"

- Ensure your Deco system is set up and online in the Deco app
- Check that your Homebridge server has internet access
- Try increasing the polling interval to 60+ seconds
- Check Homebridge logs for detailed error messages

### Accessories Not Updating

- Check your polling interval isn't too long
- Restart Homebridge to force a fresh discovery
- Check network connectivity between Homebridge and internet

### Debug Logging

Enable debug mode in Homebridge to see detailed API communication:

```bash
homebridge -D
```

## Technical Details

### API Communication

This plugin uses the TP-Link cloud API (same as the mobile app) to communicate with your Deco network:
- Authenticates using your TP-Link account credentials
- Maintains a session token (refreshed every hour)
- Polls for status updates at your configured interval
- Supports both reading status and controlling settings

### Reliability Features

- **Automatic token refresh**: Handles session expiration transparently
- **Error retry logic**: Recovers from temporary network issues
- **Cached accessory state**: Preserves settings across Homebridge restarts
- **Efficient polling**: Only fetches data at configured intervals

## Known Limitations

- Requires internet connection (uses TP-Link cloud API)
- Cannot control individual Deco unit settings beyond what's exposed
- Guest network control may not work on all Deco models
- 2FA accounts are not currently supported

## Development

### Setup Development Environment

```bash
# Clone the repository
git clone https://github.com/fabianoley/homebridge-deco.git
cd homebridge-deco

# Install dependencies
npm install

# Build the plugin
npm run build

# Link to Homebridge
npm link

# Watch for changes (auto-compile and restart)
npm run watch
```

### Configuration for Development

Edit `test/hbConfig/config.json` with your TP-Link credentials, then run:

```bash
npm run watch
```

## Contributing

Found a bug or want a feature? Please open an issue on GitHub!

## License

Apache-2.0

## Credits

Created by Fabian Oley
