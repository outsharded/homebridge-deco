import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { DecoHomebridgePlatform } from './platform.js';

/**
 * Network Status Accessory
 * Exposes internet connectivity as a Contact Sensor (open = online, closed = offline)
 */
export class DecoNetworkAccessory {
  private service: Service;
  private internetOnline = false;

  constructor(
    private readonly platform: DecoHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'TP-Link')
      .setCharacteristic(this.platform.Characteristic.Model, 'Deco Network')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'NETWORK-001');

    // Get or create Contact Sensor service
    this.service = this.accessory.getService(this.platform.Service.ContactSensor) ||
      this.accessory.addService(this.platform.Service.ContactSensor);

    this.service.setCharacteristic(this.platform.Characteristic.Name, 'Internet Connection');

    // Register handlers
    this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .onGet(this.getContactSensorState.bind(this));

    // Start status updates
    this.updateStatus();
  }

  /**
   * Get contact sensor state (CONTACT_DETECTED = online, CONTACT_NOT_DETECTED = offline)
   */
  async getContactSensorState(): Promise<CharacteristicValue> {
    try {
      const status = await this.platform.api_client.getNetworkStatus();
      this.internetOnline = status.internetOnline;
      
      // CONTACT_DETECTED (0) = online, CONTACT_NOT_DETECTED (1) = offline
      return this.internetOnline ? 
        this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED :
        this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
    } catch (error) {
      this.platform.log.error('Error getting network status:', error);
      return this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
    }
  }

  /**
   * Periodically update status
   */
  private async updateStatus() {
    try {
      const status = await this.platform.api_client.getNetworkStatus();
      this.internetOnline = status.internetOnline;
      
      const state = this.internetOnline ?
        this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED :
        this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
        
      this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState, state);
      
      this.platform.log.debug('Network status:', this.internetOnline ? 'Online' : 'Offline');
    } catch (error) {
      this.platform.log.error('Error updating network status:', error);
    }
  }
}
