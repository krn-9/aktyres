package com.aktyres.reader;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Reads notifications, but only from the apps named in the settings (PhonePe, PayZapp). Anything else is
 * only counted by package name. A notification that looks like "payment received" is sent to the website
 * straight away; everything else from those apps is ignored.
 */
public class NotificationReaderService extends NotificationListenerService {
    /** Same notification posted twice within a few seconds (an update) is sent once. */
    private final Map<String, Long> recent = new LinkedHashMap<String, Long>(32, 0.75f, false) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
            return size() > 50;
        }
    };

    @Override
    public void onListenerConnected() {
        EventLog.add(getApplicationContext(), "Reader is on: notification access is working");
        Sender.retry(getApplicationContext());
    }

    @Override
    public void onListenerDisconnected() {
        EventLog.add(getApplicationContext(), "Reader was disconnected by Android, reconnecting");
        requestRebind(new ComponentName(this, NotificationReaderService.class));
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        Context c = getApplicationContext();
        try {
            if (sbn == null) return;
            String pkg = sbn.getPackageName();
            if (pkg == null || pkg.equals(getPackageName())) return;
            if (!Matcher.appAllowed(pkg, Prefs.apps(c))) {
                EventLog.countOther(c, pkg);
                return;
            }
            Notification n = sbn.getNotification();
            if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;

            String text = textOf(n);
            if (!Matcher.looksLikePaymentReceived(text)) {
                EventLog.add(c, "Ignored " + Matcher.appName(pkg) + " notification (not a payment received)");
                return;
            }
            String signature = sbn.getKey() + "|" + text;
            long now = System.currentTimeMillis();
            synchronized (recent) {
                Long before = recent.get(signature);
                if (before != null && now - before < 10_000) return;
                recent.put(signature, now);
            }
            EventLog.add(c, "Payment notification from " + Matcher.appName(pkg) + ": \"" + shorten(text, 70) + "\"");
            Sender.submit(c, text, Matcher.appName(pkg), sbn.getPostTime());
        } catch (Exception e) {
            EventLog.add(c, "Error reading a notification: " + e.getClass().getSimpleName());
        }
    }

    private static String textOf(Notification n) {
        Bundle e = n.extras;
        if (e == null) return "";
        StringBuilder sb = new StringBuilder();
        append(sb, e.getCharSequence(Notification.EXTRA_TITLE));
        append(sb, e.getCharSequence(Notification.EXTRA_TEXT));
        append(sb, e.getCharSequence(Notification.EXTRA_BIG_TEXT));
        append(sb, e.getCharSequence(Notification.EXTRA_SUB_TEXT));
        CharSequence[] lines = e.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null) {
            for (CharSequence line : lines) append(sb, line);
        }
        return sb.toString();
    }

    private static void append(StringBuilder sb, CharSequence part) {
        if (part == null) return;
        String s = part.toString().trim();
        if (s.isEmpty() || sb.indexOf(s) >= 0) return;   // the big text often repeats the short text
        if (sb.length() > 0) sb.append(". ");
        sb.append(s);
    }

    private static String shorten(String s, int max) {
        String one = s.replace('\n', ' ');
        return one.length() > max ? one.substring(0, max) + "..." : one;
    }
}
