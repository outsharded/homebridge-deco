import type { Logging } from 'homebridge';
import https from 'https';
import type { IncomingMessage } from 'http';

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
  private routerUrl: string = 'https://192.168.68.1';
  private stok: string = '';
  private sysauth: string = '';
  private lastAuthTime: number = 0;
  private readonly authValidityMs = 3600000; // 1 hour

  constructor(config: DecoConfig) {
    this.log = config.log;
    this.username = config.username;
    this.password = config.password;
  }

  /**
   * Authenticate with local Deco router using HTTPS API
   */
  async authenticate(): Promise<boolean> {
    try {
      // Check if we have a valid token already
      if (this.stok && (Date.now() - this.lastAuthTime) < this.authValidityMs) {
        return true;
      }

      this.log.debug('Authenticating with local Deco router at:', this.routerUrl);

      // Deco router only needs password for login
      const loginData = {
        params: { password: this.password },
        operation: 'login',
      };

      const response = await this.makeRequest('login', JSON.stringify(loginData));

      if (response.error_code !== 0) {
        this.log.error('Authentication failed:', response.msg || 'Unknown error');
        return false;
      }

      if (response.result && typeof response.result === 'object' && 'stok' in response.result) {
        this.stok = response.result.stok as string;
        this.lastAuthTime = Date.now();
        this.log.info('Successfully authenticated with local Deco router');
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
   * Get network status from local Deco router
   */
  async getNetworkStatus(): Promise<NetworkStatus> {
    try {
      if (!await this.ensureAuthenticated()) {
        this.log.error('Not authenticated, cannot get network status');
        return { internetOnline: false, guestNetworkEnabled: false, devices: [], clients: [] };
      }

      const wanData = await this.makeRequest(
        'admin/network?form=wan_ipv4',
        JSON.stringify({ operation: 'read' }),
      ) as Record<string, Record<string, unknown>>;

      const clientData = await this.makeRequest(
        'admin/client?form=client_list',
        JSON.stringify({ operation: 'read' }),
      ) as Record<string, unknown>;

      const internetOnline = (wanData?.wan as Record<string, unknown>)?.inet_status === 'online';
      const clientList = (clientData?.client_list as Record<string, unknown>[]) || [];
      const clients = clientList.map((client: Record<string, unknown>) => ({
        mac: typeof client.mac === 'string' ? client.mac : '',
        name: client.name ? Buffer.from(client.name as string, 'base64').toString('utf-8') : '',
        ip: typeof client.ip === 'string' ? client.ip : '',
        online: client.online === true,
        downSpeed: typeof client.down_speed === 'number' ? client.down_speed : 0,
        upSpeed: typeof client.up_speed === 'number' ? client.up_speed : 0,
        connectedNode: client.access_host ? String(client.access_host) : '',
      }));

      return {
        internetOnline,
        guestNetworkEnabled: false,
        devices: [],
        clients,
      };
    } catch (error) {
      this.log.error('Error getting network status:', error);
      return { internetOnline: false, guestNetworkEnabled: false, devices: [], clients: [] };
    }
  }

  /**
   * Get guest network status (placeholder for local API)
   */
  async getGuestNetworkStatus(): Promise<boolean> {
    try {
      if (!await this.ensureAuthenticated()) {
        return false;
      }

      const wlanData = await this.makeRequest(
        'admin/wireless?form=wlan',
        JSON.stringify({ operation: 'read' }),
      ) as Record<string, Record<string, unknown>>;

      // Check if guest network is enabled on 2.4G or 5G bands
      const band2_4 = (wlanData?.band2_4 as Record<string, unknown>) || {};
      const band5_1 = (wlanData?.band5_1 as Record<string, unknown>) || {};
      const guest2g = (band2_4.guest as Record<string, unknown>)?.enable === true;
      const guest5g = (band5_1.guest as Record<string, unknown>)?.enable === true;

      return guest2g || guest5g;
    } catch (error) {
      this.log.debug('Error getting guest network status:', error);
      return false;
    }
  }

  /**
   * Set guest network on/off (placeholder for local API)
   */
  async setGuestNetwork(enabled: boolean): Promise<boolean> {
    try {
      if (!await this.ensureAuthenticated()) {
        return false;
      }

      const params = {
        operation: 'write',
        params: {
          band2_4: { guest: { enable: enabled } },
          band5_1: { guest: { enable: enabled } },
        },
      };

      await this.makeRequest(
        'admin/wireless?form=wlan',
        JSON.stringify(params),
      );

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
      const status = await this.getNetworkStatus();
      const normalizedMac = mac.toLowerCase().replace(/[:-]/g, '');
      return status.clients.some(client => {
        const clientMac = client.mac.toLowerCase().replace(/[:-]/g, '');
        return clientMac === normalizedMac && client.online;
      });
    } catch (error) {
      this.log.error('Error checking device connection:', error);
      return false;
    }
  }

  /**
   * Make HTTPS request to local Deco router
   */
  private async makeRequest(
    path: string,
    body: string,
  ): Promise<Record<string, unknown>> {
    const url = `${this.routerUrl}/cgi-bin/luci/;stok=${this.stok}/${path}`;

    this.log.debug(`API request - URL: ${url}`);

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        rejectUnauthorized: false,
      };

      const req = https.request(options, (res: IncomingMessage) => {
        let data = '';

        // Handle redirects
        if (typeof res.statusCode === 'number' && res.statusCode >= 300 && res.statusCode < 400) {
          const location = res.headers.location;
          this.log.error(`API returned redirect (${res.statusCode}) to: ${location}`);
          reject(new Error(`API redirect to ${location} - authentication may have failed`));
          return;
        }

        if (typeof res.statusCode !== 'number' || res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        res.on('data', (chunk: Buffer) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          } catch (parseError) {
            if (data.trim().startsWith('<!DOCTYPE') || data.trim().startsWith('<html')) {
              this.log.error('API returned HTML instead of JSON. Response preview:', data.substring(0, 300));
              this.log.error('Router may not be accessible or API endpoint is wrong.');
            } else {
              this.log.error('Failed to parse API response as JSON:', data);
            }
            reject(new Error('Invalid JSON response from Deco router'));
          }
        });
      });

      req.on('error', (error: Error) => {
        this.log.error('API request failed:', error);
        reject(error);
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Ensure we have a valid authentication token
   */
  private async ensureAuthenticated(): Promise<boolean> {
    if (!this.stok || (Date.now() - this.lastAuthTime) >= this.authValidityMs) {
      return await this.authenticate();
    }
    return true;
  }
}
