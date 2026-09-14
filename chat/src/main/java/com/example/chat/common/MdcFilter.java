package com.example.chat.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Generates a unique correlation ID for every request and stores it in
 * SLF4J's MDC so every log statement within that request includes it.
 *
 * The correlation ID is also added as a response header ({@code X-Correlation-Id})
 * so the client can reference it when reporting issues.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class MdcFilter extends OncePerRequestFilter {

	private static final String CORRELATION_ID = "correlationId";
	private static final String HEADER = "X-Correlation-Id";

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
			FilterChain filterChain) throws ServletException, IOException {
		String correlationId = request.getHeader(HEADER);
		if (correlationId == null || correlationId.isBlank()) {
			correlationId = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
		}

		MDC.put(CORRELATION_ID, correlationId);
		MDC.put("clientIp", request.getRemoteAddr());

		response.setHeader(HEADER, correlationId);

		try {
			filterChain.doFilter(request, response);
		} finally {
			MDC.clear();
		}
	}
}
