import { create } from 'zustand';
import type { Device, DeviceStatus } from '../types';

interface DevicesState {
  devices: Device[];
  setDevices: (devices: Device[]) => void;
  updateDeviceStatus: (id: number, status: DeviceStatus) => void;
  updateDevice: (updatedDevice: Device) => void;
}

export const useDevicesStore = create<DevicesState>((set) => ({
  devices: [],
  setDevices: (devices: Device[]) => set({ devices }),
  updateDeviceStatus: (id: number, status: DeviceStatus) =>
    set((state) => ({
      devices: state.devices.map((device) =>
        device.id === id ? { ...device, status } : device
      ),
    })),
  updateDevice: (updatedDevice: Device) =>
    set((state) => ({
      devices: state.devices.map((device) =>
        device.id === updatedDevice.id ? updatedDevice : device
      ),
    })),
}));