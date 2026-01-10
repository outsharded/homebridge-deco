import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { DecoHomebridgePlatform } from './platform.js';

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

/**
 * Deco Device Accessory
 * Represents an individual Deco mesh unit with status indicator
 */
export class DecoDeviceAccessory {
  private service: Service;
  private device: DecoDevice;

  constructor(
    private readonly platform: DecoHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.device = accessory.context.device;

    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'TP-Link')
      .setCharacteristic(this.platform.Characteristic.Model, this.device.deviceModel || 'Deco')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.mac || 'Unknown');

    // Use Contact Sensor to indicate if Deco unit is online
    this.service = this.accessory.getService(this.platform.Service.ContactSensor) ||
      this.accessory.addService(this.platform.Service.ContactSensor);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.device.deviceName);

    // Register handlers
    this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .onGet(this.getContactSensorState.bind(this));

    // Update status
    this.updateStatus();
  }

  /**
   * Get device online status
   */
  async getContactSensorState(): Promise<CharacteristicValue> {
    try {
      const status = await this.platform.api_client.getNetworkStatus();
      const device = status.devices.find(d => d.deviceId === this.device.deviceId);
      
      if (device) {
        this.device = device;
        this.accessory.context.device = device;
        
        // CONTACT_DETECTED (0) = online, CONTACT_NOT_DETECTED (1) = offline
        return device.status === 1 ?
          this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED :
          this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
      }
      
      return this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
    } catch (error) {
      this.platform.log.error('Error getting device status:', error);
      return this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
    }
  }

  /**
   * Update device status
   */
  private async updateStatus() {
    try {
      const status = await this.platform.api_client.getNetworkStatus();
      const device = status.devices.find(d => d.deviceId === this.device.deviceId);
      
      if (device) {
        this.device = device;
        this.accessory.context.device = device;
        
        const state = device.status === 1 ?
          this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED :
          this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
          
        this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState, state);
        
        this.platform.log.debug(`Device ${device.deviceName}:`, device.status === 1 ? 'Online' : 'Offline');
      }
    } catch (error) {
      this.platform.log.error('Error updating device status:', error);
    }
  }
}
