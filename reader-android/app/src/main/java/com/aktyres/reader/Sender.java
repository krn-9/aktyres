package com.aktyres.reader;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Sends payments to the website over HTTPS. A payment that cannot be sent (no internet, server busy) waits
 * in a small queue on the phone and is retried, so a payment received while offline is not lost.
 * Every payment carries a unique id, so a retry can never be counted twice.
 */
final class Sender {
    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final Object QUEUE_LOCK = new Object();
    private static final int MAX_QUEUE = 100;
    private static final long RETRY_MS = 60_000;
    private static boolean retryScheduled = false;

    private Sender() { }

    interface Done { void result(String message, boolean ok); }

    /** Queue a payment notification and try to send it now. */
    static void submit(Context c, String text, String app, long postedAt) {
        final Context ctx = c.getApplicationContext();
        final String id = UUID.randomUUID().toString();
        EXEC.execute(() -> {
            enqueue(ctx, id, app, text, postedAt);
            flush(ctx);
        });
    }

    /** Try the waiting payments again (called when the service connects and every minute while any wait). */
    static void retry(Context c) {
        final Context ctx = c.getApplicationContext();
        EXEC.execute(() -> flush(ctx));
    }

    /** Sends a harmless message the website ignores, to prove the address and key are right. */
    static void sendTest(Context c, Done done) {
        final Context ctx = c.getApplicationContext();
        EXEC.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("id", UUID.randomUUID().toString());
                body.put("app", "test");
                body.put("text", "Connection test: nothing to settle");
                int code = post(ctx, body);
                boolean ok = code == 200;
                String msg = ok ? "Test OK: the website accepted the key (HTTP 200)."
                        : code == 401 ? "The key was refused (HTTP 401). Check the key."
                        : code == 503 ? "The website says INCOMING_KEY is not set yet (HTTP 503)."
                        : "The website answered HTTP " + code + ".";
                EventLog.add(ctx, msg);
                MAIN.post(() -> done.result(msg, ok));
            } catch (Exception e) {
                String msg = "Test failed: " + describe(e);
                EventLog.add(ctx, msg);
                MAIN.post(() -> done.result(msg, false));
            }
        });
    }

    static int waiting(Context c) {
        synchronized (QUEUE_LOCK) {
            return readQueue(c).length();
        }
    }

    // ---- queue (kept in private storage as JSON) ----

    private static void enqueue(Context c, String id, String app, String text, long postedAt) {
        synchronized (QUEUE_LOCK) {
            try {
                JSONArray queue = readQueue(c);
                JSONObject item = new JSONObject();
                item.put("id", id);
                item.put("app", app);
                item.put("text", text.length() > 500 ? text.substring(0, 500) : text);
                item.put("postedAt", postedAt);
                queue.put(item);
                JSONArray trimmed = new JSONArray();
                for (int i = Math.max(0, queue.length() - MAX_QUEUE); i < queue.length(); i++) trimmed.put(queue.get(i));
                Prefs.sp(c).edit().putString("queue", trimmed.toString()).apply();
            } catch (JSONException ignored) {
                EventLog.add(c, "Could not save a payment to the waiting list");
            }
        }
    }

    private static JSONArray readQueue(Context c) {
        try {
            return new JSONArray(Prefs.sp(c).getString("queue", "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private static void flush(Context c) {
        boolean someLeft = false;
        while (true) {
            JSONObject first;
            synchronized (QUEUE_LOCK) {
                JSONArray queue = readQueue(c);
                if (queue.length() == 0) break;
                first = queue.optJSONObject(0);
                if (first == null) { removeFirst(c); continue; }
            }
            try {
                int code = post(c, first);
                if (code == 200) {
                    EventLog.add(c, "Sent " + first.optString("app") + " payment (HTTP 200)");
                    removeFirst(c);
                } else if (code == 400 || code == 413 || code == 422) {
                    EventLog.add(c, "Website rejected a payment (HTTP " + code + "), dropped");
                    removeFirst(c);
                } else {
                    // 401 wrong key, 503 not set up, 5xx, 429: keep it, the owner can fix the cause
                    EventLog.add(c, "Not sent (HTTP " + code + "), will retry");
                    someLeft = true;
                    break;
                }
            } catch (Exception e) {
                EventLog.add(c, "Not sent (" + describe(e) + "), will retry");
                someLeft = true;
                break;
            }
        }
        if (someLeft) scheduleRetry(c);
    }

    private static void removeFirst(Context c) {
        synchronized (QUEUE_LOCK) {
            JSONArray queue = readQueue(c);
            JSONArray rest = new JSONArray();
            for (int i = 1; i < queue.length(); i++) {
                try { rest.put(queue.get(i)); } catch (JSONException ignored) { }
            }
            Prefs.sp(c).edit().putString("queue", rest.toString()).apply();
        }
    }

    private static void scheduleRetry(Context c) {
        final Context ctx = c.getApplicationContext();
        synchronized (QUEUE_LOCK) {
            if (retryScheduled) return;
            retryScheduled = true;
        }
        MAIN.postDelayed(() -> {
            synchronized (QUEUE_LOCK) { retryScheduled = false; }
            retry(ctx);
        }, RETRY_MS);
    }

    // ---- one HTTPS request ----

    /** Returns the HTTP status code. Only https:// addresses are ever used. */
    private static int post(Context c, JSONObject body) throws Exception {
        String address = Prefs.url(c);
        if (!address.toLowerCase().startsWith("https://")) throw new IllegalStateException("only https:// addresses are allowed");
        String key = Prefs.key(c);
        if (key.isEmpty()) throw new IllegalStateException("no key saved yet");
        HttpURLConnection conn = (HttpURLConnection) new URL(address).openConnection();
        try {
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(15_000);
            conn.setDoOutput(true);
            conn.setInstanceFollowRedirects(false);   // a redirect could send the key somewhere else
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Authorization", "Bearer " + key);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = conn.getOutputStream()) { out.write(bytes); }
            int code = conn.getResponseCode();
            InputStream in = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (in != null) {
                ByteArrayOutputStream sink = new ByteArrayOutputStream();
                byte[] buf = new byte[512];
                int n, total = 0;
                while ((n = in.read(buf)) > 0 && total < 4096) { sink.write(buf, 0, n); total += n; }
                in.close();
            }
            return code;
        } finally {
            conn.disconnect();
        }
    }

    private static String describe(Exception e) {
        String m = e.getMessage();
        return e.getClass().getSimpleName() + (m == null ? "" : ": " + (m.length() > 80 ? m.substring(0, 80) : m));
    }
}
