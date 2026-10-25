package com.aktyres.reader;

import android.content.Context;
import android.content.SharedPreferences;

/** The three settings, kept in the app's private storage (not backed up, not readable by other apps). */
final class Prefs {
    static final String DEFAULT_URL = "https://aktyres.vercel.app/api/incoming";
    // Only apps whose package name contains one of these words are read.
    static final String DEFAULT_APPS = "phonepe,payzapp,wibmo";

    private Prefs() { }

    static SharedPreferences sp(Context c) {
        return c.getApplicationContext().getSharedPreferences("reader", Context.MODE_PRIVATE);
    }

    static String url(Context c) { return sp(c).getString("url", DEFAULT_URL); }
    static String key(Context c) { return sp(c).getString("key", ""); }
    static String apps(Context c) { return sp(c).getString("apps", DEFAULT_APPS); }

    static void save(Context c, String url, String key, String apps) {
        sp(c).edit()
                .putString("url", url.trim())
                .putString("key", key.trim())
                .putString("apps", apps.trim())
                .apply();
    }
}
