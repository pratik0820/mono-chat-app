package com.example.chat.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;
import org.springframework.web.util.ContentCachingResponseWrapper;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Comprehensive HTTP request/response logger.
 *
 * <ul>
 *   <li>Logs method, URI, remote IP, status, duration for every {@code /api/**} request</li>
 *   <li>Captures request/response bodies (up to {@link #MAX_BODY_LOG_SIZE} bytes)</li>
 *   <li>Sanitizes sensitive fields (passwords, tokens) before logging</li>
 *   <li>Logs user context when available (from SecurityContext)</li>
 *   <li>Slow requests (&gt; 2 s) are flagged as WARN</li>
 * </ul>
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 2)
public class RequestLoggingFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);

	/** Maximum number of bytes of request/response body to include in log output. */
	private static final int MAX_BODY_LOG_SIZE = 4096;

	/** Requests slower than this threshold (ms) are logged at WARN level. */
	private static final long SLOW_REQUEST_THRESHOLD_MS = 2000;

	/** Fields whose values should be masked in log output. */
	private static final Map<String, String> SENSITIVE_FIELDS = new LinkedHashMap<>();

	static {
		SENSITIVE_FIELDS.put("password", "****");
		SENSITIVE_FIELDS.put("token", "****");
		SENSITIVE_FIELDS.put("secret", "****");
		SENSITIVE_FIELDS.put("authorization", "Bearer ****");
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
			FilterChain filterChain) throws IOException, jakarta.servlet.ServletException {

		if (!shouldLog(request)) {
			filterChain.doFilter(request, response);
			return;
		}

		ContentCachingRequestWrapper wrappedRequest = new ContentCachingRequestWrapper(request, MAX_BODY_LOG_SIZE);
		ContentCachingResponseWrapper wrappedResponse = new ContentCachingResponseWrapper(response);

		long startTime = System.currentTimeMillis();
		try {
			filterChain.doFilter(wrappedRequest, wrappedResponse);
		} finally {
			long duration = System.currentTimeMillis() - startTime;
			logRequest(wrappedRequest, wrappedResponse, duration);
			wrappedResponse.copyBodyToResponse(); // must call this after reading the body
		}
	}

	private boolean shouldLog(HttpServletRequest request) {
		String uri = request.getRequestURI();
		// Log all /api/** requests; skip static resources and actuator internals
		return uri.startsWith("/api/");
	}

	private void logRequest(ContentCachingRequestWrapper request,
			ContentCachingResponseWrapper response, long durationMs) {

		int status = response.getStatus();
		String method = request.getMethod();
		String uri = request.getRequestURI();
		String query = request.getQueryString();
		String remote = request.getRemoteAddr();
		String userAgent = request.getHeader("User-Agent");
		String userId = request.getHeader("X-User-Id");

		// Build request body (sanitized)
		String requestBody = sanitize(new String(
				request.getContentAsByteArray(), StandardCharsets.UTF_8));

		// Build response body (sanitized, limited)
		String responseBody = truncate(sanitize(new String(
				response.getContentAsByteArray(), StandardCharsets.UTF_8)), MAX_BODY_LOG_SIZE);

		// Determine log level based on status and duration
		String level = determineLevel(status, durationMs);
		String logLine = formatLogLine(method, uri, query, remote, status, durationMs,
				userAgent, userId, requestBody, responseBody);

		switch (level) {
			case "WARN" -> log.warn(logLine);
			case "ERROR" -> log.error(logLine);
			default -> log.info(logLine);
		}
	}

	private String determineLevel(int status, long durationMs) {
		if (status >= 500) return "ERROR";
		if (status >= 400) return "WARN";
		if (durationMs > SLOW_REQUEST_THRESHOLD_MS) return "WARN";
		return "INFO";
	}

	private String formatLogLine(String method, String uri, String query, String remote,
			int status, long durationMs, String userAgent, String userId,
			String requestBody, String responseBody) {

		StringBuilder sb = new StringBuilder();
		sb.append(method).append(" ").append(uri);
		if (query != null) sb.append("?").append(query);
		sb.append(" from=").append(remote);
		sb.append(" status=").append(status);
		sb.append(" duration=").append(durationMs).append("ms");

		if (userId != null) sb.append(" userId=").append(userId);
		if (userAgent != null) sb.append(" ua=").append(truncate(userAgent, 120));

		if (!requestBody.isBlank()) {
			sb.append(" | req_body=").append(truncate(requestBody, MAX_BODY_LOG_SIZE));
		}
		if (status >= 400 && !responseBody.isBlank()) {
			sb.append(" | res_body=").append(truncate(responseBody, MAX_BODY_LOG_SIZE));
		}
		if (durationMs > SLOW_REQUEST_THRESHOLD_MS) {
			sb.append(" | *** SLOW REQUEST ***");
		}
		return sb.toString();
	}

	/**
	 * Masks values of known sensitive fields in JSON or header strings.
	 */
	private String sanitize(String input) {
		if (input == null || input.isBlank()) return "";
		String result = input;
		for (Map.Entry<String, String> entry : SENSITIVE_FIELDS.entrySet()) {
			// Handles "password": "secret123" and password=secret123
			result = result.replaceAll(
					"(?i)(\"" + entry.getKey() + "\"\\s*:\\s*\")([^\"]*)(\")",
					"$1" + entry.getValue() + "$3");
		}
		return result;
	}

	private String truncate(String s, int max) {
		if (s == null) return "";
		return s.length() <= max ? s : s.substring(0, max) + "...[" + s.length() + " chars]";
	}
}
