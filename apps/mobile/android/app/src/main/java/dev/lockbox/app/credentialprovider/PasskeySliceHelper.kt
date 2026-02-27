package dev.lockbox.app.credentialprovider

import android.app.PendingIntent
import android.app.slice.Slice
import android.content.Context
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import androidx.annotation.RequiresApi
import dev.lockbox.app.R

/**
 * PasskeySliceHelper — Builds Slice objects for the credential picker UI.
 *
 * The Android 14+ credential picker displays Slices to represent available
 * credentials. Each Slice contains a title, subtitle, icon, and PendingIntent.
 */
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
object PasskeySliceHelper {

    private const val SLICE_AUTHORITY = "dev.lockbox.app.credentials"

    /**
     * Build a Slice for a credential entry in the get-credential picker.
     */
    fun buildCredentialSlice(
        context: Context,
        userName: String,
        rpName: String,
        pendingIntent: PendingIntent
    ): Slice {
        val sliceUri = Uri.parse("content://$SLICE_AUTHORITY/get")
        return Slice.Builder(sliceUri, android.app.slice.SliceSpec("type", 1))
            .addAction(
                pendingIntent,
                Slice.Builder(sliceUri, android.app.slice.SliceSpec("type", 1))
                    .addText(userName, null, listOf("title"))
                    .addText(rpName, null, listOf("subtitle"))
                    .addIcon(
                        Icon.createWithResource(context, R.mipmap.ic_launcher),
                        null,
                        listOf("icon")
                    )
                    .build(),
                null
            )
            .build()
    }

    /**
     * Build a Slice for a create entry in the create-credential picker.
     */
    fun buildCreateSlice(
        context: Context,
        accountName: String,
        pendingIntent: PendingIntent
    ): Slice {
        val sliceUri = Uri.parse("content://$SLICE_AUTHORITY/create")
        return Slice.Builder(sliceUri, android.app.slice.SliceSpec("type", 1))
            .addAction(
                pendingIntent,
                Slice.Builder(sliceUri, android.app.slice.SliceSpec("type", 1))
                    .addText(accountName, null, listOf("title"))
                    .addText("Save passkey to Lockbox", null, listOf("subtitle"))
                    .addIcon(
                        Icon.createWithResource(context, R.mipmap.ic_launcher),
                        null,
                        listOf("icon")
                    )
                    .build(),
                null
            )
            .build()
    }
}
