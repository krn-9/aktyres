package com.aktyres.reader;

import android.content.Context;
import android.content.SharedPreferences;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * A short diary shown on the app's screen, so it is always clear what the app saw and did.
 * It lives only on this phone. Other apps' notifications are never logged, only counted by package name.
 */
final class EventLog {
    private static final int MAX_LINES = 40;
    private static final Object LOCK = new Object();

    private EventLog() { }

    static void add(Context c, String message) {
        synchronized (LOCK) {
            SharedPreferences sp = Prefs.sp(c);
            String stamp = new SimpleDateFormat("dd MMM HH:mm:ss", Locale.getDefault()).format(new Date());
            String old = sp.getString("log", "");
            List<String> lines = new ArrayList<>();
            lines.add(stamp + "  " + message);
            if (!old.isEmpty()) {
                for (String l : old.split("\n")) {
                    if (lines.size() >= MAX_LINES) break;
                    lines.add(l);
                }
            }
            sp.edit().putString("log", join(lines)).apply();
        }
    }

    static String all(Context c) {
        synchronized (LOCK) {
            String log = Prefs.sp(c).getString("log", "");
            return log.isEmpty() ? "Nothing yet." : log;
        }
    }

    static void clear(Context c) {
        synchronized (LOCK) {
            SharedPreferences sp = Prefs.sp(c);
            SharedPreferences.Editor e = sp.edit().remove("log");
            for (String k : sp.getAll().keySet()) {
                if (k.startsWith("seen:")) e.remove(k);
            }
            e.apply();
        }
    }

    /** Count a notification from an app that is not being read (package name only, no text). */
    static void countOther(Context c, String pkg) {
        synchronized (LOCK) {
            SharedPreferences sp = Prefs.sp(c);
            String k = "seen:" + pkg;
            sp.edit().putInt(k, sp.getInt(k, 0) + 1).apply();
        }
    }

    /** "com.whatsapp: 12" lines, busiest first, to help find the right app name for the filter. */
    static String otherApps(Context c) {
        synchronized (LOCK) {
            List<String> rows = new ArrayList<>();
            for (Map.Entry<String, ?> e : Prefs.sp(c).getAll().entrySet()) {
                if (e.getKey().startsWith("seen:") && e.getValue() instanceof Integer) {
                    rows.add(String.format(Locale.ROOT, "%06d|%s: %d", 999999 - (Integer) e.getValue(),
                            e.getKey().substring(5), (Integer) e.getValue()));
                }
            }
            if (rows.isEmpty()) return "None yet.";
            Collections.sort(rows);
            List<String> out = new ArrayList<>();
            for (int i = 0; i < rows.size() && i < 10; i++) out.add(rows.get(i).substring(rows.get(i).indexOf('|') + 1));
            return join(out);
        }
    }

    private static String join(List<String> lines) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < lines.size(); i++) {
            if (i > 0) sb.append('\n');
            sb.append(lines.get(i));
        }
        return sb.toString();
    }
}
