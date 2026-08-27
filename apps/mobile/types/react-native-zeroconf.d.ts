/** react-native-zeroconf 无自带类型；仅声明本工程用到的表面。 */
declare module "react-native-zeroconf" {
  export interface ZeroconfService {
    name?: string;
    host?: string;
    port?: number;
    addresses?: string[];
    fullName?: string;
  }
  export class Zeroconf {
    scan(type: string, protocol: string, domain?: string): void;
    stop(): void;
    removeDeviceListeners(): void;
    on(event: string, cb: (payload: never) => void): void;
  }
  export default Zeroconf;
}
