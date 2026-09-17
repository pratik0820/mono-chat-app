package com.example.chat.push;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class ExpoPushSender implements PushSender {

    private static final Logger log = LoggerFactory.getLogger(ExpoPushSender.class);

    private static final int MAX_ATTEMPTS = 3;
    private static final long INITIAL_BACKOFF_MS = 500;
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(2);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(5);

    private final RestClient restClient;
    private final PushProperties props;
    private final PushTokenService pushTokenService;

    public ExpoPushSender(PushProperties props, PushTokenService pushTokenService) {
        this.props = props;
        this.pushTokenService = pushTokenService;

        // JDK HttpClient with hard timeouts — the retry backoff below runs on
        // a push-pool thread, so a hung call must be able to fail fast.
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(CONNECT_TIMEOUT)
                .build();

        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(READ_TIMEOUT);

        // Boot 4 note: starter-webmvc does NOT auto-configure a RestClient.Builder
        // bean (that moved to spring-boot-starter-restclient), so we build our own.
        // RestClient.builder() still registers the default Jackson 3 converters.
        this.restClient = RestClient.builder()
                .requestFactory(requestFactory)
                .build();
    }

    @Override
    public void send(List<PushMessage> messages) {

        if (messages.isEmpty()) return;

        List<Map<String, Object>> payload = buildPayload(messages);

        try {
            ExpoPushResponse response = sendWithRetry(payload);
            handleTicketErrors(messages, response);
        } catch (RestClientResponseException e) {
            log.error("Expo push failed after {} attempt(s): {} {}",
                    MAX_ATTEMPTS, e.getStatusCode().value(), e.getMessage());
        } catch (Exception e) {
            // Never throw — a push outage must not affect chat delivery.
            log.error("Expo push request failed: {}", e.getMessage());
        }
    }

    private List<Map<String, Object>> buildPayload(List<PushMessage> messages) {
        List<Map<String, Object>> payload = new ArrayList<>(messages.size());
        for (PushMessage m : messages) {
            Map<String, Object> msg = new HashMap<>();
            msg.put("to", m.to());
            msg.put("sound", "default");
            msg.put("title", m.title());
            msg.put("body", m.body());
            msg.put("channelId", "messages");          // Android notification channel
            msg.put("data", Map.of(
                    "roomId", String.valueOf(m.roomId()),     // FCM data = strings only
                    "messageId", String.valueOf(m.messageId())));
            payload.add(msg);
        }
        return payload;
    }

    /**
     * Retries up to MAX_ATTEMPTS with exponential backoff, but only on
     * 429 (rate limited) and 5xx (server errors) — a 4xx like 400 is a
     * client bug and retrying would just burn time.
     */
    private ExpoPushResponse sendWithRetry(List<Map<String, Object>> payload) {
        long backoffMs = INITIAL_BACKOFF_MS;
        int attempt = 1;
        while (true) {
            try {
                return doSend(payload);
            } catch (RestClientResponseException e) {
                int status = e.getStatusCode().value();
                boolean retryable = status == 429 || e.getStatusCode().is5xxServerError();
                if (!retryable || attempt >= MAX_ATTEMPTS) throw e;
                log.warn("Expo push attempt {}/{} failed ({}), retrying in {} ms",
                        attempt, MAX_ATTEMPTS, status, backoffMs);
                sleepBeforeRetry(backoffMs);
                backoffMs *= 2;
                attempt++;
            }
        }
    }

    private ExpoPushResponse doSend(List<Map<String, Object>> payload) {
        return restClient.post()
                .uri(props.expoApiUrl())
                .header("Accept", "application/json")
                .body(payload)
                .retrieve()
                .body(ExpoPushResponse.class);
    }

    private void sleepBeforeRetry(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Push retry interrupted", ie);
        }
    }

    /** Expo returns one ticket per message, in request order — zip by index. */
    private void handleTicketErrors(List<PushMessage> messages, ExpoPushResponse response) {
        if (response == null || response.data() == null) return;
        for (int i = 0; i < response.data().size() && i < messages.size(); i++) {
            Ticket ticket = response.data().get(i);
            if (!"error".equals(ticket.status())) continue;
            if (ticket.details() != null && "DeviceNotRegistered".equals(ticket.details().error())) {
                pushTokenService.deleteInvalidToken(messages.get(i).to());
            } else {
                log.warn("Expo push ticket error: {} {}", ticket.status(), ticket.message());
            }
        }
    }

    // ── Expo API response shape ─────────────────────────────────────────
    // Records are deserialized by field name, so the "error" component below
    // maps directly onto Expo's {"details":{"error":"DeviceNotRegistered"}} —
    // no Jackson annotations needed (Jackson 3 keeps them optional).

    record ExpoPushResponse(List<Ticket> data) {}

    record Ticket(String status, String id, String message, TicketDetails details) {}

    record TicketDetails(String error) {}

}
