package com.aktyres.reader;

import java.util.Locale;
import java.util.regex.Pattern;

/** Decides which notifications are read at all, and which of those look like "payment received". */
final class Matcher {
    private static final Pattern CREDIT = Pattern.compile(
            "\\b(received|credited|paid you|sent you|collected)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern NOT_A_PAYMENT = Pattern.compile(
            "\\b(settle[a-z]*|refund[a-z]*|fail[a-z]*|declin[a-z]*|debited|withdraw[a-z]*|reversed)\\b",
            Pattern.CASE_INSENSITIVE);

    private Matcher() { }

    /** True when the package name contains one of the comma-separated words, e.g. "phonepe". */
    static boolean appAllowed(String pkg, String words) {
        if (pkg == null || words == null) return false;
        String p = pkg.toLowerCase(Locale.ROOT);
        for (String w : words.split(",")) {
            String word = w.trim().toLowerCase(Locale.ROOT);
            if (!word.isEmpty() && p.contains(word)) return true;
        }
        return false;
    }

    /** Settlements, debits, refunds and failures are never forwarded. */
    static boolean looksLikePaymentReceived(String text) {
        return text != null && CREDIT.matcher(text).find() && !NOT_A_PAYMENT.matcher(text).find();
    }

    /** A short readable name for the website: phonepe, payzapp, or the package name. */
    static String appName(String pkg) {
        String p = pkg == null ? "" : pkg.toLowerCase(Locale.ROOT);
        if (p.contains("phonepe")) return "phonepe";
        if (p.contains("payzapp") || p.contains("wibmo")) return "payzapp";
        return p.length() > 30 ? p.substring(0, 30) : p;
    }
}
