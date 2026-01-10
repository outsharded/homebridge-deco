import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { DecoHomebridgePlatform } from './platform.js';

/**
 * Deco Router Accessory
 * Exposes the main Deco as a Router with network status
 */
export class DecoRouterAccessory {
  private service: Service;
  private informationService: Service;

  constructor(
    private readonly platform: DecoHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // Set accessory information
    this.informationService = this.accessory.getService(this.platform.Service.AccessoryInformation)!;
    this.informationService
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'TP-Link')
      .setCharacteristic(this.platform.Characteristic.Model, 'Deco Mesh System')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'DECO-MAIN');

    // Get or create Router service
    this.service = this.accessory.getService(this.platform.Service.WiFiRouter) ||
      this.accessory.addService(this.platform.Service.WiFiRouter);

    this.service.setCharacteristic(this.platform.Characteristic.Name, 'Deco Network');

    // ConfiguredName - the user can rename this
    this.service.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .onSet(this.setConfiguredName.bind(this))
      .onGet(this.getConfiguredName.bind(this));

    // Initial update
    this.updateStatus();
  }

  /**
   * Handle configured name changes
   */
  async setConfiguredName(value: CharacteristicValue) {
    const name = value as string;
    this.accessory.context.configuredName = name;
    this.platform.log.debug('Router name set to:', name);
  }

  /**
   * Get configured name
   */
  async getConfiguredName(): Promise<CharacteristicValue> {
    return this.accessory.context.configuredName || 'Deco Network';
  }

  /**
   * Update router status
   */
  async updateStatus() {
    try {
      const status = await this.platform.api_client.getNetworkStatus();
      
      // Update accessory information with current network stats
      const onlineDevices = status.devices.filter(d => d.status === 1).length;
      const totalClients = status.clients.filter(c => c.online).length;
      
      this.platform.log.debug(
        `Router status: ${status.internetOnline ? 'Online' : 'Offline'}, ` +
        `${onlineDevices}/${status.devices.length} Deco units online, ` +
        `${totalClients} clients connected`,
      );

      // Store status in context for other accessories to use
      this.accessory.context.networkStatus = status;
      this.accessory.context.lastUpdate = Date.now();
      
    } catch (error) {
      this.platform.log.error('Error updating router status:', error);
    }
  }
}
