/**
 * QR Scanner Plugin — TypeScript bridge for CameraX + ML Kit barcode scanning.
 *
 * Uses CameraX for camera preview and ML Kit bundled barcode scanning
 * (com.google.mlkit:barcode-scanning) so Google Play Services is NOT required.
 * Supports all common 1D/2D barcode formats; optimized for QR codes
 * containing otpauth:// URIs for TOTP setup.
 */

import { registerPlugin } from '@capacitor/core';

/** Result from a successful QR code scan */
export interface QRScanResult {
  /** Decoded string value (e.g. otpauth://totp/...) */
  value: string;
  /** Barcode format identifier (e.g. "QR_CODE", "DATA_MATRIX") */
  format: string;
}

/** Result from checking camera availability */
export interface QRScannerAvailabilityResult {
  /** Whether the device has a camera and permission is granted */
  available: boolean;
}

/**
 * QRScannerPlugin interface — defines the contract between TypeScript and native Kotlin.
 *
 * Flow:
 * 1. isAvailable() → check camera hardware + permission
 * 2. scanQRCode() → open camera preview, decode barcode, return result
 *
 * The native implementation uses CameraX for the preview lifecycle and
 * ML Kit's bundled barcode detector (no Play Services dependency).
 */
export interface QRScannerPlugin {
  /** Open camera and scan for a QR code. Resolves when a barcode is detected. */
  scanQRCode(): Promise<QRScanResult>;

  /** Check if camera is available and permission is granted */
  isAvailable(): Promise<QRScannerAvailabilityResult>;
}

const QRScanner = registerPlugin<QRScannerPlugin>('QRScanner');

export { QRScanner };
