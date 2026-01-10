import type { Logging } from 'homebridge';
import { randomUUID } from 'crypto';

interface DecoConfig {
  username: string;
  password: string;
  log: Logging;
}

interface DecoDevice {
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  deviceType: string;
  role: string;
  mac: string;
  ip: string;
  status: number; // 0 = offline, 1 = online
  ledOn: boolean;
  signalLevel?: number;
}

interface ConnectedClient {
  mac: string;
  name: string;
  ip: string;
  online: boolean;
  downSpeed: number;
  upSpeed: number;
  connectedNode: string;
}

interface NetworkStatus {
  internetOnline: boolean;
  guestNetworkEnabled: boolean;
  devices: DecoDevice[];
  clients: ConnectedClient[];
}

export class DecoAPI {
  private readonly log: Logging;
  private readonly username: string;
  private readonly password: string;
  private token: string | null = null;
  private readonly baseUrl = 'https://use1-wap.tplinkdeco.com';
  private termid: string;
  private lastAuthTime: number = 0;
  private readonly authValidityMs = 3600000; // 1 hour

  constructor(config: DecoConfig) {
    this.log = config.log;
    this.username = config.username;
    this.password = config.password;
    this.termid = randomUUID();
  }

  /**
   * Authenticate with TP-Link cloud service
   */
  async authenticate(): Promise<boolean> {
    try {
      // Check if we have a valid token already
      if (this.token && (Date.now() - this.lastAuthTime) < this.authValidityMs) {
        return true;
      }

      this.log.debug('Authenticating with TP-Link cloud...');

      const params = {
        method: 'login',
        params: {
          appType: 'Deco',
          cloudUserName: this.username,
          cloudPassword: this.password,
          terminalUUID: this.termid,
        },
      };

      const response = await this.makeRequest('/', params, false);

      if (response.error_code !== 0) {
        this.log.error('Authentication failed:', response.msg || 'Unknown error');
        return false;
      }

      if (response.result && typeof response.result === 'object' && 'token' in response.result) {
        this.token = response.result.token as string;
        this.lastAuthTime = Date.now();
        this.log.info('Successfully authenticated with TP-Link cloud');
        return true;
      }

      this.log.error('Invalid authentication response');
      return false;
    } catch (error) {
      this.log.error('Authentication error:', error);
      return false;
    }
  }

  /**
   * Get list of Deco devices in the network
   */
  async getDeviceList(): Promise<DecoDevice[]> {
    try {
      if (!await this.ensureAuthenticated()) {
        return [];
      }

      const params = {
        method: 'getDeviceList',
        params: {},
      };

      const response = await this.makeRequest('/', params);

      if (response.error_code !== 0) {
        this.log.error('Failed to get device list:', response.msg);
        return [];
      }

      if (response.result && typeof response.result === 'object' && 'deviceList' in response.result) {
        const devices: DecoDevice[] = (response.result.deviceList as DecoDevice[]) || [];
        this.log.debug(`Found ${devices.length} Deco devices`);
        return devices;
      }

      return [];
    } catch (error) {
      this.log.error('Error getting device list:', error);
      return [];
    }
  }

  /**
   * Get network status including internet connectivity and guest network
   */
  async getNetworkStatus(): Promise<NetworkStatus> {
    try {
      if (!await this.ensureAuthenticated()) {
        return {
          internetOnline: false,
          guestNetworkEnabled: false,
          devices: [],
          clients: [],
        };
      }

      const [devices, clients, guestNetwork] = await Promise.all([
        this.getDeviceList(),
        this.getClientList(),
        this.getGuestNetworkStatus(),
      ]);

      // Check if any device is online to determine internet status
      const internetOnline = devices.some(d => d.status === 1);

      return {
        internetOnline,
        guestNetworkEnabled: guestNetwork,
        devices,
        clients,
      };
    } catch (error) {
      this.log.error('Error getting network status:', error);
      return {
        internetOnline: false,
        guestNetworkEnabled: false,
        devices: [],
        clients: [],
      };
    }
  }

