package com.example.chat.push;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Push notification settings (prefix "push" in application.properties).
 * The compact constructor normalizes bad/missing values so the app can
 * never fail to start because of a typo in config.
 */
@ConfigurationProperties(prefix = "push")
public record PushProperties(
        boolean enabled,
        String expoApiUrl,
        int expoBatchSize,
        boolean privacyMode,
        int rateLimitPerUserPerMinute
) {

    public PushProperties {
        if (expoApiUrl == null || expoApiUrl.isBlank()) expoApiUrl = "https://exp.host/--/api/v2/push/send";
        if (expoBatchSize <= 0 || expoBatchSize > 100) expoBatchSize = 100;
        if (rateLimitPerUserPerMinute <= 0) rateLimitPerUserPerMinute = 30;
    }
}
