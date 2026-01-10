import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { DecoRouterAccessory } from './decoRouterAccessory.js';
import { DecoNetworkAccessory } from './decoNetworkAccessory.js';
import { DecoDeviceAccessory } from './decoDeviceAccessory.js';
import { DecoGuestNetworkAccessory } from './decoGuestNetworkAccessory.js';
import { DecoDeviceTrackerAccessory } from './decoDeviceTrackerAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { DecoAPI } from './decoAPI.js';

interface DecoDevice {
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  deviceType: string;
  role: string;
  mac: string;
  ip: string;
  status: number;
  ledOn: boolean;
  signalLevel?: number;
}

interface DecoConfig extends PlatformConfig {
  username: string;
  password: string;
  pollingInterval?: number;
  exposeAsRouter?: boolean;
  exposeGuestNetwork?: boolean;
  exposeNetworkSensor?: boolean;
  exposeDecoUnits?: boolean;
  exposeDeviceTrackers?: boolean;
  trackedDevices?: Array<{ name: string; mac: string }>;
}

/**
 * TP-Link Deco Platform
 * Discovers and registers Deco mesh network devices and features as HomeKit accessories
 */
export class DecoHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // Track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];

  // Deco API client
  public readonly api_client: DecoAPI;
  
  // Polling interval
  private pollingInterval: number;
  private pollingTimer?: NodeJS.Timeout;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    const decoConfig = config as DecoConfig;

    // Validate required config
    if (!decoConfig.username || !decoConfig.password) {
      this.log.error('TP-Link account credentials are required in config.json');
      this.log.error('Please add "username" and "password" to your platform configuration');
      throw new Error('Missing required configuration');
    }

    // Initialize API client
    this.api_client = new DecoAPI({
      username: decoConfig.username,
      password: decoConfig.password,
      log: this.log,
    });

    // Set polling interval (default 30 seconds)
    this.pollingInterval = (decoConfig.pollingInterval || 30) * 1000;

    this.log.debug('Finished initializing platform:', this.config.name);

    // Wait for Homebridge to finish loading cached accessories
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      this.discoverDevices();
    });

    // Cleanup on shutdown
    this.api.on('shutdown', () => {
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
      }
    });
  }

  /**
   * Restore cached accessories from disk at startup
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  /**
   * Discover and register Deco devices and network features
   */
  async discoverDevices() {
    try {
      this.log.info('Discovering TP-Link Deco devices...');

      // Authenticate with TP-Link cloud
      const authenticated = await this.api_client.authenticate();
      if (!authenticated) {
        this.log.error('Failed to authenticate with TP-Link cloud. Please check your credentials.');
        return;
      }

      // Get network status
      const status = await this.api_client.getNetworkStatus();
      const decoConfig = this.config as DecoConfig;

      // 1. Expose as Router accessory (default, native HomeKit router type)
      if (decoConfig.exposeAsRouter !== false) {
        this.registerRouterAccessory();
      }

      // 2. Create network status sensor (optional, off by default)
      if (decoConfig.exposeNetworkSensor === true) {
        this.registerNetworkAccessory();
      }

      // 3. Create guest network control (optional, off by default)
      if (decoConfig.exposeGuestNetwork === true) {
        this.registerGuestNetworkAccessory();
      }

      // 4. Register each Deco mesh unit as a separate accessory (optional, off by default)
      if (decoConfig.exposeDecoUnits === true) {
        for (const device of status.devices) {
          this.registerDecoDevice(device);
        }
      }

      // 5. Register device trackers for specific MAC addresses (optional, off by default)
      if (decoConfig.exposeDeviceTrackers === true && decoConfig.trackedDevices) {
        for (const trackedDevice of decoConfig.trackedDevices) {
          if (trackedDevice.name && trackedDevice.mac) {
            this.registerDeviceTracker(trackedDevice);
          }
        }
      }

      // Remove accessories that are no longer present
      this.cleanupAccessories();

      // Start polling for status updates
      this.startPolling();

      this.log.info(`Successfully discovered ${status.devices.length} Deco devices`);
    } catch (error) {
      this.log.error('Error discovering devices:', error);
    }
  }

  /**
   * Register main router accessory (native HomeKit router type)
   */
  private registerRouterAccessory() {
    const uuid = this.api.hap.uuid.generate('deco-router-main');
    const existingAccessory = this.accessories.get(uuid);

    if (existingAccessory) {
      this.log.info('Restoring Router accessory from cache');
      new DecoRouterAccessory(this, existingAccessory);
    } else {
      this.log.info('Adding Router accessory');
      const accessory = new this.api.platformAccessory('Deco Router', uuid);
      accessory.context.device = { type: 'router', id: 'router-main' };
      new DecoRouterAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    this.discoveredCacheUUIDs.push(uuid);
  }

  /**
   * Register main network status accessory
   */
  private registerNetworkAccessory() {
    const uuid = this.api.hap.uuid.generate('deco-network-status');
    const existingAccessory = this.accessories.get(uuid);

    if (existingAccessory) {
      this.log.info('Restoring Network Status accessory from cache');
      new DecoNetworkAccessory(this, existingAccessory);
    } else {
      this.log.info('Adding Network Status accessory');
      const accessory = new this.api.platformAccessory('Network Status', uuid);
      accessory.context.device = { type: 'network', id: 'network-status' };
      new DecoNetworkAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    this.discoveredCacheUUIDs.push(uuid);
  }

  /**
   * Register guest network control accessory
   */
  private registerGuestNetworkAccessory() {
    const uuid = this.api.hap.uuid.generate('deco-guest-network');
    const existingAccessory = this.accessories.get(uuid);

    if (existingAccessory) {
      this.log.info('Restoring Guest Network accessory from cache');
      new DecoGuestNetworkAccessory(this, existingAccessory);
    } else {
      this.log.info('Adding Guest Network accessory');
      const accessory = new this.api.platformAccessory('Guest Network', uuid);
      accessory.context.device = { type: 'guest-network', id: 'guest-network' };
      new DecoGuestNetworkAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    this.discoveredCacheUUIDs.push(uuid);
  }

  /**
   * Register individual Deco mesh device
   */
  private registerDecoDevice(device: DecoDevice) {
    const uuid = this.api.hap.uuid.generate(`deco-device-${device.deviceId}`);
    const existingAccessory = this.accessories.get(uuid);

    if (existingAccessory) {
      this.log.info('Restoring Deco device from cache:', device.deviceName);
      existingAccessory.context.device = device;
      this.api.updatePlatformAccessories([existingAccessory]);
      new DecoDeviceAccessory(this, existingAccessory);
    } else {
      this.log.info('Adding new Deco device:', device.deviceName);
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);
      accessory.context.device = device;
      new DecoDeviceAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    this.discoveredCacheUUIDs.push(uuid);
  }

  /**
   * Register device tracker (occupancy sensor for specific MAC)
   */
  private registerDeviceTracker(trackedDevice: { name: string; mac: string }) {
    const uuid = this.api.hap.uuid.generate(`deco-tracker-${trackedDevice.mac}`);
    const existingAccessory = this.accessories.get(uuid);

    if (existingAccessory) {
      this.log.info('Restoring device tracker from cache:', trackedDevice.name);
      existingAccessory.context.device = trackedDevice;
      this.api.updatePlatformAccessories([existingAccessory]);
      new DecoDeviceTrackerAccessory(this, existingAccessory);
    } else {
      this.log.info('Adding device tracker:', trackedDevice.name);
      const accessory = new this.api.platformAccessory(trackedDevice.name, uuid);
      accessory.context.device = trackedDevice;
      new DecoDeviceTrackerAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    this.discoveredCacheUUIDs.push(uuid);
  }

  /**
   * Remove accessories that are no longer present
   */
  private cleanupAccessories() {
    for (const [uuid, accessory] of this.accessories) {
      if (!this.discoveredCacheUUIDs.includes(uuid)) {
        this.log.info('Removing accessory from cache:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  /**
   * Start polling for status updates
   */
  private startPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }

    this.log.info(`Starting status polling every ${this.pollingInterval / 1000} seconds`);

    this.pollingTimer = setInterval(async () => {
      try {
        this.log.debug('Polling for status updates...');
        const status = await this.api_client.getNetworkStatus();
        
        // Update all accessories
        for (const accessory of this.accessories.values()) {
          const context = accessory.context.device;
          
          if (context.type === 'network') {
            // Network status will be updated by its own handler
          } else if (context.type === 'guest-network') {
            // Guest network will be updated by its own handler
          } else if (context.deviceId) {
            // Update Deco device status
            const updatedDevice = status.devices.find(d => d.deviceId === context.deviceId);
            if (updatedDevice) {
              accessory.context.device = updatedDevice;
            }
          }
        }
      } catch (error) {
        this.log.error('Error during status polling:', error);
      }
    }, this.pollingInterval);
  }
}
