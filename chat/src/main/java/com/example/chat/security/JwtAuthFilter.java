package com.example.chat.security;

import com.example.chat.user.User;
import com.example.chat.user.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Parses {@code Authorization: Bearer <jwt>} and populates the SecurityContext.
 * Invalid/expired tokens are ignored, leaving the request unauthenticated (→ 401).
 */
public class JwtAuthFilter extends OncePerRequestFilter {

	private final JwtService jwtService;
	private final UserRepository userRepository;

	public JwtAuthFilter(JwtService jwtService, UserRepository userRepository) {
		this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
			FilterChain filterChain) throws ServletException, IOException {
		String header = request.getHeader("Authorization");
		if (header != null && header.startsWith("Bearer ")) {
			String token = header.substring(7);
			try {
				// Check if token has been blacklisted (logged out)
				if (jwtService.isTokenBlacklisted(token)) {
					filterChain.doFilter(request, response);
					return;
				}
				String username = jwtService.parseUsername(token);
				User user = userRepository.findByUsername(username).orElse(null);
				if (user != null) {
					var authentication = new UsernamePasswordAuthenticationToken(user.getId(), null, List.of());
					SecurityContextHolder.getContext().setAuthentication(authentication);
				}
			} catch (Exception ignored) {
				// invalid or expired token — leave the request unauthenticated
			}
		}
		filterChain.doFilter(request, response);
	}
}
