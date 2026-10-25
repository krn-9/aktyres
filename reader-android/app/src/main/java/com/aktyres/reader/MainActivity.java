package com.aktyres.reader;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/** One screen: the three settings, the switches Android needs, and a live view of what the reader did. */
public class MainActivity extends Activity {
    private TextView status;
    private TextView log;
    private EditText url;
    private EditText key;
    private EditText apps;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        root.setPadding(pad, dp(24), pad, dp(32));
        scroll.addView(root);

        TextView title = text("Payment Reader", 24, true);
        root.addView(title);
        root.addView(text("Reads PhonePe and PayZapp \"payment received\" notifications on this phone and sends them to the shop website so the Day Book shows them as received.", 14, false));

        root.addView(space(16));
        status = text("", 15, false);
        root.addView(status);

        root.addView(space(12));
        root.addView(button("1. Allow notification access", v ->
                startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))));
        root.addView(text("If the switch is greyed out: open \"App info\" below, tap the three dots (top right), choose \"Allow restricted settings\", then try again.", 12, false));
        root.addView(button("App info (for \"Allow restricted settings\")", v -> {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.parse("package:" + getPackageName()));
            startActivity(i);
        }));
        root.addView(button("2. Let it run in the background", v ->
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))));
        root.addView(text("Choose \"All apps\", find Payment Reader and set it to \"Don't optimise\" / \"Unrestricted\".", 12, false));

        root.addView(space(16));
        root.addView(text("Settings", 18, true));
        root.addView(text("Website address (must start with https://)", 12, false));
        url = field(Prefs.url(this), InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        root.addView(url);
        root.addView(text("Secret key (the same one saved as INCOMING_KEY in Vercel)", 12, false));
        key = field(Prefs.key(this), InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(key);
        root.addView(text("Apps to read (words in the app's package name, separated by commas)", 12, false));
        apps = field(Prefs.apps(this), InputType.TYPE_CLASS_TEXT);
        root.addView(apps);
        root.addView(button("Save settings", v -> {
            Prefs.save(this, url.getText().toString(), key.getText().toString(), apps.getText().toString());
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show();
            refresh();
        }));
        root.addView(button("3. Send a test to the website", v -> {
            Prefs.save(this, url.getText().toString(), key.getText().toString(), apps.getText().toString());
            Toast.makeText(this, "Testing...", Toast.LENGTH_SHORT).show();
            Sender.sendTest(this, (message, ok) -> {
                Toast.makeText(this, message, Toast.LENGTH_LONG).show();
                refresh();
            });
        }));

        root.addView(space(16));
        root.addView(text("What the reader has done", 18, true));
        log = text("", 12, false);
        log.setTypeface(Typeface.MONOSPACE);
        log.setTextIsSelectable(true);
        root.addView(log);
        root.addView(button("Refresh", v -> refresh()));
        root.addView(button("Clear this list", v -> {
            EventLog.clear(this);
            refresh();
        }));
        setContentView(scroll);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    private void refresh() {
        String enabled = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        boolean access = enabled != null && enabled.contains(getPackageName());
        boolean hasKey = !Prefs.key(this).isEmpty();
        boolean https = Prefs.url(this).toLowerCase().startsWith("https://");
        int waiting = Sender.waiting(this);
        String s = (access ? "OK  Notification access is ON\n" : "NO  Notification access is OFF (step 1)\n")
                + (hasKey ? "OK  Secret key is saved\n" : "NO  No secret key saved yet\n")
                + (https ? "OK  Website address uses https\n" : "NO  Website address must start with https://\n")
                + (waiting == 0 ? "OK  No payments waiting to be sent" : "..  " + waiting + " payment(s) waiting to be sent (retrying every minute)");
        status.setText(s);
        status.setTextColor(access && hasKey && https ? 0xFF15803D : 0xFFB45309);
        log.setText(EventLog.all(this) + "\n\nNotifications from other apps (not read, counted only):\n" + EventLog.otherApps(this));
    }

    // ---- small view helpers ----
    private TextView text(String s, int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(0xFF262626);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, dp(4), 0, dp(2));
        return t;
    }

    private EditText field(String value, int inputType) {
        EditText e = new EditText(this);
        e.setText(value);
        e.setSingleLine(true);
        e.setInputType(inputType);
        e.setTextSize(14);
        return e;
    }

    private Button button(String label, View.OnClickListener click) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setOnClickListener(click);
        return b;
    }

    private View space(int heightDp) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, dp(heightDp)));
        return v;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
