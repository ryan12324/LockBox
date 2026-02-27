package dev.lockbox.app.qrscanner

import android.Manifest
import android.content.pm.PackageManager
import android.util.Size
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * QRScannerPlugin — Capacitor plugin for CameraX + ML Kit barcode scanning.
 *
 * Uses:
 * - CameraX for camera lifecycle management (no manual surface handling)
 * - ML Kit bundled barcode scanning (com.google.mlkit:barcode-scanning)
 *   so Google Play Services is NOT required
 *
 * Supports QR codes and other 2D/1D barcode formats.
 * Optimized for scanning otpauth:// URIs for TOTP setup.
 */
@CapacitorPlugin(name = "QRScanner")
class QRScannerPlugin : Plugin() {

    private var cameraExecutor: ExecutorService? = null

    /**
     * Check if camera hardware is present and permission is granted.
     */
    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val hasCamera = context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)
        val hasPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED

        val result = JSObject()
        result.put("available", hasCamera && hasPermission)
        call.resolve(result)
    }

    /**
     * Open camera, scan for a barcode, and return the decoded value.
     * Uses CameraX ImageAnalysis with ML Kit's bundled barcode detector.
     * Resolves the promise when the first barcode is successfully decoded.
     */
    @PluginMethod
    fun scanQRCode(call: PluginCall) {
        val fragmentActivity = activity as? FragmentActivity ?: run {
            call.reject("Activity not available")
            return
        }

        // Check camera permission first
        if (ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CAMERA
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            call.reject("Camera permission not granted")
            return
        }

        cameraExecutor = Executors.newSingleThreadExecutor()

        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        cameraProviderFuture.addListener({
            try {
                val cameraProvider = cameraProviderFuture.get()

                // ML Kit bundled barcode scanner — no Play Services needed
                val scanner = BarcodeScanning.getClient()

                val imageAnalysis = ImageAnalysis.Builder()
                    .setTargetResolution(Size(1280, 720))
                    .setBackpressureStrategy(ImageAnalysis.BACKPRESSURE_STRATEGY_KEEP_ONLY_LATEST)
                    .build()

                var scanComplete = false

                imageAnalysis.setAnalyzer(cameraExecutor!!) { imageProxy ->
                    if (scanComplete) {
                        imageProxy.close()
                        return@setAnalyzer
                    }

                    @androidx.camera.core.ExperimentalGetImage
                    val mediaImage = imageProxy.image
                    if (mediaImage != null) {
                        val inputImage = InputImage.fromMediaImage(
                            mediaImage,
                            imageProxy.imageInfo.rotationDegrees
                        )

                        scanner.process(inputImage)
                            .addOnSuccessListener { barcodes ->
                                if (!scanComplete && barcodes.isNotEmpty()) {
                                    val barcode = barcodes.first()
                                    val rawValue = barcode.rawValue

                                    if (rawValue != null) {
                                        scanComplete = true

                                        val format = when (barcode.format) {
                                            Barcode.FORMAT_QR_CODE -> "QR_CODE"
                                            Barcode.FORMAT_DATA_MATRIX -> "DATA_MATRIX"
                                            Barcode.FORMAT_AZTEC -> "AZTEC"
                                            Barcode.FORMAT_PDF417 -> "PDF417"
                                            Barcode.FORMAT_EAN_13 -> "EAN_13"
                                            Barcode.FORMAT_EAN_8 -> "EAN_8"
                                            Barcode.FORMAT_CODE_128 -> "CODE_128"
                                            Barcode.FORMAT_CODE_39 -> "CODE_39"
                                            else -> "UNKNOWN"
                                        }

                                        val result = JSObject()
                                        result.put("value", rawValue)
                                        result.put("format", format)

                                        // Stop camera and clean up
                                        cameraProvider.unbindAll()
                                        cameraExecutor?.shutdown()
                                        scanner.close()

                                        call.resolve(result)
                                    }
                                }
                            }
                            .addOnFailureListener { /* Continue scanning on frame errors */ }
                            .addOnCompleteListener { imageProxy.close() }
                    } else {
                        imageProxy.close()
                    }
                }

                val cameraSelector = CameraSelector.Builder()
                    .requireLensFacing(CameraSelector.LENS_FACING_BACK)
                    .build()

                // Bind only image analysis (no preview surface needed for headless scan)
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    fragmentActivity,
                    cameraSelector,
                    imageAnalysis
                )
            } catch (e: Exception) {
                call.reject("Camera initialization failed: ${e.message}")
            }
        }, ContextCompat.getMainExecutor(context))
    }

    override fun handleOnDestroy() {
        cameraExecutor?.shutdown()
        super.handleOnDestroy()
    }
}
