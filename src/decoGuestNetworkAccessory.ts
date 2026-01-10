import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { DecoHomebridgePlatform } from './platform.js';

/**
 * Guest Network Accessory
 * Exposes guest network control as a Switch
 */
export class DecoGuestNetworkAccessory {
  private service: Service;
  private guestNetworkEnabled = false;

  constructor(
    private readonly platform: DecoHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'TP-Link')
      .setCharacteristic(this.platform.Characteristic.Model, 'Deco Guest Network')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'GUEST-001');

    // Get or create Switch service
    this.service = this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch);

    this.service.setCharacteristic(this.platform.Characteristic.Name, 'Guest Network');

    // Register handlers
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));

    // Initialize status
    this.updateStatus();
  }

  /**
   * Get guest network on/off state
   */
  async getOn(): Promise<CharacteristicValue> {
    try {
      const enabled = await this.platform.api_client.getGuestNetworkStatus();
      this.guestNetworkEnabled = enabled;
      return enabled;
    } catch (error) {
      this.platform.log.error('Error getting guest network status:', error);
      return false;
    }
  }

  /**
   * Set guest network on/off
   */
  async setOn(value: CharacteristicValue) {
    try {
      const enabled = value as boolean;
      const success = await this.platform.api_client.setGuestNetwork(enabled);
      
      if (success) {
        this.guestNetworkEnabled = enabled;
        this.platform.log.info('Guest network', enabled ? 'enabled' : 'disabled');
      } else {
        this.platform.log.error('Failed to set guest network state');
        throw new Error('Failed to set guest network');
      }
    } catch (error) {
      this.platform.log.error('Error setting guest network:', error);
      throw error;
    }
  }

  /**
   * Update status periodically
   */
  private async updateStatus() {
    try {
      const enabled = await this.platform.api_client.getGuestNetworkStatus();
      this.guestNetworkEnabled = enabled;
      this.service.updateCharacteristic(this.platform.Characteristic.On, enabled);
      this.platform.log.debug('Guest network:', enabled ? 'Enabled' : 'Disabled');
    } catch (error) {
      this.platform.log.error('Error updating guest network status:', error);
    }
  }
}