  /**
   * Get list of connected clients
   */
  async getClientList(): Promise<ConnectedClient[]> {
    try {
      if (!await this.ensureAuthenticated()) {
        return [];
      }

      const params = {
        method: 'getClientList',
        params: {},
      };

      const response = await this.makeRequest('/', params);

      if (response.error_code !== 0) {
        this.log.debug('Failed to get client list:', response.msg);
        return [];
      }

      if (response.result && typeof response.result === 'object' && 'clientList' in response.result) {
        const clients: ConnectedClient[] = (response.result.clientList as ConnectedClient[]) || [];
        this.log.debug(`Found ${clients.length} connected clients`);
        return clients;
      }

      return [];
    } catch (error) {
      this.log.error('Error getting client list:', error);
      return [];
    }
  }

  /**
   * Get guest network status
   */
  async getGuestNetworkStatus(): Promise<boolean> {
    try {
      if (!await this.ensureAuthenticated()) {
        return false;
      }

      const params = {
        method: 'getGuestNetwork',
        params: {},
      };

      const response = await this.makeRequest('/', params);

      if (response.error_code !== 0) {
        this.log.debug('Failed to get guest network status:', response.msg);
        return false;
      }

      if (response.result && typeof response.result === 'object' && 'enabled' in response.result) {
        return response.result.enabled === true;
      }

      return false;
    } catch (error) {
      this.log.debug('Error getting guest network status:', error);
      return false;
    }
  }

  /**
   * Toggle guest network on/off
   */
  async setGuestNetwork(enabled: boolean): Promise<boolean> {
    try {
      if (!await this.ensureAuthenticated()) {
        return false;
      }

      const params = {
        method: 'setGuestNetwork',
        params: {
          enabled,
        },
      };

      const response = await this.makeRequest('/', params);

      if (response.error_code !== 0) {
        this.log.error('Failed to set guest network:', response.msg);
        return false;
      }

      this.log.info(`Guest network ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    } catch (error) {
      this.log.error('Error setting guest network:', error);
      return false;
    }
  }

  /**
   * Check if a specific device (by MAC) is connected
   */
  async isDeviceConnected(mac: string): Promise<boolean> {
    try {
      const clients = await this.getClientList();
      const normalizedMac = mac.toLowerCase().replace(/[:-]/g, '');
      return clients.some(client => {
        const clientMac = client.mac.toLowerCase().replace(/[:-]/g, '');
        return clientMac === normalizedMac && client.online;
      });
    } catch (error) {
      this.log.error('Error checking device connection:', error);
      return false;
    }
  }

  /**
   * Reboot a specific Deco device
   */
  async rebootDevice(deviceId: string): Promise<boolean> {
    try {
      if (!await this.ensureAuthenticated()) {
        return false;
      }

      const params = {
        method: 'reboot',
        params: {
          deviceId,
        },
      };

      const response = await this.makeRequest('/', params);

      if (response.error_code !== 0) {
        this.log.error('Failed to reboot device:', response.msg);
        return false;
      }

      this.log.info(`Rebooted device ${deviceId}`);
      return true;
    } catch (error) {
      this.log.error('Error rebooting device:', error);
      return false;
    }
  }

  /**
   * Make HTTP request to TP-Link API
   */
  private async makeRequest(
    endpoint: string,
    params: Record<string, unknown>,
    requireAuth = true,
  ): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Deco/3.0 (iPhone; iOS 15.0; Scale/3.00)',
    };

    if (requireAuth && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const body = JSON.stringify(params);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      // Try to parse as JSON, but handle HTML error pages gracefully
      try {
        const data = JSON.parse(text);
        return data;
      } catch (parseError) {
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
          this.log.error('API returned HTML instead of JSON. This usually means the endpoint is down, credentials are wrong, or the API has changed.');
        } else {
          this.log.error('Failed to parse API response as JSON:', text);
        }
        throw new Error('Invalid JSON response from TP-Link API');
      }
    } catch (error) {
      this.log.error('API request failed:', error);
      throw error;
    }
  }

  /**
   * Ensure we have a valid authentication token
   */
  private async ensureAuthenticated(): Promise<boolean> {
    if (!this.token || (Date.now() - this.lastAuthTime) >= this.authValidityMs) {
      return await this.authenticate();
    }
    return true;
  }
}
