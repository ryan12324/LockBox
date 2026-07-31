package dev.lockbox.app.foldable

import androidx.core.content.ContextCompat
import androidx.core.util.Consumer
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Exposes current Jetpack WindowManager fold and hinge geometry to the WebView.
 * Layout data contains no vault information and never leaves this process.
 */
@CapacitorPlugin(name = "FoldableLayout")
class FoldableLayoutPlugin : Plugin() {
    private lateinit var windowInfoTracker: WindowInfoTrackerCallbackAdapter
    private var latestLayout = emptyLayout()
    private val layoutListener = Consumer<WindowLayoutInfo> { layoutInfo ->
        latestLayout = serialize(layoutInfo)
        notifyListeners("layoutChanged", latestLayout)
    }

    override fun load() {
        windowInfoTracker = WindowInfoTrackerCallbackAdapter(
            WindowInfoTracker.getOrCreate(context)
        )
        windowInfoTracker.addWindowLayoutInfoListener(
            activity,
            ContextCompat.getMainExecutor(context),
            layoutListener
        )
    }

    override fun handleOnDestroy() {
        if (::windowInfoTracker.isInitialized) {
            windowInfoTracker.removeWindowLayoutInfoListener(layoutListener)
        }
        super.handleOnDestroy()
    }

    @PluginMethod
    fun getLayout(call: PluginCall) {
        call.resolve(latestLayout)
    }

    private fun serialize(layoutInfo: WindowLayoutInfo): JSObject {
        val fold = layoutInfo.displayFeatures
            .filterIsInstance<FoldingFeature>()
            .firstOrNull()
            ?: return emptyLayout()
        val bounds = fold.bounds
        return JSObject()
            .put("hasFold", true)
            .put("isSeparating", fold.isSeparating)
            .put(
                "orientation",
                if (fold.orientation == FoldingFeature.Orientation.VERTICAL) "vertical" else "horizontal"
            )
            .put(
                "state",
                if (fold.state == FoldingFeature.State.HALF_OPENED) "half-opened" else "flat"
            )
            .put(
                "occlusion",
                if (fold.occlusionType == FoldingFeature.OcclusionType.FULL) "full" else "none"
            )
            .put(
                "bounds",
                JSObject()
                    .put("left", bounds.left)
                    .put("top", bounds.top)
                    .put("right", bounds.right)
                    .put("bottom", bounds.bottom)
            )
    }

    private fun emptyLayout(): JSObject = JSObject()
        .put("hasFold", false)
        .put("isSeparating", false)
        .put("orientation", "none")
        .put("state", "flat")
        .put("occlusion", "none")
        .put(
            "bounds",
            JSObject()
                .put("left", 0)
                .put("top", 0)
                .put("right", 0)
                .put("bottom", 0)
        )
}
