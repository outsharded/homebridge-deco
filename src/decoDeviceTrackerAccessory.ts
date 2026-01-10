import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { DecoHomebridgePlatform } from './platform.js';

/**
 * Device Tracker Accessory
 * Tracks specific devices by MAC address and reports as Occupancy Sensor
 */
export class DecoDeviceTrackerAccessory {
  private service: Service;
  private device: { name: string; mac: string };
  private isConnected = false;

  constructor(
    private readonly platform: DecoHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.device = accessory.context.device;

    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Device Tracker')
      .setCharacteristic(this.platform.Characteristic.Model, 'Network Device')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.mac);

    // Use Occupancy Sensor to indicate if device is connected
    this.service = this.accessory.getService(this.platform.Service.OccupancySensor) ||
      this.accessory.addService(this.platform.Service.OccupancySensor);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.device.name);

    // Register handlers
    this.service.getCharacteristic(this.platform.Characteristic.OccupancyDetected)
      .onGet(this.getOccupancyDetected.bind(this));

    // Update status
    this.updateStatus();
  }

  /**
   * Check if device is connected
   */
  async getOccupancyDetected(): Promise<CharacteristicValue> {
    try {
      const isConnected = await this.platform.api_client.isDeviceConnected(this.device.mac);
      this.isConnected = isConnected;
      
      // OCCUPANCY_DETECTED (1) = connected, OCCUPANCY_NOT_DETECTED (0) = not connected
      return isConnected ?
        this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED :
        this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
    } catch (error) {
      this.platform.log.error('Error checking device connection:', error);
      return this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
    }
  }

  /**
   * Update device connection status
   */
  private async updateStatus() {
    try {
      const isConnected = await this.platform.api_client.isDeviceConnected(this.device.mac);
      this.isConnected = isConnected;
      
      const state = isConnected ?
        this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED :
        this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
        
      this.service.updateCharacteristic(this.platform.Characteristic.OccupancyDetected, state);
      
      this.platform.log.debug(`Device ${this.device.name} (${this.device.mac}):`, isConnected ? 'Connected' : 'Not connected');
    } catch (error) {
      this.platform.log.error('Error updating device connection status:', error);
    }
  }
}
